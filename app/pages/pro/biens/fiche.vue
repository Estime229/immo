<script setup lang="ts">
import type { PropertySearchResult } from '~/types/property'
import type { PointOfInterest } from '~/types/landlordProperty'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { prepareUpload } from '~/utils/uploadFile'
import { NOISE_LEVELS, POI_TYPES, PROPERTY_CHARACTERISTICS, deleteBlocker, imagesPayload } from '~/utils/propertyForm'

definePageMeta({ layout: 'pro' })

const route = useRoute()
const propertyId = String(route.query.id ?? '')
const justCreated = route.query.created === '1'
const searchApi = usePropertySearchApi()
const propertiesApi = useLandlordPropertiesApi()
const reviewsApi = useReviewsApi()
const refData = useReferenceData()

function formatError(e: unknown, fallback: string) {
  return e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback
}

const property = ref<PropertySearchResult | null>(null)
const state = ref<'loading' | 'success' | 'error'>('loading')

async function load() {
  if (!propertyId) { state.value = 'error'; return }
  if (!property.value) state.value = 'loading'
  try {
    property.value = await searchApi.fetchById(propertyId)
    state.value = 'success'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const tab = ref<'unites' | 'photos' | 'poi' | 'perf'>('unites')
const TABS = [
  { key: 'unites' as const, label: 'Logements' },
  { key: 'photos' as const, label: 'Photos' },
  { key: 'poi' as const, label: 'Alentours' },
  { key: 'perf' as const, label: 'Performance' }
]

const STATUS_LABEL: Record<string, string> = { available: 'Libre', occupied: 'Occupée', notice_given: 'Préavis en cours', maintenance: 'En maintenance', coming_soon: 'Bientôt disponible' }
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = { available: 'warn', occupied: 'ok', notice_given: 'neutral', maintenance: 'neutral', coming_soon: 'neutral' }
function unitDetails(u: PropertySearchResult['units'][number]) {
  const parts: string[] = []
  if (u.bedrooms_count) parts.push(`${u.bedrooms_count} chambre${u.bedrooms_count > 1 ? 's' : ''}`)
  if (u.surface_m2) parts.push(`${u.surface_m2} m²`)
  return parts.join(' · ')
}
const inSearch = computed(() => !!property.value?.units.some(u => u.unit_status !== 'occupied'))

/* ---- Logements ---- */
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
const confirmUnitId = ref<string | null>(null)
const unitActionError = ref('')
const deletingUnit = ref(false)
function askDeleteUnit(u: PropertySearchResult['units'][number]) {
  unitActionError.value = deleteBlocker([u]) ?? ''
  confirmUnitId.value = unitActionError.value ? null : u.id
}
async function deleteUnit() {
  if (!property.value || !confirmUnitId.value) return
  deletingUnit.value = true
  try {
    await propertiesApi.removeUnit(property.value.id, confirmUnitId.value)
    confirmUnitId.value = null
    await load()
  } catch (e) {
    unitActionError.value = formatError(e, 'La suppression a échoué.')
  } finally {
    deletingUnit.value = false
  }
}

/* ---- Édition du bien — tous ces champs sont modifiables côté API (vérifié en live, Lot 45) ---- */
const editingProperty = ref(false)
const edit = ref({ name: '', status: '', description: '', buildingType: '', cityId: '', neighborhoodId: '', address: '', onVitrine: false, characteristics: {} as Record<string, boolean> })
const savingProperty = ref(false)
const savePropertyError = ref('')
const propertyTypes = ref<{ code: string; label: string }[]>([])
const cities = ref<{ id: string; name: string }[]>([])
const neighborhoods = ref<{ id: string; name: string }[]>([])

const PROPERTY_STATUS_OPTIONS = [
  { code: 'available', label: 'Disponible' },
  { code: 'occupied', label: 'Entièrement occupé' },
  { code: 'maintenance', label: 'En travaux' }
]

async function openEditProperty() {
  const p = property.value
  if (!p) return
  const chars = p.characteristics ?? {}
  edit.value = {
    name: p.name,
    status: p.status,
    description: p.description?.fr ?? '',
    buildingType: p.building_type,
    cityId: p.city_id ?? '',
    neighborhoodId: p.neighborhood_id ?? '',
    address: p.address ?? '',
    onVitrine: p.is_publicly_listed,
    characteristics: Object.fromEntries(PROPERTY_CHARACTERISTICS.map(c => [c.key, chars[c.key] === true]))
  }
  savePropertyError.value = ''
  editingProperty.value = true
  const [pt, c] = await Promise.all([refData.fetchRef('PROPERTY_TYPE'), refData.fetchCities()])
  propertyTypes.value = pt.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  cities.value = c
  neighborhoods.value = edit.value.cityId ? await refData.fetchNeighborhoods(edit.value.cityId) : []
}
async function onCityChange() {
  edit.value.neighborhoodId = ''
  neighborhoods.value = edit.value.cityId ? await refData.fetchNeighborhoods(edit.value.cityId) : []
}

async function saveProperty() {
  if (!property.value || !edit.value.name.trim()) return
  savingProperty.value = true
  savePropertyError.value = ''
  try {
    await propertiesApi.update(property.value.id, {
      name: edit.value.name.trim(),
      status: edit.value.status,
      description: edit.value.description.trim() ? { fr: edit.value.description.trim() } : undefined,
      building_type: edit.value.buildingType,
      city_id: edit.value.cityId || undefined,
      neighborhood_id: edit.value.neighborhoodId || null,
      address: edit.value.address.trim(),
      characteristics: edit.value.characteristics,
      is_publicly_listed: edit.value.onVitrine
    })
    editingProperty.value = false
    await load()
  } catch (e) {
    savePropertyError.value = formatError(e, "L'enregistrement a échoué.")
  } finally {
    savingProperty.value = false
  }
}

/* ---- Suppression du bien — l'API ne vérifie aucun bail actif, le garde-fou est ici ---- */
const confirmDeleteProperty = ref(false)
const deletePropertyError = ref('')
const deletingProperty = ref(false)
function askDeleteProperty() {
  deletePropertyError.value = property.value ? (deleteBlocker(property.value.units) ?? '') : ''
  confirmDeleteProperty.value = !deletePropertyError.value
}
async function deleteProperty() {
  if (!property.value) return
  deletingProperty.value = true
  try {
    await propertiesApi.remove(property.value.id)
    await navigateTo('/pro/biens')
  } catch (e) {
    deletePropertyError.value = formatError(e, 'La suppression a échoué.')
    confirmDeleteProperty.value = false
  } finally {
    deletingProperty.value = false
  }
}

/* ---- Photos : ajout compressé, retrait, photo principale ---- */
const sortedMedia = computed(() => [...(property.value?.media ?? [])].sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary) || (a.rank ?? 0) - (b.rank ?? 0)))
const coverUrl = computed(() => sortedMedia.value[0]?.url)
const uploading = ref(false)
const uploadError = ref('')
async function addPhoto(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !property.value) return
  uploading.value = true
  uploadError.value = ''
  try {
    const ready = await prepareUpload(file)
    if (ready.error !== null) {
      uploadError.value = ready.error
      return
    }
    const uploaded = await propertiesApi.uploadImage(ready.file)
    await propertiesApi.addMedia(property.value.id, uploaded.url, { isPrimary: property.value.media.length === 0, rank: property.value.media.length + 1 })
    await load()
  } catch (e2) {
    uploadError.value = formatError(e2, "L'envoi a échoué.")
  } finally {
    uploading.value = false
    input.value = ''
  }
}
const photoBusy = ref(false)
async function changePhotos(change: { removeId?: string; primaryId?: string }) {
  if (!property.value) return
  photoBusy.value = true
  uploadError.value = ''
  try {
    const media = sortedMedia.value.map(m => ({ id: m.id, url: m.url, is_primary: !!m.is_primary }))
    await propertiesApi.update(property.value.id, { images: imagesPayload(media, change) })
    await load()
  } catch (e) {
    uploadError.value = formatError(e, 'La modification des photos a échoué.')
  } finally {
    photoBusy.value = false
  }
}

/* ---- Alentours (points d'intérêt) — routes réelles, jamais branchées avant ---- */
const pois = ref<PointOfInterest[]>([])
const poiState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const poiForm = ref({ type: 'mosque', name: '', distance: '', noise: '' })
const poiError = ref('')
const poiSaving = ref(false)
async function loadPois() {
  poiState.value = 'loading'
  try {
    pois.value = await propertiesApi.listPois(propertyId)
    poiState.value = 'success'
  } catch {
    poiState.value = 'error'
  }
}
watch(tab, t => { if (t === 'poi' && poiState.value === 'idle') loadPois() })
function poiLabel(code: string) {
  return POI_TYPES.find(p => p.code === code)?.label ?? code
}
function noiseLabel(code: string | null) {
  return NOISE_LEVELS.find(n => n.code === code)?.label ?? ''
}
async function addPoi() {
  poiError.value = ''
  const distance = poiForm.value.distance.trim()
  if (distance && !(Number(distance) >= 0)) {
    poiError.value = 'La distance doit être un nombre de mètres.'
    return
  }
  poiSaving.value = true
  try {
    await propertiesApi.addPoi(propertyId, {
      poi_type: poiForm.value.type,
      name: poiForm.value.name.trim() || undefined,
      distance_meters: distance ? Number(distance) : undefined,
      noise_level: poiForm.value.noise || undefined
    })
    poiForm.value = { type: poiForm.value.type, name: '', distance: '', noise: '' }
    await loadPois()
  } catch (e) {
    poiError.value = formatError(e, "L'ajout a échoué.")
  } finally {
    poiSaving.value = false
  }
}
async function removePoi(id: string) {
  poiError.value = ''
  try {
    await propertiesApi.removePoi(propertyId, id)
    pois.value = pois.value.filter(p => p.id !== id)
  } catch (e) {
    poiError.value = formatError(e, 'La suppression a échoué.')
  }
}

/* ---- Performance : ce qui est réellement calculable depuis le bien ---- */
const reviewStats = ref<{ average: number; count: number } | null>(null)
watch(() => property.value?.id, async id => {
  if (!id) return
  try {
    reviewStats.value = await reviewsApi.fetchPropertyStats(id)
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
      <div v-if="justCreated" class="mb-4 rounded-xl border border-ok-border bg-ok-bg px-5 py-3.5 text-[13.5px] text-green-900">
        <strong>Annonce en ligne.</strong> Elle apparaît dans la recherche d'ici une minute. Ajoutez d'autres logements ou photos ci-dessous.
      </div>

      <div class="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white">
        <div class="h-[120px] bg-cover bg-center bg-sand-200" :style="coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}" />
        <div class="flex flex-wrap items-center gap-3.5 px-6 py-5">
          <div class="min-w-0 flex-1">
            <h2 class="m-0 font-display text-[23px] font-bold tracking-[-.02em]">{{ property.name }}</h2>
            <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">{{ [property.address, property.neighborhood?.name, property.city?.name].filter(Boolean).join(', ') }}</p>
            <p class="mb-0 mt-1.5 text-[12.5px] font-semibold" :class="inSearch ? 'text-ok-fg' : 'text-[var(--text-faint)]'">
              {{ inSearch ? '● Visible dans la recherche' : '○ Hors recherche — aucun logement libre' }}<template v-if="property.is_publicly_listed"> · sur votre vitrine</template>
            </p>
          </div>
          <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold" @click="openEditProperty">Modifier</button>
          <NuxtLink :to="`/biens/${property.id}`" target="_blank" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold">Voir l'annonce</NuxtLink>
        </div>

        <div v-if="editingProperty" class="border-t border-[var(--border-subtle)] p-6">
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Nom du bien</p><input v-model="edit.name" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Type de bâtiment</p>
              <select v-model="edit.buildingType" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                <option v-for="t in propertyTypes" :key="t.code" :value="t.code">{{ t.label }}</option>
              </select>
            </div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Ville</p>
              <select v-model="edit.cityId" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900" @change="onCityChange">
                <option v-for="c in cities" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Quartier</p>
              <select v-model="edit.neighborhoodId" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                <option value="">—</option>
                <option v-for="n in neighborhoods" :key="n.id" :value="n.id">{{ n.name }}</option>
              </select>
            </div>
            <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Adresse</p><input v-model="edit.address" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">État du bâtiment</p>
              <select v-model="edit.status" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                <option v-for="s in PROPERTY_STATUS_OPTIONS" :key="s.code" :value="s.code">{{ s.label }}</option>
              </select>
            </div>
          </div>
          <p class="mb-0 mt-1.5 text-[12px] text-[var(--text-faint)]">L'état du bâtiment est informatif : la présence dans la recherche dépend uniquement des logements libres.</p>
          <p class="mb-1.5 mt-3.5 text-[12.5px] font-bold">Description</p>
          <textarea v-model="edit.description" class="min-h-[80px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3.5 text-sm outline-none" />
          <p class="mb-2 mt-3.5 text-[12.5px] font-bold">Le bâtiment dispose de</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="c in PROPERTY_CHARACTERISTICS"
              :key="c.key"
              type="button"
              class="rounded-pill border px-3.5 py-2 text-[13px] font-semibold"
              :class="edit.characteristics[c.key] ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
              @click="edit.characteristics = { ...edit.characteristics, [c.key]: !edit.characteristics[c.key] }"
            >{{ edit.characteristics[c.key] ? '✓ ' : '' }}{{ c.label }}</button>
          </div>
          <label class="mt-3.5 flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold">
            <input v-model="edit.onVitrine" type="checkbox" class="h-4 w-4 accent-[var(--color-green-600)]">
            Afficher ce bien sur ma vitrine publique
          </label>
          <p v-if="savePropertyError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ savePropertyError }}</p>
          <div class="mt-4 flex flex-wrap gap-2.5">
            <CoreButton :disabled="!edit.name.trim() || savingProperty" @click="saveProperty">{{ savingProperty ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
            <CoreButton tone="secondary" @click="editingProperty = false">Annuler</CoreButton>
            <div class="flex-1" />
            <CoreButton tone="danger" @click="askDeleteProperty">Supprimer le bien</CoreButton>
          </div>
          <p v-if="deletePropertyError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ deletePropertyError }}</p>
          <div v-if="confirmDeleteProperty" class="mt-3.5 rounded-md border border-danger-border bg-danger-bg p-4">
            <p class="m-0 text-[13.5px] font-bold text-danger-fg-deep">Supprimer « {{ property.name }} » ?</p>
            <p class="mb-3 mt-1 text-[13px] text-[var(--text-secondary)]">Ses {{ property.units.length }} logement(s), photos et tarifs disparaissent de la plateforme. Cette action est définitive.</p>
            <div class="flex gap-2.5">
              <CoreButton tone="danger" :disabled="deletingProperty" @click="deleteProperty">{{ deletingProperty ? 'Suppression…' : 'Oui, supprimer' }}</CoreButton>
              <CoreButton tone="secondary" @click="confirmDeleteProperty = false">Annuler</CoreButton>
            </div>
          </div>
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
        <p v-if="!property.units.length" class="p-4 text-[13.5px] text-[var(--text-muted)]">Aucun logement pour l'instant : le bien n'apparaît pas dans la recherche tant qu'il n'en a pas.</p>
        <div v-for="u in property.units" :key="u.id" class="border-b border-sand-200 p-3.5 last:border-b-0">
          <div class="flex flex-wrap items-center gap-3.5">
            <div class="h-11 w-11 flex-none rounded-md bg-cover bg-center bg-sand-200" :style="(u.unit_media[0]?.url ?? coverUrl) ? { backgroundImage: `url(${u.unit_media[0]?.url ?? coverUrl})` } : {}" />
            <div class="min-w-0 flex-1">
              <p class="m-0 text-[14.5px] font-bold">{{ u.name }}</p>
              <p v-if="unitDetails(u)" class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">{{ unitDetails(u) }}</p>
            </div>
            <span class="font-mono text-[13.5px] font-bold">{{ formatFcfaShort(Number(u.price)) }}</span>
            <CoreBadge :tone="STATUS_TONE[u.unit_status] ?? 'neutral'">{{ STATUS_LABEL[u.unit_status] ?? u.unit_status }}</CoreBadge>
            <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold" @click="editingUnit = u">Modifier</button>
            <button type="button" class="rounded-pill border border-danger-border bg-white px-3.5 py-2 text-xs font-bold text-danger-fg" @click="askDeleteUnit(u)">Supprimer</button>
          </div>
          <div v-if="confirmUnitId === u.id" class="mt-3 flex flex-wrap items-center gap-2.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-3">
            <p class="m-0 flex-1 text-[13px] font-semibold text-danger-fg-deep">Supprimer « {{ u.name }} » et ses tarifs ? Action définitive.</p>
            <CoreButton tone="danger" :disabled="deletingUnit" @click="deleteUnit">{{ deletingUnit ? 'Suppression…' : 'Supprimer' }}</CoreButton>
            <CoreButton tone="secondary" @click="confirmUnitId = null">Annuler</CoreButton>
          </div>
        </div>
        <p v-if="unitActionError" class="mx-3.5 mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ unitActionError }}</p>
        <div class="flex flex-wrap items-center gap-3 p-3.5">
          <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold" @click="showAddUnit = true">+ Ajouter un logement</button>
          <NuxtLink to="/pro/tarifs" class="text-[13px] font-bold text-green-700">Tarifs et disponibilités →</NuxtLink>
        </div>
      </div>

      <div v-else-if="tab === 'photos'" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5">
        <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div v-for="m in sortedMedia" :key="m.id" class="relative h-[110px] overflow-hidden rounded-sm bg-cover bg-center" :style="{ backgroundImage: `url(${m.url})` }">
            <span v-if="m.is_primary" class="absolute left-1.5 top-1.5 rounded-pill bg-green-600 px-2 py-0.5 text-[9.5px] font-bold text-white">Principale</span>
            <div class="absolute inset-x-1.5 bottom-1.5 flex gap-1">
              <button v-if="!m.is_primary" type="button" class="flex-1 rounded-xs bg-white/90 px-1.5 py-1 text-[10.5px] font-bold disabled:opacity-50" :disabled="photoBusy" @click="changePhotos({ primaryId: m.id })">Principale</button>
              <button type="button" class="rounded-xs bg-white/90 px-2 py-1 text-[10.5px] font-bold text-danger-fg disabled:opacity-50" :disabled="photoBusy" aria-label="Retirer la photo" @click="changePhotos({ removeId: m.id })">✕</button>
            </div>
          </div>
          <label class="grid h-[110px] cursor-pointer place-items-center rounded-sm border-[1.5px] border-dashed border-[var(--border-default)] text-center text-[var(--text-faint)]">
            <span class="text-[12.5px] font-semibold">{{ uploading ? 'Envoi…' : '＋ Ajouter' }}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" :disabled="uploading" @change="addPhoto">
          </label>
        </div>
        <p class="mb-0 mt-3 text-[12px] text-[var(--text-faint)]">JPG, PNG ou WebP — les photos lourdes sont réduites automatiquement. La photo principale est celle de l'annonce.</p>
        <p v-if="uploadError" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ uploadError }}</p>
      </div>

      <div v-else-if="tab === 'poi'" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5">
        <p class="mb-3.5 mt-0 text-[13px] text-[var(--text-muted)]">Signalez ce qui se trouve autour : mosquée, église, bar, marché, école… Les locataires y sont très attentifs (bruit, horaires).</p>
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-[1.2fr_1.4fr_.8fr_1fr_auto]">
          <select v-model="poiForm.type" class="h-11 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
            <option v-for="p in POI_TYPES" :key="p.code" :value="p.code">{{ p.label }}</option>
          </select>
          <input v-model="poiForm.name" placeholder="Nom (optionnel)" class="h-11 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none">
          <input v-model="poiForm.distance" inputmode="numeric" placeholder="Distance (m)" class="h-11 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none">
          <select v-model="poiForm.noise" class="h-11 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
            <option value="">Bruit ?</option>
            <option v-for="n in NOISE_LEVELS" :key="n.code" :value="n.code">{{ n.label }}</option>
          </select>
          <CoreButton :disabled="poiSaving" @click="addPoi">{{ poiSaving ? '…' : 'Ajouter' }}</CoreButton>
        </div>
        <p v-if="poiError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ poiError }}</p>
        <p v-if="poiState === 'loading'" class="mb-0 mt-4 text-[13px] text-[var(--text-muted)]">Chargement…</p>
        <p v-else-if="poiState === 'error'" class="mb-0 mt-4 text-[13px] text-danger-fg">Impossible de charger les alentours. <button type="button" class="font-bold underline" @click="loadPois">Réessayer</button></p>
        <p v-else-if="!pois.length" class="mb-0 mt-4 text-[13px] text-[var(--text-muted)]">Rien de signalé pour l'instant.</p>
        <div v-for="p in pois" :key="p.id" class="mt-2.5 flex items-center gap-3 rounded-md border border-[var(--border-subtle)] px-3.5 py-2.5">
          <div class="min-w-0 flex-1">
            <p class="m-0 text-[13.5px] font-bold">{{ poiLabel(p.poi_type) }}<template v-if="p.name"> — {{ p.name }}</template></p>
            <p class="mb-0 mt-0.5 text-[12px] text-[var(--text-muted)]">{{ [p.distance_meters != null ? `${p.distance_meters} m` : '', noiseLabel(p.noise_level)].filter(Boolean).join(' · ') || '—' }}</p>
          </div>
          <button type="button" class="text-[12.5px] font-bold text-danger-fg" @click="removePoi(p.id)">Retirer</button>
        </div>
      </div>

      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div v-for="p in perfCards" :key="p.label" class="rounded-lg border border-[var(--border-subtle)] bg-white p-4.5">
          <p class="m-0 font-mono text-xl font-bold text-green-900">{{ p.value }}</p>
          <p class="mb-0 mt-1.5 text-xs text-[var(--text-muted)]">{{ p.label }}</p>
        </div>
      </div>

      <ProUniteModal v-if="showAddUnit" :property-id="property.id" :property-name="property.name" @close="showAddUnit = false" @created="onUnitCreated" />
      <ProUniteModal v-if="editingUnit" :property-id="property.id" :property-name="property.name" :unit="editingUnit" @close="editingUnit = null" @updated="onUnitUpdated" />
    </template>
  </div>
</template>
