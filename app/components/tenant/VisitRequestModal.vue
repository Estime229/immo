<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const props = defineProps<{ unitId: string; unitName: string }>()
const emit = defineEmits<{ close: []; requested: [] }>()

const visitsApi = useVisitsApi()

const step = ref<'form' | 'done'>('form')
const date = ref('')
const time = ref('10:00')
const note = ref('')
const loading = ref(false)
const errorMessage = ref('')

/** `requested_at` doit être dans le futur (contrainte serveur) — demain par défaut pour ne pas dépendre de l'heure courante. */
const minDate = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
})

const canSubmit = computed(() => !!date.value && !!time.value)

async function submit() {
  if (!canSubmit.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const requestedAt = new Date(`${date.value}T${time.value}:00`).toISOString()
    await visitsApi.create(props.unitId, requestedAt, note.value.trim() || undefined)
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La demande a échoué.') : 'La demande a échoué.'
  } finally {
    loading.value = false
  }
}

function close() {
  if (step.value === 'done') emit('requested')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[420px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
        <template v-if="step === 'form'">
          <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">Demander une visite</h3>
          <p class="mb-0 mt-2 text-[13px] leading-[1.6] text-[var(--text-muted)]">
            {{ unitName }}. Le propriétaire confirme, refuse ou propose un autre créneau — vous serez prévenu dans vos visites.
          </p>

          <div class="mt-4.5 grid grid-cols-2 gap-2.5">
            <div>
              <label class="mb-1.5 block text-[13px] font-bold text-[var(--text-muted)]">Date souhaitée</label>
              <input v-model="date" type="date" :min="minDate" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
            </div>
            <div>
              <label class="mb-1.5 block text-[13px] font-bold text-[var(--text-muted)]">Heure</label>
              <input v-model="time" type="time" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
            </div>
          </div>

          <label class="mb-1.5 mt-3.5 block text-[13px] font-bold text-[var(--text-muted)]">Message au propriétaire (optionnel)</label>
          <textarea v-model="note" rows="2" placeholder="Ex. Je suis disponible le matin de préférence." class="w-full resize-y rounded-md border border-[var(--border-default)] bg-white p-3.5 text-sm outline-none" />

          <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Annuler</CoreButton>
            <CoreButton size="lg" full-width :disabled="loading || !canSubmit" @click="submit">{{ loading ? 'Envoi…' : 'Demander' }}</CoreButton>
          </div>
        </template>

        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Demande envoyée</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">Le propriétaire a reçu votre demande de visite. Suivez son statut dans « Mes visites ».</p>
            <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
