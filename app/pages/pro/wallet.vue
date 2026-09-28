<script setup lang="ts">
definePageMeta({ layout: 'pro' })

const wallet = useTenantWallet()
const withdrawals = useWithdrawals()
const modal = useProModal()
const history = ref<{ load: () => Promise<void> } | null>(null)
onMounted(wallet.ensureLoaded)
onMounted(() => useWalletBadge().markAllSeen())
watch(modal, (v, prev) => { if (prev === 'retrait' && v === '') history.value?.load() })
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
        <p v-if="withdrawals.pending.value" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-white/90">Dont {{ formatFcfa(Number(withdrawals.pending.value.amount)) }} en cours de retrait.</p>
        <button type="button" class="mt-4.5 rounded-md bg-white px-5.5 py-3 text-[13.5px] font-bold text-green-900" @click="modal = 'retrait'">Retirer</button>
      </div>
      <div class="rounded-2xl border-[1.5px] border-warn-border bg-white p-6.5">
        <p class="m-0 text-xs font-bold uppercase tracking-[.06em] text-[var(--text-faint)]">Tirelire</p>
        <p class="mb-0 mt-3 font-mono text-[34px] font-bold tracking-[-.02em] text-warn-fg-deep">{{ formatFcfa(wallet.balanceSavings.value) }}</p>
        <p class="mb-0 mt-2.5 text-[13px] leading-[1.55] text-[var(--text-muted)]">Part réservée aux paiements de logement — ne s'applique que si ce compte loue aussi un bien.</p>
      </div>
    </div>

    <WalletInconsistencyNote />
    <WalletWithdrawalList class="mt-4.5" />
    <WalletTransactionHistory ref="history" class="mt-4.5" />
  </div>
</template>
