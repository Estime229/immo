<script setup lang="ts">
import type { WithdrawalRequest } from '~/types/wallet'

definePageMeta({ layout: 'pro' })

const wallet = useTenantWallet()
const walletApi = useWalletApi()
const modal = useProModal()
onMounted(wallet.ensureLoaded)

const withdrawals = ref<WithdrawalRequest[]>([])
const withdrawalsState = ref<'loading' | 'success' | 'error'>('loading')
async function loadWithdrawals() {
  withdrawalsState.value = 'loading'
  try {
    withdrawals.value = await walletApi.fetchWithdrawals()
    withdrawalsState.value = 'success'
  } catch {
    withdrawalsState.value = 'error'
  }
}
onMounted(loadWithdrawals)
watch(() => modal.value, (v, prev) => { if (prev === 'retrait' && v === '') loadWithdrawals() })

const STATUS_LABEL: Record<string, string> = { pending: 'En attente', processed: 'Traitée', rejected: 'Refusée' }
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger'> = { pending: 'warn', processed: 'ok', rejected: 'danger' }
const METHOD_LABEL: Record<string, string> = { MTN_MOMO: 'MTN', MOOV_MONEY: 'Moov', BANK_TRANSFER: 'Virement bancaire' }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="wallet.state.value === 'loading'" class="grid grid-cols-1 gap-4.5 sm:grid-cols-2">
      <DataSkeletonCard :height="160" :lines="1" />
      <DataSkeletonCard :height="160" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="wallet.state.value === 'error'" tone="danger">
      Impossible de charger votre wallet pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="wallet.reload">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else class="grid grid-cols-1 gap-4.5 sm:grid-cols-2">
      <div class="rounded-2xl bg-[image:var(--gradient-balance)] p-6.5 text-white">
        <p class="m-0 text-xs font-bold uppercase tracking-[.06em] text-white/[.58]">Solde disponible</p>
        <p class="mb-0 mt-3 font-mono text-[34px] font-bold tracking-[-.02em]">{{ formatFcfa(wallet.balanceTotal.value) }}</p>
        <p class="mb-0 mt-2.5 text-[13px] leading-[1.55] text-white/75">Alimenté par vos revenus locatifs. Retirable vers Mobile Money.</p>
        <button type="button" class="mt-4.5 rounded-md bg-white px-5.5 py-3 text-[13.5px] font-bold text-green-900" @click="modal = 'retrait'">Retirer</button>
      </div>
      <div class="rounded-2xl border-[1.5px] border-warn-border bg-white p-6.5">
        <p class="m-0 text-xs font-bold uppercase tracking-[.06em] text-[var(--text-faint)]">Tirelire</p>
        <p class="mb-0 mt-3 font-mono text-[34px] font-bold tracking-[-.02em] text-warn-fg-deep">{{ formatFcfa(wallet.balanceSavings.value) }}</p>
        <p class="mb-0 mt-2.5 text-[13px] leading-[1.55] text-[var(--text-muted)]">Part réservée aux paiements de logement — ne s'applique que si ce compte loue aussi un bien.</p>
      </div>
    </div>

    <div class="mt-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
      <p class="m-0 text-[15px] font-bold">Demandes de retrait</p>
      <p class="mb-4 mt-1.5 text-[12.5px] text-[var(--text-muted)]">Minimum 500 FCFA · une seule demande en attente à la fois.</p>

      <div v-if="withdrawalsState === 'loading'" class="flex flex-col gap-2">
        <DataSkeletonCard v-for="i in 3" :key="i" :height="46" :lines="1" />
      </div>
      <FeedbackAlertBanner v-else-if="withdrawalsState === 'error'" tone="danger">
        Impossible de charger vos demandes de retrait.
        <button type="button" class="ml-2 font-bold underline" @click="loadWithdrawals">Réessayer</button>
      </FeedbackAlertBanner>
      <p v-else-if="!withdrawals.length" class="m-0 text-[13.5px] text-[var(--text-muted)]">Aucune demande de retrait pour l'instant.</p>
      <template v-else>
        <div v-for="w in withdrawals" :key="w.id" class="flex items-center gap-3.5 border-b border-sand-200 py-3 last:border-b-0">
          <div class="flex-1">
            <p class="m-0 text-[13.5px] font-semibold">Retrait Mobile Money — {{ METHOD_LABEL[w.method] ?? w.method }}</p>
            <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ formatDate(w.created_at) }}<template v-if="w.rejection_reason"> · {{ w.rejection_reason }}</template></p>
          </div>
          <span class="font-mono text-sm font-bold">{{ formatFcfa(Number(w.amount)) }}</span>
          <CoreBadge :tone="STATUS_TONE[w.status] ?? 'neutral'" class="min-w-[90px] justify-center">{{ STATUS_LABEL[w.status] ?? w.status }}</CoreBadge>
        </div>
      </template>
    </div>
  </div>
</template>
