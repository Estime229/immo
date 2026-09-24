<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const emit = defineEmits<{ close: []; created: [] }>()

const housingRequestsApi = useHousingRequestsApi()

const step = ref<'form' | 'done'>('form')
const description = ref('')
const budgetMin = ref('')
const budgetMax = ref('')
const moveInDate = ref('')
const minBedrooms = ref('')
const loading = ref(false)
const errorMessage = ref('')

const canSubmit = computed(() => description.value.trim().length > 0)

async function submit() {
  if (!canSubmit.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    await housingRequestsApi.create({
      description: description.value.trim(),
      budget_min: budgetMin.value ? Number(budgetMin.value) : undefined,
      budget_max: budgetMax.value ? Number(budgetMax.value) : undefined,
      move_in_date: moveInDate.value || undefined,
      min_bedrooms: minBedrooms.value ? Number(minBedrooms.value) : undefined
    })
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La publication a échoué.') : 'La publication a échoué.'
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
      <div class="w-[480px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
        <template v-if="step === 'form'">
          <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">Publier une demande de logement</h3>
          <p class="mb-0 mt-2 text-[13px] leading-[1.6] text-[var(--text-muted)]">Les propriétaires qui ont un bien correspondant peuvent vous répondre directement.</p>

          <label class="mb-1.5 mt-4.5 block text-[13px] font-bold text-[var(--text-muted)]">Ce que vous cherchez</label>
          <textarea v-model="description" rows="3" placeholder="Ex. Chambre-salon meublée à Godomey, budget 40-50k, disponible tout de suite." class="w-full resize-y rounded-md border border-[var(--border-default)] bg-white p-3.5 text-sm outline-none" />

          <div class="mt-3.5 grid grid-cols-2 gap-2.5">
            <div>
              <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">Budget min (FCFA)</label>
              <input v-model="budgetMin" inputmode="numeric" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13px] outline-none">
            </div>
            <div>
              <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">Budget max (FCFA)</label>
              <input v-model="budgetMax" inputmode="numeric" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13px] outline-none">
            </div>
            <div>
              <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">Emménagement souhaité</label>
              <input v-model="moveInDate" type="date" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13px] outline-none">
            </div>
            <div>
              <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">Chambres min.</label>
              <input v-model="minBedrooms" inputmode="numeric" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13px] outline-none">
            </div>
          </div>

          <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Annuler</CoreButton>
            <CoreButton size="lg" full-width :disabled="loading || !canSubmit" @click="submit">{{ loading ? 'Publication…' : 'Publier' }}</CoreButton>
          </div>
        </template>

        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Demande publiée</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">Les propriétaires correspondants peuvent maintenant vous répondre.</p>
            <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
