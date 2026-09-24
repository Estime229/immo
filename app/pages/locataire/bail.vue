<script setup lang="ts">
import type { AdvanceBufferStatus, LeaseStatus, PrepaidBufferStatus } from '~/types/tenant'
import type { DocumentResult } from '~/composables/usePdfDocument'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'locataire' })

const { activeLease, state: leaseState, ensureLoaded, reload: reloadLeases } = useTenantLeases()
const leasesApi = useLeasesApi()
const pdfDoc = usePdfDocument()
const preview = useProtectedFile()
const leaseModal = useLeaseModal()
const { openPay } = usePaymentModal()

onMounted(ensureLoaded)

const LEASE_STEP_LABELS = ['Brouillon', 'En attente de signature', 'Signature complète', 'Actif']
function stepIndexFor(status: LeaseStatus): number {
  return { draft: 0, pending_signature: 1, signed: 2, active: 3, terminated: 3 }[status]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** `unit`/`property` sont réellement `null` sur au moins un bail réel (Lot 37 — signalé par l'utilisateur, `im-ee`) — jamais supposés présents. */
function leaseLabel(l: { unit: { name: string } | null; property: { name: string } | null }) {
  return [l.unit?.name, l.property?.name].filter(Boolean).join(' — ') || 'Logement'
}

const cautionOpen = ref(false)
const cautionExplain = computed(() => {
  const l = activeLease.value
  if (!l) return ''
  return `Séquestrée veut dire que ces ${formatFcfa(Number(l.deposit_amount))} sont détenus par Immo : ni vous ni le propriétaire ne pouvez y toucher pendant le bail. Ils sont restitués sous 7 jours après l'état des lieux de sortie ; une retenue ne peut être décidée que sur la base d'écarts constatés, photos à l'appui.`
})

/* ---- Tampons d'avance et prépayé ---- */
const advanceBuffer = ref<AdvanceBufferStatus | null>(null)
const prepaidBuffer = ref<PrepaidBufferStatus | null>(null)
const buffersLoading = ref(false)

async function loadBuffers() {
  const id = activeLease.value?.id
  if (!id) return
  buffersLoading.value = true
  try {
    const [adv, pre] = await Promise.all([leasesApi.fetchAdvanceBuffer(id), leasesApi.fetchPrepaidBuffer(id)])
    advanceBuffer.value = adv
    prepaidBuffer.value = pre
  } catch {
    advanceBuffer.value = null
    prepaidBuffer.value = null
  } finally {
    buffersLoading.value = false
  }
}
watch(() => activeLease.value?.id, id => { if (id) loadBuffers() }, { immediate: true })

const advanceWidth = computed(() => advanceBuffer.value && advanceBuffer.value.advance_target > 0
  ? `${Math.min(100, Math.round((advanceBuffer.value.advance_balance / advanceBuffer.value.advance_target) * 100))}%`
  : '0%')
const prepaidWidth = computed(() => prepaidBuffer.value && prepaidBuffer.value.prepaid_target > 0
  ? `${Math.min(100, Math.round((prepaidBuffer.value.prepaid_balance / prepaidBuffer.value.prepaid_target) * 100))}%`
  : '0%')

/* ---- Paiement d'entrée ---- */
const entryPaymentLoading = ref(false)
const entryPaymentError = ref('')
async function payEntry() {
  if (!activeLease.value) return
  entryPaymentLoading.value = true
  entryPaymentError.value = ''
  try {
    await leasesApi.payEntry(activeLease.value.id)
    await Promise.all([reloadLeases(), loadBuffers()])
  } catch (e) {
    entryPaymentError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "Le paiement d'entrée a échoué.") : "Le paiement d'entrée a échoué."
  } finally {
    entryPaymentLoading.value = false
  }
}

/* ---- Prélèvement automatique ---- */
const autoDebitLoading = ref(false)
async function toggleAutoDebit(enabled: boolean) {
  if (!activeLease.value) return
  autoDebitLoading.value = true
  try {
    await leasesApi.setAutoDebit(activeLease.value.id, enabled)
    await reloadLeases()
  } catch {
    await reloadLeases()
  } finally {
    autoDebitLoading.value = false
  }
}

/* ---- Échéancier ---- */
const INVOICE_STATUS_LABEL: Record<string, string> = { paid: 'Payé', pending: 'En attente', late: 'En retard' }
function payInvoice() {
  openPay('loyer')
}

/* ---- Documents (contrat + quittances), via le motif borné du socle ---- */
const contractLoading = ref(false)
const contractError = ref('')
async function previewContract() {
  if (!activeLease.value) return
  contractLoading.value = true
  contractError.value = ''
  const url = `/leases/${activeLease.value.id}/pdf`
  const result: DocumentResult = await pdfDoc.fetchDocument(url, url)
  await openDocumentResult(result)
  contractLoading.value = false
}

const quittanceLoadingId = ref<string | null>(null)
async function downloadQuittance(invoiceId: string) {
  quittanceLoadingId.value = invoiceId
  const result = await pdfDoc.fetchDocument(`/leases/invoice/${invoiceId}/pdf`)
  await openDocumentResult(result)
  quittanceLoadingId.value = null
}

async function openDocumentResult(result: DocumentResult) {
  if (result.mode === 'pdf') {
    await preview.load(result.downloadUrl)
    if (preview.objectUrl.value) window.open(preview.objectUrl.value, '_blank')
    else contractError.value = preview.errorMessage.value ?? 'Aperçu indisponible.'
  } else if (result.mode === 'html') {
    const blob = new Blob([result.html], { type: 'text/html' })
    window.open(URL.createObjectURL(blob), '_blank')
  } else {
    contractError.value = result.message
  }
}

/* ---- Fin de bail ---- */
const cancelNoticeLoading = ref(false)
const noticeGiven = ref(false)
async function cancelNotice() {
  if (!activeLease.value) return
  cancelNoticeLoading.value = true
  try {
    await leasesApi.cancelNotice(activeLease.value.id)
    noticeGiven.value = false
  } catch {
    // L'état local reste inchangé ; l'utilisateur peut réessayer.
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

    <FeedbackEmptyState v-else-if="leaseState === 'empty' || !activeLease" title="Aucun bail pour l'instant" description="Vos baux apparaîtront ici une fois signés." />

    <template v-else>
      <div class="mb-4.5 flex items-center gap-3.5">
        <div class="h-[52px] w-[52px] flex-none rounded-md bg-cover bg-center" :style="{ backgroundImage: TENANT_PHOTOS[0] }" />
        <div class="flex-1">
          <p class="m-0 text-[17px] font-bold tracking-[-.015em]">{{ leaseLabel(activeLease) }}</p>
          <p class="mb-0 mt-[3px] text-[13px] text-[var(--text-muted)]">{{ formatDate(activeLease.start_date) }} → {{ activeLease.end_date ? formatDate(activeLease.end_date) : 'durée indéterminée' }}</p>
        </div>
        <CoreBadge v-if="activeLease.status === 'terminated'" tone="neutral">Résilié</CoreBadge>
      </div>

      <div class="mb-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
        <FeedbackStepper :steps="LEASE_STEP_LABELS" :current="stepIndexFor(activeLease.status)" />
        <div v-if="activeLease.status === 'pending_signature'" class="mt-4 flex items-center justify-between gap-3 rounded-md border border-warn-border bg-warn-bg p-4">
          <p class="m-0 text-[13.5px] font-semibold text-warn-fg">Votre signature est nécessaire pour faire avancer ce bail.</p>
          <button type="button" class="flex-none rounded-pill bg-[image:var(--action-primary)] px-4 py-2.5 text-[13px] font-bold text-white" @click="leaseModal = 'signer-bail'">Signer</button>
        </div>
        <div v-else-if="activeLease.status === 'signed'" class="mt-4 rounded-md border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-4">
          <p class="m-0 text-[13.5px] font-semibold text-clay-700">Signé des deux côtés. Le bail devient actif une fois l'entrée payée (caution, avance et prépayé).</p>
          <p v-if="entryPaymentError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ entryPaymentError }}</p>
          <button type="button" class="mt-3 rounded-pill bg-clay-500 px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60" :disabled="entryPaymentLoading" @click="payEntry">
            {{ entryPaymentLoading ? 'Paiement…' : "Payer l'entrée dans les lieux" }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4.5 lg:grid-cols-[1.4fr_1fr]">
        <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
          <p class="mb-4.5 mt-0 text-base font-bold tracking-[-.015em]">Où est mon argent</p>
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4.5">
              <p class="m-0 text-[11.5px] font-bold text-[var(--text-muted)]">Loyer mensuel</p>
              <p class="mb-0 mt-2 font-mono text-xl font-bold">{{ formatFcfaShort(Number(activeLease.signed_rent)) }}</p>
            </div>
            <div class="rounded-md border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-4.5">
              <p class="m-0 text-[11.5px] font-bold text-clay-700">Caution séquestrée</p>
              <p class="mb-0 mt-2 font-mono text-xl font-bold text-clay-700">{{ formatFcfaShort(Number(activeLease.deposit_amount)) }}</p>
              <button type="button" class="mt-1.5 text-[12.5px] font-bold text-clay-700 underline" @click="cautionOpen = !cautionOpen">Qu'est-ce que ça veut dire ?</button>
            </div>
          </div>
          <div v-if="cautionOpen" class="mt-3 rounded-md border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-4.5">
            <p class="m-0 text-[13.5px] leading-[1.6] text-clay-900">{{ cautionExplain }}</p>
          </div>

          <div v-if="buffersLoading" class="mt-4"><DataSkeletonCard :height="90" :lines="1" /></div>
          <template v-else>
            <div v-if="advanceBuffer" class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4.5">
              <div class="flex items-baseline justify-between">
                <p class="m-0 text-[13.5px] font-bold">Tampon d'avance</p>
                <p class="m-0 font-mono text-sm font-bold">{{ formatFcfaShort(advanceBuffer.advance_balance) }} / {{ formatFcfaShort(advanceBuffer.advance_target) }}</p>
              </div>
              <div class="mt-2.5 h-[9px] overflow-hidden rounded-pill bg-sand-300">
                <div class="h-full rounded-pill bg-[image:linear-gradient(90deg,var(--color-green-500),var(--color-green-800))]" :style="{ width: advanceWidth }" />
              </div>
              <p class="mb-0 mt-2.5 text-[12.5px] text-[var(--text-muted)]">Couvre automatiquement une échéance manquée.</p>
              <button type="button" class="mt-3 rounded-sm border border-[var(--border-default)] bg-white px-4.5 py-2.5 text-[13px] font-bold" @click="leaseModal = 'alimenter-avance'">Alimenter</button>
            </div>

            <div v-if="prepaidBuffer" class="mt-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4.5">
              <div class="flex items-baseline justify-between">
                <p class="m-0 text-[13.5px] font-bold">Tampon prépayé</p>
                <p class="m-0 font-mono text-sm font-bold">{{ formatFcfaShort(prepaidBuffer.prepaid_balance) }} / {{ formatFcfaShort(prepaidBuffer.prepaid_target) }}</p>
              </div>
              <div class="mt-2.5 h-[9px] overflow-hidden rounded-pill bg-sand-300">
                <div class="h-full rounded-pill bg-[image:linear-gradient(90deg,var(--color-green-500),var(--color-green-800))]" :style="{ width: prepaidWidth }" />
              </div>
              <p class="mb-0 mt-2.5 text-[12.5px] text-[var(--text-muted)]">Consommé en priorité sur vos prochains loyers.</p>
              <button type="button" class="mt-3 rounded-sm border border-[var(--border-default)] bg-white px-4.5 py-2.5 text-[13px] font-bold" @click="leaseModal = 'alimenter-prepaye'">Alimenter</button>
            </div>
          </template>

          <FormsToggle
            class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4"
            :model-value="activeLease.auto_debit_enabled"
            label="Prélèvement automatique"
            hint="Le loyer est prélevé sur la tirelire à chaque échéance"
            @update:model-value="toggleAutoDebit"
          />
        </div>

        <div class="flex flex-col gap-4.5">
          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="mb-2 mt-0 text-[15px] font-bold">Échéancier</p>
            <p v-if="!activeLease.invoices?.length" class="mb-0 mt-2 text-[13px] text-[var(--text-muted)]">Aucune facture pour l'instant.</p>
            <div v-for="inv in activeLease.invoices" :key="inv.id" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
              <div class="flex-1">
                <p class="m-0 text-[13.5px] font-semibold">Échéance du {{ formatDate(inv.due_date) }}</p>
                <p class="mb-0 mt-0.5 font-mono text-[12.5px] text-[var(--text-muted)]">{{ formatFcfaShort(Number(inv.amount)) }}</p>
              </div>
              <CoreBadge :tone="inv.status === 'paid' ? 'ok' : 'danger'">{{ INVOICE_STATUS_LABEL[inv.status] ?? inv.status }}</CoreBadge>
              <button v-if="inv.status !== 'paid'" type="button" class="rounded-pill bg-danger-fg px-3.5 py-2 text-xs font-bold text-white" @click="payInvoice">Payer</button>
              <button
                v-else
                type="button"
                class="whitespace-nowrap rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold disabled:opacity-60"
                :disabled="quittanceLoadingId === inv.id"
                @click="downloadQuittance(inv.id)"
              >{{ quittanceLoadingId === inv.id ? '…' : 'Quittance' }}</button>
            </div>
          </div>

          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="mb-3.5 mt-0 text-[15px] font-bold">Documents</p>
            <div class="flex items-center gap-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5">
              <div class="grid h-[44px] w-[38px] flex-none place-items-center rounded-xs border border-[var(--border-default)] bg-white text-[9.5px] font-black text-danger-fg">DOC</div>
              <div class="min-w-0 flex-1">
                <p class="m-0 text-[13.5px] font-bold">Contrat de bail — {{ activeLease.unit?.name ?? 'logement' }}</p>
                <p class="mb-0 mt-1.5 text-xs text-[var(--text-muted)]">{{ contractError || 'PDF si possible, sinon aperçu HTML' }}</p>
              </div>
              <button type="button" class="whitespace-nowrap rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold disabled:opacity-60" :disabled="contractLoading" @click="previewContract">
                {{ contractLoading ? 'Génération…' : 'Aperçu' }}
              </button>
            </div>
          </div>

          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="mb-2 mt-0 text-[15px] font-bold">Fin de bail</p>
            <div class="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
              <p class="m-0 text-[13px] leading-[1.55] text-[var(--text-secondary)]">
                Donner votre préavis est une <strong>déclaration d'intention</strong> : cela ne met pas fin au bail immédiatement.
              </p>
              <button v-if="!noticeGiven" type="button" class="mt-3 rounded-sm border border-[var(--border-default)] bg-white px-4.5 py-2.5 text-[13px] font-bold" @click="leaseModal = 'preavis'; noticeGiven = true">Donner mon préavis</button>
              <button v-else type="button" class="mt-3 rounded-sm border border-[var(--border-default)] bg-white px-4.5 py-2.5 text-[13px] font-bold disabled:opacity-60" :disabled="cancelNoticeLoading" @click="cancelNotice">
                {{ cancelNoticeLoading ? 'Annulation…' : 'Annuler mon préavis' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
