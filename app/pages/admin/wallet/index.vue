<script setup lang="ts">
/**
 * Retraits & wallets : d'abord la file des retraits à verser (du plus ancien au plus récent),
 * puis l'historique de toutes les transactions (filtres dans l'URL), puis le crédit manuel.
 * Avant : approbation dans une modale sans référence de versement, refus par motif libre,
 * crédit d'un wallet en collant l'UUID du compte.
 */
import { ArrowDownLeft, ArrowUpRight, Plus, Search, X } from '@lucide/vue'
import { ADMIN_ROLE_LABELS, paymentMethodLabel, TRANSACTION_STATUS, type UserListItem } from '~/composables/useUsers'
import {
  formatMomoNumber,
  isCreditAmount,
  MANUAL_CREDIT_TYPES,
  payoutChannelLabel,
  payoutNumberDiffers,
  withdrawalsTotal,
  WITHDRAWAL_REJECT_REASONS,
  type ManualTransactionType,
  type PendingWithdrawal,
  type WalletTransaction
} from '~/composables/useWallet'
import { TRANSACTION_TYPE_LABELS, transactionTypeLabel } from '~/utils/transactionLabels'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: ['manage:withdrawals', 'view:audit', 'manage:payments'] })

const route = useRoute()
const router = useRouter()
const { hasPermission } = useAdminAuth()
const { fetchTransactions, fetchPendingWithdrawals, approveWithdrawal, rejectWithdrawal, creditWallet } = useWallet()
const { fetchUsers } = useUsers()
const { refresh: refreshCounts } = useAdminCounts()

const canManageWithdrawals = computed(() => hasPermission('manage:withdrawals'))
const canViewAudit = computed(() => hasPermission('view:audit'))
const canManagePayments = computed(() => hasPermission('manage:payments'))

function holderName(u?: { first_name: string | null; last_name: string | null; email?: string } | null) {
  return personName(u?.first_name, u?.last_name) || u?.email || 'Compte sans nom'
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function waitingDays(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
function waitingLabel(iso: string) {
  const since = formatAnciennete(iso)
  return since === "aujourd'hui" ? "Demandé aujourd'hui" : `En attente depuis ${since}`
}

/* ---------- File des retraits ---------- */
const queue = ref<PendingWithdrawal[]>([])
const queueState = ref<'loading' | 'ready' | 'error'>('loading')
const queueFlash = ref('')
const queueError = ref('')
const queueTotal = computed(() => withdrawalsTotal(queue.value))

async function loadQueue(silent = false) {
  if (!canManageWithdrawals.value) return
  if (!silent) queueState.value = 'loading'
  try {
    queue.value = await fetchPendingWithdrawals()
    queueState.value = 'ready'
  } catch {
    if (!silent) queueState.value = 'error'
  }
}

/** Une seule confirmation ouverte à la fois sur l'écran. */
const confirming = ref<{ id: string; kind: 'approve' | 'reject' } | null>(null)
const payoutRef = ref('')
const reason = ref('')
const busyId = ref<string | null>(null)
const cardError = ref<{ id: string; message: string } | null>(null)

function openConfirm(id: string, kind: 'approve' | 'reject') {
  confirming.value = { id, kind }
  payoutRef.value = ''
  reason.value = ''
  cardError.value = null
}

async function decide(w: PendingWithdrawal) {
  const kind = confirming.value?.kind
  if (!kind) return
  const name = holderName(w.user)
  const amount = formatFcfaShort(Number(w.amount))
  busyId.value = w.id
  cardError.value = null
  queueError.value = ''
  queueFlash.value = ''
  try {
    if (kind === 'approve') {
      const reference = payoutRef.value.trim()
      await approveWithdrawal(w.id, reference)
      queueFlash.value = `Versement de ${amount} à ${name} confirmé (réf. ${reference}).`
    } else {
      await rejectWithdrawal(w.id, reason.value.trim())
      queueFlash.value = `Retrait de ${amount} de ${name} refusé. Le motif est affiché dans son espace, avec la demande.`
    }
    queue.value = queue.value.filter(x => x.id !== w.id)
    confirming.value = null
    refreshCounts()
    loadTransactions()
  } catch (e: any) {
    const message = e?.message || 'La décision n\'a pas pu être enregistrée.'
    // Déjà traité ailleurs (400/404) : on recharge la file ; si la carte a disparu, l'erreur remonte en tête de file.
    if (e?.status === 400 || e?.status === 404) {
      await loadQueue(true)
      if (!queue.value.some(x => x.id === w.id)) {
        confirming.value = null
        queueError.value = `${message} La file vient d'être mise à jour.`
        refreshCounts()
        return
      }
    }
    cardError.value = { id: w.id, message }
  } finally {
    busyId.value = null
  }
}

/* ---------- Historique des transactions (filtres dans l'URL) ---------- */
const PAGE_SIZE = 20
const TX_TYPE_OPTIONS = Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => ({ value, label }))
const TX_STATUS_OPTIONS = [
  { value: 'completed', label: 'Réussies' },
  { value: 'pending', label: 'En attente' },
  { value: 'failed', label: 'Échouées' }
]

function queryString(key: string) {
  const v = route.query[key]
  return typeof v === 'string' ? v : ''
}
const filters = computed(() => ({
  q: queryString('q'),
  type: queryString('type'),
  status: queryString('status'),
  order: queryString('order') === 'asc' ? 'ASC' as const : 'DESC' as const,
  page: Math.max(1, Number.parseInt(queryString('page'), 10) || 1)
}))
const hasFilters = computed(() => !!(filters.value.q || filters.value.type || filters.value.status))

/** Toute modification de filtre ramène en page 1, sauf si `page` est lui-même modifié. */
function setQuery(patch: Record<string, string | number>) {
  const merged: Record<string, unknown> = { ...route.query, page: undefined, ...patch }
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries(merged)) {
    if (v == null || v === '' || (k === 'page' && Number(v) <= 1) || (k === 'order' && v !== 'asc')) continue
    next[k] = String(v)
  }
  router.replace({ query: next })
}
function onFilterChange(key: 'type' | 'status' | 'order', e: Event) {
  setQuery({ [key]: (e.target as HTMLSelectElement).value })
}
function clearFilters() {
  searchInput.value = ''
  setQuery({ q: '', type: '', status: '' })
}

const searchInput = ref(filters.value.q)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, v => {
  clearTimeout(searchTimer)
  if (v.trim() === filters.value.q) return
  searchTimer = setTimeout(() => setQuery({ q: v.trim() }), 400)
})
// Retour arrière : le champ suit l'URL.
watch(() => filters.value.q, q => { if (q !== searchInput.value.trim()) searchInput.value = q })

const txs = ref<WalletTransaction[]>([])
const txTotal = ref(0)
const txState = ref<'loading' | 'ready' | 'error'>('loading')
const txPageCount = computed(() => pageCount(txTotal.value, PAGE_SIZE))
let txRequest = 0

async function loadTransactions() {
  if (!canViewAudit.value) return
  const id = ++txRequest
  const f = filters.value
  txState.value = 'loading'
  try {
    const res = await fetchTransactions({
      page: f.page,
      limit: PAGE_SIZE,
      search: f.q || undefined,
      type: f.type || undefined,
      status: f.status || undefined,
      sortOrder: f.order
    })
    if (id !== txRequest) return
    txs.value = res.data
    txTotal.value = res.total
    txState.value = 'ready'
    // Page hors limites (lien ancien, filtre resserré) : on revient à la dernière page existante.
    if (!res.data.length && res.total > 0 && f.page > 1) setQuery({ page: pageCount(res.total, PAGE_SIZE) })
  } catch {
    if (id === txRequest) txState.value = 'error'
  }
}
watch(() => JSON.stringify(filters.value), loadTransactions)

function txHolder(t: WalletTransaction) {
  return t.wallet?.user ? holderName(t.wallet.user) : ''
}

/* ---------- Crédit manuel ---------- */
const creditOpen = ref(false)
const creditUser = ref<UserListItem | null>(null)
const userQuery = ref('')
const userResults = ref<UserListItem[]>([])
const userSearchState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const creditAmount = ref('')
const creditType = ref<ManualTransactionType>('saving')
const creditRef = ref('')
const creditSaving = ref(false)
const creditError = ref('')
const creditFlash = ref('')

const creditAmountNum = computed(() => Number(creditAmount.value) || 0)
const creditTypeLabel = computed(() => MANUAL_CREDIT_TYPES.find(t => t.value === creditType.value)?.label ?? '')
const creditReady = computed(() => !!creditUser.value && creditAmountNum.value > 0)

function openCredit() {
  creditUser.value = null
  userQuery.value = ''
  userResults.value = []
  userSearchState.value = 'idle'
  creditAmount.value = ''
  creditType.value = 'saving'
  creditRef.value = ''
  creditError.value = ''
  creditFlash.value = ''
  creditOpen.value = true
}

let userTimer: ReturnType<typeof setTimeout> | undefined
let userRequest = 0
watch(userQuery, q => {
  clearTimeout(userTimer)
  const term = q.trim()
  if (term.length < 2) {
    userResults.value = []
    userSearchState.value = 'idle'
    return
  }
  userSearchState.value = 'loading'
  userTimer = setTimeout(async () => {
    const id = ++userRequest
    try {
      const res = await fetchUsers({ search: term, limit: 6, page: 1 })
      if (id !== userRequest) return
      userResults.value = res.data
      userSearchState.value = 'ready'
    } catch {
      if (id === userRequest) userSearchState.value = 'error'
    }
  }, 300)
})

function onCreditAmountInput(e: Event) {
  creditAmount.value = (e.target as HTMLInputElement).value.replace(/\D/g, '')
}

async function submitCredit() {
  if (!creditReady.value || !creditUser.value) return
  creditSaving.value = true
  creditError.value = ''
  try {
    await creditWallet(creditUser.value.id, creditAmountNum.value, creditType.value, creditRef.value.trim() || undefined)
    creditFlash.value = `Wallet de ${holderName(creditUser.value)} crédité de ${formatFcfaShort(creditAmountNum.value)} (${creditTypeLabel.value}).${canViewAudit.value ? ' L\'opération figure dans l\'historique.' : ''}`
    creditOpen.value = false
    loadTransactions()
  } catch (e: any) {
    creditError.value = e?.message || 'Le crédit n\'a pas pu être enregistré.'
  } finally {
    creditSaving.value = false
  }
}

onMounted(() => {
  loadQueue()
  loadTransactions()
})
</script>

<template>
  <div class="flex animate-[im-fade_.3s_ease_backwards] flex-col gap-4.5">
    <!-- File des retraits -->
    <section v-if="canManageWithdrawals" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 class="m-0 text-[15px] font-bold">Retraits à verser</h2>
        <span v-if="queue.length" class="rounded-pill bg-danger-fg px-2.5 py-0.5 text-xs font-black text-white">{{ queue.length }}</span>
        <p v-if="queue.length" class="m-0 ml-auto text-[12.5px] text-[var(--text-muted)]">
          <span class="font-mono text-sm font-bold text-green-900">{{ formatFcfa(queueTotal) }}</span> à verser au total
        </p>
      </div>
      <p class="mb-4 mt-1.5 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
        Du plus ancien au plus récent. Effectuez le transfert Mobile Money vers le numéro indiqué, puis confirmez le versement avec la référence de l'opérateur.
      </p>

      <p v-if="queueFlash" class="mb-3.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ queueFlash }}</p>
      <p v-if="queueError" class="mb-3.5 mt-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ queueError }}</p>

      <div v-if="queueState === 'loading'" class="flex flex-col gap-3">
        <DataSkeletonCard v-for="i in 2" :key="i" :height="150" :lines="0" />
      </div>

      <FeedbackAlertBanner v-else-if="queueState === 'error'" tone="danger">
        Impossible de charger les retraits en attente.
        <button type="button" class="ml-2 font-bold underline" @click="loadQueue()">Réessayer</button>
      </FeedbackAlertBanner>

      <p v-else-if="!queue.length" class="m-0 rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        Aucun retrait en attente : la file est à jour.
      </p>

      <div v-else class="flex flex-col gap-3">
        <article
          v-for="(w, i) in queue"
          :key="w.id"
          class="rounded-xl border bg-white p-4.5"
          :class="i === 0 ? 'border-green-600/40 shadow-card' : 'border-[var(--border-subtle)]'"
        >
          <div class="flex flex-wrap items-start gap-3.5">
            <CoreAvatar :name="holderName(w.user)" :size="42" />
            <div class="min-w-[160px] flex-1">
              <NuxtLink :to="`/admin/utilisateurs/${w.user.id}`" class="text-[15px] font-bold text-[var(--text-primary)] hover:text-green-700 hover:underline">{{ holderName(w.user) }}</NuxtLink>
              <p class="mb-0 mt-0.5 truncate text-[12.5px] text-[var(--text-muted)]">{{ w.user.email }}</p>
            </div>
            <div class="ml-auto text-right">
              <p class="m-0 font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ formatFcfa(Number(w.amount)) }}</p>
              <p class="mb-0 mt-0.5 text-xs" :class="waitingDays(w.created_at) >= 2 ? 'font-bold text-warn-fg' : 'text-[var(--text-faint)]'">{{ waitingLabel(w.created_at) }}</p>
            </div>
          </div>

          <dl class="mb-0 mt-3.5 grid grid-cols-1 gap-3 rounded-md bg-[var(--surface-page)] p-3.5 sm:grid-cols-3">
            <div>
              <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Moyen</dt>
              <dd class="m-0 mt-1 text-[13.5px] font-bold">{{ payoutChannelLabel(w.method) }}</dd>
            </div>
            <div>
              <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Numéro à créditer</dt>
              <dd class="m-0 mt-1 font-mono text-[13.5px] font-bold">{{ formatMomoNumber(w.phone_number) }}</dd>
            </div>
            <div>
              <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Demandé le</dt>
              <dd class="m-0 mt-1 font-mono text-[13px]">{{ formatDateTime(w.created_at) }}</dd>
            </div>
          </dl>
          <p v-if="payoutNumberDiffers(w.phone_number, w.user.phone_number)" class="mb-0 mt-2 text-xs font-semibold text-warn-fg">
            Numéro différent de celui du compte (<span class="font-mono">{{ formatMomoNumber(w.user.phone_number) }}</span>) : vérifiez avant de verser.
          </p>

          <div class="mt-3.5">
            <AdminInlineConfirm
              v-if="confirming?.id === w.id && confirming.kind === 'approve'"
              :message="`Confirmer le versement de ${formatFcfaShort(Number(w.amount))} à ${holderName(w.user)} ? Cette action est définitive.`"
              confirm-label="Confirmer le versement"
              :loading="busyId === w.id"
              :disabled="!payoutRef.trim()"
              @confirm="decide(w)"
              @cancel="confirming = null"
            >
              <label class="block">
                <span class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-primary)]">Référence du transfert Mobile Money</span>
                <input
                  v-model="payoutRef"
                  maxlength="120"
                  placeholder="Ex. TXN-MTN-2026041800123"
                  class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 font-mono text-[13px] outline-none focus:border-green-600"
                  @keydown.enter="payoutRef.trim() && decide(w)"
                >
              </label>
              <p class="mb-0 mt-1.5 text-xs leading-[1.5] text-[var(--text-muted)]">
                Envoyez d'abord <span class="font-mono font-bold">{{ formatFcfaShort(Number(w.amount)) }}</span> au <span class="font-mono">{{ formatMomoNumber(w.phone_number) }}</span> ({{ payoutChannelLabel(w.method) }}), puis saisissez la référence reçue de l'opérateur.
              </p>
            </AdminInlineConfirm>

            <AdminInlineConfirm
              v-else-if="confirming?.id === w.id && confirming.kind === 'reject'"
              tone="danger"
              :message="`Refuser le retrait de ${formatFcfaShort(Number(w.amount))} demandé par ${holderName(w.user)} ? Le motif lui sera affiché.`"
              confirm-label="Refuser le retrait"
              :loading="busyId === w.id"
              :disabled="!reason.trim()"
              @confirm="decide(w)"
              @cancel="confirming = null"
            >
              <div class="mb-2 flex flex-wrap gap-1.5">
                <AdminTag v-for="r in WITHDRAWAL_REJECT_REASONS" :key="r" :selected="reason === r" @click="reason = r">{{ r }}</AdminTag>
              </div>
              <textarea
                v-model="reason"
                rows="2"
                maxlength="500"
                placeholder="Motif du refus (obligatoire, visible par le demandeur)"
                class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none focus:border-green-600"
              />
            </AdminInlineConfirm>

            <div v-else class="flex flex-wrap gap-2">
              <AdminButton size="sm" :variant="i === 0 && !confirming ? 'primary' : 'secondary'" @click="openConfirm(w.id, 'approve')">Approuver le versement</AdminButton>
              <AdminButton size="sm" variant="secondary" @click="openConfirm(w.id, 'reject')">Refuser</AdminButton>
            </div>
            <p v-if="cardError?.id === w.id" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ cardError.message }}</p>
          </div>
        </article>
      </div>
    </section>

    <!-- Historique des transactions -->
    <section v-if="canViewAudit" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <div class="mb-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="m-0 text-[15px] font-bold">Historique des transactions</h2>
        <span v-if="txState === 'ready'" class="text-[12.5px] text-[var(--text-muted)]">
          <span class="font-mono font-bold">{{ txTotal.toLocaleString('fr-FR') }}</span> {{ hasFilters ? `résultat${txTotal > 1 ? 's' : ''}` : `transaction${txTotal > 1 ? 's' : ''}` }}
        </span>
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <div class="flex h-[42px] min-w-[200px] flex-1 items-center gap-2 rounded-pill border border-[var(--border-default)] bg-white px-4 focus-within:border-green-600 md:max-w-[300px]">
          <Search class="h-4 w-4 shrink-0 text-[var(--text-faint)]" :stroke-width="1.9" />
          <input
            v-model="searchInput"
            type="search"
            aria-label="Rechercher un titulaire"
            placeholder="Prénom ou nom du titulaire"
            class="w-full min-w-0 bg-transparent text-[13.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
          >
        </div>
        <select
          :value="filters.type"
          aria-label="Type de transaction"
          class="h-[42px] cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none"
          @change="onFilterChange('type', $event)"
        >
          <option value="">Tous les types</option>
          <option v-for="o in TX_TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <select
          :value="filters.status"
          aria-label="Statut"
          class="h-[42px] cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none"
          @change="onFilterChange('status', $event)"
        >
          <option value="">Tous les statuts</option>
          <option v-for="o in TX_STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <select
          :value="filters.order === 'ASC' ? 'asc' : 'desc'"
          aria-label="Ordre"
          class="h-[42px] cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none"
          @change="onFilterChange('order', $event)"
        >
          <option value="desc">Plus récentes d'abord</option>
          <option value="asc">Plus anciennes d'abord</option>
        </select>
        <button
          v-if="hasFilters"
          type="button"
          class="flex h-[42px] cursor-pointer items-center gap-1.5 rounded-pill px-3 text-[13px] font-bold text-[var(--text-muted)] hover:text-danger-fg"
          @click="clearFilters"
        >
          <X class="h-3.5 w-3.5" :stroke-width="1.9" /> Effacer
        </button>
      </div>

      <div v-if="txState === 'loading' && !txs.length" class="flex flex-col gap-2">
        <DataSkeletonCard v-for="i in 4" :key="i" :height="54" :lines="0" />
      </div>

      <FeedbackAlertBanner v-else-if="txState === 'error'" tone="danger">
        Impossible de charger l'historique des transactions.
        <button type="button" class="ml-2 font-bold underline" @click="loadTransactions">Réessayer</button>
      </FeedbackAlertBanner>

      <p v-else-if="!txs.length && hasFilters" class="m-0 rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        Aucune transaction ne correspond à ces filtres.
        <button type="button" class="ml-1 font-bold text-green-700 underline" @click="clearFilters">Effacer les filtres</button>
      </p>

      <p v-else-if="!txs.length" class="m-0 rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        Aucune transaction enregistrée pour l'instant.
      </p>

      <template v-else>
        <div class="transition-opacity" :class="txState === 'loading' ? 'opacity-60' : ''">
          <div
            v-for="t in txs"
            :key="t.id"
            class="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 border-b border-sand-200 py-3 last:border-b-0 sm:grid-cols-[40px_minmax(0,1fr)_auto]"
          >
            <div
              class="row-span-2 grid h-10 w-10 place-items-center rounded-md sm:row-span-1"
              :class="isCreditAmount(t.amount) ? 'bg-ok-bg text-ok-fg' : 'bg-sand-200 text-sand-800'"
              :aria-label="isCreditAmount(t.amount) ? 'Crédit' : 'Débit'"
            >
              <ArrowDownLeft v-if="isCreditAmount(t.amount)" class="h-[18px] w-[18px]" :stroke-width="1.9" />
              <ArrowUpRight v-else class="h-[18px] w-[18px]" :stroke-width="1.9" />
            </div>
            <div class="min-w-0">
              <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
                {{ transactionTypeLabel(t.type) }}
                <AdminBadge v-if="t.refunded_at" tone="info">Remboursée le {{ new Date(t.refunded_at).toLocaleDateString('fr-FR') }}</AdminBadge>
              </p>
              <p class="mb-0 mt-0.5 text-xs leading-[1.5] text-[var(--text-faint)] [overflow-wrap:anywhere]">
                <NuxtLink v-if="t.wallet?.user_id" :to="`/admin/utilisateurs/${t.wallet.user_id}`" class="font-bold text-green-700 hover:underline">{{ txHolder(t) || 'Titulaire' }}</NuxtLink>
                <template v-if="t.wallet?.user_id"> · </template>
                <span class="font-mono">{{ formatDateTime(t.created_at) }}</span>
                <template v-if="paymentMethodLabel(t.payment_method)"> · {{ paymentMethodLabel(t.payment_method) }}</template>
                <template v-if="t.gateway_ref"> · réf. <span class="font-mono">{{ t.gateway_ref }}</span></template>
              </p>
            </div>
            <div class="col-start-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:col-start-auto sm:flex-col sm:items-end sm:justify-center">
              <span class="font-mono text-[14.5px] font-bold" :class="isCreditAmount(t.amount) ? 'text-ok-fg' : 'text-[var(--text-primary)]'">
                {{ isCreditAmount(t.amount) ? '+' : '−' }}{{ formatFcfaShort(Math.abs(Number(t.amount))) }}
              </span>
              <span class="flex items-center gap-2.5">
                <AdminBadge :tone="TRANSACTION_STATUS[t.status]?.tone ?? 'neutral'">{{ TRANSACTION_STATUS[t.status]?.label ?? t.status }}</AdminBadge>
                <NuxtLink
                  v-if="canManagePayments && t.status === 'completed' && !t.refunded_at"
                  :to="{ path: '/admin/paiements', query: { tx: t.id }, hash: '#remboursement' }"
                  class="text-xs font-bold text-[var(--text-muted)] hover:text-danger-fg hover:underline"
                >Rembourser</NuxtLink>
              </span>
            </div>
          </div>
        </div>

        <AdminPagination :page="filters.page" :page-count="txPageCount" @update:page="p => setQuery({ page: p })" />
      </template>
    </section>

    <!-- Crédit manuel -->
    <section v-if="canManagePayments" class="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <div class="min-w-[220px] flex-1">
        <h2 class="m-0 text-[15px] font-bold">Créditer un wallet</h2>
        <p class="mb-0 mt-1 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
          Pour une compensation ou une correction : le montant est ajouté au wallet du compte choisi, avec une référence pour la traçabilité.
        </p>
        <p v-if="creditFlash" class="mb-0 mt-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ creditFlash }}</p>
      </div>
      <AdminButton variant="secondary" @click="openCredit">
        <Plus class="h-4 w-4" :stroke-width="1.9" /> Créditer un wallet
      </AdminButton>
    </section>

    <AdminModal :open="creditOpen" title="Créditer un wallet" @close="creditOpen = false">
      <div class="flex flex-col gap-4.5">
        <!-- Bénéficiaire -->
        <div>
          <p class="mb-[7px] mt-0 text-[12.5px] font-bold text-[var(--text-primary)]">Compte à créditer</p>
          <div v-if="creditUser" class="flex items-center gap-3 rounded-md border border-green-100 bg-green-50 p-3">
            <CoreAvatar :name="holderName(creditUser)" :size="36" :avatar-url="creditUser.avatar_url" />
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold">{{ holderName(creditUser) }}</p>
              <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-muted)]">{{ ADMIN_ROLE_LABELS[creditUser.role] }} · {{ creditUser.email }}</p>
            </div>
            <button type="button" class="flex-none text-[12.5px] font-bold text-green-700 underline" @click="creditUser = null">Changer</button>
          </div>
          <template v-else>
            <div class="flex h-[46px] items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[15px] focus-within:border-green-600">
              <Search class="h-4 w-4 shrink-0 text-[var(--text-faint)]" :stroke-width="1.9" />
              <input
                v-model="userQuery"
                type="search"
                aria-label="Rechercher un compte"
                placeholder="Prénom, nom ou e-mail"
                class="w-full min-w-0 bg-transparent text-[14.5px] outline-none placeholder:text-[var(--text-faint)]"
              >
            </div>
            <p v-if="userSearchState === 'idle'" class="mb-0 mt-2 text-xs text-[var(--text-faint)]">Tapez au moins deux lettres.</p>
            <p v-else-if="userSearchState === 'loading'" class="mb-0 mt-2 text-xs text-[var(--text-faint)]">Recherche…</p>
            <p v-else-if="userSearchState === 'error'" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">La recherche a échoué. Réessayez.</p>
            <p v-else-if="!userResults.length" class="mb-0 mt-2 text-xs leading-[1.5] text-[var(--text-muted)]">
              Aucun compte pour « {{ userQuery.trim() }} ». La recherche porte sur le prénom, le nom ou l'e-mail, un seul à la fois.
            </p>
            <ul v-else class="mb-0 mt-2 flex list-none flex-col rounded-md border border-[var(--border-subtle)] p-0">
              <li v-for="u in userResults" :key="u.id" class="border-b border-sand-200 last:border-b-0">
                <button type="button" class="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sand-50" @click="creditUser = u">
                  <CoreAvatar :name="holderName(u)" :size="32" :avatar-url="u.avatar_url" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[13.5px] font-bold">{{ holderName(u) }}</span>
                    <span class="block truncate text-xs text-[var(--text-faint)]">{{ ADMIN_ROLE_LABELS[u.role] }} · {{ u.email }}</span>
                  </span>
                </button>
              </li>
            </ul>
          </template>
        </div>

        <!-- Montant -->
        <div>
          <p class="mb-[7px] mt-0 text-[12.5px] font-bold text-[var(--text-primary)]">Montant</p>
          <div class="flex items-baseline gap-2 rounded-md border-[1.5px] border-[var(--border-default)] bg-white px-[15px] py-3 focus-within:border-green-600">
            <input :value="creditAmount" inputmode="numeric" aria-label="Montant à créditer" placeholder="0" class="min-w-0 flex-1 border-0 bg-transparent font-mono text-2xl font-bold outline-none" @input="onCreditAmountInput">
            <span class="font-mono text-[15px] font-bold text-[var(--text-faint)]">FCFA</span>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <label class="block">
            <span class="mb-[7px] block text-[12.5px] font-bold text-[var(--text-primary)]">Nature de l'opération</span>
            <select v-model="creditType" class="h-[46px] w-full cursor-pointer rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-[14px] outline-none">
              <option v-for="opt in MANUAL_CREDIT_TYPES" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-[7px] block text-[12.5px] font-bold text-[var(--text-primary)]">Référence <span class="font-semibold text-[var(--text-faint)]">(facultatif)</span></span>
            <input v-model="creditRef" maxlength="120" placeholder="Ex. COMPENSATION-2026-10" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-[13.5px] outline-none focus:border-green-600">
          </label>
        </div>

        <p v-if="creditReady && creditUser" class="m-0 rounded-md bg-[var(--surface-page)] px-3.5 py-3 text-[13px] leading-[1.5] text-[var(--text-secondary)]">
          Le wallet de <strong>{{ holderName(creditUser) }}</strong> sera crédité de <span class="font-mono font-bold">{{ formatFcfaShort(creditAmountNum) }}</span> ({{ creditTypeLabel }}).
        </p>
        <p v-if="creditError" class="m-0 text-[13px] font-semibold text-danger-fg">{{ creditError }}</p>
      </div>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <AdminButton variant="secondary" :disabled="creditSaving" @click="creditOpen = false">Annuler</AdminButton>
          <AdminButton :disabled="!creditReady" :loading="creditSaving" @click="submitCredit">
            {{ creditAmountNum ? `Créditer ${formatFcfaShort(creditAmountNum)}` : 'Créditer' }}
          </AdminButton>
        </div>
      </template>
    </AdminModal>
  </div>
</template>
