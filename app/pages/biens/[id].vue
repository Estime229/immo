<script setup lang="ts">
import type { AvailabilityBlock, OwnerProfile, PointOfInterest, PropertySearchResult, ReviewItem, ReviewStats, UnitPricing, UnitSearchResult } from '~/types/property'
import type { BookingSummary, RentalRequestSummary } from '~/types/tenant'
import { quoteStay, rangeHitsBlock, stayLengthError } from '~/utils/stayPricing'
import { flattenSearchResults } from '~/utils/propertyListing'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { latestRequestFor } from '~/utils/rentalRequests'
import { resolveLocation } from '~/utils/geo'

const route = useRoute()
const searchApi = usePropertySearchApi()
const reviewsApi = useReviewsApi()
const refData = useReferenceData()
const bookingsApi = useBookingsApi()
const messagingApi = useMessagingApi()
const favorites = usePropertyFavorites()
const currentUser = useAuthUser()

const propertyId = String(route.params.id)

const property = ref<PropertySearchResult | null>(null)
const pageState = ref<'loading' | 'success' | 'error'>('loading')

const selectedUnit = ref<UnitSearchResult | null>(null)
/**
 * Un bien peut avoir plusieurs logements : jusqu'au Lot 49 la fiche montrait
 * seulement le premier renvoyé par l'API, sans aucun moyen d'atteindre les
 * autres. Le choix est gardé dans l'URL (`?unit=`) pour être partageable.
 */
function pickUnit(u: UnitSearchResult) {
  if (u.id === selectedUnit.value?.id) return
  selectedUnit.value = u
  checkIn.value = null
  checkOut.value = null
  bookingDone.value = false
  navigateTo({ query: { ...route.query, unit: u.id } }, { replace: true })
}

async function load() {
  pageState.value = 'loading'
  try {
    property.value = await searchApi.fetchById(propertyId)
    const wantedUnitId = String(route.query.unit ?? '')
    selectedUnit.value = property.value.units.find(u => u.id === wantedUnitId) ?? property.value.units[0] ?? null
    pageState.value = 'success'
  } catch {
    pageState.value = 'error'
  }
}
onMounted(async () => {
  await Promise.all([load(), favorites.ensureLoaded()])
})

/* ---- Référentiels réels pour les libellés (eau, compteur, meublé, équipements) ---- */
const waterRef = ref<{ code: string; labels: Record<string, string> }[]>([])
const meterRef = ref<{ code: string; labels: Record<string, string> }[]>([])
const furnishedRef = ref<{ code: string; labels: Record<string, string> }[]>([])
const featureRef = ref<{ code: string; labels: Record<string, string> }[]>([])
onMounted(async () => {
  const [w, m, f, feat] = await Promise.all([refData.fetchRef('WATER_SOURCE'), refData.fetchRef('METER_TYPE'), refData.fetchRef('FURNISHED_LEVEL'), refData.fetchRef('FEATURE')])
  waterRef.value = w
  meterRef.value = m
  furnishedRef.value = f
  featureRef.value = feat
})
function labelOf(list: { code: string; labels: Record<string, string> }[], code: string | null) {
  if (!code) return null
  return list.find(e => e.code === code)?.labels.fr ?? code
}

/** Équipements de l'unité choisie — saisis à la création (`pro/biens/ajouter.vue`) mais jamais affichés jusqu'ici. */
const features = computed(() => {
  const codes = selectedUnit.value?.resolved_features?.map(f => f.code) ?? []
  return codes.map(code => labelOf(featureRef.value, code) ?? code)
})

const specs = computed(() => {
  const u = selectedUnit.value
  if (!u) return []
  const out: { icon: string; label: string; value: string }[] = []
  if (u.surface_m2) out.push({ icon: '▭', label: 'Surface', value: `${u.surface_m2} m²` })
  out.push({ icon: '☾', label: 'Chambres', value: u.bedrooms_count ? String(u.bedrooms_count) : 'Studio' })
  const water = labelOf(waterRef.value, u.water_source)
  if (water) out.push({ icon: '≋', label: 'Eau', value: water })
  const meter = labelOf(meterRef.value, u.meter_type)
  if (meter) out.push({ icon: '⏻', label: 'Compteur', value: meter })
  const furnished = labelOf(furnishedRef.value, u.furnished_level)
  if (furnished) out.push({ icon: '☰', label: 'Ameublement', value: furnished })
  if (u.floor !== null) out.push({ icon: '⇡', label: 'Étage', value: u.floor === 0 ? 'Rez-de-chaussée' : `${u.floor}e étage` })
  return out
})

const photoUrls = computed(() => {
  const propMedia = property.value?.media.map(m => m.url) ?? []
  const unitMedia = selectedUnit.value?.unit_media.map(m => m.url) ?? []
  const all = [...propMedia, ...unitMedia]
  return all.length ? all : [null]
})

const description = computed(() => property.value?.description?.fr ?? selectedUnit.value?.description?.fr ?? '')

/* ---- Avis réels ---- */
const reviews = ref<ReviewItem[]>([])
const reviewStats = ref<ReviewStats | null>(null)
onMounted(async () => {
  try {
    const [r, s] = await Promise.all([reviewsApi.fetchByProperty(propertyId), reviewsApi.fetchPropertyStats(propertyId)])
    reviews.value = r
    reviewStats.value = s
  } catch {
    reviews.value = []
    reviewStats.value = null
  }
})

/* ---- Localisation : vraie carte + points d'intérêt signalés (GET /properties/:id/pois, public) ---- */
const pois = ref<PointOfInterest[]>([])
watch(() => property.value?.id, async id => {
  if (!id) return
  try {
    pois.value = await searchApi.fetchPois(id)
  } catch {
    pois.value = []
  }
})

const placeLabel = computed(() => [property.value?.neighborhood?.name, property.value?.city?.name].filter(Boolean).join(', '))
/** GPS s'il est valable (au Bénin), sinon centre de la ville présenté comme zone approximative. */
const geoLocation = computed(() => (property.value ? resolveLocation(property.value) : null))
const mapMarkers = computed(() => {
  const loc = geoLocation.value
  if (!loc || !property.value) return []
  return [{ id: property.value.id, lat: loc.lat, lng: loc.lng, precise: loc.precise, label: loc.precise ? (placeLabel.value || property.value.name) : `Secteur · ${property.value.city?.name}` }]
})
const mapsUrl = computed(() => (geoLocation.value?.precise ? `https://www.google.com/maps?q=${geoLocation.value.lat},${geoLocation.value.lng}` : null))

const POI_ICONS: Record<string, string> = { mosque: '☪', bar: '☗', school: '⌸', ecole: '⌸', noise: '♪', bruit: '♪', church: '✚', eglise: '✚', market: '▤', marche: '▤' }
function poiIcon(type: string) {
  return POI_ICONS[type.toLowerCase()] ?? '◈'
}
function poiLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

/* ---- Propriétaire (vitrine publique) ---- */
const owner = ref<OwnerProfile | null>(null)

async function loadOwner(ownerId: string) {
  try {
    const res = await searchApi.fetchOwnerStorefront(ownerId)
    owner.value = res.profile
  } catch {
    owner.value = null
  }
}
watch(() => property.value?.owner_id, id => { if (id) loadOwner(id) })

function formatMemberSince(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

/* ---- Tarification et disponibilité réelles de l'unité sélectionnée ---- */
const pricing = ref<UnitPricing[]>([])
const availabilityBlocks = ref<AvailabilityBlock[]>([])
async function loadUnitAvailability(unitId: string) {
  const [p, a] = await Promise.all([searchApi.fetchPricing(unitId), searchApi.fetchAvailability(unitId)])
  pricing.value = p
  availabilityBlocks.value = a
}
watch(selectedUnit, u => { if (u) loadUnitAvailability(u.id) }, { immediate: true })

const dailyPricing = computed(() => pricing.value.find(p => p.billing_frequency === 'daily' && p.is_available))
/**
 * Un logement « Les deux » (`rentalChoice: 'les_deux'`, voir propertyForm.ts) a à la fois une
 * grille journalière ET mensuelle active — avant ce correctif, `isShortStay` valait toujours
 * `true` dès qu'une grille journalière existait, rendant la candidature au bail totalement
 * inaccessible pour ce cas : un visiteur venu depuis la section « Au mois » de l'accueil ne
 * voyait ici qu'un calendrier de réservation courte durée, jamais l'option de bail.
 */
const monthlyPricing = computed(() => pricing.value.find(p => p.billing_frequency === 'monthly' && p.is_available))
const hasBothModes = computed(() => !!dailyPricing.value && !!monthlyPricing.value)
/** Préférence explicite (venant de la recherche, `?mode=nuit|mois`) sinon même défaut qu'avant ce correctif — à la nuit en priorité si les deux existent. */
const viewMode = ref<'nuit' | 'mois'>(route.query.mode === 'mois' ? 'mois' : 'nuit')
const isShortStay = computed(() => (hasBothModes.value ? viewMode.value === 'nuit' : !!dailyPricing.value))

/* ---- Dates du séjour : `BookingDateRangePicker` (mois, jours de la semaine, jours pris barrés) ---- */
const checkIn = ref<string | null>(null)
const checkOut = ref<string | null>(null)
const nights = computed(() => {
  if (!checkIn.value || !checkOut.value) return 0
  return Math.round((new Date(checkOut.value).getTime() - new Date(checkIn.value).getTime()) / 86400000)
})
const nightlyPrice = computed(() => Number(dailyPricing.value?.price ?? 0))
/** Même calcul que l'API (combinaison la moins chère des paliers actifs) — avant : nuits × prix de la nuit, faux dès 7 nuits (Lot 46). */
const stayQuote = computed(() => quoteStay(nights.value, pricing.value))
const stayTotal = computed(() => stayQuote.value?.total ?? nights.value * nightlyPrice.value)
const minStay = computed(() => selectedUnit.value?.min_duration_days ?? null)
const maxStay = computed(() => selectedUnit.value?.max_duration_days ?? null)
/** Refus que l'API ferait de toute façon (400 durée, 409 dates prises) — dits avant de cliquer. */
const stayProblem = computed(() => {
  if (!checkIn.value || !checkOut.value) return null
  return stayLengthError(nights.value, minStay.value, maxStay.value)
    ?? (rangeHitsBlock(checkIn.value, checkOut.value, availabilityBlocks.value) ? 'Une partie de ces dates est déjà prise : choisissez une période sans jour barré.' : null)
})

/* ---- Coûts d'entrée réels (longue durée) — depuis les champs réels de l'unité, jamais des constantes ---- */
const entryLines = computed(() => {
  const u = selectedUnit.value
  if (!u) return []
  const price = Number(u.price)
  const lines: { label: string; value: string }[] = []
  if (u.frais_dossier) lines.push({ label: 'Frais de dossier', value: formatFcfa(Number(u.frais_dossier)) })
  if (u.caution_months) lines.push({ label: `Caution (${u.caution_months} mois)`, value: formatFcfa(price * u.caution_months) })
  if (u.avance_months) lines.push({ label: `Avance (${u.avance_months} mois)`, value: formatFcfa(price * u.avance_months) })
  return lines
})
const entryTotal = computed(() => formatFcfa(entryLines.value.reduce((sum, l) => sum + Number(l.value.replace(/\D/g, '')), 0)))
const cautionLabel = computed(() => {
  const u = selectedUnit.value
  return u?.caution_months ? formatFcfa(Number(u.price) * u.caution_months) : null
})

/* ---- Réserver (courte durée) / Envoyer une demande (longue durée) ---- */
const bookingLoading = ref(false)
const bookingError = ref('')
const bookingDone = ref(false)
/**
 * Le paiement s'ouvre tout de suite, sur la fiche même : avant, l'écran disait
 * « Vous avez 15 minutes pour la payer » et renvoyait vers « Mes réservations ».
 * La réponse de `POST /bookings` n'a pas l'unité imbriquée : on la complète.
 */
const payingBooking = ref<BookingSummary | null>(null)
const bookingConfirmed = ref(false)
/** Dates prises entre-temps ou délai dépassé : on repart d'une sélection vierge, calendrier rafraîchi. */
function onBookingChanged() {
  bookingDone.value = false
  payingBooking.value = null
  checkIn.value = null
  checkOut.value = null
  if (selectedUnit.value) loadUnitAvailability(selectedUnit.value.id)
}
async function submitBooking() {
  if (!currentUser.value) { navigateTo(`/connexion?redirect=/biens/${propertyId}`); return }
  if (!selectedUnit.value || !checkIn.value || !checkOut.value) return
  bookingLoading.value = true
  bookingError.value = ''
  try {
    const created = await bookingsApi.create(selectedUnit.value.id, checkIn.value, checkOut.value)
    const u = selectedUnit.value
    payingBooking.value = {
      ...created,
      retained_amount: null,
      retention_released_at: null,
      unit: { id: u.id, name: u.name, property_id: propertyId, min_duration_days: u.min_duration_days, booking_retention_percentage: u.booking_retention_percentage ?? null, requires_booking_inventory: u.requires_booking_inventory }
    } as BookingSummary
    bookingDone.value = true
  } catch (e) {
    bookingError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La réservation a échoué.') : 'La réservation a échoué.'
  } finally {
    bookingLoading.value = false
  }
}

/* ---- Candidature (longue durée) : `POST /rental/requests`, jamais branché avant le Lot 51 ---- */
const rentalApi = useRentalRequestsApi()
const myRequests = ref<RentalRequestSummary[]>([])
const candidatureOpen = ref(false)
const myRequest = computed(() => (selectedUnit.value ? latestRequestFor(myRequests.value, selectedUnit.value.id) : null))
const unitTaken = computed(() => !!selectedUnit.value?.unit_status && selectedUnit.value.unit_status !== 'available')
const myRequestsLoaded = ref(false)
async function loadMyRequests() {
  try {
    if (currentUser.value) myRequests.value = await rentalApi.fetchMine('tenant')
  } catch {
    myRequests.value = []
  } finally {
    myRequestsLoaded.value = true
  }
}
onMounted(loadMyRequests)
// Lien « Déposer ma candidature » depuis une visite réalisée (Mes visites) : une fois le logement et mes candidatures connus.
let candidatureQueryHandled = false
watch(() => pageState.value === 'success' && myRequestsLoaded.value, ready => {
  if (!ready || candidatureQueryHandled) return
  candidatureQueryHandled = true
  if (route.query.candidature === '1') openCandidature()
})
function openCandidature() {
  if (!currentUser.value) { navigateTo(`/connexion?redirect=${encodeURIComponent(`/biens/${propertyId}${selectedUnit.value ? `?unit=${selectedUnit.value.id}&candidature=1` : ''}`)}`); return }
  if (unitTaken.value || myRequest.value?.status === 'pending' || myRequest.value?.status === 'accepted') return
  candidatureOpen.value = true
}
function onCandidatureCreated(r: RentalRequestSummary) {
  myRequests.value = [r, ...myRequests.value]
}
function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

/* ---- Demander une visite (longue durée uniquement — pas de sens pour une réservation courte durée déjà datée) ---- */
const visitModalOpen = ref(false)
function openVisitModal() {
  if (!currentUser.value) { navigateTo(`/connexion?redirect=/biens/${propertyId}`); return }
  visitModalOpen.value = true
}

const contactLoading = ref(false)
const contactError = ref('')
async function sendInquiry() {
  if (!currentUser.value) { navigateTo(`/connexion?redirect=/biens/${propertyId}`); return }
  if (!property.value) return
  contactLoading.value = true
  contactError.value = ''
  try {
    const conv = await messagingApi.createConversation(selectedUnit.value?.id ?? '', property.value.owner_id, `Bonjour, je suis intéressé(e) par ${selectedUnit.value?.name ?? property.value.name}.`)
    await navigateTo(`/locataire/messages?conversation=${conv.id}`)
  } catch (e) {
    contactError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'envoi a échoué.") : "L'envoi a échoué."
  } finally {
    contactLoading.value = false
  }
}

/* ---- Favoris ---- */
async function onToggleFavorite() {
  if (!currentUser.value) { navigateTo({ path: '/connexion', query: { redirect: route.fullPath } }); return }
  await favorites.toggleProperty(propertyId)
}

/* ---- Partage ---- */
const shareOpen = ref(false)
const linkCopied = ref(false)
/** Lien partagé : l'URL est lue au montage (`location` n'existe pas dans un template Vue : « Partager » plantait), logement choisi compris. */
const shareOrigin = ref('')
onMounted(() => { shareOrigin.value = window.location.origin })
const shareUrl = computed(() => `${shareOrigin.value}/biens/${propertyId}${selectedUnit.value ? `?unit=${selectedUnit.value.id}` : ''}`)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 2000)
  } catch {
    linkCopied.value = false
  }
}

/* ---- Logements similaires (même ville, hors ce bien) ---- */
const similar = ref<import('~/utils/propertyListing').ListingCard[]>([])
watch(property, async p => {
  if (!p) return
  try {
    const res = await searchApi.search({ city: p.city?.name, limit: 8 })
    similar.value = flattenSearchResults((res.data as PropertySearchResult[]).filter(x => x.id !== p.id)).slice(0, 4)
  } catch {
    similar.value = []
  }
})
async function onFavoriteSimilar(l: { propertyId: string | null }) {
  if (!l.propertyId) return
  if (!currentUser.value) { navigateTo({ path: '/connexion', query: { redirect: route.fullPath } }); return }
  await favorites.toggleProperty(l.propertyId)
}
</script>

<template>
  <div class="mx-auto max-w-[1240px] px-[26px] pb-[70px] pt-[22px]">
    <NuxtLink to="/recherche" class="mb-4 inline-block rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13.5px] font-semibold text-sand-900">← Résultats</NuxtLink>

    <div v-if="pageState === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard :height="320" :lines="1" />
      <DataSkeletonCard :height="120" :lines="3" />
    </div>

    <FeedbackAlertBanner v-else-if="pageState === 'error' || !property || !selectedUnit" tone="danger">
      Ce logement est introuvable ou n'est plus disponible.
    </FeedbackAlertBanner>

    <template v-else>
      <div class="grid grid-cols-1 gap-[9px] overflow-hidden rounded-2xl sm:grid-cols-[1.9fr_1fr_1fr] sm:grid-rows-2">
        <div class="relative h-[220px] bg-cover bg-center bg-sand-200 sm:row-span-2 sm:h-auto" :style="photoUrls[0] ? { backgroundImage: `url(${photoUrls[0]})` } : {}">
          <div class="absolute bottom-[15px] left-[15px] rounded-pill bg-white/[.94] px-3.5 py-2 text-[12.5px] font-bold">{{ photoUrls.length }} photo{{ photoUrls.length > 1 ? 's' : '' }}</div>
          <button type="button" class="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-pill bg-white/[.93]" @click="onToggleFavorite">
            <span class="text-[17px] leading-none" :class="propertyId && favorites.isFavoriteProperty(propertyId) ? 'animate-[im-pop_.45s_ease] text-fav' : 'text-[var(--text-secondary)]'">♥</span>
          </button>
        </div>
        <div v-for="(url, i) in photoUrls.slice(1, 4)" :key="i" class="hidden h-[142px] bg-cover bg-center bg-sand-200 sm:block" :style="url ? { backgroundImage: `url(${url})` } : {}" />
        <div class="relative hidden h-[142px] bg-cover bg-center bg-sand-200 sm:block" :style="photoUrls[4] ? { backgroundImage: `url(${photoUrls[4]})` } : {}">
          <button type="button" class="absolute bottom-[13px] right-[13px] rounded-pill bg-white/95 px-[13px] py-[9px] text-xs font-bold" @click="shareOpen = !shareOpen">Partager</button>
        </div>
      </div>

      <div v-if="shareOpen" class="mt-3.5 flex flex-wrap items-center gap-4.5 rounded-lg border border-[var(--border-subtle)] bg-white p-[18px]">
        <div class="flex-1">
          <p class="m-0 text-[14.5px] font-bold">Partager cette annonce</p>
        </div>
        <div class="flex gap-2.5">
          <a :href="`https://wa.me/?text=${encodeURIComponent(shareUrl)}`" target="_blank" rel="noopener" class="rounded-sm bg-whatsapp px-[17px] py-[11px] text-[13px] font-bold text-white">WhatsApp</a>
          <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-[17px] py-[11px] text-[13px] font-bold" @click="copyLink">{{ linkCopied ? 'Lien copié ✓' : 'Copier le lien' }}</button>
        </div>
      </div>

      <div class="mt-8 grid grid-cols-1 items-start gap-[52px] lg:grid-cols-[1fr_400px]">
        <div>
          <div class="flex items-start justify-between gap-5">
            <div>
              <h1 class="m-0 font-display text-title-1 font-bold tracking-title-1">{{ selectedUnit.name }}</h1>
              <p class="mb-0 mt-2 text-[15px] text-[var(--text-secondary)]">
                {{ [property.neighborhood?.name, property.city?.name].filter(Boolean).join(', ') }}
                <template v-if="reviewStats && reviewStats.count > 0"> · ★ {{ reviewStats.average.toFixed(1).replace('.', ',') }} · {{ reviewStats.count }} avis</template>
              </p>
            </div>
            <div v-if="owner?.is_verified" class="flex items-center gap-2 whitespace-nowrap rounded-md border border-green-100 bg-green-50 px-[15px] py-2.5">
              <span class="h-2 w-2 rounded-pill bg-green-600" />
              <span class="text-[13px] font-bold text-green-900">Propriétaire vérifié</span>
            </div>
          </div>

          <div class="mt-[22px] flex flex-wrap gap-2.5">
            <div v-for="s in specs" :key="s.label" class="flex items-center gap-2.5 rounded-md border border-[var(--border-subtle)] bg-white px-[15px] py-3">
              <span class="text-[15px]">{{ s.icon }}</span>
              <div>
                <p class="m-0 text-[10.5px] font-bold uppercase tracking-[.05em] text-[var(--text-faint)]">{{ s.label }}</p>
                <p class="mb-0 mt-0.5 text-[13.5px] font-semibold">{{ s.value }}</p>
              </div>
            </div>
          </div>

          <template v-if="features.length">
            <div class="my-[30px] h-px bg-sand-300" />
            <h3 class="mb-3 mt-0 font-display text-[19px] font-bold tracking-[-.02em]">Équipements</h3>
            <div class="flex flex-wrap gap-2">
              <span v-for="f in features" :key="f" class="rounded-pill border border-[var(--border-subtle)] bg-white px-3.5 py-2 text-[13px] font-semibold text-[var(--text-secondary)]">{{ f }}</span>
            </div>
          </template>

          <template v-if="description">
            <div class="my-[30px] h-px bg-sand-300" />
            <h3 class="mb-3 mt-0 font-display text-[19px] font-bold tracking-[-.02em]">À propos du logement</h3>
            <p class="m-0 max-w-[640px] whitespace-pre-line text-[15px] leading-[1.65] text-[var(--text-secondary)]">{{ description }}</p>
          </template>

          <template v-if="owner">
            <div class="my-[30px] h-px bg-sand-300" />
            <NuxtLink :to="`/vitrine/${property.owner_id}`" class="flex items-center gap-[15px] rounded-xl border border-[var(--border-subtle)] bg-white p-5 transition-shadow hover:shadow-card">
              <CoreAvatar :name="owner.display_name" :size="52" color="var(--color-green-50)" class="!text-green-700" />
              <div class="flex-1">
                <p class="m-0 text-[15.5px] font-bold">{{ owner.display_name }} <span v-if="owner.is_verified" class="ml-1.5 rounded-pill border border-green-100 bg-green-50 px-2.5 py-1 text-[11.5px] font-bold text-green-700">✓ Vérifié</span></p>
                <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">Membre depuis {{ formatMemberSince(owner.member_since) }}</p>
              </div>
              <span class="text-[13px] font-bold text-green-700">Voir sa vitrine →</span>
            </NuxtLink>
          </template>

          <div class="my-[30px] h-px bg-sand-300" />
          <h3 class="mb-4 mt-0 font-display text-[19px] font-bold tracking-[-.02em]">Avis des locataires</h3>
          <p v-if="!reviews.length" class="m-0 text-[13.5px] text-[var(--text-muted)]">Aucun avis pour l'instant.</p>
          <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div v-for="r in reviews" :key="r.id" class="rounded-lg border border-[var(--border-subtle)] bg-white p-5">
              <div class="flex items-center gap-2.5">
                <CoreAvatar :name="`${r.reviewer.first_name ?? ''} ${r.reviewer.last_name ?? ''}`" :size="36" color="var(--color-green-600)" />
                <div>
                  <p class="m-0 text-sm font-bold">{{ r.reviewer.first_name }} {{ r.reviewer.last_name }} <span class="font-mono text-xs text-[var(--text-faint)]">★{{ r.rating }}</span></p>
                  <p class="mb-0 mt-px text-xs text-[var(--text-faint)]">{{ new Date(r.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }}</p>
                </div>
              </div>
              <p v-if="r.comment" class="mb-0 mt-3.5 text-sm leading-[1.6] text-[var(--text-secondary)]">{{ r.comment }}</p>
            </div>
          </div>

          <div class="my-[30px] h-px bg-sand-300" />
          <h3 class="mb-4 mt-0 font-display text-[19px] font-bold tracking-[-.02em]">Localisation</h3>
          <div v-if="mapMarkers.length" class="relative isolate h-[280px] overflow-hidden rounded-xl border border-[var(--border-subtle)]">
            <MapView :markers="mapMarkers" :active-id="property.id" :single-zoom="15" />
            <a v-if="mapsUrl" :href="mapsUrl" target="_blank" rel="noopener" class="absolute bottom-7 right-3.5 z-[1000] rounded-pill bg-white/[.94] px-3.5 py-2 text-[12.5px] font-bold text-green-700 shadow-card">Ouvrir dans Maps →</a>
          </div>
          <div v-else class="grid h-[120px] place-items-center rounded-xl border border-dashed border-[var(--border-default)] bg-white px-6 text-center text-[13.5px] text-[var(--text-muted)]">
            {{ placeLabel || 'Localisation non précisée' }}
          </div>
          <p v-if="geoLocation && !geoLocation.precise" class="mb-0 mt-2.5 text-[12.5px] text-[var(--text-faint)]">Position approximative : l'emplacement exact de ce bien n'est pas disponible. La zone correspond au secteur de {{ property.city?.name }}.</p>
          <p v-if="property.address" class="mb-0 mt-2.5 text-[13px] text-[var(--text-muted)]">{{ property.address }}</p>

          <p class="mb-2.5 mt-5 text-xs font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Aux alentours</p>
          <p v-if="!pois.length" class="m-0 text-[13.5px] text-[var(--text-muted)]">Aucun point d'intérêt signalé pour l'instant.</p>
          <div v-else class="flex flex-col gap-2.5">
            <div v-for="p in pois" :key="p.id" class="flex items-center gap-3.5 rounded-md border border-[var(--border-subtle)] bg-white px-[15px] py-3">
              <span class="grid h-8 w-8 flex-none place-items-center rounded-pill bg-sand-100 text-[14px]">{{ poiIcon(p.poi_type) }}</span>
              <div class="flex-1">
                <p class="m-0 text-[13.5px] font-semibold">{{ p.name }} <span class="font-normal text-[var(--text-faint)]">· {{ poiLabel(p.poi_type) }}</span></p>
                <p v-if="p.distance_meters !== null" class="mb-0 mt-0.5 text-[12px] text-[var(--text-faint)]">{{ p.distance_meters }} m</p>
              </div>
              <span v-if="p.verified" class="whitespace-nowrap rounded-pill border border-green-100 bg-green-50 px-2.5 py-1 text-[11px] font-bold text-green-700">✓ Vérifié</span>
            </div>
          </div>
        </div>

        <div class="lg:sticky lg:top-[94px]">
          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6 shadow-panel">
            <div v-if="(property?.units.length ?? 0) > 1" class="mb-4">
              <p class="mb-2 mt-0 text-xs font-black uppercase tracking-[.05em] text-[var(--text-faint)]">{{ property?.units.length }} logements dans ce bien</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="u in property?.units ?? []"
                  :key="u.id"
                  type="button"
                  class="rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold"
                  :class="u.id === selectedUnit.id ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                  @click="pickUnit(u)"
                >{{ u.name }}</button>
              </div>
            </div>
            <div v-if="hasBothModes" class="mb-3.5 grid grid-cols-2 gap-1.5 rounded-pill bg-[var(--surface-page)] p-1">
              <button
                type="button"
                class="rounded-pill py-2 text-[13px] font-bold transition-colors"
                :class="viewMode === 'mois' ? 'bg-white text-green-800 shadow-sm' : 'text-[var(--text-muted)]'"
                @click="viewMode = 'mois'"
              >Louer au mois</button>
              <button
                type="button"
                class="rounded-pill py-2 text-[13px] font-bold transition-colors"
                :class="viewMode === 'nuit' ? 'bg-white text-green-800 shadow-sm' : 'text-[var(--text-muted)]'"
                @click="viewMode = 'nuit'"
              >Réserver à la nuit</button>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="font-mono text-[28px] font-bold tracking-[-.02em] text-green-900">{{ formatFcfaShort(isShortStay ? nightlyPrice : Number(monthlyPricing?.price ?? selectedUnit.price)) }}</span>
              <span class="text-[15px] font-semibold text-[var(--text-muted)]">{{ isShortStay ? '/ nuit' : '/ mois' }}</span>
            </div>

            <template v-if="bookingDone">
              <div class="mt-4 rounded-md border border-ok-border bg-ok-bg p-4 text-center">
                <p class="m-0 text-sm font-bold text-ok-fg">{{ bookingConfirmed ? 'Séjour confirmé ✓' : 'Dates gardées 15 minutes' }}</p>
                <p class="mb-0 mt-1.5 text-[12.5px] text-ok-fg">{{ bookingConfirmed ? 'Retrouvez-le, avec son reçu, dans vos réservations.' : 'Payez pour confirmer — sans paiement, les dates sont libérées.' }}</p>
                <NuxtLink to="/locataire/reservations" class="mt-3 inline-block rounded-md bg-[image:var(--action-primary)] px-4 py-2.5 text-[13px] font-bold text-white">Mes réservations</NuxtLink>
              </div>
            </template>
            <template v-else-if="isShortStay">
              <p class="mb-2.5 mt-4 text-xs font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Vos dates<span v-if="minStay && minStay > 1" class="ml-1.5 font-semibold normal-case tracking-normal">· {{ minStay }} nuits minimum</span></p>
              <BookingDateRangePicker
                v-model:check-in="checkIn"
                v-model:check-out="checkOut"
                :blocks="availabilityBlocks"
                :min-nights="minStay"
                :max-nights="maxStay"
              />

              <div v-if="nights > 0" class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
                <template v-if="stayQuote">
                  <DataMoneyLine v-for="l in stayQuote.lines" :key="l.label" :label="l.label" :value="formatFcfa(l.amount)" />
                  <p v-if="stayQuote.saving > 0" class="mb-1 mt-1 text-[12px] font-semibold text-ok-fg">Tarif long séjour appliqué : −{{ formatFcfa(stayQuote.saving) }}</p>
                </template>
                <DataMoneyLine label="Total à payer" :value="formatFcfa(stayTotal)" total />
              </div>

              <p v-if="stayProblem" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ stayProblem }}</p>
              <p v-if="bookingError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ bookingError }}</p>
              <CoreButton size="lg" full-width class="mt-4" :disabled="!nights || !!stayProblem || bookingLoading" @click="submitBooking">{{ bookingLoading ? 'Réservation…' : 'Réserver' }}</CoreButton>
              <p class="mb-0 mt-2.5 text-center text-[12.5px] text-[var(--text-faint)]">Aucun montant prélevé à cette étape</p>
            </template>

            <template v-else>
              <div class="mt-4.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
                <p class="mb-2.5 mt-0 text-xs font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Ce que vous payez à l'entrée</p>
                <template v-if="entryLines.length">
                  <DataMoneyLine v-for="l in entryLines" :key="l.label" :label="l.label" :value="l.value" />
                  <DataMoneyLine label="Total à l'entrée" :value="entryTotal" total />
                  <FeedbackEscrowNotice v-if="cautionLabel" :amount="`Dont ${cautionLabel} de caution séquestrée`" class="mt-3.5">
                    Versée à Immo, pas au propriétaire : personne n'y touche pendant le bail. Sa restitution en fin de bail n'est pas encore gérée dans l'application.
                  </FeedbackEscrowNotice>
                </template>
                <p v-else class="m-0 text-[13px] text-[var(--text-muted)]">Détail des frais d'entrée communiqué par le propriétaire.</p>
              </div>

              <div v-if="unitTaken" class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5 text-[13px] leading-[1.55] text-[var(--text-secondary)]">
                Ce logement est déjà loué : les candidatures sont fermées pour l'instant.
              </div>
              <div v-else-if="myRequest?.status === 'pending'" class="mt-4 rounded-md border border-warn-border bg-warn-bg p-3.5 text-[13px] leading-[1.55] text-warn-fg">
                <p class="m-0 font-bold">Candidature envoyée le {{ shortDate(myRequest.created_at) }}</p>
                <p class="mb-0 mt-1">Le propriétaire ne l'a pas encore traitée. <NuxtLink :to="`/locataire/candidatures?request=${myRequest.id}`" class="font-bold underline">Suivre ma candidature</NuxtLink></p>
              </div>
              <div v-else-if="myRequest?.status === 'accepted'" class="mt-4 rounded-md border border-ok-border bg-ok-bg p-3.5 text-[13px] leading-[1.55] text-green-900">
                <p class="m-0 font-bold">Votre candidature a été retenue ✓</p>
                <p class="mb-0 mt-1">Le propriétaire prépare le bail. <NuxtLink to="/locataire/bail" class="font-bold underline">Voir mon bail</NuxtLink></p>
              </div>
              <template v-else>
                <p v-if="myRequest?.status === 'rejected'" class="mb-0 mt-3 text-[12.5px] text-[var(--text-muted)]">Votre précédente candidature n'a pas été retenue. Vous pouvez en déposer une nouvelle.</p>
                <CoreButton size="lg" full-width class="mt-4" @click="openCandidature">Déposer ma candidature</CoreButton>
              </template>
              <CoreButton tone="secondary" size="lg" full-width class="mt-2.5" @click="openVisitModal">Demander une visite</CoreButton>
              <p v-if="contactError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ contactError }}</p>
              <button type="button" class="mt-3 block w-full text-center text-[13px] font-bold text-green-700 underline disabled:opacity-60" :disabled="contactLoading" @click="sendInquiry">{{ contactLoading ? 'Ouverture…' : 'Poser une question au propriétaire' }}</button>
              <p class="mb-0 mt-2.5 text-center text-[12.5px] text-[var(--text-faint)]">Aucun montant prélevé à cette étape</p>
            </template>
          </div>
        </div>
      </div>

      <TenantBookingPayModal v-if="payingBooking" :booking="payingBooking" @close="payingBooking = null" @paid="bookingConfirmed = true; payingBooking = null" @changed="onBookingChanged" />

      <TenantCandidatureModal
        v-if="candidatureOpen && selectedUnit"
        :unit="selectedUnit"
        :property-name="property.name"
        @close="candidatureOpen = false"
        @created="onCandidatureCreated"
      />

      <TenantVisitRequestModal
        v-if="visitModalOpen && selectedUnit"
        :unit-id="selectedUnit.id"
        :unit-name="selectedUnit.name"
        @close="visitModalOpen = false"
        @requested="visitModalOpen = false"
      />

      <div v-if="similar.length" class="mt-[52px]">
        <div class="mb-[18px] flex items-end justify-between">
          <div>
            <h3 class="m-0 font-display text-[22px] font-bold tracking-[-.025em]">Vous pourriez aussi aimer</h3>
          </div>
          <NuxtLink to="/recherche" class="whitespace-nowrap text-sm font-bold text-green-700">Tout voir →</NuxtLink>
        </div>
        <div class="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
          <SearchPropertyCard
            v-for="l in similar"
            :key="l.unitId"
            :listing="l"
            :favorite="l.propertyId ? favorites.isFavoriteProperty(l.propertyId) : false"
            @open="l.propertyId && navigateTo(`/biens/${l.propertyId}?unit=${l.unitId}`)"
            @favorite="onFavoriteSimilar(l)"
          />
        </div>
      </div>
    </template>
  </div>
</template>
