<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { UPLOAD_HINT, prepareUpload } from '~/utils/uploadFile'
import {
  PROPERTY_CHARACTERISTICS, RENTAL_CHOICES, imagesPayload, rentalSetup, validateMonths, validateRentalPrices,
  type RentalChoice
} from '~/utils/propertyForm'

definePageMeta({ layout: 'pro' })

const propertiesApi = useLandlordPropertiesApi()
const pricingApi = useUnitPricingApi()
const searchApi = usePropertySearchApi()
const refData = useReferenceData()
const currentUser = useAuthUser()

/** `POST /property` refuse (403 `error.KYC_REQUIRED`) tant que `users.is_verified` est faux — dit dès l'arrivée, pas après avoir tout rempli. */
const notVerified = computed(() => currentUser.value?.is_verified === false)

const STEP_LABELS = ['Le bien', 'Photos', 'Le logement', 'Conditions', 'Publication']
const STEP_HINTS = [
  'Nom, type, adresse et ce que le bâtiment offre.',
  'Photos du bien — optionnel, peut être fait plus tard.',
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
async function changePhotos(change: { removeId?: string; primaryId?: string }) {
  if (!propertyId.value) return
  uploadError.value = ''
  const images = imagesPayload(photos.value, change)
  try {
    await propertiesApi.update(propertyId.value, { images })
    // L'API recrée les lignes média (nouveaux id) : on relit plutôt que de deviner.
    const fresh = await searchApi.fetchById(propertyId.value)
    photos.value = [...fresh.media].sort((x, y) => Number(!!y.is_primary) - Number(!!x.is_primary)).map(m => ({ id: m.id, url: m.url, is_primary: !!m.is_primary }))
  } catch (e) {
    uploadError.value = formatError(e, 'La modification des photos a échoué.')
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
    pricingWarning.value = `Le logement est créé, mais le tarif ${failed.join(' et ')} n'a pas pu être enregistré. Ajoutez-le depuis « Tarifs et disponibilités ».`
    return
  }
  await navigateTo({ path: '/pro/biens/fiche', query: { id: propertyId.value, created: '1' } })
}

function next() {
  showStepError.value = false
  if (step.value === 1) { submitStep1(); return }
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
const currentStepError = computed(() => showStepError.value ? (step.value === 3 ? step3Error.value : step.value === 4 ? step4Error.value : null) : null)

const summary = computed(() => {
  const parts: string[] = []
  if (hasMonthly.value && monthlyPrice.value) parts.push(`${formatFcfa(Number(monthlyPrice.value))} / mois`)
  if (hasNightly.value && nightlyPrice.value) parts.push(`${formatFcfa(Number(nightlyPrice.value))} / nuit`)
  return parts.join(' · ')
})
</script>

<template>
  <div>
    <div v-if="notVerified" class="mb-4.5 flex flex-col gap-3 rounded-xl border border-warn-border bg-warn-bg px-5 py-4 sm:flex-row sm:items-center">
      <div class="flex-1">
        <p class="m-0 text-[14.5px] font-bold text-warn-fg">Votre identité n'est pas encore vérifiée</p>
        <p class="mb-0 mt-0.5 text-[13.5px] text-[var(--text-secondary)]">Immo doit valider votre compte avant la publication d'un bien : la création sera refusée d'ici là.</p>
      </div>
      <NuxtLink to="/kyc" class="flex-none rounded-md bg-[image:var(--action-primary)] px-5 py-2.5 text-center text-[13.5px] font-bold text-white">Vérifier mon compte</NuxtLink>
    </div>

    <div class="grid grid-cols-1 items-start gap-6.5 lg:grid-cols-[220px_1fr]">
      <div class="rounded-xl border border-[var(--border-subtle)] bg-white p-4.5 lg:sticky lg:top-[94px]">
        <button
          v-for="(label, i) in STEP_LABELS"
          :key="label"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-sm p-2.5 text-left"
          :class="step === i + 1 ? 'bg-green-50' : 'bg-transparent'"
          :disabled="i + 1 > step && !propertyId"
          @click="(i + 1 <= step || propertyId) && (step = i + 1)"
        >
          <span
            class="grid h-6 w-6 flex-none place-items-center rounded-pill text-[11px] font-black"
            :class="step >= i + 1 ? 'bg-green-600 text-white' : 'bg-sand-300 text-[var(--text-faint)]'"
          >{{ step > i + 1 ? '✓' : i + 1 }}</span>
          <span class="text-[13px] font-semibold" :class="step === i + 1 ? 'text-green-800' : 'text-[var(--text-secondary)]'">{{ label }}</span>
        </button>
        <div class="my-3 h-px bg-sand-200" />
        <p class="m-0 px-1 text-xs text-[var(--text-faint)]">{{ propertyId ? 'Bien enregistré — étape' : 'Étape' }} {{ step }} / 5</p>
      </div>

      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6.5">
        <h2 class="mb-1 mt-0 font-display text-[22px] font-bold tracking-[-.02em]">{{ STEP_LABELS[step - 1] }}</h2>
        <p class="mb-5.5 mt-0 text-[13.5px] text-[var(--text-muted)]">{{ hint }}</p>

        <div v-if="step === 1" class="flex flex-col gap-3.5">
          <p v-if="step1Error" class="m-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] font-semibold text-danger-fg">{{ step1Error }}</p>
          <div>
            <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Nom du bien</p>
            <input v-model="name" placeholder="Résidence Étoile" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none">
          </div>
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Type de bâtiment</p>
              <select v-model="buildingType" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                <option v-for="t in propertyTypes" :key="t.code" :value="t.code">{{ t.label }}</option>
              </select>
            </div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Ville</p>
              <select v-model="cityId" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                <option v-for="c in cities" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Quartier (optionnel)</p>
              <select v-model="neighborhoodId" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                <option value="">—</option>
                <option v-for="n in neighborhoods" :key="n.id" :value="n.id">{{ n.name }}</option>
              </select>
            </div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Adresse (optionnel)</p>
              <input v-model="address" placeholder="Rue 12.45, Fidjrossè" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none">
            </div>
          </div>
          <div>
            <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Description (optionnel)</p>
            <textarea v-model="description" placeholder="Environnement, accès, points forts…" class="min-h-[84px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3.5 text-sm outline-none" />
          </div>
          <div>
            <p class="mb-2 mt-0 text-[12.5px] font-bold">Le bâtiment dispose de</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="c in PROPERTY_CHARACTERISTICS"
                :key="c.key"
                type="button"
                class="rounded-pill border px-3.5 py-2 text-[13px] font-semibold"
                :class="characteristics[c.key] ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                @click="characteristics = { ...characteristics, [c.key]: !characteristics[c.key] }"
              >{{ characteristics[c.key] ? '✓ ' : '' }}{{ c.label }}</button>
            </div>
          </div>
          <label class="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
            <div>
              <p class="m-0 text-sm font-bold">Afficher sur ma vitrine publique</p>
              <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">Votre page propriétaire liste ce bien. La recherche, elle, montre tout bien ayant un logement libre.</p>
            </div>
            <input v-model="onVitrine" type="checkbox" class="h-5 w-5 flex-none accent-[var(--color-green-600)]">
          </label>
        </div>

        <div v-else-if="step === 2">
          <label class="block cursor-pointer rounded-lg border-[1.5px] border-dashed border-[var(--border-default)] bg-[var(--surface-page)] p-7 text-center">
            <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" :disabled="uploading" @change="addPhoto">
            <p class="m-0 text-sm font-bold">{{ uploading ? 'Envoi en cours…' : 'Cliquez pour ajouter une photo' }}</p>
            <p class="mb-0 mt-1.5 text-[12.5px] text-[var(--text-muted)]">JPG, PNG ou WebP · les photos lourdes sont réduites automatiquement · une à la fois</p>
          </label>
          <p v-if="uploadError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ uploadError }}</p>
          <div v-if="photos.length" class="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div v-for="p in photos" :key="p.id" class="group relative h-[96px] overflow-hidden rounded-sm bg-cover bg-center" :style="{ backgroundImage: `url(${p.url})` }">
              <span v-if="p.is_primary" class="absolute left-1.5 top-1.5 rounded-pill bg-green-600 px-2 py-0.5 text-[9.5px] font-bold text-white">Principale</span>
              <div class="absolute inset-x-1.5 bottom-1.5 flex gap-1">
                <button v-if="!p.is_primary" type="button" class="flex-1 rounded-xs bg-white/90 px-1.5 py-1 text-[10.5px] font-bold" @click="changePhotos({ primaryId: p.id })">Principale</button>
                <button type="button" class="rounded-xs bg-white/90 px-2 py-1 text-[10.5px] font-bold text-danger-fg" :aria-label="'Retirer la photo'" @click="changePhotos({ removeId: p.id })">✕</button>
              </div>
            </div>
          </div>
          <p class="mb-0 mt-3 text-[12px] text-[var(--text-faint)]">{{ UPLOAD_HINT }}. Une annonce avec photos reçoit bien plus de demandes.</p>
        </div>

        <div v-else-if="step === 3" class="flex flex-col gap-4">
          <div>
            <p class="mb-2 mt-0 text-[12.5px] font-bold">Ce logement se loue</p>
            <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <button
                v-for="r in RENTAL_CHOICES"
                :key="r.key"
                type="button"
                class="rounded-md border p-3.5 text-left"
                :class="rentalChoice === r.key ? 'border-2 border-green-600 bg-green-50' : 'border-[var(--border-default)] bg-white'"
                @click="rentalChoice = r.key"
              >
                <p class="m-0 text-sm font-bold">{{ r.label }}</p>
                <p class="mb-0 mt-0.5 text-[12px] text-[var(--text-muted)]">{{ r.hint }}</p>
              </button>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div v-if="hasMonthly"><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Loyer mensuel (FCFA)</p><input v-model="monthlyPrice" inputmode="numeric" maxlength="9" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
            <div v-if="hasNightly"><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Prix par nuit (FCFA)</p><input v-model="nightlyPrice" inputmode="numeric" maxlength="9" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
            <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Nom du logement</p><input v-model="unitName" placeholder="Appartement A1" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Type</p>
              <select v-model="unitTypeId" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                <option v-for="t in unitTypes" :key="t.id" :value="t.id">{{ t.label }}</option>
              </select>
            </div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Ameublement</p>
              <select v-model="furnishedLevel" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                <option value="">—</option>
                <option v-for="o in furnishedOptions" :key="o.code" :value="o.code">{{ o.label }}</option>
              </select>
            </div>
            <div class="grid grid-cols-3 gap-2.5">
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">m²</p><input v-model="surface" inputmode="numeric" maxlength="5" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Chambres</p><input v-model="bedrooms" inputmode="numeric" maxlength="2" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Douches</p><input v-model="bathrooms" inputmode="numeric" maxlength="2" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 font-mono text-sm outline-none"></div>
            </div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Source d'eau</p>
              <select v-model="waterSource" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                <option value="">—</option>
                <option v-for="o in waterOptions" :key="o.code" :value="o.code">{{ o.label }}</option>
              </select>
            </div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Compteur</p>
              <select v-model="meterType" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                <option value="">—</option>
                <option v-for="o in meterOptions" :key="o.code" :value="o.code">{{ o.label }}</option>
              </select>
            </div>
          </div>
          <div v-if="featureOptions.length">
            <p class="mb-2 mt-0 text-[12.5px] font-bold">Équipements</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="f in featureOptions"
                :key="f.code"
                type="button"
                class="rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold"
                :class="features.includes(f.code) ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                @click="toggleFeature(f.code)"
              >{{ features.includes(f.code) ? '✓ ' : '' }}{{ f.label }}</button>
            </div>
          </div>
          <div>
            <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Description du logement (optionnel)</p>
            <textarea v-model="unitDescription" class="min-h-[70px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3.5 text-sm outline-none" />
          </div>
        </div>

        <div v-else-if="step === 4" class="flex flex-col gap-4">
          <div v-if="hasMonthly">
            <p class="mb-2 mt-0 text-[13px] font-bold">Location au mois</p>
            <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Caution (mois)</p><input v-model="cautionMonths" inputmode="numeric" maxlength="1" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Avance (mois)</p><input v-model="avanceMonths" inputmode="numeric" maxlength="1" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Frais de dossier (FCFA)</p><input v-model="fraisDossier" inputmode="numeric" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
            </div>
            <p class="mb-0 mt-2 text-[12px] text-[var(--text-faint)]">La loi 2022-30 plafonne la caution et l'avance à 3 mois de loyer chacune. La caution est séquestrée par Immo, jamais versée au propriétaire.</p>
          </div>
          <div v-if="hasNightly">
            <p class="mb-2 mt-0 text-[13px] font-bold">Séjours à la nuit</p>
            <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Retenue de garantie (%)</p><input v-model="bookingRetentionPercentage" inputmode="numeric" maxlength="3" placeholder="0" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <label class="flex h-[46px] cursor-pointer items-center gap-2.5 self-end rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3.5">
                <input v-model="requiresBookingInventory" type="checkbox" class="h-4 w-4 accent-[var(--color-green-600)]">
                <span class="text-[12.5px] font-semibold">Exiger un état des lieux à l'arrivée</span>
              </label>
            </div>
            <p class="mb-0 mt-2 text-[12px] text-[var(--text-faint)]">La retenue est gardée par Immo jusqu'au départ du voyageur, puis versée.</p>
          </div>
        </div>

        <div v-else class="flex flex-col gap-3.5">
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Disponible à partir du (optionnel)</p><input v-model="availableFrom" type="date" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
          <div class="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4 text-[13px] leading-[1.6] text-[var(--text-secondary)]">
            <p class="m-0 font-bold text-[var(--text-primary)]">{{ name || 'Votre bien' }} — {{ unitName || 'logement' }}</p>
            <p class="m-0">{{ summary || 'Prix à renseigner' }}<template v-if="photos.length"> · {{ photos.length }} photo{{ photos.length > 1 ? 's' : '' }}</template></p>
            <p class="mb-0 mt-2">Dès la mise en ligne, l'annonce apparaît dans la recherche (sous une minute) tant que le logement est libre. Passez-le en « Occupée » depuis la fiche pour la retirer.</p>
          </div>
          <p v-if="finalError" class="m-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] font-semibold text-danger-fg">{{ finalError }}</p>
          <div v-if="pricingWarning" class="rounded-md border border-warn-border bg-warn-bg px-3.5 py-3 text-[13px] text-warn-fg">
            <p class="m-0 font-semibold">{{ pricingWarning }}</p>
            <NuxtLink :to="{ path: '/pro/biens/fiche', query: { id: propertyId } }" class="mt-1.5 inline-block font-bold underline">Voir le bien</NuxtLink>
          </div>
        </div>

        <p v-if="currentStepError" class="mb-0 mt-4 rounded-md border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] font-semibold text-danger-fg">{{ currentStepError }}</p>

        <div class="mt-6 flex justify-between gap-3">
          <button type="button" class="rounded-md border border-[var(--border-default)] bg-white px-5.5 py-3.5 text-sm font-bold disabled:opacity-50" :disabled="step === 1" @click="prev">Précédent</button>
          <button
            type="button"
            class="rounded-md bg-[image:var(--action-primary)] px-6 py-3.5 text-sm font-bold text-white shadow-action disabled:opacity-60"
            :disabled="!refsReady || step1Loading || finalLoading || !!pricingWarning"
            @click="next"
          >{{ nextLabel }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
