<script setup lang="ts">
import { CalendarDays, Lock, MessageSquare, Search, X } from '@lucide/vue'
import type { BookingSummary } from '~/types/tenant'
import type { DocumentResult } from '~/composables/usePdfDocument'
import { deriveHoldCountdown } from '~/utils/bookingHold'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { PHASE_LABEL, PHASE_TONE, bookingPhase, canExtend, type BookingPhase } from '~/utils/bookings'

definePageMeta({ layout: 'locataire' })

const route = useRoute()
const router = useRouter()
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
const TAB_KEYS = TABS.map(t => t.key)
const tab = ref<TabKey>('upcoming')
const phaseOf = (b: BookingSummary) => bookingPhase(b, now.value)
const counts = computed(() => Object.fromEntries(TABS.map(t => [t.key, block.items.value.filter(b => t.phases.includes(phaseOf(b))).length])) as Record<TabKey, number>)
const tabOptions = computed(() => TABS.map(t => ({ value: t.key, label: counts.value[t.key] && t.key !== 'cancelled' ? `${t.label} (${counts.value[t.key]})` : t.label })))
const rows = computed(() => {
  const t = TABS.find(x => x.key === tab.value)!
  return block.items.value
    .filter(b => t.phases.includes(phaseOf(b)))
    .sort((a, b) => {
      const d = new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
      return tab.value === 'past' || tab.value === 'cancelled' ? -d : d
    })
})

/* ---- Onglet et réservation visée dans l'URL (?tab=, ?booking=) : lus au chargement ET suivis ---- */
function setTab(key: string) {
  if (!TAB_KEYS.includes(key as TabKey)) return
  tab.value = key as TabKey
  if (route.query.tab !== key) router.replace({ query: { ...route.query, tab: key } })
}
const highlighted = ref('')
function focusFromQuery() {
  highlighted.value = String(route.query.booking ?? '')
  const target = block.items.value.find(b => b.id === highlighted.value)
  if (target) {
    tab.value = TABS.find(t => t.phases.includes(phaseOf(target)))?.key ?? 'upcoming'
    nextTick(() => document.getElementById(`booking-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  } else if (typeof route.query.tab === 'string' && TAB_KEYS.includes(route.query.tab as TabKey)) {
    tab.value = route.query.tab as TabKey
  } else {
    tab.value = counts.value.pay ? 'pay' : counts.value.upcoming ? 'upcoming' : counts.value.past ? 'past' : 'upcoming'
  }
}
onMounted(async () => {
  await block.load()
  focusFromQuery()
})
watch(() => route.query.booking, async () => {
  await block.load()
  focusFromQuery()
})
watch(() => route.query.tab, t => { if (typeof t === 'string' && TAB_KEYS.includes(t as TabKey)) tab.value = t as TabKey })
onMounted(() => useLandlordReservationsBadge().markAllSeen())

function formatDate(iso: string) {
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function dayOf(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit' }) }
function monthOf(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { month: 'short' }) }
function holdOf(b: BookingSummary) { return deriveHoldCountdown(b.expires_at, now.value) }
function paidOf(b: BookingSummary) { return Number(b.total_price) - Number(b.discount_amount ?? 0) }

/* ---- Actions ---- */
const actionError = ref('')
const flash = ref('')
const payingBooking = ref<BookingSummary | null>(null)
const extendingBooking = ref<BookingSummary | null>(null)
const busyId = ref<string | null>(null)
const confirmCancelId = ref<string | null>(null)
const cancelHelpId = ref<string | null>(null)

/** Après paiement : la réservation passe dans « À venir », mise en évidence, avec ce qui a été débité. */
async function onPaid(b: BookingSummary) {
  payingBooking.value = null
  actionError.value = ''
  await block.load()
  const fresh = block.items.value.find(x => x.id === b.id) ?? b
  flash.value = `Séjour du ${formatDate(fresh.check_in)} au ${formatDate(fresh.check_out)} confirmé : ${formatFcfa(paidOf(fresh))} débités de votre tirelire. Le reçu est disponible ci-dessous.`
  highlighted.value = fresh.id
  setTab(TABS.find(t => t.phases.includes(phaseOf(fresh)))?.key ?? 'upcoming')
  nextTick(() => document.getElementById(`booking-${fresh.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}
function onChanged() {
  payingBooking.value = null
  block.load()
}

async function cancelBooking(b: BookingSummary) {
  busyId.value = b.id
  actionError.value = ''
  try {
    await bookingsApi.cancel(b.id)
    confirmCancelId.value = null
    flash.value = `Réservation annulée : les dates du ${formatDate(b.check_in)} au ${formatDate(b.check_out)} sont libérées. Rien n'a été débité.`
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
    await navigateTo({ path: '/locataire/messages', query: { conversation: conv.id } })
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
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 overflow-x-auto">
      <FormsSegmentedControl :model-value="tab" :options="tabOptions" size="sm" @update:model-value="setTab" />
    </div>

    <div v-if="flash" class="mb-4.5 flex items-start gap-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">
      <p class="m-0 flex-1">{{ flash }}</p>
      <button type="button" aria-label="Masquer" class="flex-none text-green-900/70 hover:text-green-900" @click="flash = ''"><X class="h-4 w-4" :stroke-width="1.9" /></button>
    </div>

    <div v-if="block.state.value === 'loading' || block.state.value === 'idle'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="120" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos réservations pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <p v-if="actionError" class="mb-3.5 mt-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>
      <div v-if="!rows.length" class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
        <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><CalendarDays class="h-5 w-5" :stroke-width="1.9" /></div>
        <p class="m-0 text-[13.5px] text-[var(--text-muted)]">{{ block.items.value.length ? TABS.find(t => t.key === tab)?.empty : 'Aucune réservation pour l\'instant. Les séjours à la nuit réservés sur Immo apparaissent ici, avec leur reçu.' }}</p>
        <NuxtLink v-if="tab === 'upcoming' || tab === 'pay'" to="/recherche?mode=nuit" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-2 text-[13px] font-bold text-sand-900"><Search class="h-4 w-4" :stroke-width="1.9" />Trouver un logement à la nuit</NuxtLink>
      </div>

      <article
        v-for="b in rows"
        :id="`booking-${b.id}`"
        :key="b.id"
        class="mb-3.5 rounded-2xl border bg-white p-5.5 transition-shadow"
        :class="highlighted === b.id ? 'border-green-600 shadow-raised ring-2 ring-green-600/15' : 'border-[var(--border-subtle)]'"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div class="flex min-w-0 flex-1 items-center gap-4">
            <div class="flex h-[60px] w-[60px] flex-none flex-col items-center justify-center rounded-md bg-green-50">
              <span class="font-mono text-xl font-bold leading-none text-green-800">{{ dayOf(b.check_in) }}</span>
              <span class="mt-0.5 text-[11px] font-bold uppercase text-green-700">{{ monthOf(b.check_in) }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="m-0 text-[15px] font-bold tracking-[-.01em]">{{ b.unit?.name ?? 'Logement retiré de la plateforme' }}</p>
                <CoreBadge :tone="PHASE_TONE[phaseOf(b)]">{{ PHASE_LABEL[phaseOf(b)] }}</CoreBadge>
                <CoreBadge v-if="b.extended_from_booking_id" tone="info">Prolongation</CoreBadge>
              </div>
              <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">
                <span class="font-mono">{{ formatDate(b.check_in) }} – {{ formatDate(b.check_out) }}</span> · {{ b.nights }} nuit{{ b.nights > 1 ? 's' : '' }}
              </p>
              <p class="mb-0 mt-1.5 font-mono text-base font-bold text-green-900">
                {{ formatFcfa(paidOf(b)) }}
                <span v-if="Number(b.discount_amount ?? 0) > 0" class="ml-1.5 font-body text-[12px] font-semibold text-ok-fg">dont −{{ formatFcfa(Number(b.discount_amount)) }} de réduction</span>
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-2 sm:flex-none sm:justify-end">
            <template v-if="phaseOf(b) === 'hold'">
              <CoreButton size="sm" tone="secondary" @click="confirmCancelId = b.id">Annuler</CoreButton>
              <CoreButton size="sm" @click="payingBooking = b">Payer</CoreButton>
            </template>
            <template v-else-if="phaseOf(b) === 'upcoming' || phaseOf(b) === 'ongoing' || phaseOf(b) === 'past'">
              <CoreButton v-if="b.landlord_id && phaseOf(b) !== 'past'" size="sm" tone="ghost" :disabled="busyId === b.id" @click="contactHost(b)">
                <span class="inline-flex items-center gap-1.5"><MessageSquare class="h-4 w-4" :stroke-width="1.9" />Écrire à l'hôte</span>
              </CoreButton>
              <CoreButton v-if="canExtend(b, now)" size="sm" tone="secondary" @click="extendingBooking = b">Prolonger</CoreButton>
              <CoreButton size="sm" tone="secondary" :disabled="receiptLoadingId === b.id" @click="downloadReceipt(b)">{{ receiptLoadingId === b.id ? '…' : 'Reçu' }}</CoreButton>
            </template>
          </div>
        </div>

        <div v-if="phaseOf(b) === 'hold' && holdOf(b)" class="mt-3.5 inline-flex items-center gap-2.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2">
          <span class="h-[7px] w-[7px] animate-[im-pulse_1.2s_infinite] rounded-pill bg-danger-fg" />
          <p class="m-0 text-[12.5px] font-bold text-danger-fg">Dates gardées encore <span class="font-mono">{{ holdOf(b)?.minutesRemaining }}</span> min — payez pour les confirmer.</p>
        </div>
        <p v-if="phaseOf(b) === 'hold_expired'" class="mb-0 mt-3 text-xs text-[var(--text-faint)]">Le délai de paiement de 15 minutes est dépassé : les dates ont été libérées.</p>

        <div v-if="b.retained_amount" class="mt-3.5 flex items-start gap-2.5 rounded-md border border-[var(--border-escrow)] bg-[var(--surface-escrow)] px-3.5 py-2.5">
          <Lock class="mt-px h-4 w-4 flex-none text-clay-700" :stroke-width="1.9" />
          <p class="m-0 text-[12.5px] text-clay-900">
            <strong class="font-mono">{{ formatFcfaShort(Number(b.retained_amount)) }}</strong> gardés par Immo jusqu'à votre départ{{ b.retention_released_at ? ` — versés à l'hôte le ${formatDate(b.retention_released_at)}` : '' }}<template v-if="b.unit?.requires_booking_inventory && !b.retention_released_at">, après l'état des lieux d'arrivée</template>.
          </p>
        </div>

        <CoreInlineConfirm
          v-if="confirmCancelId === b.id"
          class="mt-3.5"
          tone="danger"
          message="Libérer ces dates ? La réservation est annulée ; rien n'a été débité."
          confirm-label="Annuler la réservation"
          cancel-label="Garder"
          :loading="busyId === b.id"
          @confirm="cancelBooking(b)"
          @cancel="confirmCancelId = null"
        />

        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-sand-200 pt-3">
          <NuxtLink v-if="b.unit?.property_id" :to="`/biens/${b.unit.property_id}`" class="text-[12.5px] font-bold text-green-700">Voir l'annonce</NuxtLink>
          <NuxtLink v-if="(phaseOf(b) === 'upcoming' || phaseOf(b) === 'ongoing') && b.unit?.requires_booking_inventory" to="/locataire/edl" class="text-[12.5px] font-bold text-green-700">État des lieux d'arrivée</NuxtLink>
          <button v-if="phaseOf(b) === 'upcoming'" type="button" class="text-[12.5px] font-semibold text-[var(--text-muted)] underline" @click="cancelHelpId = cancelHelpId === b.id ? null : b.id">Annuler ce séjour ?</button>
        </div>
        <p v-if="cancelHelpId === b.id" class="mb-0 mt-2 rounded-md bg-sand-100 px-3.5 py-2.5 text-[12.5px] text-[var(--text-secondary)]">
          Un séjour déjà payé ne s'annule pas encore depuis Immo. Écrivez à l'hôte pour convenir d'une annulation et d'un éventuel remboursement.
        </p>
      </article>
    </template>

    <TenantBookingPayModal v-if="payingBooking" :booking="payingBooking" @close="payingBooking = null" @paid="payingBooking && onPaid(payingBooking)" @changed="onChanged" />
    <TenantBookingExtendModal v-if="extendingBooking" :booking="extendingBooking" @close="extendingBooking = null" @extended="extendingBooking = null; block.load()" @pay="onExtendPay" />
  </div>
</template>
