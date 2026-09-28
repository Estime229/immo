<script setup lang="ts">
import type { WithdrawalStatus } from '~/types/wallet'
import { withdrawalMethodLabel } from '~/utils/wallet'

/** Historique des retraits, commun aux trois espaces (Lot 55) — la méthode arrive en minuscules (`mtn_momo`) et s'affichait brute. */
const withdrawals = useWithdrawals()
onMounted(withdrawals.load)

const STATUS: Record<WithdrawalStatus, { label: string; tone: 'warn' | 'ok' | 'danger' }> = {
  pending: { label: 'En attente', tone: 'warn' },
  processed: { label: 'Versé', tone: 'ok' },
  rejected: { label: 'Refusé', tone: 'danger' }
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
    <p class="m-0 text-[15px] font-bold">Demandes de retrait</p>
    <p class="mb-4 mt-1.5 text-[12.5px] text-[var(--text-muted)]">Minimum 500 FCFA · une seule demande en attente à la fois · validées par Immo avant virement.</p>
    <div v-if="withdrawals.state.value === 'loading' && !withdrawals.list.value.length" class="flex flex-col gap-2">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="46" :lines="1" />
    </div>
    <FeedbackAlertBanner v-else-if="withdrawals.state.value === 'error'" tone="danger">
      Impossible de charger vos demandes de retrait.
      <button type="button" class="ml-2 font-bold underline" @click="withdrawals.load">Réessayer</button>
    </FeedbackAlertBanner>
    <p v-else-if="!withdrawals.list.value.length" class="m-0 text-[13.5px] text-[var(--text-muted)]">Aucune demande de retrait pour l'instant.</p>
    <div v-for="w in withdrawals.list.value" :key="w.id" class="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-b border-sand-200 py-3 last:border-b-0">
      <div class="min-w-[180px] flex-1">
        <p class="m-0 text-[13.5px] font-semibold">{{ withdrawalMethodLabel(w.method) }} · {{ w.phone_number }}</p>
        <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ formatDate(w.created_at) }}<template v-if="w.rejection_reason"> · Motif : {{ w.rejection_reason }}</template></p>
      </div>
      <span class="font-mono text-sm font-bold">{{ formatFcfa(Number(w.amount)) }}</span>
      <CoreBadge :tone="STATUS[w.status]?.tone ?? 'neutral'" class="min-w-[90px] justify-center">{{ STATUS[w.status]?.label ?? w.status }}</CoreBadge>
    </div>
  </div>
</template>
