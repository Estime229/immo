<script setup lang="ts">
import type { BookingSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { deriveHoldCountdown } from '~/utils/bookingHold'

const props = defineProps<{ booking: BookingSummary }>()
/** `paid` seulement sur un vrai paiement ; `changed` quand la réservation n'est plus payable (dates prises → annulée par l'API, ou délai dépassé). */
const emit = defineEmits<{ close: []; paid: []; changed: [] }>()

const bookingsApi = useBookingsApi()
const wallet = useTenantWallet()
onMounted(() => { wallet.reload() })

const step = ref<'form' | 'done'>('form')
const promoCode = ref('')
const previewLoading = ref(false)
const previewError = ref('')
const preview = ref<{ applied: boolean; discount_amount: number; final_price: number } | null>(null)
const payLoading = ref(false)
const payError = ref('')
/** Refus définitifs du paiement : on ne propose plus « Payer », mais une sortie utile. */
const blocking = ref<'taken' | 'expired' | null>(null)

/* ---- Compte à rebours du hold de 15 min, affiché dans la fenêtre même ---- */
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { now.value = new Date() }, 5000) })
onUnmounted(() => { if (timer) clearInterval(timer) })
const hold = computed(() => deriveHoldCountdown(props.booking.expires_at, now.value))

async function runPreview() {
  previewLoading.value = true
  previewError.value = ''
  try {
    preview.value = await bookingsApi.previewPromo(props.booking.id, promoCode.value.trim() || undefined)
  } catch (e) {
    preview.value = null
    previewError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Code promo invalide.') : 'Code promo invalide.'
  } finally {
    previewLoading.value = false
  }
}

const displayTotal = computed(() => preview.value?.final_price ?? Number(props.booking.total_price))
/** L'API ne débite que la tirelire (message brut « Votre tirelire contient 0 XOF… ») : dit avant le clic. */
const shortfall = computed(() => wallet.state.value === 'success' ? Math.max(0, displayTotal.value - wallet.balanceSavings.value) : 0)
const retentionPct = computed(() => Number(props.booking.unit?.booking_retention_percentage ?? 0))

async function submitPay() {
  payLoading.value = true
  payError.value = ''
  try {
    await bookingsApi.pay(props.booking.id, preview.value?.applied ? promoCode.value.trim() : undefined)
    step.value = 'done'
    wallet.reload()
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 409) blocking.value = 'taken'
    else if (e instanceof ApiRequestError && /expiré/.test(e.mapped.bannerMessage ?? '')) blocking.value = 'expired'
    payError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Le paiement a échoué.') : 'Le paiement a échoué.'
  } finally {
    payLoading.value = false
  }
}

const listingLink = computed(() => props.booking.unit?.property_id ? `/biens/${props.booking.unit.property_id}` : '/recherche?mode=nuit')

function close() {
  if (step.value === 'done') emit('paid')
  else if (blocking.value) emit('changed')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[460px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
        <template v-if="step === 'form'">
          <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">Payer ma réservation</h3>
          <p class="mb-0 mt-2 text-[13px] text-[var(--text-muted)]">
            {{ booking.unit?.name ?? 'Logement' }} · {{ new Date(booking.check_in).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) }} → {{ new Date(booking.check_out).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) }} · {{ booking.nights }} nuit{{ booking.nights > 1 ? 's' : '' }}
          </p>
          <p v-if="hold && !hold.expired && !blocking" class="mb-0 mt-2.5 inline-flex items-center gap-2 rounded-pill bg-danger-bg px-3 py-1.5 text-[12px] font-bold text-danger-fg">
            <span class="h-[7px] w-[7px] animate-[im-pulse_1.2s_infinite] rounded-pill bg-danger-fg" />Dates gardées encore {{ hold.minutesRemaining }} min
          </p>

          <template v-if="!blocking">
            <div class="mt-4 flex gap-2">
              <input
                v-model="promoCode"
                placeholder="Code promo (facultatif)"
                class="h-10 min-w-0 flex-1 rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none"
                @keyup.enter="runPreview"
              >
              <button type="button" class="flex-none rounded-sm border border-[var(--border-default)] bg-white px-4 text-[13px] font-bold" :disabled="previewLoading || !promoCode.trim()" @click="runPreview">
                {{ previewLoading ? '…' : 'Appliquer' }}
              </button>
            </div>
            <p v-if="previewError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ previewError }}</p>
            <p v-else-if="preview && !preview.applied && promoCode" class="mb-0 mt-2 text-[12.5px] text-[var(--text-muted)]">Ce code n'apporte pas de réduction sur ce séjour.</p>
            <p v-else-if="preview?.applied" class="mb-0 mt-2 text-[12.5px] font-semibold text-ok-fg">Code appliqué ✓</p>

            <div class="mt-4 rounded-md border border-[var(--border-default)] bg-white px-4.5 py-3.5">
              <DataMoneyLine label="Séjour" :value="formatFcfa(Number(booking.total_price))" />
              <DataMoneyLine v-if="preview?.applied" label="Réduction" :value="`-${formatFcfa(preview.discount_amount)}`" tone="credit" />
              <DataMoneyLine label="Total à payer" :value="formatFcfa(displayTotal)" total />
              <p class="mb-0 mt-2 text-[12px] text-[var(--text-muted)]">
                Prélevé sur votre tirelire<template v-if="wallet.state.value === 'success'"> ({{ formatFcfa(wallet.balanceSavings.value) }} disponibles)</template>.
              </p>
            </div>

            <div v-if="shortfall > 0" class="mt-3 rounded-md border border-warn-border bg-warn-bg px-3.5 py-3 text-[13px] text-warn-fg">
              <p class="m-0 font-bold">Il vous manque {{ formatFcfa(shortfall) }} dans votre tirelire.</p>
              <p class="mb-0 mt-1">Rechargez-la en Mobile Money, puis revenez payer avant l'expiration des {{ hold?.minutesRemaining ?? 15 }} minutes.</p>
              <NuxtLink to="/locataire/wallet" target="_blank" class="mt-2 inline-block font-bold underline">Recharger ma tirelire ↗</NuxtLink>
            </div>
            <p v-if="retentionPct > 0" class="mb-0 mt-3 text-[12px] leading-[1.5] text-[var(--text-muted)]">🔒 {{ retentionPct }} % du montant est gardé par Immo jusqu'à votre départ, puis versé à l'hôte<template v-if="booking.unit?.requires_booking_inventory"> après l'état des lieux d'arrivée</template>.</p>
          </template>

          <div v-if="payError" class="mt-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">
            {{ payError }}
            <NuxtLink v-if="blocking" :to="listingLink" class="mt-1 block font-bold underline">{{ blocking === 'taken' ? 'Choisir d\'autres dates' : 'Réserver à nouveau' }}</NuxtLink>
          </div>
          <div class="mt-5 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="close">{{ blocking ? 'Fermer' : 'Plus tard' }}</CoreButton>
            <CoreButton v-if="!blocking" size="lg" full-width :disabled="payLoading || shortfall > 0 || hold?.expired" @click="submitPay">{{ payLoading ? 'Paiement…' : `Payer ${formatFcfa(displayTotal)}` }}</CoreButton>
          </div>
          <p v-if="hold?.expired && !blocking" class="mb-0 mt-2.5 text-center text-[12.5px] font-semibold text-danger-fg">Le délai de 15 minutes est dépassé : <NuxtLink :to="listingLink" class="underline">réservez à nouveau</NuxtLink>.</p>
        </template>
        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Réservation confirmée</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">Vos dates sont bloquées et l'hôte est prévenu. Retrouvez le séjour et son reçu dans « Mes réservations ».</p>
            <div class="mt-5 flex gap-2.5">
              <CoreButton tone="secondary" size="lg" full-width @click="close">Fermer</CoreButton>
              <NuxtLink to="/locataire/reservations" class="flex w-full items-center justify-center rounded-md bg-[image:var(--action-primary)] px-4 text-[14px] font-bold text-white">Mes réservations</NuxtLink>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
