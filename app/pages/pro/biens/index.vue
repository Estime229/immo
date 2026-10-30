<script setup lang="ts">
import { Building, ImageOff, Lock, Plus, Search, TriangleAlert, X } from '@lucide/vue'
import type { PropertySearchResult } from '~/types/property'
import {
  LISTING_FILTER, LISTING_LABEL, LISTING_TONE, PROPERTY_STATUS_LABEL, listingState, matchesPropertyQuery
} from '~/utils/proProperties'

definePageMeta({ layout: 'pro' })

const propertiesApi = useLandlordPropertiesApi()
/** `POST /property` exige un compte vérifié (403 `KYC_REQUIRED`) : on l'explique au clic plutôt que d'ouvrir un formulaire voué à l'échec. */
const { canAct, requireVerified } = useVerification()
function addProperty() {
  if (requireVerified('publier un bien')) navigateTo('/pro/biens/ajouter')
}

type Row = PropertySearchResult & { is_suspended?: boolean; suspended_reason?: string | null }
const items = ref<Row[]>([])
const state = ref<'loading' | 'success' | 'error'>('loading')

async function load() {
  state.value = 'loading'
  try {
    const res = await propertiesApi.fetchMine({ limit: 100 })
    items.value = res.data as Row[]
    state.value = 'success'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

/* ---- Recherche et filtre, gardés dans l'URL (?q=, ?statut=) ---- */
const route = useRoute()
const router = useRouter()
const query = ref(String(route.query.q ?? ''))
const statusFilter = ref(String(route.query.statut ?? ''))
watch([query, statusFilter], ([q, s]) => {
  router.replace({ query: { ...route.query, q: q.trim() || undefined, statut: s || undefined } })
})
watch(() => route.query, q => {
  query.value = String(q.q ?? '')
  statusFilter.value = String(q.statut ?? '')
})
const hasFilters = computed(() => !!query.value.trim() || !!statusFilter.value)
function clearFilters() {
  query.value = ''
  statusFilter.value = ''
}

const filtered = computed(() => items.value.filter(p =>
  matchesPropertyQuery(p, query.value) &&
  (!statusFilter.value || listingState(p.units) === LISTING_FILTER[statusFilter.value])
))

function unitsSummary(p: PropertySearchResult) {
  if (!p.units.length) return 'Aucun logement'
  const occupied = p.units.filter(u => u.unit_status === 'occupied').length
  const free = p.units.length - occupied
  const parts = [`${p.units.length} logement${p.units.length > 1 ? 's' : ''}`]
  if (free) parts.push(`${free} libre${free > 1 ? 's' : ''}`)
  if (occupied) parts.push(`${occupied} occupé${occupied > 1 ? 's' : ''}`)
  return parts.join(' · ')
}
function monthlyRevenue(p: PropertySearchResult) {
  return p.units.filter(u => u.unit_status === 'occupied').reduce((sum, u) => sum + Number(u.price), 0)
}
function firstPhoto(p: PropertySearchResult) {
  return p.media.find(m => m.is_primary)?.url ?? p.media[0]?.url ?? null
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 flex flex-wrap items-center gap-2.5">
      <div class="flex h-[42px] min-w-0 flex-[1_1_220px] items-center gap-2 rounded-pill border border-[var(--border-default)] bg-white px-4 focus-within:border-green-600 sm:max-w-[360px]">
        <Search class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
        <input v-model="query" type="search" aria-label="Rechercher un bien" placeholder="Nom, quartier ou ville…" class="w-full min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--text-faint)]">
      </div>
      <select v-model="statusFilter" aria-label="Visibilité" class="h-[42px] cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none">
        <option value="">Toutes les annonces</option>
        <option value="en-ligne">{{ LISTING_LABEL.online }}</option>
        <option value="hors-recherche">{{ LISTING_LABEL.full }}</option>
        <option value="incomplet">{{ LISTING_LABEL.incomplete }}</option>
      </select>
      <button v-if="hasFilters" type="button" class="flex h-[42px] items-center gap-1.5 rounded-pill px-3 text-[13px] font-bold text-[var(--text-muted)] hover:text-danger-fg" @click="clearFilters">
        <X class="h-3.5 w-3.5" :stroke-width="1.9" /> Effacer
      </button>
      <CoreButton size="sm" class="ml-auto inline-flex items-center gap-1.5" @click="addProperty">
        <Lock v-if="!canAct" class="h-3.5 w-3.5" :stroke-width="1.9" /><Plus v-else class="h-4 w-4" :stroke-width="1.9" />Ajouter un bien
      </CoreButton>
    </div>

    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="240" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos biens pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <ProEmptyPanel v-else-if="!items.length" :icon="Building" title="Vous n'avez pas encore de bien" text="Publiez votre premier bien : le bâtiment, quelques photos et un logement avec son prix. L'annonce est en ligne dès la fin du formulaire.">
      <CoreButton class="inline-flex items-center gap-1.5" @click="addProperty"><Lock v-if="!canAct" class="h-3.5 w-3.5" :stroke-width="1.9" />Ajouter un bien</CoreButton>
    </ProEmptyPanel>

    <div v-else-if="!filtered.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      <p class="m-0">Aucun bien ne correspond à cette recherche.</p>
      <button type="button" class="mt-2 font-bold text-green-700 underline" @click="clearFilters">Effacer la recherche et le filtre</button>
    </div>

    <div v-else class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
      <article v-for="p in filtered" :key="p.id" class="flex flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white transition-shadow hover:shadow-raised" data-testid="property-card">
        <NuxtLink :to="`/pro/biens/fiche?id=${p.id}`" class="block flex-1">
          <div class="relative grid h-[150px] place-items-center bg-sand-200 bg-cover bg-center" :style="firstPhoto(p) ? { backgroundImage: `url(${firstPhoto(p)})` } : {}">
            <ImageOff v-if="!firstPhoto(p)" class="h-6 w-6 text-[var(--text-faint)]" :stroke-width="1.9" />
            <div class="absolute left-3 top-3 flex flex-wrap gap-1.5">
              <CoreBadge :tone="LISTING_TONE[listingState(p.units)]" bordered>{{ LISTING_LABEL[listingState(p.units)] }}</CoreBadge>
              <CoreBadge v-if="p.status === 'maintenance'" tone="neutral" bordered>{{ PROPERTY_STATUS_LABEL.maintenance }}</CoreBadge>
            </div>
          </div>
          <div v-if="p.is_suspended" class="flex items-start gap-2 border-b border-danger-border bg-danger-bg px-5 py-2.5">
            <TriangleAlert class="mt-px h-4 w-4 flex-none text-danger-fg" :stroke-width="1.9" />
            <div class="min-w-0">
              <p class="m-0 text-xs font-bold text-danger-fg">Bien suspendu par Immo</p>
              <p v-if="p.suspended_reason" class="mb-0 mt-0.5 text-[11.5px] text-danger-fg-deep">{{ p.suspended_reason }}</p>
            </div>
          </div>
          <div class="px-5 pb-4.5 pt-4">
            <p class="m-0 truncate text-[15px] font-bold tracking-[-.01em]">{{ p.name }}</p>
            <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">{{ [p.neighborhood?.name, p.city?.name].filter(Boolean).join(', ') || 'Adresse non renseignée' }}</p>
            <div class="mt-3.5 flex flex-wrap gap-x-5 gap-y-2.5">
              <div>
                <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Logements</p>
                <p class="mb-0 mt-1 text-[13px] font-semibold">{{ unitsSummary(p) }}</p>
              </div>
              <div v-if="p.units.length">
                <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Loyers occupés / mois</p>
                <p class="mb-0 mt-1 font-mono text-[13px] font-bold">{{ formatFcfaShort(monthlyRevenue(p)) }}</p>
              </div>
            </div>
          </div>
        </NuxtLink>
        <!-- Bien sans logement : il n'apparaît nulle part tant qu'on n'en ajoute pas un -->
        <div v-if="!p.units.length" class="flex flex-wrap items-center gap-2.5 border-t border-warn-border bg-warn-bg px-5 py-3">
          <p class="m-0 min-w-0 flex-1 text-[12.5px] font-semibold text-warn-fg-deep">Ajoutez un logement pour mettre l'annonce en ligne.</p>
          <NuxtLink :to="{ path: '/pro/biens/fiche', query: { id: p.id, ajout: 'logement' } }" class="inline-flex items-center gap-1 rounded-pill border border-warn-border bg-white px-3.5 py-2 text-xs font-bold text-warn-fg-deep">
            <Plus class="h-3.5 w-3.5" :stroke-width="1.9" /> Ajouter un logement
          </NuxtLink>
        </div>
      </article>
    </div>
  </div>
</template>
