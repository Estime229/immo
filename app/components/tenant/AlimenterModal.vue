<script setup lang="ts">
import { Check } from '@lucide/vue'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'

/**
 * Alimentation volontaire d'un tampon du bail (avance ou loyers prépayés), prélevée sur la tirelire.
 * L'API refuse tout montant au-delà du reste à atteindre (400) : on le montre et on plafonne avant l'envoi,
 * puis on fait vérifier le débit avant de l'envoyer.
 */
const leaseModal = useLeaseModal()
const leaseFlash = useLeaseFlash()
const { activeLease } = useTenantLeases()
const leasesApi = useLeasesApi()
const wallet = useTenantWallet()
const { openPay } = usePaymentModal()

const kind = computed<'advance' | 'prepaid'>(() => (leaseModal.value === 'alimenter-prepaye' ? 'prepaid' : 'advance'))
const open = computed(() => leaseModal.value === 'alimenter-avance' || leaseModal.value === 'alimenter-prepaye')
const bufferName = computed(() => (kind.value === 'advance' ? "tampon d'avance" : 'tampon de loyers prépayés'))

const step = ref<'form' | 'confirm' | 'done'>('form')
const amount = ref('')
const loading = ref(false)
const errorMessage = ref('')

/* ---- État du tampon, relu à chaque ouverture ---- */
const buffer = ref<{ balance: number; target: number } | null>(null)
const bufferState = ref<'loading' | 'error' | 'ready'>('loading')
async function loadBuffer() {
  const id = activeLease.value?.id
  if (!id) return
  bufferState.value = 'loading'
  try {
    if (kind.value === 'advance') {
      const b = await leasesApi.fetchAdvanceBuffer(id)
      buffer.value = { balance: Number(b.advance_balance), target: Number(b.advance_target) }
    } else {
      const b = await leasesApi.fetchPrepaidBuffer(id)
      buffer.value = { balance: Number(b.prepaid_balance), target: Number(b.prepaid_target) }
    }
    bufferState.value = 'ready'
  } catch {
    bufferState.value = 'error'
  }
}

watch(open, v => {
  if (!v) return
  step.value = 'form'
  errorMessage.value = ''
  amount.value = ''
  buffer.value = null
  loadBuffer()
  wallet.reload()
})

/** Reste à atteindre : plafond absolu de l'API. */
const missing = computed(() => (buffer.value ? Math.max(0, buffer.value.target - buffer.value.balance) : 0))
const available = computed(() => (wallet.state.value === 'success' ? wallet.spendable.value : 0))
const amountNum = computed(() => Number(amount.value) || 0)

function onAmountInput(e: Event) {
  amount.value = (e.target as HTMLInputElement).value.replace(/\D/g, '')
}

const presets = computed(() => {
  if (!activeLease.value || !missing.value) return []
  const rent = Number(activeLease.value.signed_rent)
  const values = [Math.round(rent / 2), rent].filter(v => v > 0 && v < missing.value)
  return [...new Set([...values, missing.value])].map(v => ({ value: v, label: v === missing.value ? `Compléter · ${formatFcfaShort(v)}` : formatFcfaShort(v) }))
})

const validation = computed(() => {
  if (!amountNum.value) return null
  if (amountNum.value > missing.value) return `Au maximum ${formatFcfa(missing.value)} : c'est ce qu'il manque pour atteindre le montant prévu au bail.`
  if (wallet.state.value === 'success' && amountNum.value > available.value) return `Votre tirelire ne contient que ${formatFcfa(available.value)}.`
  return null
})
const shortOfSavings = computed(() => wallet.state.value === 'success' && amountNum.value > available.value && amountNum.value <= missing.value)
const canReview = computed(() => bufferState.value === 'ready' && wallet.state.value === 'success' && amountNum.value > 0 && !validation.value)

function close() {
  leaseModal.value = ''
}
/** Une seule modale à la fois : la recharge remplace celle-ci ; « Alimenter » reste à portée sur l'écran du bail. */
function rechargeFirst() {
  leaseModal.value = ''
  openPay('recharge')
}

async function submit() {
  const lease = activeLease.value
  if (!lease || !canReview.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    if (kind.value === 'advance') await leasesApi.topUpAdvanceBuffer(lease.id, amountNum.value)
    else await leasesApi.topUpPrepaidBuffer(lease.id, amountNum.value)
    await Promise.allSettled([loadBuffer(), wallet.reload()])
    leaseFlash.value = { leaseId: lease.id, text: `${formatFcfa(amountNum.value)} versés sur votre ${bufferName.value}, prélevés sur votre tirelire.` }
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'alimentation a échoué.") : "L'alimentation a échoué."
    step.value = 'form'
    loadBuffer()
  } finally {
    loading.value = false
  }
}

function pct(balance: number, target: number) {
  return target > 0 ? `${Math.min(100, Math.round((balance / target) * 100))}%` : '0%'
}
</script>

<template>
  <CoreModal :open="open" :title="kind === 'advance' ? 'Alimenter l\'avance sur loyer' : 'Alimenter les loyers prépayés'" width="460px" :dirty="!!amount && step !== 'done'" @close="close">
    <template v-if="step !== 'done'">
      <p class="m-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        {{ kind === 'advance' ? 'L\'avance couvre automatiquement une échéance manquée.' : 'Les loyers prépayés sont consommés en priorité sur vos prochaines échéances.' }}
        Le montant est prélevé sur votre tirelire.
      </p>

      <DataSkeletonCard v-if="bufferState === 'loading'" class="mt-4" :height="96" :lines="0" />
      <p v-else-if="bufferState === 'error'" class="mb-0 mt-4 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">
        L'état du tampon n'a pas pu être chargé.
        <button type="button" class="ml-1 font-bold underline" @click="loadBuffer">Réessayer</button>
      </p>
      <template v-else-if="buffer">
        <div class="mt-4 rounded-lg border border-[var(--border-subtle)] bg-white p-4">
          <div class="flex items-baseline justify-between gap-3">
            <p class="m-0 text-[12.5px] font-bold text-[var(--text-muted)]">Déjà versé</p>
            <p class="m-0 font-mono text-sm font-bold">{{ formatFcfaShort(buffer.balance) }} / {{ formatFcfaShort(buffer.target) }}</p>
          </div>
          <div class="mt-2.5 h-2 overflow-hidden rounded-pill bg-sand-200">
            <div class="h-full rounded-pill bg-green-600" :style="{ width: pct(buffer.balance, buffer.target) }" />
          </div>
          <div class="mt-3.5 grid grid-cols-2 gap-3">
            <div>
              <p class="m-0 font-mono text-lg font-bold text-green-900">{{ formatFcfaShort(missing) }}</p>
              <p class="mb-0 mt-0.5 text-[11.5px] text-[var(--text-muted)]">Il manque</p>
            </div>
            <div>
              <p class="m-0 font-mono text-lg font-bold text-green-900">{{ wallet.state.value === 'success' ? formatFcfaShort(available) : '…' }}</p>
              <p class="mb-0 mt-0.5 text-[11.5px] text-[var(--text-muted)]">Tirelire disponible</p>
            </div>
          </div>
        </div>

        <p v-if="!missing" class="mb-0 mt-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">Ce tampon est complet : rien à verser.</p>
        <template v-else-if="step === 'form'">
          <label class="mt-4 block">
            <span class="mb-[7px] block text-[12.5px] font-bold">Montant à verser</span>
            <span class="flex items-baseline gap-2 rounded-md border bg-[var(--surface-input)] px-[15px] py-3" :class="validation ? 'border-danger-border' : 'border-[var(--border-default)]'">
              <input :value="amount" inputmode="numeric" placeholder="0" aria-label="Montant à verser" class="min-w-0 flex-1 border-0 bg-transparent font-mono text-2xl font-bold outline-none" @input="onAmountInput">
              <span class="font-mono text-sm font-bold text-[var(--text-faint)]">FCFA</span>
            </span>
          </label>
          <div v-if="presets.length" class="mt-2.5 flex flex-wrap gap-2">
            <button v-for="p in presets" :key="p.value" type="button" class="flex-1 whitespace-nowrap rounded-pill border bg-white px-3 py-2 font-mono text-[12.5px] font-bold" :class="amountNum === p.value ? 'border-green-600 text-green-700' : 'border-[var(--border-default)]'" @click="amount = String(p.value)">{{ p.label }}</button>
          </div>
          <p v-if="validation" class="mb-0 mt-2.5 text-[12.5px] font-semibold text-danger-fg">{{ validation }}</p>
          <button v-if="shortOfSavings" type="button" class="mt-1.5 text-[12.5px] font-bold text-green-700 underline" @click="rechargeFirst">Recharger ma tirelire</button>
        </template>
        <CoreInlineConfirm
          v-else
          class="mt-4"
          :message="`Débiter ${formatFcfa(amountNum)} de votre tirelire pour votre ${bufferName} ? Il vous restera ${formatFcfa(available - amountNum)}.`"
          confirm-label="Verser"
          :loading="loading"
          @confirm="submit"
          @cancel="step = 'form'"
        />
      </template>
      <WalletInconsistencyNote compact />
      <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
    </template>

    <div v-else class="py-1 text-center">
      <div class="mx-auto grid h-14 w-14 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-white"><Check class="h-7 w-7" :stroke-width="2.4" /></div>
      <p class="mb-0 mt-4 text-base font-bold"><span class="font-mono">{{ formatFcfa(amountNum) }}</span> versés</p>
      <p class="mx-auto mb-0 mt-2 max-w-[320px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        <template v-if="buffer">Votre {{ bufferName }} est à <span class="font-mono font-bold text-[var(--text-primary)]">{{ formatFcfaShort(buffer.balance) }} / {{ formatFcfaShort(buffer.target) }}</span>.</template>
        <template v-if="wallet.state.value === 'success'"> Tirelire restante : <span class="font-mono font-bold text-[var(--text-primary)]">{{ formatFcfa(available) }}</span>.</template>
      </p>
    </div>

    <template #footer>
      <div v-if="step === 'form'" class="flex gap-2.5">
        <CoreButton tone="secondary" full-width @click="close">Annuler</CoreButton>
        <CoreButton full-width :disabled="!canReview" @click="step = 'confirm'">Vérifier</CoreButton>
      </div>
      <CoreButton v-else-if="step === 'done'" full-width @click="close">Terminé</CoreButton>
      <p v-else class="m-0 text-center text-[12.5px] text-[var(--text-faint)]">Confirmez le versement ci-dessus.</p>
    </template>
  </CoreModal>
</template>
