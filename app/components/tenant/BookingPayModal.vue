<script setup lang="ts">
import { Check, ExternalLink, Lock, RefreshCw } from '@lucide/vue'
import type { BookingSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { deriveHoldCountdown } from '~/utils/bookingHold'

const props = defineProps<{ booking: BookingSummary }>()
/** `paid` seulement sur un vrai paiement ; `changed` quand la réservation n'est plus payable (dates prises → annulée par l'API, ou délai dépassé). */
const emit = defineEmits<{ close: []; paid: []; changed: [] }>()

const route = useRoute()
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

/* ---- Compte à rebours du hold de 15 min, toujours visible dans la fenêtre ---- */
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
const shortfall = computed(() => wallet.state.value === 'success' ? Math.max(0, displayTotal.value - wallet.spendable.value) : 0)
const retentionPct = computed(() => Number(props.booking.unit?.booking_retention_percentage ?? 0))

/**
 * Recharge faite dans un autre onglet (lien ci-dessous) : la tirelire est relue au retour sur
 * cet onglet, et « J'ai rechargé » la relit à la demande — avant, il fallait fermer et rouvrir.
 */
const refreshNote = ref('')
async function refreshWallet(manual = false) {
  if (step.value !== 'form' || blocking.value) return
  await wallet.reload()
  if (manual) refreshNote.value = wallet.state.value !== 'success' ? 'Solde indisponible pour le moment.' : shortfall.value > 0 ? 'Votre tirelire ne suffit pas encore.' : ''
}
function onVisible() {
  if (document.visibilityState === 'visible' && shortfall.value > 0) refreshWallet()
}
onMounted(() => {
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('focus', onVisible)
})

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
/** Depuis « Mes réservations », la page bascule elle-même sur le séjour : le lien serait redondant. */
const onReservationsPage = computed(() => route.path.startsWith('/locataire/reservations'))

function shortDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function close() {
  if (step.value === 'done') emit('paid')
  else if (blocking.value) emit('changed')
  emit('close')
}
</script>

<template>
  <CoreModal :open="true" :title="step === 'done' ? 'Réservation confirmée' : 'Payer ma réservation'" width="460px" :dirty="step === 'form' && (!!promoCode.trim() || payLoading)" @close="close">
    <template v-if="step === 'form'">
      <p class="m-0 text-[13.5px] text-[var(--text-muted)]">
        {{ booking.unit?.name ?? 'Logement' }} · <span class="font-mono">{{ shortDay(booking.check_in) }} – {{ shortDay(booking.check_out) }}</span> · {{ booking.nights }} nuit{{ booking.nights > 1 ? 's' : '' }}
      </p>
      <p v-if="hold && !hold.expired && !blocking" class="mb-0 mt-2.5 inline-flex items-center gap-2 rounded-pill bg-danger-bg px-3 py-1.5 text-[12px] font-bold text-danger-fg">
        <span class="h-[7px] w-[7px] animate-[im-pulse_1.2s_infinite] rounded-pill bg-danger-fg" />Dates gardées encore <span class="font-mono">{{ hold.minutesRemaining }}</span> min
      </p>
      <p v-else-if="hold?.expired && !blocking" class="mb-0 mt-2.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">
        Le délai de 15 minutes est dépassé : les dates ont été libérées. <NuxtLink :to="listingLink" class="underline">Réserver à nouveau</NuxtLink>
      </p>

      <template v-if="!blocking">
        <div class="mt-4 flex gap-2">
          <input
            v-model="promoCode"
            placeholder="Code promo (facultatif)"
            aria-label="Code promo"
            class="h-[42px] min-w-0 flex-1 rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold outline-none"
            @keyup.enter="runPreview"
          >
          <CoreButton size="sm" tone="secondary" :disabled="previewLoading || !promoCode.trim()" @click="runPreview">{{ previewLoading ? '…' : 'Appliquer' }}</CoreButton>
        </div>
        <p v-if="previewError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ previewError }}</p>
        <p v-else-if="preview && !preview.applied && promoCode" class="mb-0 mt-2 text-[12.5px] text-[var(--text-muted)]">Ce code n'apporte pas de réduction sur ce séjour.</p>
        <p v-else-if="preview?.applied" class="mb-0 mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ok-fg"><Check class="h-3.5 w-3.5" :stroke-width="2.2" />Code appliqué</p>

        <div class="mt-4 rounded-lg border border-[var(--border-subtle)] bg-white px-4.5 py-3.5">
          <DataMoneyLine label="Séjour" :value="formatFcfa(Number(booking.total_price))" />
          <DataMoneyLine v-if="preview?.applied" label="Réduction" :value="`-${formatFcfa(preview.discount_amount)}`" tone="credit" />
          <DataMoneyLine label="Total à payer" :value="formatFcfa(displayTotal)" total />
          <p class="mb-0 mt-2 text-[12px] text-[var(--text-muted)]">
            Prélevé sur votre tirelire<template v-if="wallet.state.value === 'success'"> · <span class="font-mono">{{ formatFcfa(wallet.spendable.value) }}</span> disponibles</template><template v-else-if="wallet.state.value === 'loading'"> · lecture du solde…</template>.
          </p>
        </div>
        <p v-if="wallet.state.value === 'error'" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">
          Votre solde n'a pas pu être lu. <button type="button" class="font-bold underline" @click="refreshWallet(true)">Réessayer</button>
        </p>

        <WalletInconsistencyNote compact />
        <div v-if="shortfall > 0" class="mt-3 rounded-md border border-warn-border bg-warn-bg px-3.5 py-3 text-[13px] text-warn-fg-deep">
          <p class="m-0 font-bold">Il vous manque <span class="font-mono">{{ formatFcfa(shortfall) }}</span> dans votre tirelire.</p>
          <p class="mb-0 mt-1">Rechargez-la en Mobile Money dans un nouvel onglet, puis revenez ici<template v-if="hold && !hold.expired"> avant la fin des <span class="font-mono">{{ hold.minutesRemaining }}</span> minutes</template> : le solde est relu à votre retour.</p>
          <div class="mt-2.5 flex flex-wrap gap-2">
            <NuxtLink to="/locataire/wallet" target="_blank" class="inline-flex items-center gap-1.5 rounded-pill border border-warn-border bg-white px-3.5 py-2 text-[12.5px] font-bold text-warn-fg-deep">
              Recharger ma tirelire <ExternalLink class="h-3.5 w-3.5" :stroke-width="1.9" />
            </NuxtLink>
            <button type="button" class="inline-flex items-center gap-1.5 rounded-pill px-3 py-2 text-[12.5px] font-bold text-warn-fg-deep underline disabled:opacity-60" :disabled="wallet.state.value === 'loading'" @click="refreshWallet(true)">
              <RefreshCw class="h-3.5 w-3.5" :stroke-width="1.9" />{{ wallet.state.value === 'loading' ? 'Lecture…' : "J'ai rechargé" }}
            </button>
          </div>
          <p v-if="refreshNote" class="mb-0 mt-1.5 text-[12px] font-semibold">{{ refreshNote }}</p>
        </div>
        <p v-if="retentionPct > 0" class="mb-0 mt-3 flex items-start gap-2 text-[12px] leading-[1.5] text-[var(--text-muted)]">
          <Lock class="mt-px h-3.5 w-3.5 flex-none text-clay-700" :stroke-width="1.9" />
          <span><span class="font-mono">{{ retentionPct }} %</span> du montant est gardé par Immo jusqu'à votre départ, puis versé à l'hôte<template v-if="booking.unit?.requires_booking_inventory"> après l'état des lieux d'arrivée</template>.</span>
        </p>
      </template>

      <div v-if="payError" class="mt-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">
        {{ payError }}
        <NuxtLink v-if="blocking" :to="listingLink" class="mt-1 block font-bold underline">{{ blocking === 'taken' ? 'Choisir d\'autres dates' : 'Réserver à nouveau' }}</NuxtLink>
      </div>
    </template>

    <div v-else class="py-1 text-center">
      <div class="mx-auto grid h-14 w-14 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-white"><Check class="h-7 w-7" :stroke-width="2.4" /></div>
      <p class="mb-0 mt-4 text-base font-bold"><span class="font-mono">{{ formatFcfa(displayTotal) }}</span> payés</p>
      <p class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Séjour du <span class="font-mono">{{ shortDay(booking.check_in) }}</span> au <span class="font-mono">{{ shortDay(booking.check_out) }}</span> confirmé. L'hôte reçoit une notification du paiement ; le reçu est disponible dans « Mes réservations ».
      </p>
    </div>

    <template #footer>
      <div v-if="step === 'form'" class="flex gap-2.5">
        <CoreButton tone="secondary" full-width @click="close">{{ blocking || hold?.expired ? 'Fermer' : 'Plus tard' }}</CoreButton>
        <CoreButton v-if="!blocking && !hold?.expired" full-width :disabled="payLoading || shortfall > 0 || wallet.state.value !== 'success'" @click="submitPay">{{ payLoading ? 'Paiement…' : `Payer ${formatFcfaShort(displayTotal)}` }}</CoreButton>
      </div>
      <div v-else class="flex gap-2.5">
        <template v-if="onReservationsPage">
          <CoreButton full-width @click="close">Voir mon séjour</CoreButton>
        </template>
        <template v-else>
          <CoreButton tone="secondary" full-width @click="close">Fermer</CoreButton>
          <NuxtLink :to="`/locataire/reservations?booking=${booking.id}`" class="flex w-full items-center justify-center rounded-md bg-[image:var(--action-primary)] px-4 text-[14px] font-bold text-white shadow-action" @click="close">Mes réservations</NuxtLink>
        </template>
      </div>
    </template>
  </CoreModal>
</template>
