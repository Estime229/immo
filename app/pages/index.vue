<script setup lang="ts">
import { ArrowRight, ArrowUp, Check, ChevronLeft, ChevronRight, ClipboardCheck, Search, ShieldCheck, Smartphone } from '@lucide/vue'
import type { PropertySearchResult } from '~/types/property'
import { flattenSearchResults, type ListingCard } from '~/utils/propertyListing'
import { classifyRental, mapLimited, type RentalMode } from '~/utils/rentalMode'
import { buildSearchQuery, digitsOnly } from '~/utils/searchPill'

const { photos, formatFcfaShort } = useProperties()
const searchApi = usePropertySearchApi()
const refData = useReferenceData()
const favorites = usePropertyFavorites()

/* ---- Barre de recherche ---- */
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

function runSearch() {
  navigateTo({ path: '/recherche', query: buildSearchQuery({ q: query.value, city: cityName.value, budget: budget.value, mode: 'tous' }) })
}

const popularChips = computed(() => cities.value.slice(0, 4).map(c => ({ label: `Logements à ${c.name}`, city: c.name })))
function pickPopular(chip: { city: string }) {
  navigateTo({ path: '/recherche', query: { city: chip.city } })
}

/* ---- Héros — carrousel (purement décoratif, aucune donnée à intégrer) ---- */
const HERO_PHOTO_INDEXES = [0, 2, 6]
const heroIndex = ref(0)
let heroTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  heroTimer = setInterval(() => { heroIndex.value = (heroIndex.value + 1) % HERO_PHOTO_INDEXES.length }, 5000)
})
onUnmounted(() => clearInterval(heroTimer))

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
  { code: 'studio', label: 'Studios', photoIndex: 4 },
  { code: 'chambre_salon', label: 'Chambre-salon', photoIndex: 2 },
  { code: '2_chambres_salon', label: '2 Chambres-salon', photoIndex: 6 },
  { code: '3_chambres_salon', label: '3 Chambres-salon', photoIndex: 5 },
  { code: '4_chambres_salon', label: '4 Chambres-salon', photoIndex: 1 },
  { code: 'maison', label: 'Maisons', photoIndex: 2 }
] as const

/**
 * Pas de compte affiché sur les tuiles : le compte serveur (`GET /property/search?unit_type_id=`)
 * ne sait pas filtrer par mode nuit/mois, il contredirait le reste de la page une fois un mode choisi.
 */
interface CategoryTile { label: string; empty: boolean; bg: string; unitTypeId: string }
const categories = ref<CategoryTile[]>([])
const categoriesLoading = ref(true)
/** Identifiant de chaque code UNIT_TYPE connu — sert aussi aux idées de location plus bas. */
const unitTypeIds = ref<Record<string, string>>({})

async function loadCategories() {
  categoriesLoading.value = true
  try {
    const unitTypes = await refData.fetchRef('UNIT_TYPE')
    unitTypeIds.value = Object.fromEntries(unitTypes.map(u => [u.code, u.id]))
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
      label: r.label,
      empty: r.count === 0,
      bg: r.count === 0 ? 'linear-gradient(150deg, var(--color-green-600), var(--color-green-900))' : (photos[r.photoIndex] ?? ''),
      unitTypeId: r.unitTypeId
    }))
  } catch {
    // Référentiel indisponible : sans identifiant de type, aucune tuile ne mènerait à une vraie recherche — la section se masque.
    categories.value = []
  } finally {
    categoriesLoading.value = false
  }
}

const catRail = ref<HTMLElement | null>(null)
function scrollCat(dir: 1 | -1) {
  catRail.value?.scrollBy({ left: dir * 464, behavior: 'smooth' })
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

async function loadListings() {
  listingsLoading.value = true
  rentalLoading.value = true
  listingsError.value = false
  try {
    const res = await searchApi.search({ limit: LISTING_LIMIT, sort: 'newest' })
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

/* ---- Deux façons de louer : à la nuit / au mois — moodboard classé sur les vraies grilles tarifaires ---- */
type RentalKey = 'nuit' | 'mois'
/**
 * Visuels éditoriaux, pas les photos des annonces : celles-ci sont déposées
 * librement par les propriétaires (et, sur l'instance de test, n'importe quoi)
 * — elles restent dans le rail d'annonces réelles juste en dessous. Une photo
 * principale, un détail recadré, un aplat de couleur portant les mots-clés :
 * la composition classique d'une planche d'ambiance.
 */
interface MoodImage { bg: string; size: string; pos: string }
const RENTAL_META: Record<RentalKey, { label: string; eyebrow: string; tagline: string; suffix: string; main: MoodImage; detail: MoodImage; swatch: string; keywords: string[] }> = {
  nuit: {
    label: 'À la nuit',
    eyebrow: 'Courte durée',
    tagline: 'Meublés prêts à vivre, pour quelques nuits ou quelques semaines.',
    suffix: '/ nuit',
    main: { bg: 'url(/images/hero/hero-3.jpg)', size: 'cover', pos: 'center 62%' },
    detail: { bg: 'url(/images/hero/hero-3.jpg)', size: '320%', pos: '8% 78%' },
    swatch: 'bg-clay-500',
    keywords: ['Meublé', 'Réservation en ligne', 'Sans bail']
  },
  mois: {
    label: 'Au mois',
    eyebrow: 'Longue durée',
    tagline: 'Location classique : bail signé en ligne, caution séquestrée par Immo.',
    suffix: '/ mois',
    main: { bg: 'url(/images/hero/hero-1.jpg)', size: 'cover', pos: '62% center' },
    detail: { bg: 'url(/images/hero/hero-2.jpg)', size: 'cover', pos: 'center' },
    swatch: 'bg-green-800',
    keywords: ['Bail signé', 'Caution séquestrée', 'Loyer Mobile Money']
  }
}
function moodStyle(m: MoodImage) {
  return { backgroundImage: m.bg, backgroundSize: m.size, backgroundPosition: m.pos }
}
const RENTAL_KEYS: RentalKey[] = ['nuit', 'mois']
const rentalUnits = ref<Record<RentalKey, ListingCard[]>>({ nuit: [], mois: [] })
const rentalLoading = ref(true)
const activeRental = ref<RentalKey>('nuit')

async function loadRentalModes(cards: ListingCard[]) {
  const cache = rentalModeCache.value
  const modes = await mapLimited(cards, 6, async c => {
    const known = cache[c.unitId]
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
  if (!nuit.length && mois.length) activeRental.value = 'mois'
}

function rentalFrom(key: RentalKey): string {
  const prices = rentalUnits.value[key].map(u => u.price).filter(p => p > 0)
  return prices.length ? formatFcfaShort(Math.min(...prices)) : ''
}
function rentalCount(key: RentalKey): string {
  const n = rentalUnits.value[key].length
  return `${n} logement${n > 1 ? 's' : ''}`
}
/**
 * Sections par ville filtrées sur le mode choisi plus haut : un visiteur qui
 * a cliqué « À la nuit » ne voit plus que des logements réservables à la nuit,
 * au prix de la nuit. Un logement proposé dans les deux modes apparaît dans les deux.
 */
const cityGroups = computed<CityGroup[]>(() => {
  const units = rentalUnits.value[activeRental.value]
  const names = [...new Set(units.map(u => u.cityName).filter(Boolean))]
  return names
    .map(name => ({ name, units: units.filter(u => u.cityName === name) }))
    .sort((a, b) => b.units.length - a.units.length)
    .slice(0, 4)
})

/* ---- En fin de page : un aperçu de l'autre mode, pour qui s'est trompé de porte ---- */
const otherRental = computed<RentalKey>(() => (activeRental.value === 'nuit' ? 'mois' : 'nuit'))
const otherUnits = computed(() => rentalUnits.value[otherRental.value].slice(0, 8))
const rentalSection = ref<HTMLElement | null>(null)
function switchToOther() {
  activeRental.value = otherRental.value
  const el = rentalSection.value
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' })
}

/**
 * Rappel flottant : une fois les deux cartes « à la nuit / au mois » scrollées
 * hors écran, tout le reste de la page (villes, annonces) reste filtré sur le
 * choix fait plus haut — sans ce rappel, rien ne le redit une fois qu'on a
 * défilé. N'apparaît qu'en scrollant *au-delà* des cartes (top < 0), jamais
 * avant de les atteindre.
 */
const rentalToggleEl = ref<HTMLElement | null>(null)
const showRentalReminder = ref(false)
function scrollToRentalToggle() {
  const el = rentalToggleEl.value
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' })
}

/** IntersectionObserver écarté ici : sur cette page, son tout premier callback (état initial, avant
 * tout scroll) n'arrivait pas de façon fiable — reproduit en direct, le badge ne s'affichait jamais
 * tant qu'aucun clic n'avait eu lieu avant le scroll. Un simple listener de scroll, throttlé sur
 * `requestAnimationFrame`, est trivial à vérifier et ne dépend d'aucun état initial de l'observer. */
let rentalScrollTicking = false
function onRentalScroll() {
  if (rentalScrollTicking) return
  rentalScrollTicking = true
  requestAnimationFrame(() => {
    const el = rentalToggleEl.value
    showRentalReminder.value = !!el && el.getBoundingClientRect().bottom < 0
    rentalScrollTicking = false
  })
}

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

onMounted(() => window.addEventListener('scroll', onRentalScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onRentalScroll))

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

function seeAllCity(name: string) {
  navigateTo({ path: '/recherche', query: { city: name } })
}
function openListing(l: ListingCard) {
  if (l.virtual || !l.propertyId) return
  navigateTo(`/biens/${l.propertyId}?unit=${l.unitId}`)
}
async function onFavorite(l: ListingCard) {
  if (!l.propertyId) return
  const ok = await favorites.toggleProperty(l.propertyId)
  if (!ok && !useApiAuth().isAuthenticated()) navigateTo({ path: '/connexion', query: { redirect: '/' } })
}

/*
 * ---- Idées de location — chaque lien est une vraie recherche (ville du référentiel + mode ou type de
 * logement), lue par /recherche. Avant : dix villes et sous-titres écrits en dur (« bord de mer »…),
 * et un clic qui ne cherchait que le nom de la ville dans le texte des annonces.
 */
type IdeaKey = 'nuit' | 'mois' | 'studio' | 'maison'
const IDEA_TABS: { value: IdeaKey; label: string; kind: string }[] = [
  { value: 'nuit', label: 'À la nuit', kind: 'Logements à la nuit' },
  { value: 'mois', label: 'Au mois', kind: 'Logements au mois' },
  { value: 'studio', label: 'Studios', kind: 'Studios' },
  { value: 'maison', label: 'Maisons', kind: 'Maisons' }
]
/** Les onglets « type » n'apparaissent que si le code existe dans le référentiel UNIT_TYPE. */
const ideaTabs = computed(() => IDEA_TABS.filter(t => t.value === 'nuit' || t.value === 'mois' || !!unitTypeIds.value[t.value]))
const ideaTab = ref<string>('nuit')
const ideaKind = computed(() => IDEA_TABS.find(t => t.value === ideaTab.value)?.kind ?? '')
function ideaLink(city: string) {
  const t = ideaTab.value as IdeaKey
  if (t === 'nuit' || t === 'mois') return { path: '/recherche', query: { city, mode: t } }
  return { path: '/recherche', query: { city, unit_type_id: unitTypeIds.value[t] } }
}

/* ---- Confiance (contenu éditorial, aligné sur ce que l'application fait réellement) ---- */
const TRUST_ITEMS = [
  { tint: 'bg-green-50', ink: 'text-green-700', icon: ShieldCheck, title: 'Caution séquestrée', text: "La caution est versée à Immo, pas au propriétaire : ni lui ni vous ne pouvez y toucher pendant le bail. Son montant est visible des deux côtés." },
  { tint: 'bg-clay-100', ink: 'text-clay-700', icon: ClipboardCheck, title: 'État des lieux signé', text: "Pièce par pièce, photos à l'appui, signé par le locataire et le propriétaire dans l'application." },
  { tint: 'bg-info-bg', ink: 'text-info-fg', icon: Smartphone, title: 'Mobile Money suivi', text: 'MTN et Moov acceptés ; chaque paiement laisse une trace consultable des deux côtés.' }
]
</script>

<template>
  <div class="animate-[im-fade_.35s_ease_backwards]">
    <!-- Héros -->
    <section class="mx-auto max-w-[1240px] px-[26px] pt-5">
      <div class="relative flex min-h-[430px] items-end overflow-hidden rounded-3xl">
        <div
          v-for="(idx, i) in HERO_PHOTO_INDEXES"
          :key="idx"
          class="absolute inset-0 bg-cover bg-center transition-opacity duration-[900ms] ease-in-out"
          :style="{ backgroundImage: photos[idx], opacity: heroIndex === i ? 1 : 0 }"
        />
        <div class="absolute inset-0 bg-[image:linear-gradient(180deg,rgba(18,60,41,0)_32%,rgba(18,60,41,.74)_100%)]" />
        <div class="relative w-full p-6 pb-16 sm:p-10">
          <h1 class="m-0 max-w-[620px] text-balance font-display text-[38px] font-extrabold leading-[1.04] tracking-hero text-white sm:text-hero">
            Louez en toute confiance au Bénin.
          </h1>
          <p class="mb-0 mt-3.5 max-w-[500px] text-[15px] leading-[1.5] text-white/90 sm:text-[16.5px]">
            Caution séquestrée par Immo pendant le bail, état des lieux signé des deux côtés, propriétaires vérifiés.
          </p>
        </div>
        <div class="absolute bottom-[38px] right-6 z-[3] flex gap-2 sm:bottom-[34px] sm:right-[30px]">
          <span
            v-for="(idx, i) in HERO_PHOTO_INDEXES"
            :key="idx"
            class="h-2 cursor-pointer rounded-pill transition-all"
            :style="{ width: heroIndex === i ? '26px' : '8px', background: heroIndex === i ? '#fff' : 'rgba(255,255,255,.45)' }"
            @click="heroIndex = i"
          />
        </div>
      </div>

      <!-- Barre de recherche -->
      <div class="relative z-20 mx-auto -mt-6 max-w-[940px]">
        <div class="flex flex-col gap-1 rounded-2xl border border-[var(--border-subtle)] bg-white p-2.5 shadow-panel sm:flex-row sm:items-stretch sm:gap-0 sm:rounded-pill sm:py-2 sm:pl-2.5 sm:pr-2">
          <label class="flex flex-[1.6] cursor-text flex-col justify-center px-4 py-1.5 sm:px-5">
            <span class="text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Où</span>
            <input v-model="query" placeholder="Nom, description…" class="mt-0.5 w-full border-0 bg-transparent text-[15px] font-semibold text-[var(--text-primary)] outline-none" @keydown.enter="runSearch">
          </label>
          <div class="mx-1 h-px w-auto bg-sand-300 sm:mx-0 sm:my-2 sm:h-auto sm:w-px" />
          <label class="relative flex flex-1 flex-col justify-center px-4 py-1.5 sm:px-5">
            <span class="text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Ville</span>
            <select v-model="cityName" class="mt-0.5 cursor-pointer appearance-none border-0 bg-transparent text-[15px] font-semibold text-[var(--text-primary)] outline-none">
              <option value="">Toutes</option>
              <option v-for="c in cities" :key="c.id" :value="c.name">{{ c.name }}</option>
            </select>
          </label>
          <div class="mx-1 h-px w-auto bg-sand-300 sm:mx-0 sm:my-2 sm:h-auto sm:w-px" />
          <label class="flex flex-1 cursor-text flex-col justify-center px-4 py-1.5 sm:px-5">
            <span class="text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Budget max</span>
            <span class="mt-0.5 flex items-baseline gap-1.5">
              <input :value="budgetDisplay" inputmode="numeric" placeholder="Peu importe" aria-label="Budget maximum en FCFA" class="w-full min-w-0 border-0 bg-transparent font-mono text-[15px] font-semibold text-[var(--text-primary)] outline-none placeholder:font-body" @input="onBudgetInput" @keydown.enter="runSearch">
              <span v-if="budget" class="text-[12px] font-bold text-[var(--text-muted)]">FCFA</span>
            </span>
          </label>
          <button
            type="button"
            class="flex items-center justify-center gap-2.5 rounded-pill bg-[image:var(--action-primary)] px-7 py-3.5 text-[15px] font-bold text-white shadow-action transition-transform hover:scale-[1.03] sm:py-0"
            @click="runSearch"
          >
            <Search class="h-[18px] w-[18px] flex-none" :stroke-width="2.2" />Rechercher
          </button>
        </div>
        <div v-if="popularChips.length" class="mt-4 flex flex-wrap items-center justify-center gap-2">
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

    <!-- Deux façons de louer — moodboard -->
    <section ref="rentalSection" class="mx-auto max-w-[1240px] px-[26px] pt-12">
      <div class="mb-5 max-w-[640px]">
        <p class="m-0 text-[12.5px] font-black uppercase tracking-[.08em] text-clay-500">Deux façons de louer</p>
        <h2 class="mb-0 mt-2 font-display text-title-2 font-bold tracking-title-2">À la nuit ou au mois ?</h2>
        <p class="mb-0 mt-2 text-[14.5px] text-[var(--text-muted)]">Les logements présentés sur toute la page suivent votre choix.</p>
      </div>

      <div ref="rentalToggleEl" class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <button
          v-for="key in RENTAL_KEYS"
          :key="key"
          type="button"
          :aria-pressed="activeRental === key"
          class="group relative overflow-hidden rounded-3xl text-left outline-none transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-green-600"
          :class="activeRental === key ? 'shadow-panel ring-[3px] ring-green-600 ring-offset-2 ring-offset-[var(--surface-page)]' : 'shadow-card'"
          @click="activeRental = key"
        >
          <div class="grid h-[250px] grid-cols-3 grid-rows-2 gap-1.5 bg-[var(--surface-page)] sm:h-[310px]">
            <div class="relative col-span-2 row-span-2 overflow-hidden">
              <div class="absolute inset-0 bg-sand-300 bg-no-repeat transition-transform duration-500 group-hover:scale-[1.03]" :style="moodStyle(RENTAL_META[key].main)" />
              <div class="pointer-events-none absolute inset-0 bg-[image:linear-gradient(180deg,rgba(18,29,24,0)_28%,rgba(18,29,24,.84)_100%)]" />
            </div>
            <div class="bg-sand-300 bg-no-repeat" :style="moodStyle(RENTAL_META[key].detail)" />
            <div class="flex flex-col justify-end gap-1 p-3 sm:p-4" :class="RENTAL_META[key].swatch">
              <span v-for="k in RENTAL_META[key].keywords" :key="k" class="text-[11.5px] font-bold leading-tight text-white/[.92] sm:text-[12.5px]">{{ k }}</span>
            </div>
          </div>
          <span
            v-if="activeRental === key"
            class="absolute right-4 top-4 inline-flex items-center gap-1 rounded-pill bg-white px-3 py-1.5 text-[11.5px] font-black text-green-800"
          ><Check class="h-3.5 w-3.5" :stroke-width="2.6" />Sélectionné</span>
          <div class="pointer-events-none absolute bottom-0 left-0 w-2/3 p-4 sm:p-6">
            <span class="inline-block rounded-pill bg-white/[.18] px-3 py-1 text-[11px] font-black uppercase tracking-[.06em] text-white backdrop-blur-[4px]">{{ RENTAL_META[key].eyebrow }}</span>
            <p class="mb-0 mt-2.5 font-display text-[28px] font-extrabold leading-none tracking-[-.03em] text-white sm:text-[34px]">{{ RENTAL_META[key].label }}</p>
            <p class="mb-0 mt-2 hidden max-w-[380px] text-[14px] leading-[1.5] text-white/[.86] sm:block">{{ RENTAL_META[key].tagline }}</p>
            <p class="mb-0 mt-3 text-[13px] font-bold text-white">
              <template v-if="rentalLoading">Chargement…</template>
              <template v-else-if="listingsError">Logements indisponibles pour le moment</template>
              <template v-else>
                {{ rentalCount(key) }}<template v-if="rentalFrom(key)"> · dès <span class="font-mono">{{ rentalFrom(key) }}</span> {{ RENTAL_META[key].suffix }}</template>
              </template>
            </p>
          </div>
        </button>
      </div>

      <div class="mt-5">
        <div v-if="rentalLoading" class="flex gap-[18px] overflow-x-auto pb-1">
          <div v-for="i in 5" :key="i" class="w-[214px] flex-none">
            <DataSkeletonCard :height="186" />
          </div>
        </div>
        <div v-if="!rentalLoading && rentalUnits[activeRental].length" class="mb-3 flex justify-end">
          <NuxtLink :to="{ path: '/recherche', query: { mode: activeRental } }" class="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-green-700 underline-offset-4 hover:underline">
            Voir tous les logements {{ activeRental === 'nuit' ? 'à la nuit' : 'au mois' }}<ArrowRight class="h-4 w-4" :stroke-width="1.9" />
          </NuxtLink>
        </div>
        <FeedbackAlertBanner v-if="!rentalLoading && listingsError" tone="danger">
          Impossible de charger les logements pour le moment.
          <button type="button" class="ml-2 font-bold underline" @click="loadListings">Réessayer</button>
        </FeedbackAlertBanner>
        <div v-else-if="!rentalLoading && !rentalUnits[activeRental].length" class="rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-5 py-8 text-center">
          <span class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Search class="h-5 w-5" :stroke-width="1.9" /></span>
          <p class="mb-0 mt-3 text-[13.5px] text-[var(--text-muted)]">Aucun logement {{ activeRental === 'nuit' ? 'à la nuit' : 'au mois' }} parmi les annonces les plus récentes.</p>
          <NuxtLink :to="{ path: '/recherche', query: { mode: activeRental } }" class="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-green-700">Chercher dans toutes les annonces<ArrowRight class="h-4 w-4" :stroke-width="1.9" /></NuxtLink>
        </div>
        <div v-if="!rentalLoading && rentalUnits[activeRental].length" class="flex gap-[18px] overflow-x-auto pb-1" style="scrollbar-width: none">
          <div v-for="u in rentalUnits[activeRental]" :key="`${activeRental}-${u.unitId}`" class="w-[214px] flex-none">
            <SearchPropertyCard
              :listing="u"
              :price-suffix="RENTAL_META[activeRental].suffix"
              :favorite="u.propertyId ? favorites.isFavoriteProperty(u.propertyId) : false"
              @open="openListing(u)"
              @favorite="onFavorite(u)"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Carrousel de catégories -->
    <section v-if="categoriesLoading || categories.length" class="mx-auto max-w-[1240px] px-[26px] pt-12">
      <div class="mb-5 flex items-center justify-between">
        <h2 class="m-0 font-display text-title-2 font-bold tracking-title-2">Trouvez le lieu qui vous correspond</h2>
        <div class="flex gap-2.5">
          <button type="button" class="grid h-11 w-11 place-items-center rounded-pill border border-[var(--border-default)] bg-white text-base transition-all hover:border-green-600 hover:text-green-700" aria-label="Catégories précédentes" @click="scrollCat(-1)"><ChevronLeft class="h-[18px] w-[18px]" :stroke-width="1.9" /></button>
          <button type="button" class="grid h-11 w-11 place-items-center rounded-pill border border-[var(--border-default)] bg-white text-base transition-all hover:border-green-600 hover:text-green-700" aria-label="Catégories suivantes" @click="scrollCat(1)"><ChevronRight class="h-[18px] w-[18px]" :stroke-width="1.9" /></button>
        </div>
      </div>
      <div v-if="categoriesLoading" class="flex gap-4 overflow-x-auto pb-1.5">
        <div v-for="i in 6" :key="i" class="w-[216px] flex-none">
          <DataSkeletonCard :height="290" :lines="0" />
        </div>
      </div>
      <div v-else ref="catRail" class="scrollbar-none flex gap-4 overflow-x-auto pb-1.5" style="scrollbar-width: none">
        <div
          v-for="c in categories"
          :key="c.label"
          class="relative h-[290px] w-[216px] flex-none cursor-pointer overflow-hidden rounded-xl bg-cover bg-center transition-transform duration-[var(--duration-base)] hover:-translate-y-1"
          :style="{ backgroundImage: c.bg }"
          @click="pickCategory(c)"
        >
          <div class="absolute inset-0 bg-[image:linear-gradient(180deg,rgba(18,29,24,0)_42%,rgba(18,29,24,.72)_100%)]" />
          <div v-if="c.empty" class="absolute inset-0 grid place-items-center">
            <div class="flex flex-col gap-1.5 opacity-50">
              <span class="h-[9px] w-[34px] rounded-[3px] border-2 border-white" />
              <span class="h-[9px] w-[34px] rounded-[3px] border-2 border-white" />
              <span class="h-[9px] w-[34px] rounded-[3px] border-2 border-white" />
            </div>
          </div>
          <div class="absolute inset-x-[18px] bottom-[18px]">
            <p class="m-0 text-lg font-bold tracking-[-.01em] text-white">{{ c.label }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Sections par ville — squelette pendant le chargement -->
    <section v-if="listingsLoading || rentalLoading" class="mx-auto max-w-[1240px] px-[26px] pt-11">
      <div class="mb-[18px] h-[23px] w-[220px] animate-[im-shimmer_1.3s_linear_infinite] rounded-pill bg-[linear-gradient(90deg,var(--color-sand-200)_25%,var(--color-sand-100)_50%,var(--color-sand-200)_75%)] bg-[length:460px_100%]" />
      <div class="flex gap-[18px] overflow-x-auto pb-1">
        <div v-for="i in 5" :key="i" class="w-[214px] flex-none">
          <DataSkeletonCard :height="186" />
        </div>
      </div>
    </section>

    <!-- Sections par ville -->
    <section v-for="(group, gi) in (rentalLoading ? [] : cityGroups)" :key="`${activeRental}-${group.name}`" class="mx-auto max-w-[1240px] px-[26px] pt-11">
      <div class="mb-[18px] flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h2 class="m-0 font-display text-[23px] font-bold tracking-[-.025em]">{{ group.name }}</h2>
          <button type="button" class="grid h-[30px] w-[30px] place-items-center rounded-pill border border-[var(--border-default)] bg-white text-sm text-sand-900" :aria-label="`Tous les logements à ${group.name}`" @click="seeAllCity(group.name)"><ArrowRight class="h-4 w-4" :stroke-width="1.9" /></button>
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

    <!-- L'autre mode de location, en fin de parcours -->
    <section v-if="!rentalLoading && otherUnits.length" class="mx-auto max-w-[1240px] px-[26px] pt-14">
      <div class="rounded-3xl border border-[var(--border-subtle)] bg-white p-6 sm:p-8">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div class="max-w-[560px]">
            <p class="m-0 text-[12.5px] font-black uppercase tracking-[.08em] text-clay-500">{{ RENTAL_META[otherRental].eyebrow }}</p>
            <h2 class="mb-0 mt-2 font-display text-[26px] font-bold tracking-[-.03em]">Vous cherchez plutôt {{ otherRental === 'nuit' ? 'à la nuit' : 'au mois' }} ?</h2>
            <p class="mb-0 mt-2 text-[14.5px] leading-[1.55] text-[var(--text-muted)]">{{ RENTAL_META[otherRental].tagline }}</p>
          </div>
          <button type="button" class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-[var(--border-default)] bg-white px-5 py-3 text-[13.5px] font-bold text-green-700 transition-colors hover:border-green-600" @click="switchToOther">
            Afficher la page {{ otherRental === 'nuit' ? 'à la nuit' : 'au mois' }}<ArrowUp class="h-4 w-4" :stroke-width="1.9" />
          </button>
        </div>
        <div class="flex gap-[18px] overflow-x-auto pb-1" style="scrollbar-width: none">
          <div v-for="u in otherUnits" :key="`other-${otherRental}-${u.unitId}`" class="w-[214px] flex-none">
            <SearchPropertyCard
              :listing="u"
              :price-suffix="RENTAL_META[otherRental].suffix"
              :favorite="u.propertyId ? favorites.isFavoriteProperty(u.propertyId) : false"
              @open="openListing(u)"
              @favorite="onFavorite(u)"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Idées de location : villes du référentiel × mode ou type réel -->
    <section v-if="cities.length" class="mx-auto max-w-[1240px] px-[26px] pt-14">
      <h2 class="m-0 font-display text-title-2 font-bold tracking-title-2">Des idées pour votre prochaine location</h2>
      <div class="-mx-[26px] my-[18px] overflow-x-auto px-[26px] [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <FormsSegmentedControl v-model="ideaTab" :options="ideaTabs" size="sm" />
      </div>
      <div class="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <NuxtLink
          v-for="c in cities"
          :key="`${ideaTab}-${c.id}`"
          :to="ideaLink(c.name)"
          class="group flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-white px-4.5 py-3.5 transition-colors hover:border-[var(--border-default)]"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[14.5px] font-bold text-[var(--text-primary)]">{{ c.name }}</span>
            <span class="mt-0.5 block truncate text-[13px] text-[var(--text-muted)]">{{ ideaKind }}</span>
          </span>
          <ArrowRight class="h-4 w-4 flex-none text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-green-700" :stroke-width="1.9" />
        </NuxtLink>
      </div>
    </section>

    <!-- Confiance -->
    <section class="mx-auto max-w-[1240px] px-[26px] pt-14">
      <div class="mb-8 max-w-[560px]">
        <p class="m-0 text-[12.5px] font-black uppercase tracking-[.08em] text-clay-500">Pourquoi Immo</p>
        <h2 class="mb-0 mt-2.5 font-display text-[29px] font-bold tracking-[-.03em] text-clay-900">Louer, sans la peur de se faire avoir</h2>
        <p class="mb-0 mt-[11px] text-[15.5px] leading-[1.6] text-[var(--text-secondary)]">
          Trois protections concrètes contre la caution gardée par le bailleur et l'état des lieux contesté.
        </p>
      </div>
      <div class="grid grid-cols-1 gap-4.5 sm:grid-cols-3">
        <div v-for="t in TRUST_ITEMS" :key="t.title" class="rounded-2xl border border-clay-200 bg-white p-6">
          <div class="grid h-11 w-11 place-items-center rounded-lg" :class="[t.tint, t.ink]"><component :is="t.icon" class="h-5 w-5" :stroke-width="1.9" /></div>
          <p class="mb-0 mt-4 font-display text-lg font-bold tracking-[-.02em] text-[var(--text-primary)]">{{ t.title }}</p>
          <p class="mb-0 mt-2 text-sm leading-[1.6] text-[var(--text-muted)]">{{ t.text }}</p>
        </div>
      </div>
    </section>

    <!-- CTA bailleur -->
    <section class="mx-auto max-w-[1240px] px-[26px] pt-11">
      <div class="flex flex-col items-start gap-[30px] rounded-3xl bg-green-900 p-[38px] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="m-0 font-display text-[30px] font-bold tracking-[-.03em] text-white">Vous avez un bien à louer ?</h3>
          <p class="mb-0 mt-2.5 max-w-[520px] text-[15.5px] text-white/[.82]">
            Publiez votre bien, encaissez les loyers par Mobile Money, caution séquestrée par Immo pendant le bail.
          </p>
        </div>
        <NuxtLink
          to="/louer"
          class="whitespace-nowrap rounded-md bg-clay-500 px-7 py-4 text-[15px] font-bold text-white shadow-accent"
        >Publier une annonce</NuxtLink>
      </div>
    </section>

    <!-- Rappel flottant du mode choisi (nuit/mois) — visible une fois les cartes de sélection scrollées hors écran.
         Teleport vers body : le wrapper de page a une animation d'entrée (`animate-[im-fade_...]`) qui, même
         terminée, fait de lui un containing block pour tout descendant `fixed` (comportement Chromium connu
         sur un ancêtre ayant animé `transform`) — sans Teleport le badge se positionne dans le flux de la page
         au lieu du viewport, vérifié en direct (bounding box à y≈2968 au lieu d'un point fixe de l'écran). -->
    <Teleport to="body">
      <Transition name="im-fade">
        <button
          v-if="showRentalReminder"
          type="button"
          class="fixed bottom-6 right-6 z-30 flex items-center gap-2.5 rounded-pill border border-[var(--border-subtle)] bg-[var(--surface-page)]/95 px-4 py-3 shadow-panel backdrop-blur-md transition-transform hover:-translate-y-0.5"
          @click="scrollToRentalToggle"
        >
          <span class="h-2.5 w-2.5 flex-none rounded-pill" :class="RENTAL_META[activeRental].swatch" />
          <span class="text-[13px] font-bold text-[var(--text-primary)]">{{ RENTAL_META[activeRental].label }}</span>
          <span class="inline-flex items-center gap-0.5 text-[11.5px] text-[var(--text-faint)]">changer<ArrowUp class="h-3 w-3" :stroke-width="2" /></span>
        </button>
      </Transition>
    </Teleport>
  </div>
</template>
