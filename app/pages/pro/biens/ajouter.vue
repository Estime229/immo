<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'pro' })

const propertiesApi = useLandlordPropertiesApi()
const refData = useReferenceData()

const STEP_LABELS = ['Le bien', 'Photos', 'Première unité', 'Conditions financières', 'Publication']
const STEP_TITLES = ['Le bien', 'Photos du bien', 'Première unité', 'Conditions financières', 'Publication']
const STEP_HINTS = [
  'Nom, type, ville et quartier.',
  'Téléversement des photos du bien (optionnel — peut être fait plus tard).',
  'Type, surface, chambres, loyer, eau et compteur.',
  'Frais de dossier, caution et avance — dans le respect de la loi.',
  'Visibilité publique, disponibilité et retenue de garantie.'
]

const step = ref(1)
const title = computed(() => STEP_TITLES[step.value - 1])
const hint = computed(() => STEP_HINTS[step.value - 1])

/* ---- Étape 1 : le bien (créé dès la validation de cette étape) ---- */
const name = ref('')
const buildingType = ref('')
const cityId = ref('')
const neighborhoodId = ref('')
const address = ref('')
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
onMounted(async () => {
  const [pt, c, ut, w, m] = await Promise.all([
    refData.fetchRef('PROPERTY_TYPE'), refData.fetchCities(), refData.fetchRef('UNIT_TYPE'), refData.fetchRef('WATER_SOURCE'), refData.fetchRef('METER_TYPE')
  ])
  propertyTypes.value = pt.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  cities.value = c
  unitTypes.value = ut.map(e => ({ id: e.id, label: e.labels.fr ?? e.code }))
  waterOptions.value = w.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  meterOptions.value = m.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  buildingType.value = propertyTypes.value[0]?.code ?? ''
  cityId.value = cities.value[0]?.id ?? ''
  unitTypeId.value = unitTypes.value[0]?.id ?? ''
  waterSource.value = waterOptions.value[0]?.code ?? ''
  meterType.value = meterOptions.value[0]?.code ?? ''
})
watch(cityId, async id => {
  neighborhoodId.value = ''
  neighborhoods.value = id ? await refData.fetchNeighborhoods(id) : []
})

async function submitStep1() {
  if (!name.value.trim() || !buildingType.value || !cityId.value) {
    step1Error.value = 'Le nom, le type de bâtiment et la ville sont obligatoires.'
    return
  }
  step1Loading.value = true
  step1Error.value = ''
  try {
    const created = await propertiesApi.create({
      name: name.value.trim(),
      building_type: buildingType.value,
      city_id: cityId.value,
      neighborhood_id: neighborhoodId.value || undefined,
      address: address.value.trim() || undefined
    })
    propertyId.value = created.id
    step.value = 2
  } catch (e) {
    step1Error.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La création a échoué.') : 'La création a échoué.'
  } finally {
    step1Loading.value = false
  }
}

/* ---- Étape 2 : photos (optionnel, envoyées au fil de l'eau) ---- */
const photos = ref<{ url: string }[]>([])
const uploading = ref(false)
const uploadError = ref('')
async function addPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !propertyId.value) return
  uploading.value = true
  uploadError.value = ''
  try {
    const uploaded = await propertiesApi.uploadImage(file)
    await propertiesApi.addMedia(propertyId.value, uploaded.url, { isPrimary: photos.value.length === 0 })
    photos.value.push({ url: uploaded.thumbnail_url || uploaded.url })
  } catch (e2) {
    uploadError.value = e2 instanceof ApiRequestError ? (e2.mapped.bannerMessage ?? "L'envoi a échoué.") : "L'envoi a échoué."
  } finally {
    uploading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

/* ---- Étapes 3-5 : première unité (un seul POST à la fin, ref_type_id/name/price sont les seuls champs requis côté API) ---- */
const unitName = ref('')
const unitTypeId = ref('')
const surface = ref('')
const bedrooms = ref('')
const price = ref('')
const waterSource = ref('')
const meterType = ref('')
const fraisDossier = ref('')
const cautionMonths = ref('2')
const avanceMonths = ref('1')
const cautionExceeds = computed(() => Number(cautionMonths.value) > 3)
const cautionAck = ref(false)
const isPubliclyListed = ref(true)
const availableFrom = ref('')
const requiresBookingInventory = ref(false)
const bookingRetentionPercentage = ref('')

const step3Valid = computed(() => !!(unitName.value.trim() && unitTypeId.value && price.value))
const finalBlocked = computed(() => !step3Valid.value || (cautionExceeds.value && !cautionAck.value))

const finalLoading = ref(false)
const finalError = ref('')
async function submitUnit() {
  if (finalBlocked.value || !propertyId.value) return
  finalLoading.value = true
  finalError.value = ''
  try {
    await propertiesApi.createUnit(propertyId.value, {
      ref_type_id: unitTypeId.value,
      name: unitName.value.trim(),
      price: Number(price.value),
      surface_m2: surface.value ? Number(surface.value) : undefined,
      bedrooms_count: bedrooms.value ? Number(bedrooms.value) : undefined,
      water_source: waterSource.value || undefined,
      meter_type: meterType.value || undefined,
      frais_dossier: fraisDossier.value ? Number(fraisDossier.value) : undefined,
      caution_months: cautionMonths.value ? Number(cautionMonths.value) : undefined,
      avance_months: avanceMonths.value ? Number(avanceMonths.value) : undefined,
      is_publicly_listed: isPubliclyListed.value,
      available_from: availableFrom.value || undefined,
      requires_booking_inventory: requiresBookingInventory.value,
      booking_retention_percentage: bookingRetentionPercentage.value ? Number(bookingRetentionPercentage.value) : undefined
    })
    await navigateTo({ path: '/pro/biens/fiche', query: { id: propertyId.value } })
  } catch (e) {
    finalError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "La création de l'unité a échoué.") : "La création de l'unité a échoué."
  } finally {
    finalLoading.value = false
  }
}

function next() {
  if (step.value === 1) { submitStep1(); return }
  if (step.value === 5) { submitUnit(); return }
  step.value = Math.min(5, step.value + 1)
}
function prev() {
  step.value = Math.max(1, step.value - 1)
}
const nextLabel = computed(() => {
  if (step.value === 1) return step1Loading.value ? 'Création…' : 'Créer le bien et continuer'
  if (step.value === 5) return finalLoading.value ? 'Publication…' : 'Publier le bien'
  return 'Étape suivante'
})
</script>

<template>
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
          :class="step > i + 1 ? 'bg-green-600 text-white' : step === i + 1 ? 'bg-green-600 text-white' : 'bg-sand-300 text-[var(--text-faint)]'"
        >{{ step > i + 1 ? '✓' : i + 1 }}</span>
        <span class="text-[13px] font-semibold" :class="step === i + 1 ? 'text-green-800' : 'text-[var(--text-secondary)]'">{{ label }}</span>
      </button>
      <div class="my-3 h-px bg-sand-200" />
      <p class="m-0 px-1 text-xs text-[var(--text-faint)]">{{ propertyId ? 'Bien créé — étape' : 'Étape' }} {{ step }} / 5</p>
    </div>

    <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6.5">
      <h2 class="mb-1 mt-0 font-display text-[22px] font-bold tracking-[-.02em]">{{ title }}</h2>
      <p class="mb-5.5 mt-0 text-[13.5px] text-[var(--text-muted)]">{{ hint }}</p>

      <div v-if="step === 1" class="flex flex-col gap-3.5">
        <p v-if="step1Error" class="m-0 text-[13px] font-semibold text-danger-fg">{{ step1Error }}</p>
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

      <div v-else-if="step === 2">
        <label class="block cursor-pointer rounded-lg border-[1.5px] border-dashed border-[var(--border-default)] bg-[var(--surface-page)] p-7 text-center">
          <input type="file" accept="image/*" class="hidden" :disabled="uploading" @change="addPhoto">
          <p class="m-0 text-sm font-bold">{{ uploading ? 'Envoi en cours…' : 'Cliquez pour choisir une photo' }}</p>
          <p class="mb-0 mt-1.5 text-[12.5px] text-[var(--text-muted)]">JPEG ou PNG · une à la fois · optionnel, peut être fait plus tard</p>
        </label>
        <p v-if="uploadError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ uploadError }}</p>
        <div v-if="photos.length" class="mt-3.5 grid grid-cols-4 gap-2.5">
          <div v-for="(p, i) in photos" :key="p.url" class="relative h-[84px] rounded-sm bg-cover bg-center" :style="{ backgroundImage: `url(${p.url})` }">
            <span v-if="i === 0" class="absolute left-1.5 top-1.5 rounded-pill bg-green-600 px-2 py-0.5 text-[9.5px] font-bold text-white">Principale</span>
          </div>
        </div>
      </div>

      <div v-else-if="step === 3">
        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Nom de l'unité</p><input v-model="unitName" placeholder="Unité A1" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
          <div>
            <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Type</p>
            <select v-model="unitTypeId" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
              <option v-for="t in unitTypes" :key="t.id" :value="t.id">{{ t.label }}</option>
            </select>
          </div>
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Surface (m²)</p><input v-model="surface" inputmode="numeric" maxlength="5" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Chambres</p><input v-model="bedrooms" inputmode="numeric" maxlength="2" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Loyer mensuel</p><input v-model="price" inputmode="numeric" maxlength="9" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
          <div>
            <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Source d'eau</p>
            <select v-model="waterSource" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
              <option v-for="o in waterOptions" :key="o.code" :value="o.code">{{ o.label }}</option>
            </select>
          </div>
          <div>
            <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Compteur</p>
            <select v-model="meterType" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
              <option v-for="o in meterOptions" :key="o.code" :value="o.code">{{ o.label }}</option>
            </select>
          </div>
        </div>
      </div>

      <div v-else-if="step === 4">
        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Frais de dossier</p><input v-model="fraisDossier" inputmode="numeric" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
          <div>
            <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Caution (mois)</p>
            <input v-model="cautionMonths" class="h-[46px] w-full rounded-md border-[1.5px] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none" :class="cautionExceeds ? 'border-warn-border' : 'border-[var(--border-default)]'">
          </div>
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Avance (mois)</p><input v-model="avanceMonths" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
        </div>
        <div v-if="cautionExceeds" class="mt-4 rounded-md border border-warn-border bg-warn-bg p-4">
          <p class="m-0 text-[13.5px] font-bold text-warn-fg-deep">Caution supérieure au plafond légal</p>
          <p class="mb-3 mt-1.5 text-[13px] leading-[1.55] text-clay-900">La Loi 2022-30 plafonne la caution à 3 mois de loyer hors charges. Vous demandez {{ cautionMonths }} mois. Une caution supérieure exige l'accord explicite des deux parties.</p>
          <label class="flex cursor-pointer items-center gap-2.5" @click="cautionAck = !cautionAck">
            <span class="grid h-5 w-5 flex-none place-items-center rounded-xs border-2 text-xs text-white" :class="cautionAck ? 'border-green-600 bg-green-600' : 'border-[var(--border-default)] bg-white'">{{ cautionAck ? '✓' : '' }}</span>
            <span class="text-[13px] font-semibold">Je confirme cet accord dérogatoire des deux parties</span>
          </label>
        </div>
      </div>

      <div v-else class="flex flex-col gap-3.5">
        <p v-if="finalError" class="m-0 text-[13px] font-semibold text-danger-fg">{{ finalError }}</p>
        <label class="flex items-center justify-between gap-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
          <div><p class="m-0 text-sm font-bold">Visible publiquement</p><p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">L'unité apparaît dans la recherche</p></div>
          <button type="button" class="block h-[27px] w-[46px] flex-none rounded-pill p-[3px]" :class="isPubliclyListed ? 'bg-green-600' : 'bg-sand-300'" @click="isPubliclyListed = !isPubliclyListed">
            <span class="block h-[21px] w-[21px] rounded-pill bg-white transition-transform" :class="isPubliclyListed ? 'translate-x-[19px]' : 'translate-x-0'" />
          </button>
        </label>
        <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Disponible à partir du (optionnel)</p><input v-model="availableFrom" type="date" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Retenue de garantie (courte durée, %)</p><input v-model="bookingRetentionPercentage" inputmode="numeric" placeholder="0" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
          <label class="flex h-[46px] cursor-pointer items-center gap-2.5 self-end rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3.5" @click="requiresBookingInventory = !requiresBookingInventory">
            <span class="grid h-5 w-5 flex-none place-items-center rounded-xs text-xs text-white" :class="requiresBookingInventory ? 'bg-green-600' : 'border-2 border-[var(--border-default)] bg-white'">{{ requiresBookingInventory ? '✓' : '' }}</span>
            <span class="text-[12.5px] font-semibold">Exiger un état des lieux à l'arrivée</span>
          </label>
        </div>
      </div>

      <div class="mt-6 flex justify-between">
        <button type="button" class="rounded-md border border-[var(--border-default)] bg-white px-5.5 py-3.5 text-sm font-bold" :disabled="step === 1" @click="prev">Précédent</button>
        <button
          type="button"
          class="rounded-md bg-[image:var(--action-primary)] px-6 py-3.5 text-sm font-bold text-white shadow-action"
          :disabled="step1Loading || finalLoading || (step === 5 && finalBlocked)"
          @click="next"
        >{{ nextLabel }}</button>
      </div>
    </div>
  </div>
</template>
