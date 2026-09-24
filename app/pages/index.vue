<script setup lang="ts">
import type { PropertySearchResult } from '~/types/property'
import { flattenSearchResults, type ListingCard } from '~/utils/propertyListing'

const { photos } = useProperties()
const searchApi = usePropertySearchApi()
const refData = useReferenceData()
const favorites = usePropertyFavorites()

/* ---- Barre de recherche ---- */
const query = ref('')
const cityName = ref('')
const budget = ref('')
const cities = ref<{ id: string; name: string }[]>([])

function runSearch() {
  navigateTo({ path: '/recherche', query: { q: query.value || undefined, city: cityName.value || undefined, budget: budget.value || undefined } })
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

/* ---- Offre de lancement — modale à la première visite, une seule fois par navigateur ---- */
const LAUNCH_OFFER_SEEN_KEY = 'immo:launch-offer-seen'
const showLaunchOffer = ref(false)
onMounted(() => {
  if (!localStorage.getItem(LAUNCH_OFFER_SEEN_KEY)) {
    setTimeout(() => { showLaunchOffer.value = true }, 900)
  }
})
function dismissLaunchOffer() {
  showLaunchOffer.value = false
  localStorage.setItem(LAUNCH_OFFER_SEEN_KEY, '1')
}
function exploreFromLaunchOffer() {
  dismissLaunchOffer()
  navigateTo('/recherche')
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
  { code: 'studio', label: 'Studios', photoIndex: 4 },
  { code: 'chambre_salon', label: 'Chambre-salon', photoIndex: 2 },
  { code: '2_chambres_salon', label: '2 Chambres-salon', photoIndex: 6 },
  { code: '3_chambres_salon', label: '3 Chambres-salon', photoIndex: 5 },
  { code: '4_chambres_salon', label: '4 Chambres-salon', photoIndex: 1 },
  { code: 'maison', label: 'Maisons', photoIndex: 2 }
] as const

interface CategoryTile { label: string; count: string; empty: boolean; bg: string; unitTypeId: string }
const categories = ref<CategoryTile[]>([])
const categoriesLoading = ref(true)

async function loadCategories() {
  categoriesLoading.value = true
  try {
    const unitTypes = await refData.fetchRef('UNIT_TYPE')
    const results = await Promise.all(CATEGORY_DEFS.map(async def => {
      const entry = unitTypes.find(u => u.code === def.code)
      if (!entry) return { ...def, count: 0, unitTypeId: '' }
      try {
        const res = await searchApi.search({ unit_type_id: entry.id, limit: 1 })
        return { ...def, count: res.total, unitTypeId: entry.id }
      } catch {
        return { ...def, count: 0, unitTypeId: entry.id }
      }
    }))
    categories.value = results.map(r => ({
      label: r.label,
      count: r.count === 0 ? '0 disponible' : `${r.count}${r.count > 1 ? ' disponibles' : ' disponible'}`,
      empty: r.count === 0,
      bg: r.count === 0 ? 'linear-gradient(150deg, var(--color-green-600), var(--color-green-900))' : photos[r.photoIndex],
      unitTypeId: r.unitTypeId
    }))
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

/* ---- Sections par ville réelles ---- */
interface CityGroup { name: string; units: ListingCard[] }
const cityGroups = ref<CityGroup[]>([])
const cityGroupsLoading = ref(true)

async function loadCityGroups() {
  cityGroupsLoading.value = true
  try {
    const res = await searchApi.search({ limit: 60, sort: 'newest' })
    const properties = (res.data as PropertySearchResult[]).filter((p): p is PropertySearchResult => !('_virtual' in p))
    const cards = flattenSearchResults(properties)
    const names = [...new Set(cards.map(c => c.cityName).filter(Boolean))]
    cityGroups.value = names
      .map(name => ({ name, units: cards.filter(c => c.cityName === name) }))
      .filter(g => g.units.length > 0)
      .sort((a, b) => b.units.length - a.units.length)
      .slice(0, 4)
  } catch {
    cityGroups.value = []
  } finally {
    cityGroupsLoading.value = false
  }
}

onMounted(async () => {
  const [c] = await Promise.all([refData.fetchCities(), loadCategories(), loadCityGroups(), favorites.ensureLoaded()])
  cities.value = c
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
  if (!ok && !useApiAuth().isAuthenticated()) navigateTo('/connexion')
}

/* ---- Idées d'escapade — navigation par ville, pas des statistiques : chaque clic lance une vraie recherche ---- */
const ESCAPE_TABS = [
  { key: 'appartements', label: 'Appartements' },
  { key: 'maisons', label: 'Maisons de vacances' },
  { key: 'courte', label: 'Courte durée' },
  { key: 'bord', label: 'Bord de mer' }
] as const

const ESCAPE_CITIES: Record<string, [string, string][]> = {
  appartements: [
    ['Cotonou', "Location d'appartements"], ['Porto-Novo', "Location d'appartements"], ['Calavi', 'Location de studios'], ['Parakou', "Location d'appartements"], ['Bohicon', 'Location de studios'],
    ['Fidjrossè', "Location d'appartements"], ['Godomey', 'Location de studios'], ['Sèmè-Podji', "Location d'appartements"], ['Akpakpa', 'Location de studios'], ['Cadjéhoun', "Location d'appartements"]
  ],
  maisons: [
    ['Ouidah', 'Maisons de vacances'], ['Grand-Popo', 'Maisons de vacances'], ['Abomey', 'Maisons de vacances'], ['Natitingou', 'Maisons de vacances'], ['Possotomè', 'Maisons de vacances'],
    ['Cotonou', 'Maisons de vacances'], ['Porto-Novo', 'Maisons de vacances'], ['Dassa-Zoumè', 'Maisons de vacances'], ['Kandi', 'Maisons de vacances'], ['Djougou', 'Maisons de vacances']
  ],
  courte: [
    ['Cotonou', 'Meublés courte durée'], ['Grand-Popo', 'Meublés courte durée'], ['Ouidah', 'Meublés courte durée'], ['Fidjrossè', 'Meublés courte durée'], ['Calavi', 'Meublés courte durée'],
    ['Porto-Novo', 'Meublés courte durée'], ['Parakou', 'Meublés courte durée'], ['Possotomè', 'Meublés courte durée'], ['Abomey', 'Meublés courte durée'], ['Natitingou', 'Meublés courte durée']
  ],
  bord: [
    ['Grand-Popo', 'Locations en bord de mer'], ['Ouidah', 'Locations en bord de mer'], ['Fidjrossè', 'Locations en bord de mer'], ['Sèmè-Podji', 'Locations en bord de mer'], ['Possotomè', 'Locations au bord du lac'],
    ['Cotonou', 'Locations en bord de mer'], ['Avlékété', 'Locations en bord de mer'], ['Djègbadji', 'Locations en bord de mer'], ['Cocotomey', 'Locations en bord de mer'], ['PK10', 'Locations en bord de mer']
  ]
}

const escapeTab = ref<(typeof ESCAPE_TABS)[number]['key']>('appartements')
const escapeCities = computed(() => ESCAPE_CITIES[escapeTab.value]!.map(([name, kind]) => ({ name, kind })))
function pickEscapeCity(name: string) {
  navigateTo({ path: '/recherche', query: { q: name } })
}

/* ---- Confiance (contenu éditorial, aucune donnée à intégrer) ---- */
const TRUST_ITEMS = [
  { tint: 'bg-green-50', ink: 'text-green-700', icon: '⛨', title: 'Caution séquestrée', text: "Immo conserve la caution jusqu'à l'état des lieux de sortie. Ni le bailleur ni vous ne pouvez y toucher." },
  { tint: 'bg-clay-100', ink: 'text-clay-700', icon: '✓', title: 'État des lieux signé', text: 'Photos horodatées, signature des deux parties, document opposable envoyé à chacun.' },
  { tint: 'bg-info-bg', ink: 'text-info-fg', icon: '☏', title: 'Mobile Money suivi', text: 'MTN et Moov acceptés ; chaque loyer laisse une trace consultable des deux côtés.' }
]
</script>

<template>
  <div class="animate-[im-fade_.35s_ease_both]">
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
        <div class="absolute left-[30px] top-[26px] flex items-center gap-2 rounded-pill bg-white/[.92] px-[15px] py-2 text-[12.5px] font-bold text-green-900">
          <span class="h-[7px] w-[7px] rounded-pill bg-green-600 shadow-[var(--ring-focus)]" />
          Conforme à la Loi 2022-30 · caution plafonnée à 3 mois
        </div>
        <div class="relative w-full p-6 sm:p-10">
          <h1 class="m-0 max-w-[620px] text-balance font-display text-hero font-extrabold tracking-hero text-white">
            Louez en toute confiance à Cotonou.
          </h1>
          <p class="mb-0 mt-3.5 max-w-[500px] text-[16.5px] leading-[1.5] text-white/90">
            Caution séquestrée par la plateforme, état des lieux signé des deux côtés, propriétaires vérifiés.
          </p>
        </div>
        <div class="absolute bottom-[34px] right-[30px] z-[3] flex gap-2">
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
            <input v-model="query" placeholder="Nom, description…" class="mt-0.5 w-full border-0 bg-transparent text-[15px] font-semibold text-[var(--text-primary)] outline-none">
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
            <input v-model="budget" placeholder="Peu importe" class="mt-0.5 w-full border-0 bg-transparent text-[15px] font-semibold text-[var(--text-primary)] outline-none">
          </label>
          <button
            type="button"
            class="flex items-center justify-center gap-2.5 rounded-pill bg-[image:var(--action-primary)] px-7 py-3.5 text-[15px] font-bold text-white shadow-action transition-transform hover:scale-[1.03] sm:py-0"
            @click="runSearch"
          >
            <span class="block h-[15px] w-[15px] flex-none rounded-pill border-[2.2px] border-white" />Rechercher
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

    <!-- Carrousel de catégories -->
    <section v-if="categoriesLoading || categories.length" class="mx-auto max-w-[1240px] px-[26px] pt-12">
      <div class="mb-5 flex items-center justify-between">
        <h2 class="m-0 font-display text-title-2 font-bold tracking-title-2">Trouvez le lieu qui vous correspond</h2>
        <div class="flex gap-2.5">
          <button type="button" class="grid h-11 w-11 place-items-center rounded-pill border border-[var(--border-default)] bg-white text-base transition-all hover:border-green-600 hover:text-green-700" @click="scrollCat(-1)">‹</button>
          <button type="button" class="grid h-11 w-11 place-items-center rounded-pill border border-[var(--border-default)] bg-white text-base transition-all hover:border-green-600 hover:text-green-700" @click="scrollCat(1)">›</button>
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
            <p class="mb-0 mt-1 text-[13px] text-white/[.82]">{{ c.count }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Sections par ville — squelette pendant le chargement -->
    <section v-if="cityGroupsLoading" class="mx-auto max-w-[1240px] px-[26px] pt-11">
      <div class="mb-[18px] h-[23px] w-[220px] animate-[im-shimmer_1.3s_linear_infinite] rounded-pill bg-[linear-gradient(90deg,var(--color-sand-200)_25%,var(--color-sand-100)_50%,var(--color-sand-200)_75%)] bg-[length:460px_100%]" />
      <div class="flex gap-[18px] overflow-x-auto pb-1">
        <div v-for="i in 5" :key="i" class="w-[214px] flex-none">
          <DataSkeletonCard :height="186" />
        </div>
      </div>
    </section>

    <!-- Sections par ville -->
    <section v-for="(group, gi) in cityGroups" :key="group.name" class="mx-auto max-w-[1240px] px-[26px] pt-11">
      <div class="mb-[18px] flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h2 class="m-0 font-display text-[23px] font-bold tracking-[-.025em]">{{ group.name }}</h2>
          <button type="button" class="grid h-[30px] w-[30px] place-items-center rounded-pill border border-[var(--border-default)] bg-white text-sm text-sand-900" @click="seeAllCity(group.name)">→</button>
        </div>
        <div class="flex gap-2.5">
          <button type="button" class="grid h-9 w-9 place-items-center rounded-pill border border-[var(--border-default)] bg-white text-sm text-sand-900" @click="scrollCity(gi, -1)">‹</button>
          <button type="button" class="grid h-9 w-9 place-items-center rounded-pill border border-[var(--border-default)] bg-white text-sm text-sand-900" @click="scrollCity(gi, 1)">›</button>
        </div>
      </div>
      <div :ref="(el) => setCityRail(gi, el)" class="flex gap-[18px] overflow-x-auto pb-1" style="scrollbar-width: none">
        <div v-for="u in group.units" :key="u.unitId" class="w-[214px] flex-none">
          <SearchPropertyCard
            :listing="u"
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

    <!-- Idées d'escapade -->
    <section class="mx-auto max-w-[1240px] px-[26px] pt-14">
      <h2 class="m-0 font-display text-title-2 font-bold tracking-title-2">Des idées pour votre prochaine location</h2>
      <div class="my-[18px] flex gap-[26px] border-b border-[var(--border-subtle)]">
        <button
          v-for="tab in ESCAPE_TABS"
          :key="tab.key"
          type="button"
          class="-mb-px border-b-2 px-0.5 pb-3.5 text-[15px] font-bold transition-colors"
          :class="escapeTab === tab.key ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)]'"
          @click="escapeTab = tab.key"
        >{{ tab.label }}</button>
      </div>
      <div class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
        <div v-for="c in escapeCities" :key="c.name + c.kind" class="cursor-pointer py-0.5" @click="pickEscapeCity(c.name)">
          <p class="m-0 text-[14.5px] font-bold text-[var(--text-primary)]">{{ c.name }}</p>
          <p class="mb-0 mt-[3px] text-[13px] text-[var(--text-muted)]">{{ c.kind }}</p>
        </div>
      </div>
    </section>

    <!-- Confiance -->
    <section class="mx-auto max-w-[1240px] px-[26px] pt-14">
      <div class="mb-8 max-w-[560px]">
        <p class="m-0 text-[12.5px] font-black uppercase tracking-[.08em] text-clay-500">Pourquoi Immo</p>
        <h2 class="mb-0 mt-2.5 font-display text-[29px] font-bold tracking-[-.03em] text-clay-900">Louer, sans la peur de se faire avoir</h2>
        <p class="mb-0 mt-[11px] text-[15.5px] leading-[1.6] text-[var(--text-secondary)]">
          Trois protections concrètes, pensées pour les histoires de caution jamais rendue et d'état des lieux contesté.
        </p>
      </div>
      <div class="grid grid-cols-1 gap-4.5 sm:grid-cols-3">
        <div v-for="t in TRUST_ITEMS" :key="t.title" class="rounded-2xl border border-clay-200 bg-white p-6">
          <div class="grid h-11 w-11 place-items-center rounded-lg text-lg" :class="[t.tint, t.ink]">{{ t.icon }}</div>
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
            Publiez votre bien, encaissez par Mobile Money, caution séquestrée jusqu'à l'état des lieux de sortie.
          </p>
        </div>
        <NuxtLink
          to="/louer"
          class="whitespace-nowrap rounded-md bg-clay-500 px-7 py-4 text-[15px] font-bold text-white shadow-accent"
        >Publier une annonce</NuxtLink>
      </div>
    </section>

    <HomeLaunchOfferModal v-if="showLaunchOffer" @close="dismissLaunchOffer" @explore="exploreFromLaunchOffer" />
  </div>
</template>
