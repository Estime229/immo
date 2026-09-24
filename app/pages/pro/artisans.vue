<script setup lang="ts">
import type { ArtisanOffer, ArtisanPartnership, ArtisanProfile, ArtisanRequestSummary } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'pro' })

const artisanApi = useArtisanRequestsApi()
const refData = useReferenceData()
const modal = useProModal()
const refresh = useArtisanRequestsRefresh()

const tab = ref<'interventions' | 'annuaire' | 'partenariats'>('interventions')
const TABS = [
  { key: 'interventions' as const, label: 'Interventions' },
  { key: 'annuaire' as const, label: 'Annuaire' },
  { key: 'partenariats' as const, label: 'Partenariats' }
]

/* ---- Référentiel des métiers ---- */
const trades = ref<RefEntry[]>([])
onMounted(async () => {
  try {
    trades.value = await refData.fetchRef('ARTISAN_TRADE')
  } catch {
    trades.value = []
  }
})
function tradeLabel(id?: string) {
  return trades.value.find(t => t.id === id)?.labels.fr ?? 'Intervention'
}

/* ---- Interventions (mes demandes) ---- */
const block = useFetchBlock(() => artisanApi.listMine())
onMounted(block.load)
watch(refresh, block.load)

const STATUS_LABEL: Record<string, string> = { open: 'Ouverte', agreed: 'Offre acceptée', in_progress: 'Payée, en cours', completed: 'Terminée', cancelled: 'Annulée' }
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'info' | 'neutral' | 'danger'> = { open: 'warn', agreed: 'info', in_progress: 'info', completed: 'ok', cancelled: 'neutral' }
function statusLabel(s: string) {
  return STATUS_LABEL[s] ?? s
}
function statusTone(s: string) {
  return STATUS_TONE[s] ?? 'neutral'
}
/** `first_name`/`last_name` peuvent être `null` — l'inscription ne les persiste pas encore côté API (voir I1). */
function targetArtisanName(r: ArtisanRequestSummary) {
  const name = [r.target_artisan?.first_name, r.target_artisan?.last_name].filter(Boolean).join(' ')
  return name || 'un artisan'
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const busyId = ref<string | null>(null)
const actionError = ref('')

const expandedId = ref<string | null>(null)
const offersByRequest = ref<Record<string, ArtisanOffer[]>>({})
const offersLoading = ref<string | null>(null)

async function toggleExpand(r: ArtisanRequestSummary) {
  if (expandedId.value === r.id) {
    expandedId.value = null
    return
  }
  expandedId.value = r.id
  actionError.value = ''
  if (!offersByRequest.value[r.id]) {
    offersLoading.value = r.id
    try {
      offersByRequest.value[r.id] = await artisanApi.listOffers(r.id)
    } catch {
      offersByRequest.value[r.id] = []
    } finally {
      offersLoading.value = null
    }
  }
}

async function respond(offerId: string, requestId: string, action: 'accept' | 'reject') {
  busyId.value = offerId
  actionError.value = ''
  try {
    await artisanApi.respondOffer(offerId, action)
    offersByRequest.value[requestId] = await artisanApi.listOffers(requestId)
    await block.load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "La réponse à l'offre a échoué.") : "La réponse à l'offre a échoué."
  } finally {
    busyId.value = null
  }
}

async function doCancel(r: ArtisanRequestSummary) {
  busyId.value = r.id
  actionError.value = ''
  try {
    await artisanApi.cancel(r.id)
    await block.load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'annulation a échoué.") : "L'annulation a échoué."
  } finally {
    busyId.value = null
  }
}

async function doPay(r: ArtisanRequestSummary) {
  busyId.value = r.id
  actionError.value = ''
  try {
    await artisanApi.pay(r.id)
    await block.load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "Le paiement a échoué.") : "Le paiement a échoué."
  } finally {
    busyId.value = null
  }
}

/* ---- Avis (une fois l'intervention terminée) ---- */
const reviewingId = ref<string | null>(null)
const reviewRating = ref(5)
const reviewComment = ref('')
async function submitReview(r: ArtisanRequestSummary) {
  busyId.value = r.id
  actionError.value = ''
  try {
    await artisanApi.review(r.id, reviewRating.value, reviewComment.value.trim() || undefined)
    reviewingId.value = null
    reviewComment.value = ''
    reviewRating.value = 5
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'avis a échoué.") : "L'avis a échoué."
  } finally {
    busyId.value = null
  }
}

/* ---- Annuaire (recherche par métier, GET /artisans exige `trade`) ---- */
const dirTradeId = ref('')
const dirBlock = useFetchBlock(() => artisanApi.searchArtisans(dirTradeId.value).then(r => r.data))
watch(trades, ts => { if (ts.length && !dirTradeId.value) dirTradeId.value = ts[0]!.id }, { immediate: true })
watch(dirTradeId, id => { if (id) dirBlock.load() })

function artisanName(a: ArtisanProfile) {
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Artisan'
}

/* ---- Partenariats ---- */
const partBlock = useFetchBlock(() => artisanApi.myPartnerships())
const partLoaded = ref(false)
watch(tab, t => { if (t === 'partenariats' && !partLoaded.value) { partLoaded.value = true; partBlock.load() } })

const PART_STATUS_LABEL: Record<string, string> = { pending: 'En attente', active: 'Actif', ended: 'Terminé', rejected: 'Refusé' }
function partnershipArtisanName(p: ArtisanPartnership) {
  return p.artisan ? [p.artisan.first_name, p.artisan.last_name].filter(Boolean).join(' ') || 'Artisan' : 'Artisan'
}

async function endPartnership(p: ArtisanPartnership) {
  busyId.value = p.id
  actionError.value = ''
  try {
    await artisanApi.endPartnership(p.id)
    await partBlock.load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'arrêt du partenariat a échoué.") : "L'arrêt du partenariat a échoué."
  } finally {
    busyId.value = null
  }
}

const inviting = ref(false)
const inviteTradeId = ref('')
const inviteArtisans = ref<ArtisanProfile[]>([])
watch(inviteTradeId, async id => {
  if (!id) { inviteArtisans.value = []; return }
  try {
    inviteArtisans.value = (await artisanApi.searchArtisans(id)).data
  } catch {
    inviteArtisans.value = []
  }
})
const inviteLoading = ref(false)
const inviteError = ref('')
async function invite(artisanId: string) {
  inviteLoading.value = true
  inviteError.value = ''
  try {
    await artisanApi.createPartnership(artisanId)
    inviting.value = false
    await partBlock.load()
  } catch (e) {
    inviteError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'invitation a échoué.") : "L'invitation a échoué."
  } finally {
    inviteLoading.value = false
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div class="flex w-fit flex-wrap gap-[5px] rounded-pill bg-sand-200 p-1">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          class="rounded-pill px-4.5 py-2.5 text-[13px] font-bold transition-all"
          :class="tab === t.key ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'"
          @click="tab = t.key"
        >{{ t.label }}</button>
      </div>
      <button type="button" class="rounded-pill bg-[image:var(--action-primary)] px-4.5 py-2.5 text-[13px] font-bold text-white shadow-action" @click="modal = 'artisanReq'">
        + Demander une intervention
      </button>
    </div>

    <p v-if="actionError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>

    <template v-if="tab === 'interventions'">
      <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
        <DataSkeletonCard v-for="i in 2" :key="i" :height="120" :lines="1" />
      </div>
      <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
        Impossible de charger vos demandes pour le moment.
        <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
      </FeedbackAlertBanner>
      <p v-else-if="block.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        Aucune demande d'intervention pour l'instant.
      </p>
      <template v-else>
        <div v-for="r in block.items.value" :key="r.id" class="mb-3.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5">
          <div class="flex cursor-pointer items-start gap-4" @click="toggleExpand(r)">
            <div class="grid h-11 w-11 flex-none place-items-center rounded-md bg-info-bg text-[17px]">⚒</div>
            <div class="flex-1">
              <p class="m-0 text-[15.5px] font-bold">{{ tradeLabel(r.trade_reference_id) }}</p>
              <p class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">{{ r.unit?.name ?? 'Logement' }} · demandée le {{ formatDate(r.created_at) }}</p>
              <p v-if="r.target_artisan" class="mb-0 mt-1 text-[12.5px] text-[var(--text-faint)]">Envoyée à {{ targetArtisanName(r) }}</p>
            </div>
            <CoreBadge :tone="statusTone(r.status)">{{ statusLabel(r.status) }}</CoreBadge>
          </div>

          <p class="mb-0 mt-3.5 text-sm leading-[1.6] text-[var(--text-secondary)]">{{ r.description }}</p>

          <div class="mt-4 flex flex-wrap gap-2 border-t border-sand-200 pt-4">
            <button v-if="r.status === 'open' || r.status === 'agreed'" type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold" :disabled="busyId === r.id" @click.stop="doCancel(r)">Annuler la demande</button>
            <button v-if="r.status === 'agreed'" type="button" class="rounded-sm bg-[image:var(--action-primary)] px-4 py-2.5 text-[12.5px] font-bold text-white" :disabled="busyId === r.id" @click.stop="doPay(r)">{{ busyId === r.id ? 'Paiement…' : "Payer l'intervention" }}</button>
            <CoreBadge v-if="r.status === 'in_progress'" tone="ok" class="self-center">Payée, en attente de l'artisan</CoreBadge>
            <button v-if="r.status === 'completed'" type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold" @click.stop="reviewingId = reviewingId === r.id ? null : r.id">Laisser un avis</button>
            <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold" @click.stop="toggleExpand(r)">{{ expandedId === r.id ? 'Masquer les offres' : 'Voir les offres' }}</button>
          </div>

          <div v-if="reviewingId === r.id" class="mt-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
            <p class="mb-2 mt-0 text-[12.5px] font-bold">Note</p>
            <div class="mb-3 flex gap-1.5">
              <button v-for="n in 5" :key="n" type="button" class="text-[22px]" :class="n <= reviewRating ? 'text-warn-fg' : 'text-sand-300'" @click="reviewRating = n">★</button>
            </div>
            <textarea v-model="reviewComment" placeholder="Votre commentaire (optionnel)" class="min-h-[60px] w-full resize-y rounded-md border border-[var(--border-default)] bg-white p-3 text-sm outline-none" />
            <button type="button" class="mt-3 rounded-sm bg-[image:var(--action-primary)] px-4 py-2.5 text-[12.5px] font-bold text-white" :disabled="busyId === r.id" @click="submitReview(r)">{{ busyId === r.id ? 'Envoi…' : "Envoyer l'avis" }}</button>
          </div>

          <div v-if="expandedId === r.id" class="mt-3.5 border-t border-sand-200 pt-4">
            <p v-if="offersLoading === r.id" class="m-0 text-[13px] text-[var(--text-muted)]">Chargement des offres…</p>
            <p v-else-if="!offersByRequest[r.id]?.length" class="m-0 text-[13px] text-[var(--text-muted)]">Aucune offre reçue pour l'instant.</p>
            <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div v-for="o in offersByRequest[r.id]" :key="o.id" class="rounded-xl border-[1.5px] bg-white p-4" :class="o.status === 'accepted' ? 'border-green-600' : 'border-[var(--border-subtle)]'">
                <div class="flex justify-between text-[13px]"><span class="text-[var(--text-muted)]">Prix</span><span class="font-mono font-bold">{{ formatFcfa(Number(o.price)) }}</span></div>
                <div class="mt-1.5 flex justify-between text-[13px]"><span class="text-[var(--text-muted)]">Garantie</span><span class="font-semibold">{{ o.warranty_days }} jours</span></div>
                <div class="mt-1.5 flex justify-between text-[13px]"><span class="text-[var(--text-muted)]">Retenue</span><span class="font-semibold text-clay-700">{{ o.retention_percentage }} %</span></div>
                <CoreBadge v-if="o.status !== 'pending'" :tone="o.status === 'accepted' ? 'ok' : 'neutral'" class="mt-2.5">{{ o.status === 'accepted' ? 'Acceptée' : 'Refusée' }}</CoreBadge>
                <div v-else class="mt-2.5 flex gap-1.5">
                  <button type="button" class="flex-1 rounded-md bg-[image:var(--action-primary)] py-2 text-[12px] font-bold text-white" :disabled="busyId === o.id" @click="respond(o.id, r.id, 'accept')">Accepter</button>
                  <button type="button" class="flex-1 rounded-md border border-[var(--border-default)] bg-white py-2 text-[12px] font-bold" :disabled="busyId === o.id" @click="respond(o.id, r.id, 'reject')">Refuser</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <template v-else-if="tab === 'annuaire'">
      <div class="mb-4 flex flex-wrap gap-2">
        <button
          v-for="t in trades"
          :key="t.id"
          type="button"
          class="rounded-pill border px-3.5 py-2.5 text-[13px] font-semibold transition-all"
          :class="dirTradeId === t.id ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
          @click="dirTradeId = t.id"
        >{{ t.labels.fr }}</button>
      </div>

      <div v-if="dirBlock.state.value === 'loading'" class="flex flex-col gap-3.5">
        <DataSkeletonCard v-for="i in 2" :key="i" :height="100" :lines="1" />
      </div>
      <FeedbackAlertBanner v-else-if="dirBlock.state.value === 'error'" tone="danger">
        Impossible de charger l'annuaire pour le moment.
        <button type="button" class="ml-2 font-bold underline" @click="dirBlock.load">Réessayer</button>
      </FeedbackAlertBanner>
      <p v-else-if="dirBlock.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        Aucun artisan pour ce métier pour l'instant.
      </p>
      <div v-else class="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div v-for="a in dirBlock.items.value" :key="a.user_id" class="rounded-xl border border-[var(--border-subtle)] bg-white p-5">
          <div class="flex items-center gap-3">
            <CoreAvatar :name="artisanName(a)" :size="44" color="var(--color-green-700)" />
            <div>
              <p class="m-0 text-[14.5px] font-bold">{{ artisanName(a) }} <span v-if="a.trust_badge" class="ml-1 text-green-600">✓</span></p>
              <p v-if="a.years_experience" class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">{{ a.years_experience }} ans d'expérience</p>
            </div>
          </div>
          <p class="mb-0 mt-3.5 text-[12.5px] text-[var(--text-faint)]">{{ a.reputation_score !== null ? `★ ${a.reputation_score.toFixed(1)} · ${a.review_count} avis` : 'Aucun avis pour l\'instant' }}</p>
          <p v-if="a.bio" class="mb-0 mt-2 text-[12.5px] leading-[1.5] text-[var(--text-secondary)]">{{ a.bio }}</p>
        </div>
      </div>
    </template>

    <template v-else>
      <button type="button" class="mb-4 rounded-pill border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold text-sand-900" @click="inviting = !inviting; inviteTradeId = ''; inviteArtisans = []">
        {{ inviting ? 'Annuler' : '+ Inviter un partenaire' }}
      </button>

      <div v-if="inviting" class="mb-5 rounded-xl border border-[var(--border-subtle)] bg-white p-5">
        <p class="mb-2 mt-0 text-[12.5px] font-bold">Métier</p>
        <div class="mb-3.5 flex flex-wrap gap-2">
          <button
            v-for="t in trades"
            :key="t.id"
            type="button"
            class="rounded-pill border px-3.5 py-2 text-[12.5px] font-semibold transition-all"
            :class="inviteTradeId === t.id ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
            @click="inviteTradeId = t.id"
          >{{ t.labels.fr }}</button>
        </div>
        <p v-if="inviteError" class="mb-2.5 mt-0 text-[13px] font-semibold text-danger-fg">{{ inviteError }}</p>
        <p v-if="inviteTradeId && !inviteArtisans.length" class="m-0 text-[13px] text-[var(--text-muted)]">Aucun artisan pour ce métier.</p>
        <div v-for="a in inviteArtisans" :key="a.user_id" class="mb-2 flex items-center gap-3 rounded-md border border-[var(--border-subtle)] p-3">
          <CoreAvatar :name="artisanName(a)" :size="32" color="var(--color-green-700)" />
          <p class="m-0 flex-1 text-[13px] font-bold">{{ artisanName(a) }}</p>
          <button type="button" class="rounded-sm bg-[image:var(--action-primary)] px-3.5 py-2 text-[12px] font-bold text-white" :disabled="inviteLoading" @click="invite(a.user_id)">Inviter</button>
        </div>
      </div>

      <div v-if="partBlock.state.value === 'loading'" class="flex flex-col gap-3.5">
        <DataSkeletonCard v-for="i in 2" :key="i" :height="80" :lines="1" />
      </div>
      <FeedbackAlertBanner v-else-if="partBlock.state.value === 'error'" tone="danger">
        Impossible de charger vos partenariats pour le moment.
        <button type="button" class="ml-2 font-bold underline" @click="partBlock.load">Réessayer</button>
      </FeedbackAlertBanner>
      <p v-else-if="partBlock.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        Aucun partenariat pour l'instant.
      </p>
      <div v-else class="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div v-for="p in partBlock.items.value" :key="p.id" class="rounded-xl border border-[var(--border-subtle)] bg-white p-5">
          <div class="flex items-center gap-3">
            <CoreAvatar :name="partnershipArtisanName(p)" :size="40" color="var(--color-green-700)" />
            <div class="flex-1">
              <p class="m-0 text-[14.5px] font-bold">{{ partnershipArtisanName(p) }}</p>
              <CoreBadge :tone="p.status === 'active' ? 'ok' : p.status === 'pending' ? 'warn' : 'neutral'" class="mt-1">{{ PART_STATUS_LABEL[p.status] ?? p.status }}</CoreBadge>
            </div>
          </div>
          <button v-if="p.status === 'active' || p.status === 'pending'" type="button" class="mt-3.5 w-full rounded-sm border border-[var(--border-default)] bg-white py-2 text-[12.5px] font-bold" :disabled="busyId === p.id" @click="endPartnership(p)">{{ busyId === p.id ? '…' : 'Mettre fin' }}</button>
        </div>
      </div>
    </template>
  </div>
</template>
