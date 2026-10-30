<script setup lang="ts">
import { Check, ImagePlus, Lock, X } from '@lucide/vue'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { UPLOAD_HINT, prepareUpload } from '~/utils/uploadFile'
import type { GeoPoint } from '~/utils/geo'
import { verificationGateCopy, verificationLink } from '~/utils/kycStatus'
import {
  PROPERTY_CHARACTERISTICS, RENTAL_CHOICES, imagesPayload, rentalSetup, validateMonths, validateRentalPrices,
  type RentalChoice
} from '~/utils/propertyForm'
import { photoRemovalWarning } from '~/utils/proProperties'

definePageMeta({ layout: 'pro' })

const propertiesApi = useLandlordPropertiesApi()
const pricingApi = useUnitPricingApi()
const searchApi = usePropertySearchApi()
const refData = useReferenceData()

/**
 * `POST /property` refuse (403 `error.KYC_REQUIRED`) tant que `users.is_verified`
 * est faux : l'assistant cède alors la place à une explication, plutôt que de
 * laisser remplir cinq étapes pour un refus à la fin.
 */
const { canAct, stage } = useVerification()
const notVerified = computed(() => !canAct.value)
const gateCopy = computed(() => verificationGateCopy(stage.value, 'publier un bien'))

const STEP_LABELS = ['Le bien', 'Photos', 'Le logement', 'Conditions', 'Publication']
const STEP_HINTS = [
  'Nom, type, adresse, position sur la carte et ce que le bâtiment offre.',
  'Photos du bien — 5 minimum.',
  'Type, surface, ameublement et mode de location : au mois, à la nuit ou les deux.',
  'Caution, avance et frais (location au mois) ; règles des séjours courts (location à la nuit).',
  'Date de disponibilité, puis mise en ligne.'
]

const step = ref(1)
const hint = computed(() => STEP_HINTS[step.value - 1])

function formatError(e: unknown, fallback: string) {
  return e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback
}

/* ---- Étape 1 : le bien (créé à la première validation, mis à jour ensuite — plus de doublon en revenant en arrière) ---- */
const name = ref('')
const buildingType = ref('')
const cityId = ref('')
const neighborhoodId = ref('')
const address = ref('')
/** Position choisie sur la carte. Une fois envoyée, elle ne peut plus être effacée (l'API renvoie 500 sur `null`), seulement déplacée. */
const gps = ref<GeoPoint | null>(null)
const gpsSaved = ref(false)
const description = ref('')
const characteristics = ref<Record<string, boolean>>({})
const onVitrine = ref(true)
const propertyId = ref<string | null>(null)
const step1Error = ref('')
const step1Loading = ref(false)

/* ---- Référentiels ---- */
const propertyTypes = ref<{ code: string; label: string }[]>([])
const cities = ref<{ id: string; name: string }[]>([])
const neighborhoods = ref<{ id: string; name: string }[]>([])
const unitTypes = ref<{ id: string; label: string }[]>([])
const waterOptions = ref<{ code: string; label: string }[]>([])
const meterOptions = ref<{ code: string; label: string }[]>([])
const furnishedOptions = ref<{ code: string; label: string }[]>([])
const featureOptions = ref<{ code: string; label: string }[]>([])
const refsReady = ref(false)
onMounted(async () => {
  const [pt, c, ut, w, m, f, feat] = await Promise.all([
    refData.fetchRef('PROPERTY_TYPE'), refData.fetchCities(), refData.fetchRef('UNIT_TYPE'), refData.fetchRef('WATER_SOURCE'),
    refData.fetchRef('METER_TYPE'), refData.fetchRef('FURNISHED_LEVEL'), refData.fetchRef('FEATURE')
  ])
  propertyTypes.value = pt.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  cities.value = c
  unitTypes.value = ut.map(e => ({ id: e.id, label: e.labels.fr ?? e.code }))
  waterOptions.value = w.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  meterOptions.value = m.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  furnishedOptions.value = f.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  featureOptions.value = feat.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  buildingType.value ||= propertyTypes.value[0]?.code ?? ''
  cityId.value ||= cities.value[0]?.id ?? ''
  unitTypeId.value ||= unitTypes.value[0]?.id ?? ''
  refsReady.value = true
})
const cityName = computed(() => cities.value.find(c => c.id === cityId.value)?.name ?? null)
watch(cityId, async id => {
  neighborhoodId.value = ''
  neighborhoods.value = id ? await refData.fetchNeighborhoods(id) : []
})

function propertyPayload() {
  return {
    name: name.value.trim(),
    building_type: buildingType.value,
    city_id: cityId.value,
    neighborhood_id: neighborhoodId.value || undefined,
    address: address.value.trim() || undefined,
    ...(gps.value ? { gps_latitude: gps.value.lat, gps_longitude: gps.value.lng } : {}),
    description: description.value.trim() ? { fr: description.value.trim() } : undefined,
    characteristics: { ...characteristics.value },
    is_publicly_listed: onVitrine.value
  }
}

async function submitStep1() {
  if (!name.value.trim() || !buildingType.value || !cityId.value) {
    step1Error.value = 'Le nom, le type de bâtiment et la ville sont obligatoires.'
    return
  }
  step1Loading.value = true
  step1Error.value = ''
  try {
    if (propertyId.value) {
      await propertiesApi.update(propertyId.value, propertyPayload())
    } else {
      const created = await propertiesApi.create(propertyPayload())
      propertyId.value = created.id
    }
    if (gps.value) gpsSaved.value = true
    step.value = 2
  } catch (e) {
    step1Error.value = formatError(e, 'La création a échoué.')
  } finally {
    step1Loading.value = false
  }
}

/* ---- Étape 2 : photos (compressées, retirables, principale au choix) ---- */
const photos = ref<{ id: string; url: string; is_primary: boolean }[]>([])
const uploading = ref(false)
const uploadError = ref('')
async function addPhoto(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !propertyId.value) return
  uploading.value = true
  uploadError.value = ''
  try {
    const ready = await prepareUpload(file)
    if (ready.error !== null) {
      uploadError.value = ready.error
      return
    }
    const uploaded = await propertiesApi.uploadImage(ready.file)
    const media = await propertiesApi.addMedia(propertyId.value, uploaded.url, { isPrimary: photos.value.length === 0, rank: photos.value.length + 1 })
    photos.value.push({ id: media.id, url: uploaded.url, is_primary: photos.value.length === 0 })
  } catch (e2) {
    uploadError.value = formatError(e2, "L'envoi a échoué.")
  } finally {
    uploading.value = false
    input.value = ''
  }
}
/** Retirer une photo se confirme sur place (5 au minimum pour publier). */
const confirmPhotoId = ref<string | null>(null)
const photoBusy = ref(false)
const removalWarning = computed(() => photoRemovalWarning(photos.value.length))
async function changePhotos(change: { removeId?: string; primaryId?: string }) {
  if (!propertyId.value) return
  uploadError.value = ''
  photoBusy.value = true
  const images = imagesPayload(photos.value, change)
  try {
    await propertiesApi.update(propertyId.value, { images })
    // L'API recrée les lignes média (nouveaux id) : on relit plutôt que de deviner.
    const fresh = await searchApi.fetchById(propertyId.value)
    photos.value = [...fresh.media].sort((x, y) => Number(!!y.is_primary) - Number(!!x.is_primary)).map(m => ({ id: m.id, url: m.url, is_primary: !!m.is_primary }))
    confirmPhotoId.value = null
  } catch (e) {
    uploadError.value = formatError(e, 'La modification des photos a échoué.')
  } finally {
    photoBusy.value = false
  }
}

/* ---- Étape 3 : le logement ---- */
const unitName = ref('')
const unitTypeId = ref('')
const surface = ref('')
const bedrooms = ref('')
const bathrooms = ref('')
const furnishedLevel = ref('')
const waterSource = ref('')
const meterType = ref('')
const features = ref<string[]>([])
const unitDescription = ref('')
const rentalChoice = ref<RentalChoice>('mois')
const monthlyPrice = ref('')
const nightlyPrice = ref('')
const hasMonthly = computed(() => rentalChoice.value !== 'nuit')
const hasNightly = computed(() => rentalChoice.value !== 'mois')

function toggleFeature(code: string) {
  features.value = features.value.includes(code) ? features.value.filter(c => c !== code) : [...features.value, code]
}

/* ---- Étape 4 : conditions ---- */
const fraisDossier = ref('')
const cautionMonths = ref('2')
const avanceMonths = ref('1')
const bookingRetentionPercentage = ref('')
const requiresBookingInventory = ref(false)

/* ---- Étape 5 : publication ---- */
const availableFrom = ref('')

/** 5 photos minimum : une annonce sans photo (ou presque) recevait bien moins de demandes — plus optionnel. */
const MIN_PHOTOS = 5
const step2Error = computed(() => photos.value.length < MIN_PHOTOS ? `Ajoutez au moins ${MIN_PHOTOS} photos (${photos.value.length}/${MIN_PHOTOS} pour l'instant).` : null)

const step3Error = computed(() => {
  if (!unitName.value.trim() || !unitTypeId.value) return "Renseignez le nom et le type du logement."
  return validateRentalPrices(rentalChoice.value, monthlyPrice.value, nightlyPrice.value)
})
const step4Error = computed(() => {
  if (!hasMonthly.value) {
    const r = Number(bookingRetentionPercentage.value || 0)
    return r < 0 || r > 100 ? 'La retenue de garantie doit être comprise entre 0 et 100 %.' : null
  }
  return validateMonths('Caution', cautionMonths.value) ?? validateMonths('Avance', avanceMonths.value)
})
const showStepError = ref(false)

const finalLoading = ref(false)
const finalError = ref('')
const pricingWarning = ref('')
async function submitUnit() {
  if (!propertyId.value) return
  if (step3Error.value) { step.value = 3; showStepError.value = true; return }
  if (step4Error.value) { step.value = 4; showStepError.value = true; return }
  finalLoading.value = true
  finalError.value = ''
  const setup = rentalSetup(rentalChoice.value, Number(monthlyPrice.value) || null, Number(nightlyPrice.value) || null)
  let unitId: string
  try {
    const unit = await propertiesApi.createUnit(propertyId.value, {
      ref_type_id: unitTypeId.value,
      name: unitName.value.trim(),
      price: setup.price,
      min_duration_days: setup.min_duration_days,
      characteristics: setup.characteristics,
      surface_m2: surface.value ? Number(surface.value) : undefined,
      bedrooms_count: bedrooms.value ? Number(bedrooms.value) : undefined,
      bathrooms_count: bathrooms.value ? Number(bathrooms.value) : undefined,
      furnished_level: furnishedLevel.value || undefined,
      water_source: waterSource.value || undefined,
      meter_type: meterType.value || undefined,
      features: features.value.length ? features.value : undefined,
      description: unitDescription.value.trim() ? { fr: unitDescription.value.trim() } : undefined,
      frais_dossier: hasMonthly.value && fraisDossier.value ? Number(fraisDossier.value) : undefined,
      caution_months: hasMonthly.value && cautionMonths.value ? Number(cautionMonths.value) : undefined,
      avance_months: hasMonthly.value && avanceMonths.value ? Number(avanceMonths.value) : undefined,
      available_from: availableFrom.value || undefined,
      requires_booking_inventory: hasNightly.value ? requiresBookingInventory.value : undefined,
      booking_retention_percentage: hasNightly.value && bookingRetentionPercentage.value ? Number(bookingRetentionPercentage.value) : undefined
    })
    unitId = unit.id
  } catch (e) {
    finalError.value = formatError(e, "La création du logement a échoué.")
    finalLoading.value = false
    return
  }
  /**
   * `POST .../units` ignore silencieusement `features` — vérifié en direct : la réponse de
   * création n'a même pas la clé `resolved_features`, alors qu'un `PATCH` immédiatement après
   * l'applique correctement (confirmé par `resolved_features` peuplé dans SA réponse à lui).
   * Sans ce correctif, les équipements cochés à la création étaient perdus sans avertissement.
   */
  if (features.value.length) {
    try {
      await propertiesApi.updateUnit(propertyId.value, unitId, { features: features.value })
    } catch {
      pricingWarning.value = "Le logement est créé, mais les équipements n'ont pas pu être enregistrés. Ajoutez-les depuis la fiche du bien."
    }
  }
  // Grille tarifaire : c'est elle qui range l'annonce « à la nuit » / « au mois » dans la recherche.
  const failed: string[] = []
  for (const row of setup.pricing) {
    try {
      await pricingApi.createPricing(unitId, row)
    } catch {
      failed.push(row.billing_frequency === 'daily' ? 'à la nuit' : 'au mois')
    }
  }
  finalLoading.value = false
  if (failed.length) {
    const tariffMsg = `le tarif ${failed.join(' et ')} n'a pas pu être enregistré`
    pricingWarning.value = pricingWarning.value
      ? `Le logement est créé, mais ${tariffMsg}, et les équipements n'ont pas pu être enregistrés non plus. Ajoutez-les depuis « Tarifs et disponibilités » et la fiche du bien.`
      : `Le logement est créé, mais ${tariffMsg}. Ajoutez-le depuis « Tarifs et disponibilités ».`
    return
  }
  if (pricingWarning.value) return
  await navigateTo({ path: '/pro/biens/fiche', query: { id: propertyId.value, created: '1' } })
}

function next() {
  showStepError.value = false
  if (step.value === 1) { submitStep1(); return }
  if (step.value === 2 && step2Error.value) { showStepError.value = true; return }
  if (step.value === 3 && step3Error.value) { showStepError.value = true; return }
  if (step.value === 4 && step4Error.value) { showStepError.value = true; return }
  if (step.value === 5) { submitUnit(); return }
  step.value = Math.min(5, step.value + 1)
}
function prev() {
  showStepError.value = false
  step.value = Math.max(1, step.value - 1)
}
const nextLabel = computed(() => {
  if (step.value === 1) return step1Loading.value ? 'Enregistrement…' : (propertyId.value ? 'Enregistrer et continuer' : 'Créer le bien et continuer')
  if (step.value === 5) return finalLoading.value ? 'Mise en ligne…' : 'Mettre en ligne'
  return 'Étape suivante'
})
const currentStepError = computed(() => {
  if (!showStepError.value) return null
  return step.value === 2 ? step2Error.value : step.value === 3 ? step3Error.value : step.value === 4 ? step4Error.value : null
})

/* ---- Options des listes (FormsSelect) ---- */
const toOptions = (list: { code: string; label: string }[]) => list.map(o => ({ value: o.code, label: o.label }))
const propertyTypeOptions = computed(() => toOptions(propertyTypes.value))
const cityOptions = computed(() => cities.value.map(c => ({ value: c.id, label: c.name })))
const neighborhoodOptions = computed(() => neighborhoods.value.map(n => ({ value: n.id, label: n.name })))
const unitTypeOptions = computed(() => unitTypes.value.map(t => ({ value: t.id, label: t.label })))
const furnishedSelect = computed(() => toOptions(furnishedOptions.value))
const waterSelect = computed(() => toOptions(waterOptions.value))
const meterSelect = computed(() => toOptions(meterOptions.value))
const progress = computed(() => `${Math.round((step.value / STEP_LABELS.length) * 100)}%`)

const summary = computed(() => {
  const parts: string[] = []
  if (hasMonthly.value && monthlyPrice.value) parts.push(`${formatFcfa(Number(monthlyPrice.value))} / mois`)
  if (hasNightly.value && nightlyPrice.value) parts.push(`${formatFcfa(Number(nightlyPrice.value))} / nuit`)
  return parts.join(' · ')
})
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <section v-if="notVerified" class="mx-auto max-w-[560px] rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 text-center sm:px-8 sm:py-9">
      <span class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill" :class="stage === 'rejected' ? 'bg-danger-bg text-danger-fg' : stage === 'review' ? 'bg-info-bg text-info-fg' : 'bg-green-50 text-green-700'">
        <Lock class="h-5 w-5" :stroke-width="1.9" />
      </span>
      <h2 class="mb-0 mt-4 text-[17px] font-bold">{{ gateCopy.title }}</h2>
      <p class="mx-auto mb-0 mt-2 max-w-[440px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">{{ gateCopy.text }}</p>
      <div class="mt-5.5 flex flex-col justify-center gap-2.5 sm:flex-row">
        <NuxtLink :to="verificationLink('/pro/biens/ajouter')" class="inline-flex items-center justify-center rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-[14px] font-bold text-white shadow-action">{{ gateCopy.cta }}</NuxtLink>
        <NuxtLink to="/pro/biens" class="inline-flex items-center justify-center rounded-md border border-[var(--border-default)] bg-white px-5 py-3 text-[14px] font-bold text-sand-900">Retour à mes biens</NuxtLink>
      </div>
    </section>

    <div v-else class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <!-- Mobile et tablette : barre de progression compacte, le formulaire reste en haut de l'écran -->
      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-3.5 lg:hidden">
        <div class="flex items-baseline justify-between gap-3">
          <p class="m-0 text-sm font-bold">{{ STEP_LABELS[step - 1] }}</p>
          <p class="m-0 text-xs text-[var(--text-faint)]">Étape <span class="font-mono">{{ step }}</span> sur <span class="font-mono">{{ STEP_LABELS.length }}</span></p>
        </div>
        <div class="mt-2.5 h-1.5 overflow-hidden rounded-pill bg-sand-200">
          <div class="h-full rounded-pill bg-green-600 transition-[width] duration-[var(--duration-base)]" :style="{ width: progress }" />
        </div>
      </div>

      <!-- Ordinateur : sommaire des étapes -->
      <nav aria-label="Étapes" class="hidden rounded-2xl border border-[var(--border-subtle)] bg-white p-4 lg:sticky lg:top-[94px] lg:block">
        <button
          v-for="(label, i) in STEP_LABELS"
          :key="label"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-md p-2.5 text-left disabled:cursor-not-allowed"
          :class="step === i + 1 ? 'bg-green-50' : 'bg-transparent hover:bg-sand-100'"
          :disabled="i + 1 > step && !propertyId"
          :aria-current="step === i + 1 ? 'step' : undefined"
          @click="(i + 1 <= step || propertyId) && (step = i + 1)"
        >
          <span class="grid h-6 w-6 flex-none place-items-center rounded-pill font-mono text-[11px] font-black" :class="step >= i + 1 ? 'bg-green-600 text-white' : 'bg-sand-300 text-[var(--text-faint)]'">
            <Check v-if="step > i + 1" class="h-3.5 w-3.5" :stroke-width="2.4" /><template v-else>{{ i + 1 }}</template>
          </span>
          <span class="text-[13px] font-semibold" :class="step === i + 1 ? 'text-green-800' : 'text-[var(--text-secondary)]'">{{ label }}</span>
        </button>
        <div class="my-3 h-px bg-sand-200" />
        <p class="m-0 px-1 text-xs text-[var(--text-faint)]">{{ propertyId ? 'Bien enregistré · étape' : 'Étape' }} <span class="font-mono">{{ step }} / 5</span></p>
      </nav>

      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <h2 class="m-0 hidden text-[15px] font-bold lg:block">{{ STEP_LABELS[step - 1] }}</h2>
        <p class="mb-5 mt-0 text-[13.5px] text-[var(--text-muted)] lg:mt-1">{{ hint }}</p>

        <div v-if="step === 1" class="flex flex-col gap-3.5">
          <p v-if="step1Error" class="m-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] font-semibold text-danger-fg">{{ step1Error }}</p>
          <FormsInput v-model="name" label="Nom du bien" placeholder="Résidence Étoile" />
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <FormsSelect v-model="buildingType" label="Type de bâtiment" :options="propertyTypeOptions" class="[&_select]:w-full" />
            <FormsSelect v-model="cityId" label="Ville" :options="cityOptions" class="[&_select]:w-full" />
            <FormsSelect v-model="neighborhoodId" label="Quartier (facultatif)" placeholder="Non précisé" :options="neighborhoodOptions" class="[&_select]:w-full" />
            <FormsInput v-model="address" label="Adresse (facultatif)" placeholder="Rue 12.45, Fidjrossè" />
          </div>
          <div>
            <p class="mb-1 mt-0 text-[12.5px] font-bold">Position sur la carte (recommandé)</p>
            <p class="mb-2.5 mt-0 text-[12.5px] text-[var(--text-muted)]">Les locataires verront le bien à cet endroit, dans la recherche et sur l'annonce.</p>
            <MapPicker v-model="gps" :city-name="cityName" :clearable="!gpsSaved" />
          </div>
          <label class="block">
            <span class="mb-[7px] block text-[12.5px] font-bold">Description (facultatif)</span>
            <textarea v-model="description" placeholder="Environnement, accès, points forts…" class="min-h-[84px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3.5 text-sm outline-none" />
          </label>
          <div>
            <p class="mb-2 mt-0 text-[12.5px] font-bold">Le bâtiment dispose de</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="c in PROPERTY_CHARACTERISTICS"
                :key="c.key"
                type="button"
                :aria-pressed="!!characteristics[c.key]"
                class="inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-2 text-[13px] font-semibold"
                :class="characteristics[c.key] ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                @click="characteristics = { ...characteristics, [c.key]: !characteristics[c.key] }"
              ><Check v-if="characteristics[c.key]" class="h-3.5 w-3.5" :stroke-width="2.2" />{{ c.label }}</button>
            </div>
          </div>
          <div class="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
            <FormsToggle v-model="onVitrine" label="Afficher sur ma vitrine publique" hint="Votre page propriétaire liste ce bien. La recherche, elle, montre tout bien ayant un logement libre." />
          </div>
        </div>

        <div v-else-if="step === 2">
          <p class="m-0 mb-3.5 flex items-center gap-1.5 text-[13px] font-semibold" :class="photos.length >= MIN_PHOTOS ? 'text-ok-fg' : 'text-[var(--text-muted)]'">
            <Check v-if="photos.length >= MIN_PHOTOS" class="h-4 w-4" :stroke-width="2.2" /><span class="font-mono">{{ photos.length }} / {{ MIN_PHOTOS }}</span> photos
          </p>
          <label class="block cursor-pointer rounded-lg border-[1.5px] border-dashed border-[var(--border-default)] bg-[var(--surface-page)] p-7 text-center hover:border-green-600">
            <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" :disabled="uploading" @change="addPhoto">
            <span class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><ImagePlus class="h-5 w-5" :stroke-width="1.9" /></span>
            <p class="mb-0 mt-3 text-sm font-bold">{{ uploading ? 'Envoi en cours…' : 'Ajouter une photo' }}</p>
            <p class="mb-0 mt-1.5 text-[12.5px] text-[var(--text-muted)]">JPG, PNG ou WebP · les photos lourdes sont réduites automatiquement · une à la fois</p>
          </label>
          <p v-if="uploadError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ uploadError }}</p>
          <div v-if="photos.length" class="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div v-for="p in photos" :key="p.id" class="relative h-[110px] overflow-hidden rounded-md bg-sand-200 bg-cover bg-center" :class="confirmPhotoId === p.id ? 'ring-2 ring-danger-fg' : ''" :style="{ backgroundImage: `url(${p.url})` }">
              <CoreBadge v-if="p.is_primary" tone="onPhoto" class="absolute left-1.5 top-1.5">Principale</CoreBadge>
              <div class="absolute inset-x-1.5 bottom-1.5 flex gap-1.5">
                <button v-if="!p.is_primary" type="button" class="h-9 min-w-0 flex-1 truncate rounded-sm bg-white/95 px-2 text-[11.5px] font-bold text-sand-900 disabled:opacity-50" :disabled="photoBusy" @click="changePhotos({ primaryId: p.id })">Principale</button>
                <div v-else class="flex-1" />
                <button type="button" class="grid h-9 w-9 flex-none place-items-center rounded-sm bg-white/95 text-danger-fg disabled:opacity-50" aria-label="Retirer la photo" :disabled="photoBusy" @click="confirmPhotoId = p.id"><X class="h-4 w-4" :stroke-width="2" /></button>
              </div>
            </div>
          </div>
          <CoreInlineConfirm
            v-if="confirmPhotoId"
            class="mt-3.5"
            tone="danger"
            message="Retirer cette photo ?"
            confirm-label="Retirer"
            :loading="photoBusy"
            @confirm="changePhotos({ removeId: confirmPhotoId! })"
            @cancel="confirmPhotoId = null"
          >
            <p v-if="removalWarning" class="m-0 text-[12.5px] text-danger-fg-deep">{{ removalWarning }}</p>
          </CoreInlineConfirm>
          <p class="mb-0 mt-3 text-xs text-[var(--text-faint)]">{{ UPLOAD_HINT }}. Une annonce avec photos reçoit bien plus de demandes.</p>
        </div>

        <div v-else-if="step === 3" class="flex flex-col gap-4">
          <div>
            <p class="mb-2 mt-0 text-[12.5px] font-bold">Ce logement se loue</p>
            <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <button
                v-for="r in RENTAL_CHOICES"
                :key="r.key"
                type="button"
                :aria-pressed="rentalChoice === r.key"
                class="rounded-md border p-3.5 text-left"
                :class="rentalChoice === r.key ? 'border-green-600 bg-green-50 ring-1 ring-green-600' : 'border-[var(--border-default)] bg-white'"
                @click="rentalChoice = r.key"
              >
                <p class="m-0 text-sm font-bold">{{ r.label }}</p>
                <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ r.hint }}</p>
              </button>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <FormsInput v-if="hasMonthly" v-model="monthlyPrice" label="Loyer mensuel (FCFA)" type="number" mono />
            <FormsInput v-if="hasNightly" v-model="nightlyPrice" label="Prix par nuit (FCFA)" type="number" mono />
            <FormsInput v-model="unitName" label="Nom du logement" placeholder="Appartement A1" />
            <FormsSelect v-model="unitTypeId" label="Type" :options="unitTypeOptions" class="[&_select]:w-full" />
            <FormsSelect v-model="furnishedLevel" label="Ameublement" placeholder="Non précisé" :options="furnishedSelect" class="[&_select]:w-full" />
            <div class="grid grid-cols-3 gap-2.5">
              <FormsInput v-model="surface" label="m²" type="number" mono />
              <FormsInput v-model="bedrooms" label="Chambres" type="number" mono />
              <FormsInput v-model="bathrooms" label="Douches" type="number" mono />
            </div>
            <FormsSelect v-model="waterSource" label="Source d'eau" placeholder="Non précisé" :options="waterSelect" class="[&_select]:w-full" />
            <FormsSelect v-model="meterType" label="Compteur" placeholder="Non précisé" :options="meterSelect" class="[&_select]:w-full" />
          </div>
          <div v-if="featureOptions.length">
            <p class="mb-2 mt-0 text-[12.5px] font-bold">Équipements</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="f in featureOptions"
                :key="f.code"
                type="button"
                :aria-pressed="features.includes(f.code)"
                class="inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold"
                :class="features.includes(f.code) ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                @click="toggleFeature(f.code)"
              ><Check v-if="features.includes(f.code)" class="h-3.5 w-3.5" :stroke-width="2.2" />{{ f.label }}</button>
            </div>
          </div>
          <label class="block">
            <span class="mb-[7px] block text-[12.5px] font-bold">Description du logement (facultatif)</span>
            <textarea v-model="unitDescription" class="min-h-[70px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3.5 text-sm outline-none" />
          </label>
        </div>

        <div v-else-if="step === 4" class="flex flex-col gap-4">
          <div v-if="hasMonthly">
            <p class="mb-2.5 mt-0 text-sm font-bold">Location au mois</p>
            <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <FormsInput v-model="cautionMonths" label="Caution (mois)" type="number" mono />
              <FormsInput v-model="avanceMonths" label="Avance (mois)" type="number" mono />
              <FormsInput v-model="fraisDossier" label="Frais de dossier (FCFA)" type="number" mono />
            </div>
            <p class="mb-0 mt-2 text-xs text-[var(--text-faint)]">La loi 2022-30 plafonne la caution et l'avance à 3 mois de loyer chacune. La caution est séquestrée par Immo, jamais versée au propriétaire.</p>
          </div>
          <div v-if="hasNightly">
            <p class="mb-2.5 mt-0 text-sm font-bold">Séjours à la nuit</p>
            <FormsInput v-model="bookingRetentionPercentage" label="Retenue de garantie (%)" type="number" mono placeholder="0" hint="La retenue est gardée par Immo jusqu'au départ du voyageur, puis versée." class="sm:max-w-[260px]" />
            <div class="mt-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
              <FormsToggle v-model="requiresBookingInventory" label="Exiger un état des lieux à l'arrivée" hint="La retenue n'est versée qu'une fois l'état des lieux d'arrivée fait." />
            </div>
          </div>
        </div>

        <div v-else class="flex flex-col gap-3.5">
          <FormsInput v-model="availableFrom" label="Disponible à partir du (facultatif)" type="date" class="sm:max-w-[260px]" />
          <div class="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4 text-[13px] leading-[1.6] text-[var(--text-secondary)]">
            <p class="m-0 font-bold text-[var(--text-primary)]">{{ name || 'Votre bien' }} · {{ unitName || 'logement' }}</p>
            <p class="m-0"><span class="font-mono">{{ summary || 'Prix à renseigner' }}</span><template v-if="photos.length"> · {{ photos.length }} photo{{ photos.length > 1 ? 's' : '' }}</template></p>
            <p class="mb-0 mt-2">Dès la mise en ligne, l'annonce apparaît dans la recherche (sous une minute) tant que le logement est libre. Passez-le en « Occupée » depuis la fiche pour la retirer.</p>
          </div>
          <p v-if="finalError" class="m-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] font-semibold text-danger-fg">{{ finalError }}</p>
          <div v-if="pricingWarning" class="rounded-md border border-warn-border bg-warn-bg px-3.5 py-3 text-[13px] text-warn-fg">
            <p class="m-0 font-semibold">{{ pricingWarning }}</p>
            <NuxtLink :to="{ path: '/pro/biens/fiche', query: { id: propertyId } }" class="mt-1.5 inline-block font-bold underline">Voir le bien</NuxtLink>
          </div>
        </div>

        <p v-if="currentStepError" class="mb-0 mt-4 text-[13px] font-semibold text-danger-fg">{{ currentStepError }}</p>

        <div class="mt-6 flex justify-between gap-3">
          <CoreButton tone="secondary" :disabled="step === 1" @click="prev">Précédent</CoreButton>
          <CoreButton :disabled="!refsReady || step1Loading || finalLoading || !!pricingWarning" @click="next">{{ nextLabel }}</CoreButton>
        </div>
      </section>
    </div>
  </div>
</template>
