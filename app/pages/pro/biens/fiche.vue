<script setup lang="ts">
import type { PropertySearchResult } from '~/types/property'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'pro' })

const route = useRoute()
const propertyId = String(route.query.id ?? '')
const searchApi = usePropertySearchApi()
const propertiesApi = useLandlordPropertiesApi()
const reviewsApi = useReviewsApi()

const property = ref<PropertySearchResult | null>(null)
const state = ref<'loading' | 'success' | 'error'>('loading')

async function load() {
  if (!propertyId) { state.value = 'error'; return }
  state.value = 'loading'
  try {
    property.value = await searchApi.fetchById(propertyId)
    state.value = 'success'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const tab = ref<'unites' | 'photos' | 'poi' | 'perf' | 'historique'>('unites')
const TABS = [
  { key: 'unites' as const, label: 'Unités' },
  { key: 'photos' as const, label: 'Photos' },
  { key: 'poi' as const, label: "Points d'intérêt" },
  { key: 'perf' as const, label: 'Performance' },
  { key: 'historique' as const, label: 'Historique' }
]
/** Aucun endpoint ne fournit ces deux vues — pas construites plutôt que simulées. */
const OTHER_NOTES: Record<string, string> = {
  poi: "Aucune donnée de points d'intérêt n'est disponible côté API pour l'instant.",
  historique: 'Aucun historique de signalements ou de baux successifs par bien n\'est disponible côté API pour l\'instant.'
}
const otherNote = computed(() => OTHER_NOTES[tab.value] ?? '')

const STATUS_LABEL: Record<string, string> = { available: 'Libre', occupied: 'Occupée', notice_given: 'Préavis en cours' }
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = { available: 'warn', occupied: 'ok', notice_given: 'neutral' }

const showAddUnit = ref(false)
const editingUnit = ref<PropertySearchResult['units'][number] | null>(null)
function onUnitCreated() {
  showAddUnit.value = false
  load()
}
function onUnitUpdated() {
  editingUnit.value = null
  load()
}

/* ---- Édition du bien : seuls name/status/description sont réellement modifiables côté API (vérifié au Lot 21) ---- */
const editingProperty = ref(false)
const editName = ref('')
const editStatus = ref('')
const editDescription = ref('')
const savingProperty = ref(false)
const savePropertyError = ref('')

const PROPERTY_STATUS_OPTIONS = [
  { code: 'available', label: 'Publié' },
  { code: 'occupied', label: 'Occupé' },
  { code: 'maintenance', label: 'En maintenance' }
]

function openEditProperty() {
  if (!property.value) return
  editName.value = property.value.name
  editStatus.value = property.value.status
  editDescription.value = property.value.description?.fr ?? ''
  savePropertyError.value = ''
  editingProperty.value = true
}

async function saveProperty() {
  if (!property.value || !editName.value.trim()) return
  savingProperty.value = true
  savePropertyError.value = ''
  try {
    await propertiesApi.update(property.value.id, {
      name: editName.value.trim(),
      status: editStatus.value,
      description: editDescription.value.trim() ? { fr: editDescription.value.trim() } : undefined
    })
    editingProperty.value = false
    await load()
  } catch (e) {
    savePropertyError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'enregistrement a échoué.") : "L'enregistrement a échoué."
  } finally {
    savingProperty.value = false
  }
}

/* ---- Photos ---- */
const uploading = ref(false)
const uploadError = ref('')
async function addPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !property.value) return
  uploading.value = true
  uploadError.value = ''
  try {
    const uploaded = await propertiesApi.uploadImage(file)
    await propertiesApi.addMedia(property.value.id, uploaded.url, { isPrimary: property.value.media.length === 0 })
    await load()
  } catch (e2) {
    uploadError.value = e2 instanceof ApiRequestError ? (e2.mapped.bannerMessage ?? "L'envoi a échoué.") : "L'envoi a échoué."
  } finally {
    uploading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

/* ---- Performance : ce qui est réellement calculable depuis le bien, honnêtement incomplet ---- */
const reviewStats = ref<{ average: number; count: number } | null>(null)
watch(property, async p => {
  if (!p) return
  try {
    reviewStats.value = await reviewsApi.fetchPropertyStats(p.id)
  } catch {
    reviewStats.value = null
  }
})
const perfCards = computed(() => {
  if (!property.value) return []
  const units = property.value.units
  const occupied = units.filter(u => u.unit_status === 'occupied')
  const revenue = occupied.reduce((sum, u) => sum + Number(u.price), 0)
  const occupancy = units.length ? Math.round((occupied.length / units.length) * 100) : 0
  const cards = [
    { value: formatFcfaShort(revenue), label: 'revenu / mois' },
    { value: `${occupancy}%`, label: "taux d'occupation" }
  ]
  if (reviewStats.value && reviewStats.value.count > 0) {
    cards.push({ value: `${reviewStats.value.average.toFixed(1).replace('.', ',')} ★`, label: `${reviewStats.value.count} avis` })
  }
  return cards
})
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <NuxtLink to="/pro/biens" class="mb-4 inline-block rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13.5px] font-semibold text-sand-900">← Mes biens</NuxtLink>

    <div v-if="state === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard :height="200" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error' || !property" tone="danger">
      Ce bien est introuvable.
    </FeedbackAlertBanner>

    <template v-else>
      <div class="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white">
        <div class="h-[120px] bg-cover bg-center bg-sand-200" :style="property.media[0]?.url ? { backgroundImage: `url(${property.media[0].url})` } : {}" />
        <div class="flex flex-wrap items-center gap-3.5 px-6 py-5">
          <div class="flex-1">
            <h2 class="m-0 font-display text-[23px] font-bold tracking-[-.02em]">{{ property.name }}</h2>
            <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">{{ [property.neighborhood?.name, property.city?.name].filter(Boolean).join(', ') }}</p>
          </div>
          <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold" @click="openEditProperty">Modifier</button>
          <NuxtLink v-if="property.is_publicly_listed" :to="`/biens/${property.id}`" target="_blank" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold">Voir l'annonce</NuxtLink>
        </div>

        <div v-if="editingProperty" class="border-t border-[var(--border-subtle)] p-6">
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Nom du bien</p><input v-model="editName" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Statut</p>
              <select v-model="editStatus" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                <option v-for="s in PROPERTY_STATUS_OPTIONS" :key="s.code" :value="s.code">{{ s.label }}</option>
              </select>
            </div>
          </div>
          <p class="mb-1.5 mt-3.5 text-[12.5px] font-bold">Description</p>
          <textarea v-model="editDescription" class="min-h-[80px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3.5 text-sm outline-none" />
          <p v-if="savePropertyError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ savePropertyError }}</p>
          <div class="mt-4 flex gap-2.5">
            <CoreButton :disabled="!editName.trim() || savingProperty" @click="saveProperty">{{ savingProperty ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
            <CoreButton tone="secondary" @click="editingProperty = false">Annuler</CoreButton>
          </div>
          <p class="mb-0 mt-3.5 text-[12px] text-[var(--text-faint)]">Le type de bâtiment, la ville, le quartier et l'adresse ne sont pas modifiables après la création du bien.</p>
        </div>
      </div>

      <div class="my-4.5 flex flex-wrap gap-1.5">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          class="rounded-pill border px-4 py-2.5 text-[13px] font-bold transition-all"
          :class="tab === t.key ? 'border-green-900 bg-green-900 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
          @click="tab = t.key"
        >{{ t.label }}</button>
      </div>

      <div v-if="tab === 'unites'" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-2">
        <p v-if="!property.units.length" class="p-4 text-[13.5px] text-[var(--text-muted)]">Aucune unité pour l'instant.</p>
        <div v-for="u in property.units" :key="u.id" class="flex items-center gap-3.5 border-b border-sand-200 p-3.5 last:border-b-0">
          <div class="h-11 w-11 flex-none rounded-md bg-cover bg-center bg-sand-200" :style="u.unit_media[0]?.url ? { backgroundImage: `url(${u.unit_media[0].url})` } : {}" />
          <div class="flex-1">
            <p class="m-0 text-[14.5px] font-bold">{{ u.name }}</p>
            <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">{{ u.bedrooms_count }} chambre{{ u.bedrooms_count > 1 ? 's' : '' }}<template v-if="u.surface_m2"> · {{ u.surface_m2 }} m²</template></p>
          </div>
          <span class="font-mono text-[13.5px] font-bold">{{ formatFcfaShort(Number(u.price)) }}</span>
          <CoreBadge :tone="STATUS_TONE[u.unit_status] ?? 'neutral'">{{ STATUS_LABEL[u.unit_status] ?? u.unit_status }}</CoreBadge>
          <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold" @click="editingUnit = u">Modifier</button>
        </div>
        <div class="p-3.5">
          <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold" @click="showAddUnit = true">+ Ajouter une unité</button>
        </div>
      </div>

      <div v-else-if="tab === 'photos'" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5">
        <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div v-for="m in property.media" :key="m.id" class="relative h-[100px] overflow-hidden rounded-sm bg-cover bg-center" :style="{ backgroundImage: `url(${m.url})` }">
            <span v-if="m.is_primary" class="absolute left-1.5 top-1.5 rounded-pill bg-green-600 px-2 py-0.5 text-[9.5px] font-bold text-white">Principale</span>
          </div>
          <label class="grid h-[100px] cursor-pointer place-items-center rounded-sm border-[1.5px] border-dashed border-[var(--border-default)] text-xl text-[var(--text-faint)]">
            <span v-if="uploading">…</span><span v-else>＋</span>
            <input type="file" accept="image/*" class="hidden" :disabled="uploading" @change="addPhoto">
          </label>
        </div>
        <p v-if="uploadError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ uploadError }}</p>
      </div>

      <div v-else-if="tab === 'perf'" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div v-for="p in perfCards" :key="p.label" class="rounded-lg border border-[var(--border-subtle)] bg-white p-4.5">
          <p class="m-0 font-mono text-xl font-bold text-green-900">{{ p.value }}</p>
          <p class="mb-0 mt-1.5 text-xs text-[var(--text-muted)]">{{ p.label }}</p>
        </div>
      </div>

      <div v-else class="rounded-xl border border-dashed border-[var(--border-default)] bg-white p-10 text-center text-sm text-[var(--text-muted)]">{{ otherNote }}</div>

      <ProUniteModal v-if="showAddUnit" :property-id="property.id" :property-name="property.name" @close="showAddUnit = false" @created="onUnitCreated" />
      <ProUniteModal v-if="editingUnit" :property-id="property.id" :property-name="property.name" :unit="editingUnit" @close="editingUnit = null" @updated="onUnitUpdated" />
    </template>
  </div>
</template>
