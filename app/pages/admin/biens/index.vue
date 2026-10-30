<script setup lang="ts">
/**
 * Biens & annonces : grille de cartes, recherche et filtres dans l'URL
 * (`?q=`, `?status=`, `?city=`, `?owner=`, `?vue=suspendus`, `?page=`).
 *
 * La liste s'appuie sur `GET /property/search`, seule route de liste disponible : elle ne
 * filtre pas par suspension (le paramètre est ignoré, vérifié en live) et plafonne `limit`
 * à 100. La vue « Suspendues » filtre donc côté client les 100 premiers résultats.
 */
import { Search, X } from '@lucide/vue'
import {
  PROPERTY_STATUS_LABELS,
  propertyHasSuspension,
  refLabel,
  type PropertyListItem,
  type PropertyRefs,
  type PropertyStatus
} from '~/composables/useProperty'
import type { City } from '~/types/reference'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: ['manage:properties', 'view:properties'] })

const route = useRoute()
const router = useRouter()
const { fetchProperties, loadRefs } = useProperty()
const refData = useReferenceData()

const PAGE_SIZE = 12
const SCAN_LIMIT = 100
const STATUSES = Object.keys(PROPERTY_STATUS_LABELS) as PropertyStatus[]

/** Mémorisé pour que la fiche ramène à la même vue (lien retour, après suppression). */
const listQuery = useState<Record<string, string>>('admin-biens-query', () => ({}))
const flash = useState<string | null>('admin-biens-flash', () => null)

/* ---------- Filtres = URL ---------- */
function queryString(v: unknown) {
  return typeof v === 'string' ? v : ''
}
const filters = computed(() => {
  const q = route.query
  const status = queryString(q.status)
  return {
    q: queryString(q.q),
    status: (STATUSES.includes(status as PropertyStatus) ? status : '') as PropertyStatus | '',
    city: queryString(q.city),
    owner: queryString(q.owner),
    suspended: q.vue === 'suspendus',
    page: Math.max(1, Math.floor(Number(q.page)) || 1)
  }
})
const hasFilters = computed(() => {
  const f = filters.value
  return !!(f.q || f.status || f.city || f.owner || f.suspended)
})

/** Toute modification de filtre revient en page 1 ; `page` seule pousse une entrée d'historique. */
function setQuery(patch: Record<string, string | number | undefined>, mode: 'push' | 'replace' = 'push') {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) {
    if (typeof v === 'string' && v) next[k] = v
    else if (typeof v === 'number') next[k] = String(v)
  }
  if (!('page' in patch)) delete next.page
  if (next.page === '1') delete next.page
  router[mode]({ query: next })
}

const searchText = ref(filters.value.q)
let searchDebounce: ReturnType<typeof setTimeout> | undefined
watch(searchText, text => {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    if (text.trim() !== filters.value.q) setQuery({ q: text.trim() }, 'replace')
  }, 350)
})
// Retour arrière / lien partagé : le champ suit l'URL.
watch(() => filters.value.q, q => { if (q !== searchText.value.trim()) searchText.value = q })

function clearFilters() {
  searchText.value = ''
  router.push({ query: {} })
}

const view = computed({
  get: () => (filters.value.suspended ? 'suspendus' : 'toutes'),
  set: v => setQuery({ vue: v === 'suspendus' ? 'suspendus' : undefined })
})
const VIEW_OPTIONS = [
  { value: 'toutes', label: 'Toutes' },
  { value: 'suspendus', label: 'Suspendues' }
]

/* ---------- Chargement ---------- */
const items = ref<PropertyListItem[]>([])
const total = ref(0)
/** Vue « Suspendues » : nombre de biens que la recherche renvoyait au-delà de ceux examinés. */
const unscanned = ref(0)
const state = ref<'loading' | 'ready' | 'error'>('loading')
let requestId = 0

async function load() {
  const f = filters.value
  const id = ++requestId
  state.value = 'loading'
  listQuery.value = { ...(route.query as Record<string, string>) }
  const base = {
    q: f.q || undefined,
    status: f.status || undefined,
    city: f.city || undefined,
    owner_id: f.owner || undefined
  }
  try {
    if (f.suspended) {
      const res = await fetchProperties({ ...base, page: 1, limit: SCAN_LIMIT })
      if (id !== requestId) return
      const suspended = res.data.filter(propertyHasSuspension)
      total.value = suspended.length
      unscanned.value = Math.max(0, res.total - res.data.length)
      items.value = paginate(suspended, f.page, PAGE_SIZE)
    } else {
      const res = await fetchProperties({ ...base, page: f.page, limit: PAGE_SIZE })
      if (id !== requestId) return
      total.value = res.total
      unscanned.value = 0
      items.value = res.data
    }
    // Page hors limites (lien ancien, page saisie à la main) : on va à la dernière page.
    if (!items.value.length && total.value > 0 && f.page > 1) {
      setQuery({ page: pageCount(total.value, PAGE_SIZE) }, 'replace')
      return
    }
    state.value = 'ready'
  } catch {
    if (id === requestId) state.value = 'error'
  }
}

watch(() => JSON.stringify(filters.value), () => {
  // La route change aussi quand on ouvre une fiche : ne pas recharger la liste qu'on quitte.
  if (route.path.replace(/\/$/, '') === '/admin/biens') load()
})

const pageCountValue = computed(() => pageCount(total.value, PAGE_SIZE))
const page = computed({
  get: () => filters.value.page,
  set: p => {
    setQuery({ page: p })
    if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
  }
})

/* ---------- Référentiels ---------- */
const refs = ref<PropertyRefs>({})
const cities = ref<City[]>([])

/** Nom du propriétaire filtré, tiré des résultats (la recherche joint `owner`). */
const ownerLabel = computed(() => {
  const o = items.value.find(p => p.owner_id === filters.value.owner)?.owner
  return o ? personName(o.first_name, o.last_name) : ''
})

/* ---------- Bandeau après suppression ---------- */
const notice = ref<string | null>(null)

onMounted(async () => {
  notice.value = flash.value
  flash.value = null
  load()
  const [r, c] = await Promise.allSettled([loadRefs(['PROPERTY_TYPE']), refData.fetchCities()])
  if (r.status === 'fulfilled') refs.value = r.value
  if (c.status === 'fulfilled') cities.value = [...c.value].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
})

onBeforeUnmount(() => clearTimeout(searchDebounce))

/** Texte qui suit le nombre de résultats. */
const countLabel = computed(() => {
  const plural = total.value > 1 ? 's' : ''
  if (filters.value.suspended) return `annonce${plural} suspendue${plural} ou avec un logement suspendu`
  return `bien${plural}${hasFilters.value ? ' pour ces filtres' : ''}`
})
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="notice" class="mb-4.5 flex items-start gap-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900" role="status">
      <p class="m-0 flex-1">{{ notice }}</p>
      <button type="button" aria-label="Fermer" class="grid h-6 w-6 flex-none cursor-pointer place-items-center rounded-pill hover:bg-white/60" @click="notice = null">
        <X class="h-3.5 w-3.5" :stroke-width="1.9" />
      </button>
    </div>

    <!-- Recherche et filtres -->
    <div class="mb-4 flex flex-wrap items-center gap-2.5">
      <label class="flex h-[42px] min-w-0 flex-[1_1_100%] items-center gap-2 rounded-pill border border-[var(--border-default)] bg-white px-4 focus-within:border-green-600 sm:flex-[1_1_260px] sm:max-w-[380px]">
        <Search class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
        <input
          v-model="searchText"
          type="search"
          placeholder="Nom du bien, ville, description…"
          aria-label="Rechercher un bien"
          class="w-full min-w-0 bg-transparent text-[13.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
        >
      </label>
      <select
        :value="filters.status"
        aria-label="Statut du bien"
        class="h-[42px] min-w-0 flex-1 cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none sm:flex-none"
        @change="setQuery({ status: ($event.target as HTMLSelectElement).value })"
      >
        <option value="">Tous les statuts</option>
        <option v-for="s in STATUSES" :key="s" :value="s">{{ PROPERTY_STATUS_LABELS[s] }}</option>
      </select>
      <select
        :value="filters.city"
        aria-label="Ville"
        class="h-[42px] min-w-0 flex-1 cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none sm:flex-none"
        @change="setQuery({ city: ($event.target as HTMLSelectElement).value })"
      >
        <option value="">Toutes les villes</option>
        <option v-if="filters.city && !cities.some(c => c.name === filters.city)" :value="filters.city">{{ filters.city }}</option>
        <option v-for="c in cities" :key="c.id" :value="c.name">{{ c.name }}</option>
      </select>
      <FormsSegmentedControl v-model="view" :options="VIEW_OPTIONS" size="sm" />
      <button
        v-if="hasFilters"
        type="button"
        class="flex h-[42px] cursor-pointer items-center gap-1.5 rounded-pill px-3 text-[13px] font-bold text-[var(--text-muted)] hover:text-danger-fg"
        @click="clearFilters"
      >
        <X class="h-3.5 w-3.5" :stroke-width="1.9" /> Effacer
      </button>
    </div>

    <div v-if="filters.owner" class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span class="inline-flex items-center gap-1.5 rounded-pill border border-green-100 bg-green-50 py-1 pl-3.5 pr-1 text-[13px] font-bold text-green-800">
        Biens de {{ ownerLabel || 'ce propriétaire' }}
        <button type="button" aria-label="Retirer le filtre propriétaire" class="grid h-7 w-7 cursor-pointer place-items-center rounded-pill hover:bg-green-100" @click="setQuery({ owner: undefined })">
          <X class="h-3.5 w-3.5" :stroke-width="1.9" />
        </button>
      </span>
      <NuxtLink :to="`/admin/utilisateurs/${filters.owner}`" class="text-[12.5px] font-bold text-green-700">Voir sa fiche</NuxtLink>
    </div>

    <!-- États -->
    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 xl:grid-cols-3">
      <DataSkeletonCard v-for="i in 6" :key="i" :height="260" :lines="2" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger les biens pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else-if="!items.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
      <p class="m-0 text-[13.5px] text-[var(--text-muted)]">
        <template v-if="filters.suspended">
          Aucune annonce suspendue parmi les biens trouvés. Un bien suspendu en entier ne remonte plus dans la recherche : ouvrez-le depuis le litige ou la demande de maintenance qui le concerne.
        </template>
        <template v-else-if="hasFilters">Aucun bien ne correspond à ces filtres.</template>
        <template v-else>Aucun bien publié pour l'instant.</template>
      </p>
      <button v-if="hasFilters" type="button" class="mt-3 cursor-pointer text-[13px] font-bold text-green-700" @click="clearFilters">Effacer les filtres</button>
    </div>

    <template v-else>
      <p class="mb-3 mt-0 text-[13px] text-[var(--text-muted)]">
        <span class="font-mono font-bold text-sand-900">{{ total }}</span> {{ countLabel }}
      </p>
      <div class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 xl:grid-cols-3">
        <AdminPropertyCard
          v-for="p in items"
          :key="p.id"
          :property="p"
          :type-label="refLabel(refs, 'PROPERTY_TYPE', p.building_type)"
        />
      </div>
      <AdminPagination v-model:page="page" :page-count="pageCountValue" class="mt-2" />
    </template>

    <p v-if="state === 'ready' && unscanned" class="mb-0 mt-4 text-xs text-[var(--text-faint)]">
      Seuls les {{ SCAN_LIMIT }} premiers biens de la recherche ont été examinés ({{ unscanned }} non vus) : affinez avec la recherche ou les filtres.
    </p>
    <p v-if="state === 'ready'" class="mb-0 mt-4 text-xs leading-[1.5] text-[var(--text-faint)]">
      La liste s'appuie sur la recherche d'Immo : un bien dont tous les logements sont occupés, ou un bien suspendu en entier, n'y figure pas. Sa fiche reste accessible depuis le litige ou la demande de maintenance qui le concerne.
    </p>
  </div>
</template>
