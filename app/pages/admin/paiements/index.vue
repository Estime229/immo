<script setup lang="ts">
/**
 * Paiements : les passerelles en cartes (désactivation et passage en production confirmés en
 * ligne), puis les outils — vérifier une transaction, relancer les webhooks, rembourser.
 * Avant : interrupteurs sans confirmation, remboursement dans une modale, motif facultatif.
 * `?tx=<id>` (lien « Rembourser » de l'historique) préremplit le remboursement.
 */
import { CreditCard, RefreshCw, Search, Undo2 } from '@lucide/vue'
import type { PaymentGateway } from '~/composables/usePaymentGateways'
import { REFUND_REASONS, retryWebhooksSummary, type TransactionStatus } from '~/composables/usePayments'
import { TRANSACTION_STATUS } from '~/composables/useUsers'
import { transactionTypeLabel } from '~/utils/transactionLabels'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: ['view:payments', 'manage:payments'] })

const route = useRoute()
const router = useRouter()
const { hasPermission } = useAdminAuth()
const { fetchGateways, updateGateway } = usePaymentGateways()
const { fetchTransactionStatus, refundTransaction, retryFailedWebhooks } = usePayments()

const canManage = computed(() => hasPermission('manage:payments'))

/** Une seule confirmation ouverte à la fois : `disable:<id>`, `live:<id>` ou `refund`. */
const confirming = ref<string | null>(null)

function shortId(id: string) {
  return id.length > 14 ? `${id.slice(0, 8)}…` : id
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/* ---------- Passerelles ---------- */
const gateways = ref<PaymentGateway[]>([])
const gwState = ref<'loading' | 'ready' | 'error'>('loading')
const gwBusy = ref<string | null>(null)
const gwError = ref<{ id: string; message: string } | null>(null)
const gwFlash = ref('')

const activeCount = computed(() => gateways.value.filter(g => g.isActive).length)
const testCount = computed(() => gateways.value.filter(g => g.isTestMode).length)

async function loadGateways() {
  gwState.value = 'loading'
  try {
    gateways.value = await fetchGateways()
    gwState.value = 'ready'
  } catch {
    gwState.value = 'error'
  }
}

async function patchGateway(gw: PaymentGateway, data: { isActive?: boolean; isTestMode?: boolean }, done: string) {
  gwBusy.value = gw.id
  gwError.value = null
  gwFlash.value = ''
  try {
    Object.assign(gw, await updateGateway(gw.id, data))
    confirming.value = null
    gwFlash.value = done
  } catch (e: any) {
    gwError.value = { id: gw.id, message: e?.message || 'Le changement n\'a pas pu être enregistré.' }
  } finally {
    gwBusy.value = null
  }
}

/** Couper une passerelle ou la passer en production touche les payeurs : confirmation d'abord. */
function onActiveSwitch(gw: PaymentGateway, next: boolean) {
  gwError.value = null
  if (!next) confirming.value = `disable:${gw.id}`
  else patchGateway(gw, { isActive: true }, `${gw.name} est réactivée : elle est de nouveau proposée au paiement.`)
}
function onTestSwitch(gw: PaymentGateway, next: boolean) {
  gwError.value = null
  if (!next) confirming.value = `live:${gw.id}`
  else patchGateway(gw, { isTestMode: true }, `${gw.name} repasse en mode test : ses paiements passent par l'environnement de test de la passerelle.`)
}

/* ---------- Vérifier une transaction ---------- */
const lookupInput = ref('')
const lookedUp = ref('')
const lookupState = ref<'idle' | 'loading' | 'found' | 'notfound' | 'error'>('idle')
const lookupResult = ref<TransactionStatus | null>(null)
const lookupError = ref('')

async function lookup() {
  const id = lookupInput.value.trim()
  if (!id) return
  lookedUp.value = id
  lookupState.value = 'loading'
  lookupResult.value = null
  try {
    lookupResult.value = await fetchTransactionStatus(id)
    lookupState.value = 'found'
  } catch (e: any) {
    if (e?.status === 404) {
      lookupState.value = 'notfound'
    } else {
      lookupError.value = e?.message || 'La vérification a échoué.'
      lookupState.value = 'error'
    }
  }
}

/* ---------- Remboursement ---------- */
const refundCard = ref<HTMLElement | null>(null)
const refundId = ref(typeof route.query.tx === 'string' ? route.query.tx : '')
const refundMode = ref<'full' | 'partial'>('full')
const refundAmount = ref('')
const refundReason = ref('')
const refundBusy = ref(false)
const refundError = ref('')
const refundFlash = ref('')

const REFUND_MODES = [
  { value: 'full', label: 'Totalité' },
  { value: 'partial', label: 'Montant partiel' }
]

/** Montant connu seulement si la transaction vient d'être vérifiée avec cet identifiant. */
const refundKnown = computed(() => lookupResult.value && lookupResult.value.id === refundId.value.trim() ? lookupResult.value : null)
const refundAmountNum = computed(() => Number(refundAmount.value) || 0)
const refundAmountError = computed(() => {
  if (refundMode.value !== 'partial' || !refundKnown.value || !refundAmountNum.value) return ''
  const max = Number(refundKnown.value.amount)
  return refundAmountNum.value > max ? `Ne peut dépasser le montant de la transaction (${formatFcfaShort(max)}).` : ''
})
const refundReady = computed(() =>
  !!refundId.value.trim()
  && !!refundReason.value.trim()
  && (refundMode.value === 'full' || refundAmountNum.value > 0)
  && !refundAmountError.value)

const refundMessage = computed(() => {
  const tx = `la transaction ${shortId(refundId.value.trim())}`
  if (refundMode.value === 'partial') return `Rembourser ${formatFcfaShort(refundAmountNum.value)} sur ${tx} ? Cette action est définitive.`
  if (refundKnown.value) return `Rembourser la totalité de ${tx} (${formatFcfaShort(Number(refundKnown.value.amount))}) ? Cette action est définitive.`
  return `Rembourser la totalité de ${tx} ? Cette action est définitive.`
})

function onRefundAmountInput(e: Event) {
  refundAmount.value = (e.target as HTMLInputElement).value.replace(/\D/g, '')
}

function prefillRefund(tx: TransactionStatus) {
  refundId.value = tx.id
  refundFlash.value = ''
  refundError.value = ''
  refundCard.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function doRefund() {
  const id = refundId.value.trim()
  refundBusy.value = true
  refundError.value = ''
  refundFlash.value = ''
  try {
    const res = await refundTransaction(id, refundMode.value === 'partial' ? refundAmountNum.value : undefined, refundReason.value.trim())
    refundFlash.value = `Remboursement enregistré : ${formatFcfaShort(Number(res.amount))} sur la transaction ${shortId(id)}${res.id ? ` (réf. ${res.id})` : ''}.`
    confirming.value = null
    refundId.value = ''
    refundMode.value = 'full'
    refundAmount.value = ''
    refundReason.value = ''
    if (lookupResult.value?.id === id) lookup()
    if (route.query.tx) router.replace({ query: { ...route.query, tx: undefined } })
  } catch (e: any) {
    refundError.value = e?.message || 'Le remboursement a échoué.'
    confirming.value = null
  } finally {
    refundBusy.value = false
  }
}

/* ---------- Webhooks ---------- */
const retryBusy = ref(false)
const retryResult = ref('')
const retryError = ref('')

async function retryWebhooks() {
  retryBusy.value = true
  retryResult.value = ''
  retryError.value = ''
  try {
    retryResult.value = retryWebhooksSummary(await retryFailedWebhooks())
  } catch (e: any) {
    retryError.value = e?.message || 'La relance a échoué.'
  } finally {
    retryBusy.value = false
  }
}

onMounted(loadGateways)
</script>

<template>
  <div class="flex animate-[im-fade_.3s_ease_backwards] flex-col gap-4.5">
    <!-- Passerelles -->
    <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="m-0 text-[15px] font-bold">Passerelles de paiement</h2>
        <p v-if="gwState === 'ready' && gateways.length" class="m-0 text-[12.5px] text-[var(--text-muted)]">
          <span class="font-mono font-bold">{{ activeCount }}</span> active{{ activeCount > 1 ? 's' : '' }} sur <span class="font-mono font-bold">{{ gateways.length }}</span>
          <template v-if="testCount"> · <span class="font-mono font-bold">{{ testCount }}</span> en mode test</template>
        </p>
      </div>
      <p class="mb-4 mt-1.5 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
        Une passerelle désactivée n'est plus proposée aux utilisateurs au moment de payer. En mode test, ses paiements passent par l'environnement de test de la passerelle.
      </p>

      <p v-if="gwFlash" class="mb-3.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ gwFlash }}</p>

      <div v-if="gwState === 'loading'" class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <DataSkeletonCard v-for="i in 3" :key="i" :height="170" :lines="0" />
      </div>

      <FeedbackAlertBanner v-else-if="gwState === 'error'" tone="danger">
        Impossible de charger les passerelles de paiement.
        <button type="button" class="ml-2 font-bold underline" @click="loadGateways">Réessayer</button>
      </FeedbackAlertBanner>

      <p v-else-if="!gateways.length" class="m-0 rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        Aucune passerelle configurée : aucun paiement en ligne n'est possible pour l'instant.
      </p>

      <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="gw in gateways"
          :key="gw.id"
          class="flex flex-col rounded-xl border border-[var(--border-subtle)] p-4.5"
          :class="gw.isActive ? 'bg-white' : 'bg-[var(--surface-page)]'"
        >
          <div class="flex items-start gap-3">
            <div class="grid h-10 w-10 flex-none place-items-center rounded-md" :class="gw.isActive ? 'bg-green-50 text-green-700' : 'bg-sand-200 text-sand-700'">
              <CreditCard class="h-[18px] w-[18px]" :stroke-width="1.9" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold">{{ gw.name }}</p>
              <p class="mb-0 mt-0.5 font-mono text-xs text-[var(--text-faint)]">{{ gw.type }}</p>
            </div>
            <AdminBadge :tone="gw.isActive ? 'success' : 'neutral'">{{ gw.isActive ? 'Active' : 'Désactivée' }}</AdminBadge>
          </div>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <AdminBadge :tone="gw.isTestMode ? 'warning' : 'primary'">{{ gw.isTestMode ? 'Mode test' : 'Production' }}</AdminBadge>
            <AdminBadge v-if="gw.is_system" tone="neutral">Système</AdminBadge>
          </div>

          <div v-if="canManage" class="mt-3.5 flex flex-col gap-3 border-t border-sand-200 pt-3.5">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="m-0 text-[13.5px] font-bold">Proposée au paiement</p>
                <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ gw.isActive ? 'Visible des utilisateurs' : 'Masquée aux utilisateurs' }}</p>
              </div>
              <AdminSwitch
                :model-value="gw.isActive"
                :aria-label="`Activer ${gw.name}`"
                :disabled="gwBusy === gw.id || confirming === `disable:${gw.id}`"
                class="disabled:cursor-not-allowed disabled:opacity-50"
                @update:model-value="v => onActiveSwitch(gw, v)"
              />
            </div>
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="m-0 text-[13.5px] font-bold">Mode test</p>
                <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ gw.isTestMode ? 'Environnement de test, aucun débit réel' : 'Paiements réels' }}</p>
              </div>
              <AdminSwitch
                :model-value="gw.isTestMode"
                :aria-label="`Mode test de ${gw.name}`"
                :disabled="gwBusy === gw.id || confirming === `live:${gw.id}`"
                class="disabled:cursor-not-allowed disabled:opacity-50"
                @update:model-value="v => onTestSwitch(gw, v)"
              />
            </div>

            <AdminInlineConfirm
              v-if="confirming === `disable:${gw.id}`"
              tone="danger"
              :message="`Désactiver ${gw.name} ? Elle ne sera plus proposée aux utilisateurs au moment de payer, jusqu'à sa réactivation.`"
              confirm-label="Désactiver"
              :loading="gwBusy === gw.id"
              @confirm="patchGateway(gw, { isActive: false }, `${gw.name} est désactivée : elle n'est plus proposée au paiement.`)"
              @cancel="confirming = null"
            />
            <AdminInlineConfirm
              v-else-if="confirming === `live:${gw.id}`"
              :message="`Passer ${gw.name} en production ? Ses paiements seront réels et débités sur les comptes des payeurs.`"
              confirm-label="Passer en production"
              :loading="gwBusy === gw.id"
              @confirm="patchGateway(gw, { isTestMode: false }, `${gw.name} est en production : ses paiements sont désormais réels.`)"
              @cancel="confirming = null"
            />
            <p v-if="gwError?.id === gw.id" class="m-0 text-[13px] font-semibold text-danger-fg">{{ gwError.message }}</p>
          </div>
        </article>
      </div>

      <p class="mb-0 mt-3.5 text-xs leading-[1.5] text-[var(--text-faint)]">
        Les clés d'API des passerelles sont masquées par le serveur et ne se modifient pas depuis cette page.
      </p>
    </section>

    <!-- Outils -->
    <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-2">
      <div class="flex flex-col gap-4.5" :class="canManage ? '' : 'lg:col-span-2'">
        <!-- Vérifier une transaction -->
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <h2 class="m-0 text-[15px] font-bold">Vérifier une transaction</h2>
          <p class="mb-3.5 mt-1 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">Statut, montant et référence, à partir de l'identifiant interne ou de la référence de la passerelle.</p>
          <form class="flex flex-wrap gap-2" @submit.prevent="lookup">
            <input
              v-model="lookupInput"
              aria-label="Identifiant ou référence de la transaction"
              placeholder="Identifiant ou référence"
              class="h-[42px] min-w-[200px] flex-1 rounded-pill border border-[var(--border-default)] bg-white px-4 font-mono text-[13px] outline-none focus:border-green-600"
            >
            <AdminButton type="submit" variant="secondary" :disabled="!lookupInput.trim()" :loading="lookupState === 'loading'">
              <Search class="h-4 w-4" :stroke-width="1.9" /> Vérifier
            </AdminButton>
          </form>

          <div v-if="lookupState === 'found' && lookupResult" class="mt-3.5 rounded-md bg-[var(--surface-page)] p-3.5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="m-0 text-sm font-bold">{{ transactionTypeLabel(lookupResult.type) }}</p>
                <p class="mb-0 mt-0.5 font-mono text-xs text-[var(--text-faint)]">{{ formatDateTime(lookupResult.created_at) }}</p>
              </div>
              <p class="m-0 font-mono text-lg font-bold tracking-[-.02em] text-green-900">{{ formatFcfaShort(Number(lookupResult.amount)) }}</p>
            </div>
            <dl class="mb-0 mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
              <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Statut</dt>
              <dd class="m-0"><AdminBadge :tone="TRANSACTION_STATUS[lookupResult.status]?.tone ?? 'neutral'">{{ TRANSACTION_STATUS[lookupResult.status]?.label ?? lookupResult.status }}</AdminBadge></dd>
              <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Référence</dt>
              <dd class="m-0 break-all font-mono text-[13px]">{{ lookupResult.gateway_ref || '—' }}</dd>
              <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Identifiant</dt>
              <dd class="m-0 break-all font-mono text-[13px]">{{ lookupResult.id }}</dd>
            </dl>
            <button
              v-if="canManage && lookupResult.status === 'completed'"
              type="button"
              class="mt-3 text-[12.5px] font-bold text-green-700 underline"
              @click="prefillRefund(lookupResult)"
            >Rembourser cette transaction</button>
          </div>

          <p v-else-if="lookupState === 'notfound'" class="mb-0 mt-3.5 rounded-md border border-dashed border-[var(--border-default)] px-3.5 py-3 text-[13px] leading-[1.55] text-[var(--text-muted)]">
            Aucune transaction trouvée pour « <span class="font-mono">{{ lookedUp }}</span> ». L'API ne cherche pour l'instant que dans le wallet du compte connecté : pour la transaction d'un autre compte, passez par
            <NuxtLink to="/admin/wallet" class="font-bold text-green-700 underline">l'historique des transactions</NuxtLink>.
          </p>
          <p v-else-if="lookupState === 'error'" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ lookupError }}</p>
        </section>

        <!-- Webhooks -->
        <section v-if="canManage" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <h2 class="m-0 text-[15px] font-bold">Webhooks en échec</h2>
          <p class="mb-3.5 mt-1 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
            Relance le traitement des notifications de paiement envoyées par les passerelles et restées en échec.
          </p>
          <AdminButton variant="secondary" :loading="retryBusy" @click="retryWebhooks">
            <RefreshCw class="h-4 w-4" :stroke-width="1.9" /> Relancer les webhooks en échec
          </AdminButton>
          <p v-if="retryResult" class="mb-0 mt-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ retryResult }}</p>
          <p v-if="retryError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ retryError }}</p>
        </section>
      </div>

      <!-- Remboursement -->
      <section v-if="canManage" id="remboursement" ref="refundCard" class="scroll-mt-[94px] rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <h2 class="m-0 text-[15px] font-bold">Rembourser une transaction</h2>
        <p class="mb-4 mt-1 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">Remboursement total ou partiel, enregistré avec son motif.</p>

        <p v-if="refundFlash" class="mb-4 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ refundFlash }}</p>

        <div class="flex flex-col gap-4">
          <label class="block">
            <span class="mb-[7px] block text-[12.5px] font-bold text-[var(--text-primary)]">Identifiant de la transaction</span>
            <input
              v-model="refundId"
              placeholder="UUID de la transaction"
              class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-[13px] outline-none focus:border-green-600"
            >
          </label>

          <div>
            <p class="mb-[7px] mt-0 text-[12.5px] font-bold text-[var(--text-primary)]">Montant</p>
            <FormsSegmentedControl v-model="refundMode" :options="REFUND_MODES" size="sm" />
            <div v-if="refundMode === 'partial'" class="mt-2.5">
              <div class="flex items-baseline gap-2 rounded-md border-[1.5px] bg-white px-[15px] py-2.5 focus-within:border-green-600" :class="refundAmountError ? 'border-danger-border' : 'border-[var(--border-default)]'">
                <input :value="refundAmount" inputmode="numeric" aria-label="Montant à rembourser" placeholder="0" class="min-w-0 flex-1 border-0 bg-transparent font-mono text-xl font-bold outline-none" @input="onRefundAmountInput">
                <span class="font-mono text-sm font-bold text-[var(--text-faint)]">FCFA</span>
              </div>
              <p v-if="refundAmountError" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-danger-fg">{{ refundAmountError }}</p>
            </div>
            <p v-else-if="refundKnown" class="mb-0 mt-2 text-xs text-[var(--text-muted)]">
              Montant de la transaction : <span class="font-mono font-bold">{{ formatFcfaShort(Number(refundKnown.amount)) }}</span>
            </p>
          </div>

          <div>
            <p class="mb-[7px] mt-0 text-[12.5px] font-bold text-[var(--text-primary)]">Motif <span class="font-semibold text-[var(--text-faint)]">(obligatoire)</span></p>
            <div class="mb-2 flex flex-wrap gap-1.5">
              <AdminTag v-for="r in REFUND_REASONS" :key="r" :selected="refundReason === r" @click="refundReason = r">{{ r }}</AdminTag>
            </div>
            <textarea
              v-model="refundReason"
              rows="2"
              maxlength="500"
              placeholder="Précisez le motif du remboursement"
              class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none focus:border-green-600"
            />
          </div>

          <AdminInlineConfirm
            v-if="confirming === 'refund'"
            tone="danger"
            :message="refundMessage"
            confirm-label="Rembourser"
            :loading="refundBusy"
            :disabled="!refundReady"
            @confirm="doRefund"
            @cancel="confirming = null"
          />
          <div v-else>
            <AdminButton variant="danger" :disabled="!refundReady" @click="confirming = 'refund'; refundError = ''">
              <Undo2 class="h-4 w-4" :stroke-width="1.9" /> Rembourser…
            </AdminButton>
          </div>
          <p v-if="refundError" class="m-0 text-[13px] font-semibold text-danger-fg">{{ refundError }}</p>
        </div>
      </section>
    </div>
  </div>
</template>
