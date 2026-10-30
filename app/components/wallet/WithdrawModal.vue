<script setup lang="ts">
import { Check, Info } from '@lucide/vue'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import type { WithdrawalMethod } from '~/types/wallet'
import { normalizeBeninPhone, validateWithdrawal, withdrawalMethodLabel, WITHDRAW_MIN } from '~/utils/wallet'

/**
 * Retrait Mobile Money, commun aux espaces locataire, pro et artisan (Lot 55) —
 * avant : deux copies (pro, artisan), aucune côté locataire alors que le
 * wallet se disait « retirable ». Contrôles faits ici faute de l'être par
 * l'API : numéro (« abc » accepté, #84) et demande déjà en attente, affichée
 * avant le formulaire plutôt qu'en erreur après coup.
 *
 * Le retrait est débité DÈS LA DEMANDE (correctif API #83, `withdrawal.service.ts`) :
 * le total baisse aussitôt et la tirelire est plafonnée au nouveau total ; l'annulation
 * ou le refus recréditent le total. D'où l'étape « Vérifier » avant l'envoi.
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const wallet = useTenantWallet()
const walletApi = useWalletApi()
const withdrawals = useWithdrawals()
const currentUser = useAuthUser()

const step = ref<'form' | 'review' | 'done'>('form')
const amount = ref('')
const phone = ref('')
const operator = ref<string>('MTN_MOMO')
const loading = ref(false)
const errorMessage = ref('')

watch(() => props.open, v => {
  if (!v) return
  step.value = 'form'
  amount.value = ''
  phone.value = currentUser.value?.phone_number ?? ''
  operator.value = 'MTN_MOMO'
  errorMessage.value = ''
  wallet.reload()
  withdrawals.load()
})

/** Le total peut être négatif (#82) : rien n'est alors retirable. */
const available = computed(() => Math.max(0, wallet.balanceTotal.value))
const amountNum = computed(() => Number(amount.value.replace(/\D/g, '')) || 0)
function onAmountInput(e: Event) {
  amount.value = (e.target as HTMLInputElement).value.replace(/\D/g, '')
}

const validation = computed(() => validateWithdrawal({ amount: amountNum.value, phone: phone.value, balance: available.value, pending: null }))
/** Message affiché sous le formulaire : seulement une fois le montant saisi, pour ne pas crier avant la frappe. */
const shownError = computed(() => (amount.value ? validation.value : null))
const ready = computed(() => wallet.state.value === 'success' && withdrawals.state.value !== 'loading')

/** Effet sur la tirelire : l'API la plafonne au nouveau total (min(tirelire, total − montant)). */
const savingsAfter = computed(() => Math.max(0, Math.min(wallet.balanceSavings.value, available.value - amountNum.value)))
const savingsDrop = computed(() => wallet.balanceSavings.value - savingsAfter.value)

const OPERATORS = [
  { value: 'MTN_MOMO', label: 'MTN' },
  { value: 'MOOV_MONEY', label: 'Moov' }
]
const operatorName = computed(() => OPERATORS.find(o => o.value === operator.value)?.label ?? operator.value)
const normalizedPhone = computed(() => normalizeBeninPhone(phone.value))

function close() {
  emit('close')
}
async function submit() {
  if (validation.value || withdrawals.pending.value) return
  const normalized = normalizedPhone.value
  if (!normalized) return
  loading.value = true
  errorMessage.value = ''
  try {
    await walletApi.requestWithdrawal(amountNum.value, normalized, operator.value as WithdrawalMethod)
    await Promise.allSettled([wallet.reload(), withdrawals.load()])
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La demande a échoué.') : 'La demande a échoué.'
    step.value = 'form'
    // Une demande a pu être créée ailleurs entre-temps : la liste le dira.
    withdrawals.load()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <CoreModal :open="open" :title="step === 'done' ? 'Demande enregistrée' : step === 'review' ? 'Vérifier le retrait' : 'Retirer des fonds'" width="460px" :dirty="!!amount && step !== 'done'" @close="close">
    <template v-if="step !== 'done'">
      <DataSkeletonCard v-if="!ready && wallet.state.value !== 'error'" :height="120" :lines="1" />
      <p v-else-if="wallet.state.value === 'error'" class="m-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">
        Votre solde n'a pas pu être chargé.
        <button type="button" class="ml-1 font-bold underline" @click="wallet.reload()">Réessayer</button>
      </p>

      <!-- Une demande en attente bloque toute nouvelle demande : dit tout de suite, pas après la saisie. -->
      <div v-else-if="withdrawals.pending.value" class="rounded-md border border-info-border bg-info-bg p-4 text-[13px] leading-[1.55] text-info-fg-deep">
        <p class="m-0 font-bold">Un retrait est déjà en attente</p>
        <p class="mb-0 mt-1.5">
          <span class="font-mono">{{ formatFcfa(Number(withdrawals.pending.value.amount)) }}</span> vers {{ withdrawalMethodLabel(withdrawals.pending.value.method) }} <span class="font-mono">{{ withdrawals.pending.value.phone_number }}</span>,
          demandé le {{ new Date(withdrawals.pending.value.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) }}.
          Une seule demande à la fois : vous pourrez en faire une nouvelle dès qu'elle sera traitée, ou après l'avoir annulée.
        </p>
      </div>

      <template v-else-if="step === 'form'">
        <div class="mb-4.5 flex items-start gap-2.5 rounded-md border border-info-border bg-info-bg px-3.5 py-3">
          <Info class="mt-px h-4 w-4 flex-none text-info-fg" :stroke-width="1.9" />
          <p class="m-0 text-[12.5px] leading-[1.5] text-info-fg-deep">
            Retirable : <strong class="font-mono">{{ formatFcfa(available) }}</strong> · minimum <span class="font-mono">{{ WITHDRAW_MIN }}</span> FCFA. Un administrateur Immo valide chaque demande avant le virement.
          </p>
        </div>

        <div class="mb-[7px] flex items-center justify-between">
          <span class="text-[12.5px] font-bold">Montant</span>
          <button v-if="available >= WITHDRAW_MIN" type="button" class="text-[12.5px] font-bold text-green-700" @click="amount = String(Math.floor(available))">Tout retirer</button>
        </div>
        <div class="flex items-baseline gap-2 rounded-md border bg-[var(--surface-input)] px-[15px] py-3" :class="shownError && amountNum ? 'border-danger-border' : 'border-[var(--border-default)]'">
          <input :value="amount" inputmode="numeric" placeholder="0" aria-label="Montant à retirer" class="min-w-0 flex-1 border-0 bg-transparent font-mono text-2xl font-bold outline-none" @input="onAmountInput">
          <span class="font-mono text-sm font-bold text-[var(--text-faint)]">FCFA</span>
        </div>

        <label class="mt-4.5 block">
          <span class="mb-[7px] block text-[12.5px] font-bold">Numéro Mobile Money</span>
          <input v-model="phone" inputmode="tel" placeholder="01 97 00 00 00" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[15px] font-mono text-[14.5px] outline-none">
        </label>

        <p class="mb-[7px] mt-4.5 text-[12.5px] font-bold">Opérateur</p>
        <FormsSegmentedControl v-model="operator" :options="OPERATORS" size="sm" />

        <p class="mb-0 mt-3.5 text-[12.5px] leading-[1.5] text-[var(--text-faint)]">Le montant est retiré de votre solde dès la demande. Si vous l'annulez ou si Immo la refuse, il est recrédité sur votre solde.</p>
        <p v-if="shownError" class="mb-0 mt-2.5 text-[12.5px] font-semibold text-danger-fg">{{ shownError }}</p>
        <p v-if="errorMessage" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
      </template>

      <!-- Vérifier : tout ce qui part, en gros, avant l'envoi. -->
      <template v-else>
        <div class="rounded-lg border border-[var(--border-subtle)] bg-white p-4.5">
          <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Montant</p>
          <p class="mb-0 mt-1 font-mono text-[28px] font-bold tracking-[-.02em] text-green-900">{{ formatFcfa(amountNum) }}</p>
          <div class="mt-3.5 grid grid-cols-2 gap-3 border-t border-sand-200 pt-3.5">
            <div>
              <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Opérateur</p>
              <p class="mb-0 mt-1 text-base font-bold">{{ operatorName }}</p>
            </div>
            <div>
              <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Numéro</p>
              <p class="mb-0 mt-1 font-mono text-base font-bold">{{ normalizedPhone }}</p>
            </div>
          </div>
        </div>
        <p class="mb-0 mt-3 text-[13px] leading-[1.55] text-[var(--text-muted)]">
          Votre solde passera de <span class="font-mono font-bold text-[var(--text-primary)]">{{ formatFcfa(available) }}</span> à <span class="font-mono font-bold text-[var(--text-primary)]">{{ formatFcfa(available - amountNum) }}</span> dès l'envoi.
          <template v-if="savingsDrop > 0"> Votre tirelire baissera aussi de <span class="font-mono font-bold text-[var(--text-primary)]">{{ formatFcfa(savingsDrop) }}</span> (elle ne peut pas dépasser le solde).</template>
        </p>
        <p class="mb-0 mt-2 text-[12.5px] text-[var(--text-faint)]">Vérifiez le numéro : un virement vers un mauvais numéro ne peut pas être récupéré par Immo.</p>
        <p v-if="errorMessage" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
      </template>
    </template>

    <div v-else class="py-1 text-center">
      <div class="mx-auto grid h-14 w-14 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-white"><Check class="h-7 w-7" :stroke-width="2.4" /></div>
      <p class="mb-0 mt-4 text-base font-bold"><span class="font-mono">{{ formatFcfa(amountNum) }}</span> vers {{ operatorName }} <span class="font-mono">{{ normalizedPhone }}</span></p>
      <p class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Le montant a été retiré de votre solde et attend la validation d'Immo. Suivez la demande dans « Demandes de retrait » : vous pouvez l'annuler tant qu'elle est en attente.
      </p>
    </div>

    <template #footer>
      <div v-if="step === 'form' && ready && !withdrawals.pending.value" class="flex gap-2.5">
        <CoreButton tone="secondary" full-width @click="close">Annuler</CoreButton>
        <CoreButton full-width :disabled="!!validation" @click="step = 'review'">Vérifier</CoreButton>
      </div>
      <div v-else-if="step === 'review'" class="flex gap-2.5">
        <CoreButton tone="secondary" full-width :disabled="loading" @click="step = 'form'">Modifier</CoreButton>
        <CoreButton full-width :disabled="loading" @click="submit">{{ loading ? 'Envoi…' : 'Confirmer le retrait' }}</CoreButton>
      </div>
      <CoreButton v-else-if="step === 'done'" full-width @click="close">Terminé</CoreButton>
      <CoreButton v-else tone="secondary" full-width @click="close">Fermer</CoreButton>
    </template>
  </CoreModal>
</template>
