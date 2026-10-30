<script setup lang="ts">
import { ClipboardCheck, FileText, KeyRound, MessageSquare, Search, X } from '@lucide/vue'
import type { AdvanceBufferStatus, InventoryDetail, PrepaidBufferStatus } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import {
  canTenantSign, cancelUnpaidState, entryBreakdown, invoiceView, leasePhase, leaseStepIndex, LEASE_PHASE_TONE,
  LEASE_STEPS, nextPayableInvoice, noticeDepartureDate, RENT_LABEL, sortInvoices, TENANT_LEASE_PHASE_LABEL
} from '~/utils/leases'
import { INVENTORY_STATUS_LABEL, INVENTORY_STATUS_TONE, pickInventory } from '~/utils/inventories'

definePageMeta({ layout: 'locataire' })

const route = useRoute()
const { activeLease, leases, state: leaseState, ensureLoaded, reload: reloadLeases, selectLease } = useTenantLeases()
const leasesApi = useLeasesApi()
const inventoriesApi = useInventoriesApi()
const messagingApi = useMessagingApi()
const wallet = useTenantWallet()
const doc = useOpenDocument()
const leaseModal = useLeaseModal()
const leaseFlash = useLeaseFlash()
const { openPay } = usePaymentModal()

/**
 * `?lease=` (notifications, tableau de bord) choisit le bail ; `?pay=` ouvre directement le paiement de
 * cette échéance. Suivis aussi quand on est déjà sur la page (clic sur une notification).
 */
async function applyQuery() {
  await ensureLoaded()
  const id = typeof route.query.lease === 'string' ? route.query.lease : null
  if (id && leases.value.some(l => l.id === id)) selectLease(id)
  const invoiceId = typeof route.query.pay === 'string' ? route.query.pay : null
  if (invoiceId && activeLease.value?.invoices?.some(i => i.id === invoiceId)) openPay('loyer', invoiceId)
}
onMounted(async () => {
  await applyQuery()
  wallet.reload()
})
watch(() => [route.query.lease, route.query.pay], applyQuery)
onMounted(() => useLandlordBauxBadge().markAllSeen())

const phase = computed(() => (activeLease.value ? leasePhase(activeLease.value) : null))
const paidIn = computed(() => phase.value === 'active' || phase.value === 'notice' || phase.value === 'terminated')

function formatDate(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function shortDate(iso: string) {
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
/** `unit`/`property` sont réellement `null` sur au moins un bail réel (Lot 37) — jamais supposés présents. */
function leaseLabel(l: { unit: { name: string } | null; property: { name: string } | null }) {
  return [l.unit?.name, l.property?.name].filter(Boolean).join(' — ') || 'Logement'
}
function landlordName() {
  const p = activeLease.value?.landlord
  return `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'votre propriétaire'
}

/* ---- Compte rendu de la dernière action (modales du bail, paiement d'entrée, préavis) ---- */
const flash = computed(() => (leaseFlash.value && leaseFlash.value.leaseId === activeLease.value?.id ? leaseFlash.value : null))
onBeforeUnmount(() => { leaseFlash.value = null })

/* ---- Paiement d'entrée : jamais en un clic, le débit est confirmé en ligne ---- */
const entry = computed(() => (activeLease.value ? entryBreakdown(activeLease.value) : null))
const entryShortfall = computed(() => entry.value && wallet.state.value === 'success' ? Math.max(0, entry.value.total - wallet.spendable.value) : 0)
const graceEnd = computed(() => {
  const s = activeLease.value?.signed_at_tenant
  return s ? new Date(new Date(s).getTime() + 72 * 3600000).toISOString() : null
})
const canBeCancelled = computed(() => (activeLease.value ? cancelUnpaidState(activeLease.value)?.allowed ?? false : false))
const confirmingEntry = ref(false)
const entryPaymentLoading = ref(false)
const entryPaymentError = ref('')
async function payEntry() {
  const lease = activeLease.value
  if (!lease || !entry.value) return
  const total = entry.value.total
  entryPaymentLoading.value = true
  entryPaymentError.value = ''
  try {
    await leasesApi.payEntry(lease.id)
    await Promise.allSettled([reloadLeases(), wallet.reload()])
    confirmingEntry.value = false
    leaseFlash.value = {
      leaseId: lease.id,
      text: `Paiement d'entrée effectué : ${formatFcfa(total)} débités de votre tirelire. Votre bail est actif.`,
      next: { label: "Prochaine étape : l'état des lieux d'entrée", to: `/locataire/edl?lease=${lease.id}` }
    }
  } catch (e) {
    entryPaymentError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le paiement d'entrée a échoué.") : "Le paiement d'entrée a échoué."
    // Une erreur réseau peut cacher un paiement passé : on relit avant de laisser réessayer.
    await Promise.allSettled([reloadLeases(), wallet.reload()])
  } finally {
    entryPaymentLoading.value = false
  }
}

/* ---- Tampons d'avance et prépayé (alimentés par le paiement d'entrée) ---- */
const advanceBuffer = ref<AdvanceBufferStatus | null>(null)
const prepaidBuffer = ref<PrepaidBufferStatus | null>(null)
const buffersState = ref<'idle' | 'loading' | 'error' | 'ready'>('idle')
async function loadBuffers() {
  const id = activeLease.value?.id
  advanceBuffer.value = null
  prepaidBuffer.value = null
  if (!id || !paidIn.value || phase.value === 'terminated') {
    buffersState.value = 'idle'
    return
  }
  buffersState.value = 'loading'
  try {
    const [adv, pre] = await Promise.all([leasesApi.fetchAdvanceBuffer(id), leasesApi.fetchPrepaidBuffer(id)])
    if (activeLease.value?.id !== id) return
    advanceBuffer.value = adv.advance_target > 0 ? adv : null
    prepaidBuffer.value = pre.prepaid_target > 0 ? pre : null
    buffersState.value = 'ready'
  } catch {
    if (activeLease.value?.id === id) buffersState.value = 'error'
  }
}
watch(() => [activeLease.value?.id, phase.value], loadBuffers, { immediate: true })
/** Retour de la modale « Alimenter » (montée dans la mise en page) : tampons et tirelire relus. */
watch(leaseModal, (v, old) => {
  if (!v && old?.startsWith('alimenter')) {
    loadBuffers()
    wallet.reload()
  }
})
const buffers = computed(() => {
  const out: { key: string; label: string; balance: number; target: number; hint: string; modal: 'alimenter-avance' | 'alimenter-prepaye' }[] = []
  if (advanceBuffer.value) out.push({ key: 'avance', label: 'Avance sur loyer', balance: Number(advanceBuffer.value.advance_balance), target: Number(advanceBuffer.value.advance_target), hint: 'Couvre automatiquement une échéance manquée.', modal: 'alimenter-avance' })
  if (prepaidBuffer.value) out.push({ key: 'prepaye', label: 'Loyers prépayés', balance: Number(prepaidBuffer.value.prepaid_balance), target: Number(prepaidBuffer.value.prepaid_target), hint: 'Consommés en priorité sur vos prochaines échéances.', modal: 'alimenter-prepaye' })
  return out
})
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
const nextDue = computed(() => nextPayableInvoice(activeLease.value?.invoices))

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
const inventoriesState = ref<'loading' | 'error' | 'ready'>('loading')
async function loadInventories() {
  const id = activeLease.value?.id
  inventories.value = []
  if (!id) return
  inventoriesState.value = 'loading'
  try {
    const list = await inventoriesApi.fetchByLease(id)
    // Réponse d'un bail qu'on a quitté entre-temps (`?lease=` change le bail juste après le montage) : ignorée.
    if (activeLease.value?.id === id) {
      inventories.value = list
      inventoriesState.value = 'ready'
    }
  } catch {
    if (activeLease.value?.id === id) inventoriesState.value = 'error'
  }
}
watch(() => activeLease.value?.id, loadInventories, { immediate: true })
const entryInventory = computed(() => pickInventory(inventories.value, 'entry'))
const exitInventory = computed(() => pickInventory(inventories.value, 'exit'))

/* ---- Fin de bail ---- */
const departure = computed(() => (activeLease.value ? noticeDepartureDate(activeLease.value) : null))
const confirmingCancelNotice = ref(false)
const cancelNoticeLoading = ref(false)
const cancelNoticeError = ref('')
async function cancelNotice() {
  const lease = activeLease.value
  if (!lease) return
  cancelNoticeLoading.value = true
  cancelNoticeError.value = ''
  try {
    await leasesApi.cancelNotice(lease.id)
    await reloadLeases()
    confirmingCancelNotice.value = false
    leaseFlash.value = { leaseId: lease.id, text: 'Préavis annulé : votre bail se poursuit. Votre propriétaire en a reçu la notification.' }
  } catch (e) {
    cancelNoticeError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le préavis n'a pas pu être annulé.") : "Le préavis n'a pas pu être annulé."
  } finally {
    cancelNoticeLoading.value = false
  }
}

/* ---- Écrire au propriétaire ---- */
const writing = ref(false)
const writeError = ref('')
async function writeLandlord() {
  const l = activeLease.value
  const landlordId = l?.landlord_id ?? l?.landlord?.id
  if (!l?.unit?.id || !landlordId) return
  writing.value = true
  writeError.value = ''
  try {
    const conv = await messagingApi.openConversation(l.unit.id, landlordId)
    await navigateTo({ path: '/locataire/messages', query: { conversation: conv.id } })
  } catch (e) {
    writeError.value = e instanceof ApiRequestError ? errorText(e.mapped, "La conversation n'a pas pu être ouverte.") : "La conversation n'a pas pu être ouverte."
  } finally {
    writing.value = false
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="leaseState === 'loading' || leaseState === 'idle'" class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="flex flex-col gap-4.5">
        <DataSkeletonCard :height="110" :lines="0" />
        <DataSkeletonCard :height="220" :lines="0" />
      </div>
      <DataSkeletonCard :height="240" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="leaseState === 'error'" tone="danger">
      Impossible de charger votre bail pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="reloadLeases">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else-if="leaseState === 'empty' || !activeLease || !phase" class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-12 text-center">
      <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><KeyRound class="h-5 w-5" :stroke-width="1.9" /></div>
      <p class="m-0 text-[15px] font-bold">Aucun bail pour l'instant</p>
      <p class="m-0 max-w-[420px] text-[13.5px] text-[var(--text-muted)]">Quand un propriétaire retiendra votre candidature et vous enverra un bail, vous le lirez et le signerez ici.</p>
      <div class="mt-1 flex flex-wrap justify-center gap-2.5">
        <NuxtLink to="/locataire/candidatures" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-2 text-[13px] font-bold text-sand-900">Mes candidatures</NuxtLink>
        <NuxtLink to="/recherche" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-2 text-[13px] font-bold text-sand-900"><Search class="h-4 w-4" :stroke-width="1.9" />Trouver un logement</NuxtLink>
      </div>
    </div>

    <template v-else>
      <div class="mb-4.5 flex flex-wrap items-center gap-3.5">
        <div class="grid h-[52px] w-[52px] flex-none place-items-center rounded-md bg-green-50 text-green-700"><KeyRound class="h-[22px] w-[22px]" :stroke-width="1.9" /></div>
        <div class="min-w-0 flex-1">
          <p class="m-0 text-[17px] font-bold tracking-[-.015em]">{{ leaseLabel(activeLease) }}</p>
          <p class="mb-0 mt-[3px] text-[13px] text-[var(--text-muted)]">
            Avec {{ landlordName() }} · <span class="font-mono">{{ shortDate(activeLease.start_date) }} – {{ activeLease.end_date ? shortDate(activeLease.end_date) : 'durée indéterminée' }}</span>
          </p>
        </div>
        <CoreBadge :tone="LEASE_PHASE_TONE[phase]">{{ TENANT_LEASE_PHASE_LABEL[phase] }}</CoreBadge>
      </div>

      <div v-if="flash" class="mb-4.5 flex items-start gap-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">
        <p class="m-0 flex-1">
          {{ flash.text }}
          <NuxtLink v-if="flash.next" :to="flash.next.to" class="ml-1 font-bold underline">{{ flash.next.label }}</NuxtLink>
        </p>
        <button type="button" aria-label="Masquer" class="flex-none text-green-900/70 hover:text-green-900" @click="leaseFlash = null"><X class="h-4 w-4" :stroke-width="1.9" /></button>
      </div>

      <div class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <!-- Contenu -->
        <div class="flex min-w-0 flex-col gap-4.5">
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="mb-4 mt-0 text-[15px] font-bold">Avancement</h2>
            <div v-if="phase !== 'cancelled_unpaid'" class="overflow-x-auto pb-1">
              <FeedbackStepper :steps="LEASE_STEPS" :current="leaseStepIndex(phase)" class="min-w-[520px]" />
            </div>
            <p v-if="phase === 'draft'" class="mb-0 mt-4 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">{{ landlordName() }} prépare ce bail. Vous pourrez le lire et le signer dès qu'il vous l'aura envoyé.</p>
            <p v-else-if="phase === 'terminated'" class="mb-0 mt-4 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Bail terminé le {{ formatDate(activeLease.end_date) }}.</p>
            <p v-else-if="phase === 'cancelled_unpaid'" class="m-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Ce bail a été annulé par le propriétaire : le paiement d'entrée n'a pas été fait dans les 72 heures suivant votre signature.</p>
            <p v-else-if="phase === 'inconsistent'" class="mb-0 mt-4 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">
              Ce bail est dans un état incohérent (entrée payée mais bail non actif). Signalez-le au support pour qu'il soit rétabli.
            </p>
          </section>

          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="mb-4 mt-0 text-[15px] font-bold">Où est mon argent</h2>
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
                <p class="m-0 truncate font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ formatFcfaShort(Number(activeLease.signed_rent)) }}</p>
                <p class="mb-0 mt-1.5 text-[11.5px] text-[var(--text-muted)]">{{ RENT_LABEL[activeLease.billing_frequency ?? 'monthly'] }}</p>
              </div>
              <div class="rounded-lg border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-4">
                <p class="m-0 truncate font-mono text-xl font-bold tracking-[-.02em] text-clay-700">{{ formatFcfaShort(Number(activeLease.deposit_amount)) }}</p>
                <p class="mb-0 mt-1.5 text-[11.5px] text-clay-700">{{ paidIn ? 'Caution séquestrée' : 'Caution prévue' }}</p>
              </div>
            </div>
            <p class="mb-0 mt-3 text-xs leading-[1.55] text-[var(--text-faint)]">
              La caution est versée à Immo, pas au propriétaire : ni lui ni vous ne pouvez y toucher pendant le bail. Sa restitution en fin de bail n'est pas encore gérée dans l'application.
            </p>

            <div v-if="buffersState === 'loading'" class="mt-4"><DataSkeletonCard :height="90" :lines="0" /></div>
            <p v-else-if="buffersState === 'error'" class="mb-0 mt-4 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">
              L'avance et les loyers prépayés n'ont pas pu être chargés.
              <button type="button" class="ml-1 font-bold underline" @click="loadBuffers">Réessayer</button>
            </p>
            <template v-else-if="buffersState === 'ready'">
              <div v-for="b in buffers" :key="b.key" class="mt-3.5 border-t border-sand-200 pt-3.5">
                <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p class="m-0 text-sm font-bold">{{ b.label }}</p>
                  <p class="m-0 font-mono text-[13px] font-bold">{{ formatFcfaShort(b.balance) }} / {{ formatFcfaShort(b.target) }}</p>
                </div>
                <div class="mt-2 h-2 overflow-hidden rounded-pill bg-sand-200">
                  <div class="h-full rounded-pill bg-green-600" :style="{ width: pct(b.balance, b.target) }" />
                </div>
                <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p class="m-0 text-xs text-[var(--text-faint)]">{{ b.hint }}<template v-if="b.target > b.balance"> Il manque <span class="font-mono">{{ formatFcfa(b.target - b.balance) }}</span>.</template></p>
                  <CoreButton v-if="b.target > b.balance" size="sm" tone="secondary" @click="leaseModal = b.modal">Alimenter</CoreButton>
                </div>
              </div>
            </template>

            <div v-if="phase === 'active' || phase === 'notice'" class="mt-4 border-t border-sand-200 pt-4">
              <FormsToggle
                :class="autoDebitLoading ? 'pointer-events-none opacity-60' : ''"
                :model-value="activeLease.auto_debit_enabled"
                label="Prélèvement automatique"
                hint="Le loyer est prélevé sur la tirelire à chaque échéance"
                @update:model-value="toggleAutoDebit"
              />
              <p v-if="autoDebitError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ autoDebitError }}</p>
            </div>
          </section>

          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="mb-2 mt-0 text-[15px] font-bold">Échéancier</h2>
            <p v-if="!invoices.length" class="mb-0 mt-2 text-[13px] text-[var(--text-muted)]">
              {{ paidIn ? 'Aucune échéance pour l\'instant : la première est émise à la date de début du bail.' : 'Les échéances apparaîtront une fois le bail actif.' }}
            </p>
            <div v-for="inv in invoices" :key="inv.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-sand-200 py-3 last:border-b-0">
              <div class="min-w-0 flex-1">
                <p class="m-0 text-sm font-bold">Échéance du <span class="font-mono font-semibold">{{ shortDate(inv.due_date) }}</span></p>
                <p class="mb-0 mt-0.5 font-mono text-xs text-[var(--text-faint)]">{{ formatFcfa(Number(inv.amount)) }}</p>
              </div>
              <CoreBadge :tone="invoiceView(inv).tone">{{ invoiceView(inv).label }}</CoreBadge>
              <!-- Rouge seulement pour une échéance en retard ; à payer mais pas encore échue : bouton neutre. -->
              <CoreButton v-if="invoiceView(inv).payable" size="sm" :tone="invoiceView(inv).tone === 'danger' ? 'danger' : 'secondary'" @click="openPay('loyer', inv.id)">Payer</CoreButton>
              <CoreButton v-else-if="inv.status === 'paid'" size="sm" tone="ghost" :disabled="doc.loadingKey.value === inv.id" @click="downloadQuittance(inv.id)">{{ doc.loadingKey.value === inv.id ? '…' : 'Quittance' }}</CoreButton>
            </div>
          </section>

          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="mb-2 mt-0 text-[15px] font-bold">Documents</h2>
            <div class="flex items-center gap-3 border-b border-sand-200 py-3">
              <div class="grid h-9 w-9 flex-none place-items-center rounded-md bg-sand-200 text-[var(--text-secondary)]"><FileText class="h-4 w-4" :stroke-width="1.9" /></div>
              <div class="min-w-0 flex-1">
                <p class="m-0 text-sm font-bold">Contrat de bail</p>
                <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">PDF · {{ activeLease.unit?.name ?? 'Logement' }}</p>
              </div>
              <CoreButton size="sm" tone="secondary" :disabled="doc.loadingKey.value === 'contract'" @click="previewContract">{{ doc.loadingKey.value === 'contract' ? 'Génération…' : 'Ouvrir' }}</CoreButton>
            </div>
            <div class="flex items-center gap-3 py-3">
              <div class="grid h-9 w-9 flex-none place-items-center rounded-md bg-sand-200 text-[var(--text-secondary)]"><ClipboardCheck class="h-4 w-4" :stroke-width="1.9" /></div>
              <div class="min-w-0 flex-1">
                <p class="m-0 text-sm font-bold">États des lieux</p>
                <p v-if="inventoriesState === 'loading'" class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Chargement…</p>
                <p v-else-if="inventoriesState === 'error'" class="mb-0 mt-0.5 text-xs font-semibold text-danger-fg">
                  Impossible de les charger. <button type="button" class="font-bold underline" @click="loadInventories">Réessayer</button>
                </p>
                <p v-else class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">
                  Entrée : {{ entryInventory ? INVENTORY_STATUS_LABEL[entryInventory.status] : 'pas encore préparé' }}<template v-if="exitInventory"> · Sortie : {{ INVENTORY_STATUS_LABEL[exitInventory.status] }}</template>
                </p>
              </div>
              <CoreBadge v-if="entryInventory?.status === 'pending_signature' && !entryInventory.tenant_signature" :tone="INVENTORY_STATUS_TONE.pending_signature">À signer</CoreBadge>
              <NuxtLink :to="`/locataire/edl?lease=${activeLease.id}`" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900">Voir</NuxtLink>
            </div>
            <p v-if="docError" class="mb-0 mt-1 text-[12.5px] font-semibold text-danger-fg">{{ docError }}</p>
          </section>
        </div>

        <!-- Panneau d'actions : l'étape en cours, puis la fin de bail et le contact. -->
        <aside class="flex flex-col gap-4.5 lg:sticky lg:top-[94px] lg:self-start">
          <section v-if="phase === 'awaiting_tenant'" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Votre signature</h2>
            <template v-if="canTenantSign(activeLease)">
              <p class="mb-4 mt-1.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">{{ landlordName() }} a signé. Lisez le contrat et signez-le à votre tour.</p>
              <CoreButton full-width @click="leaseModal = 'signer-bail'">Lire et signer</CoreButton>
            </template>
            <p v-else class="mb-0 mt-1.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Votre signature est enregistrée.</p>
          </section>

          <section v-else-if="phase === 'awaiting_entry' && entry" id="paiement-entree" class="rounded-2xl border border-[var(--border-escrow)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Paiement d'entrée</h2>
            <p class="mb-0 mt-1.5 text-[13px] leading-[1.55] text-[var(--text-muted)]">Dernière étape : le bail devient actif dès ce paiement, prélevé sur votre tirelire.</p>
            <div class="mt-3.5 rounded-md border border-[var(--border-subtle)] px-4 py-3">
              <DataMoneyLine label="Caution" :value="formatFcfa(entry.deposit)" />
              <DataMoneyLine v-if="entry.advance" label="Avance sur loyer" :value="formatFcfa(entry.advance)" />
              <DataMoneyLine v-if="entry.prepaid" label="Loyers prépayés" :value="formatFcfa(entry.prepaid)" />
              <DataMoneyLine label="Total" :value="formatFcfa(entry.total)" total />
            </div>
            <p v-if="wallet.state.value === 'success'" class="mb-0 mt-2.5 text-xs text-[var(--text-faint)]">Tirelire disponible : <span class="font-mono">{{ formatFcfa(wallet.spendable.value) }}</span></p>
            <p v-else-if="wallet.state.value === 'error'" class="mb-0 mt-2.5 text-[12.5px] font-semibold text-danger-fg">Solde indisponible. <button type="button" class="font-bold underline" @click="wallet.reload()">Réessayer</button></p>
            <WalletInconsistencyNote compact />
            <div v-if="entryShortfall > 0" class="mt-3 rounded-md border border-warn-border bg-warn-bg px-3.5 py-3 text-[13px] text-warn-fg-deep">
              <p class="m-0 font-bold">Il vous manque <span class="font-mono">{{ formatFcfa(entryShortfall) }}</span> dans votre tirelire.</p>
              <button type="button" class="mt-1 font-bold underline" @click="openPay('recharge')">Recharger ma tirelire</button>
            </div>
            <p v-if="graceEnd" class="mb-0 mt-3 text-[12.5px] leading-[1.5]" :class="canBeCancelled ? 'font-semibold text-danger-fg' : 'text-[var(--text-muted)]'">
              {{ canBeCancelled ? `Le délai de 72 h est passé : ${landlordName()} peut désormais annuler ce bail.` : `Payez avant le ${formatDate(graceEnd)} à ${new Date(graceEnd).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} : passé ce délai, le propriétaire pourra annuler le bail.` }}
            </p>
            <p v-if="entryPaymentError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ entryPaymentError }}</p>
            <CoreInlineConfirm
              v-if="confirmingEntry"
              class="mt-3.5"
              :message="`Débiter ${formatFcfa(entry.total)} de votre tirelire ? Il vous restera ${formatFcfa(wallet.spendable.value - entry.total)}.`"
              confirm-label="Payer"
              :loading="entryPaymentLoading"
              @confirm="payEntry"
              @cancel="confirmingEntry = false"
            />
            <CoreButton v-else class="mt-3.5" full-width :disabled="entryShortfall > 0 || wallet.state.value !== 'success'" @click="confirmingEntry = true">Payer {{ formatFcfaShort(entry.total) }}</CoreButton>
          </section>

          <section v-else-if="(phase === 'active' || phase === 'notice') && nextDue" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Prochaine échéance</h2>
            <p class="mb-0 mt-3 font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ formatFcfa(Number(nextDue.amount)) }}</p>
            <p class="mb-0 mt-1 text-xs text-[var(--text-faint)]">Due le <span class="font-mono">{{ shortDate(nextDue.due_date) }}</span> · <CoreBadge :tone="invoiceView(nextDue).tone">{{ invoiceView(nextDue).label }}</CoreBadge></p>
            <CoreButton class="mt-4" full-width :tone="invoiceView(nextDue).tone === 'danger' ? 'danger' : 'primary'" @click="openPay('loyer', nextDue.id)">Payer cette échéance</CoreButton>
          </section>

          <section v-if="phase === 'active' || phase === 'notice'" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Fin de bail</h2>
            <template v-if="phase === 'active'">
              <p class="mb-3.5 mt-1.5 text-[13px] leading-[1.55] text-[var(--text-muted)]">
                Préavis prévu au bail : <strong>{{ activeLease.notice_period ?? 3 }} mois</strong>. Le donner ne met pas fin au bail immédiatement.
              </p>
              <CoreButton size="sm" tone="secondary" @click="leaseModal = 'preavis'">Donner mon préavis</CoreButton>
            </template>
            <template v-else>
              <p class="mb-3.5 mt-1.5 text-[13px] leading-[1.55] text-[var(--text-muted)]">
                Préavis donné le {{ formatDate(activeLease.renewal_intent_date) }} : départ prévu le <strong>{{ formatDate(departure) }}</strong>. Les loyers restent dus jusque-là ; convenez de l'état des lieux de sortie avec {{ landlordName() }}.
              </p>
              <CoreInlineConfirm
                v-if="confirmingCancelNotice"
                :message="`Annuler votre préavis ? Le bail se poursuit sans date de départ et ${landlordName()} en reçoit la notification.`"
                confirm-label="Annuler le préavis"
                cancel-label="Garder"
                :loading="cancelNoticeLoading"
                @confirm="cancelNotice"
                @cancel="confirmingCancelNotice = false"
              />
              <CoreButton v-else size="sm" tone="secondary" @click="confirmingCancelNotice = true">Annuler mon préavis</CoreButton>
              <p v-if="cancelNoticeError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ cancelNoticeError }}</p>
            </template>
          </section>

          <section v-if="phase !== 'cancelled_unpaid' && phase !== 'draft'" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">{{ landlordName() }}</h2>
            <p class="mb-3.5 mt-1 text-xs text-[var(--text-faint)]">Propriétaire</p>
            <CoreButton size="sm" tone="secondary" :disabled="writing || !activeLease.unit?.id" @click="writeLandlord">
              <span class="inline-flex items-center gap-1.5"><MessageSquare class="h-4 w-4" :stroke-width="1.9" />{{ writing ? 'Ouverture…' : 'Écrire au propriétaire' }}</span>
            </CoreButton>
            <p v-if="writeError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ writeError }}</p>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>
