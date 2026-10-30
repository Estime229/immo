<script setup lang="ts">
import { Check } from '@lucide/vue'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { REQUEST_RENTAL_CHOICES, validateRequestForm } from '~/utils/housingRequest'

const emit = defineEmits<{ close: []; created: [] }>()

const housingRequestsApi = useHousingRequestsApi()
const refData = useReferenceData()

const step = ref<'form' | 'done'>('form')
const description = ref('')
const cityId = ref('')
const neighborhoodId = ref('')
const frequency = ref<string>('monthly')
const unitTypeId = ref('')
const furnished = ref('')
const budgetMin = ref('')
const budgetMax = ref('')
const moveInDate = ref('')
const minBedrooms = ref('')
const loading = ref(false)
const errorMessage = ref('')
/** Pas `showError` : nom d'un auto-import Nuxt. */
const showFormError = ref(false)

const cities = ref<{ id: string; name: string }[]>([])
const neighborhoods = ref<{ id: string; name: string }[]>([])
const unitTypes = ref<{ id: string; label: string }[]>([])
const furnishedOptions = ref<{ code: string; label: string }[]>([])
onMounted(async () => {
  try {
    const [c, ut, f] = await Promise.all([refData.fetchCities(), refData.fetchRef('UNIT_TYPE'), refData.fetchRef('FURNISHED_LEVEL')])
    cities.value = c
    unitTypes.value = ut.map(e => ({ id: e.id, label: e.labels.fr ?? e.code }))
    furnishedOptions.value = f.map(e => ({ code: e.code, label: e.labels.fr ?? e.code }))
  } catch {
    // les listes restent vides : ces critères sont optionnels
  }
})
watch(cityId, async id => {
  neighborhoodId.value = ''
  neighborhoods.value = id ? await refData.fetchNeighborhoods(id).catch(() => []) : []
})

const todayIso = new Date().toISOString().slice(0, 10)
const formError = computed(() => validateRequestForm({ description: description.value, budgetMin: budgetMin.value, budgetMax: budgetMax.value, moveInDate: moveInDate.value, minBedrooms: minBedrooms.value }, todayIso))
const num = (v: string) => (v.replace(/\s/g, '') ? Number(v.replace(/\s/g, '')) : undefined)

async function submit() {
  showFormError.value = true
  if (formError.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    await housingRequestsApi.create({
      description: description.value.trim(),
      city_id: cityId.value || undefined,
      neighborhood_id: neighborhoodId.value || undefined,
      desired_billing_frequency: frequency.value || undefined,
      unit_type_reference_id: unitTypeId.value || undefined,
      desired_furnished_level: furnished.value || undefined,
      budget_min: num(budgetMin.value),
      budget_max: num(budgetMax.value),
      move_in_date: moveInDate.value || undefined,
      min_bedrooms: num(minBedrooms.value)
    })
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La publication a échoué.') : 'La publication a échoué.'
  } finally {
    loading.value = false
  }
}

function close() {
  if (step.value === 'done') emit('created')
  emit('close')
}
</script>

<template>
  <CoreModal :open="true" :title="step === 'form' ? 'Publier une demande de logement' : 'Demande publiée'" width="560px" :dirty="step === 'form' && !!description.trim()" @close="close">
        <template v-if="step === 'form'">
          <div>
            <p class="mb-4 mt-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Les propriétaires parcourent les demandes par <strong>ville</strong> et par <strong>type de location</strong> : renseignez-les pour être trouvé.</p>
            <p class="mb-2 mt-0 text-[12.5px] font-bold">Vous cherchez à louer</p>
            <FormsSegmentedControl v-model="frequency" :options="[...REQUEST_RENTAL_CHOICES]" size="sm" />

            <div class="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <label class="text-[12.5px] font-bold">Ville
                <select v-model="cityId" class="mt-[7px] h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-[14px] font-normal">
                  <option value="">Toutes</option>
                  <option v-for="c in cities" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </label>
              <label class="text-[12.5px] font-bold">Quartier
                <select v-model="neighborhoodId" :disabled="!cityId" class="mt-[7px] h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-[14px] font-normal disabled:opacity-50">
                  <option value="">{{ cityId ? 'Peu importe' : 'Choisissez une ville' }}</option>
                  <option v-for="n in neighborhoods" :key="n.id" :value="n.id">{{ n.name }}</option>
                </select>
              </label>
              <label class="text-[12.5px] font-bold">Type de logement
                <select v-model="unitTypeId" class="mt-[7px] h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-[14px] font-normal">
                  <option value="">Peu importe</option>
                  <option v-for="t in unitTypes" :key="t.id" :value="t.id">{{ t.label }}</option>
                </select>
              </label>
              <label class="text-[12.5px] font-bold">Ameublement
                <select v-model="furnished" class="mt-[7px] h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-[14px] font-normal">
                  <option value="">Peu importe</option>
                  <option v-for="o in furnishedOptions" :key="o.code" :value="o.code">{{ o.label }}</option>
                </select>
              </label>
              <label class="text-[12.5px] font-bold">Budget min (FCFA{{ frequency === 'daily' ? ' / nuit' : frequency === 'monthly' ? ' / mois' : '' }})
                <input v-model="budgetMin" inputmode="numeric" class="mt-[7px] h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[15px] font-mono text-[14px] font-normal outline-none">
              </label>
              <label class="text-[12.5px] font-bold">Budget max (FCFA{{ frequency === 'daily' ? ' / nuit' : frequency === 'monthly' ? ' / mois' : '' }})
                <input v-model="budgetMax" inputmode="numeric" class="mt-[7px] h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[15px] font-mono text-[14px] font-normal outline-none">
              </label>
              <label class="text-[12.5px] font-bold">Emménagement souhaité
                <input v-model="moveInDate" type="date" :min="todayIso" class="mt-[7px] h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[15px] text-[14px] font-normal outline-none">
              </label>
              <label class="text-[12.5px] font-bold">Chambres minimum
                <input v-model="minBedrooms" inputmode="numeric" maxlength="2" class="mt-[7px] h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[15px] font-mono text-[14px] font-normal outline-none">
              </label>
            </div>

            <label class="mb-1.5 mt-3.5 flex items-baseline justify-between text-[12.5px] font-bold">Ce que vous cherchez<span class="font-normal text-[var(--text-faint)]">{{ description.trim().length }} / 2000</span></label>
            <textarea v-model="description" rows="3" maxlength="2000" placeholder="Ex. Chambre-salon meublée à Godomey, proche du goudron, disponible tout de suite." class="w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3 text-sm outline-none" />

            <p v-if="(showFormError && formError) || errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage || formError }}</p>
          </div>
        </template>

        <div v-else class="py-1 text-center">
          <div class="mx-auto grid h-14 w-14 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-white"><Check class="h-7 w-7" :stroke-width="2.4" /></div>
          <p class="mx-auto mb-0 mt-4 max-w-[340px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Les propriétaires peuvent maintenant vous proposer un logement. Chaque réponse ouvre une conversation dans vos messages.</p>
        </div>

    <template #footer>
      <div v-if="step === 'form'" class="flex gap-2.5">
        <CoreButton tone="secondary" full-width @click="close">Annuler</CoreButton>
        <CoreButton full-width :disabled="loading" @click="submit">{{ loading ? 'Publication…' : 'Publier' }}</CoreButton>
      </div>
      <CoreButton v-else full-width @click="close">Voir mes demandes</CoreButton>
    </template>
  </CoreModal>
</template>
