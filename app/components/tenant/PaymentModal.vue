<script setup lang="ts">
import { Check, ExternalLink, X } from '@lucide/vue'
import type { CheckoutResult, PaymentGateway } from '~/types/wallet'
import { pollVerifyReturn } from '~/utils/paymentPolling'
import { gatewayNeedsPhone, gatewaySupported, normalizeBeninPhone, validateRecharge } from '~/utils/wallet'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { invoiceView, nextPayableInvoice } from '~/utils/leases'

const { open, mode, invoiceId, closePay } = usePaymentModal()
const { activeLease, reload: reloadLeases } = useTenantLeases()
const wallet = useTenantWallet()
const walletApi = useWalletApi()
const paymentApi = usePaymentApi()
const currentUser = useAuthUser()
const doc = useOpenDocument()

type Step = 'amount' | 'processing' | 'done' | 'error'
const step = ref<Step>('amount')
const amount = ref('')
const errorMessage = ref('')
const loading = ref(false)
let cancelled = false

function formatDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Facture choisie dans l'échéancier, sinon la plus ancienne encore due — avant : la première non payée dans l'ordre de l'API, soit la plus récente. */
const invoiceToPay = computed(() => {
  const invoices = activeLease.value?.invoices ?? []
  const picked = invoiceId.value ? invoices.find(i => i.id === invoiceId.value && i.status !== 'paid') : null
  return picked ?? nextPayableInvoice(invoices)
})
const rentAmount = computed(() => Number(invoiceToPay.value?.amount ?? 0))
const rentShortfall = computed(() => invoiceToPay.value && wallet.state.value === 'success'
  ? Math.max(0, rentAmount.value - wallet.spendable.value)
  : 0)

/* ---- Après un loyer payé : ce qui reste dû, recalculé sur le bail rechargé ---- */
const paidInvoiceId = ref<string | null>(null)
const paidAmount = ref(0)
const remainingInvoices = computed(() => (activeLease.value?.invoices ?? []).filter(i => invoiceView(i).payable))
const nextInvoice = computed(() => nextPayableInvoice(activeLease.value?.invoices))

/* ---- Recharge : passerelles ---- */
const gateways = ref<PaymentGateway[]>([])
const gatewaysState = ref<'loading' | 'error' | 'ready'>('loading')
const selectedGatewayId = ref('')
const selectedGateway = computed(() => gateways.value.find(g => g.id === selectedGatewayId.value) ?? null)
/** Mobile Money direct : la demande de paiement part sur ce numéro (accepté par checkout depuis la correction de #49). */
const phone = ref('')
const needsPhone = computed(() => !!selectedGateway.value && gatewayNeedsPhone(selectedGateway.value))
async function loadGateways() {
  gatewaysState.value = 'loading'
  try {
    // Kkiapay (widget JS tiers non chargé) retiré de la liste : le choisir menait à une erreur après avoir créé la transaction.
    gateways.value = (await paymentApi.fetchGateways()).filter(gatewaySupported)
    selectedGatewayId.value = gateways.value[0]?.id ?? ''
    gatewaysState.value = 'ready'
  } catch {
    gateways.value = []
    gatewaysState.value = 'error'
  }
}

/** Recharge ouverte depuis un manque sur le loyer : au succès, on propose de revenir au loyer. */
const rechargeForRent = ref<{ invoiceId: string; missing: number } | null>(null)

watch(open, v => {
  cancelled = false
  if (!v) return
  errorMessage.value = ''
  redirectPending.value = false
  checkoutResult.value = null
  paidInvoiceId.value = null
  rechargeForRent.value = null
  step.value = 'amount'
  wallet.reload()
  if (mode.value === 'recharge') startRecharge('')
})

function startRecharge(prefill: string) {
  amount.value = prefill
  phone.value = currentUser.value?.phone_number ?? ''
  loadGateways()
}

function onAmountInput(e: Event) {
  amount.value = (e.target as HTMLInputElement).value.replace(/\D/g, '')
}
const amountNum = computed(() => Number(amount.value) || 0)
const rechargeError = computed(() => (amount.value ? validateRecharge({ amount: amountNum.value, gateway: selectedGateway.value, phone: phone.value }) : null))

const RECHARGE_PRESETS = [25000, 50000, 100000]

/** Depuis un manque sur le loyer : recharge du montant manquant (500 F minimum, règle de checkout). */
function switchToRecharge(missing: number) {
  const invoice = invoiceToPay.value
  rechargeForRent.value = invoice ? { invoiceId: invoice.id, missing } : null
  mode.value = 'recharge'
  step.value = 'amount'
  errorMessage.value = ''
  startRecharge(String(Math.max(Math.ceil(missing), 500)))
}

/** Retour au loyer après une recharge réussie : même échéance, solde relu. */
async function backToRent() {
  const target = rechargeForRent.value
  rechargeForRent.value = null
  mode.value = 'loyer'
  invoiceId.value = target?.invoiceId ?? null
  step.value = 'amount'
  errorMessage.value = ''
  await wallet.reload()
}

function close() {
  cancelled = true
  closePay()
}

/** Ne pas perdre une recharge entamée (montant saisi, paiement en cours) sur un clic à côté. */
const dirty = computed(() => step.value === 'processing' || (mode.value === 'recharge' && step.value === 'amount' && !!amount.value))

/* ---- Payer un loyer : débit direct de la tirelire, pas de passerelle ---- */
async function submitPayRent() {
  const invoice = invoiceToPay.value
  if (!activeLease.value || !invoice) return
  loading.value = true
  errorMessage.value = ''
  try {
    await walletApi.payRent(invoice.id, activeLease.value.id)
    paidInvoiceId.value = invoice.id
    paidAmount.value = Number(invoice.amount)
    await Promise.allSettled([reloadLeases(), wallet.reload()])
    step.value = 'done'
  } catch (e) {
    // Une erreur réseau peut cacher un paiement passé : on relit avant de proposer de réessayer.
    await Promise.allSettled([reloadLeases(), wallet.reload()])
    const fresh = activeLease.value?.invoices?.find(i => i.id === invoice.id)
    if (fresh?.status === 'paid') {
      paidInvoiceId.value = invoice.id
      paidAmount.value = Number(invoice.amount)
      step.value = 'done'
    } else {
      errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Le paiement a échoué.') : 'Le paiement a échoué.'
    }
  } finally {
    loading.value = false
  }
}

function payNext() {
  if (!nextInvoice.value) return
  invoiceId.value = nextInvoice.value.id
  paidInvoiceId.value = null
  errorMessage.value = ''
  step.value = 'amount'
}

const docError = ref('')
async function openReceipt() {
  if (!paidInvoiceId.value) return
  docError.value = (await doc.open(paidInvoiceId.value, `/leases/invoice/${paidInvoiceId.value}/pdf`)) ?? ''
}

/* ---- Recharger : passerelle réelle, sondage borné, jamais de lecture de `gateway` pour piloter l'UI ---- */
const checkoutResult = ref<CheckoutResult | null>(null)

async function submitRecharge() {
  if (rechargeError.value || !selectedGateway.value) return
  loading.value = true
  errorMessage.value = ''
  step.value = 'processing'
  try {
    const res = await paymentApi.checkout({
      gatewayId: selectedGateway.value.id,
      amount: amountNum.value,
      description: 'Recharge wallet Immo',
      ...(needsPhone.value ? { phoneNumber: normalizeBeninPhone(phone.value) ?? undefined } : {})
    })
    checkoutResult.value = res

    if (res.mode === 'widget') {
      errorMessage.value = "Ce moyen de paiement n'est pas encore disponible ici. Choisissez une autre passerelle."
      step.value = 'error'
      return
    }

    if (res.mode === 'redirect') {
      // Le paiement se termine dans l'onglet FedaPay ; au retour, « J'ai terminé » appelle verify-return (confirmRedirectReturn).
      window.open(res.url, '_blank')
      loading.value = false
      return
    }

    // ussd_push et mock : /payment/transactions/:id/status répond 404 sur cet id (constaté en live, Lot 55) et c'est
    // verify-return qui crédite le wallet — c'est donc lui qu'on sonde, comme le demande instructions.fr.
    const poll = await pollVerifyReturn(() => paymentApi.verifyReturn(res.transactionId, res.gateway), { isCancelled: () => cancelled })
    if (poll.outcome === 'completed') {
      await wallet.reload()
      step.value = 'done'
    } else if (poll.outcome === 'timeout') {
      errorMessage.value = "Nous n'avons pas pu confirmer ce paiement à temps. Si le montant a été débité de votre Mobile Money, ne réessayez pas : il apparaîtra dans votre historique dès sa confirmation, sinon contactez le support."
      step.value = 'error'
    }
    // 'cancelled' (modale fermée pendant le sondage) : ne touche plus à l'état, le composant est en train de disparaître.
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Le paiement a échoué.') : 'Le paiement a échoué.'
    step.value = 'error'
  } finally {
    loading.value = false
  }
}

/** Retour de l'onglet FedaPay : verify-return dit si le paiement est passé (et crédite) — avant, on fermait sans rien vérifier. */
const redirectPending = ref(false)
async function confirmRedirectReturn() {
  const res = checkoutResult.value
  if (!res) return
  loading.value = true
  redirectPending.value = false
  errorMessage.value = ''
  try {
    const v = await paymentApi.verifyReturn(res.transactionId, res.gateway)
    if (v.verified) {
      await wallet.reload()
      step.value = 'done'
    } else {
      redirectPending.value = true
    }
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La vérification a échoué.') : 'La vérification a échoué.'
  } finally {
    loading.value = false
  }
}

function retryRecharge() {
  step.value = 'amount'
  errorMessage.value = ''
  checkoutResult.value = null
}

onUnmounted(() => { cancelled = true })

const title = computed(() => {
  if (mode.value === 'loyer') return step.value === 'done' ? 'Loyer payé' : 'Payer mon loyer'
  return step.value === 'done' ? 'Recharge effectuée' : 'Recharger ma tirelire'
})
</script>

<template>
  <CoreModal :open="open" :title="title" width="460px" :dirty="dirty" @close="close">
    <!-- ===== Loyer : paiement direct depuis la tirelire ===== -->
    <template v-if="mode === 'loyer'">
      <template v-if="step !== 'done'">
        <p v-if="!invoiceToPay" class="m-0 rounded-md border border-dashed border-[var(--border-default)] px-4 py-6 text-center text-[13.5px] text-[var(--text-muted)]">Aucune échéance en attente sur ce bail : votre échéancier est à jour.</p>
        <template v-else>
          <p class="m-0 text-[13.5px] text-[var(--text-muted)]">Échéance du <span class="font-mono">{{ formatDay(invoiceToPay.due_date) }}</span><template v-if="activeLease?.unit?.name"> · {{ activeLease.unit.name }}</template></p>
          <div class="mt-3.5 grid grid-cols-2 gap-3">
            <div class="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
              <p class="m-0 truncate font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ formatFcfaShort(rentAmount) }}</p>
              <p class="mb-0 mt-1.5 text-[11.5px] text-[var(--text-muted)]">À payer</p>
            </div>
            <div class="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
              <p class="m-0 truncate font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ wallet.state.value === 'success' ? formatFcfaShort(wallet.spendable.value) : '…' }}</p>
              <p class="mb-0 mt-1.5 text-[11.5px] text-[var(--text-muted)]">Tirelire disponible</p>
            </div>
          </div>
          <p v-if="wallet.state.value === 'error'" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">
            Solde indisponible. <button type="button" class="font-bold underline" @click="wallet.reload()">Réessayer</button>
          </p>
          <WalletInconsistencyNote compact />
          <div v-if="rentShortfall > 0" class="mt-3 rounded-md border border-warn-border bg-warn-bg px-3.5 py-3 text-[13px] text-warn-fg-deep">
            <p class="m-0 font-bold">Il vous manque <span class="font-mono">{{ formatFcfa(rentShortfall) }}</span> dans votre tirelire.</p>
            <button type="button" class="mt-1.5 font-bold underline" @click="switchToRecharge(rentShortfall)">Recharger ce montant</button>
          </div>
          <p v-else-if="wallet.state.value === 'success'" class="mb-0 mt-3 text-[12.5px] text-[var(--text-muted)]">
            Prélevé sur votre tirelire : il vous restera <span class="font-mono font-bold text-[var(--text-primary)]">{{ formatFcfa(wallet.spendable.value - rentAmount) }}</span> après ce paiement.
          </p>
          <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
        </template>
      </template>

      <div v-else class="py-1 text-center">
        <div class="mx-auto grid h-14 w-14 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-white"><Check class="h-7 w-7" :stroke-width="2.4" /></div>
        <p class="mb-0 mt-4 text-base font-bold"><span class="font-mono">{{ formatFcfa(paidAmount) }}</span> débités de votre tirelire</p>
        <p v-if="remainingInvoices.length" class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
          Il reste {{ remainingInvoices.length }} échéance{{ remainingInvoices.length > 1 ? 's' : '' }} à régler sur ce bail.
        </p>
        <p v-else class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Votre échéancier est à jour. La quittance de ce loyer est disponible.</p>
        <p v-if="docError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ docError }}</p>
      </div>
    </template>

    <!-- ===== Recharge : passerelle réelle ===== -->
    <template v-else>
      <template v-if="step === 'amount'">
        <p v-if="rechargeForRent" class="mb-4 mt-0 rounded-md border border-info-border bg-info-bg px-3.5 py-2.5 text-[13px] text-info-fg-deep">
          Pour payer votre loyer, il manque <span class="font-mono font-bold">{{ formatFcfa(rechargeForRent.missing) }}</span> dans votre tirelire.
        </p>
        <label class="block">
          <span class="mb-[7px] block text-[12.5px] font-bold">Montant à recharger</span>
          <span class="flex items-baseline gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[15px] py-3">
            <input :value="amount" inputmode="numeric" placeholder="0" aria-label="Montant à recharger" class="min-w-0 flex-1 border-0 bg-transparent font-mono text-2xl font-bold outline-none" @input="onAmountInput">
            <span class="font-mono text-sm font-bold text-[var(--text-faint)]">FCFA</span>
          </span>
        </label>
        <div class="mt-2.5 flex gap-2">
          <button v-for="p in RECHARGE_PRESETS" :key="p" type="button" class="flex-1 rounded-pill border bg-white py-2 font-mono text-[12.5px] font-bold transition-colors" :class="amountNum === p ? 'border-green-600 text-green-700' : 'border-[var(--border-default)] hover:border-green-600'" @click="amount = String(p)">{{ formatFcfaShort(p) }}</button>
        </div>
        <!-- La recharge alimente directement la tirelire (RecordTransaction type SAVING côté API, pas une étape séparée). -->
        <p class="mb-0 mt-2.5 text-[12.5px] text-[var(--text-faint)]">Crédité sur votre tirelire dès la confirmation, pour payer un loyer ou une réservation.</p>

        <p class="mb-2 mt-4.5 text-[12.5px] font-bold">Moyen de paiement</p>
        <DataSkeletonCard v-if="gatewaysState === 'loading'" :height="52" :lines="0" />
        <p v-else-if="gatewaysState === 'error'" class="m-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">
          Les moyens de paiement n'ont pas pu être chargés.
          <button type="button" class="ml-1 font-bold underline" @click="loadGateways">Réessayer</button>
        </p>
        <p v-else-if="!gateways.length" class="m-0 rounded-md border border-dashed border-[var(--border-default)] px-3.5 py-3 text-[13px] text-[var(--text-muted)]">Aucun moyen de paiement n'est ouvert pour l'instant. Réessayez plus tard.</p>
        <div v-else class="flex flex-col gap-2">
          <button
            v-for="g in gateways"
            :key="g.id"
            type="button"
            class="flex items-center gap-3 rounded-md border-[1.5px] bg-white p-3.5 text-left"
            :class="selectedGatewayId === g.id ? 'border-green-600' : 'border-[var(--border-default)]'"
            @click="selectedGatewayId = g.id"
          >
            <span class="flex-1 text-[13.5px] font-semibold">{{ g.name }}</span>
            <CoreBadge v-if="g.isTestMode" tone="warn">Test</CoreBadge>
            <span class="grid h-5 w-5 place-items-center rounded-pill border-2" :class="selectedGatewayId === g.id ? 'border-green-600' : 'border-[var(--border-default)]'">
              <span class="h-2.5 w-2.5 rounded-pill" :class="selectedGatewayId === g.id ? 'bg-green-600' : 'bg-transparent'" />
            </span>
          </button>
        </div>
        <label v-if="needsPhone" class="mt-4.5 block">
          <span class="mb-[7px] block text-[12.5px] font-bold">Numéro Mobile Money à débiter</span>
          <input v-model="phone" inputmode="tel" placeholder="01 97 00 00 00" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[15px] font-mono text-[14.5px] outline-none">
          <span class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">La demande de paiement arrive sur ce téléphone : validez-la avec votre code secret.</span>
        </label>
        <p v-if="rechargeError" class="mb-0 mt-3 text-[12.5px] font-semibold text-danger-fg">{{ rechargeError }}</p>
        <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
      </template>

      <div v-else-if="step === 'processing'" class="py-1 text-center">
        <div v-if="checkoutResult?.mode !== 'redirect'" class="mx-auto h-14 w-14 animate-[im-spin_.9s_linear_infinite] rounded-pill border-[3px] border-green-100" style="border-top-color: var(--color-green-600)" />
        <div v-else class="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-info-bg text-info-fg"><ExternalLink class="h-6 w-6" :stroke-width="1.9" /></div>
        <p class="mb-0 mt-4 text-base font-bold">{{ checkoutResult?.mode === 'redirect' ? 'Finalisez le paiement dans l\'onglet ouvert' : 'Confirmez sur votre téléphone' }}</p>
        <p class="mb-0 mt-1.5 font-mono text-[13px] text-[var(--text-muted)]">{{ formatFcfa(amountNum) }}</p>
        <!-- `instructions.fr` est un texte destiné aux développeurs pour le mode redirect (vérifié en live : "Redirigez
             l'utilisateur vers `url`…") — pas une consigne pour l'utilisateur final. On ne l'affiche que hors redirect. -->
        <p v-if="checkoutResult?.mode !== 'redirect'" class="mx-auto mb-0 mt-2.5 max-w-[320px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">{{ checkoutResult?.instructions?.fr }}</p>
        <template v-else>
          <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-[12.5px] leading-[1.6] text-[var(--text-faint)]">Une fois le paiement terminé dans l'autre onglet, revenez ici.</p>
          <p v-if="redirectPending" class="mx-auto mb-0 mt-3 max-w-[340px] rounded-md border border-warn-border bg-warn-bg px-3 py-2.5 text-[12.5px] text-warn-fg-deep">
            FedaPay ne confirme pas encore ce paiement. S'il est terminé, réessayez dans quelques secondes ; sinon, finalisez-le dans l'onglet FedaPay.
          </p>
          <p v-if="errorMessage" class="mx-auto mb-0 mt-3 max-w-[340px] text-[12.5px] font-semibold text-danger-fg">{{ errorMessage }}</p>
        </template>
      </div>

      <div v-else-if="step === 'error'" class="py-1 text-center">
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-danger-bg text-danger-fg"><X class="h-7 w-7" :stroke-width="2.2" /></div>
        <p class="mb-0 mt-4 text-base font-bold">Paiement non confirmé</p>
        <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">{{ errorMessage }}</p>
      </div>

      <div v-else class="py-1 text-center">
        <div class="mx-auto grid h-14 w-14 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-white"><Check class="h-7 w-7" :stroke-width="2.4" /></div>
        <p class="mb-0 mt-4 text-base font-bold"><span class="font-mono">{{ formatFcfa(amountNum) }}</span> crédités sur votre tirelire</p>
        <p class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
          <template v-if="wallet.state.value === 'success'">Tirelire disponible : <span class="font-mono font-bold text-[var(--text-primary)]">{{ formatFcfa(wallet.spendable.value) }}</span>.</template>
          <template v-if="rechargeForRent"> Vous pouvez maintenant régler votre loyer.</template>
        </p>
      </div>
    </template>

    <template #footer>
      <!-- Loyer -->
      <div v-if="mode === 'loyer' && step !== 'done'" class="flex gap-2.5">
        <CoreButton tone="secondary" full-width @click="close">Annuler</CoreButton>
        <CoreButton v-if="invoiceToPay" full-width :disabled="loading || rentShortfall > 0 || wallet.state.value !== 'success'" @click="submitPayRent">{{ loading ? 'Paiement…' : `Payer ${formatFcfaShort(rentAmount)}` }}</CoreButton>
      </div>
      <div v-else-if="mode === 'loyer'" class="flex flex-wrap gap-2.5">
        <template v-if="nextInvoice">
          <CoreButton tone="secondary" class="flex-1" @click="close">Plus tard</CoreButton>
          <CoreButton class="flex-1" @click="payNext">Payer la suivante · {{ formatFcfaShort(Number(nextInvoice.amount)) }}</CoreButton>
        </template>
        <template v-else>
          <CoreButton tone="secondary" class="flex-1" :disabled="doc.loadingKey.value === paidInvoiceId" @click="openReceipt">{{ doc.loadingKey.value === paidInvoiceId ? 'Préparation…' : 'Ouvrir la quittance' }}</CoreButton>
          <CoreButton class="flex-1" @click="close">Terminé</CoreButton>
        </template>
      </div>

      <!-- Recharge -->
      <div v-else-if="step === 'amount'" class="flex gap-2.5">
        <CoreButton tone="secondary" full-width @click="rechargeForRent ? backToRent() : close()">{{ rechargeForRent ? 'Retour au loyer' : 'Annuler' }}</CoreButton>
        <CoreButton full-width :disabled="!!rechargeError || !amountNum || !selectedGatewayId" @click="submitRecharge">{{ amountNum ? `Recharger ${formatFcfaShort(amountNum)}` : 'Recharger' }}</CoreButton>
      </div>
      <CoreButton v-else-if="step === 'processing' && checkoutResult?.mode === 'redirect'" full-width :disabled="loading" @click="confirmRedirectReturn">{{ loading ? 'Vérification…' : "J'ai terminé le paiement" }}</CoreButton>
      <p v-else-if="step === 'processing'" class="m-0 text-center text-[12.5px] text-[var(--text-faint)]">Gardez cette fenêtre ouverte jusqu'à la confirmation.</p>
      <div v-else-if="step === 'error'" class="flex gap-2.5">
        <CoreButton tone="secondary" full-width @click="close">Fermer</CoreButton>
        <CoreButton v-if="checkoutResult?.mode === 'widget' || !checkoutResult" full-width @click="retryRecharge">Choisir à nouveau</CoreButton>
      </div>
      <div v-else class="flex gap-2.5">
        <template v-if="rechargeForRent">
          <CoreButton tone="secondary" full-width @click="close">Plus tard</CoreButton>
          <CoreButton full-width @click="backToRent">Payer mon loyer maintenant</CoreButton>
        </template>
        <CoreButton v-else full-width @click="close">Terminé</CoreButton>
      </div>
    </template>
  </CoreModal>
</template>
