<script setup lang="ts">
import { CalendarCheck, ClipboardCheck, MessageSquare, Plus, Ticket } from '@lucide/vue'
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

/* ---- Onglets, gardés dans l'URL (?onglet=promo, ?vue=…) ---- */
const route = useRoute()
const router = useRouter()
const tab = ref<'liste' | 'promo'>(route.query.onglet === 'promo' ? 'promo' : 'liste')
const MAIN_TABS = [{ value: 'liste', label: 'Réservations' }, { value: 'promo', label: 'Codes promo' }]
const tabModel = computed({ get: () => tab.value as string, set: (v: string) => { tab.value = v === 'promo' ? 'promo' : 'liste' } })
watch(tab, t => router.replace({ query: { ...route.query, onglet: t === 'promo' ? 'promo' : undefined } }))
watch(() => route.query.onglet, v => { tab.value = v === 'promo' ? 'promo' : 'liste' })

const reservationsBadge = useLandlordReservationsBadge()
const bookingsBlock = useFetchBlock(() => bookingsApi.fetchMine())
onMounted(() => {
  bookingsBlock.load()
  promoList.ensureLoaded()
  reservationsBadge.markAllSeen()
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
function bookingTabFrom(v: unknown): BookingTab {
  return BOOKING_TABS.some(t => t.key === v) ? (v as BookingTab) : 'upcoming'
}
const bookingTab = ref<BookingTab>(bookingTabFrom(route.query.vue))
watch(bookingTab, t => router.replace({ query: { ...route.query, vue: t === 'upcoming' ? undefined : t } }))
const bookingTabModel = computed({ get: () => bookingTab.value as string, set: (v: string) => { bookingTab.value = bookingTabFrom(v) } })
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
const bookingTabOptions = computed(() => BOOKING_TABS.map(t => ({ value: t.key, label: bookingCounts.value[t.key] && t.key !== 'cancelled' ? `${t.label} · ${bookingCounts.value[t.key]}` : t.label })))
/** Lien profond (?booking=, notification) : onglet de la réservation, carte mise en avant — suivi même si l'on est déjà sur la page. */
const highlighted = ref(String(route.query.booking ?? ''))
function focusBooking() {
  const target = bookingsBlock.items.value.find(b => b.id === highlighted.value)
  if (!target) return
  tab.value = 'liste'
  bookingTab.value = BOOKING_TABS.find(t => t.phases.includes(phaseOf(target)))?.key ?? 'upcoming'
  nextTick(() => document.getElementById(`booking-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}
watch(() => bookingsBlock.state.value, st => { if (st === 'success') focusBooking() })
watch(() => route.query.booking, v => {
  highlighted.value = String(v ?? '')
  if (highlighted.value) focusBooking()
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

/* ---- Activer / désactiver : la désactivation se confirme (le code cesse aussitôt de s'appliquer) ---- */
const togglingId = ref<string | null>(null)
const promoError = ref('')
const promoFlash = ref('')
const confirmPromoId = ref<string | null>(null)
function onPromoToggle(p: PromoCodeSummary, next: boolean) {
  promoFlash.value = ''
  if (!next) confirmPromoId.value = p.id
  else toggleActive(p)
}
async function toggleActive(p: PromoCodeSummary) {
  togglingId.value = p.id
  promoError.value = ''
  try {
    await usePromoCodesApi().update(p.id, { is_active: !p.is_active })
    confirmPromoId.value = null
    promoFlash.value = `Code ${p.code ?? 'auto-appliqué'} ${p.is_active ? 'désactivé : il ne s\'applique plus aux nouvelles réservations' : 'réactivé'}.`
    await promoList.reload()
  } catch (e) {
    promoError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La modification du code a échoué.') : 'La modification du code a échoué.'
  } finally {
    togglingId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <FormsSegmentedControl v-model="tabModel" :options="MAIN_TABS" class="mb-5.5" />

    <template v-if="tab === 'liste'">
      <div v-if="bookingsBlock.state.value === 'loading'" class="flex flex-col gap-3.5">
        <DataSkeletonCard v-for="i in 2" :key="i" :height="90" :lines="1" />
      </div>
      <FeedbackAlertBanner v-else-if="bookingsBlock.state.value === 'error'" tone="danger">
        Impossible de charger vos réservations pour le moment.
        <button type="button" class="ml-2 font-bold underline" @click="bookingsBlock.load">Réessayer</button>
      </FeedbackAlertBanner>
      <ProEmptyPanel v-else-if="bookingsBlock.state.value === 'empty'" :icon="CalendarCheck" title="Aucune réservation pour l'instant" text="Les séjours à la nuit réservés en ligne apparaissent ici. Il faut un tarif « À la nuit » actif sur le logement pour ouvrir la réservation.">
        <NuxtLink to="/pro/tarifs" class="inline-flex items-center rounded-md border border-[var(--border-default)] bg-white px-5 py-3 text-[14px] font-bold text-sand-900">Tarifs et disponibilités</NuxtLink>
      </ProEmptyPanel>
      <template v-else>
        <div class="mb-4.5 max-w-full overflow-x-auto">
          <FormsSegmentedControl v-model="bookingTabModel" :options="bookingTabOptions" size="sm" class="whitespace-nowrap" />
        </div>
        <p v-if="bookingError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ bookingError }}</p>
        <p v-if="!bookingRows.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">{{ BOOKING_TABS.find(t => t.key === bookingTab)?.empty }}</p>
        <article
          v-for="b in bookingRows"
          :id="`booking-${b.id}`"
          :key="b.id"
          class="mb-3.5 rounded-2xl border bg-white p-5.5"
          :class="highlighted === b.id ? 'border-green-600 ring-2 ring-green-100' : 'border-[var(--border-subtle)]'"
          data-testid="booking-card"
        >
          <div class="flex flex-wrap items-start gap-3">
            <CoreAvatar :name="tenantName(b)" :size="40" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="m-0 text-[15px] font-bold">{{ b.unit?.name ?? 'Logement supprimé' }}</p>
                <CoreBadge :tone="PHASE_TONE[phaseOf(b)]">{{ PHASE_LABEL[phaseOf(b)] }}</CoreBadge>
                <CoreBadge v-if="b.extended_from_booking_id" tone="info">Prolongation</CoreBadge>
              </div>
              <p class="mb-0 mt-1 text-xs text-[var(--text-faint)]">{{ tenantName(b) }} · <span class="font-mono">{{ fmtDate(b.check_in) }}</span> au <span class="font-mono">{{ fmtDate(b.check_out) }}</span> · {{ nightsOf(b) }} nuit{{ nightsOf(b) > 1 ? 's' : '' }}</p>
            </div>
            <CoreButton v-if="phaseOf(b) !== 'cancelled' && phaseOf(b) !== 'hold_expired' && phaseOf(b) !== 'past'" size="sm" tone="secondary" class="inline-flex items-center gap-1.5" :disabled="contactingId === b.id" @click="contactGuest(b)">
              <MessageSquare class="h-3.5 w-3.5" :stroke-width="1.9" />{{ contactingId === b.id ? 'Ouverture…' : 'Écrire au voyageur' }}
            </CoreButton>
          </div>
          <div v-if="b.status === 'confirmed'" class="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div class="rounded-lg border border-[var(--border-subtle)] bg-white p-3.5"><p class="m-0 font-mono text-base font-bold text-green-900">{{ formatFcfaShort(hostAmounts(b).paid) }}</p><p class="mb-0 mt-1 text-[11.5px] text-[var(--text-muted)]">payé par le voyageur</p></div>
            <div v-if="Number(b.discount_amount ?? 0) > 0" class="rounded-lg border border-[var(--border-subtle)] bg-white p-3.5"><p class="m-0 font-mono text-base font-bold text-green-900">−{{ formatFcfaShort(Number(b.discount_amount)) }}</p><p class="mb-0 mt-1 text-[11.5px] text-[var(--text-muted)]">réduction</p></div>
            <div class="rounded-lg border border-ok-border bg-ok-bg p-3.5"><p class="m-0 font-mono text-base font-bold text-green-900">{{ formatFcfaShort(hostAmounts(b).received) }}</p><p class="mb-0 mt-1 text-[11.5px] text-ok-fg">reçu sur votre wallet</p></div>
            <div v-if="hostAmounts(b).retained > 0" class="rounded-lg border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-3.5"><p class="m-0 font-mono text-base font-bold text-clay-900">{{ formatFcfaShort(hostAmounts(b).retained) }}</p><p class="mb-0 mt-1 text-[11.5px] text-clay-900">{{ hostAmounts(b).released ? 'retenue versée' : 'retenu jusqu\'au départ' }}</p></div>
          </div>
          <p v-else class="mb-0 mt-3 text-[13px] text-[var(--text-muted)]"><span class="font-mono font-bold">{{ fmtFcfa(b.total_price) }}</span><template v-if="phaseOf(b) === 'hold'"> · le voyageur a 15 min pour payer, rien n'est encore bloqué.</template></p>
          <div v-if="b.status === 'confirmed' && b.unit?.requires_booking_inventory && !b.retention_released_at" class="mt-3.5 flex flex-wrap items-center gap-2.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5">
            <p class="m-0 min-w-0 flex-1 text-[12.5px] text-warn-fg">État des lieux exigé pour ce logement : la retenue n'est versée qu'une fois l'état des lieux d'arrivée fait.</p>
            <NuxtLink :to="{ path: '/pro/edl', query: { booking: b.id } }" class="inline-flex items-center gap-1.5 rounded-pill border border-warn-border bg-white px-3.5 py-2 text-xs font-bold text-warn-fg-deep">
              <ClipboardCheck class="h-3.5 w-3.5" :stroke-width="1.9" />Faire l'état des lieux
            </NuxtLink>
          </div>
        </article>
      </template>
    </template>

    <template v-else>
      <div class="mb-4.5 flex flex-wrap items-center gap-3">
        <p class="m-0 min-w-0 flex-1 text-[13.5px] text-[var(--text-muted)]">Une réduction pour le voyageur, une récompense pour qui partage le code. Un code désactivé ne s'applique plus aux nouvelles réservations.</p>
        <CoreButton size="sm" class="inline-flex items-center gap-1.5" @click="modal = 'promo'"><Plus class="h-4 w-4" :stroke-width="1.9" />Créer un code</CoreButton>
      </div>

      <p v-if="promoFlash" class="mb-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ promoFlash }}</p>
      <p v-if="promoError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ promoError }}</p>
      <div v-if="promoList.state.value === 'loading'" class="flex flex-col gap-3">
        <DataSkeletonCard v-for="i in 2" :key="i" :height="60" :lines="1" />
      </div>
      <FeedbackAlertBanner v-else-if="promoList.state.value === 'error'" tone="danger">
        Impossible de charger vos codes promo pour le moment.
        <button type="button" class="ml-2 font-bold underline" @click="promoList.reload">Réessayer</button>
      </FeedbackAlertBanner>
      <ProEmptyPanel v-else-if="promoList.state.value === 'empty'" :icon="Ticket" title="Aucun code promo" text="Créez un code pour offrir une réduction sur vos séjours, sur tout votre portefeuille, un bien ou un seul logement.">
        <CoreButton class="inline-flex items-center gap-1.5" @click="modal = 'promo'"><Plus class="h-4 w-4" :stroke-width="1.9" />Créer un code</CoreButton>
      </ProEmptyPanel>
      <section v-else class="rounded-2xl border border-[var(--border-subtle)] bg-white px-5.5 py-2">
        <div v-for="p in promoList.items.value" :key="p.id" class="border-b border-sand-200 py-3.5 last:border-b-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="m-0 font-mono text-sm font-bold text-green-900">{{ p.code ?? 'Auto-appliqué' }}</p>
                <CoreBadge :tone="p.is_active ? 'ok' : 'neutral'">{{ p.is_active ? 'Actif' : 'Désactivé' }}</CoreBadge>
              </div>
              <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ scopeLabel(p) }} · {{ p.uses_count }} utilisation{{ p.uses_count > 1 ? 's' : '' }}</p>
            </div>
            <p class="m-0 text-[13px] font-semibold">
              <template v-if="discountLabel(p)">{{ discountLabel(p) }}</template>
              <template v-if="discountLabel(p) && rewardLabel(p)"> · </template>
              <template v-if="rewardLabel(p)">{{ rewardLabel(p) }}</template>
            </p>
            <div class="w-[46px] flex-none" :class="togglingId === p.id ? 'pointer-events-none opacity-50' : ''">
              <FormsToggle :model-value="p.is_active" :aria-label="p.is_active ? 'Désactiver le code' : 'Activer le code'" @update:model-value="onPromoToggle(p, $event)" />
            </div>
          </div>
          <CoreInlineConfirm
            v-if="confirmPromoId === p.id"
            class="mt-2.5"
            tone="warning"
            :message="`Désactiver le code ${p.code ?? 'auto-appliqué'} ? Il cesse aussitôt de s'appliquer aux nouvelles réservations.`"
            confirm-label="Désactiver"
            :loading="togglingId === p.id"
            @confirm="toggleActive(p)"
            @cancel="confirmPromoId = null"
          />
        </div>
      </section>
    </template>
  </div>
</template>
