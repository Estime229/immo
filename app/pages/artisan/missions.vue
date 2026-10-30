<script setup lang="ts">
import { ArrowLeft, CircleCheck, ClipboardList, Hourglass, Inbox, MapPin, MessageSquare, Navigation, SearchX, Wrench } from '@lucide/vue'
import type { ArtisanRequestSummary } from '~/types/artisan'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { interventionPhase, PHASE_LABEL_ARTISAN, PHASE_TONE } from '~/utils/artisanRequests'
import { useArtisanProfile } from '~/composables/useArtisanProfile'

definePageMeta({ layout: 'artisan' })

const artisanApi = useArtisanRequestsApi()
const route = useRoute()
const router = useRouter()
const modal = useArtisanModal()
const modalTarget = useArtisanModalTarget()
const modalRequest = useArtisanModalRequest()
const refresh = useArtisanRequestsRefresh()

const artisan = useArtisanProfile()
const { tradeLabel } = artisan
onMounted(() => {
  artisan.ensureLoaded()
  artisan.ensureTrades()
})

const mineBlock = useFetchBlock(() => artisanApi.listMine())
const openBlock = useFetchBlock(() => artisanApi.listOpen(artisan.tradeId.value ?? undefined).then(r => r.data))
onMounted(mineBlock.load)
onMounted(() => useArtisanRequestBadge().markAllSeen())
watch(refresh, () => mineBlock.load())
// Postes ouverts : seulement une fois le métier connu (profil chargé ou déjà en cache).
watch(artisan.tradeId, id => { if (id && import.meta.client) openBlock.load() }, { immediate: true })

/* ---- Onglets (dans l'URL : ?tab=) ---- */
type Tab = 'ouvertes' | 'encours' | 'terminees'
const TAB_OPTIONS = [
  { value: 'ouvertes', label: 'Postes ouverts' },
  { value: 'encours', label: 'En cours' },
  { value: 'terminees', label: 'Terminées' }
]
function queryTab(): Tab {
  const t = route.query.tab
  return t === 'ouvertes' || t === 'terminees' ? t : 'encours'
}
const tab = ref<Tab>(queryTab())
/** Vue mobile : la liste, ou le détail d'une mission avec « Retour » (même principe que la messagerie). */
const mobileView = ref<'list' | 'detail'>('list')

function setQuery(patch: Record<string, string | undefined>) {
  const query = { ...route.query }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete query[k]
    else query[k] = v
  }
  router.replace({ query })
}
function pickTab(value: string) {
  tab.value = value as Tab
  mobileView.value = 'list'
  setQuery({ tab: value, request: undefined })
}
watch(() => route.query.tab, () => {
  const t = queryTab()
  if (t === tab.value) return
  tab.value = t
  mobileView.value = 'list'
})

/** Un poste déjà candidaté (ou une demande directe déjà ciblée) apparaît dans « En cours », pas dans « Postes ouverts ». */
const myPostingIds = computed(() => new Set(mineBlock.items.value.map(r => r.public_posting_id).filter(Boolean)))
const openItems = computed(() => openBlock.items.value.filter(o => !myPostingIds.value.has(o.id)))
// « En cours » : tout ce qui attend une action (dont un litige) ; « Terminées » : garantie, clôturées, annulées.
const DONE_PHASES = ['warranty', 'closed', 'cancelled']
const encoursItems = computed(() => mineBlock.items.value.filter(r => !DONE_PHASES.includes(interventionPhase(r))))
const termineesItems = computed(() => mineBlock.items.value.filter(r => DONE_PHASES.includes(interventionPhase(r))))
function tabOf(r: ArtisanRequestSummary): Tab {
  return DONE_PHASES.includes(interventionPhase(r)) ? 'terminees' : 'encours'
}

const listForTab = computed<ArtisanRequestSummary[]>(() => {
  if (tab.value === 'ouvertes') return openItems.value
  if (tab.value === 'encours') return encoursItems.value
  return termineesItems.value
})

const selectedId = ref<string | null>(null)
watch([tab, listForTab], () => {
  if (listForTab.value.some(i => i.id === selectedId.value)) return
  selectedId.value = listForTab.value[0]?.id ?? null
  // La mission affichée a changé d'onglet (terminée, annulée…) : on ne montre pas une autre à sa place sur mobile.
  mobileView.value = 'list'
}, { immediate: true })
const selected = computed(() => listForTab.value.find(i => i.id === selectedId.value) ?? null)

function select(id: string) {
  selectedId.value = id
  applyError.value = ''
  flash.value = ''
  mobileView.value = 'detail'
  if (import.meta.client && window.matchMedia('(max-width: 1023px)').matches) window.scrollTo({ top: 0 })
}

/* ---- Lien profond (?request=) : consommé une fois, suivi s'il change (clic de notification sur la page) ---- */
const pendingRequest = ref<string | null>(null)
const notFound = ref(false)
watch(() => route.query.request, r => {
  if (typeof r !== 'string' || !r) return
  pendingRequest.value = r
  notFound.value = false
}, { immediate: true })

const SETTLED = ['success', 'empty', 'error']
function focus(id: string, target: Tab) {
  pendingRequest.value = null
  tab.value = target
  select(id)
  setQuery({ tab: target, request: undefined })
}
function openPending() {
  const id = pendingRequest.value
  if (!id) return
  const mineSettled = SETTLED.includes(mineBlock.state.value)
  // Une mission à moi, ou ma candidature sur ce poste.
  const mine = mineBlock.items.value.find(i => i.id === id) ?? mineBlock.items.value.find(i => i.public_posting_id === id)
  if (mine) return focus(mine.id, tabOf(mine))
  const posting = openBlock.items.value.find(i => i.id === id)
  if (posting && mineSettled) return focus(posting.id, 'ouvertes')
  const openSettled = SETTLED.includes(openBlock.state.value) || artisan.state.value === 'error' || artisan.missingTrade.value
  if (mineSettled && openSettled) {
    pendingRequest.value = null
    notFound.value = mineBlock.state.value !== 'error'
    setQuery({ request: undefined })
  }
}
watch([pendingRequest, () => mineBlock.state.value, () => openBlock.state.value, () => artisan.state.value], openPending)

/* ---- Candidature sur un poste ouvert ---- */
const applying = ref(false)
const applyMessage = ref('')
const applyError = ref('')
const flash = ref('')
async function submitApply(posting: ArtisanRequestSummary) {
  applying.value = true
  applyError.value = ''
  try {
    const candidacy = await artisanApi.applyToOpen(posting.id, applyMessage.value.trim() || undefined)
    applyMessage.value = ''
    await Promise.all([mineBlock.load(), openBlock.load()])
    focus(candidacy.id, 'encours')
    flash.value = 'Candidature envoyée. Faites maintenant votre offre : le demandeur choisit sur le prix, la garantie et la retenue.'
    openOfferModal(candidacy)
  } catch (e) {
    applyError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La candidature a échoué.') : 'La candidature a échoué.'
  } finally {
    applying.value = false
  }
}

function openOfferModal(r: ArtisanRequestSummary) {
  modalTarget.value = r.id
  modalRequest.value = r
  modal.value = 'offre'
}
function openTerminerModal(r: ArtisanRequestSummary) {
  modalTarget.value = r.id
  modalRequest.value = r
  modal.value = 'terminer'
}

function requesterName(r: ArtisanRequestSummary) {
  return r.requester ? [r.requester.first_name, r.requester.last_name].filter(Boolean).join(' ') || 'Le demandeur' : 'Le demandeur'
}
function mapsLink(r: ArtisanRequestSummary) {
  const u = r.unit
  return u?.gps_latitude && u?.gps_longitude ? `https://www.google.com/maps?q=${u.gps_latitude},${u.gps_longitude}` : null
}
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/* ---- États de l'onglet affiché ---- */
/** Squelette au premier chargement seulement : un rechargement après une action garde la liste et le détail affichés (et leurs messages). */
function firstLoad(b: { state: Ref<string>; items: Ref<unknown[]> }) {
  return b.state.value === 'idle' || (b.state.value === 'loading' && !b.items.value.length)
}
const tabState = computed<'loading' | 'error' | 'ready'>(() => {
  if (tab.value === 'ouvertes') {
    if (artisan.state.value === 'error' || artisan.missingTrade.value) return 'ready'
    if (!artisan.loaded.value || firstLoad(openBlock) || firstLoad(mineBlock)) return 'loading'
    return openBlock.state.value === 'error' || mineBlock.state.value === 'error' ? 'error' : 'ready'
  }
  if (firstLoad(mineBlock)) return 'loading'
  return mineBlock.state.value === 'error' ? 'error' : 'ready'
})
function retryTab() {
  if (mineBlock.state.value === 'error') mineBlock.load()
  if (tab.value === 'ouvertes' && openBlock.state.value === 'error') openBlock.load()
}
const EMPTY = computed(() => {
  if (tab.value === 'ouvertes') {
    const label = tradeLabel(artisan.tradeId.value, '')
    return { icon: SearchX, text: `Aucun poste ouvert en ce moment pour votre métier${label ? ` (${label})` : ''}. Les nouvelles demandes publiées arrivent ici.`, action: 'Actualiser' }
  }
  if (tab.value === 'encours') return { icon: Inbox, text: 'Aucune mission en cours. Candidatez sur un poste ouvert pour en démarrer une.', action: 'Voir les postes ouverts' }
  return { icon: ClipboardList, text: "Aucune mission terminée pour l'instant. Vos interventions finies, et leur garantie, s'afficheront ici.", action: 'Voir les missions en cours' }
})
function emptyAction() {
  if (tab.value === 'ouvertes') openBlock.load()
  else pickTab(tab.value === 'encours' ? 'ouvertes' : 'encours')
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 flex flex-wrap items-center gap-3" :class="mobileView === 'detail' ? 'hidden lg:flex' : ''">
      <FormsSegmentedControl :options="TAB_OPTIONS" :model-value="tab" size="sm" @update:model-value="pickTab" />
    </div>

    <p v-if="notFound" class="mb-4.5 mt-0 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[13px] font-semibold text-warn-fg-deep">
      Cette demande n'apparaît plus dans vos missions ni dans les postes ouverts : elle a peut-être été attribuée à un autre artisan ou annulée.
      <button type="button" class="ml-1 font-bold underline" @click="notFound = false">Fermer</button>
    </p>

    <!-- Profil : l'onglet « Postes ouverts » dépend du métier -->
    <template v-if="tab === 'ouvertes' && artisan.state.value === 'error'">
      <FeedbackAlertBanner tone="danger">
        Impossible de charger votre profil : les postes ouverts dépendent de votre métier.
        <button type="button" class="ml-2 font-bold underline" @click="artisan.load">Réessayer</button>
      </FeedbackAlertBanner>
    </template>
    <div v-else-if="tab === 'ouvertes' && artisan.missingTrade.value" class="flex flex-wrap items-center gap-3 rounded-2xl border border-warn-border bg-warn-bg p-5.5">
      <p class="m-0 min-w-[200px] flex-1 text-[13.5px] leading-[1.55] text-warn-fg-deep">
        <strong>Renseignez votre métier</strong> pour voir les postes ouverts qui vous correspondent et recevoir des demandes.
      </p>
      <CoreButton size="sm" @click="navigateTo('/artisan/profil')">Choisir mon métier</CoreButton>
    </div>

    <div v-else-if="tabState === 'loading'" class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div class="flex flex-col gap-3">
        <DataSkeletonCard v-for="i in 3" :key="i" :height="92" :lines="0" />
      </div>
      <DataSkeletonCard class="hidden lg:block" :height="320" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="tabState === 'error'" tone="danger">
      {{ tab === 'ouvertes' ? 'Impossible de charger les postes ouverts pour le moment.' : 'Impossible de charger vos missions pour le moment.' }}
      <button type="button" class="ml-2 font-bold underline" @click="retryTab">Réessayer</button>
    </FeedbackAlertBanner>

    <ArtisanEmptyState v-else-if="!listForTab.length" :icon="EMPTY.icon" :text="EMPTY.text" :action-label="EMPTY.action" @action="emptyAction" />

    <div v-else class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <!-- Liste -->
      <div class="flex-col gap-3 lg:flex" :class="mobileView === 'detail' ? 'hidden' : 'flex'">
        <p v-if="artisan.missingTrade.value" class="m-0 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[12.5px] text-warn-fg-deep">
          Métier non renseigné : <NuxtLink to="/artisan/profil" class="font-bold underline">complétez votre profil</NuxtLink> pour recevoir de nouvelles demandes.
        </p>
        <button
          v-for="m in listForTab"
          :key="m.id"
          type="button"
          class="w-full rounded-2xl border bg-white px-4.5 py-4 text-left transition-colors"
          :class="selectedId === m.id ? 'border-[var(--border-subtle)] lg:border-green-600 lg:ring-2 lg:ring-green-100' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'"
          :aria-current="selectedId === m.id ? 'true' : undefined"
          @click="select(m.id)"
        >
          <div class="flex items-start gap-3">
            <div class="grid h-[42px] w-[42px] flex-none place-items-center rounded-md bg-green-50 text-green-700">
              <Wrench class="h-[18px] w-[18px]" :stroke-width="1.9" aria-hidden="true" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p class="m-0 text-sm font-bold">{{ tradeLabel(m.trade_reference_id) }}</p>
                <CoreBadge v-if="tab !== 'ouvertes'" :tone="PHASE_TONE[interventionPhase(m)]">{{ PHASE_LABEL_ARTISAN[interventionPhase(m)] }}</CoreBadge>
              </div>
              <p class="mb-0 mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{{ m.unit?.name ?? 'Logement' }} · {{ requesterName(m) }}</p>
              <p v-if="m.unit?.address" class="mb-0 mt-1 flex items-center gap-1 text-xs text-[var(--text-faint)]">
                <MapPin class="h-3.5 w-3.5 flex-none" :stroke-width="1.9" aria-hidden="true" />
                <span class="truncate">{{ m.unit.address }}</span>
              </p>
            </div>
            <span class="flex-none font-mono text-xs text-[var(--text-faint)]">{{ formatDay(m.created_at) }}</span>
          </div>
        </button>
      </div>

      <!-- Détail -->
      <div v-if="selected" class="lg:sticky lg:top-[94px] lg:block lg:max-h-[calc(100vh-110px)] lg:overflow-y-auto" :class="mobileView === 'list' ? 'hidden' : 'block'">
        <button type="button" class="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700 lg:hidden" @click="mobileView = 'list'">
          <ArrowLeft class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />
          {{ tab === 'ouvertes' ? 'Postes ouverts' : tab === 'encours' ? 'Missions en cours' : 'Missions terminées' }}
        </button>

        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <p v-if="flash" class="mb-4 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>

          <div class="flex flex-wrap items-start gap-x-3 gap-y-1.5">
            <h2 class="m-0 min-w-0 flex-1 text-[17px] font-bold tracking-[-.015em]">{{ tradeLabel(selected.trade_reference_id) }}</h2>
            <CoreBadge v-if="tab !== 'ouvertes'" :tone="PHASE_TONE[interventionPhase(selected)]">{{ PHASE_LABEL_ARTISAN[interventionPhase(selected)] }}</CoreBadge>
          </div>
          <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">{{ selected.unit?.name ?? 'Logement' }} · demandé le <span class="font-mono">{{ formatDay(selected.created_at) }}</span></p>

          <p v-if="selected.unit?.address" class="mb-0 mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--text-secondary)]">
            <MapPin class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" aria-hidden="true" />
            <span class="min-w-0 [overflow-wrap:anywhere]">{{ selected.unit.address }}</span>
            <a v-if="mapsLink(selected)" :href="mapsLink(selected) ?? undefined" target="_blank" rel="noopener" class="inline-flex items-center gap-1 font-bold text-green-700">
              <Navigation class="h-3.5 w-3.5" :stroke-width="1.9" aria-hidden="true" />Itinéraire
            </a>
          </p>

          <p v-if="selected.description" class="mb-0 mt-4 text-sm leading-[1.6] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{{ selected.description }}</p>

          <!-- Photos du signalement d'origine, si cette demande en vient. -->
          <div v-if="selected.signal?.attachments?.length" class="mt-3.5 flex flex-wrap gap-2">
            <a v-for="(url, i) in selected.signal.attachments" :key="url" :href="url" target="_blank" rel="noopener" class="block h-16 w-16 overflow-hidden rounded-md border border-[var(--border-default)]">
              <img :src="url" :alt="`Photo ${i + 1} du signalement`" class="h-full w-full object-cover">
            </a>
          </div>

          <div class="mt-4.5 border-t border-sand-200 pt-4.5">
            <template v-if="tab === 'ouvertes'">
              <label class="block">
                <span class="mb-[7px] block text-[12.5px] font-bold">Message au demandeur (facultatif)</span>
                <textarea v-model="applyMessage" maxlength="1000" placeholder="Disponible dès demain, je peux passer voir le souci." class="min-h-[80px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 py-3 text-sm outline-none" />
                <span class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">Vous ferez votre offre (prix, garantie, retenue) juste après.</span>
              </label>
              <p v-if="applyError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ applyError }}</p>
              <CoreButton full-width class="mt-4" :disabled="applying" @click="submitApply(selected)">{{ applying ? 'Envoi…' : 'Candidater et faire une offre' }}</CoreButton>
            </template>

            <template v-else>
              <h3 class="m-0 text-[15px] font-bold">{{ selected.status === 'open' ? 'Négociation' : selected.status === 'completed' || selected.status === 'closed' ? 'Garantie' : 'Intervention' }}</h3>
              <ArtisanOfferPanel v-if="selected.status === 'open'" :key="`o-${selected.id}`" :request="selected" side="artisan" @changed="mineBlock.load" />
              <div v-else-if="selected.status === 'agreed'" class="mt-3 flex items-start gap-2.5 rounded-md border border-info-border bg-info-bg px-3.5 py-3 text-[13px] leading-[1.55] text-info-fg-deep">
                <Hourglass class="mt-0.5 h-4 w-4 flex-none" :stroke-width="1.9" aria-hidden="true" />
                <p class="m-0">Offre acceptée, en attente du paiement par le demandeur. Ne vous déplacez pas avant : le paiement apparaîtra ici et dans vos notifications.</p>
              </div>
              <template v-else-if="selected.status === 'in_progress'">
                <div class="mt-3 flex items-start gap-2.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-3 text-[13px] leading-[1.55] text-green-900">
                  <CircleCheck class="mt-0.5 h-4 w-4 flex-none" :stroke-width="1.9" aria-hidden="true" />
                  <p class="m-0">
                    Payée : la part immédiate est sur votre wallet<template v-if="Number(selected.retained_amount ?? 0) > 0">, <span class="font-mono font-bold">{{ formatFcfa(Number(selected.retained_amount)) }}</span> sont retenus jusqu'à la fin de la garantie</template>. Convenez du passage dans la conversation, puis marquez l'intervention terminée.
                  </p>
                </div>
                <CoreButton full-width class="mt-3.5" @click="openTerminerModal(selected)">Marquer terminée</CoreButton>
              </template>
              <ArtisanDisputePanel v-else-if="selected.status === 'completed' || selected.status === 'closed'" :key="`d-${selected.id}`" :request="selected" side="artisan" @changed="mineBlock.load" />
              <p v-else class="mb-0 mt-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3.5 py-3 text-[13px] text-[var(--text-secondary)]">Demande annulée par le demandeur.</p>
            </template>
          </div>

          <div class="mt-4.5 flex flex-wrap items-center gap-3 rounded-md bg-[var(--surface-page)] px-3.5 py-3">
            <CoreAvatar :name="requesterName(selected)" :size="36" />
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold">{{ requesterName(selected) }}</p>
              <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Demandeur</p>
            </div>
            <NuxtLink
              v-if="selected.conversation_id"
              :to="`/artisan/messages?conversation=${selected.conversation_id}`"
              class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900 hover:bg-sand-50"
            >
              <MessageSquare class="h-4 w-4" :stroke-width="1.9" aria-hidden="true" />Conversation
            </NuxtLink>
            <span v-else class="text-xs text-[var(--text-faint)]">{{ tab === 'ouvertes' ? 'Conversation ouverte à la candidature' : 'Pas encore de conversation' }}</span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
