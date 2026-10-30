<script setup lang="ts">
import { ArrowDownToLine } from '@lucide/vue'

definePageMeta({ layout: 'pro' })

const wallet = useTenantWallet()
const withdrawals = useWithdrawals()
const modal = useProModal()
const authUser = useAuthUser()
const history = ref<{ load: () => Promise<void> } | null>(null)
onMounted(wallet.ensureLoaded)
onMounted(() => useWalletBadge().markAllSeen())
watch(modal, (v, prev) => { if (prev === 'retrait' && v === '') history.value?.load() })

/**
 * « Tirelire » : part du solde réservée aux paiements de logement d'un locataire.
 * Côté pro, c'est du jargon sans objet : on ne la montre que si elle contient
 * quelque chose, ou si le compte est aussi locataire.
 */
const showSavings = computed(() => wallet.balanceSavings.value > 0 || authUser.value?.role === 'tenant')
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="wallet.state.value === 'loading'" class="grid grid-cols-1 gap-4.5 sm:grid-cols-2">
      <DataSkeletonCard :height="160" :lines="1" />
      <DataSkeletonCard :height="160" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="wallet.state.value === 'error'" tone="danger">
      Impossible de charger votre wallet pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="wallet.reload">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else class="grid grid-cols-1 gap-4.5" :class="showSavings ? 'sm:grid-cols-2' : ''">
      <section class="rounded-2xl bg-[image:var(--gradient-balance)] p-5.5 text-white">
        <p class="m-0 text-label font-bold uppercase tracking-label text-white/[.62]">Solde disponible</p>
        <p class="mb-0 mt-3 font-mono text-[34px] font-bold tracking-[-.02em]">{{ formatFcfa(wallet.balanceTotal.value) }}</p>
        <p class="mb-0 mt-2.5 text-[13.5px] leading-[1.55] text-white/75">Alimenté par vos loyers et séjours encaissés. Retirable vers Mobile Money.</p>
        <p v-if="withdrawals.pending.value" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-white/90"><span class="font-mono">{{ formatFcfa(Number(withdrawals.pending.value.amount)) }}</span> en cours de retrait, déjà déduits de ce solde.</p>
        <button type="button" class="mt-4.5 inline-flex items-center gap-1.5 rounded-md bg-white px-5 py-3 text-[14px] font-bold text-green-900" @click="modal = 'retrait'">
          <ArrowDownToLine class="h-4 w-4" :stroke-width="1.9" />Retirer
        </button>
      </section>
      <section v-if="showSavings" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Tirelire</p>
        <p class="mb-0 mt-3 font-mono text-[34px] font-bold tracking-[-.02em] text-green-900">{{ formatFcfa(wallet.balanceSavings.value) }}</p>
        <p class="mb-0 mt-2.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Part du solde réservée à vos propres paiements de logement, quand ce compte loue aussi un bien.</p>
      </section>
    </div>

    <WalletInconsistencyNote />
    <WalletWithdrawalList class="mt-4.5" />
    <WalletTransactionHistory ref="history" class="mt-4.5" />
  </div>
</template>
