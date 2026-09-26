<script setup lang="ts">
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
const showError = ref(false)

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
  showError.value = true
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
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="flex max-h-[90vh] w-[560px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] flex-col overflow-hidden rounded-2xl bg-[var(--surface-page)]" @click.stop>
        <template v-if="step === 'form'">
          <div class="border-b border-[var(--border-subtle)] px-6 py-4.5">
            <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">Publier une demande de logement</h3>
            <p class="mb-0 mt-1.5 text-[13px] leading-[1.55] text-[var(--text-muted)]">Les propriétaires parcourent les demandes par <strong>ville</strong> et par <strong>type de location</strong> : renseignez-les pour être trouvé.</p>
          </div>
          <div class="overflow-y-auto px-6 py-5">
            <p class="mb-2 mt-0 text-[12.5px] font-bold">Vous cherchez à louer</p>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="c in REQUEST_RENTAL_CHOICES"
                :key="c.value"
                type="button"
                class="rounded-md border px-3 py-2.5 text-[13px] font-bold"
                :class="frequency === c.value ? 'border-2 border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white'"
                @click="frequency = c.value"
              >{{ c.label }}</button>
            </div>

            <div class="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label class="text-[12.5px] font-bold">Ville
                <select v-model="cityId" class="mt-1.5 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] font-normal">
                  <option value="">Toutes</option>
                  <option v-for="c in cities" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </label>
              <label class="text-[12.5px] font-bold">Quartier
                <select v-model="neighborhoodId" :disabled="!cityId" class="mt-1.5 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] font-normal disabled:opacity-50">
                  <option value="">{{ cityId ? 'Peu importe' : 'Choisissez une ville' }}</option>
                  <option v-for="n in neighborhoods" :key="n.id" :value="n.id">{{ n.name }}</option>
                </select>
              </label>
              <label class="text-[12.5px] font-bold">Type de logement
                <select v-model="unitTypeId" class="mt-1.5 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] font-normal">
                  <option value="">Peu importe</option>
                  <option v-for="t in unitTypes" :key="t.id" :value="t.id">{{ t.label }}</option>
                </select>
              </label>
              <label class="text-[12.5px] font-bold">Ameublement
                <select v-model="furnished" class="mt-1.5 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] font-normal">
                  <option value="">Peu importe</option>
                  <option v-for="o in furnishedOptions" :key="o.code" :value="o.code">{{ o.label }}</option>
                </select>
              </label>
              <label class="text-[12.5px] font-bold">Budget min (FCFA{{ frequency === 'daily' ? ' / nuit' : frequency === 'monthly' ? ' / mois' : '' }})
                <input v-model="budgetMin" inputmode="numeric" class="mt-1.5 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 font-mono text-[13px] font-normal outline-none">
              </label>
              <label class="text-[12.5px] font-bold">Budget max (FCFA{{ frequency === 'daily' ? ' / nuit' : frequency === 'monthly' ? ' / mois' : '' }})
                <input v-model="budgetMax" inputmode="numeric" class="mt-1.5 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 font-mono text-[13px] font-normal outline-none">
              </label>
              <label class="text-[12.5px] font-bold">Emménagement souhaité
                <input v-model="moveInDate" type="date" :min="todayIso" class="mt-1.5 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13px] font-normal outline-none">
              </label>
              <label class="text-[12.5px] font-bold">Chambres minimum
                <input v-model="minBedrooms" inputmode="numeric" maxlength="2" class="mt-1.5 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 font-mono text-[13px] font-normal outline-none">
              </label>
            </div>

            <label class="mb-1.5 mt-3.5 flex items-baseline justify-between text-[12.5px] font-bold">Ce que vous cherchez<span class="font-normal text-[var(--text-faint)]">{{ description.trim().length }} / 2000</span></label>
            <textarea v-model="description" rows="3" maxlength="2000" placeholder="Ex. Chambre-salon meublée à Godomey, proche du goudron, disponible tout de suite." class="w-full resize-y rounded-md border border-[var(--border-default)] bg-white p-3.5 text-sm outline-none" />

            <p v-if="(showError && formError) || errorMessage" class="mb-0 mt-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage || formError }}</p>
          </div>
          <div class="flex gap-2.5 border-t border-[var(--border-subtle)] px-6 py-4">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Annuler</CoreButton>
            <CoreButton size="lg" full-width :disabled="loading" @click="submit">{{ loading ? 'Publication…' : 'Publier' }}</CoreButton>
          </div>
        </template>

        <div v-else class="px-6.5 py-6.5 text-center">
          <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
          <p class="mb-0 mt-4.5 text-lg font-bold">Demande publiée</p>
          <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">Les propriétaires peuvent maintenant vous proposer un logement. Vous serez notifié à chaque réponse, et chacune ouvre une conversation dans vos messages.</p>
          <CoreButton size="lg" full-width class="mt-5" @click="close">Voir mes demandes</CoreButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
