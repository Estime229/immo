<script setup lang="ts">
import type { BookingSummary } from '~/types/tenant'
import type { DocumentResult } from '~/composables/usePdfDocument'
import { deriveHoldCountdown } from '~/utils/bookingHold'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { PHASE_LABEL, PHASE_TONE, bookingPhase, canExtend, type BookingPhase } from '~/utils/bookings'

definePageMeta({ layout: 'locataire' })

const route = useRoute()
const bookingsApi = useBookingsApi()
const messagingApi = useMessagingApi()
const pdfDoc = usePdfDocument()
const preview = useProtectedFile()

const block = useFetchBlock(() => bookingsApi.fetchMine())

/** Le hold de 15 min expire côté affichage avant que le balayage serveur (toutes les 2 min) ne l'annule. */
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { now.value = new Date() }, 15000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

type TabKey = 'pay' | 'upcoming' | 'past' | 'cancelled'
const TABS: { key: TabKey; label: string; phases: BookingPhase[]; empty: string }[] = [
  { key: 'pay', label: 'À payer', phases: ['hold'], empty: 'Aucune réservation en attente de paiement.' },
  { key: 'upcoming', label: 'À venir', phases: ['upcoming', 'ongoing'], empty: 'Aucun séjour à venir.' },
  { key: 'past', label: 'Terminées', phases: ['past'], empty: 'Aucun séjour terminé.' },
  { key: 'cancelled', label: 'Annulées', phases: ['cancelled', 'hold_expired'], empty: 'Aucune réservation annulée.' }
]
const tab = ref<TabKey>('upcoming')
const phaseOf = (b: BookingSummary) => bookingPhase(b, now.value)
const counts = computed(() => Object.fromEntries(TABS.map(t => [t.key, block.items.value.filter(b => t.phases.includes(phaseOf(b))).length])) as Record<TabKey, number>)
const rows = computed(() => {
  const t = TABS.find(x => x.key === tab.value)!
  return block.items.value
    .filter(b => t.phases.includes(phaseOf(b)))
    .sort((a, b) => {
      const d = new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
      return tab.value === 'past' || tab.value === 'cancelled' ? -d : d
    })
})

/** `?booking=<id>` (notifications) : bon onglet + mise en évidence ; sinon premier onglet utile. */
const highlighted = ref(String(route.query.booking ?? ''))
onMounted(async () => {
  await block.load()
  const target = block.items.value.find(b => b.id === highlighted.value)
  if (target) {
    tab.value = TABS.find(t => t.phases.includes(phaseOf(target)))?.key ?? 'upcoming'
    nextTick(() => document.getElementById(`booking-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  } else {
    tab.value = counts.value.pay ? 'pay' : counts.value.upcoming ? 'upcoming' : counts.value.past ? 'past' : 'upcoming'
  }
})
onMounted(() => useLandlordReservationsBadge().markAllSeen())

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function dayOf(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit' }) }
function monthOf(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { month: 'short' }) }
function holdOf(b: BookingSummary) { return deriveHoldCountdown(b.expires_at, now.value) }
function paidOf(b: BookingSummary) { return Number(b.total_price) - Number(b.discount_amount ?? 0) }

/* ---- Actions ---- */
const actionError = ref('')
const payingBooking = ref<BookingSummary | null>(null)
const extendingBooking = ref<BookingSummary | null>(null)
const busyId = ref<string | null>(null)
const confirmCancelId = ref<string | null>(null)
const cancelHelpId = ref<string | null>(null)

async function cancelBooking(b: BookingSummary) {
  busyId.value = b.id
  actionError.value = ''
  try {
    await bookingsApi.cancel(b.id)
    confirmCancelId.value = null
    await block.load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Annulation impossible.') : 'Annulation impossible.'
  } finally {
    busyId.value = null
  }
}
async function contactHost(b: BookingSummary) {
  if (!b.landlord_id) return
  busyId.value = b.id
  actionError.value = ''
  try {
    const conv = await messagingApi.openConversation(b.unit_id, b.landlord_id)
    await navigateTo(`/locataire/messages?conversation=${conv.id}`)
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Impossible d'ouvrir la conversation.") : "Impossible d'ouvrir la conversation."
  } finally {
    busyId.value = null
  }
}
function onExtendPay(segment: BookingSummary) {
  extendingBooking.value = null
  block.load()
  payingBooking.value = segment
}

/* ---- Reçu (contrat borné du socle) ---- */
const receiptLoadingId = ref<string | null>(null)
async function downloadReceipt(b: BookingSummary) {
  receiptLoadingId.value = b.id
  actionError.value = ''
  const url = `/bookings/${b.id}/receipt`
  const result: DocumentResult = await pdfDoc.fetchDocument(url, url)
  if (result.mode === 'pdf') {
    await preview.load(result.downloadUrl)
    if (preview.objectUrl.value) window.open(preview.objectUrl.value, '_blank')
    else actionError.value = preview.errorMessage.value ?? 'Aperçu indisponible.'
  } else if (result.mode === 'html') {
    const blob = new Blob([result.html], { type: 'text/html' })
    window.open(URL.createObjectURL(blob), '_blank')
  } else {
    actionError.value = result.message
  }
  receiptLoadingId.value = null
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex flex-wrap gap-1.5">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="rounded-pill border px-4 py-2.5 text-[13px] font-bold transition-all"
        :class="tab === t.key ? 'border-green-900 bg-green-900 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
        @click="tab = t.key"
      >{{ t.label }}<span v-if="counts[t.key] && (t.key === 'pay' || t.key === 'upcoming')" class="ml-1.5 rounded-pill px-1.5 text-[11px]" :class="tab === t.key ? 'bg-white/20' : t.key === 'pay' ? 'bg-clay-500 text-white' : 'bg-sand-200'">{{ counts[t.key] }}</span></button>
    </div>

    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="120" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos réservations pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <p v-if="actionError" class="mb-3.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>
      <div v-if="!rows.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        <p class="m-0">{{ TABS.find(t => t.key === tab)?.empty }}</p>
        <NuxtLink v-if="tab === 'upcoming' || tab === 'pay'" to="/recherche?mode=nuit" class="mt-3 inline-block font-bold text-green-700">Trouver un logement à la nuit →</NuxtLink>
      </div>

      <div
        v-for="b in rows"
        :id="`booking-${b.id}`"
        :key="b.id"
        class="mb-3.5 rounded-2xl border bg-white p-4.5"
        :class="highlighted === b.id ? 'border-green-600 shadow-raised' : 'border-[var(--border-subtle)]'"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div class="flex h-16 w-16 flex-none flex-col items-center justify-center rounded-md bg-green-50">
            <span class="font-display text-xl font-extrabold leading-none text-green-800">{{ dayOf(b.check_in) }}</span>
            <span class="text-[11px] font-bold uppercase text-green-700">{{ monthOf(b.check_in) }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <p class="m-0 text-[16px] font-bold tracking-[-.015em]">{{ b.unit?.name ?? 'Logement retiré de la plateforme' }}</p>
              <CoreBadge :tone="PHASE_TONE[phaseOf(b)]">{{ PHASE_LABEL[phaseOf(b)] }}</CoreBadge>
              <CoreBadge v-if="b.extended_from_booking_id" tone="neutral">Prolongation</CoreBadge>
            </div>
            <p class="mb-0 mt-1.5 text-[13.5px] text-[var(--text-muted)]">
              {{ formatDate(b.check_in) }} → {{ formatDate(b.check_out) }} · {{ b.nights }} nuit{{ b.nights > 1 ? 's' : '' }}
            </p>
            <p class="mb-0 mt-2 font-mono text-[17px] font-bold text-green-900">
              {{ formatFcfa(paidOf(b)) }}
              <span v-if="Number(b.discount_amount ?? 0) > 0" class="ml-1.5 font-body text-[12px] font-semibold text-ok-fg">dont −{{ formatFcfa(Number(b.discount_amount)) }} de réduction</span>
            </p>
          </div>

          <div class="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
            <template v-if="phaseOf(b) === 'hold'">
              <CoreButton size="sm" @click="payingBooking = b">Payer</CoreButton>
              <CoreButton size="sm" tone="secondary" @click="confirmCancelId = b.id">Annuler</CoreButton>
            </template>
            <template v-else-if="phaseOf(b) === 'upcoming' || phaseOf(b) === 'ongoing' || phaseOf(b) === 'past'">
              <CoreButton size="sm" tone="secondary" :disabled="receiptLoadingId === b.id" @click="downloadReceipt(b)">{{ receiptLoadingId === b.id ? '…' : 'Reçu' }}</CoreButton>
              <CoreButton v-if="canExtend(b, now)" size="sm" tone="secondary" @click="extendingBooking = b">Prolonger</CoreButton>
              <CoreButton v-if="b.landlord_id && phaseOf(b) !== 'past'" size="sm" tone="ghost" :disabled="busyId === b.id" @click="contactHost(b)">Écrire à l'hôte</CoreButton>
            </template>
          </div>
        </div>

        <div v-if="phaseOf(b) === 'hold' && holdOf(b)" class="mt-3 inline-flex items-center gap-2.5 rounded-sm border border-danger-border bg-danger-bg px-3.5 py-2">
          <span class="h-[7px] w-[7px] animate-[im-pulse_1.2s_infinite] rounded-pill bg-danger-fg" />
          <p class="m-0 text-[12.5px] font-bold text-danger-fg">Dates gardées encore {{ holdOf(b)?.minutesRemaining }} min — payez pour les confirmer.</p>
        </div>
        <p v-if="phaseOf(b) === 'hold_expired'" class="mb-0 mt-3 text-[12.5px] text-[var(--text-muted)]">Le délai de paiement de 15 minutes est dépassé : les dates ont été libérées.</p>

        <div v-if="b.retained_amount" class="mt-3 inline-flex items-center gap-2.5 rounded-sm border border-[var(--border-escrow)] bg-[var(--surface-escrow)] px-3.5 py-2">
          <span class="text-[13px]">🔒</span>
          <p class="m-0 text-[12.5px] text-clay-900">
            <strong>{{ formatFcfaShort(Number(b.retained_amount)) }}</strong> gardés par Immo jusqu'à votre départ{{ b.retention_released_at ? ` — versés à l'hôte le ${formatDate(b.retention_released_at)}` : '' }}<template v-if="b.unit?.requires_booking_inventory && !b.retention_released_at">, après l'état des lieux d'arrivée</template>.
          </p>
        </div>

        <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <NuxtLink v-if="b.unit?.property_id" :to="`/biens/${b.unit.property_id}`" class="text-[12.5px] font-bold text-green-700">Voir l'annonce →</NuxtLink>
          <button v-if="phaseOf(b) === 'upcoming'" type="button" class="text-[12.5px] font-semibold text-[var(--text-muted)] underline" @click="cancelHelpId = cancelHelpId === b.id ? null : b.id">Annuler ce séjour ?</button>
        </div>
        <p v-if="cancelHelpId === b.id" class="mb-0 mt-2 rounded-md bg-sand-100 px-3.5 py-2.5 text-[12.5px] text-[var(--text-secondary)]">
          Un séjour déjà payé ne s'annule pas encore depuis Immo. Écrivez à l'hôte pour convenir d'une annulation et d'un éventuel remboursement.
        </p>

        <div v-if="confirmCancelId === b.id" class="mt-3 flex flex-wrap items-center gap-2.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5">
          <p class="m-0 flex-1 text-[13px] font-semibold text-warn-fg-deep">Libérer ces dates ? Rien n'a été débité.</p>
          <CoreButton size="sm" tone="danger" :disabled="busyId === b.id" @click="cancelBooking(b)">{{ busyId === b.id ? '…' : 'Oui, annuler' }}</CoreButton>
          <CoreButton size="sm" tone="secondary" @click="confirmCancelId = null">Non</CoreButton>
        </div>
      </div>
    </template>

    <TenantBookingPayModal v-if="payingBooking" :booking="payingBooking" @close="payingBooking = null" @paid="payingBooking = null; block.load()" @changed="payingBooking = null; block.load()" />
    <TenantBookingExtendModal v-if="extendingBooking" :booking="extendingBooking" @close="extendingBooking = null" @extended="extendingBooking = null; block.load()" @pay="onExtendPay" />
  </div>
</template>
