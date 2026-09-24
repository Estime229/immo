<script setup lang="ts">
import type { CheckoutResult, PaymentGateway } from '~/types/wallet'
import { pollTransactionStatus } from '~/utils/paymentPolling'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const { open, mode, closePay } = usePaymentModal()
const { activeLease, reload: reloadLeases } = useTenantLeases()
const wallet = useTenantWallet()
const walletApi = useWalletApi()
const paymentApi = usePaymentApi()

type Step = 'amount' | 'gateway' | 'processing' | 'done' | 'error'
const step = ref<Step>('amount')
const amount = ref('')
const errorMessage = ref('')
const loading = ref(false)
let cancelled = false

const invoiceToPay = computed(() => activeLease.value?.invoices?.find(i => i.status !== 'paid') ?? null)

/* ---- Recharge : passerelles ---- */
const gateways = ref<PaymentGateway[]>([])
const gatewaysLoading = ref(false)
const selectedGatewayId = ref('')
async function loadGateways() {
  gatewaysLoading.value = true
  try {
    gateways.value = await paymentApi.fetchGateways()
    selectedGatewayId.value = gateways.value[0]?.id ?? ''
  } catch {
    gateways.value = []
  } finally {
    gatewaysLoading.value = false
  }
}

watch(open, v => {
  cancelled = false
  if (!v) return
  errorMessage.value = ''
  if (mode.value === 'loyer') {
    step.value = 'amount'
    amount.value = invoiceToPay.value ? String(Math.round(Number(invoiceToPay.value.amount))) : ''
  } else {
    step.value = 'amount'
    amount.value = '50000'
    loadGateways()
  }
})

function onAmountInput(e: Event) {
  const digits = (e.target as HTMLInputElement).value.replace(/\D/g, '')
  amount.value = digits
}
const amountNum = computed(() => Number(amount.value) || 0)
const amountFmt = computed(() => formatFcfa(amountNum.value))

const RECHARGE_PRESETS = [25000, 50000, 100000]

function close() {
  cancelled = true
  closePay()
}

/* ---- Payer un loyer : débit direct de la tirelire, pas de passerelle ---- */
async function submitPayRent() {
  if (!activeLease.value || !invoiceToPay.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    await walletApi.payRent(invoiceToPay.value.id, activeLease.value.id)
    await Promise.all([reloadLeases(), wallet.reload()])
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Le paiement a échoué.') : 'Le paiement a échoué.'
    step.value = 'error'
  } finally {
    loading.value = false
  }
}

/* ---- Recharger : passerelle réelle, sondage borné, jamais de lecture de `gateway` pour piloter l'UI ---- */
const checkoutResult = ref<CheckoutResult | null>(null)

async function submitRecharge() {
  if (!amountNum.value || !selectedGatewayId.value) return
  loading.value = true
  errorMessage.value = ''
  step.value = 'processing'
  try {
    const res = await paymentApi.checkout({
      gatewayId: selectedGatewayId.value,
      amount: amountNum.value,
      description: 'Recharge wallet Immo'
    })
    checkoutResult.value = res

    if (res.mode === 'widget') {
      // Nécessite le SDK Kkiapay (script tiers) — non chargé dans ce lot, voir INTEGRATION-TESTS.md.
      errorMessage.value = "Ce moyen de paiement n'est pas encore disponible ici. Choisissez une autre passerelle."
      step.value = 'error'
      return
    }

    if (res.mode === 'redirect') {
      // Vérifié en live (FedaPay, sandbox) : le `transactionId` renvoyé ici est l'identifiant
      // de la passerelle externe (ex. "509458"), pas notre id interne — /payment/transactions/:id/status
      // répond 404 dessus ("id fourni n'est pas un UUID valide"). Cet endpoint attend l'id interne, que
      // checkout() ne renvoie pas pour ce mode. On ouvre l'onglet et on laisse l'utilisateur confirmer
      // manuellement au retour, plutôt que de sonder un id qu'on sait invalide pour cette route.
      window.open(res.url, '_blank')
      loading.value = false
      return
    }

    // ussd_push et mock : le `transactionId` renvoyé correspond à notre id interne, le sondage fonctionne.
    const poll = await pollTransactionStatus(res.transactionId, paymentApi.fetchTransactionStatus, { isCancelled: () => cancelled })
    if (poll.outcome === 'completed') {
      await wallet.reload()
      step.value = 'done'
    } else if (poll.outcome === 'failed') {
      errorMessage.value = 'Le paiement a échoué ou a été annulé.'
      step.value = 'error'
    } else if (poll.outcome === 'timeout') {
      errorMessage.value = "Nous n'avons pas pu confirmer ce paiement à temps. Si le montant a été débité de votre Mobile Money, ne réessayez pas — contactez le support."
      step.value = 'error'
    }
    // 'cancelled' (modale fermée pendant le sondage) : ne touche plus à l'état, le composant est en train de disparaître.
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Le paiement a échoué.') : 'Le paiement a échoué.'
    step.value = 'error'
  } finally {
    loading.value = false
  }
}

/** Retour manuel de l'onglet FedaPay : on ne peut pas sonder ce paiement (voir submitRecharge), donc on recharge simplement le wallet et on laisse l'utilisateur constater le résultat réel. */
async function confirmRedirectReturn() {
  loading.value = true
  await wallet.reload()
  loading.value = false
  close()
}

onUnmounted(() => { cancelled = true })
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[440px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-5">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">{{ mode === 'loyer' ? 'Payer mon loyer' : 'Recharger le wallet' }}</h3>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" @click="close">✕</button>
        </div>

        <div class="p-6">
          <!-- ===== Loyer : paiement direct depuis la tirelire ===== -->
          <template v-if="mode === 'loyer'">
            <template v-if="step === 'amount'">
              <p v-if="!invoiceToPay" class="mb-0 mt-0 text-[13.5px] text-[var(--text-muted)]">Aucune échéance en attente sur ce bail.</p>
              <template v-else>
                <p class="mb-2 mt-0 text-[13px] font-bold text-[var(--text-muted)]">Montant à payer</p>
                <div class="flex items-baseline gap-2 rounded-md border border-[var(--border-default)] bg-white px-[18px] py-4">
                  <span class="font-mono text-2xl font-bold">{{ formatFcfaShort(Number(invoiceToPay.amount)) }}</span>
                </div>
                <p class="mb-0 mt-2.5 text-[12.5px] text-[var(--text-muted)]">Prélevé directement sur votre tirelire ({{ formatFcfaShort(wallet.balanceSavings.value) }} disponibles).</p>
                <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
                <CoreButton size="lg" full-width class="mt-5" :disabled="loading" @click="submitPayRent">{{ loading ? 'Paiement…' : 'Payer' }}</CoreButton>
              </template>
            </template>
            <template v-else-if="step === 'error'">
              <div class="px-1 py-1 text-center">
                <div class="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-danger-bg text-2xl text-danger-fg">✕</div>
                <p class="mb-0 mt-4 text-base font-bold">Paiement impossible</p>
                <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">{{ errorMessage }}</p>
                <CoreButton size="lg" full-width class="mt-5" @click="close">Fermer</CoreButton>
              </div>
            </template>
            <template v-else>
              <div class="px-1 pb-1 pt-2.5 text-center">
                <div class="mx-auto grid h-16 w-16 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[30px] text-white">✓</div>
                <p class="mb-0 mt-5 text-lg font-bold tracking-[-.015em]">Loyer payé</p>
                <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">Votre échéancier est à jour.</p>
                <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
              </div>
            </template>
          </template>

          <!-- ===== Recharge : passerelle réelle ===== -->
          <template v-else>
            <template v-if="step === 'amount'">
              <p class="mb-2 mt-0 text-[13px] font-bold text-[var(--text-muted)]">Montant à recharger</p>
              <div class="flex items-baseline gap-2 rounded-md border border-[var(--border-default)] bg-white px-[18px] py-4">
                <input :value="amount" inputmode="numeric" class="min-w-0 flex-1 border-0 bg-transparent font-mono text-2xl font-bold outline-none" @input="onAmountInput">
                <span class="font-mono text-base font-bold text-[var(--text-faint)]">FCFA</span>
              </div>
              <div class="mt-3 flex gap-2">
                <button v-for="p in RECHARGE_PRESETS" :key="p" type="button" class="flex-1 rounded-sm border border-[var(--border-default)] bg-white py-2.5 font-mono text-[13px] font-bold transition-colors hover:border-green-600 hover:text-green-700" @click="amount = String(p)">{{ p / 1000 }}k</button>
              </div>

              <p class="mb-2 mt-4.5 text-[13px] font-bold text-[var(--text-muted)]">Passerelle</p>
              <div v-if="gatewaysLoading" class="text-[13px] text-[var(--text-muted)]">Chargement…</div>
              <div v-else-if="!gateways.length" class="text-[13px] text-[var(--text-muted)]">Aucune passerelle disponible pour l'instant.</div>
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
              <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
              <CoreButton size="lg" full-width class="mt-5" :disabled="!amountNum || !selectedGatewayId" @click="submitRecharge">Continuer</CoreButton>
            </template>

            <template v-else-if="step === 'processing'">
              <div class="px-1 pb-1 pt-1.5 text-center">
                <div v-if="checkoutResult?.mode !== 'redirect'" class="mx-auto h-14 w-14 animate-[im-spin_.9s_linear_infinite] rounded-pill border-[3px] border-green-100" style="border-top-color: var(--color-green-600)" />
                <div v-else class="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-info-bg text-2xl">↗</div>
                <p class="mb-0 mt-5 text-base font-bold">{{ checkoutResult?.mode === 'redirect' ? 'Finalisez le paiement dans l\'onglet ouvert' : 'Confirmez sur votre téléphone' }}</p>
                <!-- `instructions.fr` est un texte destiné aux développeurs pour le mode redirect (vérifié en live : "Redirigez
                     l'utilisateur vers `url`…") — pas une consigne pour l'utilisateur final. On ne l'affiche que hors redirect. -->
                <p v-if="checkoutResult?.mode !== 'redirect'" class="mx-auto mb-0 mt-2.5 max-w-[320px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">{{ checkoutResult?.instructions?.fr }}</p>
                <template v-if="checkoutResult?.mode === 'redirect'">
                  <p class="mx-auto mb-0 mt-3 max-w-[320px] text-[12.5px] leading-[1.6] text-[var(--text-faint)]">Une fois le paiement terminé dans l'autre onglet, revenez ici.</p>
                  <CoreButton size="lg" full-width class="mt-5" :disabled="loading" @click="confirmRedirectReturn">{{ loading ? 'Vérification…' : "J'ai terminé le paiement" }}</CoreButton>
                </template>
              </div>
            </template>

            <template v-else-if="step === 'error'">
              <div class="px-1 py-1 text-center">
                <div class="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-danger-bg text-2xl text-danger-fg">✕</div>
                <p class="mb-0 mt-4 text-base font-bold">Paiement non confirmé</p>
                <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">{{ errorMessage }}</p>
                <CoreButton size="lg" full-width class="mt-5" @click="close">Fermer</CoreButton>
              </div>
            </template>

            <template v-else>
              <div class="px-1 pb-1 pt-2.5 text-center">
                <div class="mx-auto grid h-16 w-16 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[30px] text-white">✓</div>
                <p class="mb-0 mt-5 text-lg font-bold tracking-[-.015em]">Recharge effectuée</p>
                <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">Votre solde a été crédité.</p>
                <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
              </div>
            </template>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
