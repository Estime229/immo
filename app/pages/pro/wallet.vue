<script setup lang="ts">
import { ArrowDownToLine } from '@lucide/vue'
import { walletBreakdown, walletBreakdownLine } from '~/utils/wallet'

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
 * Part réservée au logement (balance_savings, une PARTIE du solde) : même présentation que le
 * wallet locataire, un seul solde puis la répartition. Côté pro elle est le plus souvent vide :
 * la ligne n'apparaît que si elle contient quelque chose, ou si le compte est aussi locataire.
 */
const split = computed(() => walletBreakdown(wallet.wallet.value?.balance_total, wallet.wallet.value?.balance_savings))
const splitLine = computed(() => walletBreakdownLine(split.value, formatFcfaShort))
const showSavings = computed(() => split.value.reserved > 0 || authUser.value?.role === 'tenant')
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

    <div v-else>
      <!-- Aplat vert foncé (charte : pas de dégradé décoratif) ; le contraste du texte blanc ne change pas. -->
      <section class="rounded-2xl bg-[var(--surface-inverse)] p-5.5 text-white">
        <p class="m-0 text-label font-bold uppercase tracking-label text-white/[.62]">Solde disponible</p>
        <p class="mb-0 mt-3 font-mono text-[34px] font-bold tracking-[-.02em]">{{ formatFcfa(wallet.balanceTotal.value) }}</p>
        <p v-if="showSavings && splitLine" class="mb-0 mt-1.5 text-[13px] font-semibold text-white/85">{{ splitLine }}</p>
        <p class="mb-0 mt-2.5 text-[13.5px] leading-[1.55] text-white/75">Alimenté par vos loyers et séjours encaissés. Retirable vers Mobile Money.</p>
        <p v-if="withdrawals.pending.value" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-white/90"><span class="font-mono">{{ formatFcfa(Number(withdrawals.pending.value.amount)) }}</span> en cours de retrait, déjà déduits de ce solde.</p>
        <button type="button" class="mt-4.5 inline-flex items-center gap-1.5 rounded-md bg-white px-5 py-3 text-[14px] font-bold text-green-900" @click="modal = 'retrait'">
          <ArrowDownToLine class="h-4 w-4" :stroke-width="1.9" />Retirer
        </button>
      </section>
    </div>

    <WalletInconsistencyNote />
    <WalletWithdrawalList class="mt-4.5" />
    <WalletTransactionHistory ref="history" class="mt-4.5" />
  </div>
</template>
