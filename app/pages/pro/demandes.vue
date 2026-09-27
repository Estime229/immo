<script setup lang="ts">
import type { HousingRequestOpenItem } from '~/types/tenant'
import type { PropertySearchResult } from '~/types/property'
import { REQUEST_FREQUENCY_LABEL, daysAgoLabel, requestBudgetLabel, type AnsweredEntry } from '~/utils/housingRequest'

definePageMeta({ layout: 'pro' })

const housingRequestsApi = useHousingRequestsApi()
const landlordPropertiesApi = useLandlordPropertiesApi()
const refData = useReferenceData()
const currentUser = useAuthUser()

/* ---- Filtres réellement appliqués par l'API (ville, type de location) + pagination ---- */
const cityId = ref('')
const frequency = ref('')
const cities = ref<{ id: string; name: string }[]>([])
const items = ref<HousingRequestOpenItem[]>([])
const total = ref(0)
const page = ref(1)
const state = ref<'loading' | 'error' | 'success'>('loading')
const loadingMore = ref(false)
const PAGE_SIZE = 24

async function load(reset = true) {
  if (reset) {
    page.value = 1
    state.value = 'loading'
  } else {
    loadingMore.value = true
  }
  try {
    const res = await housingRequestsApi.fetchOpen({ city_id: cityId.value || undefined, desired_billing_frequency: frequency.value || undefined, page: page.value, limit: PAGE_SIZE })
    items.value = reset ? res.data : [...items.value, ...res.data]
    total.value = res.total
    state.value = 'success'
  } catch {
    if (reset) state.value = 'error'
  } finally {
    loadingMore.value = false
  }
}
function loadMore() {
  page.value++
  load(false)
}
watch([cityId, frequency], () => load(true))
onMounted(async () => {
  load(true)
  try {
    cities.value = await refData.fetchCities()
  } catch {
    cities.value = []
  }
})

/**
 * Unités proposables : on charge les biens du propriétaire. Une unité occupée
 * est refusée côté écran — l'API l'accepte (constaté en live), mais proposer
 * un logement indisponible fait perdre du temps au locataire.
 */
const myUnits = ref<{ id: string; label: string; price: number; occupied: boolean }[]>([])
const unitsLoaded = ref(false)
onMounted(async () => {
  try {
    const res = await landlordPropertiesApi.fetchMine({ limit: 100 })
    myUnits.value = (res.data as PropertySearchResult[]).flatMap(p =>
      (p.units ?? []).map(u => ({ id: u.id, label: `${u.name} — ${p.name}`, price: Number(u.price), occupied: u.unit_status === 'occupied' }))
    )
  } catch {
    myUnits.value = []
  } finally {
    unitsLoaded.value = true
  }
})

/**
 * L'API ne dit pas à un propriétaire à quelles demandes il a déjà répondu
 * (aucune route « mes réponses », BACKEND-ISSUES #34) : on le mémorise sur
 * cet appareil, avec les unités proposées et la conversation ouverte.
 */
const answered = ref<Record<string, AnsweredEntry>>({})
function storageKey() {
  return `immo:answered-requests:${currentUser.value?.id ?? 'anon'}`
}
onMounted(() => {
  try {
    answered.value = JSON.parse(localStorage.getItem(storageKey()) ?? '{}') as Record<string, AnsweredEntry>
  } catch {
    answered.value = {}
  }
})
function onAnswered(payload: { requestId: string; unitId: string; conversationId: string | null }) {
  const prev = answered.value[payload.requestId] ?? { unitIds: [], conversationId: null }
  answered.value = {
    ...answered.value,
    [payload.requestId]: { unitIds: [...new Set([...prev.unitIds, payload.unitId])], conversationId: payload.conversationId ?? prev.conversationId }
  }
  try {
    localStorage.setItem(storageKey(), JSON.stringify(answered.value))
  } catch {
    // stockage indisponible : l'état reste valable pour cette visite
  }
}

const selected = ref<HousingRequestOpenItem | null>(null)
function requesterName(r: HousingRequestOpenItem) {
  return r.requester_display_name ?? 'Locataire'
}
function criteriaLine(r: HousingRequestOpenItem) {
  return [r.desired_billing_frequency ? REQUEST_FREQUENCY_LABEL[r.desired_billing_frequency] : '', r.neighborhood?.name, r.city?.name].filter(Boolean).join(' · ')
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <p class="mb-4 mt-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
      Recherches publiées par des locataires. Proposez un de vos logements libres : une conversation s'ouvre avec le locataire, qui est notifié.
    </p>

    <div class="mb-4.5 flex flex-wrap items-center gap-2.5">
      <select v-model="cityId" aria-label="Ville" class="h-10 rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900">
        <option value="">Toutes les villes</option>
        <option v-for="c in cities" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <div class="flex gap-1 rounded-pill bg-sand-200 p-1">
        <button
          v-for="f in [{ v: '', l: 'Tout' }, { v: 'monthly', l: 'Au mois' }, { v: 'daily', l: 'À la nuit' }]"
          :key="f.v"
          type="button"
          class="rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold"
          :class="frequency === f.v ? 'bg-white text-green-900 shadow-card' : 'text-[var(--text-secondary)]'"
          @click="frequency = f.v"
        >{{ f.l }}</button>
      </div>
      <span v-if="state === 'success'" class="text-[12.5px] text-[var(--text-muted)]">{{ total }} demande{{ total > 1 ? 's' : '' }} ouverte{{ total > 1 ? 's' : '' }}</span>
    </div>
    <p v-if="cityId || frequency" class="-mt-2 mb-4 text-[12px] text-[var(--text-faint)]">Les demandes sans ville ou sans type de location précisés n'apparaissent pas avec ce filtre.</p>

    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="150" :lines="2" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger les demandes pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load(true)">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="!items.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      {{ cityId || frequency ? 'Aucune demande ouverte pour ces critères.' : 'Aucune demande ouverte pour l\'instant.' }}
    </p>

    <template v-else>
      <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <button
          v-for="r in items"
          :key="r.id"
          type="button"
          class="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-white p-4.5 text-left transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-0.5 hover:shadow-raised"
          @click="selected = r"
        >
          <div class="flex items-center gap-3">
            <CoreAvatar :name="requesterName(r)" :size="38" color="var(--color-info-fg)" />
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-[14.5px] font-bold">{{ requesterName(r) }}</p>
              <p class="mb-0 mt-0.5 font-mono text-[12.5px] text-[var(--text-muted)]">{{ requestBudgetLabel(r) ?? 'Budget non précisé' }}</p>
            </div>
            <span class="flex-none text-[11.5px] text-[var(--text-faint)]">{{ daysAgoLabel(r.created_at) }}</span>
          </div>
          <p v-if="criteriaLine(r)" class="mb-0 mt-2.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">{{ criteriaLine(r) }}</p>
          <p class="mb-0 mt-2 line-clamp-3 flex-1 text-[13.5px] leading-[1.55] text-[var(--text-secondary)] [overflow-wrap:anywhere]">« {{ r.description }} »</p>
          <div class="mt-3.5 flex items-center justify-between border-t border-sand-200 pt-3">
            <CoreBadge v-if="answered[r.id]" tone="ok">✓ Déjà proposé</CoreBadge>
            <CoreBadge v-else tone="neutral">Recherche ouverte</CoreBadge>
            <span class="text-[12.5px] font-bold text-green-700">Voir le détail →</span>
          </div>
        </button>
      </div>
      <div v-if="items.length < total" class="mt-4.5 text-center">
        <CoreButton tone="secondary" :disabled="loadingMore" @click="loadMore">{{ loadingMore ? 'Chargement…' : `Voir plus (${total - items.length} restantes)` }}</CoreButton>
      </div>
    </template>

    <ProHousingRequestDetailModal
      v-if="selected"
      :request="selected"
      :my-units="myUnits"
      :units-loaded="unitsLoaded"
      :answered="answered[selected.id] ?? null"
      @close="selected = null"
      @answered="onAnswered"
    />
  </div>
</template>
