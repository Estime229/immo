<script setup lang="ts">
import { ArrowRight, Check, ChevronLeft, ChevronRight, ClipboardCheck, MapPin, Search, ShieldCheck, Smartphone } from '@lucide/vue'
import type { PropertySearchResult } from '~/types/property'
import { flattenSearchResults, type ListingCard } from '~/utils/propertyListing'
import { classifyRental, mapLimited, modeFromCard, type RentalMode } from '~/utils/rentalMode'
import { buildSearchQuery, digitsOnly } from '~/utils/searchPill'
import { normalizeCity, rankCities } from '~/utils/geo'
import { displayName } from '~/utils/displayName'

const { photos, formatFcfaShort } = useProperties()
const searchApi = usePropertySearchApi()
const refData = useReferenceData()
const favorites = usePropertyFavorites()

/* ---- Barre de recherche (ordinateur seulement : sur mobile, la pilule de l'en-tête et sa feuille suffisent) ---- */
const query = ref('')
const cityName = ref('')
/** Chiffres seuls (« 100 000 F » → 100000), comme la feuille de recherche mobile : `/recherche` fait `Number(budget)`. */
const budget = ref('')
const budgetDisplay = computed(() => (budget.value ? Number(budget.value).toLocaleString('fr-FR') : ''))
function onBudgetInput(e: Event) {
  const input = e.target as HTMLInputElement
  budget.value = digitsOnly(input.value)
  // Une lettre tapée ne change pas `budget` : sans cette ligne, elle resterait affichée dans le champ.
  input.value = budgetDisplay.value
}
const cities = ref<{ id: string; name: string }[]>([])

/** Le sélecteur nuit / mois fait partie du formulaire : la recherche suit le mode affiché sur la page. */
function runSearch() {
  navigateTo({ path: '/recherche', query: buildSearchQuery({ q: query.value, city: cityName.value, budget: budget.value, mode: activeRental.value }) })
}

const popularChips = computed(() => rankedCities.value.slice(0, 4).map(c => ({ label: `Logements à ${displayName(c.name)}`, city: c.name })))
function pickPopular(chip: { city: string }) {
  navigateTo(cityLink(chip.city))
}

/* ---- Héros — carrousel (purement décoratif, aucune donnée à intégrer) ---- */
const HERO_PHOTO_INDEXES = [0, 2, 6]
const heroIndex = ref(0)
let heroTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  heroTimer = setInterval(() => { heroIndex.value = (heroIndex.value + 1) % HERO_PHOTO_INDEXES.length }, 5000)
})
onUnmounted(() => clearInterval(heroTimer))
/** Entrées de `photos` : valeurs de la propriété `background` (image ou aplat), taille et cadrage remis après le raccourci. */
function heroStyle(idx: number, i: number) {
  return { background: photos[idx], backgroundSize: 'cover', backgroundPosition: 'center', opacity: heroIndex.value === i ? 1 : 0 }
}

/* ---- Catégories réelles — comptées via GET /property/search?unit_type_id=..., un vrai type de logement par catégorie ---- */
/**
 * Les 6 seules valeurs réelles de GET /ref?type=UNIT_TYPE (vérifié en direct) —
 * "villa"/"duplex" n'existent PAS dans ce référentiel (ce sont des codes
 * PROPERTY_TYPE, un registre différent, pas accepté par le filtre `unit_type_id`
 * de la recherche). Une catégorie avec un code introuvable resterait bloquée à
 * "0 disponible" en permanence, ce qui laisserait croire à une absence réelle
 * plutôt qu'à un filtre mal formé — mieux vaut ne proposer que des catégories
 * dont le code est confirmé exister.
 */
const CATEGORY_DEFS = [
  { code: 'studio', label: 'Studios' },
  { code: 'chambre_salon', label: 'Chambre-salon' },
  { code: '2_chambres_salon', label: '2 Chambres-salon' },
  { code: '3_chambres_salon', label: '3 Chambres-salon' },
  { code: '4_chambres_salon', label: '4 Chambres-salon' },
  { code: 'maison', label: 'Maisons' }
] as const

/**
 * Pas de compte affiché sur les tuiles : le compte serveur (`GET /property/search?unit_type_id=`)
 * ne sait pas filtrer par mode nuit/mois, il contredirait le reste de la page une fois un mode choisi.
 */
interface CategoryTile { code: string; label: string; empty: boolean; unitTypeId: string }
const categories = ref<CategoryTile[]>([])
const categoriesLoading = ref(true)
async function loadCategories() {
  categoriesLoading.value = true
  try {
    const unitTypes = await refData.fetchRef('UNIT_TYPE')
    const results = await Promise.all(CATEGORY_DEFS.map(async def => {
      const entry = unitTypes.find(u => u.code === def.code)
      if (!entry) return { ...def, count: 0 as number | null, unitTypeId: '' }
      try {
        const res = await searchApi.search({ unit_type_id: entry.id, limit: 1 })
        return { ...def, count: res.total as number | null, unitTypeId: entry.id }
      } catch {
        // Compte inconnu (panne ponctuelle) : la tuile reste normale et cliquable, jamais grisée comme « vide ».
        return { ...def, count: null, unitTypeId: entry.id }
      }
    }))
    categories.value = results.map(r => ({
      code: r.code,
      label: r.label,
      empty: r.count === 0,
      unitTypeId: r.unitTypeId
    }))
  } catch {
    // Référentiel indisponible : sans identifiant de type, aucune tuile ne mènerait à une vraie recherche — la section se masque.
    categories.value = []
  } finally {
    categoriesLoading.value = false
  }
}

function pickCategory(c: CategoryTile) {
  if (!c.unitTypeId) return
  navigateTo({ path: '/recherche', query: { unit_type_id: c.unitTypeId } })
}

/* ---- Annonces réelles : chargées une fois, puis classées nuit / mois (voir plus bas) ---- */
interface CityGroup { name: string; units: ListingCard[] }
const listingsLoading = ref(true)
/** Recherche ou classement en échec : un bandeau d'erreur, jamais « Aucun logement publié ». */
const listingsError = ref(false)
/**
 * Le classement nuit / mois coûte un `GET /units/:id/pricing` par logement : on se limite aux
 * 30 annonces les plus récentes, et chaque classement obtenu est gardé pour la session —
 * revenir sur l'accueil ne relance que les tarifs des logements nouveaux.
 */
const LISTING_LIMIT = 30
const rentalModeCache = useState<Record<string, RentalMode>>('homeRentalModes', () => ({}))
/** Toutes les annonces publiées tiennent dans les 30 chargées : les comptes par ville sont exacts. */
const catalogComplete = ref(false)

async function loadListings() {
  listingsLoading.value = true
  rentalLoading.value = true
  listingsError.value = false
  try {
    const res = await searchApi.search({ limit: LISTING_LIMIT, sort: 'newest' })
    catalogComplete.value = res.total <= LISTING_LIMIT
    const properties = (res.data as PropertySearchResult[]).filter((p): p is PropertySearchResult => !('_virtual' in p))
    await loadRentalModes(flattenSearchResults(properties))
  } catch {
    rentalUnits.value = { nuit: [], mois: [] }
    listingsError.value = true
  } finally {
    listingsLoading.value = false
    rentalLoading.value = false
  }
}

/* ---- Deux façons de louer : à la nuit / au mois — classées sur les vraies grilles tarifaires ---- */
type RentalKey = 'nuit' | 'mois'
/** `swatch` : pastille de couleur du mode dans le sélecteur ; `hint` : ce que le mode veut dire, sous le sélecteur. */
const RENTAL_META: Record<RentalKey, { label: string; eyebrow: string; hint: string; suffix: string; swatch: string }> = {
  nuit: {
    label: 'À la nuit',
    eyebrow: 'Courte durée',
    hint: 'Meublés prêts à vivre, réservation en ligne, sans bail.',
    suffix: '/ nuit',
    swatch: 'bg-clay-500'
  },
  mois: {
    label: 'Au mois',
    eyebrow: 'Longue durée',
    hint: 'Location classique : bail signé en ligne, caution séquestrée par Bayo.',
    suffix: '/ mois',
    swatch: 'bg-green-800'
  }
}
const RENTAL_KEYS: RentalKey[] = ['nuit', 'mois']
const rentalUnits = ref<Record<RentalKey, ListingCard[]>>({ nuit: [], mois: [] })
const rentalLoading = ref(true)

/**
 * UN seul sélecteur nuit / mois sur la page, sous la barre de recherche (et sous le héros sur
 * mobile) : il filtre les annonces, la recherche, les liens par ville. Avant, le même choix
 * revenait six fois (modale à l'arrivée, pastille flottante qui recouvrait « Rechercher » sur
 * mobile, bloc « l'autre mode », liens doublés par ville…). Le choix est retenu un an en cookie,
 * lu au rendu serveur, pour que la page s'affiche directement dans le bon mode ; la feuille de
 * recherche mobile (LayoutSearchSheet) le lit aussi.
 */
const rentalChoice = useCookie<string | null>('immo_rental_mode', {
  default: () => null,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365
})
const activeRental = ref<RentalKey>(rentalChoice.value === 'mois' ? 'mois' : 'nuit')
function chooseRental(key: RentalKey) {
  activeRental.value = key
  rentalChoice.value = key
}

async function loadRentalModes(cards: ListingCard[]) {
  const cache = rentalModeCache.value
  const modes = await mapLimited(cards, 6, async c => {
    const known = cache[c.unitId] ?? modeFromCard(c)
    if (known) return known
    try {
      const mode = classifyRental(await searchApi.fetchPricing(c.unitId), c.price)
      cache[c.unitId] = mode
      return mode
    } catch {
      return null
    }
  })
  // Aucun tarif lisible alors que des annonces existent : c'est une panne, pas une absence de logements.
  if (cards.length && modes.every(m => !m)) throw new Error('pricing unavailable')
  const nuit: ListingCard[] = []
  const mois: ListingCard[] = []
  cards.forEach((c, i) => {
    const m = modes[i]
    if (!m) return
    if (m.nightly !== null) nuit.push({ ...c, price: m.nightly })
    if (m.monthly !== null) mois.push({ ...c, price: m.monthly })
  })
  rentalUnits.value = { nuit: nuit.sort((a, b) => a.price - b.price), mois: mois.sort((a, b) => a.price - b.price) }
  // Aucun logement à la nuit mais des logements au mois, et aucun choix fait : la page s'ouvre au mois plutôt que vide.
  if (!nuit.length && mois.length && !rentalChoice.value) activeRental.value = 'mois'
}

/**
 * Sections par ville filtrées sur le mode choisi : un visiteur qui a choisi « À la nuit » ne voit
 * que des logements réservables à la nuit, au prix de la nuit. Un logement proposé dans les deux
 * modes apparaît dans les deux.
 */
const cityGroups = computed<CityGroup[]>(() => {
  const units = rentalUnits.value[activeRental.value]
  const names = [...new Set(units.map(u => u.cityName).filter(Boolean))]
  return names
    .map(name => ({ name, units: units.filter(u => u.cityName === name) }))
    .sort((a, b) => b.units.length - a.units.length)
    .slice(0, 4)
})

async function loadCities() {
  try {
    cities.value = await refData.fetchCities()
  } catch {
    // Sans référentiel : le menu « Ville » garde « Toutes », les raccourcis par ville se masquent.
    cities.value = []
  }
}

onMounted(() => {
  loadCities()
  loadCategories()
  loadListings()
  favorites.ensureLoaded()
})

const cityRails = ref<(HTMLElement | null)[]>([])
function setCityRail(index: number, el: unknown) {
  cityRails.value[index] = el as HTMLElement | null
}
function scrollCity(index: number, dir: 1 | -1) {
  cityRails.value[index]?.scrollBy({ left: dir * 464, behavior: 'smooth' })
}
function stackPhoto(group: CityGroup, index: 0 | 1) {
  return (group.units[index] ?? group.units[0])?.photoUrl ?? null
}

/** « Tout afficher » d'une ville : les mêmes logements que la rangée, donc dans le mode choisi. */
function seeAllCity(name: string) {
  navigateTo(cityLink(name))
}
/** Le mode suit jusqu'à la fiche : un logement proposé dans les deux modes s'y ouvre sur celui de la page. */
function openListing(l: ListingCard) {
  if (l.virtual || !l.propertyId) return
  navigateTo({ path: `/biens/${l.propertyId}`, query: { unit: l.unitId, mode: activeRental.value } })
}
async function onFavorite(l: ListingCard) {
  if (!l.propertyId) return
  const ok = await favorites.toggleProperty(l.propertyId)
  if (!ok && !useApiAuth().isAuthenticated()) navigateTo({ path: '/connexion', query: { redirect: '/' } })
}

/*
 * ---- Explorer par ville — suit le mode choisi pour la page : UN lien par ville, vers la
 * recherche de cette ville dans ce mode (plus de second lien vers l'autre mode). Chaque carte
 * dit ce qu'on trouvera en cliquant : nombre de logements et prix de départ, tirés des annonces
 * chargées plus haut. Une ville sans annonce n'envoie pas sur une recherche vide : elle propose
 * aux propriétaires d'y publier.
 */
const rankedCities = computed(() => rankCities(cities.value, [...rentalUnits.value.nuit, ...rentalUnits.value.mois].map(u => u.cityName).filter(Boolean)))
interface CityStats { count: number; from: number }
const cityStats = computed(() => {
  const stats = new Map<string, CityStats>()
  for (const u of rentalUnits.value[activeRental.value]) {
    const k = normalizeCity(u.cityName)
    const s = stats.get(k) ?? { count: 0, from: 0 }
    stats.set(k, { count: s.count + 1, from: u.price > 0 && (!s.from || u.price < s.from) ? u.price : s.from })
  }
  return (name: string): CityStats => stats.get(normalizeCity(name)) ?? { count: 0, from: 0 }
})
const exploreCities = computed(() => rankCities(cities.value, rentalUnits.value[activeRental.value].map(u => u.cityName).filter(Boolean)).slice(0, 6))
/** Le nombre et « pas encore d'annonce » ne sont sûrs que si toutes les annonces publiées ont été chargées. */
const statsReliable = computed(() => catalogComplete.value && !listingsError.value)
/** Recherche d'une ville dans le mode de la page — le nom brut est gardé pour le filtre de l'API. */
function cityLink(city: string) {
  return { path: '/recherche', query: { city, mode: activeRental.value } }
}
function plural(n: number, word: string) {
  return `${n} ${word}${n > 1 ? 's' : ''}`
}
const modeText = computed(() => (activeRental.value === 'nuit' ? 'à la nuit' : 'au mois'))
const allCitiesOpen = ref(false)
const citySearch = ref('')
const cityLetters = computed(() => {
  const q = normalizeCity(citySearch.value)
  const groups = new Map<string, { id: string; name: string }[]>()
  for (const c of [...cities.value].sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
    const k = normalizeCity(c.name)
    if (q && !k.includes(q)) continue
    const letter = k.charAt(0).toUpperCase()
    groups.set(letter, [...(groups.get(letter) ?? []), c])
  }
  return [...groups].map(([letter, list]) => ({ letter, cities: list }))
})
function openAllCities() {
  citySearch.value = ''
  allCitiesOpen.value = true
}

/* ---- Confiance (contenu éditorial, aligné sur ce que l'application fait réellement) ---- */
const TRUST_ITEMS = [
  { tint: 'bg-green-50', ink: 'text-green-700', icon: ShieldCheck, title: 'Caution séquestrée', text: "La caution est versée à Bayo, pas au propriétaire : ni lui ni vous ne pouvez y toucher pendant le bail. Son montant est visible des deux côtés." },
  { tint: 'bg-clay-100', ink: 'text-clay-700', icon: ClipboardCheck, title: 'État des lieux signé', text: "Pièce par pièce, photos à l'appui, signé par le locataire et le propriétaire dans l'application." },
  { tint: 'bg-info-bg', ink: 'text-info-fg', icon: Smartphone, title: 'Mobile Money suivi', text: 'MTN et Moov acceptés ; chaque paiement laisse une trace consultable des deux côtés.' }
]

const LANDLORD_POINTS = ['Publiez votre bien', 'Loyers encaissés par Mobile Money', 'Caution séquestrée par Bayo pendant le bail']
</script>

<template>
  <!--
    Colonne flexible : sur mobile (< md), les annonces passent juste sous le héros compact
    (`max-md:order-*` sur les catégories et la fin de page), pour qu'elles se voient dès le
    premier écran (390 × 844). Sur ordinateur, l'ordre du document est l'ordre affiché.
  -->
  <div class="flex animate-[im-fade_.35s_ease_backwards] flex-col">
    <div>
      <!-- Héros : compact sur mobile (titre court, sans formulaire), carrousel et formulaire sur ordinateur -->
      <section class="mx-auto max-w-[1240px] px-[26px] pt-4 md:pt-5">
        <div class="relative flex min-h-[150px] items-end overflow-hidden rounded-3xl md:min-h-[430px]">
          <div
            v-for="(idx, i) in HERO_PHOTO_INDEXES"
            :key="idx"
            class="absolute inset-0 transition-opacity duration-[900ms] ease-in-out"
            :style="heroStyle(idx, i)"
          />
          <!-- Voile sombre sur la photo : lisibilité du titre blanc. -->
          <div class="absolute inset-0 bg-[image:linear-gradient(180deg,rgba(18,60,41,0)_32%,rgba(18,60,41,.74)_100%)]" />
          <div class="relative w-full p-5 md:p-10 md:pb-16">
            <h1 v-reveal="{ y: 32, duration: .9 }" class="m-0 max-w-[620px] text-balance font-display text-[27px] font-extrabold leading-[1.08] tracking-hero text-white md:text-hero">
              <span class="md:hidden">Louez en confiance au Bénin.</span>
              <span class="hidden md:inline">Louez en toute confiance au Bénin.</span>
            </h1>
            <p v-reveal="{ y: 24, delay: .15, duration: .9 }" class="mb-0 mt-3.5 hidden max-w-[500px] text-[16.5px] leading-[1.5] text-white/90 md:block">
              Caution séquestrée par Bayo pendant le bail, état des lieux signé des deux côtés, propriétaires vérifiés.
            </p>
          </div>
          <div class="absolute bottom-[34px] right-[30px] z-[3] hidden gap-2 md:flex">
            <span
              v-for="(idx, i) in HERO_PHOTO_INDEXES"
              :key="idx"
              class="h-2 cursor-pointer rounded-pill transition-all"
              :style="{ width: heroIndex === i ? '26px' : '8px', background: heroIndex === i ? '#fff' : 'rgba(255,255,255,.45)' }"
              @click="heroIndex = i"
            />
          </div>
        </div>

        <div class="relative z-20 mx-auto mt-4 max-w-[940px] md:-mt-6">
          <!-- Barre de recherche : ordinateur seulement (sur mobile, l'en-tête « Où cherchez-vous ? » ouvre la même recherche) -->
          <div class="hidden rounded-pill border border-[var(--border-subtle)] bg-white py-2 pl-2.5 pr-2 shadow-panel md:flex md:items-stretch">
            <label class="flex flex-[1.6] cursor-text flex-col justify-center px-5 py-1.5">
              <span class="text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Où</span>
              <input v-model="query" placeholder="Nom, description…" class="mt-0.5 w-full border-0 bg-transparent text-[15px] font-semibold text-[var(--text-primary)] outline-none" @keydown.enter="runSearch">
            </label>
            <div class="my-2 w-px bg-sand-300" />
            <label class="relative flex flex-1 flex-col justify-center px-5 py-1.5">
              <span class="text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Ville</span>
              <select v-model="cityName" class="mt-0.5 cursor-pointer appearance-none border-0 bg-transparent text-[15px] font-semibold text-[var(--text-primary)] outline-none">
                <option value="">Toutes</option>
                <option v-for="c in cities" :key="c.id" :value="c.name">{{ displayName(c.name) }}</option>
              </select>
            </label>
            <div class="my-2 w-px bg-sand-300" />
            <label class="flex flex-1 cursor-text flex-col justify-center px-5 py-1.5">
              <span class="text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Budget max</span>
              <span class="mt-0.5 flex items-baseline gap-1.5">
                <input :value="budgetDisplay" inputmode="numeric" placeholder="Peu importe" aria-label="Budget maximum en FCFA" class="w-full min-w-0 border-0 bg-transparent font-mono text-[15px] font-semibold text-[var(--text-primary)] outline-none placeholder:font-body" @input="onBudgetInput" @keydown.enter="runSearch">
                <span v-if="budget" class="text-[12px] font-bold text-[var(--text-muted)]">FCFA</span>
              </span>
            </label>
            <button
              type="button"
              class="flex items-center justify-center gap-2.5 rounded-pill bg-[image:var(--action-primary)] px-7 text-[15px] font-bold text-white shadow-action transition-transform hover:scale-[1.03]"
              @click="runSearch"
            >
              <Search class="h-[18px] w-[18px] flex-none" :stroke-width="2.2" />Rechercher
            </button>
          </div>

          <!-- Le seul sélecteur nuit / mois de la page : il règle la recherche ci-dessus et les annonces ci-dessous. -->
          <div class="flex flex-col gap-2 md:mt-5 md:flex-row md:items-center md:justify-center md:gap-4">
            <div class="grid grid-cols-2 gap-1 rounded-pill bg-sand-200 p-1 md:inline-grid" role="radiogroup" aria-label="Type de location">
              <button
                v-for="key in RENTAL_KEYS"
                :key="key"
                type="button"
                role="radio"
                :aria-checked="activeRental === key"
                class="flex items-center justify-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold transition-all duration-[var(--duration-base)]"
                :class="activeRental === key ? 'bg-white text-green-800 shadow-card' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'"
                @click="chooseRental(key)"
              >
                <span class="h-2 w-2 flex-none rounded-pill" :class="RENTAL_META[key].swatch" aria-hidden="true" />{{ RENTAL_META[key].label }}
              </button>
            </div>
            <p class="m-0 hidden text-[13.5px] text-[var(--text-muted)] md:block">{{ RENTAL_META[activeRental].hint }}</p>
          </div>

          <div v-if="popularChips.length" class="mt-4 hidden flex-wrap items-center justify-center gap-2 md:flex">
            <span class="text-[12.5px] font-semibold text-[var(--text-faint)]">Populaire :</span>
            <button
              v-for="chip in popularChips"
              :key="chip.label"
              type="button"
              class="rounded-pill border border-[var(--border-default)] bg-white/70 px-3.5 py-2 text-[12.5px] font-semibold text-[var(--text-secondary)] transition-all hover:border-green-600 hover:text-green-700"
              @click="pickPopular(chip)"
            >{{ chip.label }}</button>
          </div>
        </div>
      </section>
    </div>

    <!-- Catégories — pictogrammes de plan, une tuile par type de logement (après les annonces sur mobile) -->
    <div class="max-md:order-1">
      <section v-reveal v-if="categoriesLoading || categories.length" class="mx-auto max-w-[1240px] px-[26px] pt-12">
        <h2 class="mb-5 mt-0 font-display text-title-2 font-bold tracking-title-2">Trouvez le lieu qui vous correspond</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <template v-if="categoriesLoading">
            <DataSkeletonCard v-for="i in 6" :key="i" :height="164" :lines="0" />
          </template>
          <template v-else>
            <button
              v-for="c in categories"
              :key="c.code"
              type="button"
              class="group flex flex-col items-start gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-4.5 text-left transition-[transform,border-color] duration-[var(--duration-base)] hover:-translate-y-0.5 hover:border-green-600"
              @click="pickCategory(c)"
            >
              <span class="grid h-[72px] w-[72px] place-items-center rounded-xl" :class="c.empty ? 'bg-sand-100 text-[var(--text-faint)]' : 'bg-green-50 text-green-700'">
                <SearchCategoryIcon :code="c.code" class="h-14 w-14" />
              </span>
              <span>
                <span class="block text-[15px] font-bold text-[var(--text-primary)]">{{ c.label }}</span>
                <span class="mt-0.5 block text-[12.5px] text-[var(--text-muted)]">{{ c.empty ? 'Aucune annonce pour l’instant' : 'Voir les logements' }}</span>
              </span>
            </button>
          </template>
        </div>
      </section>
    </div>

    <!-- Annonces du mode choisi, par ville -->
    <div>
      <!-- Erreur, ou aucun logement dans le mode choisi -->
      <section v-reveal v-if="!rentalLoading && (listingsError || !rentalUnits[activeRental].length)" class="mx-auto max-w-[1240px] px-[26px] pt-8 md:pt-11">
        <FeedbackAlertBanner v-if="listingsError" tone="danger">
          Impossible de charger les logements pour le moment.
          <button type="button" class="ml-2 font-bold underline" @click="loadListings">Réessayer</button>
        </FeedbackAlertBanner>
        <div v-else class="rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-5 py-8 text-center">
          <span class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Search class="h-5 w-5" :stroke-width="1.9" /></span>
          <p class="mb-0 mt-3 text-[13.5px] text-[var(--text-muted)]">Aucun logement {{ modeText }} parmi les annonces les plus récentes.</p>
          <NuxtLink :to="{ path: '/recherche', query: { mode: activeRental } }" class="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-green-700">Chercher dans toutes les annonces<ArrowRight class="h-4 w-4" :stroke-width="1.9" /></NuxtLink>
        </div>
      </section>

      <!-- Squelette pendant le chargement -->
      <section v-reveal v-if="listingsLoading || rentalLoading" class="mx-auto max-w-[1240px] px-[26px] pt-8 md:pt-11">
        <div class="mb-[18px] h-[23px] w-[220px] animate-[im-shimmer_1.3s_linear_infinite] rounded-pill bg-[linear-gradient(90deg,var(--color-sand-200)_25%,var(--color-sand-100)_50%,var(--color-sand-200)_75%)] bg-[length:460px_100%]" />
        <div class="flex gap-[18px] overflow-x-auto pb-1">
          <div v-for="i in 5" :key="i" class="w-[214px] flex-none">
            <DataSkeletonCard :height="186" />
          </div>
        </div>
      </section>

      <section v-reveal v-for="(group, gi) in (rentalLoading ? [] : cityGroups)" :key="`${activeRental}-${group.name}`" class="mx-auto max-w-[1240px] px-[26px] pt-8 md:pt-11">
        <div class="mb-[18px] flex items-center justify-between">
          <div class="flex min-w-0 items-center gap-3">
            <h2 class="m-0 truncate font-display text-[23px] font-bold tracking-[-.025em]">{{ displayName(group.name) }}</h2>
            <button type="button" class="grid h-[30px] w-[30px] flex-none place-items-center rounded-pill border border-[var(--border-default)] bg-white text-sm text-sand-900" :aria-label="`Tous les logements ${modeText} à ${displayName(group.name)}`" @click="seeAllCity(group.name)"><ArrowRight class="h-4 w-4" :stroke-width="1.9" /></button>
          </div>
          <div class="flex gap-2.5">
            <button type="button" class="grid h-9 w-9 place-items-center rounded-pill border border-[var(--border-default)] bg-white text-sm text-sand-900" aria-label="Précédents" @click="scrollCity(gi, -1)"><ChevronLeft class="h-4 w-4" :stroke-width="1.9" /></button>
            <button type="button" class="grid h-9 w-9 place-items-center rounded-pill border border-[var(--border-default)] bg-white text-sm text-sand-900" aria-label="Suivants" @click="scrollCity(gi, 1)"><ChevronRight class="h-4 w-4" :stroke-width="1.9" /></button>
          </div>
        </div>
        <div :ref="(el) => setCityRail(gi, el)" class="flex gap-[18px] overflow-x-auto pb-1" style="scrollbar-width: none">
          <div v-for="u in group.units" :key="u.unitId" class="w-[214px] flex-none">
            <SearchPropertyCard
              :listing="u"
              :price-suffix="RENTAL_META[activeRental].suffix"
              :favorite="u.propertyId ? favorites.isFavoriteProperty(u.propertyId) : false"
              @open="openListing(u)"
              @favorite="onFavorite(u)"
            />
          </div>
          <div
            class="flex h-[286px] w-[214px] flex-none cursor-pointer flex-col items-center justify-center gap-3.5 rounded-xl border border-[var(--border-subtle)] bg-white transition-shadow hover:shadow-raised"
            @click="seeAllCity(group.name)"
          >
            <div class="relative h-[52px] w-16">
              <div class="absolute left-2 top-0 h-11 w-11 rotate-[-8deg] rounded-sm bg-cover bg-center shadow-[0_2px_6px_rgba(0,0,0,.14)]" :style="stackPhoto(group, 0) ? { backgroundImage: `url(${stackPhoto(group, 0)})` } : {}" />
              <div class="absolute left-4 top-1.5 h-11 w-11 rotate-[7deg] rounded-sm bg-cover bg-center shadow-[0_2px_6px_rgba(0,0,0,.14)]" :style="stackPhoto(group, 1) ? { backgroundImage: `url(${stackPhoto(group, 1)})` } : {}" />
            </div>
            <span class="text-[14.5px] font-bold text-sand-900">Tout afficher</span>
          </div>
        </div>
      </section>
    </div>

    <div class="max-md:order-2">
      <!-- Explorer par ville : un lien par ville, dans le mode de la page -->
      <section v-reveal v-if="cities.length" class="mx-auto max-w-[1240px] px-[26px] pt-14">
        <div class="mb-5">
          <h2 class="m-0 font-display text-title-2 font-bold tracking-title-2">Explorer par ville</h2>
          <p class="mb-0 mt-1.5 text-[14.5px] leading-[1.5] text-[var(--text-muted)]">
            Logements {{ modeText }}, en {{ RENTAL_META[activeRental].eyebrow.toLowerCase() }}.
          </p>
        </div>
        <div v-if="rentalLoading" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="i in 6" :key="i" :class="{ 'max-sm:hidden': i > 4 }" class="h-[82px] animate-[im-pulse_1.6s_ease-in-out_infinite] rounded-2xl bg-sand-100" />
        </div>
        <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <template v-for="(c, i) in exploreCities" :key="`${activeRental}-${c.id}`">
            <!-- Aucune annonce dans ce mode (compte sûr) : pas de lien vers une recherche vide -->
            <div
              v-if="statsReliable && !cityStats(c.name).count"
              :class="{ 'max-sm:hidden': i >= 4 }"
              class="flex items-center gap-4 rounded-2xl border border-dashed border-[var(--border-default)] p-4"
            >
              <span class="grid h-12 w-12 flex-none place-items-center rounded-xl bg-sand-100 text-[var(--text-faint)]">
                <MapPin class="h-5 w-5" :stroke-width="1.9" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[16px] font-bold text-[var(--text-secondary)]">{{ displayName(c.name) }}</span>
                <span class="mt-0.5 block truncate text-[13px] text-[var(--text-muted)]">
                  Pas encore d'annonce {{ modeText }} · <NuxtLink to="/louer" class="font-semibold text-green-700 hover:underline">Publier ici</NuxtLink>
                </span>
              </span>
            </div>
            <NuxtLink
              v-else
              :to="cityLink(c.name)"
              :class="{ 'max-sm:hidden': i >= 4 }"
              class="group flex items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-4 transition-[border-color,box-shadow] duration-[var(--duration-base)] hover:border-green-600 hover:shadow-card"
            >
              <span class="grid h-12 w-12 flex-none place-items-center rounded-xl bg-green-50 text-green-700">
                <MapPin class="h-5 w-5" :stroke-width="1.9" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[16px] font-bold text-[var(--text-primary)]">{{ displayName(c.name) }}</span>
                <span class="mt-0.5 block text-[13px] leading-[1.4] text-[var(--text-muted)]">
                  {{ statsReliable ? plural(cityStats(c.name).count, 'logement') : 'Voir les logements' }}<template v-if="cityStats(c.name).from"> · dès <strong class="font-bold text-[var(--text-primary)]">{{ formatFcfaShort(cityStats(c.name).from) }}</strong> {{ RENTAL_META[activeRental].suffix }}</template>
                </span>
              </span>
              <span class="grid h-9 w-9 flex-none place-items-center rounded-pill bg-sand-100 text-[var(--text-secondary)] transition-colors group-hover:bg-green-600 group-hover:text-white">
                <ArrowRight class="h-4 w-4" :stroke-width="1.9" />
              </span>
            </NuxtLink>
          </template>
        </div>
        <button
          v-if="cities.length > exploreCities.length"
          type="button"
          class="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-pill border border-[var(--border-default)] bg-white px-5 py-3 text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:border-green-600 hover:text-green-700"
          @click="openAllCities"
        >
          <MapPin class="h-4 w-4" :stroke-width="2" />Toutes les villes ({{ cities.length }})
        </button>
      </section>

      <CoreModal :open="allCitiesOpen" title="Toutes les villes" width="720px" @close="allCitiesOpen = false">
        <p class="mb-3 mt-0 text-[14px] text-[var(--text-muted)]">Logements {{ modeText }}, dans les {{ cities.length }} communes du Bénin.</p>
        <label class="sticky top-0 z-10 -mx-1 flex items-center gap-2.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-3 focus-within:border-green-600">
          <Search class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="2" />
          <input v-model="citySearch" type="search" placeholder="Rechercher une ville…" aria-label="Rechercher une ville" class="w-full min-w-0 border-0 bg-transparent text-[15px] font-semibold text-[var(--text-primary)] outline-none">
        </label>
        <p v-if="!cityLetters.length" class="mb-1 mt-6 text-center text-[14px] text-[var(--text-muted)]">Aucune ville ne correspond à « {{ citySearch }} ».</p>
        <div v-for="g in cityLetters" :key="g.letter" class="mt-4">
          <p class="m-0 mb-1.5 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ g.letter }}</p>
          <div class="grid grid-cols-2 gap-1 sm:grid-cols-3">
            <NuxtLink
              v-for="c in g.cities"
              :key="c.id"
              :to="cityLink(c.name)"
              :class="statsReliable && !cityStats(c.name).count ? 'text-[var(--text-faint)]' : 'text-[var(--text-secondary)]'"
              class="flex min-w-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-[14px] font-semibold hover:bg-green-50 hover:text-green-700"
              @click="allCitiesOpen = false"
            >
              <span class="truncate">{{ displayName(c.name) }}</span>
              <span v-if="statsReliable && cityStats(c.name).count" class="flex-none rounded-pill bg-green-50 px-1.5 text-[11.5px] font-bold text-green-700">{{ cityStats(c.name).count }}</span>
            </NuxtLink>
          </div>
        </div>
      </CoreModal>

      <!-- Confiance : l'argument à gauche, les trois protections en liste à droite -->
      <section v-reveal class="mx-auto max-w-[1240px] px-[26px] pt-14">
        <div class="grid grid-cols-1 gap-8 rounded-3xl border border-[var(--border-subtle)] bg-white p-6 sm:p-10 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] lg:gap-14">
          <div>
            <p class="m-0 text-[12.5px] font-black uppercase tracking-[.08em] text-clay-500">Pourquoi Bayo</p>
            <h2 class="mb-0 mt-2.5 font-display text-title-2 font-bold tracking-title-2 text-[var(--text-primary)]">Louer, sans la peur de se faire avoir</h2>
            <p class="mb-0 mt-3 max-w-[420px] text-[15.5px] leading-[1.6] text-[var(--text-secondary)]">
              Trois protections concrètes contre la caution gardée par le bailleur et l'état des lieux contesté.
            </p>
          </div>
          <ul class="m-0 flex list-none flex-col divide-y divide-[var(--border-subtle)] p-0">
            <li v-for="t in TRUST_ITEMS" :key="t.title" class="flex gap-4 py-5 first:pt-0 last:pb-0">
              <span class="grid h-11 w-11 flex-none place-items-center rounded-lg" :class="[t.tint, t.ink]"><component :is="t.icon" class="h-5 w-5" :stroke-width="1.9" /></span>
              <div>
                <p class="m-0 font-display text-lg font-bold tracking-[-.02em] text-[var(--text-primary)]">{{ t.title }}</p>
                <p class="mb-0 mt-1.5 text-sm leading-[1.6] text-[var(--text-muted)]">{{ t.text }}</p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <!-- CTA bailleur -->
      <section v-reveal class="mx-auto max-w-[1240px] px-[26px] pt-11">
        <div class="relative overflow-hidden rounded-3xl bg-green-900 p-7 sm:p-10">
          <SearchCategoryIcon code="maison" class="pointer-events-none absolute -bottom-12 -right-8 h-[280px] w-[280px] text-white/[.06]" />
          <div class="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p class="m-0 text-[12.5px] font-black uppercase tracking-[.08em] text-clay-300">Propriétaires</p>
              <h2 class="mb-0 mt-2.5 font-display text-[30px] font-bold tracking-[-.03em] text-white">Vous avez un bien à louer ?</h2>
              <ul class="m-0 mt-4 flex list-none flex-col gap-2.5 p-0 sm:flex-row sm:flex-wrap sm:gap-x-6">
                <li v-for="point in LANDLORD_POINTS" :key="point" class="flex items-center gap-2.5 text-[14.5px] text-white/[.86]">
                  <span class="grid h-5 w-5 flex-none place-items-center rounded-pill bg-white/[.12] text-clay-300"><Check class="h-3 w-3" :stroke-width="3" /></span>
                  {{ point }}
                </li>
              </ul>
            </div>
            <NuxtLink
              to="/louer"
              class="inline-flex items-center gap-2 self-start whitespace-nowrap rounded-md bg-clay-500 px-7 py-4 text-[15px] font-bold text-white shadow-accent transition-transform hover:scale-[1.03] lg:self-auto"
            >Publier une annonce<ArrowRight class="h-4 w-4" :stroke-width="2.2" /></NuxtLink>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
