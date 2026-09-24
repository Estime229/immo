<script setup lang="ts">
import { transactionTypeLabel } from '~/utils/transactionLabels'

definePageMeta({ layout: 'locataire' })

const wallet = useTenantWallet()
const walletApi = useWalletApi()
const { activeLease } = useTenantLeases()
const { openPay } = usePaymentModal()

onMounted(wallet.ensureLoaded)

const transactions = ref<Awaited<ReturnType<typeof walletApi.fetchTransactions>>['data']>([])
const txState = ref<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle')

async function loadTransactions() {
  txState.value = 'loading'
  try {
    const page = await walletApi.fetchTransactions()
    transactions.value = page.data
    txState.value = transactions.value.length ? 'success' : 'empty'
  } catch {
    txState.value = 'error'
  }
}
onMounted(loadTransactions)

const query = ref('')
const kindFilter = ref<'all' | 'credit' | 'debit'>('all')

function isCredit(amount: string) {
  return !amount.trim().startsWith('-')
}

const filtered = computed(() => transactions.value.filter(t => {
  const credit = isCredit(t.amount)
  if (kindFilter.value === 'credit' && !credit) return false
  if (kindFilter.value === 'debit' && credit) return false
  const q = query.value.trim().toLowerCase()
  return !q || transactionTypeLabel(t.type).toLowerCase().includes(q)
}))

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  completed: 'ok',
  pending: 'warn',
  processing: 'warn',
  failed: 'danger'
}
const STATUS_LABEL: Record<string, string> = {
  completed: 'Terminé',
  pending: 'En attente',
  processing: 'En cours',
  failed: 'Échoué'
}

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
        <button type="button" class="mt-5 rounded-md bg-white px-5.5 py-3 text-[13.5px] font-bold text-green-900" @click="openPay('recharge')">Recharger</button>
      </div>
      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6.5">
        <p class="m-0 text-xs font-bold uppercase tracking-[.06em] text-[var(--text-faint)]">Tirelire</p>
        <p class="mb-0 mt-3 font-mono text-4xl font-bold tracking-[-.02em] text-green-900">{{ formatFcfaShort(wallet.balanceSavings.value) }}</p>
        <p class="mb-0 mt-2.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Part réservée au logement : c'est elle qui paie un loyer ou une réservation. Les deux soldes ne bougent pas ensemble — une recharge crédite les deux, un revenu locatif ne crédite que le solde disponible.</p>
      </div>
    </div>

    <FeedbackEscrowNotice v-if="escrowLabel" :amount="escrowLabel" class="mt-4.5">
      Ce montant existe mais n'est pas dans votre solde. Libéré 7 jours après l'état des lieux de sortie.
    </FeedbackEscrowNotice>

    <div class="mt-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3.5">
        <p class="m-0 text-base font-bold">Historique</p>
        <div class="flex flex-1 gap-2.5 sm:flex-none">
          <input v-model="query" placeholder="Rechercher un libellé" class="h-10 w-full flex-1 rounded-sm border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-[13.5px] outline-none sm:w-[190px] sm:flex-none">
          <select v-model="kindFilter" class="h-10 flex-none rounded-sm border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 text-[13px] text-sand-900">
            <option value="all">Tous les types</option>
            <option value="credit">Crédits</option>
            <option value="debit">Débits</option>
          </select>
        </div>
      </div>

      <div v-if="txState === 'loading'" class="flex flex-col gap-2">
        <DataSkeletonCard v-for="i in 4" :key="i" :height="50" :lines="1" />
      </div>

      <FeedbackAlertBanner v-else-if="txState === 'error'" tone="danger">
        Impossible de charger l'historique pour le moment.
        <button type="button" class="ml-2 font-bold underline" @click="loadTransactions">Réessayer</button>
      </FeedbackAlertBanner>

      <template v-else>
        <div
          v-for="t in filtered"
          :key="t.id"
          class="grid grid-cols-[42px_1fr] items-center gap-x-3.5 gap-y-2 rounded-sm p-3.5 transition-colors hover:bg-[var(--surface-page)] sm:grid-cols-[42px_1fr_130px_120px] sm:gap-y-0"
        >
          <div class="row-span-2 grid h-[42px] w-[42px] place-items-center rounded-md text-[15px] sm:row-span-1" :class="isCredit(t.amount) ? 'bg-ok-bg' : 'bg-sand-200'">{{ isCredit(t.amount) ? '↑' : '↓' }}</div>
          <div class="min-w-0">
            <p class="m-0 text-[14.5px] font-semibold">{{ transactionTypeLabel(t.type) }}</p>
            <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-faint)]">{{ formatDate(t.created_at) }}</p>
          </div>
          <div class="col-start-2 flex items-center justify-between gap-3 sm:col-start-auto sm:contents">
            <span class="font-mono text-[14.5px] font-bold" :class="isCredit(t.amount) ? 'text-ok-fg' : 'text-[var(--text-primary)]'">{{ formatFcfaShort(Math.abs(Number(t.amount))) }}</span>
            <CoreBadge :tone="STATUS_TONE[t.status] ?? 'neutral'" class="justify-self-end">{{ STATUS_LABEL[t.status] ?? t.status }}</CoreBadge>
          </div>
        </div>
        <div v-if="!filtered.length" class="py-8 text-center text-sm text-[var(--text-muted)]">Aucune transaction ne correspond.</div>
      </template>
    </div>
  </div>
</template>
