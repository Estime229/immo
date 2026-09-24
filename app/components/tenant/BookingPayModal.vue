<script setup lang="ts">
import type { BookingSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const props = defineProps<{ booking: BookingSummary }>()
const emit = defineEmits<{ close: []; paid: [] }>()

const bookingsApi = useBookingsApi()

const step = ref<'form' | 'done'>('form')
const promoCode = ref('')
const previewLoading = ref(false)
const previewError = ref('')
const preview = ref<{ applied: boolean; discount_amount: number; final_price: number } | null>(null)
const payLoading = ref(false)
const payError = ref('')

async function runPreview() {
  previewLoading.value = true
  previewError.value = ''
  try {
    preview.value = await bookingsApi.previewPromo(props.booking.id, promoCode.value.trim() || undefined)
  } catch (e) {
    preview.value = null
    previewError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Code promo invalide.') : 'Code promo invalide.'
  } finally {
    previewLoading.value = false
  }
}

const displayTotal = computed(() => preview.value?.final_price ?? Number(props.booking.total_price))

async function submitPay() {
  payLoading.value = true
  payError.value = ''
  try {
    await bookingsApi.pay(props.booking.id, preview.value?.applied ? promoCode.value.trim() : undefined)
    step.value = 'done'
  } catch (e) {
    payError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Le paiement a échoué.') : 'Le paiement a échoué.'
  } finally {
    payLoading.value = false
  }
}

function close() {
  if (step.value === 'done') emit('paid')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[440px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
        <template v-if="step === 'form'">
          <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">Payer ma réservation</h3>
          <p class="mb-0 mt-2 text-[13px] text-[var(--text-muted)]">{{ booking.unit.name }} · {{ booking.nights }} nuit{{ booking.nights > 1 ? 's' : '' }}</p>

          <div class="mt-4.5 flex gap-2">
            <input
              v-model="promoCode"
              placeholder="Code promo (facultatif)"
              class="h-10 min-w-0 flex-1 rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none"
              @keyup.enter="runPreview"
            >
            <button type="button" class="flex-none rounded-sm border border-[var(--border-default)] bg-white px-4 text-[13px] font-bold" :disabled="previewLoading" @click="runPreview">
              {{ previewLoading ? '…' : 'Vérifier' }}
            </button>
          </div>
          <p v-if="previewError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ previewError }}</p>
          <p v-else-if="preview && !preview.applied && promoCode" class="mb-0 mt-2 text-[12.5px] text-[var(--text-muted)]">Aucune réduction pour ce code.</p>

          <div class="mt-4.5 rounded-md border border-[var(--border-default)] bg-white px-4.5 py-3.5">
            <DataMoneyLine label="Séjour" :value="formatFcfa(Number(booking.total_price))" />
            <DataMoneyLine v-if="preview?.applied" label="Réduction" :value="`-${formatFcfa(preview.discount_amount)}`" tone="credit" />
            <DataMoneyLine label="Total à payer" :value="formatFcfa(displayTotal)" total />
          </div>

          <p v-if="payError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ payError }}</p>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">Annuler</CoreButton>
            <CoreButton size="lg" full-width :disabled="payLoading" @click="submitPay">{{ payLoading ? 'Paiement…' : 'Payer' }}</CoreButton>
          </div>
        </template>

        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Réservation confirmée</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">Votre propriétaire est notifié. Le reçu sera disponible dans la liste.</p>
            <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
