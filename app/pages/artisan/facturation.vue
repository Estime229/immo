<script setup lang="ts">
import type { DocumentResult } from '~/composables/usePdfDocument'
import type { ArtisanRequestSummary } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'
import type { WithdrawalStatus } from '~/types/wallet'

definePageMeta({ layout: 'artisan' })

const modal = useArtisanModal()
const wallet = useTenantWallet()
const walletApi = useWalletApi()
const artisanApi = useArtisanRequestsApi()
const refData = useReferenceData()
const pdfDoc = usePdfDocument()
const preview = useProtectedFile()

onMounted(wallet.ensureLoaded)

const trades = ref<RefEntry[]>([])
onMounted(async () => {
  try {
    trades.value = await refData.fetchRef('ARTISAN_TRADE')
  } catch {
    trades.value = []
  }
})
function tradeLabel(id?: string) {
  return trades.value.find(t => t.id === id)?.labels.fr ?? 'Intervention'
}

const missionsBlock = useFetchBlock(() => artisanApi.listMine())
onMounted(missionsBlock.load)

const paidMissions = computed(() => missionsBlock.items.value
  .filter((r): r is ArtisanRequestSummary & { paid_at: string } => !!r.paid_at)
  .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()))

/** Somme des retenues de garantie encore ouvertes — API sans endpoint dédié, calculé côté client depuis `retained_amount`. */
const retainedTotal = computed(() => paidMissions.value.reduce((sum, r) => sum + (Number(r.retained_amount) || 0), 0))
const nextRelease = computed(() => paidMissions.value
  .filter((r): r is ArtisanRequestSummary & { warranty_expires_at: string } => !!r.warranty_expires_at && Number(r.retained_amount) > 0)
  .sort((a, b) => new Date(a.warranty_expires_at).getTime() - new Date(b.warranty_expires_at).getTime())[0])
const nextReleaseLabel = computed(() => nextRelease.value
  ? `${tradeLabel(nextRelease.value.trade_reference_id)} · libéré le ${new Date(nextRelease.value.warranty_expires_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`
  : '')

const withdrawalsBlock = useFetchBlock(() => walletApi.fetchWithdrawals())
onMounted(withdrawalsBlock.load)

const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalStatus, { label: string; tone: 'info' | 'ok' | 'danger' }> = {
  pending: { label: 'En attente', tone: 'info' },
  processed: { label: 'Traitée', tone: 'ok' },
  rejected: { label: 'Rejetée', tone: 'danger' }
}
function withdrawalMethodLabel(m: string) {
  return m === 'MTN_MOMO' ? 'MTN' : m === 'MOOV_MONEY' ? 'Moov' : 'Virement bancaire'
}

const openingKey = ref<string | null>(null)
const openError = ref('')
async function openInvoice(r: ArtisanRequestSummary) {
  openingKey.value = r.id
  openError.value = ''
  const result: DocumentResult = await pdfDoc.fetchDocument(`/artisan-requests/${r.id}/invoice`)
  if (result.mode === 'pdf') {
    await preview.load(result.downloadUrl)
    if (preview.objectUrl.value) window.open(preview.objectUrl.value, '_blank')
    else openError.value = preview.errorMessage.value ?? 'Aperçu indisponible.'
  } else if (result.mode === 'html') {
    const blob = new Blob([result.html], { type: 'text/html' })
    window.open(URL.createObjectURL(blob), '_blank')
  } else {
    openError.value = result.message
  }
  openingKey.value = null
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="grid grid-cols-2 gap-4.5">
      <div class="rounded-2xl bg-[image:var(--gradient-balance)] p-6 text-white">
        <p class="m-0 text-xs font-bold uppercase tracking-[.06em] text-white/[.58]">Solde disponible</p>
        <p class="m-0 mt-3 font-mono text-[32px] font-bold tracking-[-.02em]">{{ formatFcfa(wallet.balanceTotal.value) }}</p>
        <button type="button" class="mt-4 rounded-md bg-white px-5 py-2.5 text-[13.5px] font-bold text-green-900" @click="modal = 'retrait'">Retirer</button>
      </div>
      <div class="rounded-2xl border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-6">
        <p class="m-0 text-xs font-bold uppercase tracking-[.06em] text-clay-700">Retenu en garantie</p>
        <p class="m-0 mt-3 font-mono text-[32px] font-bold tracking-[-.02em] text-clay-700">{{ formatFcfa(retainedTotal) }}</p>
        <p class="mb-0 mt-2 text-[13px] text-clay-900">
          <template v-if="nextRelease">{{ nextReleaseLabel }}</template>
          <template v-else-if="retainedTotal === 0">Aucune garantie en cours.</template>
        </p>
      </div>
    </div>

    <p v-if="openError" class="mb-0 mt-3.5 text-[13px] font-semibold text-danger-fg">{{ openError }}</p>

    <div class="mt-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
      <p class="m-0 mb-3.5 text-[15px] font-bold">Paiements par mission</p>
      <div v-if="missionsBlock.state.value === 'loading'" class="flex flex-col gap-2.5">
        <DataSkeletonCard v-for="i in 3" :key="i" :height="52" :lines="1" />
      </div>
      <FeedbackAlertBanner v-else-if="missionsBlock.state.value === 'error'" tone="danger">Impossible de charger vos missions payées.</FeedbackAlertBanner>
      <p v-else-if="!paidMissions.length" class="m-0 text-[13.5px] text-[var(--text-muted)]">Aucune mission payée pour l'instant.</p>
      <div v-for="r in paidMissions" :key="r.id" class="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-sand-200 py-3 last:border-b-0">
        <div>
          <p class="m-0 text-[13.5px] font-bold">{{ tradeLabel(r.trade_reference_id) }}</p>
          <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ new Date(r.paid_at).toLocaleDateString('fr-FR') }}</p>
        </div>
        <span v-if="Number(r.retained_amount) > 0" class="font-mono text-[12.5px] text-clay-700">🔒 {{ formatFcfa(Number(r.retained_amount)) }}</span>
        <span v-else class="font-mono text-[12.5px] text-[var(--text-faint)]">—</span>
        <button
          type="button"
          class="whitespace-nowrap rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold disabled:opacity-50"
          :disabled="openingKey === r.id"
          @click="openInvoice(r)"
        >{{ openingKey === r.id ? 'Ouverture…' : 'Facture' }}</button>
      </div>
    </div>

    <div class="mt-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
      <p class="m-0 mb-1.5 text-[15px] font-bold">Retraits</p>
      <p class="m-0 mb-3.5 text-[12.5px] text-[var(--text-muted)]">Minimum 500 FCFA · une seule demande en attente.</p>
      <div v-if="withdrawalsBlock.state.value === 'loading'" class="flex flex-col gap-2.5">
        <DataSkeletonCard v-for="i in 2" :key="i" :height="46" :lines="1" />
      </div>
      <FeedbackAlertBanner v-else-if="withdrawalsBlock.state.value === 'error'" tone="danger">Impossible de charger vos retraits.</FeedbackAlertBanner>
      <p v-else-if="!withdrawalsBlock.items.value.length" class="m-0 text-[13.5px] text-[var(--text-muted)]">Aucun retrait pour l'instant.</p>
      <div v-for="w in withdrawalsBlock.items.value" :key="w.id" class="flex items-center gap-3.5 border-b border-sand-200 py-3 last:border-b-0">
        <div class="flex-1">
          <p class="m-0 text-[13.5px] font-semibold">Retrait — {{ withdrawalMethodLabel(w.method) }}</p>
          <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ new Date(w.created_at).toLocaleDateString('fr-FR') }}</p>
        </div>
        <span class="font-mono text-sm font-bold">{{ formatFcfa(Number(w.amount)) }}</span>
        <CoreBadge :tone="WITHDRAWAL_STATUS_LABEL[w.status].tone" class="min-w-[120px] justify-center">{{ WITHDRAWAL_STATUS_LABEL[w.status].label }}</CoreBadge>
      </div>
    </div>
  </div>
</template>
