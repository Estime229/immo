<script setup lang="ts">
import { ArrowDownLeft, ArrowUpRight, Search } from '@lucide/vue'
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
const moreError = ref(false)
async function loadMore() {
  loadingMore.value = true
  moreError.value = false
  try {
    const res = await walletApi.fetchTransactions(page.value + 1, PAGE_SIZE)
    const known = new Set(transactions.value.map(t => t.id))
    transactions.value = [...transactions.value, ...res.data.filter(t => !known.has(t.id))]
    total.value = res.total
    page.value++
  } catch {
    moreError.value = true
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
  <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 class="m-0 text-[15px] font-bold">Historique</h2>
      <div class="flex w-full flex-wrap gap-2.5 sm:w-auto">
        <label class="relative min-w-0 flex-1 sm:w-[210px] sm:flex-none">
          <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" :stroke-width="1.9" />
          <input v-model="query" aria-label="Rechercher un libellé" placeholder="Rechercher un libellé" class="h-[42px] w-full rounded-pill border border-[var(--border-default)] bg-white pl-10 pr-3.5 text-[13px] font-semibold outline-none">
        </label>
        <select v-model="kindFilter" aria-label="Type de mouvement" class="h-[42px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900">
          <option value="all">Tous les mouvements</option>
          <option value="credit">Crédits</option>
          <option value="debit">Débits</option>
        </select>
      </div>
    </div>
    <div v-if="txState === 'loading'" class="flex flex-col gap-2">
      <DataSkeletonCard v-for="i in 4" :key="i" :height="46" :lines="0" />
    </div>
    <FeedbackAlertBanner v-else-if="txState === 'error'" tone="danger">
      Impossible de charger l'historique pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>
    <template v-else>
      <div v-for="t in filtered" :key="t.id" class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-sand-200 py-3 last:border-b-0">
        <div class="grid h-9 w-9 flex-none place-items-center rounded-md" :class="isCredit(t.amount) ? 'bg-ok-bg text-ok-fg' : 'bg-sand-200 text-[var(--text-secondary)]'">
          <ArrowDownLeft v-if="isCredit(t.amount)" class="h-4 w-4" :stroke-width="1.9" />
          <ArrowUpRight v-else class="h-4 w-4" :stroke-width="1.9" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="m-0 truncate text-sm font-bold">{{ transactionTypeLabel(t.type) }}</p>
          <p class="mb-0 mt-0.5 font-mono text-xs text-[var(--text-faint)]">{{ formatDate(t.created_at) }}</p>
        </div>
        <span class="font-mono text-sm font-bold" :class="isCredit(t.amount) ? 'text-ok-fg' : 'text-[var(--text-primary)]'">{{ isCredit(t.amount) ? '+' : '−' }}{{ formatFcfaShort(Math.abs(Number(t.amount))) }}</span>
        <CoreBadge :tone="STATUS_TONE[t.status] ?? 'neutral'" class="min-w-[86px] justify-center">{{ STATUS_LABEL[t.status] ?? 'Statut inconnu' }}</CoreBadge>
      </div>
      <p v-if="!filtered.length" class="m-0 py-6 text-center text-[13px] text-[var(--text-muted)]">{{ transactions.length ? 'Aucun mouvement ne correspond à ces filtres.' : 'Aucun mouvement pour l\'instant : vos recharges, paiements et retraits apparaîtront ici.' }}</p>
      <p v-if="moreError" class="mb-0 mt-2.5 text-center text-[13px] font-semibold text-danger-fg">La suite de l'historique n'a pas pu être chargée.</p>
      <div v-if="transactions.length < total" class="mt-3 text-center">
        <CoreButton size="sm" tone="secondary" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Chargement…' : moreError ? 'Réessayer' : `Afficher plus (${total - transactions.length} restants)` }}
        </CoreButton>
      </div>
    </template>
  </section>
</template>
