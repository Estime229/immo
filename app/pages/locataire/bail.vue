<script setup lang="ts">
import type { AdvanceBufferStatus, InventoryDetail, PrepaidBufferStatus } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import {
  canTenantSign, cancelUnpaidState, entryBreakdown, invoiceView, leasePhase, leaseStepIndex, LEASE_PHASE_TONE,
  LEASE_STEPS, noticeDepartureDate, RENT_LABEL, sortInvoices, TENANT_LEASE_PHASE_LABEL
} from '~/utils/leases'
import { INVENTORY_STATUS_LABEL, INVENTORY_STATUS_TONE, pickInventory } from '~/utils/inventories'

definePageMeta({ layout: 'locataire' })

const route = useRoute()
const { activeLease, leases, state: leaseState, ensureLoaded, reload: reloadLeases, selectLease } = useTenantLeases()
const leasesApi = useLeasesApi()
const inventoriesApi = useInventoriesApi()
const wallet = useTenantWallet()
const doc = useOpenDocument()
const leaseModal = useLeaseModal()
const { openPay } = usePaymentModal()

/** `?lease=` (notifications, tableau de bord) choisit le bail ; `?pay=` ouvre directement le paiement de cette échéance. */
onMounted(async () => {
  await ensureLoaded()
  const id = typeof route.query.lease === 'string' ? route.query.lease : null
  if (id && leases.value.some(l => l.id === id)) selectLease(id)
  const invoiceId = typeof route.query.pay === 'string' ? route.query.pay : null
  if (invoiceId && activeLease.value?.invoices?.some(i => i.id === invoiceId)) openPay('loyer', invoiceId)
  wallet.reload()
})

const phase = computed(() => (activeLease.value ? leasePhase(activeLease.value) : null))
const paidIn = computed(() => phase.value === 'active' || phase.value === 'notice' || phase.value === 'terminated')

function formatDate(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
/** `unit`/`property` sont réellement `null` sur au moins un bail réel (Lot 37) — jamais supposés présents. */
function leaseLabel(l: { unit: { name: string } | null; property: { name: string } | null }) {
  return [l.unit?.name, l.property?.name].filter(Boolean).join(' — ') || 'Logement'
}
function landlordName() {
  const p = activeLease.value?.landlord
  return `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'votre propriétaire'
}

/* ---- Paiement d'entrée ---- */
const entry = computed(() => (activeLease.value ? entryBreakdown(activeLease.value) : null))
const entryShortfall = computed(() => entry.value && wallet.state.value === 'success' ? Math.max(0, entry.value.total - wallet.spendable.value) : 0)
const graceEnd = computed(() => {
  const s = activeLease.value?.signed_at_tenant
  return s ? new Date(new Date(s).getTime() + 72 * 3600000).toISOString() : null
})
const canBeCancelled = computed(() => (activeLease.value ? cancelUnpaidState(activeLease.value)?.allowed ?? false : false))
const entryPaymentLoading = ref(false)
const entryPaymentError = ref('')
async function payEntry() {
  if (!activeLease.value) return
  entryPaymentLoading.value = true
  entryPaymentError.value = ''
  try {
    await leasesApi.payEntry(activeLease.value.id)
    await Promise.all([reloadLeases(), wallet.reload()])
  } catch (e) {
    entryPaymentError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le paiement d'entrée a échoué.") : "Le paiement d'entrée a échoué."
  } finally {
    entryPaymentLoading.value = false
  }
}

/* ---- Tampons d'avance et prépayé (alimentés par le paiement d'entrée) ---- */
const advanceBuffer = ref<AdvanceBufferStatus | null>(null)
const prepaidBuffer = ref<PrepaidBufferStatus | null>(null)
const buffersLoading = ref(false)
async function loadBuffers() {
  const id = activeLease.value?.id
  advanceBuffer.value = null
  prepaidBuffer.value = null
  if (!id || !paidIn.value || phase.value === 'terminated') return
  buffersLoading.value = true
  try {
    const [adv, pre] = await Promise.all([leasesApi.fetchAdvanceBuffer(id), leasesApi.fetchPrepaidBuffer(id)])
    if (activeLease.value?.id !== id) return
    advanceBuffer.value = adv.advance_target > 0 ? adv : null
    prepaidBuffer.value = pre.prepaid_target > 0 ? pre : null
  } catch {
    advanceBuffer.value = null
    prepaidBuffer.value = null
  } finally {
    buffersLoading.value = false
  }
}
watch(() => [activeLease.value?.id, phase.value], loadBuffers, { immediate: true })
function pct(balance: number, target: number) {
  return target > 0 ? `${Math.min(100, Math.round((balance / target) * 100))}%` : '0%'
}

/* ---- Prélèvement automatique ---- */
const autoDebitLoading = ref(false)
const autoDebitError = ref('')
async function toggleAutoDebit(enabled: boolean) {
  if (!activeLease.value) return
  autoDebitLoading.value = true
  autoDebitError.value = ''
  try {
    await leasesApi.setAutoDebit(activeLease.value.id, enabled)
    await reloadLeases()
  } catch (e) {
    autoDebitError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le réglage n'a pas pu être enregistré.") : "Le réglage n'a pas pu être enregistré."
  } finally {
    autoDebitLoading.value = false
  }
}

/* ---- Échéancier ---- */
const invoices = computed(() => sortInvoices(activeLease.value?.invoices).reverse())

/* ---- Documents ---- */
const docError = ref('')
async function previewContract() {
  if (!activeLease.value) return
  const url = `/leases/${activeLease.value.id}/pdf`
  docError.value = (await doc.open('contract', url, url)) ?? ''
}
async function downloadQuittance(invoiceId: string) {
  docError.value = (await doc.open(invoiceId, `/leases/invoice/${invoiceId}/pdf`)) ?? ''
}

/* ---- États des lieux de ce bail ---- */
const inventories = ref<InventoryDetail[]>([])
watch(() => activeLease.value?.id, async id => {
  inventories.value = []
  if (!id) return
  try {
    const list = await inventoriesApi.fetchByLease(id)
    // Réponse d'un bail qu'on a quitté entre-temps (`?lease=` change le bail juste après le montage) : ignorée.
    if (activeLease.value?.id === id) inventories.value = list
  } catch {
    inventories.value = []
  }
}, { immediate: true })
const entryInventory = computed(() => pickInventory(inventories.value, 'entry'))
const exitInventory = computed(() => pickInventory(inventories.value, 'exit'))

/* ---- Fin de bail ---- */
const departure = computed(() => (activeLease.value ? noticeDepartureDate(activeLease.value) : null))
const cancelNoticeLoading = ref(false)
const cancelNoticeError = ref('')
async function cancelNotice() {
  if (!activeLease.value) return
  cancelNoticeLoading.value = true
  cancelNoticeError.value = ''
  try {
    await leasesApi.cancelNotice(activeLease.value.id)
    await reloadLeases()
  } catch (e) {
    cancelNoticeError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le préavis n'a pas pu être annulé.") : "Le préavis n'a pas pu être annulé."
  } finally {
    cancelNoticeLoading.value = false
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="leaseState === 'loading'" class="flex flex-col gap-3">
      <DataSkeletonCard :height="80" :lines="1" />
      <DataSkeletonCard :height="200" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="leaseState === 'error'" tone="danger">
      Impossible de charger votre bail pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="reloadLeases">Réessayer</button>
    </FeedbackAlertBanner>

    <FeedbackEmptyState v-else-if="leaseState === 'empty' || !activeLease || !phase" title="Aucun bail pour l'instant" description="Quand un propriétaire vous enverra un bail, vous le lirez et le signerez ici." />

    <template v-else>
      <div class="mb-4.5 flex items-center gap-3.5">
        <div class="h-[52px] w-[52px] flex-none rounded-md bg-cover bg-center" :style="{ backgroundImage: TENANT_PHOTOS[0] }" />
        <div class="min-w-0 flex-1">
          <p class="m-0 text-[17px] font-bold tracking-[-.015em]">{{ leaseLabel(activeLease) }}</p>
          <p class="mb-0 mt-[3px] text-[13px] text-[var(--text-muted)]">
            Avec {{ landlordName() }} · {{ formatDate(activeLease.start_date) }} → {{ activeLease.end_date ? formatDate(activeLease.end_date) : 'durée indéterminée' }}
          </p>
        </div>
        <CoreBadge :tone="LEASE_PHASE_TONE[phase]">{{ TENANT_LEASE_PHASE_LABEL[phase] }}</CoreBadge>
      </div>

      <div class="mb-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
        <div v-if="phase !== 'cancelled_unpaid'" class="overflow-x-auto pb-1">
          <FeedbackStepper :steps="LEASE_STEPS" :current="leaseStepIndex(phase)" class="min-w-[520px]" />
        </div>

        <div v-if="phase === 'draft'" class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4 text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">
          {{ landlordName() }} prépare ce bail. Vous pourrez le lire et le signer dès qu'il vous l'aura envoyé.
        </div>

        <div v-else-if="phase === 'awaiting_tenant'" class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warn-border bg-warn-bg p-4">
          <p v-if="canTenantSign(activeLease)" class="m-0 text-[13.5px] font-semibold text-warn-fg">{{ landlordName() }} a signé. Lisez le contrat et signez-le à votre tour.</p>
          <p v-else class="m-0 text-[13.5px] font-semibold text-warn-fg">Votre signature est enregistrée.</p>
          <button v-if="canTenantSign(activeLease)" type="button" class="flex-none rounded-pill bg-[image:var(--action-primary)] px-4 py-2.5 text-[13px] font-bold text-white" @click="leaseModal = 'signer-bail'">Lire et signer</button>
        </div>

        <div v-else-if="phase === 'awaiting_entry' && entry" class="mt-4 rounded-md border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-4.5">
          <p class="m-0 text-[14px] font-bold text-clay-700">Dernière étape : le paiement d'entrée</p>
          <p class="mb-0 mt-1.5 text-[13px] leading-[1.55] text-clay-900">Le bail devient actif dès ce paiement, prélevé sur votre tirelire. La caution reste en séquestre chez Immo pendant tout le bail.</p>
          <div class="mt-3 rounded-md border border-[var(--border-default)] bg-white px-4 py-3">
            <DataMoneyLine label="Caution" :value="formatFcfa(entry.deposit)" />
            <DataMoneyLine v-if="entry.advance" label="Avance sur loyer" :value="formatFcfa(entry.advance)" />
            <DataMoneyLine v-if="entry.prepaid" label="Loyers prépayés" :value="formatFcfa(entry.prepaid)" />
            <DataMoneyLine label="Total" :value="formatFcfa(entry.total)" total />
            <p v-if="wallet.state.value === 'success'" class="mb-0 mt-2 text-[12px] text-[var(--text-muted)]">Tirelire : {{ formatFcfa(wallet.spendable.value) }} disponibles.</p>
          </div>
          <WalletInconsistencyNote compact />
          <div v-if="entryShortfall > 0" class="mt-3 rounded-md border border-warn-border bg-warn-bg px-3.5 py-3 text-[13px] text-warn-fg">
            <p class="m-0 font-bold">Il vous manque {{ formatFcfa(entryShortfall) }} dans votre tirelire.</p>
            <button type="button" class="mt-1 font-bold underline" @click="openPay('recharge')">Recharger ma tirelire</button>
          </div>
          <p v-if="graceEnd" class="mb-0 mt-3 text-[12.5px] leading-[1.5]" :class="canBeCancelled ? 'font-semibold text-danger-fg' : 'text-clay-900'">
            {{ canBeCancelled ? `Le délai de 72 h est passé : ${landlordName()} peut désormais annuler ce bail.` : `Payez avant le ${formatDate(graceEnd)} à ${new Date(graceEnd).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} : passé ce délai, le propriétaire pourra annuler le bail.` }}
          </p>
          <p v-if="entryPaymentError" class="mb-0 mt-2.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ entryPaymentError }}</p>
          <button type="button" class="mt-3.5 rounded-pill bg-clay-500 px-4.5 py-2.5 text-[13px] font-bold text-white disabled:opacity-60" :disabled="entryPaymentLoading || entryShortfall > 0" @click="payEntry">
            {{ entryPaymentLoading ? 'Paiement…' : `Payer ${formatFcfa(entry.total)}` }}
          </button>
        </div>

        <div v-else-if="phase === 'notice'" class="mt-4 rounded-md border border-warn-border bg-warn-bg p-4">
          <p class="m-0 text-[13.5px] font-semibold text-warn-fg">Préavis donné le {{ formatDate(activeLease.renewal_intent_date) }} — départ prévu le {{ formatDate(departure) }}.</p>
          <p class="mb-0 mt-1 text-[12.5px] text-warn-fg">Les loyers restent dus jusqu'au départ. Convenez de l'état des lieux de sortie avec {{ landlordName() }}.</p>
        </div>

        <div v-else-if="phase === 'terminated'" class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4 text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">
          Bail terminé le {{ formatDate(activeLease.end_date) }}.
        </div>

        <div v-else-if="phase === 'cancelled_unpaid'" class="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4 text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">
          Ce bail a été annulé par le propriétaire : le paiement d'entrée n'a pas été fait dans les 72 heures suivant votre signature.
        </div>

        <div v-else-if="phase === 'inconsistent'" class="mt-4 rounded-md border border-danger-border bg-danger-bg p-4 text-[13.5px] leading-[1.55] text-danger-fg">
          Ce bail est dans un état incohérent (entrée payée mais bail non actif). Signalez-le au support pour qu'il soit rétabli.
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4.5 lg:grid-cols-[1.4fr_1fr]">
        <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
          <p class="mb-4.5 mt-0 text-base font-bold tracking-[-.015em]">Où est mon argent</p>
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4.5">
              <p class="m-0 text-[11.5px] font-bold text-[var(--text-muted)]">{{ RENT_LABEL[activeLease.billing_frequency ?? 'monthly'] }}</p>
              <p class="mb-0 mt-2 font-mono text-xl font-bold">{{ formatFcfaShort(Number(activeLease.signed_rent)) }}</p>
            </div>
            <div class="rounded-md border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-4.5">
              <p class="m-0 text-[11.5px] font-bold text-clay-700">{{ paidIn ? 'Caution séquestrée' : 'Caution prévue' }}</p>
              <p class="mb-0 mt-2 font-mono text-xl font-bold text-clay-700">{{ formatFcfaShort(Number(activeLease.deposit_amount)) }}</p>
            </div>
          </div>
          <p class="mb-0 mt-3 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
            La caution est versée à Immo, pas au propriétaire : ni lui ni vous ne pouvez y toucher pendant le bail. Sa restitution en fin de bail n'est pas encore gérée dans l'application.
          </p>

          <div v-if="buffersLoading" class="mt-4"><DataSkeletonCard :height="90" :lines="1" /></div>
          <template v-else>
            <div v-if="advanceBuffer" class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4.5">
              <div class="flex items-baseline justify-between gap-3">
                <p class="m-0 text-[13.5px] font-bold">Avance sur loyer</p>
                <p class="m-0 font-mono text-sm font-bold">{{ formatFcfaShort(advanceBuffer.advance_balance) }} / {{ formatFcfaShort(advanceBuffer.advance_target) }}</p>
              </div>
              <div class="mt-2.5 h-[9px] overflow-hidden rounded-pill bg-sand-300">
                <div class="h-full rounded-pill bg-[image:linear-gradient(90deg,var(--color-green-500),var(--color-green-800))]" :style="{ width: pct(advanceBuffer.advance_balance, advanceBuffer.advance_target) }" />
              </div>
              <p class="mb-0 mt-2.5 text-[12.5px] text-[var(--text-muted)]">Couvre automatiquement une échéance manquée.</p>
              <button type="button" class="mt-3 rounded-sm border border-[var(--border-default)] bg-white px-4.5 py-2.5 text-[13px] font-bold" @click="leaseModal = 'alimenter-avance'">Alimenter</button>
            </div>
            <div v-if="prepaidBuffer" class="mt-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4.5">
              <div class="flex items-baseline justify-between gap-3">
                <p class="m-0 text-[13.5px] font-bold">Loyers prépayés</p>
                <p class="m-0 font-mono text-sm font-bold">{{ formatFcfaShort(prepaidBuffer.prepaid_balance) }} / {{ formatFcfaShort(prepaidBuffer.prepaid_target) }}</p>
              </div>
              <div class="mt-2.5 h-[9px] overflow-hidden rounded-pill bg-sand-300">
                <div class="h-full rounded-pill bg-[image:linear-gradient(90deg,var(--color-green-500),var(--color-green-800))]" :style="{ width: pct(prepaidBuffer.prepaid_balance, prepaidBuffer.prepaid_target) }" />
              </div>
              <p class="mb-0 mt-2.5 text-[12.5px] text-[var(--text-muted)]">Consommé en priorité sur vos prochains loyers.</p>
              <button type="button" class="mt-3 rounded-sm border border-[var(--border-default)] bg-white px-4.5 py-2.5 text-[13px] font-bold" @click="leaseModal = 'alimenter-prepaye'">Alimenter</button>
            </div>
          </template>

          <template v-if="phase === 'active' || phase === 'notice'">
            <FormsToggle
              class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4"
              :class="autoDebitLoading ? 'pointer-events-none opacity-60' : ''"
              :model-value="activeLease.auto_debit_enabled"
              label="Prélèvement automatique"
              hint="Le loyer est prélevé sur la tirelire à chaque échéance"
              @update:model-value="toggleAutoDebit"
            />
            <p v-if="autoDebitError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ autoDebitError }}</p>
          </template>
        </div>

        <div class="flex flex-col gap-4.5">
          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="mb-2 mt-0 text-[15px] font-bold">Échéancier</p>
            <p v-if="!invoices.length" class="mb-0 mt-2 text-[13px] text-[var(--text-muted)]">
              {{ paidIn ? 'Aucune échéance pour l\'instant : la première est émise à la date de début du bail.' : 'Les échéances apparaîtront une fois le bail actif.' }}
            </p>
            <div v-for="inv in invoices" :key="inv.id" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
              <div class="min-w-0 flex-1">
                <p class="m-0 text-[13.5px] font-semibold">Échéance du {{ formatDate(inv.due_date) }}</p>
                <p class="mb-0 mt-0.5 font-mono text-[12.5px] text-[var(--text-muted)]">{{ formatFcfaShort(Number(inv.amount)) }}</p>
              </div>
              <CoreBadge :tone="invoiceView(inv).tone">{{ invoiceView(inv).label }}</CoreBadge>
              <button v-if="invoiceView(inv).payable" type="button" class="rounded-pill bg-danger-fg px-3.5 py-2 text-xs font-bold text-white" @click="openPay('loyer', inv.id)">Payer</button>
              <button
                v-else-if="inv.status === 'paid'"
                type="button"
                class="whitespace-nowrap rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold disabled:opacity-60"
                :disabled="doc.loadingKey.value === inv.id"
                @click="downloadQuittance(inv.id)"
              >{{ doc.loadingKey.value === inv.id ? '…' : 'Quittance' }}</button>
            </div>
          </div>

          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="mb-3.5 mt-0 text-[15px] font-bold">Documents</p>
            <div class="flex items-center gap-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5">
              <div class="grid h-[44px] w-[38px] flex-none place-items-center rounded-xs border border-[var(--border-default)] bg-white text-[9.5px] font-black text-danger-fg">PDF</div>
              <div class="min-w-0 flex-1">
                <p class="m-0 text-[13.5px] font-bold">Contrat de bail</p>
                <p class="mb-0 mt-1 text-xs text-[var(--text-muted)]">{{ activeLease.unit?.name ?? 'Logement' }}</p>
              </div>
              <button type="button" class="whitespace-nowrap rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold disabled:opacity-60" :disabled="doc.loadingKey.value === 'contract'" @click="previewContract">
                {{ doc.loadingKey.value === 'contract' ? 'Génération…' : 'Ouvrir' }}
              </button>
            </div>
            <NuxtLink :to="`/locataire/edl?lease=${activeLease.id}`" class="mt-2.5 flex items-center gap-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5">
              <div class="grid h-[44px] w-[38px] flex-none place-items-center rounded-xs border border-[var(--border-default)] bg-white text-[15px]">☑</div>
              <div class="min-w-0 flex-1">
                <p class="m-0 text-[13.5px] font-bold">États des lieux</p>
                <p class="mb-0 mt-1 text-xs text-[var(--text-muted)]">
                  Entrée : {{ entryInventory ? INVENTORY_STATUS_LABEL[entryInventory.status] : 'pas encore préparé' }}<template v-if="exitInventory"> · Sortie : {{ INVENTORY_STATUS_LABEL[exitInventory.status] }}</template>
                </p>
              </div>
              <CoreBadge v-if="entryInventory?.status === 'pending_signature' && !entryInventory.tenant_signature" :tone="INVENTORY_STATUS_TONE.pending_signature">À signer</CoreBadge>
              <span class="text-[var(--text-faint)]">›</span>
            </NuxtLink>
            <p v-if="docError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ docError }}</p>
          </div>

          <div v-if="phase === 'active' || phase === 'notice'" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="mb-2 mt-0 text-[15px] font-bold">Fin de bail</p>
            <div class="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
              <template v-if="phase === 'active'">
                <p class="m-0 text-[13px] leading-[1.55] text-[var(--text-secondary)]">
                  Préavis prévu au bail : <strong>{{ activeLease.notice_period ?? 3 }} mois</strong>. Le donner ne met pas fin au bail immédiatement.
                </p>
                <button type="button" class="mt-3 rounded-sm border border-[var(--border-default)] bg-white px-4.5 py-2.5 text-[13px] font-bold" @click="leaseModal = 'preavis'">Donner mon préavis</button>
              </template>
              <template v-else>
                <p class="m-0 text-[13px] leading-[1.55] text-[var(--text-secondary)]">Départ prévu le <strong>{{ formatDate(departure) }}</strong>. Vous restez finalement ?</p>
                <button type="button" class="mt-3 rounded-sm border border-[var(--border-default)] bg-white px-4.5 py-2.5 text-[13px] font-bold disabled:opacity-60" :disabled="cancelNoticeLoading" @click="cancelNotice">
                  {{ cancelNoticeLoading ? 'Annulation…' : 'Annuler mon préavis' }}
                </button>
                <p v-if="cancelNoticeError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ cancelNoticeError }}</p>
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
