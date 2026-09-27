<script setup lang="ts">
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
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[440px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
        <template v-if="step === 'form'">
          <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">Prolonger mon séjour</h3>
          <p class="mb-0 mt-2 text-[13px] leading-[1.6] text-[var(--text-muted)]">
            {{ booking.unit?.name ?? 'Logement' }}, actuellement jusqu'au {{ new Date(booking.check_out).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) }}.
            Les nuits ajoutées forment une nouvelle réservation, à payer sous 15 minutes — votre séjour actuel reste inchangé.
          </p>
          <label class="mb-1.5 mt-4.5 block text-[13px] font-bold text-[var(--text-muted)]">Nouvelle date de départ</label>
          <input v-model="newCheckOut" type="date" :min="minDate" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
          <p v-if="minStay && minStay > 1" class="mb-0 mt-1.5 text-[12px] text-[var(--text-faint)]">Au moins {{ minStay }} nuits ajoutées (séjour minimum du logement).</p>

          <div v-if="estimate" class="mt-3.5 rounded-md border border-[var(--border-default)] bg-white px-4 py-3">
            <DataMoneyLine v-for="l in estimate.lines" :key="l.label" :label="l.label" :value="formatFcfa(l.amount)" />
            <DataMoneyLine :label="`${addedNights} nuit${addedNights > 1 ? 's' : ''} ajoutée${addedNights > 1 ? 's' : ''}`" :value="formatFcfa(estimate.total)" total />
          </div>

          <p v-if="errorMessage" class="mb-0 mt-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Annuler</CoreButton>
            <CoreButton size="lg" full-width :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : 'Continuer' }}</CoreButton>
          </div>
        </template>

        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Nuits réservées pour 15 min</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">
              {{ created?.nights }} nuit{{ (created?.nights ?? 0) > 1 ? 's' : '' }} supplémentaire{{ (created?.nights ?? 0) > 1 ? 's' : '' }} — {{ formatFcfa(Number(created?.total_price ?? 0)) }}. Payez maintenant pour confirmer la prolongation.
            </p>
            <div class="mt-5 flex gap-2.5">
              <CoreButton tone="secondary" size="lg" full-width @click="close">Plus tard</CoreButton>
              <CoreButton size="lg" full-width @click="payNow">Payer maintenant</CoreButton>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
