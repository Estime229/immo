<script setup lang="ts">
import type { ArtisanProfile, ArtisanRequestSummary } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { interventionPhase, PHASE_LABEL_ARTISAN, PHASE_TONE } from '~/utils/artisanRequests'

definePageMeta({ layout: 'artisan' })

const artisanApi = useArtisanRequestsApi()
const profileApi = useArtisanProfileApi()
const refData = useReferenceData()
const currentUser = useAuthUser()
const modal = useArtisanModal()
const modalTarget = useArtisanModalTarget()
const refresh = useArtisanRequestsRefresh()

const profile = ref<ArtisanProfile | null>(null)
onMounted(async () => {
  try {
    profile.value = await profileApi.fetchMine()
  } catch {
    profile.value = null
  }
})

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

const mineBlock = useFetchBlock(() => artisanApi.listMine())
const openBlock = useFetchBlock(() => artisanApi.listOpen(profile.value?.trade_reference_id).then(r => r.data))
onMounted(mineBlock.load)
onMounted(() => useArtisanRequestBadge().markAllSeen())
watch(refresh, mineBlock.load)
watch(profile, p => { if (p?.trade_reference_id) openBlock.load() })

const tab = ref<'ouvertes' | 'encours' | 'terminees'>('encours')
const TABS = [
  { key: 'ouvertes' as const, label: 'Postes ouverts' },
  { key: 'encours' as const, label: 'En cours' },
  { key: 'terminees' as const, label: 'Terminées' }
]

/** Un poste déjà candidaté (ou une demande directe déjà ciblée) apparaît dans « En cours », pas dans « Postes ouverts ». */
const myPostingIds = computed(() => new Set(mineBlock.items.value.map(r => r.public_posting_id).filter(Boolean)))
const openItems = computed(() => openBlock.items.value.filter(o => !myPostingIds.value.has(o.id)))
// « En cours » : tout ce qui attend une action (dont un litige) ; « Terminées » : garantie, clôturées (avant : `closed` n'apparaissait nulle part), annulées.
const encoursItems = computed(() => mineBlock.items.value.filter(r => ['open', 'agreed', 'in_progress', 'disputed'].includes(interventionPhase(r))))
const termineesItems = computed(() => mineBlock.items.value.filter(r => ['warranty', 'closed', 'cancelled'].includes(interventionPhase(r))))

const listForTab = computed<ArtisanRequestSummary[]>(() => {
  if (tab.value === 'ouvertes') return openItems.value
  if (tab.value === 'encours') return encoursItems.value
  return termineesItems.value
})

const selectedId = ref<string | null>(null)
watch([tab, listForTab], () => {
  if (!listForTab.value.some(i => i.id === selectedId.value)) selectedId.value = listForTab.value[0]?.id ?? null
}, { immediate: true })
const selected = computed(() => listForTab.value.find(i => i.id === selectedId.value) ?? null)

function pickTab(key: typeof tab.value) {
  tab.value = key
}

/* ---- Lien direct (notification) : ?request= ouvre la mission ---- */
const route = useRoute()
const wanted = typeof route.query.request === 'string' ? route.query.request : null
watch(() => mineBlock.items.value, items => {
  const r = wanted ? items.find(i => i.id === wanted) : null
  if (!r) return
  tab.value = termineesItems.value.some(i => i.id === r.id) ? 'terminees' : 'encours'
  nextTick(() => { selectedId.value = r.id })
})
function reloadMine() {
  mineBlock.load()
}
function requesterName(r: ArtisanRequestSummary) {
  return r.requester ? [r.requester.first_name, r.requester.last_name].filter(Boolean).join(' ') || 'Le demandeur' : 'Le demandeur'
}
function mapsLink(r: ArtisanRequestSummary) {
  const u = r.unit
  return u?.gps_latitude && u?.gps_longitude ? `https://www.google.com/maps?q=${u.gps_latitude},${u.gps_longitude}` : null
}

/* ---- Candidature sur un poste ouvert ---- */
const applying = ref(false)
const applyMessage = ref('')
const applyError = ref('')
async function submitApply(posting: ArtisanRequestSummary) {
  applying.value = true
  applyError.value = ''
  try {
    const candidacy = await artisanApi.applyToOpen(posting.id, applyMessage.value.trim() || undefined)
    applyMessage.value = ''
    await Promise.all([mineBlock.load(), openBlock.load()])
    tab.value = 'encours'
    selectedId.value = candidacy.id
    openOfferModal(candidacy.id)
  } catch (e) {
    applyError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La candidature a échoué.') : 'La candidature a échoué.'
  } finally {
    applying.value = false
  }
}

function openOfferModal(requestId: string) {
  modalTarget.value = requestId
  modal.value = 'offre'
}
function openTerminerModal(requestId: string) {
  modalTarget.value = requestId
  modal.value = 'terminer'
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex w-fit gap-1 rounded-pill bg-sand-200 p-1">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="rounded-pill px-4.5 py-2.5 text-[13px] font-bold transition-all"
        :class="tab === t.key ? 'bg-white text-green-900 shadow-[0_1px_4px_rgba(26,23,20,.14)]' : 'bg-transparent text-[var(--text-secondary)]'"
        @click="pickTab(t.key)"
      >{{ t.label }}</button>
    </div>

    <div v-if="!profile?.trade_reference_id" class="rounded-md border border-warn-border bg-warn-bg px-4 py-3.5 text-[13.5px] text-warn-fg">
      Renseignez votre métier dans <NuxtLink to="/artisan/profil" class="font-bold underline">votre profil</NuxtLink> pour voir les postes ouverts et recevoir des demandes.
    </div>

    <div v-else-if="(tab === 'ouvertes' ? openBlock : mineBlock).state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard :height="90" :lines="1" />
      <DataSkeletonCard :height="90" :lines="1" />
    </div>

    <p v-else-if="!listForTab.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      {{ tab === 'ouvertes' ? 'Aucun poste ouvert pour votre métier pour l\'instant.' : tab === 'encours' ? 'Aucune mission en cours.' : 'Aucune mission terminée.' }}
    </p>

    <div v-else class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[1fr_1.15fr]">
      <div class="flex flex-col gap-3">
        <div
          v-for="m in listForTab"
          :key="m.id"
          class="cursor-pointer rounded-xl border-[1.5px] bg-white p-4"
          :class="selectedId === m.id ? 'border-green-600' : 'border-[var(--border-subtle)]'"
          @click="selectedId = m.id"
        >
          <div class="flex items-center gap-2.5">
            <div class="grid h-[38px] w-[38px] flex-none place-items-center rounded-md bg-info-bg text-[15px]">⚑</div>
            <div class="flex-1">
              <p class="m-0 text-[14.5px] font-bold">{{ tradeLabel(m.trade_reference_id) }}</p>
              <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ m.unit?.name ?? 'Logement' }}</p>
            </div>
          </div>
          <div class="mt-3 flex items-center justify-between">
            <span class="text-xs text-[var(--text-faint)]">{{ new Date(m.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) }}</span>
            <CoreBadge v-if="tab !== 'ouvertes'" :tone="PHASE_TONE[interventionPhase(m)]">{{ PHASE_LABEL_ARTISAN[interventionPhase(m)] }}</CoreBadge>
          </div>
        </div>
      </div>

      <div v-if="selected" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 lg:sticky lg:top-[94px]">
        <p class="m-0 text-[17px] font-bold tracking-[-.015em]">{{ tradeLabel(selected.trade_reference_id) }}</p>
        <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">{{ selected.unit?.name ?? 'Logement' }} · {{ selected.requester ? [selected.requester.first_name, selected.requester.last_name].filter(Boolean).join(' ') || 'Demandeur' : 'Demandeur' }}</p>
        <p class="mb-0 mt-4 text-sm leading-[1.6] text-[var(--text-secondary)]">{{ selected.description }}</p>

        <template v-if="tab === 'ouvertes'">
          <p class="mb-2 mt-4.5 text-[12.5px] font-bold">Message au demandeur (optionnel)</p>
          <textarea v-model="applyMessage" placeholder="Disponible dès demain, je peux passer voir le souci." class="min-h-[70px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 py-3 text-sm outline-none" />
          <p v-if="applyError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ applyError }}</p>
          <CoreButton size="lg" full-width class="mt-4" :disabled="applying" @click="submitApply(selected)">{{ applying ? 'Envoi…' : 'Candidater et proposer un prix' }}</CoreButton>
        </template>

        <template v-else>
          <p v-if="selected.unit?.address" class="mb-0 mt-3 text-[13px] text-[var(--text-secondary)]">
            📍 {{ selected.unit.address }}
            <a v-if="mapsLink(selected)" :href="mapsLink(selected) ?? undefined" target="_blank" rel="noopener" class="ml-1 font-bold text-green-700 underline">Itinéraire</a>
          </p>
          <ArtisanOfferPanel v-if="selected.status === 'open'" :key="`o-${selected.id}`" :request="selected" side="artisan" @changed="reloadMine" />
          <div v-else-if="selected.status === 'agreed'" class="mt-4 rounded-md border border-info-border bg-info-bg p-4 text-[13.5px] text-info-fg-deep">Offre acceptée — en attente du paiement par le demandeur. Ne commencez pas avant le paiement : il vous est confirmé par notification.</div>
          <template v-else-if="selected.status === 'in_progress'">
            <div class="mt-4 rounded-md border border-ok-border bg-ok-bg p-4 text-[13px] text-green-900">
              Payée : la part immédiate est sur votre wallet<template v-if="Number(selected.retained_amount ?? 0) > 0">, {{ formatFcfa(Number(selected.retained_amount)) }} sont retenus jusqu'à la fin de la garantie</template>. Convenez du passage dans la conversation, puis marquez l'intervention terminée.
            </div>
            <CoreButton size="lg" full-width class="mt-3" @click="openTerminerModal(selected.id)">Marquer terminée</CoreButton>
          </template>
          <ArtisanDisputePanel v-else-if="selected.status === 'completed' || selected.status === 'closed'" :key="`d-${selected.id}`" :request="selected" side="artisan" @changed="reloadMine" />
          <div v-else class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4 text-[13.5px] text-[var(--text-secondary)]">Demande annulée par le demandeur.</div>
        </template>
        <div class="mt-3.5 flex items-center gap-3 rounded-md bg-[var(--surface-page)] px-3.5 py-3">
          <CoreAvatar :name="selected.requester ? [selected.requester.first_name, selected.requester.last_name].filter(Boolean).join(' ') || 'Demandeur' : 'Demandeur'" :size="34" color="var(--color-green-700)" />
          <div class="flex-1">
            <p class="m-0 text-[13px] font-bold">{{ selected.requester ? [selected.requester.first_name, selected.requester.last_name].filter(Boolean).join(' ') || 'Demandeur' : 'Demandeur' }}</p>
            <NuxtLink v-if="selected.conversation_id" :to="`/artisan/messages?conversation=${selected.conversation_id}`" class="mb-0 mt-0.5 block text-xs font-bold text-green-700 underline">Ouvrir la conversation</NuxtLink>
            <p v-else class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Pas encore de conversation</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
