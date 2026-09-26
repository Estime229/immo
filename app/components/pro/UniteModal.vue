<script setup lang="ts">
import type { UnitSearchResult } from '~/types/property'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { RENTAL_CHOICES, rentalChoiceOf, rentalSetup, validateMonths, validateRentalPrices, type RentalChoice } from '~/utils/propertyForm'

const props = defineProps<{ propertyId: string; propertyName: string; unit?: UnitSearchResult }>()
const emit = defineEmits<{ close: []; created: []; updated: [] }>()

const isEdit = computed(() => !!props.unit)

const propertiesApi = useLandlordPropertiesApi()
const pricingApi = useUnitPricingApi()
const refData = useReferenceData()

const step = ref<'form' | 'done'>('form')
const name = ref('')
const unitTypeId = ref('')
const surface = ref('')
const bedrooms = ref('')
const bathrooms = ref('')
const floor = ref('')
const price = ref('')
const nightlyPrice = ref('')
const rentalChoice = ref<RentalChoice>('mois')
const waterSource = ref('')
const meterType = ref('')
const toiletType = ref('')
const furnishedLevel = ref('')
const unitStatus = ref<'available' | 'occupied' | 'notice_given' | 'maintenance' | 'coming_soon'>('available')
const availableFrom = ref('')
const fraisDossier = ref('')
const cautionMonths = ref('')
const avanceMonths = ref('')
const description = ref('')
const features = ref<string[]>([])
/** En édition, `null` tant qu'on n'a pas pu relire les équipements existants — on ne les renvoie alors pas (sinon on les effacerait). */
const loadedFeatures = ref<string[] | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const pricingNote = ref('')

const unitTypes = ref<{ id: string; label: string }[]>([])
const waterOptions = ref<{ code: string; label: string }[]>([])
const meterOptions = ref<{ code: string; label: string }[]>([])
const toiletOptions = ref<{ code: string; label: string }[]>([])
const furnishedOptions = ref<{ code: string; label: string }[]>([])
const featureOptions = ref<{ code: string; label: string }[]>([])
/** Tant que les référentiels chargent, le type n'est pas encore choisi : un clic trop rapide échouait en silence (message effacé dès la fin du chargement). */
const refsReady = ref(false)

function resetFromUnit() {
  const u = props.unit
  name.value = u?.name ?? ''
  unitTypeId.value = u?.ref_type_id ?? unitTypes.value[0]?.id ?? ''
  surface.value = u?.surface_m2 ? String(u.surface_m2) : ''
  bedrooms.value = u?.bedrooms_count ? String(u.bedrooms_count) : ''
  bathrooms.value = u?.bathrooms_count ? String(u.bathrooms_count) : ''
  floor.value = u?.floor != null ? String(u.floor) : ''
  price.value = u ? String(Math.round(Number(u.price))) : ''
  waterSource.value = u?.water_source ?? ''
  meterType.value = u?.meter_type ?? ''
  toiletType.value = u?.toilet_type ?? ''
  furnishedLevel.value = u?.furnished_level ?? ''
  unitStatus.value = (u?.unit_status as typeof unitStatus.value) ?? 'available'
  availableFrom.value = u?.available_from ? u.available_from.slice(0, 10) : ''
  fraisDossier.value = u?.frais_dossier ? String(Math.round(Number(u.frais_dossier))) : ''
  cautionMonths.value = u?.caution_months != null ? String(u.caution_months) : ''
  avanceMonths.value = u?.avance_months != null ? String(u.avance_months) : ''
  description.value = u?.description?.fr ?? ''
}

/**
 * Appelé de suite (pas seulement après le chargement des référentiels) —
 * sinon une saisie rapide pendant ce chargement était écrasée par le
 * pré-remplissage arrivant après coup (bug réel constaté en direct).
 */
resetFromUnit()
onMounted(async () => {
  const [ut, w, m, t, f, feat] = await Promise.all([
    refData.fetchRef('UNIT_TYPE'), refData.fetchRef('WATER_SOURCE'), refData.fetchRef('METER_TYPE'), refData.fetchRef('TOILET_TYPE'), refData.fetchRef('FURNISHED_LEVEL'), refData.fetchRef('FEATURE')
  ])
  unitTypes.value = ut.map(e => ({ id: e.id, label: e.labels.fr ?? e.code }))
  waterOptions.value = w.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  meterOptions.value = m.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  toiletOptions.value = t.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  furnishedOptions.value = f.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  featureOptions.value = feat.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  if (!unitTypeId.value) unitTypeId.value = props.unit?.ref_type_id ?? unitTypes.value[0]?.id ?? ''
  refsReady.value = true
  if (props.unit) await loadEditExtras(props.unit)
})
watch(() => props.unit, resetFromUnit)

/** Mode de location (lu sur la grille tarifaire) et équipements (lus sur `owner/me`, absents de la fiche publique). */
const currentPricing = ref<{ billing_frequency: string; is_available: boolean }[]>([])
async function loadEditExtras(u: UnitSearchResult) {
  try {
    currentPricing.value = await pricingApi.fetchPricing(u.id)
  } catch {
    currentPricing.value = []
  }
  rentalChoice.value = rentalChoiceOf(currentPricing.value, (u.characteristics?.billing_type as string | undefined) ?? null)
  try {
    const mine = await propertiesApi.fetchMine({ limit: 100 })
    const found = mine.data.flatMap(p => ('units' in p ? p.units : [])).find(x => x.id === u.id)
    loadedFeatures.value = found?.resolved_features?.map(f => f.code) ?? []
    features.value = [...loadedFeatures.value]
  } catch {
    loadedFeatures.value = null
  }
}

function toggleFeature(code: string) {
  features.value = features.value.includes(code) ? features.value.filter(c => c !== code) : [...features.value, code]
}

const STATUS_OPTIONS = [
  { code: 'available' as const, label: 'Libre' },
  { code: 'occupied' as const, label: 'Occupée' },
  { code: 'notice_given' as const, label: 'Préavis en cours' },
  { code: 'maintenance' as const, label: 'En maintenance' },
  { code: 'coming_soon' as const, label: 'Bientôt disponible' }
]
const hasMonthly = computed(() => rentalChoice.value !== 'nuit')
const hasNightly = computed(() => !isEdit.value && rentalChoice.value !== 'mois')
const priceLabel = computed(() => {
  if (isEdit.value) return rentalChoice.value === 'nuit' ? 'Prix par nuit (base)' : 'Loyer mensuel'
  return 'Loyer mensuel (FCFA)'
})

const formError = computed(() => {
  if (!name.value.trim() || !unitTypeId.value) return 'Renseignez le nom et le type du logement.'
  if (isEdit.value) {
    if (!(Number(price.value) > 0)) return 'Renseignez le prix.'
  } else {
    const e = validateRentalPrices(rentalChoice.value, price.value, nightlyPrice.value)
    if (e) return e
  }
  if (unitStatus.value === 'notice_given' && !availableFrom.value) return 'Indiquez la date de libération du logement (préavis en cours).'
  if (hasMonthly.value) return validateMonths('Caution', cautionMonths.value) ?? validateMonths('Avance', avanceMonths.value)
  return null
})
const showFormError = ref(false)

async function submit() {
  showFormError.value = true
  if (formError.value) return
  loading.value = true
  errorMessage.value = ''
  const base = {
    ref_type_id: unitTypeId.value,
    name: name.value.trim(),
    surface_m2: surface.value ? Number(surface.value) : undefined,
    bedrooms_count: bedrooms.value ? Number(bedrooms.value) : undefined,
    bathrooms_count: bathrooms.value ? Number(bathrooms.value) : undefined,
    floor: floor.value ? Number(floor.value) : undefined,
    water_source: waterSource.value || undefined,
    meter_type: meterType.value || undefined,
    toilet_type: toiletType.value || undefined,
    furnished_level: furnishedLevel.value || undefined,
    unit_status: unitStatus.value,
    available_from: availableFrom.value || undefined,
    description: description.value.trim() ? { fr: description.value.trim() } : undefined,
    frais_dossier: hasMonthly.value && fraisDossier.value ? Number(fraisDossier.value) : undefined,
    caution_months: hasMonthly.value && cautionMonths.value ? Number(cautionMonths.value) : undefined,
    avance_months: hasMonthly.value && avanceMonths.value ? Number(avanceMonths.value) : undefined
  }
  try {
    if (isEdit.value && props.unit) {
      await propertiesApi.updateUnit(props.propertyId, props.unit.id, {
        ...base,
        price: Number(price.value),
        ...(loadedFeatures.value !== null ? { features: features.value } : {})
      })
    } else {
      const setup = rentalSetup(rentalChoice.value, Number(price.value) || null, Number(nightlyPrice.value) || null)
      const created = await propertiesApi.createUnit(props.propertyId, {
        ...base,
        price: setup.price,
        min_duration_days: setup.min_duration_days,
        characteristics: setup.characteristics,
        features: features.value.length ? features.value : undefined
      })
      const failed: string[] = []
      for (const row of setup.pricing) {
        try {
          await pricingApi.createPricing(created.id, row)
        } catch {
          failed.push(row.billing_frequency === 'daily' ? 'à la nuit' : 'au mois')
        }
      }
      if (failed.length) pricingNote.value = `Le tarif ${failed.join(' et ')} n'a pas pu être enregistré : ajoutez-le depuis « Tarifs et disponibilités ».`
    }
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'enregistrement a échoué.") : "L'enregistrement a échoué."
  } finally {
    loading.value = false
  }
}

function close() {
  if (step.value === 'done') emit(isEdit.value ? 'updated' : 'created')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="flex max-h-[90vh] w-[600px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4.5">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">{{ step === 'done' ? (isEdit ? 'Logement mis à jour' : 'Logement ajouté') : (isEdit ? 'Modifier le logement' : 'Ajouter un logement') }}</h3>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" aria-label="Fermer" @click="close">✕</button>
        </div>

        <div class="overflow-y-auto p-6">
          <template v-if="step === 'form'">
            <p class="mb-4 mt-0 text-[13px] text-[var(--text-muted)]">{{ isEdit ? propertyName : `Nouveau logement dans ${propertyName}.` }}</p>

            <div v-if="!isEdit" class="mb-4">
              <p class="mb-2 mt-0 text-[12.5px] font-bold">Ce logement se loue</p>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="r in RENTAL_CHOICES"
                  :key="r.key"
                  type="button"
                  class="rounded-md border px-3 py-2.5 text-left"
                  :class="rentalChoice === r.key ? 'border-2 border-green-600 bg-green-50' : 'border-[var(--border-default)] bg-white'"
                  @click="rentalChoice = r.key"
                >
                  <p class="m-0 text-[13px] font-bold">{{ r.label }}</p>
                </button>
              </div>
            </div>
            <p v-else class="mb-4 mt-0 rounded-md bg-sand-100 px-3.5 py-2.5 text-[12.5px] text-[var(--text-secondary)]">
              Location <strong>{{ RENTAL_CHOICES.find(r => r.key === rentalChoice)?.label.toLowerCase() }}</strong> (d'après vos tarifs).
              <NuxtLink to="/pro/tarifs" class="font-bold text-green-700">Changer les tarifs →</NuxtLink>
            </p>

            <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div v-if="isEdit || hasMonthly"><p class="mb-1.5 mt-0 text-[12.5px] font-bold">{{ priceLabel }}</p><input v-model="price" inputmode="numeric" maxlength="9" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div v-if="hasNightly"><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Prix par nuit (FCFA)</p><input v-model="nightlyPrice" inputmode="numeric" maxlength="9" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Nom du logement</p><input v-model="name" placeholder="Appartement C1" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
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
              <div class="grid grid-cols-4 gap-2">
                <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">m²</p><input v-model="surface" inputmode="numeric" maxlength="5" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 font-mono text-sm outline-none"></div>
                <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Ch.</p><input v-model="bedrooms" inputmode="numeric" maxlength="2" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 font-mono text-sm outline-none"></div>
                <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Douch.</p><input v-model="bathrooms" inputmode="numeric" maxlength="2" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 font-mono text-sm outline-none"></div>
                <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Étage</p><input v-model="floor" inputmode="numeric" maxlength="2" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 font-mono text-sm outline-none"></div>
              </div>
              <div>
                <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Statut</p>
                <select v-model="unitStatus" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                  <option v-for="s in STATUS_OPTIONS" :key="s.code" :value="s.code">{{ s.label }}</option>
                </select>
              </div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Disponible à partir du</p><input v-model="availableFrom" type="date" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
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
              <div>
                <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Toilettes</p>
                <select v-model="toiletType" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                  <option value="">—</option>
                  <option v-for="o in toiletOptions" :key="o.code" :value="o.code">{{ o.label }}</option>
                </select>
              </div>
            </div>
            <p class="mb-0 mt-1.5 text-[12px] text-[var(--text-faint)]">Un logement « Occupé » disparaît de la recherche ; « En maintenance » et « Bientôt disponible » y restent visibles.</p>

            <div v-if="featureOptions.length" class="mt-4">
              <p class="mb-2 mt-0 text-[12.5px] font-bold">Équipements</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="f in featureOptions"
                  :key="f.code"
                  type="button"
                  class="rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
                  :class="features.includes(f.code) ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                  :disabled="isEdit && loadedFeatures === null"
                  @click="toggleFeature(f.code)"
                >{{ features.includes(f.code) ? '✓ ' : '' }}{{ f.label }}</button>
              </div>
            </div>

            <div class="mt-4">
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Description (optionnel)</p>
              <textarea v-model="description" class="min-h-[64px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3 text-sm outline-none" />
            </div>

            <div v-if="hasMonthly" class="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Caution (mois)</p><input v-model="cautionMonths" inputmode="numeric" maxlength="1" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Avance (mois)</p><input v-model="avanceMonths" inputmode="numeric" maxlength="1" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Frais de dossier</p><input v-model="fraisDossier" inputmode="numeric" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
            </div>
            <p v-if="hasMonthly" class="mb-0 mt-1.5 text-[12px] text-[var(--text-faint)]">Loi 2022-30 : caution et avance plafonnées à 3 mois chacune.</p>

            <p v-if="(showFormError && formError) || errorMessage" class="mb-0 mt-3.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage || formError }}</p>
            <CoreButton size="lg" full-width class="mt-5" :disabled="loading || !refsReady" @click="submit">{{ !refsReady ? 'Chargement…' : loading ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Ajouter le logement' }}</CoreButton>
          </template>
          <template v-else>
            <div class="px-0.5 py-1 text-center">
              <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
              <p class="mb-0 mt-4.5 text-lg font-bold">{{ isEdit ? 'Logement mis à jour' : 'Logement ajouté' }}</p>
              <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">{{ name }} {{ isEdit ? 'a été mis à jour' : `est en ligne dans ${propertyName}` }}.</p>
              <p v-if="pricingNote" class="mx-auto mb-0 mt-2.5 max-w-[360px] rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">{{ pricingNote }}</p>
              <CoreButton size="lg" full-width class="mt-5.5" @click="close">Terminé</CoreButton>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
