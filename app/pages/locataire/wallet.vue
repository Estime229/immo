<script setup lang="ts">
definePageMeta({ layout: 'locataire' })

const wallet = useTenantWallet()
const withdrawals = useWithdrawals()
const { activeLease } = useTenantLeases()
const { open: payOpen, openPay } = usePaymentModal()
const history = ref<{ load: () => Promise<void> } | null>(null)
const withdrawOpen = ref(false)

onMounted(wallet.ensureLoaded)
onMounted(withdrawals.load)
// Une recharge ou un retrait change l'historique : relu à la fermeture.
watch(payOpen, (v, was) => { if (was && !v) history.value?.load() })
watch(withdrawOpen, (v, was) => { if (was && !v) history.value?.load() })

/** Caution du bail actif, si signé/actif — pas une valeur inventée. */
const escrowLabel = computed(() => {
  const l = activeLease.value
  if (!l || (l.status !== 'active' && l.status !== 'signed')) return null
  return `${formatFcfaShort(Number(l.deposit_amount))} séquestrés — caution du bail ${l.unit?.name ?? ''}`.trim()
})
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
        <p class="mb-0 mt-3 font-mono text-4xl font-bold tracking-[-.02em]">{{ formatFcfaShort(wallet.balanceTotal.value) }}</p>
        <p class="mb-0 mt-2.5 text-[13.5px] leading-[1.55] text-white/75">Retirable ou utilisable pour toute dépense.</p>
        <p v-if="withdrawals.pending.value" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-white/90">Dont {{ formatFcfa(Number(withdrawals.pending.value.amount)) }} en cours de retrait.</p>
        <div class="mt-5 flex flex-wrap gap-2.5">
          <button type="button" class="rounded-md bg-white px-5.5 py-3 text-[13.5px] font-bold text-green-900" @click="openPay('recharge')">Recharger</button>
          <button type="button" class="rounded-md border border-white/40 px-5.5 py-3 text-[13.5px] font-bold text-white" @click="withdrawOpen = true">Retirer</button>
        </div>
      </div>
      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6.5">
        <p class="m-0 text-xs font-bold uppercase tracking-[.06em] text-[var(--text-faint)]">Tirelire</p>
        <p class="mb-0 mt-3 font-mono text-4xl font-bold tracking-[-.02em] text-green-900">{{ formatFcfaShort(wallet.balanceSavings.value) }}</p>
        <p class="mb-0 mt-2.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Part réservée au logement : c'est elle qui paie un loyer ou une réservation. Les deux soldes ne bougent pas ensemble — une recharge crédite les deux, un revenu locatif ne crédite que le solde disponible.</p>
      </div>
    </div>

    <FeedbackEscrowNotice v-if="escrowLabel" :amount="escrowLabel" class="mt-4.5">
      Ce montant existe mais n'est pas dans votre solde. Sa restitution en fin de bail n'est pas encore gérée dans l'application.
    </FeedbackEscrowNotice>

    <WalletInconsistencyNote />
    <WalletTransactionHistory ref="history" class="mt-4.5" />
    <WalletWithdrawalList v-if="withdrawals.list.value.length" class="mt-4.5" />
    <WalletWithdrawModal :open="withdrawOpen" @close="withdrawOpen = false" />
  </div>
</template>
