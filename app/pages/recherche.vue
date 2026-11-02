<script setup lang="ts">
import { BedDouble, ChevronDown, Droplets, House, LoaderCircle, MapPin, RefreshCw, Search, SearchX, SlidersHorizontal, Wallet, X, Zap } from '@lucide/vue'
import type { PropertySearchFilters, PropertySearchResult } from '~/types/property'
import { flattenSearchResults, type ListingCard } from '~/utils/propertyListing'
import { resolveLocation, type MapMarker } from '~/utils/geo'
import { classifyRental, displayPrice, filterByRental, mapLimited, modeFromCard, RENTAL_SUFFIX, type RentalKey, type RentalMode } from '~/utils/rentalMode'
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
const budgetMax = computed(() => (rentalMode.value === 'nuit' ? 100000 : 500000))
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
    const fromApi = modeFromCard(c)
    if (fromApi) return fromApi
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
    <!-- En-tête de recherche : fond doux, sans cadre ; les halos ne sont que décoratifs. -->
    <div class="relative overflow-hidden rounded-[28px] bg-[linear-gradient(155deg,var(--color-green-50)_0%,var(--color-sand-50)_55%,var(--color-clay-50)_100%)] px-4 py-6 sm:px-8 sm:py-9">
      <span aria-hidden="true" class="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-pill bg-green-200/40 blur-3xl" />
      <span aria-hidden="true" class="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-pill bg-clay-200/60 blur-3xl" />

      <div class="relative">
        <div class="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
          <div class="min-w-0">
            <h1 class="m-0 font-display text-[26px] font-bold tracking-[-.03em] sm:text-[32px]">Rechercher un logement</h1>
            <p v-if="resultCount" class="mb-0 mt-1 text-[14px] text-[var(--text-muted)]">{{ resultCount }}</p>
          </div>
          <FormsSegmentedControl v-model="searchMode" :options="SEARCH_TABS" size="sm" />
        </div>

        <div class="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="radiogroup" aria-label="Type de location">
          <button
            v-for="t in RENTAL_TILES"
            :key="t.key"
            type="button"
            role="radio"
            :aria-checked="rentalMode === t.key"
            class="group flex flex-none items-center gap-2.5 rounded-pill py-1.5 pl-1.5 pr-4 text-left transition-all duration-200"
            :class="rentalMode === t.key ? 'bg-white shadow-[0_6px_20px_rgba(26,93,62,.12)] ring-1 ring-green-200' : 'bg-white/50 hover:bg-white/90'"
            @click="pickRental(t.key)"
          >
            <span class="relative h-9 w-9 flex-none overflow-hidden rounded-pill sm:h-10 sm:w-10">
              <span v-if="t.image" class="absolute inset-0 bg-cover bg-no-repeat transition-transform duration-500 group-hover:scale-110" :style="{ backgroundImage: t.image, backgroundPosition: t.pos }" />
              <span v-else class="absolute inset-0 grid grid-cols-2">
                <span class="bg-cover bg-no-repeat" style="background-image: url(/images/hero/hero-3.jpg); background-position: 30% 70%" />
                <span class="bg-cover bg-no-repeat" style="background-image: url(/images/hero/hero-1.jpg); background-position: 70% center" />
              </span>
            </span>
            <span class="flex min-w-0 flex-col leading-tight">
              <span class="text-[13.5px] font-bold" :class="rentalMode === t.key ? 'text-green-800' : 'text-[var(--text-secondary)]'"><span class="sm:hidden">{{ t.short }}</span><span class="hidden sm:inline">{{ t.label }}</span></span>
              <span class="mt-0.5 hidden text-[11.5px] text-[var(--text-faint)] sm:block">{{ t.hint }}</span>
            </span>
          </button>
        </div>

        <template v-if="searchMode === 'filtres'">
          <div class="mt-4 flex flex-col gap-1.5 rounded-[22px] bg-white p-1.5 shadow-[0_12px_40px_rgba(26,61,41,.10)] ring-1 ring-black/[.03] sm:flex-row sm:items-center sm:gap-0 sm:rounded-pill">
            <label class="flex flex-1 items-center gap-3 px-4 sm:px-5">
              <Search class="h-[18px] w-[18px] flex-none text-[var(--text-faint)]" :stroke-width="2" />
              <input v-model="query" type="search" enterkeyhint="search" placeholder="Nom, ville, description…" aria-label="Mots-clés" class="h-[50px] w-full border-0 bg-transparent text-[15px] font-medium outline-none placeholder:text-[var(--text-faint)]" @keydown.enter="search">
            </label>
            <div class="mx-3 h-px bg-sand-200 sm:mx-1 sm:h-7 sm:w-px" />
            <select v-model="sortModel" aria-label="Trier les résultats" class="h-[46px] cursor-pointer rounded-pill border-0 bg-transparent px-4 text-[13.5px] font-semibold text-[var(--text-secondary)] outline-none hover:bg-sand-100 sm:h-11">
              <option value="newest">Plus récents</option>
              <option value="oldest">Plus anciens</option>
              <option value="price_asc">Prix croissant</option>
              <option value="price_desc">Prix décroissant</option>
            </select>
            <div class="flex gap-1.5 sm:contents">
              <button type="button" class="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-pill px-4 text-[13.5px] font-semibold transition-colors sm:h-11 sm:flex-none" :class="filtersOpen || filterCount ? 'bg-green-50 text-green-800' : 'text-[var(--text-secondary)] hover:bg-sand-100'" @click="filtersOpen = true">
                <SlidersHorizontal class="h-4 w-4" :stroke-width="2" />
                Filtres
                <span v-if="filterCount" class="grid h-5 min-w-[20px] place-items-center rounded-pill bg-green-700 px-1.5 font-mono text-[11px] font-bold text-white">{{ filterCount }}</span>
              </button>
              <button type="button" class="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-pill bg-green-700 px-5 text-sm font-bold text-white shadow-[0_6px_16px_rgba(26,93,62,.22)] transition-colors hover:bg-green-800 sm:ml-1 sm:h-11 sm:flex-none sm:px-6" @click="search">
                <Search class="h-4 w-4" :stroke-width="2.2" />Rechercher
              </button>
            </div>
          </div>
          <div v-if="activeChips.length" class="mt-3.5 flex flex-wrap items-center gap-2">
            <span v-for="chip in activeChips" :key="chip.key" class="inline-flex items-center gap-1 rounded-pill bg-white/80 py-1 pl-3.5 pr-1 text-[13px] font-semibold text-green-800 ring-1 ring-green-100">
              {{ chip.label }}
              <button type="button" class="grid h-6 w-6 place-items-center rounded-pill text-green-600 hover:bg-green-50" :aria-label="`Retirer ${chip.label}`" @click="chip.remove(); search()">
                <X class="h-3.5 w-3.5" :stroke-width="2.2" />
              </button>
            </span>
            <button type="button" class="px-1 text-[13px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]" @click="resetFilters(); search()">Tout effacer</button>
          </div>
        </template>

      <template v-if="filtersOpen">
        <div class="fixed inset-0 z-[80] animate-[im-veil_.25s_ease_both] bg-[rgba(18,60,41,.28)] backdrop-blur-[6px]" @click="filtersOpen = false" />
        <!-- Feuille du bas sur mobile, panneau flottant à gauche dès sm. -->
        <aside class="fixed inset-x-0 bottom-0 z-[81] flex max-h-[90dvh] animate-[im-sheet-up_.36s_var(--ease-standard)_both] flex-col overflow-hidden rounded-t-[28px] bg-[var(--surface-page)] shadow-[0_-12px_48px_rgba(18,60,41,.18)] sm:inset-y-3 sm:bottom-3 sm:left-3 sm:right-auto sm:max-h-none sm:w-[420px] sm:animate-[im-slide-left_.32s_var(--ease-standard)_both] sm:rounded-[28px] sm:shadow-[0_24px_64px_rgba(18,60,41,.22)]" role="dialog" aria-modal="true" aria-label="Affiner la recherche">
          <span aria-hidden="true" class="mx-auto mt-2.5 h-1 w-10 flex-none rounded-pill bg-sand-300 sm:hidden" />
          <div class="flex items-start justify-between gap-4 px-6 pb-2 pt-4 sm:px-7 sm:pt-7">
            <div>
              <h2 class="m-0 flex items-center gap-2 font-display text-[21px] font-bold tracking-[-.025em]">
                Affiner la recherche
                <span v-if="filterCount" class="rounded-pill bg-green-50 px-2.5 py-0.5 font-body text-xs font-bold tracking-normal text-green-800">{{ filterCount }} actif{{ filterCount > 1 ? 's' : '' }}</span>
              </h2>
              <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">Les résultats se mettent à jour quand vous validez.</p>
            </div>
            <button type="button" class="grid h-9 w-9 flex-none place-items-center rounded-pill bg-white text-sand-800 ring-1 ring-sand-200 transition-colors hover:bg-sand-100" aria-label="Fermer" @click="filtersOpen = false">
              <X class="h-4 w-4" :stroke-width="2" />
            </button>
          </div>

          <div class="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-3 sm:px-5">
            <!-- Où -->
            <section class="rounded-[22px] bg-white p-4 ring-1 ring-black/[.03] sm:p-5">
              <p class="mb-3 mt-0 flex items-center gap-2 text-[13.5px] font-bold"><MapPin class="h-4 w-4 text-green-700" :stroke-width="2" />Ville</p>
              <div class="relative">
                <select v-model="cityName" aria-label="Ville" class="h-12 w-full cursor-pointer appearance-none rounded-2xl border-0 bg-sand-50 pl-4 pr-10 text-[14px] font-semibold text-[var(--text-primary)] outline-none ring-1 ring-sand-200 transition-shadow focus:ring-2 focus:ring-green-300">
                  <option value="">Toutes les villes</option>
                  <option v-for="c in cities" :key="c.id" :value="c.name">{{ c.name }}</option>
                </select>
                <ChevronDown class="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" :stroke-width="2" />
              </div>
              <template v-if="neighborhoodChips.length">
                <p class="mb-2.5 mt-4 text-[12.5px] font-semibold text-[var(--text-muted)]">Quartier</p>
                <div class="flex flex-wrap gap-2">
                  <button v-for="c in neighborhoodChips" :key="c.label" type="button" :aria-pressed="c.active" class="rounded-pill px-3.5 py-2 text-[13px] font-semibold transition-all" :class="c.active ? 'bg-green-50 text-green-800 ring-1 ring-green-300' : 'bg-white text-[var(--text-secondary)] ring-1 ring-sand-200 hover:ring-sand-300'" @click="c.pick">{{ c.label }}</button>
                </div>
              </template>
            </section>

            <!-- Budget -->
            <section class="rounded-[22px] bg-white p-4 ring-1 ring-black/[.03] sm:p-5">
              <div class="mb-4 flex items-center justify-between gap-3">
                <p class="m-0 flex items-center gap-2 text-[13.5px] font-bold"><Wallet class="h-4 w-4 text-green-700" :stroke-width="2" />{{ rentalMode === 'nuit' ? 'Budget par nuit' : 'Budget mensuel' }}</p>
                <span class="rounded-pill px-3 py-1 text-[12.5px] font-bold" :class="budget ? 'bg-green-50 text-green-800' : 'bg-sand-100 text-[var(--text-muted)]'">{{ budgetRangeLabel }}</span>
              </div>
              <input v-model.number="budgetSlider" type="range" min="0" :max="budgetMax" :step="rentalMode === 'nuit' ? 1000 : 10000" aria-label="Budget maximum" class="soft-range w-full" :style="{ '--fill': `${(budgetSlider / budgetMax) * 100}%` }">
              <div class="mt-2 flex justify-between text-[11.5px] font-semibold text-[var(--text-faint)]"><span>0 F</span><span>{{ rentalMode === 'nuit' ? '100 000 F' : '500 000 F' }}</span></div>
            </section>

            <!-- Logement -->
            <section class="rounded-[22px] bg-white p-4 ring-1 ring-black/[.03] sm:p-5">
              <p class="mb-3 mt-0 flex items-center gap-2 text-[13.5px] font-bold"><BedDouble class="h-4 w-4 text-green-700" :stroke-width="2" />Chambres minimum</p>
              <div class="flex gap-1 rounded-pill bg-sand-100 p-1" role="radiogroup" aria-label="Chambres minimum">
                <button v-for="c in bedChips" :key="c.label" type="button" role="radio" :aria-checked="c.active" class="h-10 flex-1 rounded-pill text-[13.5px] font-bold transition-all" :class="c.active ? 'bg-white text-green-800 shadow-[0_2px_8px_rgba(26,23,20,.08)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'" @click="c.pick">{{ c.label }}</button>
              </div>
            </section>

            <!-- Équipements -->
            <section class="rounded-[22px] bg-white p-4 ring-1 ring-black/[.03] sm:p-5">
              <p class="mb-3 mt-0 flex items-center gap-2 text-[13.5px] font-bold"><Droplets class="h-4 w-4 text-green-700" :stroke-width="2" />Source d'eau</p>
              <div class="flex flex-wrap gap-2">
                <button v-for="c in waterChips" :key="c.label" type="button" :aria-pressed="c.active" class="rounded-pill px-3.5 py-2 text-[13px] font-semibold transition-all" :class="c.active ? 'bg-green-50 text-green-800 ring-1 ring-green-300' : 'bg-white text-[var(--text-secondary)] ring-1 ring-sand-200 hover:ring-sand-300'" @click="c.pick">{{ c.label }}</button>
              </div>
              <div class="my-4 h-px bg-sand-200" />
              <p class="mb-3 mt-0 flex items-center gap-2 text-[13.5px] font-bold"><Zap class="h-4 w-4 text-green-700" :stroke-width="2" />Compteur électrique</p>
              <div class="flex flex-wrap gap-2">
                <button v-for="c in meterChips" :key="c.label" type="button" :aria-pressed="c.active" class="rounded-pill px-3.5 py-2 text-[13px] font-semibold transition-all" :class="c.active ? 'bg-green-50 text-green-800 ring-1 ring-green-300' : 'bg-white text-[var(--text-secondary)] ring-1 ring-sand-200 hover:ring-sand-300'" @click="c.pick">{{ c.label }}</button>
              </div>
            </section>
          </div>

          <div class="flex items-center gap-3 border-t border-sand-200/70 bg-[var(--surface-page)] px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] sm:px-6">
            <button type="button" class="rounded-pill px-4 py-3 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-sand-100 hover:text-[var(--text-primary)] disabled:opacity-40" :disabled="!filterCount" @click="resetFilters">Tout effacer</button>
            <button type="button" class="flex h-12 flex-1 items-center justify-center gap-2 rounded-pill bg-green-700 px-6 text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(26,93,62,.25)] transition-colors hover:bg-green-800" @click="filtersOpen = false; search()">
              <Search class="h-4 w-4" :stroke-width="2.2" />Voir les résultats
            </button>
          </div>
        </aside>
      </template>

      <div v-if="searchMode === 'naturel'" class="mt-4 rounded-[22px] bg-white p-1.5 shadow-[0_12px_40px_rgba(26,61,41,.10)] ring-1 ring-black/[.03]">
        <div class="flex flex-col gap-1.5 sm:flex-row sm:items-center">
          <input v-model="natural" placeholder="studio calme à Calavi vers 40 000" aria-label="Décrivez le logement recherché" class="h-[50px] min-w-0 flex-1 rounded-pill border-0 bg-transparent px-5 text-[15px] font-medium outline-none placeholder:text-[var(--text-faint)]" @keydown="onNaturalKey">
          <button type="button" class="flex h-[46px] items-center justify-center gap-2 rounded-pill bg-green-700 px-6 text-sm font-bold text-white shadow-[0_6px_16px_rgba(26,93,62,.22)] transition-colors hover:bg-green-800 sm:h-11" @click="runNatural">
            <Search class="h-4 w-4" :stroke-width="2.2" />Rechercher
          </button>
        </div>
        <div v-if="naturalUnderstood" class="flex flex-wrap items-center gap-2 px-3.5 pb-2.5 pt-2">
          <span class="text-[13.5px] text-[var(--text-muted)]">Nous avons compris :</span>
          <span v-for="c in criteria" :key="c.label" class="inline-flex items-center gap-1.5 rounded-pill border border-green-100 bg-green-50 py-1.5 pl-3.5 pr-1.5 text-[13px] font-bold text-green-800">
            {{ c.label }}
            <button type="button" class="grid h-6 w-6 place-items-center rounded-pill text-green-600 hover:bg-green-100" :aria-label="`Retirer ${c.label}`" @click="c.remove(); search()">
              <X class="h-3.5 w-3.5" :stroke-width="2.4" />
            </button>
          </span>
        </div>
        <div v-if="naturalFailed" class="m-1.5 mt-2 rounded-[18px] bg-sand-50 px-6 py-8 text-center">
          <div class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><SearchX class="h-5 w-5" :stroke-width="1.9" /></div>
          <p class="mb-0 mt-3.5 text-[15px] font-bold">Nous n'avons pas compris votre demande</p>
          <p class="mx-auto mb-4 mt-1.5 max-w-[440px] text-[13.5px] text-[var(--text-muted)]">Précisez une ville, un nombre de chambres ou un budget — par exemple « 2 chambres à Cotonou sous 100 000 ».</p>
          <CoreButton tone="secondary" size="sm" @click="searchMode = 'filtres'">Utiliser plutôt les filtres</CoreButton>
        </div>
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

<style scoped>
/* Curseur de budget : piste fine, partie remplie en vert jusqu'au pouce (--fill). */
.soft-range {
  height: 22px;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.soft-range::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--color-green-600) var(--fill, 0%), var(--color-sand-200) var(--fill, 0%));
}
.soft-range::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: var(--color-sand-200);
}
.soft-range::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: var(--color-green-600);
}
.soft-range::-webkit-slider-thumb {
  appearance: none;
  width: 22px;
  height: 22px;
  margin-top: -8px;
  border-radius: 999px;
  background: #fff;
  border: 2px solid var(--color-green-600);
  box-shadow: 0 2px 8px rgba(26, 93, 62, 0.25);
  transition: transform 0.15s ease;
}
.soft-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #fff;
  border: 2px solid var(--color-green-600);
  box-shadow: 0 2px 8px rgba(26, 93, 62, 0.25);
}
.soft-range:active::-webkit-slider-thumb {
  transform: scale(1.12);
}
.soft-range:focus-visible {
  outline: 2px solid var(--color-green-300);
  outline-offset: 4px;
  border-radius: 999px;
}
</style>
