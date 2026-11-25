<script setup lang="ts">
import { ArrowUpRight, Lock, Plus } from '@lucide/vue'
import { leasePhase, TENANT_LEASE_PHASE_LABEL } from '~/utils/leases'
import { walletBreakdown, walletBreakdownLine } from '~/utils/wallet'

definePageMeta({ layout: 'locataire' })

const wallet = useTenantWallet()
const withdrawals = useWithdrawals()
const leasesBlock = useTenantLeases()
const { open: payOpen, openPay } = usePaymentModal()
const history = ref<{ load: () => Promise<void> } | null>(null)
const withdrawOpen = ref(false)

onMounted(wallet.ensureLoaded)
onMounted(withdrawals.load)
onMounted(leasesBlock.ensureLoaded)
onMounted(() => useWalletBadge().markAllSeen())
// Une recharge ou un retrait change l'historique : relu à la fermeture.
watch(payOpen, (v, was) => { if (was && !v) history.value?.load() })
watch(withdrawOpen, (v, was) => { if (was && !v) history.value?.load() })

/**
 * Cautions de tous les baux dont l'entrée est payée (actif, préavis, terminé) — pas seulement celle
 * du bail sélectionné. Montants lus sur le bail, jamais inventés ; la restitution n'est pas gérée.
 */
const deposits = computed(() => leasesBlock.leases.value
  .filter(l => ['active', 'notice', 'terminated'].includes(leasePhase(l)) && Number(l.deposit_amount) > 0)
  .map(l => ({
    id: l.id,
    place: [l.unit?.name, l.property?.name].filter(Boolean).join(' — ') || 'Logement',
    amount: Number(l.deposit_amount),
    phase: TENANT_LEASE_PHASE_LABEL[leasePhase(l)]
  })))
const depositsTotal = computed(() => deposits.value.reduce((sum, d) => sum + d.amount, 0))

/** Un seul solde (décision produit), puis ce qui en est réservé au logement et ce qui reste libre. */
const split = computed(() => walletBreakdown(wallet.wallet.value?.balance_total, wallet.wallet.value?.balance_savings))
const splitLine = computed(() => walletBreakdownLine(split.value, formatFcfaShort))
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <DataSkeletonCard v-if="wallet.state.value === 'loading' || wallet.state.value === 'idle'" :height="170" :lines="0" />

    <FeedbackAlertBanner v-else-if="wallet.state.value === 'error'" tone="danger">
      Impossible de charger votre wallet pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="wallet.reload">Réessayer</button>
    </FeedbackAlertBanner>

    <!-- Un seul solde en aplat (pas de dégradé décoratif) ; boutons à droite dès que la largeur le permet. -->
    <section v-else class="flex flex-col gap-4.5 rounded-2xl bg-[var(--surface-inverse)] p-5.5 text-white sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:p-6">
      <div class="min-w-0">
        <p class="m-0 text-label font-bold uppercase tracking-label text-white/[.62]">Solde</p>
        <p class="mb-0 mt-2.5 font-mono text-[34px] font-bold leading-none tracking-[-.02em]">{{ formatFcfaShort(split.total) }}</p>
        <p v-if="splitLine" class="mb-0 mt-2.5 text-[13px] leading-[1.5] text-white/[.82]">{{ splitLine }}</p>
        <p v-if="withdrawals.pending.value" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-white/90">
          <span class="font-mono">{{ formatFcfa(Number(withdrawals.pending.value.amount)) }}</span> en cours de retrait, déjà déduits de ce solde.
        </p>
        <!-- La seule phrase d'aide de la page : à quoi sert la part réservée, et ce que touche un retrait. -->
        <p class="mb-0 mt-2.5 max-w-[520px] text-[12.5px] leading-[1.5] text-white/[.66]">La part réservée paie vos loyers et réservations ; un retrait puise d'abord dans la part libre.</p>
      </div>
      <div class="flex flex-none flex-wrap gap-2.5">
        <button type="button" class="inline-flex items-center gap-1.5 rounded-md bg-white px-5 py-3 text-[14px] font-bold text-green-900" @click="openPay('recharge')"><Plus class="h-4 w-4" :stroke-width="2.2" />Recharger</button>
        <button type="button" class="inline-flex items-center gap-1.5 rounded-md border border-white/40 px-5 py-3 text-[14px] font-bold text-white" @click="withdrawOpen = true"><ArrowUpRight class="h-4 w-4" :stroke-width="1.9" />Retirer</button>
      </div>
    </section>

    <WalletInconsistencyNote />

    <div class="mt-4.5 grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <WalletTransactionHistory ref="history" class="min-w-0" />

      <div class="flex flex-col gap-4.5">
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="m-0 text-[15px] font-bold">Cautions séquestrées</h2>
            <span v-if="deposits.length > 1" class="font-mono text-[13px] font-bold text-clay-700">{{ formatFcfaShort(depositsTotal) }}</span>
          </div>
          <p class="mb-2 mt-1 text-xs text-[var(--text-faint)]">Détenues par Bayo, hors de votre solde. Leur restitution en fin de bail n'est pas encore gérée dans l'application.</p>
          <DataSkeletonCard v-if="leasesBlock.state.value === 'loading'" :height="46" :lines="0" />
          <p v-else-if="leasesBlock.state.value === 'error'" class="m-0 py-2 text-[13px] font-semibold text-danger-fg">
            Vos baux n'ont pas pu être chargés. <button type="button" class="font-bold underline" @click="leasesBlock.reload()">Réessayer</button>
          </p>
          <p v-else-if="!deposits.length" class="m-0 py-3 text-[13px] text-[var(--text-muted)]">Aucune caution séquestrée : elle apparaît ici après le paiement d'entrée d'un bail.</p>
          <NuxtLink v-for="d in deposits" :key="d.id" :to="`/locataire/bail?lease=${d.id}`" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
            <div class="grid h-9 w-9 flex-none place-items-center rounded-md bg-[var(--surface-escrow)] text-clay-700"><Lock class="h-4 w-4" :stroke-width="1.9" /></div>
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold">{{ d.place }}</p>
              <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ d.phase }}</p>
            </div>
            <span class="font-mono text-sm font-bold text-clay-700">{{ formatFcfaShort(d.amount) }}</span>
          </NuxtLink>
        </section>

        <WalletWithdrawalList />
      </div>
    </div>

    <WalletWithdrawModal :open="withdrawOpen" @close="withdrawOpen = false" />
  </div>
</template>
