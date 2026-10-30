<script setup lang="ts">
import {
  ArrowLeft, Building, Check, CircleCheck, DoorOpen, ExternalLink, Eye, EyeOff, FileText, ImageOff, ImagePlus, Lock, MapPin,
  Pencil, Plus, Star, Trash, X
} from '@lucide/vue'
import type { PropertySearchResult } from '~/types/property'
import type { LeaseSummary } from '~/types/tenant'
import type { PointOfInterest } from '~/types/landlordProperty'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { prepareUpload } from '~/utils/uploadFile'
import { formatCoords, preciseLocation, toCoordinate, type GeoPoint } from '~/utils/geo'
import { leasePhase } from '~/utils/leases'
import { NOISE_LEVELS, POI_TYPES, PROPERTY_CHARACTERISTICS, deleteBlocker, imagesPayload } from '~/utils/propertyForm'
import {
  LISTING_HINT, LISTING_LABEL, LISTING_TONE, PROPERTY_STATUS_LABEL, UNIT_STATUS_LABEL, listingState, photoRemovalWarning
} from '~/utils/proProperties'

definePageMeta({ layout: 'pro' })

type Unit = PropertySearchResult['units'][number]

const route = useRoute()
const router = useRouter()
const propertyId = String(route.query.id ?? '')
const justCreated = route.query.created === '1'
const searchApi = usePropertySearchApi()
const propertiesApi = useLandlordPropertiesApi()
const leasesApi = useLeasesApi()
const reviewsApi = useReviewsApi()
const refData = useReferenceData()
const authUser = useAuthUser()

function formatError(e: unknown, fallback: string) {
  return e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback
}

const property = ref<PropertySearchResult | null>(null)
/** `missing` (404 ou lien sans identifiant) et `error` (réseau, serveur) sont deux écrans différents. */
const state = ref<'loading' | 'success' | 'missing' | 'error'>('loading')

async function load() {
  if (!propertyId) { state.value = 'missing'; return }
  if (!property.value) state.value = 'loading'
  try {
    property.value = await searchApi.fetchById(propertyId)
    state.value = 'success'
  } catch (e) {
    if (property.value) return
    state.value = e instanceof ApiRequestError && e.status === 404 ? 'missing' : 'error'
  }
}

const { canAct, requireVerified } = useVerification()

onMounted(async () => {
  await load()
  // Lien « Ajouter un logement » depuis la liste (?ajout=logement) : la fenêtre s'ouvre directement.
  if (state.value === 'success' && route.query.ajout === 'logement') {
    router.replace({ query: { ...route.query, ajout: undefined } })
    openAddUnit()
  }
})

/* ---- Onglets, gardés dans l'URL (?onglet=) ---- */
type Tab = 'logements' | 'photos' | 'alentours'
const TABS: { value: Tab; label: string }[] = [
  { value: 'logements', label: 'Logements' },
  { value: 'photos', label: 'Photos' },
  { value: 'alentours', label: 'Alentours' }
]
function tabFrom(v: unknown): Tab {
  return TABS.some(t => t.value === v) ? (v as Tab) : 'logements'
}
const tab = ref<Tab>(tabFrom(route.query.onglet))
watch(tab, t => router.replace({ query: { ...route.query, onglet: t === 'logements' ? undefined : t } }))
watch(() => route.query.onglet, v => { tab.value = tabFrom(v) })
const tabModel = computed({ get: () => tab.value as string, set: (v: string) => { tab.value = tabFrom(v) } })

const UNIT_STATUS_TONE: Record<string, 'ok' | 'warn' | 'neutral'> = { available: 'warn', occupied: 'ok', notice_given: 'neutral', maintenance: 'neutral', coming_soon: 'neutral' }
function unitDetails(u: Unit) {
  const parts: string[] = []
  if (u.bedrooms_count) parts.push(`${u.bedrooms_count} chambre${u.bedrooms_count > 1 ? 's' : ''}`)
  if (u.surface_m2) parts.push(`${u.surface_m2} m²`)
  return parts.join(' · ')
}
const listing = computed(() => listingState(property.value?.units ?? []))

/* ---- Baux du bien : « Voir le bail » sur un logement loué, « Créer un bail » sur un logement libre ---- */
const leases = ref<LeaseSummary[]>([])
const leasesState = ref<'loading' | 'ready' | 'error'>('loading')
async function loadLeases() {
  try {
    const all = await leasesApi.fetchMine()
    // Côté pro, seulement les baux où l'on n'est pas le locataire.
    leases.value = all.filter(l => (l.tenant_id ?? l.tenant.id) !== authUser.value?.id)
    leasesState.value = 'ready'
  } catch {
    leasesState.value = 'error'
  }
}
onMounted(loadLeases)
const OPEN_PHASES = ['draft', 'awaiting_tenant', 'awaiting_entry', 'active', 'notice', 'inconsistent']
/** Bail en cours sur ce logement (le plus avancé si plusieurs) — un brouillon compte aussi : il bloque déjà le calendrier. */
function leaseFor(u: Unit): { id: string; draft: boolean } | null {
  const open = leases.value.filter(l => l.unit?.id === u.id && OPEN_PHASES.includes(leasePhase(l)))
  const signed = open.find(l => leasePhase(l) !== 'draft')
  const pick = signed ?? open[0]
  return pick ? { id: pick.id, draft: !signed } : null
}

/* ---- Logements ---- */
const showAddUnit = ref(false)
const editingUnit = ref<Unit | null>(null)
const flash = ref('')
function openAddUnit() {
  if (requireVerified('ajouter un logement')) showAddUnit.value = true
}
function onUnitCreated() {
  showAddUnit.value = false
  flash.value = "Logement ajouté. S'il est libre, il apparaît dans la recherche d'ici une minute."
  tab.value = 'logements'
  load()
}
function onUnitUpdated() {
  editingUnit.value = null
  flash.value = 'Logement mis à jour.'
  load()
}
const confirmUnitId = ref<string | null>(null)
const unitActionError = ref<{ id: string; text: string } | null>(null)
const deletingUnit = ref(false)
function askDeleteUnit(u: Unit) {
  const blocker = deleteBlocker([u])
  unitActionError.value = blocker ? { id: u.id, text: blocker } : null
  confirmUnitId.value = blocker ? null : u.id
}
async function deleteUnit() {
  if (!property.value || !confirmUnitId.value) return
  const id = confirmUnitId.value
  deletingUnit.value = true
  try {
    await propertiesApi.removeUnit(property.value.id, id)
    confirmUnitId.value = null
    flash.value = 'Logement supprimé, avec ses tarifs.'
    await load()
  } catch (e) {
    unitActionError.value = { id, text: formatError(e, 'La suppression a échoué.') }
  } finally {
    deletingUnit.value = false
  }
}

/*
 * Vérification : `PATCH /property/:id` et la création/modification de logements
 * exigent un compte vérifié (403 `KYC_REQUIRED`, `VerifiedUserGuard`). Les
 * boutons concernés portent un cadenas et ouvrent la fenêtre explicative.
 */

/* ---- Édition du bien — tous ces champs sont modifiables côté API (vérifié en live, Lot 45) ---- */
const editingProperty = ref(false)
const edit = ref({ name: '', status: '', description: '', buildingType: '', cityId: '', neighborhoodId: '', address: '', gps: null as GeoPoint | null, onVitrine: false, characteristics: {} as Record<string, boolean> })
const savingProperty = ref(false)
const savePropertyError = ref('')
const propertyTypes = ref<{ value: string; label: string }[]>([])
const cities = ref<{ id: string; name: string }[]>([])
const neighborhoods = ref<{ id: string; name: string }[]>([])
const cityOptions = computed(() => cities.value.map(c => ({ value: c.id, label: c.name })))
const neighborhoodOptions = computed(() => neighborhoods.value.map(n => ({ value: n.id, label: n.name })))
const PROPERTY_STATUS_OPTIONS = Object.entries(PROPERTY_STATUS_LABEL).map(([value, label]) => ({ value, label }))

/*
 * Position : `preciseLocation` écarte les points hors du Bénin (cas réel d'un
 * bien placé en pleine mer). Une position enregistrée ne peut être que
 * déplacée — l'API renvoie 500 si on envoie `null` (vérifié le 2026-09-28).
 */
const savedGps = computed(() => (property.value ? preciseLocation(property.value.gps_latitude, property.value.gps_longitude) : null))
const hasStoredGps = computed(() => toCoordinate(property.value?.gps_latitude) !== null && toCoordinate(property.value?.gps_longitude) !== null)
const storedGpsInvalid = computed(() => hasStoredGps.value && !savedGps.value)
const editCityName = computed(() => cities.value.find(c => c.id === edit.value.cityId)?.name ?? property.value?.city?.name ?? null)
const gpsSection = ref<HTMLElement | null>(null)
async function placeOnMap() {
  if (!requireVerified('modifier ce bien')) return
  await openEditProperty()
  await nextTick()
  gpsSection.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

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
    gps: savedGps.value,
    onVitrine: p.is_publicly_listed,
    characteristics: Object.fromEntries(PROPERTY_CHARACTERISTICS.map(c => [c.key, chars[c.key] === true]))
  }
  savePropertyError.value = ''
  confirmDeleteProperty.value = false
  editingProperty.value = true
  const [pt, c] = await Promise.all([refData.fetchRef('PROPERTY_TYPE'), refData.fetchCities()])
  propertyTypes.value = pt.map(e => ({ value: e.code, label: e.labels.fr ?? e.code }))
  cities.value = c
  neighborhoods.value = edit.value.cityId ? await refData.fetchNeighborhoods(edit.value.cityId) : []
}
async function onCityChange(id: string) {
  edit.value.cityId = id
  edit.value.neighborhoodId = ''
  neighborhoods.value = id ? await refData.fetchNeighborhoods(id) : []
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
      ...(edit.value.gps ? { gps_latitude: edit.value.gps.lat, gps_longitude: edit.value.gps.lng } : {}),
      characteristics: edit.value.characteristics,
      is_publicly_listed: edit.value.onVitrine
    })
    editingProperty.value = false
    flash.value = 'Modifications enregistrées. Elles apparaissent sur l\'annonce d\'ici une minute.'
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

/* ---- Photos : ajout compressé, retrait confirmé, photo principale ---- */
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
const confirmPhotoId = ref<string | null>(null)
const removalWarning = computed(() => photoRemovalWarning(sortedMedia.value.length))
const confirmingPrimary = computed(() => !!sortedMedia.value.find(m => m.id === confirmPhotoId.value)?.is_primary)
function askRemovePhoto(id: string) {
  if (!requireVerified('modifier les photos')) return
  confirmPhotoId.value = id
}
async function changePhotos(change: { removeId?: string; primaryId?: string }) {
  // Retirer une photo ou changer la principale passe par `PATCH /property/:id` (vérification exigée) ; en ajouter une, non.
  if (!property.value || !requireVerified('modifier les photos')) return
  photoBusy.value = true
  uploadError.value = ''
  try {
    const media = sortedMedia.value.map(m => ({ id: m.id, url: m.url, is_primary: !!m.is_primary }))
    await propertiesApi.update(property.value.id, { images: imagesPayload(media, change) })
    confirmPhotoId.value = null
    await load()
  } catch (e) {
    uploadError.value = formatError(e, 'La modification des photos a échoué.')
  } finally {
    photoBusy.value = false
  }
}

/* ---- Alentours (points d'intérêt) ---- */
const pois = ref<PointOfInterest[]>([])
const poiState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const poiForm = ref({ type: 'mosque', name: '', distance: '', noise: '' })
const poiError = ref('')
const poiSaving = ref(false)
const POI_OPTIONS = POI_TYPES.map(p => ({ value: p.code, label: p.label }))
const NOISE_OPTIONS = NOISE_LEVELS.map(n => ({ value: n.code, label: n.label }))
async function loadPois() {
  poiState.value = 'loading'
  try {
    pois.value = await propertiesApi.listPois(propertyId)
    poiState.value = 'success'
  } catch {
    poiState.value = 'error'
  }
}
watch(tab, t => { if (t === 'alentours' && poiState.value === 'idle') loadPois() }, { immediate: true })
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
  if (!units.length) return []
  const occupied = units.filter(u => u.unit_status === 'occupied')
  const revenue = occupied.reduce((sum, u) => sum + Number(u.price), 0)
  const cards = [
    { value: formatFcfaShort(revenue), label: 'loyers occupés / mois' },
    { value: `${Math.round((occupied.length / units.length) * 100)}%`, label: 'occupation' }
  ]
  if (reviewStats.value && reviewStats.value.count > 0) {
    cards.push({ value: reviewStats.value.average.toFixed(1).replace('.', ','), label: `note sur ${reviewStats.value.count} avis` })
  }
  return cards
})
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <NuxtLink to="/pro/biens" class="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700">
      <ArrowLeft class="h-4 w-4" :stroke-width="1.9" /> Mes biens
    </NuxtLink>

    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div class="flex flex-col gap-4.5">
        <DataSkeletonCard :height="200" :lines="1" />
        <DataSkeletonCard :height="160" :lines="1" />
      </div>
      <DataSkeletonCard :height="220" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger ce bien pour le moment : la connexion ou le serveur n'a pas répondu.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <ProEmptyPanel v-else-if="state === 'missing' || !property" :icon="Building" title="Ce bien est introuvable" text="Il a peut-être été supprimé, ou le lien est incomplet.">
      <NuxtLink to="/pro/biens" class="inline-flex items-center rounded-md border border-[var(--border-default)] bg-white px-5 py-3 text-[14px] font-bold text-sand-900">Retour à mes biens</NuxtLink>
    </ProEmptyPanel>

    <template v-else>
      <div v-if="justCreated" class="mb-4.5 rounded-md border border-ok-border bg-ok-bg px-4 py-3.5 text-green-900">
        <p class="m-0 flex items-center gap-2 text-[13.5px] font-bold"><CircleCheck class="h-4.5 w-4.5 flex-none text-ok-fg" :stroke-width="1.9" /> Annonce en ligne.</p>
        <p class="mb-0 mt-1 text-[13px]">Elle apparaît dans la recherche d'ici une minute. La suite : ajoutez d'autres logements, ajustez les tarifs, ou créez le bail d'un locataire déjà trouvé.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <NuxtLink :to="`/biens/${property.id}`" target="_blank" class="inline-flex items-center gap-1.5 rounded-pill border border-ok-border bg-white px-3.5 py-2 text-[12.5px] font-bold text-green-900">Voir l'annonce <ExternalLink class="h-3.5 w-3.5" :stroke-width="1.9" /></NuxtLink>
          <NuxtLink to="/pro/tarifs" class="inline-flex items-center rounded-pill border border-ok-border bg-white px-3.5 py-2 text-[12.5px] font-bold text-green-900">Tarifs et disponibilités</NuxtLink>
          <NuxtLink :to="{ path: '/pro/baux/nouveau', query: property.units[0] ? { unitId: property.units[0].id } : {} }" class="inline-flex items-center rounded-pill border border-ok-border bg-white px-3.5 py-2 text-[12.5px] font-bold text-green-900">Créer un bail</NuxtLink>
        </div>
      </div>

      <p v-if="flash" class="mb-4.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>

      <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <!-- Contenu -->
        <div class="flex min-w-0 flex-col gap-4.5">
          <section class="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white">
            <div class="grid h-[140px] place-items-center bg-sand-200 bg-cover bg-center" :style="coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}">
              <ImageOff v-if="!coverUrl" class="h-6 w-6 text-[var(--text-faint)]" :stroke-width="1.9" />
            </div>
            <div class="p-5.5">
              <h2 class="m-0 font-display text-[22px] font-bold tracking-[-.02em]">{{ property.name }}</h2>
              <p class="mb-0 mt-1 flex items-center gap-1.5 text-[13.5px] text-[var(--text-muted)]">
                <MapPin class="h-4 w-4 flex-none" :stroke-width="1.9" />
                {{ [property.address, property.neighborhood?.name, property.city?.name].filter(Boolean).join(', ') || 'Adresse non renseignée' }}
              </p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <CoreBadge :tone="LISTING_TONE[listing]" bordered>{{ LISTING_LABEL[listing] }}</CoreBadge>
                <CoreBadge v-if="property.status !== 'available'" tone="neutral" bordered>{{ PROPERTY_STATUS_LABEL[property.status] ?? 'État inconnu' }}</CoreBadge>
              </div>

              <div v-if="!savedGps && !editingProperty" class="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-warn-border bg-warn-bg px-4 py-3">
                <p class="m-0 min-w-0 flex-1 text-[13px] text-warn-fg">
                  <strong>{{ storedGpsInvalid ? 'Position incorrecte.' : 'Pas encore placé sur la carte.' }}</strong>
                  {{ storedGpsInvalid ? "La position enregistrée tombe hors du Bénin : les locataires ne voient qu'une zone approximative." : "Les locataires ne voient qu'une zone approximative autour de la ville." }}
                </p>
                <CoreButton tone="secondary" size="sm" class="inline-flex items-center gap-1.5" @click="placeOnMap"><Lock v-if="!canAct" class="h-3.5 w-3.5" :stroke-width="1.9" /><MapPin v-else class="h-4 w-4" :stroke-width="1.9" />Placer sur la carte</CoreButton>
              </div>
            </div>

            <!-- Édition du bien -->
            <div v-if="editingProperty" class="border-t border-[var(--border-subtle)] p-5.5">
              <h3 class="m-0 mb-3.5 text-[15px] font-bold">Modifier le bien</h3>
              <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <FormsInput v-model="edit.name" label="Nom du bien" :invalid="!edit.name.trim()" :hint="!edit.name.trim() ? 'Le nom est obligatoire.' : undefined" />
                <FormsSelect v-model="edit.buildingType" label="Type de bâtiment" :options="propertyTypes" class="[&_select]:w-full" />
                <FormsSelect :model-value="edit.cityId" label="Ville" :options="cityOptions" class="[&_select]:w-full" @update:model-value="onCityChange" />
                <FormsSelect v-model="edit.neighborhoodId" label="Quartier" placeholder="Non précisé" :options="neighborhoodOptions" class="[&_select]:w-full" />
                <FormsInput v-model="edit.address" label="Adresse" placeholder="Rue 12.45, Fidjrossè" />
                <FormsSelect v-model="edit.status" label="État du bâtiment" :options="PROPERTY_STATUS_OPTIONS" class="[&_select]:w-full" />
              </div>
              <p class="mb-0 mt-1.5 text-xs text-[var(--text-faint)]">L'état du bâtiment est informatif : la présence dans la recherche dépend uniquement des logements libres.</p>
              <div ref="gpsSection" class="mt-4">
                <p class="mb-1 mt-0 text-[12.5px] font-bold">Position sur la carte</p>
                <p v-if="storedGpsInvalid" class="mb-2.5 mt-0 text-[12.5px] font-semibold text-warn-fg">La position enregistrée (<span class="font-mono">{{ formatCoords({ lat: Number(property.gps_latitude), lng: Number(property.gps_longitude) }) }}</span>) est hors du Bénin : replacez le bâtiment.</p>
                <p v-else class="mb-2.5 mt-0 text-[12.5px] text-[var(--text-muted)]">Les locataires voient le bien à cet endroit, dans la recherche et sur l'annonce.</p>
                <MapPicker v-model="edit.gps" :city-name="editCityName" :clearable="!hasStoredGps" />
              </div>
              <label class="mt-4 block">
                <span class="mb-[7px] block text-[12.5px] font-bold">Description</span>
                <textarea v-model="edit.description" class="min-h-[80px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3.5 text-sm outline-none" />
              </label>
              <p class="mb-2 mt-4 text-[12.5px] font-bold">Le bâtiment dispose de</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="c in PROPERTY_CHARACTERISTICS"
                  :key="c.key"
                  type="button"
                  :aria-pressed="!!edit.characteristics[c.key]"
                  class="inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-2 text-[13px] font-semibold"
                  :class="edit.characteristics[c.key] ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                  @click="edit.characteristics = { ...edit.characteristics, [c.key]: !edit.characteristics[c.key] }"
                ><Check v-if="edit.characteristics[c.key]" class="h-3.5 w-3.5" :stroke-width="2.2" />{{ c.label }}</button>
              </div>
              <div class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
                <FormsToggle v-model="edit.onVitrine" label="Afficher ce bien sur ma vitrine" hint="Votre page propriétaire publique le liste. La recherche, elle, montre tout bien ayant un logement libre." />
              </div>
              <p v-if="savePropertyError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ savePropertyError }}</p>
              <div class="mt-4.5 flex flex-wrap gap-2.5">
                <CoreButton :disabled="!edit.name.trim() || savingProperty" @click="saveProperty">{{ savingProperty ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
                <CoreButton tone="secondary" @click="editingProperty = false">Annuler</CoreButton>
                <div class="flex-1" />
                <button v-if="!confirmDeleteProperty" type="button" class="inline-flex items-center gap-1.5 rounded-md px-4 py-3 text-[14px] font-bold text-danger-fg hover:bg-danger-bg" @click="askDeleteProperty"><Trash class="h-4 w-4" :stroke-width="1.9" />Supprimer le bien</button>
              </div>
              <p v-if="deletePropertyError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ deletePropertyError }}</p>
              <CoreInlineConfirm
                v-if="confirmDeleteProperty"
                class="mt-3.5"
                tone="danger"
                :message="`Supprimer « ${property.name} » ? Ses ${property.units.length} logement${property.units.length > 1 ? 's' : ''}, ses photos et ses tarifs disparaissent de la plateforme. C'est définitif.`"
                confirm-label="Supprimer"
                :loading="deletingProperty"
                @confirm="deleteProperty"
                @cancel="confirmDeleteProperty = false"
              />
            </div>
          </section>

          <FormsSegmentedControl v-model="tabModel" :options="TABS" size="sm" class="max-w-full self-start overflow-x-auto" />

          <!-- Logements -->
          <section v-if="tab === 'logements'" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <div class="mb-1 flex flex-wrap items-baseline justify-between gap-3">
              <h2 class="m-0 text-[15px] font-bold">Logements</h2>
              <NuxtLink to="/pro/tarifs" class="text-[12.5px] font-bold text-green-700">Tarifs et disponibilités</NuxtLink>
            </div>
            <ProEmptyPanel v-if="!property.units.length" compact :icon="DoorOpen" title="Aucun logement" text="Le bien n'apparaît pas dans la recherche tant qu'il n'a pas au moins un logement avec un prix.">
              <CoreButton class="inline-flex items-center gap-1.5" @click="openAddUnit"><Lock v-if="!canAct" class="h-3.5 w-3.5" :stroke-width="1.9" />Ajouter un logement</CoreButton>
            </ProEmptyPanel>
            <div v-for="u in property.units" :key="u.id" class="border-b border-sand-200 py-3.5 last:border-b-0">
              <div class="flex items-center gap-3.5">
                <div class="grid h-11 w-11 flex-none place-items-center rounded-md bg-sand-200 bg-cover bg-center" :style="(u.unit_media[0]?.url ?? coverUrl) ? { backgroundImage: `url(${u.unit_media[0]?.url ?? coverUrl})` } : {}">
                  <DoorOpen v-if="!(u.unit_media[0]?.url ?? coverUrl)" class="h-4.5 w-4.5 text-[var(--text-faint)]" :stroke-width="1.9" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="m-0 text-sm font-bold">{{ u.name }}</p>
                    <CoreBadge :tone="UNIT_STATUS_TONE[u.unit_status] ?? 'neutral'">{{ UNIT_STATUS_LABEL[u.unit_status] ?? 'Statut inconnu' }}</CoreBadge>
                  </div>
                  <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]"><span class="font-mono font-bold text-[var(--text-secondary)]">{{ formatFcfaShort(Number(u.price)) }}</span><template v-if="unitDetails(u)"> · {{ unitDetails(u) }}</template></p>
                </div>
              </div>
              <div class="mt-2.5 flex flex-wrap items-center gap-2 pl-0 sm:pl-[58px]">
                <template v-if="leasesState === 'ready'">
                  <NuxtLink v-if="leaseFor(u)" :to="`/pro/baux/${leaseFor(u)!.id}`" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold text-sand-900">
                    <FileText class="h-3.5 w-3.5" :stroke-width="1.9" />{{ leaseFor(u)!.draft ? 'Voir le brouillon de bail' : 'Voir le bail' }}
                  </NuxtLink>
                  <NuxtLink v-else :to="{ path: '/pro/baux/nouveau', query: { unitId: u.id } }" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold text-sand-900">
                    <FileText class="h-3.5 w-3.5" :stroke-width="1.9" />Créer un bail
                  </NuxtLink>
                </template>
                <NuxtLink v-else-if="leasesState === 'error'" to="/pro/baux" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold text-sand-900">
                  <FileText class="h-3.5 w-3.5" :stroke-width="1.9" />Baux
                </NuxtLink>
                <NuxtLink :to="{ path: '/pro/tarifs', query: { unit: u.id } }" class="inline-flex items-center rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold text-sand-900">Tarifs</NuxtLink>
                <button type="button" class="inline-flex items-center gap-1.5 rounded-pill px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-sand-100" @click="requireVerified('modifier ce logement') && (editingUnit = u)">
                  <Lock v-if="!canAct" class="h-3.5 w-3.5" :stroke-width="1.9" /><Pencil v-else class="h-3.5 w-3.5" :stroke-width="1.9" />Modifier
                </button>
                <button v-if="confirmUnitId !== u.id" type="button" class="inline-flex items-center gap-1.5 rounded-pill px-3 py-2 text-xs font-bold text-danger-fg hover:bg-danger-bg" @click="askDeleteUnit(u)">
                  <Trash class="h-3.5 w-3.5" :stroke-width="1.9" />Supprimer
                </button>
              </div>
              <CoreInlineConfirm
                v-if="confirmUnitId === u.id"
                class="mt-3"
                tone="danger"
                :message="`Supprimer « ${u.name} » et ses tarifs ? C'est définitif.`"
                confirm-label="Supprimer"
                :loading="deletingUnit"
                @confirm="deleteUnit"
                @cancel="confirmUnitId = null"
              />
              <p v-if="unitActionError?.id === u.id" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ unitActionError.text }}</p>
            </div>
          </section>

          <!-- Photos -->
          <section v-else-if="tab === 'photos'" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <div class="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
              <h2 class="m-0 text-[15px] font-bold">Photos</h2>
              <span class="font-mono text-xs text-[var(--text-faint)]">{{ sortedMedia.length }} photo{{ sortedMedia.length > 1 ? 's' : '' }}</span>
            </div>
            <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              <div v-for="m in sortedMedia" :key="m.id" class="relative h-[124px] overflow-hidden rounded-md bg-sand-200 bg-cover bg-center" :class="confirmPhotoId === m.id ? 'ring-2 ring-danger-fg' : ''" :style="{ backgroundImage: `url(${m.url})` }">
                <CoreBadge v-if="m.is_primary" tone="onPhoto" class="absolute left-1.5 top-1.5">Principale</CoreBadge>
                <div class="absolute inset-x-1.5 bottom-1.5 flex gap-1.5">
                  <button v-if="!m.is_primary" type="button" class="h-9 min-w-0 flex-1 truncate rounded-sm bg-white/95 px-2 text-[11.5px] font-bold text-sand-900 disabled:opacity-50" :disabled="photoBusy" @click="changePhotos({ primaryId: m.id })">Principale</button>
                  <div v-else class="flex-1" />
                  <button type="button" class="grid h-9 w-9 flex-none place-items-center rounded-sm bg-white/95 text-danger-fg disabled:opacity-50" :disabled="photoBusy" aria-label="Retirer la photo" @click="askRemovePhoto(m.id)">
                    <X class="h-4 w-4" :stroke-width="2" />
                  </button>
                </div>
              </div>
              <label class="grid h-[124px] cursor-pointer place-items-center rounded-md border-[1.5px] border-dashed border-[var(--border-default)] text-center text-[var(--text-muted)] hover:border-green-600">
                <span class="flex flex-col items-center gap-1.5 text-[12.5px] font-semibold">
                  <ImagePlus class="h-5 w-5" :stroke-width="1.9" />{{ uploading ? 'Envoi…' : 'Ajouter' }}
                </span>
                <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" :disabled="uploading" @change="addPhoto">
              </label>
            </div>
            <CoreInlineConfirm
              v-if="confirmPhotoId"
              class="mt-3.5"
              tone="danger"
              :message="confirmingPrimary ? 'Retirer la photo principale ? La suivante deviendra la photo de l\'annonce.' : 'Retirer cette photo de l\'annonce ?'"
              confirm-label="Retirer"
              :loading="photoBusy"
              @confirm="changePhotos({ removeId: confirmPhotoId! })"
              @cancel="confirmPhotoId = null"
            >
              <p v-if="removalWarning" class="m-0 text-[12.5px] text-danger-fg-deep">{{ removalWarning }}</p>
            </CoreInlineConfirm>
            <p class="mb-0 mt-3 text-xs text-[var(--text-faint)]">JPG, PNG ou WebP : les photos lourdes sont réduites automatiquement. La photo principale est celle de l'annonce.</p>
            <p v-if="uploadError" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ uploadError }}</p>
          </section>

          <!-- Alentours -->
          <section v-else class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Alentours</h2>
            <p class="mb-4 mt-1 text-[13.5px] text-[var(--text-muted)]">Signalez ce qui se trouve autour : mosquée, église, bar, marché, école… Les locataires y sont très attentifs (bruit, horaires).</p>
            <div class="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-2 xl:grid-cols-[1.1fr_1.3fr_.8fr_1fr_auto]">
              <FormsSelect v-model="poiForm.type" label="Type" :options="POI_OPTIONS" class="[&_select]:w-full" />
              <FormsInput v-model="poiForm.name" label="Nom (facultatif)" placeholder="Marché Dantokpa" />
              <FormsInput v-model="poiForm.distance" label="Distance (m)" type="number" mono placeholder="200" />
              <FormsSelect v-model="poiForm.noise" label="Bruit" placeholder="Non précisé" :options="NOISE_OPTIONS" class="[&_select]:w-full" />
              <CoreButton tone="secondary" class="inline-flex items-center justify-center gap-1.5" :disabled="poiSaving" @click="addPoi"><Plus class="h-4 w-4" :stroke-width="1.9" />{{ poiSaving ? '…' : 'Ajouter' }}</CoreButton>
            </div>
            <p v-if="poiError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ poiError }}</p>
            <div v-if="poiState === 'loading'" class="mt-4"><DataSkeletonCard :height="48" :lines="0" /></div>
            <p v-else-if="poiState === 'error'" class="mb-0 mt-4 text-[13px] font-semibold text-danger-fg">Impossible de charger les alentours. <button type="button" class="font-bold underline" @click="loadPois">Réessayer</button></p>
            <p v-else-if="!pois.length" class="mb-0 mt-4 text-[13.5px] text-[var(--text-muted)]">Rien de signalé pour l'instant : ajoutez le premier repère ci-dessus.</p>
            <div v-else class="mt-3">
              <div v-for="p in pois" :key="p.id" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
                <div class="grid h-9 w-9 flex-none place-items-center rounded-md bg-sand-200 text-[var(--text-secondary)]"><MapPin class="h-4 w-4" :stroke-width="1.9" /></div>
                <div class="min-w-0 flex-1">
                  <p class="m-0 text-sm font-bold">{{ poiLabel(p.poi_type) }}<template v-if="p.name"> · {{ p.name }}</template></p>
                  <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ [p.distance_meters != null ? `${p.distance_meters} m` : '', noiseLabel(p.noise_level)].filter(Boolean).join(' · ') || 'Distance non précisée' }}</p>
                </div>
                <button type="button" class="inline-flex items-center gap-1 rounded-pill px-3 py-2 text-xs font-bold text-danger-fg hover:bg-danger-bg" @click="removePoi(p.id)"><X class="h-3.5 w-3.5" :stroke-width="1.9" />Retirer</button>
              </div>
            </div>
          </section>
        </div>

        <!-- Panneau d'actions -->
        <aside class="flex flex-col gap-4.5 lg:sticky lg:top-[94px]">
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Annonce</h2>
            <p class="mb-0 mt-2 flex items-start gap-2 text-[13.5px]">
              <Eye v-if="listing === 'online'" class="mt-0.5 h-4 w-4 flex-none text-ok-fg" :stroke-width="1.9" />
              <EyeOff v-else class="mt-0.5 h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
              <span><strong>{{ LISTING_LABEL[listing] }}</strong><span class="block text-xs text-[var(--text-faint)]">{{ LISTING_HINT[listing] }}</span></span>
            </p>
            <p class="mb-0 mt-2 text-xs text-[var(--text-faint)]">{{ property.is_publicly_listed ? 'Affiché sur votre vitrine publique.' : "Pas affiché sur votre vitrine publique." }}</p>
            <div class="mt-4 flex flex-col gap-2.5">
              <CoreButton full-width class="inline-flex items-center justify-center gap-1.5" @click="openAddUnit">
                <Lock v-if="!canAct" class="h-3.5 w-3.5" :stroke-width="1.9" /><Plus v-else class="h-4 w-4" :stroke-width="1.9" />Ajouter un logement
              </CoreButton>
              <CoreButton tone="secondary" full-width class="inline-flex items-center justify-center gap-1.5" @click="requireVerified('modifier ce bien') && openEditProperty()">
                <Lock v-if="!canAct" class="h-3.5 w-3.5" :stroke-width="1.9" /><Pencil v-else class="h-4 w-4" :stroke-width="1.9" />Modifier le bien
              </CoreButton>
              <NuxtLink :to="`/biens/${property.id}`" target="_blank" class="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--border-default)] bg-white px-5 py-3 text-[14px] font-bold text-sand-900">
                Voir l'annonce <ExternalLink class="h-4 w-4" :stroke-width="1.9" />
              </NuxtLink>
            </div>
          </section>

          <section v-if="perfCards.length" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 mb-3 text-[15px] font-bold">Performance</h2>
            <div class="grid grid-cols-2 gap-2.5">
              <div v-for="p in perfCards" :key="p.label" class="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
                <p class="m-0 flex items-center gap-1 truncate font-mono text-xl font-bold tracking-[-.02em] text-green-900">
                  {{ p.value }}<Star v-if="p.label.startsWith('note')" class="h-4 w-4 text-clay-500" :stroke-width="1.9" />
                </p>
                <p class="mb-0 mt-1.5 text-[11.5px] leading-[1.3] text-[var(--text-muted)]">{{ p.label }}</p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <ProUniteModal v-if="showAddUnit" :property-id="property.id" :property-name="property.name" @close="showAddUnit = false" @created="onUnitCreated" />
      <ProUniteModal v-if="editingUnit" :property-id="property.id" :property-name="property.name" :unit="editingUnit" @close="editingUnit = null" @updated="onUnitUpdated" />
    </template>
  </div>
</template>
