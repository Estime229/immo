<script setup lang="ts">
import type { PropertySearchResult } from '~/types/property'
import type { LandlordBookingStatus, LandlordBookingSummary, PromoCodeSummary } from '~/types/landlordBookings'

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

const STATUS_LABEL: Record<LandlordBookingStatus, string> = { pending_payment: 'Paiement en attente', confirmed: 'Confirmée', cancelled: 'Annulée' }
const STATUS_TONE: Record<LandlordBookingStatus, 'ok' | 'warn' | 'danger'> = { pending_payment: 'warn', confirmed: 'ok', cancelled: 'danger' }

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
async function toggleActive(p: PromoCodeSummary) {
  togglingId.value = p.id
  try {
    await usePromoCodesApi().update(p.id, { is_active: !p.is_active })
    await promoList.reload()
  } catch {
    // le prochain rechargement de la liste reflétera l'état réel si l'action a échoué côté serveur
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
        <div v-for="b in bookingsBlock.items.value" :key="b.id" class="mb-3.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5">
          <div class="flex items-center gap-2.5">
            <p class="m-0 text-[15.5px] font-bold">{{ tenantName(b) }}</p>
            <CoreBadge :tone="STATUS_TONE[b.status]">{{ STATUS_LABEL[b.status] }}</CoreBadge>
          </div>
          <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">{{ fmtDate(b.check_in) }} → {{ fmtDate(b.check_out) }}</p>
          <p class="mb-0 mt-2.5 text-[14px] font-bold text-green-800">{{ fmtFcfa(b.total_price) }}</p>
        </div>
      </template>
    </template>

    <template v-else>
      <div class="mb-3.5 flex justify-end">
        <CoreButton size="sm" @click="modal = 'promo'">+ Créer un code</CoreButton>
      </div>

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
