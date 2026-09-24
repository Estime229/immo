<script setup lang="ts">
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const modal = useArtisanModal()
const wallet = useTenantWallet()
const walletApi = useWalletApi()
const currentUser = useAuthUser()

const open = computed(() => modal.value === 'retrait')
const step = ref<'form' | 'done'>('form')
const amount = ref('')
const phone = ref('')
const operator = ref<'MTN_MOMO' | 'MOOV_MONEY'>('MTN_MOMO')
const loading = ref(false)
const errorMessage = ref('')

watch(open, v => {
  if (v) {
    step.value = 'form'
    amount.value = ''
    phone.value = currentUser.value?.phone_number ?? ''
    operator.value = 'MTN_MOMO'
    errorMessage.value = ''
    wallet.ensureLoaded()
  }
})

const amountNum = computed(() => Number(amount.value.replace(/\D/g, '')) || 0)
const amountFmt = computed(() => formatFcfa(amountNum.value))

function onAmountInput(e: Event) {
  amount.value = (e.target as HTMLInputElement).value.replace(/\D/g, '')
}

const localError = computed(() => {
  if (!amountNum.value) return ''
  if (amountNum.value < 500) return 'Le montant minimum est de 500 FCFA.'
  if (amountNum.value > wallet.balanceTotal.value) return 'Ce montant dépasse votre solde disponible.'
  return ''
})
const blocked = computed(() => !(amountNum.value >= 500 && amountNum.value <= wallet.balanceTotal.value && phone.value.trim()))

const OPERATORS = [
  { id: 'MTN_MOMO' as const, name: 'MTN' },
  { id: 'MOOV_MONEY' as const, name: 'Moov' }
]

function close() {
  modal.value = ''
}
async function submit() {
  if (blocked.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    await walletApi.requestWithdrawal(amountNum.value, phone.value.trim(), operator.value)
    await wallet.reload()
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La demande a échoué.') : 'La demande a échoué.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[440px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4.5">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">{{ step === 'form' ? 'Retirer des fonds' : 'Demande enregistrée' }}</h3>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" @click="close">✕</button>
        </div>

        <div class="p-6">
          <template v-if="step === 'form'">
            <div class="mb-4.5 flex items-center gap-2.5 rounded-md border border-info-border bg-info-bg px-3.5 py-3.5">
              <span class="text-[15px]">ⓘ</span>
              <p class="m-0 text-[12.5px] leading-[1.5] text-info-fg-deep">Minimum 500 FCFA · une seule demande en attente. Disponible : <strong>{{ formatFcfa(wallet.balanceTotal.value) }}</strong>.</p>
            </div>

            <p class="mb-2 mt-0 text-[13px] font-bold">Montant</p>
            <div class="flex items-baseline gap-2 rounded-md border-[1.5px] bg-white px-[17px] py-3.5" :class="localError ? 'border-danger-border' : 'border-[var(--border-default)]'">
              <input :value="amount" inputmode="numeric" class="min-w-0 flex-1 border-0 bg-transparent font-mono text-2xl font-bold outline-none" @input="onAmountInput">
              <span class="font-mono text-[15px] font-bold text-[var(--text-faint)]">FCFA</span>
            </div>
            <p v-if="localError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ localError }}</p>

            <p class="mb-2 mt-4.5 text-[13px] font-bold">Numéro Mobile Money</p>
            <input v-model="phone" placeholder="+229 97 xx xx xx" class="h-12 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none">

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

            <p v-if="errorMessage" class="mb-0 mt-3.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
            <button
              type="button"
              class="mt-5.5 w-full rounded-md py-3.5 text-[15px] font-bold text-white transition-colors"
              :class="blocked || loading ? 'cursor-not-allowed bg-sand-400' : 'cursor-pointer bg-[image:var(--action-primary)] shadow-action'"
              :disabled="blocked || loading"
              @click="submit"
            >{{ loading ? 'Envoi…' : 'Demander le retrait' }}</button>
          </template>

          <template v-else>
            <div class="px-0.5 py-1 text-center">
              <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
              <p class="mb-0 mt-4.5 text-lg font-bold">Demande enregistrée</p>
              <p class="mx-auto mb-0 mt-2.5 max-w-[300px] text-sm leading-[1.6] text-[var(--text-muted)]">
                Votre retrait de {{ amountFmt }} est en attente d'approbation. Vous serez notifié au virement.
              </p>
              <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
