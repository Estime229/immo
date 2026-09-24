<script setup lang="ts">
import type { BookingSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const props = defineProps<{ booking: BookingSummary }>()
const emit = defineEmits<{ close: []; extended: [] }>()

const bookingsApi = useBookingsApi()

const step = ref<'form' | 'done'>('form')
const newCheckOut = ref('')
const loading = ref(false)
const errorMessage = ref('')

/** Le nouveau segment part du check_out actuel — imposé par le serveur, pas un choix du formulaire. */
const minDate = computed(() => props.booking.check_out)

async function submit() {
  if (!newCheckOut.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    await bookingsApi.extend(props.booking.id, newCheckOut.value)
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La prolongation a échoué.') : 'La prolongation a échoué.'
  } finally {
    loading.value = false
  }
}

function close() {
  if (step.value === 'done') emit('extended')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[420px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
        <template v-if="step === 'form'">
          <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">Prolonger mon séjour</h3>
          <p class="mb-0 mt-2 text-[13px] leading-[1.6] text-[var(--text-muted)]">
            {{ booking.unit.name }}, actuellement jusqu'au {{ new Date(booking.check_out).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) }}.
            Une nouvelle réservation est créée pour la période ajoutée, à payer séparément — votre séjour d'origine n'est pas modifié.
          </p>
          <label class="mb-1.5 mt-4.5 block text-[13px] font-bold text-[var(--text-muted)]">Nouvelle date de départ</label>
          <input v-model="newCheckOut" type="date" :min="minDate" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
          <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Annuler</CoreButton>
            <CoreButton size="lg" full-width :disabled="loading || !newCheckOut" @click="submit">{{ loading ? 'Envoi…' : 'Continuer' }}</CoreButton>
          </div>
        </template>

        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Prolongation créée</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">Une nouvelle réservation en attente de paiement vient d'apparaître dans votre liste — payez-la avant son expiration pour confirmer la prolongation.</p>
            <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
