<script setup lang="ts">
import { ArrowUpRight } from '@lucide/vue'
import type { WithdrawalStatus } from '~/types/wallet'
import { withdrawalMethodLabel } from '~/utils/wallet'

/** Historique des retraits, commun aux trois espaces (Lot 55) — la méthode arrive en minuscules (`mtn_momo`) et s'affichait brute. */
const withdrawals = useWithdrawals()
onMounted(withdrawals.load)

const STATUS: Record<WithdrawalStatus, { label: string; tone: 'warn' | 'ok' | 'danger' | 'neutral' }> = {
  pending: { label: 'En attente', tone: 'warn' },
  processed: { label: 'Versé', tone: 'ok' },
  rejected: { label: 'Refusé', tone: 'danger' },
  cancelled: { label: 'Annulée', tone: 'neutral' }
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Confirmation en ligne avant annulation (#83/#84) — id de la demande en cours de confirmation, '' sinon. */
const confirmingId = ref('')
async function confirmCancel(id: string) {
  confirmingId.value = ''
  await withdrawals.cancel(id)
}
</script>

<template>
  <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
    <h2 class="m-0 text-[15px] font-bold">Demandes de retrait</h2>
    <p class="mb-3 mt-1 text-xs text-[var(--text-faint)]">Minimum 500 FCFA · une seule demande en attente à la fois · validées par Immo avant virement.</p>
    <div v-if="withdrawals.state.value === 'loading' && !withdrawals.list.value.length" class="flex flex-col gap-2">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="46" :lines="0" />
    </div>
    <FeedbackAlertBanner v-else-if="withdrawals.state.value === 'error'" tone="danger">
      Impossible de charger vos demandes de retrait.
      <button type="button" class="ml-2 font-bold underline" @click="withdrawals.load">Réessayer</button>
    </FeedbackAlertBanner>
    <p v-else-if="!withdrawals.list.value.length" class="m-0 py-3 text-[13px] text-[var(--text-muted)]">Aucune demande de retrait pour l'instant.</p>
    <p v-if="withdrawals.cancelError.value" class="mb-3 mt-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ withdrawals.cancelError.value }}</p>
    <div v-for="w in withdrawals.list.value" :key="w.id" class="border-b border-sand-200 py-3 last:border-b-0">
      <div class="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        <div class="grid h-9 w-9 flex-none place-items-center rounded-md bg-sand-200 text-[var(--text-secondary)]"><ArrowUpRight class="h-4 w-4" :stroke-width="1.9" /></div>
        <div class="min-w-[160px] flex-1">
          <p class="m-0 text-sm font-bold">{{ withdrawalMethodLabel(w.method) }} · <span class="font-mono font-semibold">{{ w.phone_number }}</span></p>
          <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]"><span class="font-mono">{{ formatDate(w.created_at) }}</span><template v-if="w.rejection_reason"> · Motif : {{ w.rejection_reason }}</template></p>
        </div>
        <span class="font-mono text-sm font-bold">{{ formatFcfa(Number(w.amount)) }}</span>
        <CoreBadge :tone="STATUS[w.status]?.tone ?? 'neutral'" class="min-w-[90px] justify-center">{{ STATUS[w.status]?.label ?? 'Statut inconnu' }}</CoreBadge>
        <CoreButton
          v-if="w.status === 'pending' && confirmingId !== w.id"
          size="sm"
          tone="ghost"
          :disabled="withdrawals.cancellingId.value === w.id"
          @click="confirmingId = w.id"
        >Annuler</CoreButton>
      </div>
      <CoreInlineConfirm
        v-if="confirmingId === w.id"
        class="mt-2.5"
        tone="warning"
        :message="`Annuler cette demande ? ${formatFcfa(Number(w.amount))} seront recrédités sur votre solde.`"
        confirm-label="Annuler la demande"
        cancel-label="Garder"
        :loading="withdrawals.cancellingId.value === w.id"
        @confirm="confirmCancel(w.id)"
        @cancel="confirmingId = ''"
      />
    </div>
  </section>
</template>
