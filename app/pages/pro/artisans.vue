<script setup lang="ts">
import { BadgeCheck, Check, Handshake, Plus, Search, Star, Wrench } from '@lucide/vue'
import type { ArtisanPartnership, ArtisanProfile, ArtisanRequestSummary } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { canCancel, canReview, interventionPhase, PHASE_LABEL_REQUESTER, PHASE_TONE } from '~/utils/artisanRequests'

definePageMeta({ layout: 'pro' })

/**
 * Artisans : interventions demandées, annuaire par métier, partenariats.
 * Onglet dans l'URL (`?tab=annuaire`) ; `?request=<id>` met une intervention
 * en avant, y compris quand on est déjà sur la page (clic de notification).
 */
const route = useRoute()
const router = useRouter()
const artisanApi = useArtisanRequestsApi()
const refData = useReferenceData()
const modal = useProModal()
const reqTarget = useArtisanReqTarget()
/** `POST /artisan-requests` exige un compte vérifié (403 `KYC_REQUIRED`). */
const { canAct, requireVerified } = useVerification()
const modalTarget = useProModalTarget()
const refresh = useArtisanRequestsRefresh()

type Tab = 'interventions' | 'annuaire' | 'partenariats'
const TABS: { value: Tab; label: string }[] = [
  { value: 'interventions', label: 'Interventions' },
  { value: 'annuaire', label: 'Annuaire' },
  { value: 'partenariats', label: 'Partenariats' }
]
const tab = computed<Tab>(() => (TABS.some(t => t.value === route.query.tab) && !route.query.request ? route.query.tab as Tab : 'interventions'))
function setTab(v: string) {
  const { tab: _, request: __, ...rest } = route.query
  router.replace({ query: v === 'interventions' ? rest : { ...rest, tab: v } })
  flash.value = ''
  actionError.value = null
  confirming.value = null
}

const flash = ref('')
/** Erreur d'action, affichée sous la carte concernée. */
const actionError = ref<{ id: string; message: string } | null>(null)
function failure(id: string, e: unknown, fallback: string) {
  actionError.value = { id, message: e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback }
}
/** Un seul panneau de confirmation ouvert à la fois. */
const confirming = ref<string | null>(null)
const busyId = ref<string | null>(null)

/* ---- Référentiel des métiers ---- */
const trades = ref<RefEntry[]>([])
const tradesState = ref<'loading' | 'error' | 'ready'>('loading')
async function loadTrades() {
  tradesState.value = 'loading'
  try {
    trades.value = await refData.fetchRef('ARTISAN_TRADE')
    tradesState.value = 'ready'
  } catch {
    trades.value = []
    tradesState.value = 'error'
  }
}
onMounted(loadTrades)
function tradeLabel(id?: string) {
  return trades.value.find(t => t.id === id)?.labels.fr ?? 'Intervention'
}

function openRequest() {
  if (!requireVerified('demander une intervention')) return
  reqTarget.value = null
  modal.value = 'artisanReq'
}

/* ---- Interventions (mes demandes) ---- */
const block = useFetchBlock(() => artisanApi.listMine())
onMounted(block.load)
watch(refresh, block.load)
// Interventions (artisan_request_id) et partenariats (partnership_id) réunis dans cette page.
onMounted(() => useLandlordNotificationBadge(['artisan_request_id', 'partnership_id']).markAllSeen())

const requests = computed(() => block.items.value.filter(x => !x.public_posting_id))
/** Candidatures retenues sur un poste : leur suite (paiement, garantie, litige). */
const retainedCandidates = computed(() => block.items.value.filter(x => x.public_posting_id && x.status !== 'open' && x.status !== 'agreed' && x.status !== 'cancelled'))
function statusLabel(r: ArtisanRequestSummary) {
  return PHASE_LABEL_REQUESTER[interventionPhase(r)]
}
function statusTone(r: ArtisanRequestSummary) {
  return PHASE_TONE[interventionPhase(r)]
}
/** Poste public (`target_artisan_id` nul) et candidatures qui s'y rattachent. */
function postingCandidates(r: ArtisanRequestSummary) {
  return block.items.value.filter(x => x.public_posting_id === r.id)
}

const highlight = computed(() => (typeof route.query.request === 'string' ? route.query.request : null))
const expandedId = ref<string | null>(null)
function focusRequest() {
  const id = highlight.value
  if (!id || !block.items.value.some(i => i.id === id)) return
  expandedId.value = id
  nextTick(() => document.getElementById(`request-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}
watch([highlight, () => block.items.value], focusRequest)

/** `first_name`/`last_name` peuvent être `null` — l'inscription ne les persiste pas toujours (voir I1). */
function targetArtisanName(r: ArtisanRequestSummary) {
  const name = [r.target_artisan?.first_name, r.target_artisan?.last_name].filter(Boolean).join(' ')
  return name || 'un artisan'
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toggleExpand(r: ArtisanRequestSummary) {
  expandedId.value = expandedId.value === r.id ? null : r.id
  actionError.value = null
}
function cancelMessage(r: ArtisanRequestSummary) {
  if (r.target_artisan_id) return `Annuler la demande envoyée à ${targetArtisanName(r)} ? Elle est close : il ne pourra plus y répondre.`
  const n = postingCandidates(r).filter(c => c.status === 'open').length
  return `Annuler ce poste ? Il est clos : plus aucun artisan ne pourra y candidater${n ? ` (${n} candidature${n > 1 ? 's' : ''} en cours)` : ''}.`
}
async function doCancel(r: ArtisanRequestSummary) {
  busyId.value = r.id
  actionError.value = null
  try {
    await artisanApi.cancel(r.id)
    confirming.value = null
    flash.value = r.target_artisan_id ? `Demande à ${targetArtisanName(r)} annulée.` : 'Poste annulé.'
    await block.load()
  } catch (e) {
    failure(r.id, e, "L'annulation a échoué.")
  } finally {
    busyId.value = null
  }
}

function openPayModal(r: ArtisanRequestSummary) {
  modalTarget.value = r.id
  modal.value = 'payerIntervention'
}

/* ---- Avis (une fois l'intervention clôturée) ---- */
const reviewingId = ref<string | null>(null)
/** Avis déjà laissés pendant la session (l'API ne dit pas lesquels existent ; un doublon renvoie 400). */
const reviewed = ref<Record<string, boolean>>({})
const reviewRating = ref(5)
const reviewComment = ref('')
async function submitReview(r: ArtisanRequestSummary) {
  busyId.value = r.id
  actionError.value = null
  try {
    await artisanApi.review(r.id, reviewRating.value, reviewComment.value.trim() || undefined)
    reviewed.value = { ...reviewed.value, [r.id]: true }
    reviewingId.value = null
    reviewComment.value = ''
    reviewRating.value = 5
    flash.value = `Avis publié sur le profil de ${targetArtisanName(r)}.`
  } catch (e) {
    if (e instanceof ApiRequestError && /déjà laissé un avis/.test(e.mapped.bannerMessage ?? '')) {
      reviewed.value = { ...reviewed.value, [r.id]: true }
      reviewingId.value = null
    }
    failure(r.id, e, "L'avis n'a pas pu être envoyé.")
  } finally {
    busyId.value = null
  }
}

/* ---- Annuaire (recherche par métier, GET /artisans exige `trade`) ---- */
const dirTradeId = ref('')
const dirBlock = useFetchBlock(() => artisanApi.searchArtisans(dirTradeId.value).then(r => r.data))
watch(trades, ts => { if (ts.length && !dirTradeId.value) dirTradeId.value = ts[0]!.id }, { immediate: true })
watch(dirTradeId, id => { if (id) dirBlock.load() })

function artisanName(a: { first_name?: string | null; last_name?: string | null }) {
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Artisan'
}

/** Depuis une fiche : la modale arrive sur ce métier, l'artisan déjà choisi. */
function requestFrom(a: ArtisanProfile) {
  if (!requireVerified('demander une intervention')) return
  reqTarget.value = { profile: a, tradeId: dirTradeId.value }
  modal.value = 'artisanReq'
}

/* ---- Partenariats ---- */
const partBlock = useFetchBlock(() => artisanApi.myPartnerships())
const partLoaded = ref(false)
watch(tab, t => {
  if (t !== 'interventions' && !partLoaded.value) { partLoaded.value = true; partBlock.load() }
}, { immediate: true })

const PART_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'neutral' | 'danger' }> = {
  pending: { label: 'Invitation envoyée', tone: 'warn' },
  active: { label: 'Partenaire', tone: 'ok' },
  ended: { label: 'Terminé', tone: 'neutral' },
  rejected: { label: 'Refusé', tone: 'neutral' }
}
function partnershipArtisanName(p: ArtisanPartnership) {
  return p.artisan ? artisanName(p.artisan) : 'Artisan'
}
/** Partenariat en cours (actif ou invitation) avec cet artisan. */
function partnershipWith(artisanId: string) {
  return partBlock.items.value.find(p => p.artisan_id === artisanId && (p.status === 'active' || p.status === 'pending')) ?? null
}
const partSorted = computed(() => [...partBlock.items.value].sort((a, b) => ['active', 'pending', 'ended', 'rejected'].indexOf(a.status) - ['active', 'pending', 'ended', 'rejected'].indexOf(b.status)))

async function endPartnership(p: ArtisanPartnership) {
  busyId.value = p.id
  actionError.value = null
  try {
    await artisanApi.endPartnership(p.id)
    confirming.value = null
    flash.value = p.status === 'pending' ? `Invitation de ${partnershipArtisanName(p)} annulée.` : `Partenariat avec ${partnershipArtisanName(p)} terminé.`
    await partBlock.load()
  } catch (e) {
    failure(p.id, e, "Le partenariat n'a pas pu être arrêté.")
  } finally {
    busyId.value = null
  }
}

async function invite(a: ArtisanProfile) {
  busyId.value = a.user_id
  actionError.value = null
  try {
    await artisanApi.createPartnership(a.user_id)
    flash.value = `Invitation de partenariat envoyée à ${artisanName(a)} : il l'accepte ou la refuse depuis son espace.`
    await partBlock.load()
  } catch (e) {
    failure(a.user_id, e, "L'invitation n'a pas pu être envoyée.")
  } finally {
    busyId.value = null
  }
}

/* Recherche d'un partenaire depuis l'onglet Partenariats */
const inviting = ref(false)
const inviteTradeId = ref('')
const inviteBlock = useFetchBlock(() => artisanApi.searchArtisans(inviteTradeId.value).then(r => r.data))
watch(inviteTradeId, id => { if (id) inviteBlock.load() })
function toggleInvite() {
  inviting.value = !inviting.value
  inviteTradeId.value = ''
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 flex flex-wrap items-center justify-between gap-3">
      <div class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap">
        <FormsSegmentedControl :options="TABS" :model-value="tab" size="sm" @update:model-value="setTab" />
      </div>
      <CoreButton @click="openRequest">
        <span class="inline-flex items-center gap-1.5"><CoreLockIcon v-if="!canAct" /><Plus v-else class="h-4 w-4" :stroke-width="2" />Demander une intervention</span>
      </CoreButton>
    </div>

    <p v-if="flash" class="mb-4.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>

    <!-- ===== Interventions ===== -->
    <template v-if="tab === 'interventions'">
      <div v-if="block.state.value === 'loading' || block.state.value === 'idle'" class="flex flex-col gap-4.5">
        <DataSkeletonCard v-for="i in 2" :key="i" :height="120" :lines="1" />
      </div>
      <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
        Impossible de charger vos demandes pour le moment.
        <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
      </FeedbackAlertBanner>
      <div v-else-if="block.state.value === 'empty'" class="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
        <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Wrench class="h-5 w-5" :stroke-width="1.9" /></span>
        <p class="mb-0 mt-3 max-w-[400px] text-[13.5px] text-[var(--text-muted)]">Aucune demande d'intervention pour l'instant. Choisissez un artisan dans l'annuaire, ou publiez un poste ouvert aux artisans du métier.</p>
        <CoreButton size="sm" tone="secondary" class="mt-4" @click="setTab('annuaire')">Parcourir l'annuaire</CoreButton>
      </div>
      <div v-else class="flex flex-col gap-4.5">
        <section
          v-for="r in requests"
          :id="`request-${r.id}`"
          :key="r.id"
          class="rounded-2xl border bg-white p-5.5"
          :class="r.id === highlight ? 'border-green-600 ring-2 ring-green-100' : 'border-[var(--border-subtle)]'"
        >
          <div class="flex items-start gap-3.5">
            <span class="grid h-[42px] w-[42px] flex-none place-items-center rounded-md bg-info-bg text-info-fg"><Wrench class="h-[18px] w-[18px]" :stroke-width="1.9" /></span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2.5">
                <p class="m-0 text-[15px] font-bold">{{ tradeLabel(r.trade_reference_id) }}</p>
                <CoreBadge :tone="statusTone(r)">{{ statusLabel(r) }}</CoreBadge>
              </div>
              <p class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">{{ r.unit?.name ?? 'Logement' }} · demandée le <span class="font-mono">{{ formatDate(r.created_at) }}</span></p>
              <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">
                <template v-if="r.target_artisan">Envoyée à {{ targetArtisanName(r) }}</template>
                <template v-else>Poste ouvert{{ r.restricted_to_partners ? ' à vos partenaires' : '' }} · {{ postingCandidates(r).length }} candidature{{ postingCandidates(r).length > 1 ? 's' : '' }}</template>
              </p>
            </div>
          </div>
          <p class="mb-0 mt-3.5 text-[13.5px] leading-[1.6] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{{ r.description }}</p>
          <p v-if="r.status === 'in_progress' && r.retained_amount !== null && r.retained_amount !== undefined" class="mb-0 mt-2.5 text-[13px] leading-[1.55] text-[var(--text-muted)]">
            Payée : la part retenue (<span class="font-mono">{{ formatFcfa(Number(r.retained_amount)) }}</span>) est conservée par Immo jusqu'à la fin de la garantie. L'artisan marque l'intervention terminée une fois le travail fait.
          </p>

          <CoreInlineConfirm
            v-if="confirming === r.id"
            class="mt-4"
            tone="danger"
            :message="cancelMessage(r)"
            :confirm-label="r.target_artisan_id ? 'Annuler la demande' : 'Annuler le poste'"
            :loading="busyId === r.id"
            @confirm="doCancel(r)"
            @cancel="confirming = null"
          />
          <div v-else class="mt-4 flex flex-wrap items-center gap-2 border-t border-sand-200 pt-4">
            <CoreButton v-if="r.status === 'agreed'" size="sm" @click="openPayModal(r)">Payer l'intervention</CoreButton>
            <CoreButton v-if="r.target_artisan_id && (r.status === 'open' || r.status === 'agreed')" size="sm" tone="secondary" @click="toggleExpand(r)">{{ expandedId === r.id ? 'Masquer les offres' : 'Voir les offres' }}</CoreButton>
            <NuxtLink v-if="r.conversation_id" :to="`/pro/messages?conversation=${r.conversation_id}`" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900">Conversation</NuxtLink>
            <CoreButton v-if="canReview(r) && !reviewed[r.id]" size="sm" tone="secondary" @click="reviewingId = reviewingId === r.id ? null : r.id">Laisser un avis</CoreButton>
            <span v-else-if="reviewed[r.id]" class="inline-flex items-center gap-1 text-[13px] font-semibold text-ok-fg"><Check class="h-4 w-4" :stroke-width="2" />Avis envoyé</span>
            <CoreButton v-if="canCancel(r)" size="sm" tone="ghost" @click="confirming = r.id; actionError = null">{{ r.target_artisan_id ? 'Annuler la demande' : 'Annuler le poste' }}</CoreButton>
          </div>

          <div v-if="reviewingId === r.id" class="mt-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
            <p class="mb-2 mt-0 text-[12.5px] font-bold">Note</p>
            <div class="mb-3 flex gap-1" role="radiogroup" aria-label="Note sur 5">
              <button v-for="n in 5" :key="n" type="button" :aria-label="`${n} sur 5`" :aria-checked="n === reviewRating" role="radio" class="p-0.5" @click="reviewRating = n">
                <Star class="h-6 w-6" :class="n <= reviewRating ? 'text-warn-fg' : 'text-sand-300'" :fill="n <= reviewRating ? 'currentColor' : 'none'" :stroke-width="1.6" />
              </button>
            </div>
            <textarea v-model="reviewComment" maxlength="1000" placeholder="Votre commentaire (facultatif), visible sur le profil de l'artisan" class="min-h-[64px] w-full resize-y rounded-md border border-[var(--border-default)] bg-white p-3 text-[13.5px] outline-none" />
            <div class="mt-3 flex flex-wrap gap-2">
              <CoreButton size="sm" :disabled="busyId === r.id" @click="submitReview(r)">{{ busyId === r.id ? 'Envoi…' : "Publier l'avis" }}</CoreButton>
              <CoreButton size="sm" tone="secondary" @click="reviewingId = null">Annuler</CoreButton>
            </div>
          </div>

          <!-- Candidatures d'un poste ouvert : chacune a sa propre négociation -->
          <div v-if="!r.target_artisan_id && postingCandidates(r).length" class="mt-3.5 flex flex-col gap-2.5">
            <div v-for="c in postingCandidates(r)" :key="c.id" class="rounded-md border border-[var(--border-subtle)] p-3.5">
              <div class="flex flex-wrap items-center gap-2">
                <p class="m-0 min-w-0 flex-1 text-[13.5px] font-bold">Candidature de {{ targetArtisanName(c) }}</p>
                <CoreBadge :tone="statusTone(c)">{{ statusLabel(c) }}</CoreBadge>
              </div>
              <ArtisanOfferPanel v-if="c.status === 'open' || c.status === 'agreed'" :request="c" side="requester" @changed="block.load" />
              <CoreButton v-if="c.status === 'agreed'" size="sm" class="mt-2.5" @click="openPayModal(c)">Payer l'intervention</CoreButton>
            </div>
          </div>

          <ArtisanOfferPanel v-if="expandedId === r.id && r.target_artisan_id && (r.status === 'open' || r.status === 'agreed')" :request="r" side="requester" @changed="block.load" />
          <ArtisanDisputePanel v-if="r.status === 'completed' || r.status === 'closed'" :request="r" side="requester" @changed="block.load" />
          <p v-if="actionError?.id === r.id" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
        </section>

        <section v-for="c in retainedCandidates" :id="`request-${c.id}`" :key="c.id" class="rounded-2xl border bg-white p-5.5" :class="c.id === highlight ? 'border-green-600 ring-2 ring-green-100' : 'border-[var(--border-subtle)]'">
          <div class="flex items-start gap-3.5">
            <span class="grid h-[42px] w-[42px] flex-none place-items-center rounded-md bg-info-bg text-info-fg"><Wrench class="h-[18px] w-[18px]" :stroke-width="1.9" /></span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2.5">
                <p class="m-0 text-[15px] font-bold">{{ tradeLabel(c.trade_reference_id) }}</p>
                <CoreBadge :tone="statusTone(c)">{{ statusLabel(c) }}</CoreBadge>
              </div>
              <p class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">{{ c.unit?.name ?? 'Logement' }} · candidat retenu : {{ targetArtisanName(c) }}</p>
            </div>
          </div>
          <ArtisanDisputePanel v-if="c.status === 'completed' || c.status === 'closed'" :request="c" side="requester" @changed="block.load" />
        </section>
      </div>
    </template>

    <!-- ===== Annuaire ===== -->
    <template v-else-if="tab === 'annuaire'">
      <FeedbackAlertBanner v-if="tradesState === 'error'" tone="danger">
        Impossible de charger la liste des métiers.
        <button type="button" class="ml-2 font-bold underline" @click="loadTrades">Réessayer</button>
      </FeedbackAlertBanner>
      <div v-else class="mb-4.5 flex flex-wrap gap-2">
        <button
          v-for="t in trades"
          :key="t.id"
          type="button"
          class="h-[38px] rounded-pill border px-3.5 text-[13px] font-semibold transition-colors"
          :class="dirTradeId === t.id ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
          :aria-pressed="dirTradeId === t.id"
          @click="dirTradeId = t.id"
        >{{ t.labels.fr }}</button>
      </div>

      <template v-if="tradesState !== 'error'">
        <div v-if="tradesState === 'loading' || dirBlock.state.value === 'loading' || dirBlock.state.value === 'idle'" class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          <DataSkeletonCard v-for="i in 3" :key="i" :height="150" :lines="1" />
        </div>
        <FeedbackAlertBanner v-else-if="dirBlock.state.value === 'error'" tone="danger">
          Impossible de charger l'annuaire pour le moment.
          <button type="button" class="ml-2 font-bold underline" @click="dirBlock.load">Réessayer</button>
        </FeedbackAlertBanner>
        <div v-else-if="dirBlock.state.value === 'empty'" class="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
          <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Search class="h-5 w-5" :stroke-width="1.9" /></span>
          <p class="mb-0 mt-3 max-w-[400px] text-[13.5px] text-[var(--text-muted)]">Aucun artisan inscrit en {{ tradeLabel(dirTradeId).toLowerCase() }} pour l'instant. Un poste ouvert sera visible des artisans de ce métier dès leur inscription.</p>
          <CoreButton size="sm" tone="secondary" class="mt-4" @click="openRequest">Publier un poste ouvert</CoreButton>
        </div>
        <div v-else class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          <section v-for="a in dirBlock.items.value" :key="a.user_id" class="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <div class="flex items-center gap-3">
              <CoreAvatar :name="artisanName(a)" :avatar-url="a.avatar_url" :size="44" color="var(--color-green-700)" />
              <div class="min-w-0">
                <p class="m-0 flex items-center gap-1.5 text-sm font-bold">{{ artisanName(a) }}<BadgeCheck v-if="a.trust_badge" class="h-4 w-4 flex-none text-green-600" :stroke-width="1.9" aria-label="Badge de confiance" /></p>
                <p class="mb-0 mt-0.5 flex flex-wrap items-center gap-1 text-xs text-[var(--text-faint)]">
                  <template v-if="a.reputation_score !== null"><Star class="h-3.5 w-3.5 text-warn-fg" fill="currentColor" :stroke-width="1.6" /><span class="font-mono">{{ a.reputation_score.toFixed(1) }}</span> · {{ a.review_count }} avis</template>
                  <template v-else>Aucun avis pour l'instant</template>
                  <template v-if="a.years_experience"> · {{ a.years_experience }} ans d'expérience</template>
                </p>
              </div>
            </div>
            <p v-if="a.bio" class="mb-0 mt-3 line-clamp-3 text-[13px] leading-[1.55] text-[var(--text-secondary)]">{{ a.bio }}</p>
            <div class="mt-auto flex flex-wrap items-center gap-2 pt-4">
              <CoreButton size="sm" tone="secondary" @click="requestFrom(a)">
                <span class="inline-flex items-center gap-1.5"><CoreLockIcon v-if="!canAct" />Demander une intervention</span>
              </CoreButton>
              <CoreBadge v-if="partnershipWith(a.user_id)" :tone="PART_STATUS[partnershipWith(a.user_id)!.status]?.tone ?? 'neutral'">{{ PART_STATUS[partnershipWith(a.user_id)!.status]?.label }}</CoreBadge>
              <CoreButton v-else-if="partBlock.state.value !== 'loading'" size="sm" tone="ghost" :disabled="busyId === a.user_id" @click="invite(a)">
                <span class="inline-flex items-center gap-1.5"><Handshake class="h-4 w-4" :stroke-width="1.9" />{{ busyId === a.user_id ? 'Envoi…' : 'Inviter comme partenaire' }}</span>
              </CoreButton>
            </div>
            <p v-if="actionError?.id === a.user_id" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
          </section>
        </div>
      </template>
    </template>

    <!-- ===== Partenariats ===== -->
    <template v-else>
      <section class="mb-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="flex flex-wrap items-center gap-3">
          <div class="min-w-0 flex-[1_1_260px]">
            <h2 class="m-0 text-[15px] font-bold">Vos artisans partenaires</h2>
            <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">Un partenaire accède aux postes que vous réservez à vos partenaires. Il accepte ou refuse votre invitation depuis son espace.</p>
          </div>
          <CoreButton size="sm" tone="secondary" @click="toggleInvite">
            <span class="inline-flex items-center gap-1.5"><Plus v-if="!inviting" class="h-4 w-4" :stroke-width="2" />{{ inviting ? 'Fermer la recherche' : 'Inviter un partenaire' }}</span>
          </CoreButton>
        </div>

        <div v-if="inviting" class="mt-4 border-t border-sand-200 pt-4">
          <p class="mb-2 mt-0 text-[12.5px] font-bold">Métier</p>
          <p v-if="tradesState === 'error'" class="m-0 text-[13px] font-semibold text-danger-fg">Liste des métiers indisponible. <button type="button" class="font-bold underline" @click="loadTrades">Réessayer</button></p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="t in trades"
              :key="t.id"
              type="button"
              class="h-[36px] rounded-pill border px-3.5 text-[12.5px] font-semibold transition-colors"
              :class="inviteTradeId === t.id ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
              :aria-pressed="inviteTradeId === t.id"
              @click="inviteTradeId = t.id"
            >{{ t.labels.fr }}</button>
          </div>
          <div class="mt-3.5">
            <p v-if="!inviteTradeId" class="m-0 text-[13px] text-[var(--text-muted)]">Choisissez un métier pour voir les artisans inscrits.</p>
            <div v-else-if="inviteBlock.state.value === 'loading' || inviteBlock.state.value === 'idle'" class="flex flex-col gap-2">
              <DataSkeletonCard v-for="i in 2" :key="i" :height="52" :lines="0" />
            </div>
            <p v-else-if="inviteBlock.state.value === 'error'" class="m-0 text-[13px] font-semibold text-danger-fg">Les artisans n'ont pas pu être chargés. <button type="button" class="font-bold underline" @click="inviteBlock.load">Réessayer</button></p>
            <p v-else-if="inviteBlock.state.value === 'empty'" class="m-0 text-[13px] text-[var(--text-muted)]">Aucun artisan inscrit pour ce métier pour l'instant.</p>
            <template v-else>
              <div v-for="a in inviteBlock.items.value" :key="a.user_id" class="border-b border-sand-200 py-3 last:border-b-0">
                <div class="flex flex-wrap items-center gap-3">
                  <CoreAvatar :name="artisanName(a)" :avatar-url="a.avatar_url" :size="34" color="var(--color-green-700)" />
                  <p class="m-0 min-w-0 flex-1 text-sm font-bold">{{ artisanName(a) }}</p>
                  <CoreBadge v-if="partnershipWith(a.user_id)" :tone="PART_STATUS[partnershipWith(a.user_id)!.status]?.tone ?? 'neutral'">{{ PART_STATUS[partnershipWith(a.user_id)!.status]?.label }}</CoreBadge>
                  <CoreButton v-else size="sm" tone="secondary" :disabled="busyId === a.user_id" @click="invite(a)">{{ busyId === a.user_id ? 'Envoi…' : 'Inviter' }}</CoreButton>
                </div>
                <p v-if="actionError?.id === a.user_id" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
              </div>
            </template>
          </div>
        </div>
      </section>

      <div v-if="partBlock.state.value === 'loading' || partBlock.state.value === 'idle'" class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
        <DataSkeletonCard v-for="i in 3" :key="i" :height="90" :lines="1" />
      </div>
      <FeedbackAlertBanner v-else-if="partBlock.state.value === 'error'" tone="danger">
        Impossible de charger vos partenariats pour le moment.
        <button type="button" class="ml-2 font-bold underline" @click="partBlock.load">Réessayer</button>
      </FeedbackAlertBanner>
      <div v-else-if="partBlock.state.value === 'empty'" class="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
        <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Handshake class="h-5 w-5" :stroke-width="1.9" /></span>
        <p class="mb-0 mt-3 max-w-[380px] text-[13.5px] text-[var(--text-muted)]">Aucun partenariat pour l'instant. Invitez les artisans avec qui vous travaillez déjà, depuis la recherche ci-dessus ou l'annuaire.</p>
      </div>
      <div v-else class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
        <section v-for="p in partSorted" :key="p.id" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="flex items-center gap-3">
            <CoreAvatar :name="partnershipArtisanName(p)" :size="40" color="var(--color-green-700)" />
            <div class="min-w-0 flex-1">
              <p class="m-0 text-sm font-bold">{{ partnershipArtisanName(p) }}</p>
              <p v-if="p.artisan?.trade_reference_id" class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ tradeLabel(p.artisan.trade_reference_id) }}</p>
            </div>
            <CoreBadge :tone="PART_STATUS[p.status]?.tone ?? 'neutral'">{{ PART_STATUS[p.status]?.label ?? 'Statut inconnu' }}</CoreBadge>
          </div>
          <template v-if="p.status === 'active' || p.status === 'pending'">
            <CoreInlineConfirm
              v-if="confirming === p.id"
              class="mt-3.5"
              tone="danger"
              :message="p.status === 'pending' ? `Annuler l'invitation de ${partnershipArtisanName(p)} ?` : `Mettre fin au partenariat avec ${partnershipArtisanName(p)} ? Il ne verra plus vos postes réservés aux partenaires.`"
              :confirm-label="p.status === 'pending' ? 'Annuler' : 'Mettre fin'"
              :loading="busyId === p.id"
              @confirm="endPartnership(p)"
              @cancel="confirming = null"
            />
            <CoreButton v-else size="sm" tone="ghost" class="mt-3" @click="confirming = p.id; actionError = null">{{ p.status === 'pending' ? "Annuler l'invitation" : 'Mettre fin au partenariat' }}</CoreButton>
          </template>
          <p v-if="actionError?.id === p.id" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
        </section>
      </div>
    </template>
  </div>
</template>
