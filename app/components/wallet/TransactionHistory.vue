<script setup lang="ts">
import type { WalletTransaction } from '~/types/wallet'
import { transactionTypeLabel } from '~/utils/transactionLabels'

/**
 * Historique du wallet, commun aux espaces locataire et pro (Lot 55 : le
 * wallet pro n'avait aucun historique, seulement les retraits). Paginé par
 * « Afficher plus » — avant, seules les 50 premières lignes existaient.
 */
const walletApi = useWalletApi()
const PAGE_SIZE = 30

const transactions = ref<WalletTransaction[]>([])
const total = ref(0)
const page = ref(1)
const txState = ref<'loading' | 'success' | 'error'>('loading')
const loadingMore = ref(false)

async function load() {
  txState.value = 'loading'
  try {
    const res = await walletApi.fetchTransactions(1, PAGE_SIZE)
    transactions.value = res.data
    total.value = res.total
    page.value = 1
    txState.value = 'success'
  } catch {
    txState.value = 'error'
  }
}
async function loadMore() {
  loadingMore.value = true
  try {
    const res = await walletApi.fetchTransactions(page.value + 1, PAGE_SIZE)
    const known = new Set(transactions.value.map(t => t.id))
    transactions.value = [...transactions.value, ...res.data.filter(t => !known.has(t.id))]
    total.value = res.total
    page.value++
  } finally {
    loadingMore.value = false
  }
}
onMounted(load)
defineExpose({ load })

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

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = { completed: 'ok', pending: 'warn', processing: 'warn', failed: 'danger' }
const STATUS_LABEL: Record<string, string> = { completed: 'Terminé', pending: 'En attente', processing: 'En cours', failed: 'Échoué' }
</script>

<template>
  <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
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
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
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
          <span class="font-mono text-[14.5px] font-bold" :class="isCredit(t.amount) ? 'text-ok-fg' : 'text-[var(--text-primary)]'">{{ isCredit(t.amount) ? '+' : '−' }}{{ formatFcfaShort(Math.abs(Number(t.amount))) }}</span>
          <CoreBadge :tone="STATUS_TONE[t.status] ?? 'neutral'" class="justify-self-end">{{ STATUS_LABEL[t.status] ?? t.status }}</CoreBadge>
        </div>
      </div>
      <div v-if="!filtered.length" class="py-8 text-center text-sm text-[var(--text-muted)]">{{ transactions.length ? 'Aucune transaction ne correspond.' : 'Aucune transaction pour l\'instant.' }}</div>
      <div v-if="transactions.length < total" class="mt-2 text-center">
        <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-2 text-[12.5px] font-bold disabled:opacity-60" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Chargement…' : `Afficher plus (${total - transactions.length} restantes)` }}
        </button>
      </div>
    </template>
  </div>
</template>
