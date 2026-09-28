<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { normalizeBeninPhone, validateWithdrawal, withdrawalMethodLabel, WITHDRAW_MIN } from '~/utils/wallet'

/**
 * Retrait Mobile Money, commun aux espaces locataire, pro et artisan (Lot 55) —
 * avant : deux copies (pro, artisan), aucune côté locataire alors que le
 * wallet se disait « retirable ». Contrôles faits ici faute de l'être par
 * l'API : numéro (« abc » accepté, #84) et demande déjà en attente, affichée
 * avant le formulaire plutôt qu'en erreur après coup.
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const wallet = useTenantWallet()
const walletApi = useWalletApi()
const withdrawals = useWithdrawals()
const currentUser = useAuthUser()

const step = ref<'form' | 'done'>('form')
const amount = ref('')
const phone = ref('')
const operator = ref<'MTN_MOMO' | 'MOOV_MONEY'>('MTN_MOMO')
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

const OPERATORS = [
  { id: 'MTN_MOMO' as const, name: 'MTN' },
  { id: 'MOOV_MONEY' as const, name: 'Moov' }
]

function close() {
  emit('close')
}
async function submit() {
  if (validation.value || withdrawals.pending.value) return
  const normalized = normalizeBeninPhone(phone.value)
  if (!normalized) return
  loading.value = true
  errorMessage.value = ''
  try {
    await walletApi.requestWithdrawal(amountNum.value, normalized, operator.value)
    await Promise.all([wallet.reload(), withdrawals.load()])
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La demande a échoué.') : 'La demande a échoué.'
    // Une demande a pu être créée ailleurs entre-temps : la liste le dira.
    withdrawals.load()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[460px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel animate-[im-rise_.28s_var(--ease-standard)_both]" role="dialog" aria-label="Retirer des fonds" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4.5">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">{{ step === 'form' ? 'Retirer des fonds' : 'Demande enregistrée' }}</h3>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" aria-label="Fermer" @click="close">✕</button>
        </div>

        <div class="p-6">
          <template v-if="step === 'form'">
            <p v-if="!ready" class="m-0 text-[13.5px] text-[var(--text-muted)]">Chargement de votre solde…</p>

            <!-- Une demande en attente bloque toute nouvelle demande : dit tout de suite, pas après la saisie. -->
            <div v-else-if="withdrawals.pending.value" class="rounded-md border border-info-border bg-info-bg p-4 text-[13px] leading-[1.55] text-info-fg-deep">
              <p class="m-0 font-bold">Un retrait est déjà en attente</p>
              <p class="mb-0 mt-1.5">
                {{ formatFcfa(Number(withdrawals.pending.value.amount)) }} vers {{ withdrawalMethodLabel(withdrawals.pending.value.method) }} {{ withdrawals.pending.value.phone_number }},
                demandé le {{ new Date(withdrawals.pending.value.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) }}.
                Une seule demande à la fois : vous pourrez en faire une nouvelle dès qu'elle sera traitée.
              </p>
              <CoreButton size="lg" full-width class="mt-4" @click="close">Compris</CoreButton>
            </div>

            <template v-else>
              <div class="mb-4.5 flex items-center gap-2.5 rounded-md border border-info-border bg-info-bg px-3.5 py-3.5">
                <span class="text-[15px]">ⓘ</span>
                <p class="m-0 text-[12.5px] leading-[1.5] text-info-fg-deep">
                  Retirable : <strong>{{ formatFcfa(available) }}</strong> · minimum {{ WITHDRAW_MIN }} FCFA. Un administrateur Immo valide chaque demande avant le virement.
                </p>
              </div>

              <div class="mb-2 flex items-center justify-between">
                <p class="m-0 text-[13px] font-bold">Montant</p>
                <button v-if="available >= WITHDRAW_MIN" type="button" class="text-[12.5px] font-bold text-green-700" @click="amount = String(Math.floor(available))">Tout retirer</button>
              </div>
              <div class="flex items-baseline gap-2 rounded-md border-[1.5px] bg-white px-[17px] py-3.5" :class="shownError && amountNum ? 'border-danger-border' : 'border-[var(--border-default)]'">
                <input :value="amount" inputmode="numeric" aria-label="Montant à retirer" class="min-w-0 flex-1 border-0 bg-transparent font-mono text-2xl font-bold outline-none" @input="onAmountInput">
                <span class="font-mono text-[15px] font-bold text-[var(--text-faint)]">FCFA</span>
              </div>

              <p class="mb-2 mt-4.5 text-[13px] font-bold">Numéro Mobile Money</p>
              <input v-model="phone" inputmode="tel" placeholder="01 97 00 00 00" aria-label="Numéro Mobile Money" class="h-12 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none">

              <p class="mb-2 mt-4.5 text-[13px] font-bold">Opérateur</p>
              <div class="flex gap-2.5">
                <button
                  v-for="o in OPERATORS"
                  :key="o.id"
                  type="button"
                  class="flex-1 rounded-md border-[1.5px] py-3 text-[13px] font-bold transition-all"
                  :class="operator === o.id ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                  @click="operator = o.id"
                >{{ o.name }}</button>
              </div>

              <p class="mb-0 mt-3.5 text-[12px] leading-[1.5] text-[var(--text-muted)]">Le montant reste dans votre solde jusqu'au virement : ne le dépensez pas d'ici là.</p>
              <p v-if="shownError" class="mb-0 mt-2.5 text-[12.5px] font-semibold text-danger-fg">{{ shownError }}</p>
              <p v-if="errorMessage" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
              <button
                type="button"
                class="mt-5 w-full rounded-md py-3.5 text-[15px] font-bold text-white transition-colors"
                :class="validation || loading ? 'cursor-not-allowed bg-sand-400' : 'cursor-pointer bg-[image:var(--action-primary)] shadow-action'"
                :disabled="!!validation || loading"
                @click="submit"
              >{{ loading ? 'Envoi…' : 'Demander le retrait' }}</button>
            </template>
          </template>

          <div v-else class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Demande enregistrée</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">
              Votre retrait de {{ formatFcfa(amountNum) }} attend la validation d'Immo. Vous serez notifié au virement.
            </p>
            <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
