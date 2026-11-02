<script setup lang="ts">
import type { BookingActionResult } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'

/**
 * Annulation d'un séjour déjà payé (API #25, 02/11/2026). Le voyageur est remboursé jusqu'à 48 h
 * avant l'arrivée, sinon l'hôte garde la première nuit ; l'hôte peut toujours annuler (100 %
 * remboursé, motif obligatoire). La règle est appliquée par le serveur : ce texte l'annonce,
 * il ne la calcule pas. Arrivée = 00:00 heure du Bénin le jour du check-in, comme côté API.
 */
const props = defineProps<{
  mode: 'tenant' | 'host'
  bookingId: string
  checkIn: string
  checkOut: string
  guestName?: string
}>()
const emit = defineEmits<{ close: []; done: [result: BookingActionResult] }>()

const bookingsApi = useBookingsApi()
const reason = ref('')
const busy = ref(false)
const error = ref('')

const hoursBeforeArrival = computed(() => (Date.parse(`${props.checkIn.slice(0, 10)}T00:00:00+01:00`) - Date.now()) / 3_600_000)
const tenantRule = computed(() => hoursBeforeArrival.value >= 48 ? 'full' : 'first-night')
const reasonMissing = computed(() => props.mode === 'host' && reason.value.trim().length < 3)

async function confirm() {
  if (reasonMissing.value) { error.value = 'Indiquez le motif (3 caractères au moins).'; return }
  busy.value = true
  error.value = ''
  try {
    const result = props.mode === 'host'
      ? await bookingsApi.cancelByHost(props.bookingId, reason.value.trim())
      : await bookingsApi.cancel(props.bookingId, reason.value.trim() || undefined)
    emit('done', result)
  } catch (e) {
    error.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Annulation impossible.') : 'Annulation impossible.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <CoreModal :open="true" :title="mode === 'host' ? 'Annuler ce séjour' : 'Annuler mon séjour'" width="480px" :dirty="!!reason" @close="emit('close')">
    <p v-if="mode === 'tenant'" class="mb-3 mt-0 rounded-md px-3.5 py-3 text-[13.5px] leading-[1.55]" :class="tenantRule === 'full' ? 'bg-ok-bg text-green-900' : 'bg-warn-bg text-warn-fg'">
      <template v-if="tenantRule === 'full'">L'arrivée est dans plus de 48 h : vous serez <strong>remboursé en totalité</strong> sur votre portefeuille Bayo.</template>
      <template v-else>L'arrivée est dans moins de 48 h : <strong>la première nuit reste à l'hôte</strong>, le reste est remboursé sur votre portefeuille Bayo.</template>
    </p>
    <p v-else class="mb-3 mt-0 rounded-md bg-warn-bg px-3.5 py-3 text-[13.5px] leading-[1.55] text-warn-fg">
      {{ guestName || 'Le voyageur' }} sera <strong>remboursé à 100 %</strong>. Le montant est repris sur votre portefeuille Bayo (et sur la retenue encore gardée par Bayo), puis les dates sont libérées.
    </p>
    <label class="block text-[13px] font-bold">{{ mode === 'host' ? 'Motif (obligatoire)' : 'Motif (facultatif)' }}
      <textarea v-model="reason" rows="3" maxlength="500" class="mt-1.5 w-full rounded-md border border-[var(--border-default)] bg-white px-3 py-2.5 text-[14px] font-normal outline-none focus:border-green-600" :placeholder="mode === 'host' ? 'Ex. : travaux imprévus' : 'Ex. : changement de programme'" />
    </label>
    <p v-if="mode === 'tenant'" class="mb-0 mt-2 text-xs text-[var(--text-faint)]">Après l'heure d'arrivée, un séjour ne peut plus être annulé : écrivez alors à l'hôte.</p>
    <p v-if="error" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ error }}</p>
    <template #footer>
      <div class="flex justify-end gap-2">
        <CoreButton tone="secondary" :disabled="busy" @click="emit('close')">Garder le séjour</CoreButton>
        <CoreButton :disabled="busy || reasonMissing" @click="confirm">{{ busy ? 'Annulation…' : 'Annuler le séjour' }}</CoreButton>
      </div>
    </template>
  </CoreModal>
</template>
