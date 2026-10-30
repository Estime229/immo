<script setup lang="ts">
import { Clock } from '@lucide/vue'
import type { BookingActionResult, BookingSummary } from '~/types/tenant'
import type { UnitPricing } from '~/types/property'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { minExtensionCheckOut } from '~/utils/bookings'
import { quoteStay } from '~/utils/stayPricing'

const props = defineProps<{ booking: BookingSummary }>()
const emit = defineEmits<{ close: []; extended: []; pay: [segment: BookingSummary] }>()

const bookingsApi = useBookingsApi()
const pricingApi = useUnitPricingApi()

const step = ref<'form' | 'done'>('form')
const newCheckOut = ref('')
const loading = ref(false)
const errorMessage = ref('')
const created = ref<BookingActionResult | null>(null)

/**
 * L'API applique le séjour minimum du logement au segment ajouté seul
 * (constaté en live : +1 nuit refusée sur un logement à 2 nuits minimum) —
 * la première date proposée en tient compte.
 */
const minStay = computed(() => props.booking.unit?.min_duration_days ?? null)
const minDate = computed(() => minExtensionCheckOut(props.booking.check_out, minStay.value))
const addedNights = computed(() => newCheckOut.value
  ? Math.round((new Date(`${newCheckOut.value}T12:00:00`).getTime() - new Date(`${props.booking.check_out.slice(0, 10)}T12:00:00`).getTime()) / 86400000)
  : 0)

/** Estimation avec la même règle que l'API (paliers appliqués au segment ajouté seul). */
const pricing = ref<UnitPricing[]>([])
onMounted(async () => {
  try {
    pricing.value = await pricingApi.fetchPricing(props.booking.unit_id)
  } catch {
    pricing.value = []
  }
})
const estimate = computed(() => (addedNights.value > 0 ? quoteStay(addedNights.value, pricing.value) : null))

async function submit() {
  errorMessage.value = ''
  if (!newCheckOut.value || newCheckOut.value < minDate.value) {
    errorMessage.value = minStay.value && minStay.value > 1
      ? `Ce logement se loue au minimum ${minStay.value} nuits : choisissez un départ à partir du ${new Date(`${minDate.value}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`
      : 'Choisissez une nouvelle date de départ.'
    return
  }
  loading.value = true
  try {
    created.value = await bookingsApi.extend(props.booking.id, newCheckOut.value)
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError
      ? (e.status === 409 ? 'Le logement est déjà pris sur une partie de ces nuits : essayez une date de départ plus proche.' : errorText(e.mapped, 'La prolongation a échoué.'))
      : 'La prolongation a échoué.'
  } finally {
    loading.value = false
  }
}

function payNow() {
  if (!created.value) return
  emit('pay', { ...created.value, retained_amount: null, retention_released_at: null, unit: props.booking.unit } as BookingSummary)
}

function close() {
  if (step.value === 'done') emit('extended')
  emit('close')
}

function longDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}
</script>

<template>
  <CoreModal :open="true" :title="step === 'done' ? 'Nuits gardées 15 minutes' : 'Prolonger mon séjour'" width="440px" :dirty="step === 'form' && !!newCheckOut" @close="close">
    <template v-if="step === 'form'">
      <p class="m-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        {{ booking.unit?.name ?? 'Logement' }}, actuellement jusqu'au <span class="font-mono">{{ longDay(booking.check_out) }}</span>.
        Les nuits ajoutées forment une nouvelle réservation, à payer sous 15 minutes — votre séjour actuel reste inchangé.
      </p>
      <label class="mt-4 block">
        <span class="mb-[7px] block text-[12.5px] font-bold">Nouvelle date de départ</span>
        <input v-model="newCheckOut" type="date" :min="minDate" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[15px] text-[14.5px] outline-none">
        <span v-if="minStay && minStay > 1" class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">Au moins {{ minStay }} nuits ajoutées (séjour minimum du logement).</span>
      </label>

      <div v-if="estimate" class="mt-3.5 rounded-lg border border-[var(--border-subtle)] bg-white px-4 py-3">
        <DataMoneyLine v-for="l in estimate.lines" :key="l.label" :label="l.label" :value="formatFcfa(l.amount)" />
        <DataMoneyLine :label="`${addedNights} nuit${addedNights > 1 ? 's' : ''} ajoutée${addedNights > 1 ? 's' : ''}`" :value="formatFcfa(estimate.total)" total />
        <p class="mb-0 mt-2 text-[12px] text-[var(--text-faint)]">Estimation : le montant exact est calculé à l'étape suivante.</p>
      </div>

      <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
    </template>

    <div v-else class="py-1 text-center">
      <div class="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-warn-bg text-warn-fg"><Clock class="h-7 w-7" :stroke-width="1.9" /></div>
      <p class="mb-0 mt-4 text-base font-bold">{{ created?.nights }} nuit{{ (created?.nights ?? 0) > 1 ? 's' : '' }} de plus · <span class="font-mono">{{ formatFcfa(Number(created?.total_price ?? 0)) }}</span></p>
      <p class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Ces nuits sont gardées 15 minutes. Payez maintenant pour confirmer la prolongation ; sans paiement, elles seront libérées.
      </p>
    </div>

    <template #footer>
      <div class="flex gap-2.5">
        <template v-if="step === 'form'">
          <CoreButton tone="secondary" full-width @click="close">Annuler</CoreButton>
          <CoreButton full-width :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : 'Continuer' }}</CoreButton>
        </template>
        <template v-else>
          <CoreButton tone="secondary" full-width @click="close">Plus tard</CoreButton>
          <CoreButton full-width @click="payNow">Payer maintenant</CoreButton>
        </template>
      </div>
    </template>
  </CoreModal>
</template>
