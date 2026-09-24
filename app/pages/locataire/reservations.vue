<script setup lang="ts">
import type { BookingStatus, BookingSummary } from '~/types/tenant'
import type { DocumentResult } from '~/composables/usePdfDocument'
import { deriveHoldCountdown } from '~/utils/bookingHold'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'locataire' })

const bookingsApi = useBookingsApi()
const pdfDoc = usePdfDocument()
const preview = useProtectedFile()

const block = useFetchBlock(() => bookingsApi.fetchMine())
onMounted(block.load)

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Le hold pending_payment expire au bout de 15 min (expires_at) — pas un statut serveur, une dérivation d'affichage. */
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { now.value = new Date() }, 15000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

const STATUS_LABEL: Record<BookingStatus, string> = { pending_payment: 'En attente de paiement', confirmed: 'Confirmée', cancelled: 'Annulée' }
const STATUS_TONE: Record<BookingStatus, 'ok' | 'warn' | 'danger' | 'neutral'> = { pending_payment: 'warn', confirmed: 'ok', cancelled: 'neutral' }

function viewOf(b: BookingSummary) {
  const hold = b.status === 'pending_payment' ? deriveHoldCountdown(b.expires_at, now.value) : null
  const expired = hold?.expired ?? false
  return {
    booking: b,
    statusLabel: expired ? 'Expirée' : STATUS_LABEL[b.status],
    statusTone: expired ? ('neutral' as const) : STATUS_TONE[b.status],
    hold,
    expired
  }
}

const rows = computed(() => [...block.items.value]
  .sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime())
  .map(viewOf))

/* ---- Payer / annuler un hold ---- */
const payingBooking = ref<BookingSummary | null>(null)
const cancellingId = ref<string | null>(null)
const cancelError = ref('')

async function cancelBooking(b: BookingSummary) {
  cancellingId.value = b.id
  cancelError.value = ''
  try {
    await bookingsApi.cancel(b.id)
    await block.load()
  } catch (e) {
    cancelError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Annulation impossible.') : 'Annulation impossible.'
  } finally {
    cancellingId.value = null
  }
}

/* ---- Prolonger ---- */
const extendingBooking = ref<BookingSummary | null>(null)

/* ---- Reçu (contrat borné du socle, même motif qu'IL2) ---- */
const receiptLoadingId = ref<string | null>(null)
const receiptError = ref('')
async function downloadReceipt(b: BookingSummary) {
  receiptLoadingId.value = b.id
  receiptError.value = ''
  const url = `/bookings/${b.id}/receipt`
  const result: DocumentResult = await pdfDoc.fetchDocument(url, url)
  if (result.mode === 'pdf') {
    await preview.load(result.downloadUrl)
    if (preview.objectUrl.value) window.open(preview.objectUrl.value, '_blank')
    else receiptError.value = preview.errorMessage.value ?? 'Aperçu indisponible.'
  } else if (result.mode === 'html') {
    const blob = new Blob([result.html], { type: 'text/html' })
    window.open(URL.createObjectURL(blob), '_blank')
  } else {
    receiptError.value = result.message
  }
  receiptLoadingId.value = null
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="120" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos réservations pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="block.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucune réservation pour l'instant. La recherche de logements en courte durée arrive dans un prochain lot.
    </p>

    <template v-else>
      <p v-if="cancelError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ cancelError }}</p>
      <p v-if="receiptError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ receiptError }}</p>

      <div
        v-for="r in rows"
        :key="r.booking.id"
        class="mb-3.5 flex flex-col gap-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-4.5 sm:flex-row"
        :class="{
          'border-l-4 border-l-green-600': r.booking.status === 'confirmed',
          'border-l-4 border-l-clay-500': r.booking.status === 'pending_payment' && !r.expired,
          'border-l-4 border-l-[var(--border-default)]': r.booking.status === 'cancelled' || r.expired
        }"
      >
        <div class="h-[110px] w-full flex-none rounded-md bg-cover bg-center sm:h-[110px] sm:w-[140px]" :style="{ backgroundImage: TENANT_PHOTOS[0] }" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2.5">
            <p class="m-0 text-[16px] font-bold tracking-[-.015em]">{{ r.booking.unit.name }}</p>
            <CoreBadge :tone="r.statusTone">{{ r.statusLabel }}</CoreBadge>
          </div>
          <p class="mb-0 mt-1.5 text-[13.5px] text-[var(--text-muted)]">
            {{ formatDate(r.booking.check_in) }} → {{ formatDate(r.booking.check_out) }} · {{ r.booking.nights }} nuit{{ r.booking.nights > 1 ? 's' : '' }}
          </p>
          <p class="mb-0 mt-2.5 font-mono text-[17px] font-bold text-green-900">{{ formatFcfa(Number(r.booking.total_price)) }}</p>

          <div v-if="r.booking.retained_amount" class="mt-2.5 inline-flex items-center gap-2.5 rounded-sm border border-[var(--border-escrow)] bg-[var(--surface-escrow)] px-3.5 py-2.5">
            <span class="text-[13px]">🔒</span>
            <p class="m-0 text-[12.5px] text-clay-900">
              <strong>{{ formatFcfaShort(Number(r.booking.retained_amount)) }}</strong> retenus en garantie{{ r.booking.retention_released_at ? ` — libérés le ${formatDate(r.booking.retention_released_at)}` : '' }}
            </p>
          </div>

          <div v-if="r.hold && !r.expired" class="mt-2.5 inline-flex items-center gap-2.5 rounded-sm border border-danger-border bg-danger-bg px-3.5 py-2.5">
            <span class="h-[7px] w-[7px] animate-[im-pulse_1.2s_infinite] rounded-pill bg-danger-fg" />
            <p class="m-0 text-[12.5px] font-bold text-danger-fg">Expire dans {{ r.hold.minutesRemaining }} min — passé ce délai, la réservation expire.</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 sm:flex-col sm:flex-nowrap sm:justify-center">
          <template v-if="r.booking.status === 'pending_payment' && !r.expired">
            <CoreButton size="sm" @click="payingBooking = r.booking">Payer</CoreButton>
            <CoreButton size="sm" tone="secondary" :disabled="cancellingId === r.booking.id" @click="cancelBooking(r.booking)">
              {{ cancellingId === r.booking.id ? '…' : 'Annuler' }}
            </CoreButton>
          </template>
          <template v-else-if="r.booking.status === 'confirmed'">
            <CoreButton size="sm" tone="secondary" :disabled="receiptLoadingId === r.booking.id" @click="downloadReceipt(r.booking)">
              {{ receiptLoadingId === r.booking.id ? '…' : 'Voir le reçu' }}
            </CoreButton>
            <CoreButton size="sm" tone="secondary" @click="extendingBooking = r.booking">Prolonger</CoreButton>
          </template>
        </div>
      </div>
    </template>

    <TenantBookingPayModal v-if="payingBooking" :booking="payingBooking" @close="payingBooking = null" @paid="payingBooking = null; block.load()" />
    <TenantBookingExtendModal v-if="extendingBooking" :booking="extendingBooking" @close="extendingBooking = null" @extended="extendingBooking = null; block.load()" />
  </div>
</template>
