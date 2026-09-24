<script setup lang="ts">
import type { UnitSearchResult } from '~/types/property'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const props = defineProps<{ propertyId: string; propertyName: string; unit?: UnitSearchResult }>()
const emit = defineEmits<{ close: []; created: []; updated: [] }>()

const isEdit = computed(() => !!props.unit)

const propertiesApi = useLandlordPropertiesApi()
const refData = useReferenceData()

const step = ref<'form' | 'done'>('form')
const name = ref('')
const unitTypeId = ref('')
const surface = ref('')
const bedrooms = ref('')
const bathrooms = ref('')
const floor = ref('')
const price = ref('')
const waterSource = ref('')
const meterType = ref('')
const toiletType = ref('')
const furnishedLevel = ref('')
const unitStatus = ref<'available' | 'occupied' | 'notice_given' | 'maintenance' | 'coming_soon'>('available')
const fraisDossier = ref('')
const cautionMonths = ref('')
const avanceMonths = ref('')
const isPubliclyListed = ref(true)
const loading = ref(false)
const errorMessage = ref('')

const cautionExceeds = computed(() => Number(cautionMonths.value) > 3)
const cautionAck = ref(false)

const unitTypes = ref<{ id: string; label: string }[]>([])
const waterOptions = ref<{ code: string; label: string }[]>([])
const meterOptions = ref<{ code: string; label: string }[]>([])
const toiletOptions = ref<{ code: string; label: string }[]>([])
const furnishedOptions = ref<{ code: string; label: string }[]>([])

function resetFromUnit() {
  const u = props.unit
  name.value = u?.name ?? ''
  unitTypeId.value = u?.ref_type_id ?? unitTypes.value[0]?.id ?? ''
  surface.value = u?.surface_m2 ? String(u.surface_m2) : ''
  bedrooms.value = u?.bedrooms_count ? String(u.bedrooms_count) : ''
  bathrooms.value = u?.bathrooms_count ? String(u.bathrooms_count) : ''
  floor.value = u?.floor != null ? String(u.floor) : ''
  price.value = u ? String(Math.round(Number(u.price))) : ''
  waterSource.value = u?.water_source ?? waterOptions.value[0]?.code ?? ''
  meterType.value = u?.meter_type ?? meterOptions.value[0]?.code ?? ''
  toiletType.value = u?.toilet_type ?? ''
  furnishedLevel.value = u?.furnished_level ?? ''
  unitStatus.value = (u?.unit_status as typeof unitStatus.value) ?? 'available'
  fraisDossier.value = u?.frais_dossier ? String(u.frais_dossier) : ''
  cautionMonths.value = u?.caution_months != null ? String(u.caution_months) : ''
  avanceMonths.value = u?.avance_months != null ? String(u.avance_months) : ''
  isPubliclyListed.value = u?.is_publicly_listed ?? true
  cautionAck.value = false
}

/**
 * Appelé de suite (pas seulement après le chargement des référentiels ci-
 * dessous) — sinon une saisie assez rapide pendant ce chargement se faisait
 * silencieusement écraser par ce pré-remplissage arrivant après coup (bug
 * réel constaté en direct : `bedrooms` tapé avant la fin du chargement était
 * perdu, le formulaire renvoyait alors l'ancienne valeur du serveur).
 */
resetFromUnit()
onMounted(async () => {
  const [ut, w, m, t, f] = await Promise.all([
    refData.fetchRef('UNIT_TYPE'), refData.fetchRef('WATER_SOURCE'), refData.fetchRef('METER_TYPE'), refData.fetchRef('TOILET_TYPE'), refData.fetchRef('FURNISHED_LEVEL')
  ])
  unitTypes.value = ut.map(e => ({ id: e.id, label: e.labels.fr ?? e.code }))
  waterOptions.value = w.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  meterOptions.value = m.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  toiletOptions.value = t.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  furnishedOptions.value = f.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  // Les champs déjà saisis par l'utilisateur ne doivent pas être écrasés une
  // fois les référentiels chargés — seuls les champs encore à leur valeur
  // par défaut (vide, ou le premier choix faute d'unité à éditer) sont
  // recalés sur les nouvelles options désormais disponibles.
  if (!unitTypeId.value) unitTypeId.value = props.unit?.ref_type_id ?? unitTypes.value[0]?.id ?? ''
  if (!waterSource.value) waterSource.value = props.unit?.water_source ?? waterOptions.value[0]?.code ?? ''
  if (!meterType.value) meterType.value = props.unit?.meter_type ?? meterOptions.value[0]?.code ?? ''
})
watch(() => props.unit, resetFromUnit)

const STATUS_OPTIONS = [
  { code: 'available' as const, label: 'Libre' },
  { code: 'occupied' as const, label: 'Occupée' },
  { code: 'notice_given' as const, label: 'Préavis en cours' },
  { code: 'maintenance' as const, label: 'En maintenance' },
  { code: 'coming_soon' as const, label: 'Bientôt disponible' }
]

const canSubmit = computed(() => !!(name.value.trim() && unitTypeId.value && price.value))
const blocked = computed(() => !canSubmit.value || (cautionExceeds.value && !cautionAck.value))

async function submit() {
  if (blocked.value) return
  loading.value = true
  errorMessage.value = ''
  const payload = {
    ref_type_id: unitTypeId.value,
    name: name.value.trim(),
    price: Number(price.value),
    surface_m2: surface.value ? Number(surface.value) : undefined,
    bedrooms_count: bedrooms.value ? Number(bedrooms.value) : undefined,
    bathrooms_count: bathrooms.value ? Number(bathrooms.value) : undefined,
    floor: floor.value ? Number(floor.value) : undefined,
    water_source: waterSource.value || undefined,
    meter_type: meterType.value || undefined,
    toilet_type: toiletType.value || undefined,
    furnished_level: furnishedLevel.value || undefined,
    unit_status: unitStatus.value,
    frais_dossier: fraisDossier.value ? Number(fraisDossier.value) : undefined,
    caution_months: cautionMonths.value ? Number(cautionMonths.value) : undefined,
    avance_months: avanceMonths.value ? Number(avanceMonths.value) : undefined,
    is_publicly_listed: isPubliclyListed.value
  }
  try {
    if (isEdit.value && props.unit) {
      await propertiesApi.updateUnit(props.propertyId, props.unit.id, payload)
    } else {
      await propertiesApi.createUnit(props.propertyId, payload)
    }
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'enregistrement a échoué.") : "L'enregistrement a échoué."
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
      <div class="flex max-h-[90vh] w-[560px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4.5">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">{{ step === 'done' ? (isEdit ? 'Unité mise à jour' : 'Unité ajoutée') : (isEdit ? 'Modifier l\'unité' : 'Ajouter une unité') }}</h3>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" @click="close">✕</button>
        </div>

        <div class="overflow-y-auto p-6">
          <template v-if="step === 'form'">
            <p class="mb-4 mt-0 text-[13px] text-[var(--text-muted)]">{{ isEdit ? propertyName : `Nouvelle unité dans ${propertyName}.` }}</p>
            <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Nom de l'unité</p><input v-model="name" placeholder="Unité C1" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
              <div>
                <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Type</p>
                <select v-model="unitTypeId" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                  <option v-for="t in unitTypes" :key="t.id" :value="t.id">{{ t.label }}</option>
                </select>
              </div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Surface (m²)</p><input v-model="surface" inputmode="numeric" maxlength="5" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Loyer mensuel</p><input v-model="price" inputmode="numeric" maxlength="9" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Chambres</p><input v-model="bedrooms" inputmode="numeric" maxlength="2" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Salles de bain</p><input v-model="bathrooms" inputmode="numeric" maxlength="2" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Étage</p><input v-model="floor" inputmode="numeric" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div>
                <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Statut</p>
                <select v-model="unitStatus" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                  <option v-for="s in STATUS_OPTIONS" :key="s.code" :value="s.code">{{ s.label }}</option>
                </select>
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
              <div>
                <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Toilettes</p>
                <select v-model="toiletType" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                  <option value="">—</option>
                  <option v-for="o in toiletOptions" :key="o.code" :value="o.code">{{ o.label }}</option>
                </select>
              </div>
              <div>
                <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Ameublement</p>
                <select v-model="furnishedLevel" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
                  <option value="">—</option>
                  <option v-for="o in furnishedOptions" :key="o.code" :value="o.code">{{ o.label }}</option>
                </select>
              </div>
            </div>

            <div class="mt-4.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Frais de dossier</p><input v-model="fraisDossier" inputmode="numeric" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Caution (mois)</p><input v-model="cautionMonths" inputmode="numeric" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Avance (mois)</p><input v-model="avanceMonths" inputmode="numeric" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
            </div>

            <div v-if="cautionExceeds" class="mt-3.5 rounded-md border border-warn-border bg-warn-bg p-3.5">
              <label class="flex items-start gap-2.5 text-[12.5px] leading-[1.5] text-warn-fg">
                <input v-model="cautionAck" type="checkbox" class="mt-0.5 h-4 w-4 flex-none">
                La loi 2022-30 plafonne la caution à 3 mois de loyer. Je confirme vouloir dépasser ce plafond en connaissance de cause.
              </label>
            </div>

            <label class="mt-4.5 flex items-center gap-2.5 text-[13px] text-[var(--text-secondary)]">
              <input v-model="isPubliclyListed" type="checkbox" class="h-4 w-4">
              Publiquement visible dans les résultats de recherche
            </label>

            <p v-if="errorMessage" class="mb-0 mt-3.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
            <CoreButton size="lg" full-width class="mt-5.5" :disabled="blocked || loading" @click="submit">{{ loading ? 'Enregistrement…' : isEdit ? 'Enregistrer' : "Ajouter l'unité" }}</CoreButton>
          </template>
          <template v-else>
            <div class="px-0.5 py-1 text-center">
              <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
              <p class="mb-0 mt-4.5 text-lg font-bold">{{ isEdit ? 'Unité mise à jour' : 'Unité ajoutée' }}</p>
              <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">{{ name }} {{ isEdit ? 'a été mise à jour' : `est créée dans ${propertyName}` }}.</p>
              <CoreButton size="lg" full-width class="mt-5.5" @click="close">Terminé</CoreButton>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
