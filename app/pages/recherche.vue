<script setup lang="ts">
import { Check, House, LoaderCircle, RefreshCw, Search, SearchX, SlidersHorizontal, X } from '@lucide/vue'
import type { PropertySearchFilters, PropertySearchResult } from '~/types/property'
import { flattenSearchResults, type ListingCard } from '~/utils/propertyListing'
import { resolveLocation, type MapMarker } from '~/utils/geo'
import { classifyRental, displayPrice, filterByRental, mapLimited, RENTAL_SUFFIX, type RentalKey, type RentalMode } from '~/utils/rentalMode'
import { filtersFromQuery, filtersToQuery, rememberSearch, sameSearch, SEARCH_QUERY_KEYS, searchPath, type SearchFiltersState, type SearchSort, type SearchView } from '~/utils/searchPill'

const route = useRoute()
const router = useRouter()
const searchApi = usePropertySearchApi()
const refData = useReferenceData()
const favorites = usePropertyFavorites()
onMounted(favorites.ensureLoaded)

/**
 * Tous les critères vivent dans l'URL (`utils/searchPill.ts`) : rechargement,
 * lien partagé et retour depuis une fiche gardent la recherche. Avant, seul
 * `mode` y était ; un `?budget=100 000 F` venu de l'accueil donnait « ≤ NaN ».
 */
const initial = filtersFromQuery(route.query)

const query = ref(initial.q)
const cityName = ref(initial.city)
const neighborhoodId = ref(initial.neighborhood)
const minBedrooms = ref(initial.bedrooms)
const waterSource = ref(initial.water)
const meterType = ref(initial.meter)
const budget = ref(initial.budget)
const sort = ref<SearchSort>(initial.sort)
/** Point d'entrée depuis les catégories de l'accueil — pas de contrôle dans le tiroir, mais une pastille retirable. */
const unitTypeId = ref(initial.unitType)

const searchMode = ref<'filtres' | 'naturel'>('filtres')
const natural = ref('')
const naturalRun = ref(false)

const filtersOpen = ref(false)
const view = ref<SearchView>(initial.view)

/* ---- Référentiels réels (villes, quartiers, eau, compteur) ---- */
const cities = ref<{ id: string; name: string }[]>([])
const neighborhoods = ref<{ id: string; name: string }[]>([])
const waterOptions = ref<{ code: string; label: string }[]>([])
const meterOptions = ref<{ code: string; label: string }[]>([])
const unitTypeOptions = ref<{ id: string; label: string }[]>([])

async function loadNeighborhoods(name: string) {
  const city = cities.value.find(c => c.name === name)
  try {
    neighborhoods.value = city ? await refData.fetchNeighborhoods(city.id) : []
  } catch {
    neighborhoods.value = []
  }
}

onMounted(async () => {
  try {
    const [c, water, meter, unitTypes] = await Promise.all([refData.fetchCities(), refData.fetchRef('WATER_SOURCE'), refData.fetchRef('METER_TYPE'), refData.fetchRef('UNIT_TYPE')])
    cities.value = c
    waterOptions.value = water.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
    meterOptions.value = meter.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
    unitTypeOptions.value = unitTypes.map(e => ({ id: e.id, label: e.labels.fr ?? e.code }))
  } catch {
    // Sans référentiels, le tiroir propose moins de choix : la recherche, elle, fonctionne.
  }
  // Quartier venu de l'URL : la liste de la ville est chargée sans effacer le choix.
  if (cityName.value) loadNeighborhoods(cityName.value)
})

/** Changer de ville efface le quartier — sauf quand la ville et le quartier arrivent ensemble par l'URL. */
let keepNeighborhood = false
watch(cityName, name => {
  if (!keepNeighborhood) neighborhoodId.value = ''
  keepNeighborhood = false
  loadNeighborhoods(name)
})

const neighborhoodChips = computed(() => neighborhoods.value.map(n => ({ label: n.name, active: neighborhoodId.value === n.id, pick: () => { neighborhoodId.value = neighborhoodId.value === n.id ? '' : n.id } })))
const bedChips = computed(() => ([['', 'Toutes'], ['1', '1+'], ['2', '2+'], ['3', '3+']] as [string, string][])
  .map(([v, l]) => ({ label: l, active: v === '' ? !minBedrooms.value : minBedrooms.value === v, pick: () => { minBedrooms.value = v } })))
const waterChips = computed(() => [{ code: '', label: 'Toutes' }, ...waterOptions.value]
  .map(o => ({ label: o.label, active: waterSource.value === o.code, pick: () => { waterSource.value = o.code } })))
const meterChips = computed(() => [{ code: '', label: 'Tous' }, ...meterOptions.value]
  .map(o => ({ label: o.label, active: meterType.value === o.code, pick: () => { meterType.value = o.code } })))

const budgetSlider = computed({
  get: () => Number(budget.value) || 0,
  set: (v: number) => { budget.value = v === 0 ? '' : String(v) }
})
const budgetRangeLabel = computed(() => (budget.value ? `jusqu'à ${formatFcfa(Number(budget.value))}` : 'Tous les budgets'))

const activeChips = computed(() => {
  const items: { key: string; label: string; remove: () => void }[] = []
  if (cityName.value) items.push({ key: 'city', label: cityName.value, remove: () => { cityName.value = '' } })
  const nb = neighborhoods.value.find(n => n.id === neighborhoodId.value)
  if (nb) items.push({ key: 'neighborhood', label: nb.name, remove: () => { neighborhoodId.value = '' } })
  if (budget.value) items.push({ key: 'budget', label: `≤ ${formatFcfa(Number(budget.value))}`, remove: () => { budget.value = '' } })
  if (minBedrooms.value && minBedrooms.value !== '0') items.push({ key: 'beds', label: `${minBedrooms.value}+ ch.`, remove: () => { minBedrooms.value = '' } })
  const w = waterOptions.value.find(o => o.code === waterSource.value)
  if (w) items.push({ key: 'water', label: w.label, remove: () => { waterSource.value = '' } })
  const m = meterOptions.value.find(o => o.code === meterType.value)
  if (m) items.push({ key: 'meter', label: `Compteur ${m.label.toLowerCase()}`, remove: () => { meterType.value = '' } })
  if (unitTypeId.value) {
    const ut = unitTypeOptions.value.find(o => o.id === unitTypeId.value)
    items.push({ key: 'unitType', label: ut?.label ?? 'Type de logement', remove: () => { unitTypeId.value = '' } })
  }
  return items
})
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
  search()
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
const rentalMode = ref<RentalFilter>(initial.mode)
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
  search()
}

/** Le tri relance la recherche ; passé par ce modèle pour ne pas relancer quand l'URL le change (elle relance déjà). */
const sortModel = computed<SearchSort>({
  get: () => sort.value,
  set: v => { sort.value = v; search() }
})

const SEARCH_TABS = [{ value: 'filtres', label: 'Par filtres' }, { value: 'naturel', label: 'Décrire ma recherche' }]
const VIEW_TABS = [{ value: 'liste', label: 'Liste' }, { value: 'carte', label: 'Carte' }]

/* ---- Résultats réels ---- */
const rawResults = ref<(PropertySearchResult)[]>([])
const allCards = computed<ListingCard[]>(() => flattenSearchResults(rawResults.value))
const total = ref(0)
const page = ref(1)
const status = ref<'idle' | 'loading' | 'empty' | 'emptyFiltered' | 'error' | 'nominal'>('idle')
const loadingMore = ref(false)
const loadMoreError = ref(false)

/** Critères de la dernière recherche lancée — ceux de l'URL et des résultats affichés. */
const applied = ref<SearchFiltersState>({ ...initial })

function currentState(): SearchFiltersState {
  return {
    q: query.value,
    city: cityName.value,
    neighborhood: neighborhoodId.value,
    bedrooms: minBedrooms.value,
    water: waterSource.value,
    meter: meterType.value,
    budget: budget.value,
    sort: sort.value,
    unitType: unitTypeId.value,
    mode: rentalMode.value,
    view: view.value
  }
}

function applyState(f: SearchFiltersState) {
  if (f.city !== cityName.value) keepNeighborhood = true
  query.value = f.q
  cityName.value = f.city
  neighborhoodId.value = f.neighborhood
  minBedrooms.value = f.bedrooms
  waterSource.value = f.water
  meterType.value = f.meter
  budget.value = f.budget
  sort.value = f.sort
  unitTypeId.value = f.unitType
  rentalMode.value = f.mode
  view.value = f.view
}

/** Écrit la recherche lancée dans l'URL (sans entrée d'historique) et la mémorise pour « ← Résultats » de la fiche. */
function syncUrl() {
  const next = filtersToQuery({ ...applied.value, view: view.value })
  rememberSearch(searchPath(next))
  const others = Object.fromEntries(Object.entries(route.query).filter(([k]) => !(SEARCH_QUERY_KEYS as readonly string[]).includes(k)))
  const target = { ...others, ...next }
  const keys = new Set([...Object.keys(target), ...Object.keys(route.query)])
  const same = [...keys].every(k => String(target[k as keyof typeof target] ?? '') === String(route.query[k] ?? ''))
  if (!same) router.replace({ query: target })
}

const filteredCards = computed(() => applied.value.mode === 'tous'
  ? []
  : filterByRental(allCards.value, modeByUnit.value, applied.value.mode, applied.value.budget ? Number(applied.value.budget) : null, applied.value.sort))

const displayItems = computed<{ listing: ListingCard; suffix: string | undefined }[]>(() => {
  const mode = applied.value.mode
  if (mode === 'tous') {
    return allCards.value.map(c => {
      const d = displayPrice(modeByUnit.value[c.unitId], c.price)
      return { listing: { ...c, price: d.price }, suffix: d.suffix }
    })
  }
  const suffix = RENTAL_SUFFIX[mode]
  return filteredCards.value.slice(0, visibleCount.value).map(c => ({ listing: c, suffix }))
})
const listings = computed<ListingCard[]>(() => displayItems.value.map(i => i.listing))
/**
 * En mode « tous », `total` compte des biens (pagination serveur) alors que la
 * liste affiche des logements (un bien peut en avoir plusieurs) : comparer les
 * deux masquait « Afficher plus » trop tôt et rendait les derniers biens
 * inaccessibles. On compare donc biens chargés / biens au total.
 */
const hasMore = computed(() => (applied.value.mode === 'tous' ? rawResults.value.length < total.value : listings.value.length < filteredCards.value.length))
/** Logements : exact quand tout est chargé ; sinon le total serveur (en biens), seule donnée disponible. */
const shownTotal = computed(() => {
  if (applied.value.mode !== 'tous') return filteredCards.value.length
  return hasMore.value ? total.value : allCards.value.length
})

function filtersFor(s: SearchFiltersState, pageNumber: number, forCatalog = false): PropertySearchFilters {
  const f: PropertySearchFilters = { sort: s.sort, page: pageNumber, limit: forCatalog ? CATALOG_PAGE : 12 }
  if (s.q.trim()) f.q = s.q.trim()
  if (s.city) f.city = s.city
  if (s.neighborhood) f.neighborhood_id = s.neighborhood
  if (s.budget && !forCatalog) f.max_price = Number(s.budget)
  if (s.bedrooms) f.min_bedrooms = Number(s.bedrooms)
  if (s.water) f.water_source = s.water
  if (s.meter) f.meter_type = s.meter
  if (s.unitType) f.unit_type_id = s.unitType
  return f
}

const hasFilters = computed(() => {
  const s = applied.value
  return !!(s.q.trim() || s.city || s.neighborhood || s.budget || s.bedrooms || s.water || s.meter || s.unitType || s.mode !== 'tous')
})
function settleStatus() {
  status.value = listings.value.length === 0 ? (hasFilters.value ? 'emptyFiltered' : 'empty') : 'nominal'
}

/** Une réponse lente d'une recherche précédente n'écrase jamais la plus récente. */
let searchSeq = 0

async function runSearch(append = false) {
  const seq = append ? searchSeq : ++searchSeq
  if (append) {
    loadingMore.value = true
  } else {
    applied.value = currentState()
    syncUrl()
    status.value = 'loading'
  }
  const s = applied.value
  try {
    if (s.mode === 'tous') {
      const res = await searchApi.search(filtersFor(s, page.value))
      if (seq !== searchSeq) return
      rawResults.value = append ? [...rawResults.value, ...(res.data as PropertySearchResult[])] : (res.data as PropertySearchResult[])
      total.value = res.total
      settleStatus()
      classify(allCards.value)
      return
    }
    const collected: PropertySearchResult[] = []
    let serverTotal = 0
    for (let p = 1; collected.length < CATALOG_CAP; p++) {
      const res = await searchApi.search(filtersFor(s, p, true))
      if (seq !== searchSeq) return
      collected.push(...(res.data as PropertySearchResult[]))
      serverTotal = res.total
      if (collected.length >= res.total || res.data.length < CATALOG_PAGE) break
    }
    catalogTruncated.value = serverTotal > collected.length
    await classify(flattenSearchResults(collected))
    if (seq !== searchSeq) return
    rawResults.value = collected
    visibleCount.value = 12
    settleStatus()
  } catch {
    if (seq !== searchSeq) return
    if (append) loadMoreError.value = true
    else status.value = 'error'
  } finally {
    if (append) loadingMore.value = false
  }
}
function search() {
  page.value = 1
  loadMoreError.value = false
  runSearch()
}
function loadMore() {
  loadMoreError.value = false
  if (applied.value.mode !== 'tous') {
    visibleCount.value += 12
    return
  }
  page.value += 1
  runSearch(true)
}
onMounted(() => runSearch())

/** La vue liste/carte n'est pas un critère : elle va dans l'URL sans relancer la recherche. */
watch(view, () => syncUrl())

/**
 * L'URL change sans quitter la page (pilule de recherche de l'en-tête mobile,
 * lien d'une autre page vers /recherche) : le composant n'est pas recréé, on
 * reprend donc les critères de l'URL s'ils diffèrent de la recherche affichée.
 * Nos propres `replace` écrivent la recherche affichée : ils ne relancent rien.
 */
watch(() => route.query, q => {
  if (route.path !== '/recherche') return // on quitte la page : rien à relancer
  const incoming = filtersFromQuery(q)
  if (incoming.view !== view.value) view.value = incoming.view
  if (sameSearch(incoming, applied.value)) return
  applyState(incoming)
  search()
})

/** Critères changés (tiroir refermé sans valider) : les résultats affichés ne leur correspondent plus. */
const pendingChanges = computed(() => status.value !== 'loading' && !sameSearch({ ...currentState(), q: applied.value.q }, applied.value))
/** Nouvelle recherche en cours alors que les anciens résultats restent affichés. */
const refreshing = computed(() => status.value === 'loading' && listings.value.length > 0)

function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`
}
const resultCount = computed(() => {
  if (status.value === 'loading' && !listings.value.length) return 'Recherche en cours…'
  if (status.value === 'error' || status.value === 'idle') return ''
  return plural(shownTotal.value, 'logement disponible', 'logements disponibles')
})

/** Piste concrète pour sortir d'un résultat vide, d'après les critères appliqués. */
const emptyHint = computed(() => {
  const s = applied.value
  const tips: string[] = []
  if (s.budget) tips.push('un budget plus large')
  if (s.city || s.neighborhood) tips.push(s.neighborhood ? 'tout le quartier ou la ville' : 'une autre ville')
  if (s.bedrooms && s.bedrooms !== '0') tips.push('moins de chambres')
  if (s.mode !== 'tous') tips.push(s.mode === 'nuit' ? 'les logements au mois' : 'les logements à la nuit')
  if (s.water || s.meter || s.unitType) tips.push('moins de critères')
  if (s.q.trim() && !tips.length) tips.push('un autre mot-clé')
  return tips.length ? `Essayez ${tips.slice(0, 3).join(', ')}.` : 'Retirez un critère pour voir plus de logements.'
})
function clearAll() {
  resetFilters()
  query.value = ''
  rentalMode.value = 'tous'
  search()
}

const hoveredId = ref<string | null>(null)
function openListing(l: ListingCard) {
  if (l.virtual || !l.propertyId) return
  navigateTo(`/biens/${l.propertyId}?unit=${l.unitId}`)
}
async function onFavorite(l: ListingCard) {
  if (!l.propertyId) return
  const ok = await favorites.toggleProperty(l.propertyId)
  if (!ok && !useApiAuth().isAuthenticated()) navigateTo({ path: '/connexion', query: { redirect: route.fullPath } })
}

/* ---- Vue carte : vraie carte (Leaflet / OpenStreetMap) ----
 * Biens avec un GPS valable → pastille prix à l'emplacement exact.
 * Les autres (la majorité aujourd'hui) → regroupés par ville en une zone
 * approximative ; un clic sur la zone filtre la recherche sur cette ville. */
const mapMarkers = computed(() => {
  const precise: MapMarker[] = []
  const zones = new Map<string, { lat: number; lng: number; count: number }>()
  for (const p of rawResults.value) {
    const propertyListings = listings.value.filter(l => l.propertyId === p.id)
    if (!propertyListings.length) continue
    const loc = resolveLocation(p)
    if (!loc) continue
    if (loc.precise) {
      const first = propertyListings[0]!
      precise.push({ id: first.unitId, lat: loc.lat, lng: loc.lng, precise: true, label: `${Math.round(first.price / 1000)}k` })
    } else {
      const city = p.city!.name
      const zone = zones.get(city) ?? { lat: loc.lat, lng: loc.lng, count: 0 }
      zone.count += propertyListings.length
      zones.set(city, zone)
    }
  }
  const approx: MapMarker[] = [...zones].map(([city, z]) => ({ id: `zone:${city}`, lat: z.lat, lng: z.lng, precise: false, label: `${city} · ${z.count} logement${z.count > 1 ? 's' : ''}`, shortLabel: String(z.count), weight: z.count }))
  return [...approx, ...precise]
})
const approxCount = computed(() => mapMarkers.value.filter(m => !m.precise).length)
function onMapSelect(id: string) {
  if (id.startsWith('zone:')) {
    const city = id.slice(5)
    if (cityName.value !== city) {
      cityName.value = city
      neighborhoodId.value = ''
      search()
    }
    return
  }
  const l = listings.value.find(x => x.unitId === id)
  if (l) openListing(l)
}
</script>

<template>
  <div class="mx-auto max-w-[1240px] animate-[im-fade_.3s_ease_backwards] px-4 pb-[60px] pt-6 sm:px-[26px]">
    <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-4 shadow-card sm:p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 class="m-0 font-display text-2xl font-bold tracking-[-.03em]">Rechercher un logement</h1>
          <span v-if="resultCount" class="text-[13.5px] font-semibold text-[var(--text-muted)]">{{ resultCount }}</span>
        </div>
        <FormsSegmentedControl v-model="searchMode" :options="SEARCH_TABS" size="sm" />
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
          <span v-if="rentalMode === t.key" class="absolute right-2 top-2 hidden h-5 w-5 place-items-center rounded-pill bg-green-600 text-white sm:grid">
            <Check class="h-3 w-3" :stroke-width="3" />
          </span>
        </button>
      </div>

      <template v-if="searchMode === 'filtres'">
        <div class="flex flex-col gap-1.5 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-page)] p-[5px] shadow-hairline sm:flex-row sm:items-stretch sm:gap-0 sm:rounded-pill">
          <label class="flex flex-1 items-center gap-[11px] px-5">
            <Search class="h-[18px] w-[18px] flex-none text-clay-500" :stroke-width="2.2" />
            <input v-model="query" type="search" enterkeyhint="search" placeholder="Nom, ville, description…" aria-label="Mots-clés" class="h-[46px] w-full border-0 bg-transparent text-[15px] font-semibold outline-none" @keydown.enter="search">
          </label>
          <div class="mx-2 h-px bg-[var(--border-default)] sm:mx-0 sm:my-2 sm:h-auto sm:w-px" />
          <select v-model="sortModel" aria-label="Trier les résultats" class="h-[46px] cursor-pointer border-0 bg-transparent px-5 text-[13.5px] font-bold text-sand-900 outline-none sm:h-auto sm:px-4">
            <option value="newest">Plus récents</option>
            <option value="oldest">Plus anciens</option>
            <option value="price_asc">Prix croissant</option>
            <option value="price_desc">Prix décroissant</option>
          </select>
          <div class="flex gap-1.5 sm:contents">
            <button type="button" class="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-pill px-4 text-sm font-bold transition-all sm:flex-none sm:justify-start sm:px-5" :class="filtersOpen ? 'bg-green-600 text-white' : 'bg-transparent text-sand-900'" @click="filtersOpen = true">
              <SlidersHorizontal class="h-4 w-4" :stroke-width="2" />
              Filtres
              <span v-if="filterCount" class="grid h-5 min-w-[20px] place-items-center rounded-pill bg-green-600 px-1.5 font-mono text-[11.5px] font-bold text-white">{{ filterCount }}</span>
            </button>
            <button type="button" class="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-pill bg-[image:var(--action-primary)] px-4 text-sm font-bold text-white shadow-action sm:flex-none sm:px-6" @click="search">
              <Search class="h-4 w-4" :stroke-width="2.2" />Rechercher
            </button>
          </div>
        </div>
        <div v-if="activeChips.length" class="mt-3.5 flex flex-wrap items-center gap-2">
          <span v-for="chip in activeChips" :key="chip.key" class="inline-flex items-center gap-1.5 rounded-pill border border-green-100 bg-green-50 py-1.5 pl-3.5 pr-1.5 text-[13px] font-bold text-green-800">
            {{ chip.label }}
            <button type="button" class="grid h-6 w-6 place-items-center rounded-pill text-green-600 hover:bg-green-100" :aria-label="`Retirer ${chip.label}`" @click="chip.remove(); search()">
              <X class="h-3.5 w-3.5" :stroke-width="2.4" />
            </button>
          </span>
          <button type="button" class="text-[13px] font-bold text-[var(--text-muted)] underline" @click="resetFilters(); search()">Tout effacer</button>
        </div>
      </template>

      <template v-if="filtersOpen">
        <div class="fixed inset-0 z-[80] animate-[im-veil_.25s_ease_both] bg-black/[.42] backdrop-blur-[3px]" @click="filtersOpen = false" />
        <aside class="fixed inset-y-0 left-0 z-[81] flex w-[430px] max-w-[90vw] animate-[im-slide-left_.32s_var(--ease-standard)_both] flex-col bg-[var(--surface-page)] shadow-[20px_0_60px_rgba(26,23,20,.24)]" role="dialog" aria-modal="true" aria-label="Affiner la recherche">
          <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-7 py-6">
            <div>
              <h2 class="m-0 font-display text-[22px] font-bold tracking-[-.025em]">Affiner la recherche</h2>
              <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">Les résultats se mettent à jour quand vous validez.</p>
            </div>
            <button type="button" class="grid h-[38px] w-[38px] place-items-center rounded-pill bg-sand-200 text-sand-800 hover:bg-sand-300" aria-label="Fermer" @click="filtersOpen = false">
              <X class="h-[18px] w-[18px]" :stroke-width="2" />
            </button>
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
              <input v-model.number="budgetSlider" type="range" min="0" :max="rentalMode === 'nuit' ? 100000 : 500000" :step="rentalMode === 'nuit' ? 1000 : 10000" aria-label="Budget maximum" class="w-full accent-green-600">
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

          <div class="flex items-center gap-3.5 border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-7 py-[18px] pb-[calc(18px+env(safe-area-inset-bottom))]">
            <button type="button" class="text-sm font-bold text-[var(--text-muted)] underline" @click="resetFilters">Tout effacer</button>
            <CoreButton size="lg" full-width class="flex-1" @click="filtersOpen = false; search()">Voir les résultats</CoreButton>
          </div>
        </aside>
      </template>

      <div v-if="searchMode === 'naturel'" class="mt-1 rounded-2xl border border-clay-200 bg-white p-4 sm:p-[18px]">
        <div class="flex flex-col gap-2.5 sm:flex-row">
          <input v-model="natural" placeholder="studio calme à Calavi vers 40 000" aria-label="Décrivez le logement recherché" class="h-[54px] min-w-0 flex-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[18px] text-base outline-none" @keydown="onNaturalKey">
          <CoreButton size="lg" @click="runNatural">Rechercher</CoreButton>
        </div>
        <div v-if="naturalUnderstood" class="mt-4 flex flex-wrap items-center gap-2">
          <span class="text-[13.5px] text-[var(--text-muted)]">Nous avons compris :</span>
          <span v-for="c in criteria" :key="c.label" class="inline-flex items-center gap-1.5 rounded-pill border border-green-100 bg-green-50 py-1.5 pl-3.5 pr-1.5 text-[13px] font-bold text-green-800">
            {{ c.label }}
            <button type="button" class="grid h-6 w-6 place-items-center rounded-pill text-green-600 hover:bg-green-100" :aria-label="`Retirer ${c.label}`" @click="c.remove(); search()">
              <X class="h-3.5 w-3.5" :stroke-width="2.4" />
            </button>
          </span>
        </div>
        <div v-if="naturalFailed" class="mt-4 rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--surface-page)] px-6 py-8 text-center">
          <div class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><SearchX class="h-5 w-5" :stroke-width="1.9" /></div>
          <p class="mb-0 mt-3.5 text-[15px] font-bold">Nous n'avons pas compris votre demande</p>
          <p class="mx-auto mb-4 mt-1.5 max-w-[440px] text-[13.5px] text-[var(--text-muted)]">Précisez une ville, un nombre de chambres ou un budget — par exemple « 2 chambres à Cotonou sous 100 000 ».</p>
          <CoreButton tone="secondary" size="sm" @click="searchMode = 'filtres'">Utiliser plutôt les filtres</CoreButton>
        </div>
      </div>
    </div>

    <div class="my-4.5 flex flex-wrap items-center justify-between gap-3">
      <p class="m-0 flex items-center gap-2 text-[14.5px] font-semibold text-[var(--text-secondary)]">
        {{ resultCount }}
        <span v-if="refreshing" class="inline-flex items-center gap-1.5 rounded-pill bg-sand-100 px-2.5 py-1 text-xs font-bold text-[var(--text-muted)]">
          <LoaderCircle class="h-3.5 w-3.5 animate-spin" :stroke-width="2.2" />Mise à jour…
        </span>
      </p>
      <FormsSegmentedControl v-model="view" :options="VIEW_TABS" size="sm" />
    </div>

    <div v-if="pendingChanges" class="mb-4.5 flex flex-wrap items-center gap-3 rounded-md border border-info-border bg-info-bg px-3.5 py-2.5">
      <p class="m-0 flex-1 text-[13px] font-semibold text-info-fg-deep">Vos critères ont changé : les logements affichés ne les reflètent pas encore.</p>
      <CoreButton size="sm" tone="secondary" @click="search"><RefreshCw class="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" :stroke-width="2.2" />Actualiser</CoreButton>
    </div>

    <template v-if="status === 'loading' && !listings.length">
      <p v-if="applied.mode !== 'tous'" class="mb-3.5 mt-0 text-[13px] font-semibold text-[var(--text-muted)]">Tri des logements {{ applied.mode === 'nuit' ? 'à la nuit' : 'au mois' }} d'après leurs grilles tarifaires…</p>
      <div class="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
        <DataSkeletonCard v-for="i in 6" :key="i" :height="168" :lines="2" />
      </div>
    </template>

    <FeedbackAlertBanner v-else-if="status === 'error'" tone="danger">
      Impossible de charger les résultats pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="search">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else-if="status === 'emptyFiltered'" class="rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-6 py-12 text-center">
      <div class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><SearchX class="h-5 w-5" :stroke-width="1.9" /></div>
      <p class="mb-0 mt-4 text-[15px] font-bold">Aucun logement pour ces critères</p>
      <p class="mx-auto mb-4.5 mt-1.5 max-w-[440px] text-[13.5px] text-[var(--text-muted)]">{{ emptyHint }}</p>
      <CoreButton tone="secondary" @click="clearAll">Effacer tous les critères</CoreButton>
    </div>

    <div v-else-if="status === 'empty'" class="rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-6 py-12 text-center">
      <div class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><House class="h-5 w-5" :stroke-width="1.9" /></div>
      <p class="mb-0 mt-4 text-[15px] font-bold">Aucun logement n'est en ligne pour le moment</p>
      <p class="mx-auto mb-4.5 mt-1.5 max-w-[440px] text-[13.5px] text-[var(--text-muted)]">Vous êtes propriétaire ? Publiez votre logement : il apparaîtra dans cette recherche dès sa mise en ligne.</p>
      <NuxtLink to="/louer" class="inline-block rounded-md border border-[var(--border-default)] bg-white px-5 py-3 text-sm font-bold text-sand-900 hover:border-green-600">Publier un logement</NuxtLink>
    </div>

    <template v-else>
      <!-- Carte : en tête et avec la liste en bandeau horizontal sous lg ; à droite, collante, sur grand écran. -->
      <div v-if="view === 'carte'" class="flex flex-col gap-4 transition-opacity lg:grid lg:grid-cols-2 lg:items-start lg:gap-[22px]" :class="refreshing ? 'opacity-60' : ''">
        <div class="lg:sticky lg:top-[94px] lg:order-2">
          <div class="relative isolate h-[min(58dvh,460px)] overflow-hidden rounded-2xl border border-[var(--border-default)] lg:h-[560px]">
            <MapView :markers="mapMarkers" :active-id="hoveredId" @select="onMapSelect" @hover="hoveredId = $event" />
          </div>
          <p v-if="!mapMarkers.length" class="mb-0 mt-2.5 text-xs text-[var(--text-faint)]">Aucune localisation disponible pour ces résultats.</p>
          <p v-else-if="approxCount" class="mb-0 mt-2.5 text-xs text-[var(--text-faint)]">Les zones en pointillés regroupent les logements sans emplacement exact : touchez-en une pour filtrer par ville.</p>
        </div>
        <div class="min-w-0 lg:order-1">
          <div class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-[26px] sm:px-[26px] lg:mx-0 lg:grid lg:grid-cols-2 lg:gap-[22px] lg:overflow-visible lg:px-0 lg:pb-0">
            <SearchPropertyCard
              v-for="item in displayItems"
              :key="item.listing.unitId"
              class="w-[78vw] max-w-[300px] flex-none snap-start lg:w-auto lg:max-w-none"
              :listing="item.listing"
              :price-suffix="item.suffix"
              :favorite="item.listing.propertyId ? favorites.isFavoriteProperty(item.listing.propertyId) : false"
              @open="openListing(item.listing)"
              @favorite="onFavorite(item.listing)"
              @hover="hoveredId = item.listing.unitId"
              @unhover="hoveredId = null"
            />
          </div>
        </div>
      </div>

      <div v-else class="grid grid-cols-1 gap-[22px] transition-opacity sm:grid-cols-2 lg:grid-cols-3" :class="refreshing ? 'opacity-60' : ''">
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

      <p v-if="applied.mode !== 'tous' && catalogTruncated" class="mb-0 mt-5 text-center text-xs text-[var(--text-faint)]">Le tri par type de location couvre les {{ CATALOG_CAP }} logements les plus pertinents — affinez par ville ou budget pour aller plus loin.</p>
      <div v-if="hasMore" class="mt-[34px] flex flex-col items-center gap-2">
        <CoreButton tone="secondary" pill :disabled="loadingMore" @click="loadMore">{{ loadingMore ? 'Chargement…' : 'Afficher plus de logements' }}</CoreButton>
        <p v-if="loadMoreError" class="m-0 text-[13px] font-semibold text-danger-fg">Le chargement a échoué. Réessayez.</p>
      </div>
    </template>
  </div>
</template>
