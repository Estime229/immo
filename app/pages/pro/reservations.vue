<script setup lang="ts">
import type { PropertySearchResult } from '~/types/property'
import type { LandlordBookingSummary, PromoCodeSummary } from '~/types/landlordBookings'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { PHASE_LABEL, PHASE_TONE, bookingPhase, hostAmounts, type BookingPhase } from '~/utils/bookings'

definePageMeta({ layout: 'pro' })

const modal = useProModal()
const bookingsApi = useLandlordBookingsApi()
const promoList = useLandlordPromoCodes()
const landlordPropertiesApi = useLandlordPropertiesApi()

const tab = ref<'liste' | 'promo'>('liste')

const bookingsBlock = useFetchBlock(() => bookingsApi.fetchMine())
onMounted(() => {
  bookingsBlock.load()
  promoList.ensureLoaded()
})

/**
 * Onglets par phase réelle du séjour : l'API ne connaît que 3 statuts, et la
 * liste mêlait séjours payés, holds de 15 min non payés et holds expirés
 * (affichés « Annulée » en rouge), triés par date de création.
 */
type BookingTab = 'upcoming' | 'hold' | 'past' | 'cancelled'
const BOOKING_TABS: { key: BookingTab; label: string; phases: BookingPhase[]; empty: string }[] = [
  { key: 'upcoming', label: 'À venir', phases: ['upcoming', 'ongoing'], empty: 'Aucun séjour payé à venir.' },
  { key: 'hold', label: 'Paiement en cours', phases: ['hold'], empty: 'Aucune réservation en attente de paiement.' },
  { key: 'past', label: 'Terminées', phases: ['past'], empty: 'Aucun séjour terminé.' },
  { key: 'cancelled', label: 'Annulées / expirées', phases: ['cancelled', 'hold_expired'], empty: 'Aucune réservation annulée.' }
]
const bookingTab = ref<BookingTab>('upcoming')
const now = new Date()
const phaseOf = (b: LandlordBookingSummary) => bookingPhase(b, now)
const bookingCounts = computed(() => Object.fromEntries(BOOKING_TABS.map(t => [t.key, bookingsBlock.items.value.filter(b => t.phases.includes(phaseOf(b))).length])) as Record<BookingTab, number>)
const bookingRows = computed(() => {
  const t = BOOKING_TABS.find(x => x.key === bookingTab.value)
  return bookingsBlock.items.value
    .filter(b => t?.phases.includes(phaseOf(b)))
    .sort((a, b) => {
      const d = new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
      return bookingTab.value === 'upcoming' || bookingTab.value === 'hold' ? d : -d
    })
})
const highlighted = ref(String(useRoute().query.booking ?? ''))
watch(() => bookingsBlock.state.value, st => {
  if (st !== 'success' && st !== 'empty') return
  const target = bookingsBlock.items.value.find(b => b.id === highlighted.value)
  if (target) {
    bookingTab.value = BOOKING_TABS.find(t => t.phases.includes(phaseOf(target)))?.key ?? 'upcoming'
    nextTick(() => document.getElementById(`booking-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }
})
function nightsOf(b: LandlordBookingSummary) {
  return b.nights ?? Math.round((new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000)
}
const messagingApi = useMessagingApi()
const bookingError = ref('')
const contactingId = ref<string | null>(null)
async function contactGuest(b: LandlordBookingSummary) {
  contactingId.value = b.id
  bookingError.value = ''
  try {
    const conv = await messagingApi.openConversation(b.unit_id, b.tenant_id)
    await navigateTo(`/pro/messages?conversation=${conv.id}`)
  } catch (e) {
    bookingError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Impossible d'ouvrir la conversation.") : "Impossible d'ouvrir la conversation."
  } finally {
    contactingId.value = null
  }
}

function tenantName(b: LandlordBookingSummary) {
  if (!b.tenant) return 'Locataire'
  return `${b.tenant.first_name ?? ''} ${b.tenant.last_name ?? ''}`.trim() || 'Locataire'
}
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
function fmtFcfa(v: string) { return `${Number(v).toLocaleString('fr-FR')} F` }

/* ---- Codes promo : résolution du nom du bien/unité pour l'affichage de la portée ---- */
const myProperties = ref<PropertySearchResult[]>([])
onMounted(async () => {
  try {
    const page = await landlordPropertiesApi.fetchMine({ limit: 100 })
    myProperties.value = page.data as PropertySearchResult[]
  } catch {
    myProperties.value = []
  }
})

function scopeLabel(p: PromoCodeSummary) {
  if (p.unit_id) {
    for (const prop of myProperties.value) {
      const u = prop.units.find(x => x.id === p.unit_id)
      if (u) return `${u.name} — ${prop.name}`
    }
    return 'Une unité'
  }
  if (p.property_id) return myProperties.value.find(x => x.id === p.property_id)?.name ?? 'Un bien'
  if (p.landlord_id) return 'Tout le portefeuille'
  return 'Portée inconnue'
}
function discountLabel(p: PromoCodeSummary) {
  if (!p.referred_discount_type || p.referred_discount_value == null) return null
  return p.referred_discount_type === 'percentage' ? `-${Number(p.referred_discount_value)}% locataire` : `-${fmtFcfa(p.referred_discount_value)} locataire`
}
function rewardLabel(p: PromoCodeSummary) {
  if (!p.referrer_reward_type || p.referrer_reward_value == null) return null
  return p.referrer_reward_type === 'percentage' ? `+${Number(p.referrer_reward_value)}% parrain` : `+${fmtFcfa(p.referrer_reward_value)} parrain`
}

/* ---- Activer / désactiver ---- */
const togglingId = ref<string | null>(null)
const promoError = ref('')
async function toggleActive(p: PromoCodeSummary) {
  togglingId.value = p.id
  promoError.value = ''
  try {
    await usePromoCodesApi().update(p.id, { is_active: !p.is_active })
    await promoList.reload()
  } catch (e) {
    promoError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La modification du code a échoué.') : 'La modification du code a échoué.'
  } finally {
    togglingId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex w-fit gap-[5px] rounded-pill bg-sand-200 p-1">
      <button type="button" class="rounded-pill px-5 py-2.5 text-[13px] font-bold transition-all" :class="tab === 'liste' ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'" @click="tab = 'liste'">Réservations</button>
      <button type="button" class="rounded-pill px-5 py-2.5 text-[13px] font-bold transition-all" :class="tab === 'promo' ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'" @click="tab = 'promo'">Codes promo</button>
    </div>

    <template v-if="tab === 'liste'">
      <div v-if="bookingsBlock.state.value === 'loading'" class="flex flex-col gap-3.5">
        <DataSkeletonCard v-for="i in 2" :key="i" :height="90" :lines="1" />
      </div>
      <FeedbackAlertBanner v-else-if="bookingsBlock.state.value === 'error'" tone="danger">
        Impossible de charger vos réservations pour le moment.
        <button type="button" class="ml-2 font-bold underline" @click="bookingsBlock.load">Réessayer</button>
      </FeedbackAlertBanner>
      <p v-else-if="bookingsBlock.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        Aucune réservation courte durée reçue pour l'instant.
      </p>
      <template v-else>
        <div class="mb-4 flex flex-wrap gap-1.5">
          <button
            v-for="t in BOOKING_TABS"
            :key="t.key"
            type="button"
            class="rounded-pill border px-3.5 py-2 text-[12.5px] font-bold"
            :class="bookingTab === t.key ? 'border-green-900 bg-green-900 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
            @click="bookingTab = t.key"
          >{{ t.label }}<span v-if="bookingCounts[t.key] && t.key !== 'cancelled'" class="ml-1.5">({{ bookingCounts[t.key] }})</span></button>
        </div>
        <p v-if="bookingError" class="mb-3.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ bookingError }}</p>
        <p v-if="!bookingRows.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">{{ BOOKING_TABS.find(t => t.key === bookingTab)?.empty }}</p>
        <div
          v-for="b in bookingRows"
          :id="`booking-${b.id}`"
          :key="b.id"
          class="mb-3.5 rounded-2xl border bg-white p-5"
          :class="highlighted === b.id ? 'border-green-600 shadow-raised' : 'border-[var(--border-subtle)]'"
        >
          <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2.5">
                <p class="m-0 text-[15.5px] font-bold">{{ b.unit?.name ?? 'Logement supprimé' }}</p>
                <CoreBadge :tone="PHASE_TONE[phaseOf(b)]">{{ PHASE_LABEL[phaseOf(b)] }}</CoreBadge>
                <CoreBadge v-if="b.extended_from_booking_id" tone="neutral">Prolongation</CoreBadge>
              </div>
              <p class="mb-0 mt-1 text-[13px] text-[var(--text-secondary)]">{{ tenantName(b) }} · {{ fmtDate(b.check_in) }} → {{ fmtDate(b.check_out) }} · {{ nightsOf(b) }} nuit{{ nightsOf(b) > 1 ? 's' : '' }}</p>
            </div>
            <CoreButton v-if="phaseOf(b) !== 'cancelled' && phaseOf(b) !== 'hold_expired' && phaseOf(b) !== 'past'" size="sm" tone="ghost" :disabled="contactingId === b.id" @click="contactGuest(b)">Écrire au voyageur</CoreButton>
          </div>
          <div v-if="b.status === 'confirmed'" class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div class="rounded-md bg-[var(--surface-page)] px-3 py-2"><p class="m-0 text-[11px] font-bold uppercase text-[var(--text-faint)]">Payé</p><p class="m-0 font-mono text-[14px] font-bold">{{ formatFcfaShort(hostAmounts(b).paid) }}</p></div>
            <div v-if="Number(b.discount_amount ?? 0) > 0" class="rounded-md bg-[var(--surface-page)] px-3 py-2"><p class="m-0 text-[11px] font-bold uppercase text-[var(--text-faint)]">Réduction</p><p class="m-0 font-mono text-[14px] font-bold">−{{ formatFcfaShort(Number(b.discount_amount)) }}</p></div>
            <div class="rounded-md bg-ok-bg px-3 py-2"><p class="m-0 text-[11px] font-bold uppercase text-ok-fg">Reçu</p><p class="m-0 font-mono text-[14px] font-bold text-green-900">{{ formatFcfaShort(hostAmounts(b).received) }}</p></div>
            <div v-if="hostAmounts(b).retained > 0" class="rounded-md bg-[var(--surface-escrow)] px-3 py-2"><p class="m-0 text-[11px] font-bold uppercase text-clay-900">{{ hostAmounts(b).released ? 'Retenue versée' : 'Retenu jusqu\'au départ' }}</p><p class="m-0 font-mono text-[14px] font-bold text-clay-900">{{ formatFcfaShort(hostAmounts(b).retained) }}</p></div>
          </div>
          <p v-else class="mb-0 mt-2 font-mono text-[14px] font-bold text-[var(--text-muted)]">{{ fmtFcfa(b.total_price) }}<span v-if="phaseOf(b) === 'hold'" class="ml-2 font-body text-[12px] font-semibold">— le voyageur a 15 min pour payer, rien n'est encore bloqué.</span></p>
          <p v-if="b.status === 'confirmed' && b.unit?.requires_booking_inventory && !b.retention_released_at" class="mb-0 mt-3 rounded-md bg-warn-bg px-3.5 py-2.5 text-[12.5px] text-warn-fg">
            État des lieux exigé pour ce logement : la retenue n'est versée qu'une fois l'état des lieux d'arrivée fait. <NuxtLink to="/pro/edl" class="font-bold underline">Faire l'état des lieux</NuxtLink>
          </p>
        </div>
      </template>
    </template>

    <template v-else>
      <div class="mb-3.5 flex justify-end">
        <CoreButton size="sm" @click="modal = 'promo'">+ Créer un code</CoreButton>
      </div>

      <p v-if="promoError" class="mb-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ promoError }}</p>
      <div v-if="promoList.state.value === 'loading'" class="flex flex-col gap-3">
        <DataSkeletonCard v-for="i in 2" :key="i" :height="60" :lines="1" />
      </div>
      <FeedbackAlertBanner v-else-if="promoList.state.value === 'error'" tone="danger">
        Impossible de charger vos codes promo pour le moment.
        <button type="button" class="ml-2 font-bold underline" @click="promoList.reload">Réessayer</button>
      </FeedbackAlertBanner>
      <p v-else-if="promoList.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        Aucun code promo créé pour l'instant.
      </p>
      <div v-else class="rounded-2xl border border-[var(--border-subtle)] bg-white p-2">
        <div v-for="p in promoList.items.value" :key="p.id" class="grid grid-cols-2 items-center gap-3.5 border-b border-sand-200 p-3.5 last:border-b-0 sm:grid-cols-[1.1fr_1.3fr_1.2fr_0.7fr_auto]">
          <span class="font-mono text-sm font-bold text-green-900">{{ p.code ?? 'Auto-appliqué' }}</span>
          <span class="text-[13px] text-[var(--text-secondary)]">{{ scopeLabel(p) }}</span>
          <span class="text-[13px] font-semibold">
            <template v-if="discountLabel(p)">{{ discountLabel(p) }}</template>
            <template v-if="discountLabel(p) && rewardLabel(p)"> · </template>
            <template v-if="rewardLabel(p)">{{ rewardLabel(p) }}</template>
          </span>
          <span class="text-xs text-[var(--text-faint)]">{{ p.uses_count }} usage{{ p.uses_count > 1 ? 's' : '' }}</span>
          <button
            type="button"
            class="justify-self-end rounded-pill px-3 py-1.5 text-xs font-bold"
            :class="p.is_active ? 'bg-green-50 text-green-700' : 'bg-sand-200 text-[var(--text-muted)]'"
            :disabled="togglingId === p.id"
            @click="toggleActive(p)"
          >{{ p.is_active ? 'Actif' : 'Désactivé' }}</button>
        </div>
      </div>
    </template>
  </div>
</template>
