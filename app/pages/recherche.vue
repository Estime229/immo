<script setup lang="ts">
import type { PropertySearchFilters, PropertySearchResult } from '~/types/property'
import { flattenSearchResults, type ListingCard } from '~/utils/propertyListing'
import { classifyRental, displayPrice, filterByRental, mapLimited, RENTAL_SUFFIX, type RentalKey, type RentalMode } from '~/utils/rentalMode'

const route = useRoute()
const router = useRouter()
const searchApi = usePropertySearchApi()
const refData = useReferenceData()
const favorites = usePropertyFavorites()
onMounted(favorites.ensureLoaded)

type SortMode = 'newest' | 'oldest' | 'price_asc' | 'price_desc'

const query = ref(String(route.query.q ?? ''))
const cityName = ref(String(route.query.city ?? ''))
const neighborhoodId = ref('')
const minBedrooms = ref('')
const waterSource = ref('')
const meterType = ref('')
const budget = ref(String(route.query.budget ?? ''))
const sort = ref<SortMode>('newest')
/** Passthrough depuis la page d'accueil (catégories) — pas de contrôle dans ce tiroir de filtres, juste un point d'entrée. */
const unitTypeId = ref(String(route.query.unit_type_id ?? ''))

const searchMode = ref<'filtres' | 'naturel'>('filtres')
const natural = ref('')
const naturalRun = ref(false)

const filtersOpen = ref(false)
const view = ref<'liste' | 'carte'>('liste')

/* ---- Référentiels réels (villes, quartiers, eau, compteur) ---- */
const cities = ref<{ id: string; name: string }[]>([])
const neighborhoods = ref<{ id: string; name: string }[]>([])
const waterOptions = ref<{ code: string; label: string }[]>([])
const meterOptions = ref<{ code: string; label: string }[]>([])
const unitTypeOptions = ref<{ id: string; label: string }[]>([])

onMounted(async () => {
  const [c, water, meter, unitTypes] = await Promise.all([refData.fetchCities(), refData.fetchRef('WATER_SOURCE'), refData.fetchRef('METER_TYPE'), refData.fetchRef('UNIT_TYPE')])
  cities.value = c
  waterOptions.value = water.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  meterOptions.value = meter.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  unitTypeOptions.value = unitTypes.map(e => ({ id: e.id, label: e.labels.fr ?? e.code }))
})

watch(cityName, async name => {
  neighborhoodId.value = ''
  const city = cities.value.find(c => c.name === name)
  neighborhoods.value = city ? await refData.fetchNeighborhoods(city.id) : []
})

const neighborhoodChips = computed(() => neighborhoods.value.map(n => ({ label: n.name, active: neighborhoodId.value === n.id, pick: () => { neighborhoodId.value = neighborhoodId.value === n.id ? '' : n.id } })))
const bedChips = computed(() => ([['', 'Toutes'], ['1', '1+'], ['2', '2+'], ['3', '3+']] as [string, string][])
  .map(([v, l]) => ({ label: l, active: v === '' ? !minBedrooms.value : minBedrooms.value === v, pick: () => { minBedrooms.value = v } })))
const waterChips = computed(() => [{ code: '', label: 'Toutes' }, ...waterOptions.value]
  .map(o => ({ label: o.label, active: waterSource.value === o.code, pick: () => { waterSource.value = o.code } })))
const meterChips = computed(() => [{ code: '', label: 'Tous' }, ...meterOptions.value]
  .map(o => ({ label: o.label, active: meterType.value === o.code, pick: () => { meterType.value = o.code } })))

const budgetSlider = computed({
  get: () => Number(budget.value.replace(/\D/g, '')) || 0,
  set: (v: number) => { budget.value = v === 0 ? '' : String(v) }
})
const budgetRangeLabel = computed(() => (budget.value ? `jusqu'à ${formatFcfa(Number(budget.value))}` : 'Tous les budgets'))

const activeChips = computed(() => {
  const items: { key: string; label: string; remove: () => void }[] = []
  if (cityName.value) items.push({ key: 'city', label: cityName.value, remove: () => { cityName.value = '' } })
  const nb = neighborhoods.value.find(n => n.id === neighborhoodId.value)
  if (nb) items.push({ key: 'neighborhood', label: nb.name, remove: () => { neighborhoodId.value = '' } })
  if (budget.value) items.push({ key: 'budget', label: `≤ ${formatFcfa(Number(budget.value))}`, remove: () => { budget.value = '' } })
  if (minBedrooms.value) items.push({ key: 'beds', label: `${minBedrooms.value}+ ch.`, remove: () => { minBedrooms.value = '' } })
  const w = waterOptions.value.find(o => o.code === waterSource.value)
  if (w) items.push({ key: 'water', label: w.label, remove: () => { waterSource.value = '' } })
  const m = meterOptions.value.find(o => o.code === meterType.value)
  if (m) items.push({ key: 'meter', label: `Compteur ${m.label.toLowerCase()}`, remove: () => { meterType.value = '' } })
  const ut = unitTypeOptions.value.find(o => o.id === unitTypeId.value)
  if (ut) items.push({ key: 'unitType', label: ut.label, remove: () => { unitTypeId.value = '' } })
  return items
})
const hasActiveChips = computed(() => activeChips.value.length > 0)
const filterCount = computed(() => activeChips.value.length)

function resetFilters() {
  cityName.value = ''
  neighborhoodId.value = ''
  minBedrooms.value = ''
  waterSource.value = ''
  meterType.value = ''
  budget.value = ''
  unitTypeId.value = ''
}

/* ---- Recherche en langage naturel (heuristique client, sur les vrais référentiels une fois chargés) ---- */
function parseNatural(text: string) {
  const t = text.toLowerCase()
  const out: { key: string; value: string; label: string }[] = []
  const city = cities.value.find(c => t.includes(c.name.toLowerCase()))
  if (city) out.push({ key: 'city', value: city.name, label: city.name })
  const m = t.match(/(\d)\s*chambre/)
  if (m) out.push({ key: 'beds', value: m[1]!, label: `${m[1]}+ chambres` })
  else if (/studio/.test(t)) out.push({ key: 'beds', value: '0', label: 'Studio' })
  const b = t.replace(/\s/g, '').match(/(\d{4,7})/)
  if (b) out.push({ key: 'budget', value: b[1]!, label: `Max ${formatFcfa(Number(b[1]))}` })
  return out
}
const naturalCriteria = computed(() => (naturalRun.value ? parseNatural(natural.value) : []))
const naturalUnderstood = computed(() => naturalRun.value && naturalCriteria.value.length > 0)
const naturalFailed = computed(() => naturalRun.value && naturalCriteria.value.length === 0)
const criteria = computed(() => naturalCriteria.value.map(c => ({
  label: c.label,
  remove: () => { if (c.key === 'city') cityName.value = ''; if (c.key === 'beds') minBedrooms.value = ''; if (c.key === 'budget') budget.value = '' }
})))
function runNatural() {
  naturalRun.value = true
  const crit = parseNatural(natural.value)
  resetFilters()
  query.value = ''
  crit.forEach(c => {
    if (c.key === 'city') cityName.value = c.value
    if (c.key === 'beds') minBedrooms.value = c.value
    if (c.key === 'budget') budget.value = c.value
  })
  runSearch()
}
function onNaturalKey(e: KeyboardEvent) {
  if (e.key === 'Enter') runNatural()
}

/* ---- Type de location : à la nuit / au mois ---- */
/**
 * `GET /property/search` ne sait pas filtrer par type de location — seule la
 * grille tarifaire de chaque unité le dit. En mode « Tous », la pagination
 * reste serveur et on classe seulement les unités affichées (pour le bon prix
 * et son unité). En mode « À la nuit » / « Au mois », on charge tout le
 * catalogue correspondant aux autres filtres, on classe chaque unité, puis on
 * filtre et pagine ici — le compteur reste exact au lieu de ne filtrer qu'une
 * page. Au-delà de CATALOG_CAP unités, le filtre ne couvre que les premières.
 */
type RentalFilter = 'tous' | RentalKey
const rentalMode = ref<RentalFilter>(route.query.mode === 'nuit' || route.query.mode === 'mois' ? route.query.mode : 'tous')
const modeByUnit = ref<Record<string, RentalMode>>({})
const CATALOG_PAGE = 100
const CATALOG_CAP = 300
const catalogTruncated = ref(false)
const visibleCount = ref(12)

async function classify(cards: ListingCard[]) {
  const todo = cards.filter(c => !modeByUnit.value[c.unitId])
  if (!todo.length) return
  const modes = await mapLimited(todo, 10, async c => {
    try {
      return classifyRental(await searchApi.fetchPricing(c.unitId), c.price)
    } catch {
      return null
    }
  })
  const next = { ...modeByUnit.value }
  todo.forEach((c, i) => { if (modes[i]) next[c.unitId] = modes[i]! })
  modeByUnit.value = next
}

const RENTAL_TILES: { key: RentalFilter; label: string; short: string; hint: string; image: string | null; pos: string; swatch: string }[] = [
  { key: 'tous', label: 'Tous les logements', short: 'Tous', hint: 'Nuit et mois confondus', image: null, pos: 'center', swatch: 'bg-sand-400' },
  { key: 'nuit', label: 'À la nuit', short: 'À la nuit', hint: 'Courte durée · meublé', image: 'url(/images/hero/hero-3.jpg)', pos: 'center 70%', swatch: 'bg-clay-500' },
  { key: 'mois', label: 'Au mois', short: 'Au mois', hint: 'Longue durée · bail signé', image: 'url(/images/hero/hero-1.jpg)', pos: '62% center', swatch: 'bg-green-700' }
]
function pickRental(key: RentalFilter) {
  if (rentalMode.value === key) return
  rentalMode.value = key
}

/* ---- Résultats réels ---- */
const rawResults = ref<(PropertySearchResult)[]>([])
const allCards = computed<ListingCard[]>(() => flattenSearchResults(rawResults.value))
const total = ref(0)
const page = ref(1)
const status = ref<'idle' | 'loading' | 'empty' | 'emptyFiltered' | 'error' | 'nominal'>('idle')

const filteredCards = computed(() => rentalMode.value === 'tous'
  ? []
  : filterByRental(allCards.value, modeByUnit.value, rentalMode.value, budget.value ? Number(budget.value) : null, sort.value))

const displayItems = computed<{ listing: ListingCard; suffix: string | undefined }[]>(() => {
  if (rentalMode.value === 'tous') {
    return allCards.value.map(c => {
      const d = displayPrice(modeByUnit.value[c.unitId], c.price)
      return { listing: { ...c, price: d.price }, suffix: d.suffix }
    })
  }
  const suffix = RENTAL_SUFFIX[rentalMode.value]
  return filteredCards.value.slice(0, visibleCount.value).map(c => ({ listing: c, suffix }))
})
const listings = computed<ListingCard[]>(() => displayItems.value.map(i => i.listing))
const shownTotal = computed(() => (rentalMode.value === 'tous' ? total.value : filteredCards.value.length))

function currentFilters(forCatalog = false): PropertySearchFilters {
  const f: PropertySearchFilters = { sort: sort.value, page: page.value, limit: forCatalog ? CATALOG_PAGE : 12 }
  if (query.value.trim()) f.q = query.value.trim()
  if (cityName.value) f.city = cityName.value
  if (neighborhoodId.value) f.neighborhood_id = neighborhoodId.value
  if (budget.value && !forCatalog) f.max_price = Number(budget.value)
  if (minBedrooms.value) f.min_bedrooms = Number(minBedrooms.value)
  if (waterSource.value) f.water_source = waterSource.value
  if (meterType.value) f.meter_type = meterType.value
  if (unitTypeId.value) f.unit_type_id = unitTypeId.value
  return f
}

function settleStatus() {
  const hasFilters = !!(query.value || cityName.value || neighborhoodId.value || budget.value || minBedrooms.value || waterSource.value || meterType.value || rentalMode.value !== 'tous')
  status.value = listings.value.length === 0 ? (hasFilters ? 'emptyFiltered' : 'empty') : 'nominal'
}

async function runSearch(append = false) {
  status.value = 'loading'
  try {
    if (rentalMode.value === 'tous') {
      const res = await searchApi.search(currentFilters())
      rawResults.value = append ? [...rawResults.value, ...(res.data as PropertySearchResult[])] : (res.data as PropertySearchResult[])
      total.value = res.total
      settleStatus()
      classify(allCards.value)
      return
    }
    rawResults.value = []
    const collected: PropertySearchResult[] = []
    let serverTotal = 0
    for (page.value = 1; collected.length < CATALOG_CAP; page.value++) {
      const res = await searchApi.search(currentFilters(true))
      collected.push(...(res.data as PropertySearchResult[]))
      serverTotal = res.total
      if (collected.length >= res.total || res.data.length < CATALOG_PAGE) break
    }
    catalogTruncated.value = serverTotal > collected.length
    await classify(flattenSearchResults(collected))
    rawResults.value = collected
    visibleCount.value = 12
    settleStatus()
  } catch {
    status.value = 'error'
  }
}
function search() {
  page.value = 1
  runSearch()
}
function loadMore() {
  if (rentalMode.value !== 'tous') {
    visibleCount.value += 12
    return
  }
  page.value += 1
  runSearch(true)
}
onMounted(() => runSearch())
watch(sort, () => search())
watch(rentalMode, key => {
  router.replace({ query: { ...route.query, mode: key === 'tous' ? undefined : key } })
  search()
})

const resultCount = computed(() => (shownTotal.value > 1 ? `${shownTotal.value} logements disponibles` : `${shownTotal.value} logement disponible`))
const resultShort = computed(() => (shownTotal.value > 1 ? `${shownTotal.value} logements` : `${shownTotal.value} logement`))

const hoveredId = ref<string | null>(null)
function openListing(l: ListingCard) {
  if (l.virtual || !l.propertyId) return
  navigateTo(`/biens/${l.propertyId}?unit=${l.unitId}`)
}
async function onFavorite(l: ListingCard) {
  if (!l.propertyId) return
  const ok = await favorites.toggleProperty(l.propertyId)
  if (!ok && !useApiAuth().isAuthenticated()) navigateTo('/connexion')
}

/* ---- Vue carte : pins positionnés sur les vraies coordonnées GPS quand elles existent ---- */
const geoPoints = computed(() => {
  const pts = rawResults.value
    .filter(p => p.gps_latitude && p.gps_longitude)
    .map(p => ({ id: p.id, lat: Number(p.gps_latitude), lng: Number(p.gps_longitude), listing: listings.value.find(l => l.propertyId === p.id) }))
    .filter(p => p.listing)
  if (!pts.length) return []
  const lats = pts.map(p => p.lat)
  const lngs = pts.map(p => p.lng)
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)]
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)]
  const norm = (v: number, min: number, max: number) => (max === min ? 50 : 10 + ((v - min) / (max - min)) * 80)
  return pts.map(p => ({ id: p.listing!.unitId, x: norm(p.lng, minLng, maxLng), y: 100 - norm(p.lat, minLat, maxLat), listing: p.listing! }))
})
</script>

<template>
  <div class="mx-auto max-w-[1240px] px-[26px] pb-[60px] pt-6">
    <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-card sm:p-6">
      <div class="mb-4 flex flex-wrap items-baseline justify-between gap-5">
        <div class="flex items-baseline gap-3">
          <h1 class="m-0 font-display text-2xl font-bold tracking-[-.03em]">Rechercher un logement</h1>
          <span class="text-[13.5px] font-semibold text-[var(--text-muted)]">{{ resultCount }}</span>
        </div>
        <div class="flex gap-[22px]">
          <button type="button" class="border-b-2 pb-2 text-sm font-bold transition-colors" :class="searchMode === 'filtres' ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)]'" @click="searchMode = 'filtres'">Par filtres</button>
          <button type="button" class="border-b-2 pb-2 text-sm font-bold transition-colors" :class="searchMode === 'naturel' ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)]'" @click="searchMode = 'naturel'">Décrire ma recherche</button>
        </div>
      </div>

      <div class="mb-4 grid grid-cols-3 gap-2 sm:gap-3" role="radiogroup" aria-label="Type de location">
        <button
          v-for="t in RENTAL_TILES"
          :key="t.key"
          type="button"
          role="radio"
          :aria-checked="rentalMode === t.key"
          class="group relative flex min-h-[64px] items-stretch overflow-hidden rounded-xl border-[1.5px] bg-white text-left transition-all sm:min-h-[82px]"
          :class="rentalMode === t.key ? 'border-green-600 shadow-[0_0_0_3px_var(--color-green-100)]' : 'border-[var(--border-default)] hover:border-green-400'"
          @click="pickRental(t.key)"
        >
          <span class="relative hidden w-[82px] flex-none overflow-hidden sm:block">
            <span v-if="t.image" class="absolute inset-0 bg-cover bg-no-repeat transition-transform duration-500 group-hover:scale-105" :style="{ backgroundImage: t.image, backgroundPosition: t.pos }" />
            <span v-else class="absolute inset-0 grid grid-cols-2">
              <span class="bg-cover bg-no-repeat" style="background-image: url(/images/hero/hero-3.jpg); background-position: 30% 70%" />
              <span class="bg-cover bg-no-repeat" style="background-image: url(/images/hero/hero-1.jpg); background-position: 70% center" />
            </span>
            <span class="absolute inset-x-0 bottom-0 h-[5px]" :class="t.swatch" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col justify-center px-3 py-2.5 sm:px-4">
            <span class="flex items-center gap-1.5">
              <span class="h-2 w-2 flex-none rounded-pill sm:hidden" :class="t.swatch" />
              <span class="truncate text-[13px] font-bold text-[var(--text-primary)] sm:text-[15px]"><span class="sm:hidden">{{ t.short }}</span><span class="hidden sm:inline">{{ t.label }}</span></span>
            </span>
            <span class="mt-0.5 hidden truncate text-[12.5px] text-[var(--text-muted)] sm:block">{{ t.hint }}</span>
          </span>
          <span v-if="rentalMode === t.key" class="absolute right-2 top-2 hidden h-5 w-5 sm:grid place-items-center rounded-pill bg-green-600 text-[11px] font-black text-white">✓</span>
        </button>
      </div>

      <template v-if="searchMode === 'filtres'">
        <div class="flex flex-col gap-1.5 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-page)] p-[5px] shadow-hairline sm:flex-row sm:items-stretch sm:gap-0 sm:rounded-pill">
          <label class="flex flex-1 items-center gap-[11px] px-5">
            <span class="h-4 w-4 flex-none rounded-pill border-2 border-clay-500" />
            <input v-model="query" placeholder="Nom, ville, description…" class="h-[46px] w-full border-0 bg-transparent text-[15px] font-semibold outline-none" @keydown.enter="search">
          </label>
          <div class="mx-2 h-px bg-[var(--border-default)] sm:mx-0 sm:my-2 sm:h-auto sm:w-px" />
          <select v-model="sort" class="h-[46px] cursor-pointer border-0 bg-transparent px-5 text-[13.5px] font-bold text-sand-900 outline-none sm:h-auto sm:px-4">
            <option value="newest">Plus récent</option>
            <option value="oldest">Plus ancien</option>
            <option value="price_asc">Prix ↑</option>
            <option value="price_desc">Prix ↓</option>
          </select>
          <div class="flex gap-1.5 sm:contents">
            <button type="button" class="flex h-[46px] flex-1 items-center justify-center gap-[9px] rounded-pill px-5 text-sm font-bold transition-all sm:flex-none sm:justify-start" :class="filtersOpen ? 'bg-green-600 text-white' : 'bg-transparent text-sand-900'" @click="filtersOpen = true">
              <span class="flex flex-col gap-[2.5px]"><span class="h-0.5 w-[15px] rounded-sm bg-current" /><span class="h-0.5 w-[10px] rounded-sm bg-current" /><span class="h-0.5 w-[13px] rounded-sm bg-current" /></span>
              Filtres
              <span v-if="filterCount" class="grid h-5 min-w-[20px] place-items-center rounded-pill bg-white px-1.5 text-[11.5px] font-black text-green-700">{{ filterCount }}</span>
            </button>
            <button type="button" class="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-pill bg-[image:var(--action-primary)] px-6 text-sm font-bold text-white shadow-action sm:flex-none" @click="search">
              <span class="h-3.5 w-3.5 flex-none rounded-pill border-2 border-white" />Rechercher
            </button>
          </div>
        </div>
        <div v-if="hasActiveChips" class="mt-3.5 flex flex-wrap items-center gap-2">
          <span v-for="chip in activeChips" :key="chip.key" class="inline-flex items-center gap-[9px] rounded-pill border border-green-100 bg-green-50 px-3.5 py-2 text-[13px] font-bold text-green-800">{{ chip.label }}<span class="cursor-pointer text-xs text-green-600" @click="chip.remove(); search()">✕</span></span>
          <button type="button" class="text-[13px] font-bold text-[var(--text-muted)] underline" @click="resetFilters(); search()">Tout effacer</button>
        </div>
      </template>

      <template v-if="filtersOpen">
        <div class="fixed inset-0 z-[80] animate-[im-veil_.25s_ease_both] bg-black/[.42] backdrop-blur-[3px]" @click="filtersOpen = false" />
        <aside class="fixed inset-y-0 left-0 z-[81] flex w-[430px] max-w-[90vw] animate-[im-slide-left_.32s_var(--ease-standard)_both] flex-col bg-[var(--surface-page)] shadow-[20px_0_60px_rgba(26,23,20,.24)]">
          <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-7 py-6">
            <div>
              <h3 class="m-0 font-display text-[22px] font-bold tracking-[-.025em]">Affiner la recherche</h3>
              <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">{{ resultCount }}</p>
            </div>
            <button type="button" class="grid h-[38px] w-[38px] place-items-center rounded-pill bg-sand-200 text-base text-sand-800" @click="filtersOpen = false">✕</button>
          </div>

          <div class="flex flex-1 flex-col gap-[30px] overflow-y-auto px-7 py-[26px]">
            <div>
              <p class="mb-[13px] mt-0 text-[13px] font-black tracking-[.03em]">Ville</p>
              <select v-model="cityName" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
                <option value="">Toutes les villes</option>
                <option v-for="c in cities" :key="c.id" :value="c.name">{{ c.name }}</option>
              </select>
            </div>

            <div v-if="neighborhoodChips.length">
              <p class="mb-[13px] mt-0 text-[13px] font-black tracking-[.03em]">Quartier</p>
              <div class="flex flex-wrap gap-[9px]">
                <button v-for="c in neighborhoodChips" :key="c.label" type="button" class="rounded-pill border px-[15px] py-[9px] text-[13px] font-semibold transition-all" :class="c.active ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'" @click="c.pick">{{ c.label }}</button>
              </div>
            </div>

            <div>
              <div class="mb-3.5 flex items-baseline justify-between">
                <p class="m-0 text-[13px] font-black tracking-[.03em]">{{ rentalMode === 'nuit' ? 'Budget par nuit' : 'Budget mensuel' }}</p>
                <span class="font-mono text-[13.5px] font-bold text-green-700">{{ budgetRangeLabel }}</span>
              </div>
              <input v-model.number="budgetSlider" type="range" min="0" :max="rentalMode === 'nuit' ? 100000 : 500000" :step="rentalMode === 'nuit' ? 1000 : 10000" class="w-full accent-green-600">
              <div class="mt-1.5 flex justify-between font-mono text-[11px] text-[var(--text-faint)]"><span>0 F</span><span>{{ rentalMode === 'nuit' ? '100 000 F' : '500 000 F' }}</span></div>
            </div>

            <div>
              <p class="mb-[13px] mt-0 text-[13px] font-black tracking-[.03em]">Chambres minimum</p>
              <div class="flex gap-[9px]">
                <button v-for="c in bedChips" :key="c.label" type="button" class="flex-1 rounded-md border py-3 text-sm font-bold transition-all" :class="c.active ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'" @click="c.pick">{{ c.label }}</button>
              </div>
            </div>

            <div>
              <p class="mb-[13px] mt-0 text-[13px] font-black tracking-[.03em]">Source d'eau</p>
              <div class="flex flex-wrap gap-[9px]">
                <button v-for="c in waterChips" :key="c.label" type="button" class="rounded-md border px-3 py-[11px] text-[13px] font-semibold transition-all" :class="c.active ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'" @click="c.pick">{{ c.label }}</button>
              </div>
            </div>

            <div>
              <p class="mb-[13px] mt-0 text-[13px] font-black tracking-[.03em]">Compteur électrique</p>
              <div class="flex flex-wrap gap-[9px]">
                <button v-for="c in meterChips" :key="c.label" type="button" class="rounded-md border px-3 py-[11px] text-[13px] font-semibold transition-all" :class="c.active ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'" @click="c.pick">{{ c.label }}</button>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3.5 border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-7 py-[18px]">
            <button type="button" class="text-sm font-bold text-[var(--text-muted)] underline" @click="resetFilters">Tout effacer</button>
            <button type="button" class="flex-1 rounded-md bg-[image:var(--action-primary)] py-[15px] text-[15px] font-bold text-white shadow-action" @click="filtersOpen = false; search()">Voir {{ resultShort }}</button>
          </div>
        </aside>
      </template>

      <div v-if="searchMode === 'naturel'" class="mt-4.5 rounded-lg border border-clay-200 bg-white p-[18px]">
        <div class="flex gap-2.5">
          <input v-model="natural" placeholder="studio calme à Calavi vers 40 000" class="h-[54px] flex-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[18px] text-base outline-none" @keydown="onNaturalKey">
          <button type="button" class="rounded-md bg-[image:var(--action-primary)] px-7 text-[15px] font-bold text-white shadow-action" @click="runNatural">Rechercher</button>
        </div>
        <div v-if="naturalUnderstood" class="mt-4 flex flex-wrap items-center gap-[9px]">
          <span class="text-[13.5px] text-[var(--text-muted)]">Nous avons compris :</span>
          <span v-for="c in criteria" :key="c.label" class="inline-flex items-center gap-[9px] rounded-pill border border-green-100 bg-green-50 px-3.5 py-2 text-[13.5px] font-bold text-green-800">{{ c.label }}<span class="cursor-pointer text-xs text-green-600" @click="c.remove(); search()">✕</span></span>
        </div>
        <div v-if="naturalFailed" class="mt-4 rounded-md border border-dashed border-[var(--border-default)] bg-[var(--surface-page)] p-7 text-center">
          <p class="m-0 text-base font-bold">Nous n'avons pas compris votre demande</p>
          <p class="mb-4 mt-2 text-sm text-[var(--text-muted)]">Précisez une ville, un nombre de chambres ou un budget — par exemple « 2 chambres à Cotonou sous 100 000 ».</p>
          <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-[22px] py-3 text-sm font-bold" @click="searchMode = 'filtres'">Utiliser plutôt les filtres</button>
        </div>
      </div>
    </div>

    <div class="my-4 flex items-center justify-between">
      <p class="m-0 text-[14.5px] font-semibold text-[var(--text-secondary)]">{{ resultCount }}</p>
      <div class="flex gap-1 rounded-pill bg-sand-200 p-1">
        <button type="button" class="rounded-pill px-4 py-2 text-[12.5px] font-bold transition-all" :class="view === 'liste' ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'" @click="view = 'liste'">Liste</button>
        <button type="button" class="rounded-pill px-4 py-2 text-[12.5px] font-bold transition-all" :class="view === 'carte' ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'" @click="view = 'carte'">Carte</button>
      </div>
    </div>

    <template v-if="status === 'loading' && !listings.length">
      <p v-if="rentalMode !== 'tous'" class="mb-3.5 mt-0 text-[13px] font-semibold text-[var(--text-muted)]">Tri des logements {{ rentalMode === 'nuit' ? 'à la nuit' : 'au mois' }} d'après leurs grilles tarifaires…</p>
      <div class="grid grid-cols-1 gap-[22px] sm:grid-cols-3">
        <DataSkeletonCard v-for="i in 6" :key="i" :height="186" :lines="1" />
      </div>
    </template>

    <FeedbackAlertBanner v-else-if="status === 'error'" tone="danger">
      Impossible de charger les résultats pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="search">Réessayer</button>
    </FeedbackAlertBanner>

    <FeedbackEmptyState v-else-if="status === 'emptyFiltered'" title="Aucun logement pour ces critères" description="Élargissez votre budget ou changez de ville." action-label="Réinitialiser les filtres" @action="resetFilters(); search()" />

    <FeedbackEmptyState v-else-if="status === 'empty'" title="Aucune annonce publiée pour l'instant" description="Les premiers logements arrivent bientôt." />

    <template v-else>
      <div class="grid items-start gap-[22px]" :class="view === 'carte' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'">
        <div class="grid grid-cols-1 gap-[22px] sm:grid-cols-2" :class="view === 'carte' ? '' : 'lg:grid-cols-3'">
          <SearchPropertyCard
            v-for="item in displayItems"
            :key="item.listing.unitId"
            :listing="item.listing"
            :price-suffix="item.suffix"
            :favorite="item.listing.propertyId ? favorites.isFavoriteProperty(item.listing.propertyId) : false"
            @open="openListing(item.listing)"
            @favorite="onFavorite(item.listing)"
            @hover="hoveredId = item.listing.unitId"
            @unhover="hoveredId = null"
          />
        </div>
        <div v-if="view === 'carte'" class="sticky top-[94px] h-[560px] overflow-hidden rounded-2xl border border-[var(--border-default)]" style="background-image: radial-gradient(60% 60% at 30% 25%, #e7f0e8, transparent), linear-gradient(150deg, var(--color-sand-200), #e4ecdf 60%, #dfe9ef)">
          <div class="absolute inset-0 opacity-45" style="background-image: linear-gradient(var(--border-default) 1px, transparent 1px), linear-gradient(90deg, var(--border-default) 1px, transparent 1px); background-size: 66px 66px" />
          <p v-if="!geoPoints.length" class="relative z-[1] flex h-full items-center justify-center px-8 text-center text-[13.5px] text-[var(--text-muted)]">Aucune coordonnée disponible pour ces résultats.</p>
          <div
            v-for="p in geoPoints"
            :key="p.id"
            class="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
            :style="{ left: `${p.x}%`, top: `${p.y}%`, zIndex: hoveredId === p.id ? 5 : 1 }"
            @click="openListing(p.listing)"
            @mouseenter="hoveredId = p.id"
            @mouseleave="hoveredId = null"
          >
            <div class="whitespace-nowrap rounded-pill px-3.5 py-2.5 font-mono text-[12.5px] font-bold transition-all" :class="hoveredId === p.id ? 'scale-110 bg-green-900 text-white shadow-[0_10px_24px_rgba(18,60,41,.4)]' : 'scale-100 bg-white text-[var(--text-primary)] shadow-[0_3px_10px_rgba(26,23,20,.2)]'">{{ Math.round(p.listing.price / 1000) }}k</div>
          </div>
        </div>
      </div>
      <p v-if="rentalMode !== 'tous' && catalogTruncated" class="mb-0 mt-5 text-center text-[12.5px] text-[var(--text-faint)]">Le tri par type de location couvre les {{ CATALOG_CAP }} logements les plus pertinents — affinez par ville ou budget pour aller plus loin.</p>
      <div v-if="listings.length < shownTotal" class="mt-[34px] flex justify-center">
        <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-7 py-[13px] text-sm font-bold" :disabled="status === 'loading'" @click="loadMore">{{ status === 'loading' ? 'Chargement…' : 'Afficher plus de logements' }}</button>
      </div>
    </template>
  </div>
</template>
