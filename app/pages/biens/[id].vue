<script setup lang="ts">
import { ArrowLeft, ArrowRight, BadgeCheck, BedDouble, Check, ChevronLeft, ChevronRight, Church, CircleCheck, Clock, Droplets, ExternalLink, Heart, House, ImageOff, Images, Landmark, Layers, MapPin, MessageCircle, Ruler, School, Share2, ShoppingBasket, Sofa, Star, Volume2, Wine, X, Zap } from '@lucide/vue'
import type { Component } from 'vue'
import type { AvailabilityBlock, OwnerProfile, PointOfInterest, PropertySearchResult, ReviewItem, ReviewStats, UnitPricing, UnitSearchResult } from '~/types/property'
import type { BookingSummary, RentalRequestSummary } from '~/types/tenant'
import { quoteStay, rangeHitsBlock, stayLengthError } from '~/utils/stayPricing'
import { flattenSearchResults, type ListingCard } from '~/utils/propertyListing'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { latestRequestFor } from '~/utils/rentalRequests'
import { resolveLocation } from '~/utils/geo'
import { deriveHoldCountdown } from '~/utils/bookingHold'
import { localTodayIso } from '~/utils/dateRangeCalendar'
import { recallSearch } from '~/utils/searchPill'
import { roleHomePath } from '~/utils/roleRoutes'
import { personName } from '~/utils/avatar'
import { classifyRental, displayPrice, mapLimited } from '~/utils/rentalMode'

const route = useRoute()
const router = useRouter()
const searchApi = usePropertySearchApi()
const reviewsApi = useReviewsApi()
const refData = useReferenceData()
const bookingsApi = useBookingsApi()
const messagingApi = useMessagingApi()
const favorites = usePropertyFavorites()
const currentUser = useAuthUser()

const propertyId = String(route.params.id)

const property = ref<PropertySearchResult | null>(null)
/** `notfound` (404, ou identifiant mal formé → 400) ≠ `error` (panne réseau) : avant, les deux disaient « introuvable ». */
const pageState = ref<'loading' | 'success' | 'notfound' | 'error'>('loading')

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
  heldBooking.value = null
  bookingConfirmed.value = false
  resumeNotice.value = false
  navigateTo({ query: { ...route.query, unit: u.id } }, { replace: true })
}

async function load() {
  pageState.value = 'loading'
  try {
    const p = await searchApi.fetchById(propertyId)
    property.value = p
    const wantedUnitId = String(route.query.unit ?? '')
    selectedUnit.value = p.units.find(u => u.id === wantedUnitId) ?? p.units[0] ?? null
    pageState.value = selectedUnit.value ? 'success' : 'notfound'
  } catch (e) {
    pageState.value = e instanceof ApiRequestError && (e.status === 404 || e.status === 400) ? 'notfound' : 'error'
  }
}
onMounted(async () => {
  await Promise.all([load(), favorites.ensureLoaded()])
})

/** Lien de notification ou « Logements dans ce bien » vers un autre logement, alors qu'on est déjà sur la fiche. */
watch(() => route.query.unit, id => {
  const u = property.value?.units.find(x => x.id === String(id ?? ''))
  if (u && u.id !== selectedUnit.value?.id) pickUnit(u)
})

/* ---- « ← Résultats » : retour à la recherche d'où l'on vient, filtres compris ----
 * Arrivé depuis /recherche : retour arrière (la page retrouve ses critères dans l'URL).
 * Sinon (lien partagé, vitrine, favoris) : la dernière recherche de l'onglet, ou une recherche vierge. */
const backTo = ref('/recherche')
const cameFromSearch = ref(false)
onMounted(() => {
  const back = router.options.history.state.back
  cameFromSearch.value = typeof back === 'string' && back.startsWith('/recherche')
  backTo.value = cameFromSearch.value ? String(back) : recallSearch()
})
function goBack() {
  if (cameFromSearch.value) router.back()
  else navigateTo(backTo.value)
}

/* ---- Référentiels réels pour les libellés (eau, compteur, meublé, équipements) ---- */
const waterRef = ref<{ code: string; labels: Record<string, string> }[]>([])
const meterRef = ref<{ code: string; labels: Record<string, string> }[]>([])
const furnishedRef = ref<{ code: string; labels: Record<string, string> }[]>([])
const featureRef = ref<{ code: string; labels: Record<string, string> }[]>([])
onMounted(async () => {
  try {
    const [w, m, f, feat] = await Promise.all([refData.fetchRef('WATER_SOURCE'), refData.fetchRef('METER_TYPE'), refData.fetchRef('FURNISHED_LEVEL'), refData.fetchRef('FEATURE')])
    waterRef.value = w
    meterRef.value = m
    furnishedRef.value = f
    featureRef.value = feat
  } catch {
    // Sans référentiels, les caractéristiques s'affichent avec leur code : la fiche reste utilisable.
  }
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
  const out: { icon: Component; label: string; value: string }[] = []
  if (u.surface_m2) out.push({ icon: Ruler, label: 'Surface', value: `${u.surface_m2} m²` })
  out.push({ icon: BedDouble, label: 'Chambres', value: u.bedrooms_count ? String(u.bedrooms_count) : 'Studio' })
  const water = labelOf(waterRef.value, u.water_source)
  if (water) out.push({ icon: Droplets, label: 'Eau', value: water })
  const meter = labelOf(meterRef.value, u.meter_type)
  if (meter) out.push({ icon: Zap, label: 'Compteur', value: meter })
  const furnished = labelOf(furnishedRef.value, u.furnished_level)
  if (furnished) out.push({ icon: Sofa, label: 'Ameublement', value: furnished })
  if (u.floor !== null) out.push({ icon: Layers, label: 'Étage', value: u.floor === 0 ? 'Rez-de-chaussée' : `${u.floor}e étage` })
  return out
})

/* ---- Photos : carrousel au doigt sur mobile, mosaïque sur grand écran, galerie plein écran partout ---- */
const photos = computed(() => {
  const propMedia = property.value?.media.map(m => m.url) ?? []
  const unitMedia = selectedUnit.value?.unit_media.map(m => m.url) ?? []
  return [...new Set([...propMedia, ...unitMedia])].filter(Boolean)
})
/** Mosaïque complète à partir de 5 photos, réduite à 3-4, une seule grande photo en dessous. */
const mosaic = computed(() => (photos.value.length >= 5 ? 'full' : photos.value.length >= 3 ? 'duo' : 'single'))
const mosaicTiles = computed(() => photos.value.slice(1, mosaic.value === 'full' ? 5 : mosaic.value === 'duo' ? 3 : 1))
const photosLabel = computed(() => (photos.value.length > 1 ? `Voir les ${photos.value.length} photos` : 'Agrandir la photo'))

const carouselIndex = ref(0)
function onCarouselScroll(e: Event) {
  const el = e.target as HTMLElement
  carouselIndex.value = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1))
}

const lightboxOpen = ref(false)
const lightboxIndex = ref(0)
function openLightbox(i = 0) {
  if (!photos.value.length) return
  lightboxIndex.value = Math.min(Math.max(i, 0), photos.value.length - 1)
  lightboxOpen.value = true
}
function stepLightbox(delta: number) {
  const n = photos.value.length
  if (n) lightboxIndex.value = (lightboxIndex.value + delta + n) % n
}
function onLightboxKey(e: KeyboardEvent) {
  if (e.key === 'Escape') lightboxOpen.value = false
  if (e.key === 'ArrowLeft') stepLightbox(-1)
  if (e.key === 'ArrowRight') stepLightbox(1)
}
/** Le fond ne défile pas sous la galerie ; flèches du clavier et Échap actifs tant qu'elle est ouverte. */
watch(lightboxOpen, isOpen => {
  if (!import.meta.client) return
  document.documentElement.style.overflow = isOpen ? 'hidden' : ''
  if (isOpen) window.addEventListener('keydown', onLightboxKey)
  else window.removeEventListener('keydown', onLightboxKey)
})
let swipeStartX = 0
function onSwipeStart(e: TouchEvent) {
  swipeStartX = e.touches[0]!.clientX
}
function onSwipeEnd(e: TouchEvent) {
  const dx = e.changedTouches[0]!.clientX - swipeStartX
  if (Math.abs(dx) > 40) stepLightbox(dx < 0 ? 1 : -1)
}

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
function formatRating(n: number) {
  return n.toFixed(1).replace('.', ',')
}

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

const POI_ICONS: Record<string, Component> = { mosque: Landmark, mosquee: Landmark, bar: Wine, school: School, ecole: School, noise: Volume2, bruit: Volume2, church: Church, eglise: Church, market: ShoppingBasket, marche: ShoppingBasket }
function poiIcon(type: string) {
  return POI_ICONS[type.toLowerCase()] ?? MapPin
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

/* ---- Tarification et disponibilité réelles de l'unité sélectionnée ----
 * Un échec ne bascule plus en silence sur le loyer « / mois » de l'unité : le panneau le dit et propose de réessayer. */
const pricing = ref<UnitPricing[]>([])
const availabilityBlocks = ref<AvailabilityBlock[]>([])
const pricingState = ref<'loading' | 'ready' | 'error'>('loading')
let pricingSeq = 0
async function loadUnitAvailability(unitId: string, keep = false) {
  const seq = ++pricingSeq
  pricingState.value = 'loading'
  if (!keep) {
    pricing.value = []
    availabilityBlocks.value = []
  }
  try {
    const [p, a] = await Promise.all([searchApi.fetchPricing(unitId), searchApi.fetchAvailability(unitId)])
    if (seq !== pricingSeq) return
    pricing.value = p
    availabilityBlocks.value = a
    pricingState.value = 'ready'
  } catch {
    if (seq !== pricingSeq) return
    pricingState.value = 'error'
  }
}
watch(selectedUnit, u => { if (u) loadUnitAvailability(u.id) }, { immediate: true })
function retryPricing() {
  if (selectedUnit.value) loadUnitAvailability(selectedUnit.value.id)
}

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
const MODE_TABS: { key: 'nuit' | 'mois'; label: string }[] = [{ key: 'mois', label: 'Louer au mois' }, { key: 'nuit', label: 'Réserver à la nuit' }]
/** Le mode choisi va dans l'URL : il survit au rechargement et au passage par la connexion. */
watch(viewMode, m => {
  if (hasBothModes.value && route.query.mode !== m) router.replace({ query: { ...route.query, mode: m } })
})
watch(() => route.query.mode, m => { if (m === 'nuit' || m === 'mois') viewMode.value = m })

/** Prix du panneau : jamais deviné tant que la grille n'est pas lue. */
const panelPrice = computed(() => {
  if (pricingState.value !== 'ready' || !selectedUnit.value) return null
  return isShortStay.value ? Number(dailyPricing.value?.price ?? 0) : Number(monthlyPricing.value?.price ?? selectedUnit.value.price)
})
const panelSuffix = computed(() => (isShortStay.value ? '/ nuit' : '/ mois'))

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
function shortDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

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

/* ---- Connexion puis retour au bon endroit ----
 * Réserver, demander une visite, contacter ou candidater sans compte mène à la
 * connexion, qui revient ici avec le logement (`unit`), le mode, les dates et
 * l'action (`?action=`) : avant, le retour se faisait sur `/biens/:id` nu —
 * premier logement du bien, dates perdues, action à refaire. */
type ListingAction = 'reserver' | 'visite' | 'contact' | 'candidater'
const LISTING_ACTIONS: ListingAction[] = ['reserver', 'visite', 'contact', 'candidater']

function returnPath(action: ListingAction) {
  const query: Record<string, string> = { action }
  if (selectedUnit.value) query.unit = selectedUnit.value.id
  if (hasBothModes.value) query.mode = viewMode.value
  if (checkIn.value && checkOut.value) {
    query.arrivee = checkIn.value
    query.depart = checkOut.value
  }
  return router.resolve({ path: route.path, query: { ...route.query, ...query } }).fullPath
}
function toLogin(action: ListingAction) {
  return navigateTo({ path: '/connexion', query: { redirect: returnPath(action) } })
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
function validStay(start: string, end: string) {
  return ISO_DAY.test(start) && ISO_DAY.test(end) && start >= localTodayIso() && end > start
}

/** Dates reprises après la connexion : le visiteur vérifie le total puis réserve lui-même. */
const resumeNotice = ref(false)

/**
 * À l'arrivée (retour de connexion, lien « Déposer ma candidature » de Mes visites)
 * ou quand l'URL change sur place : rejoue l'action demandée, une seule fois — les
 * paramètres sont retirés de l'URL d'abord, pour qu'un rechargement ou le retour de
 * la vérification d'identité ne la relance pas. Un visiteur non connecté qui ouvre
 * un tel lien garde les dates, sans être renvoyé de force vers la connexion.
 */
async function consumeAction() {
  const q = route.query
  const raw = String(q.action ?? '')
  const action: ListingAction | null = LISTING_ACTIONS.includes(raw as ListingAction) ? raw as ListingAction : q.candidature === '1' ? 'candidater' : null
  const start = String(q.arrivee ?? '')
  const end = String(q.depart ?? '')
  if (!action && !start) return
  await router.replace({ query: { ...q, action: undefined, candidature: undefined, arrivee: undefined, depart: undefined } })
  if (validStay(start, end)) {
    checkIn.value = start
    checkOut.value = end
    viewMode.value = 'nuit'
  }
  if (!currentUser.value || !action) return
  if (action === 'reserver') {
    resumeNotice.value = !!checkIn.value
    scrollToPanel()
  } else if (action === 'visite') {
    openVisitModal()
  } else if (action === 'contact') {
    sendInquiry()
  } else {
    openCandidature()
  }
}

/* ---- Réserver (courte durée) ---- */
const bookingLoading = ref(false)
const bookingError = ref('')
const bookingDone = ref(false)
const bookingConfirmed = ref(false)
/**
 * Réservation créée, gardée 15 minutes en attente de paiement. Le paiement
 * s'ouvre tout de suite ; « Plus tard » le referme mais la réservation reste
 * ici, avec « Payer maintenant » et le temps restant — avant, il ne restait
 * qu'un lien « Mes réservations ». `POST /bookings` n'a pas l'unité imbriquée : on la complète.
 */
const heldBooking = ref<BookingSummary | null>(null)
const payOpen = ref(false)

const nowMs = ref(Date.now())
let holdTimer: ReturnType<typeof setInterval> | undefined
function stopHoldTimer() {
  if (holdTimer) clearInterval(holdTimer)
  holdTimer = undefined
}
watch(heldBooking, b => {
  stopHoldTimer()
  if (!import.meta.client || !b?.expires_at) return
  nowMs.value = Date.now()
  holdTimer = setInterval(() => { nowMs.value = Date.now() }, 1000)
})
onBeforeUnmount(stopHoldTimer)
const hold = computed(() => (heldBooking.value ? deriveHoldCountdown(heldBooking.value.expires_at, new Date(nowMs.value)) : null))
watch(() => !!hold.value?.expired || bookingConfirmed.value, stop => { if (stop) stopHoldTimer() })
/** Temps restant en mm:ss — `null` si l'API n'a pas donné d'échéance. */
const holdClock = computed(() => {
  const exp = heldBooking.value?.expires_at
  if (!exp) return null
  const s = Math.max(0, Math.floor((new Date(exp).getTime() - nowMs.value) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const holdActive = computed(() => bookingDone.value && !bookingConfirmed.value && !!heldBooking.value && !hold.value?.expired)

/** Dates prises entre-temps ou délai dépassé : on repart d'une sélection vierge, calendrier rafraîchi. */
function onBookingChanged() {
  bookingDone.value = false
  bookingConfirmed.value = false
  heldBooking.value = null
  payOpen.value = false
  checkIn.value = null
  checkOut.value = null
  if (selectedUnit.value) loadUnitAvailability(selectedUnit.value.id, true)
}
function onPaid() {
  bookingConfirmed.value = true
  payOpen.value = false
}
async function submitBooking() {
  if (!currentUser.value) { toLogin('reserver'); return }
  if (!selectedUnit.value || !checkIn.value || !checkOut.value) return
  bookingLoading.value = true
  bookingError.value = ''
  try {
    const created = await bookingsApi.create(selectedUnit.value.id, checkIn.value, checkOut.value)
    const u = selectedUnit.value
    heldBooking.value = {
      ...created,
      retained_amount: null,
      retention_released_at: null,
      unit: { id: u.id, name: u.name, property_id: propertyId, min_duration_days: u.min_duration_days, booking_retention_percentage: u.booking_retention_percentage ?? null, requires_booking_inventory: u.requires_booking_inventory }
    } as BookingSummary
    bookingDone.value = true
    resumeNotice.value = false
    payOpen.value = true
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
// Action demandée (retour de connexion, `?candidature=1` de Mes visites) : une fois le logement et mes candidatures connus.
watch(() => pageState.value === 'success' && myRequestsLoaded.value, ready => { if (ready) consumeAction() })
watch(() => [route.query.action, route.query.candidature, route.query.arrivee], () => {
  if (pageState.value === 'success' && myRequestsLoaded.value) consumeAction()
})
/**
 * Candidater (`POST /rental/requests`) et demander une visite (`POST /visits`)
 * exigent un compte vérifié (403 `KYC_REQUIRED`) : un compte connecté mais non
 * vérifié voit un cadenas, et le clic ouvre la fenêtre explicative au lieu du formulaire.
 * Réserver un séjour, lui, n'exige pas de vérification.
 */
const { canAct, requireVerified } = useVerification()
function openCandidature() {
  if (!currentUser.value) { toLogin('candidater'); return }
  if (unitTaken.value || myRequest.value?.status === 'pending' || myRequest.value?.status === 'accepted') return
  if (!requireVerified('candidater à un logement')) return
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
  if (!currentUser.value) { toLogin('visite'); return }
  if (!requireVerified('demander une visite')) return
  visitModalOpen.value = true
}

/* ---- Poser une question : conversation sur ce logement, dans la messagerie de l'espace du compte ---- */
const contactLoading = ref(false)
const contactError = ref('')
async function sendInquiry() {
  if (!currentUser.value) { toLogin('contact'); return }
  if (!property.value) return
  contactLoading.value = true
  contactError.value = ''
  try {
    const conv = await messagingApi.openConversation(selectedUnit.value?.id ?? '', property.value.owner_id, `Bonjour, je suis intéressé(e) par ${selectedUnit.value?.name ?? property.value.name}.`)
    const home = roleHomePath(currentUser.value.role)
    await navigateTo({ path: `${home === '/' ? '/locataire' : home}/messages`, query: { conversation: conv.id } })
  } catch (e) {
    contactError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'envoi a échoué.") : "L'envoi a échoué."
  } finally {
    contactLoading.value = false
  }
}

/* ---- Favoris ---- */
const isFavorite = computed(() => favorites.isFavoriteProperty(propertyId))
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

/* ---- Barre d'action mobile : prix + action, tant que le panneau n'est pas à l'écran ---- */
const panelEl = ref<HTMLElement | null>(null)
const panelVisible = ref(false)
let panelObserver: IntersectionObserver | null = null
onMounted(() => {
  panelObserver = new IntersectionObserver(entries => { panelVisible.value = !!entries[0]?.isIntersecting }, { threshold: 0.12 })
  if (panelEl.value) panelObserver.observe(panelEl.value)
})
watch(panelEl, el => {
  panelObserver?.disconnect()
  if (el) panelObserver?.observe(el)
})
onBeforeUnmount(() => panelObserver?.disconnect())
/** Sur grand écran le panneau est déjà collé à droite : on ne fait défiler que sous lg. */
function scrollToPanel() {
  if (!import.meta.client || window.matchMedia('(min-width: 1024px)').matches) return
  nextTick(() => panelEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
const barAction = computed(() => {
  if (holdActive.value) return { label: 'Payer maintenant', run: () => { payOpen.value = true } }
  if (bookingConfirmed.value) return { label: 'Voir ma réservation', run: scrollToPanel }
  if (isShortStay.value) return { label: nights.value ? 'Réserver' : 'Choisir mes dates', run: scrollToPanel }
  if (unitTaken.value || myRequest.value?.status === 'pending' || myRequest.value?.status === 'accepted') return { label: 'Voir le détail', run: scrollToPanel }
  return { label: 'Candidater', run: scrollToPanel }
})

/* ---- Logements similaires (même ville, hors ce bien) ---- */
const similar = ref<{ listing: ListingCard; suffix: string | undefined }[]>([])
watch(property, async p => {
  if (!p) return
  try {
    const res = await searchApi.search({ city: p.city?.name, limit: 8 })
    const cards = flattenSearchResults((res.data as PropertySearchResult[]).filter(x => x.id !== p.id)).slice(0, 4)
    // Prix et unité (« / nuit », « / mois ») lus dans la grille de chaque logement, comme dans la recherche.
    const modes = await mapLimited(cards, 4, c => searchApi.fetchPricing(c.unitId).then(rows => classifyRental(rows, c.price)).catch(() => undefined))
    similar.value = cards.map((c, i) => {
      const d = displayPrice(modes[i], c.price)
      return { listing: { ...c, price: d.price }, suffix: d.suffix }
    })
  } catch {
    similar.value = []
  }
})
const similarLink = computed(() => (property.value?.city?.name ? `/recherche?city=${encodeURIComponent(property.value.city.name)}` : '/recherche'))
async function onFavoriteSimilar(l: { propertyId: string | null }) {
  if (!l.propertyId) return
  if (!currentUser.value) { navigateTo({ path: '/connexion', query: { redirect: route.fullPath } }); return }
  await favorites.toggleProperty(l.propertyId)
}
</script>

<template>
  <div class="mx-auto max-w-[1240px] animate-[im-fade_.3s_ease_backwards] px-4 pb-[150px] pt-[22px] sm:px-[26px] lg:pb-[70px]">
    <div class="mb-4 flex items-center justify-between gap-3">
      <a :href="backTo" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13.5px] font-semibold text-sand-900 transition-colors hover:border-green-600 hover:text-green-700" @click.prevent="goBack">
        <ArrowLeft class="h-4 w-4" :stroke-width="2" />Résultats
      </a>
      <div v-if="pageState === 'success'" class="flex gap-2">
        <button type="button" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-[9px] text-[13px] font-bold text-sand-900 transition-colors hover:border-green-600" aria-label="Partager cette annonce" :aria-expanded="shareOpen" @click="shareOpen = !shareOpen">
          <Share2 class="h-4 w-4" :stroke-width="1.9" /><span class="hidden sm:inline">Partager</span>
        </button>
        <button type="button" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-[9px] text-[13px] font-bold text-sand-900 transition-colors hover:border-green-600" :aria-pressed="isFavorite" :aria-label="isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'" @click="onToggleFavorite">
          <Heart class="h-4 w-4" :class="isFavorite ? 'animate-[im-pop_.45s_ease] fill-current text-fav' : ''" :stroke-width="1.9" /><span class="hidden sm:inline">{{ isFavorite ? 'Enregistré' : 'Enregistrer' }}</span>
        </button>
      </div>
    </div>

    <div v-if="pageState === 'loading'" class="flex flex-col gap-4.5">
      <DataSkeletonCard :height="300" :lines="1" />
      <div class="grid grid-cols-1 gap-4.5 lg:grid-cols-[1fr_400px]">
        <DataSkeletonCard :height="140" :lines="3" />
        <DataSkeletonCard :height="220" :lines="1" />
      </div>
    </div>

    <div v-else-if="pageState === 'notfound'" class="rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-6 py-12 text-center">
      <div class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><House class="h-5 w-5" :stroke-width="1.9" /></div>
      <p class="mb-0 mt-4 text-[15px] font-bold">Ce logement n'est plus en ligne</p>
      <p class="mx-auto mb-4.5 mt-1.5 max-w-[440px] text-[13.5px] text-[var(--text-muted)]">Le lien est peut-être incomplet, ou l'annonce a été retirée par son propriétaire. D'autres logements sont disponibles dans la recherche.</p>
      <NuxtLink :to="backTo" class="inline-block rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-sm font-bold text-white shadow-action">Voir les logements</NuxtLink>
    </div>

    <FeedbackAlertBanner v-else-if="pageState === 'error' || !property || !selectedUnit" tone="danger">
      Impossible de charger ce logement pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <!-- Photos -->
      <div class="relative">
        <div class="sm:hidden">
          <div v-if="photos.length" class="flex h-[260px] snap-x snap-mandatory overflow-x-auto rounded-2xl bg-sand-200 [scrollbar-width:none]" @scroll.passive="onCarouselScroll">
            <button
              v-for="(url, i) in photos"
              :key="url"
              type="button"
              class="h-full w-full flex-none snap-center bg-cover bg-center"
              :style="{ backgroundImage: `url(${url})` }"
              :aria-label="`Agrandir la photo ${i + 1} sur ${photos.length}`"
              @click="openLightbox(i)"
            />
          </div>
          <div v-else class="grid h-[220px] place-items-center rounded-2xl bg-sand-200 text-[var(--text-muted)]">
            <span class="flex flex-col items-center gap-2 text-[13px] font-semibold"><ImageOff class="h-6 w-6" :stroke-width="1.6" />Pas encore de photo</span>
          </div>
          <span v-if="photos.length > 1" class="absolute bottom-3.5 left-3.5 rounded-pill bg-black/55 px-2.5 py-1 font-mono text-[11.5px] font-bold text-white">{{ carouselIndex + 1 }}/{{ photos.length }}</span>
        </div>

        <div v-if="mosaic === 'single'" class="hidden h-[380px] overflow-hidden rounded-2xl bg-sand-200 sm:block">
          <button v-if="photos.length" type="button" class="h-full w-full bg-cover bg-center" :style="{ backgroundImage: `url(${photos[0]})` }" aria-label="Agrandir la photo" @click="openLightbox(0)" />
          <div v-else class="grid h-full place-items-center text-[var(--text-muted)]">
            <span class="flex flex-col items-center gap-2 text-[13px] font-semibold"><ImageOff class="h-7 w-7" :stroke-width="1.6" />Pas encore de photo</span>
          </div>
        </div>
        <div v-else class="hidden h-[380px] grid-rows-2 gap-[9px] overflow-hidden rounded-2xl sm:grid" :class="mosaic === 'full' ? 'grid-cols-[1.9fr_1fr_1fr]' : 'grid-cols-[1.9fr_1fr]'">
          <button type="button" class="row-span-2 bg-sand-200 bg-cover bg-center transition-[filter] hover:brightness-95" :style="{ backgroundImage: `url(${photos[0]})` }" aria-label="Agrandir la photo 1" @click="openLightbox(0)" />
          <button
            v-for="(url, i) in mosaicTiles"
            :key="url"
            type="button"
            class="bg-sand-200 bg-cover bg-center transition-[filter] hover:brightness-95"
            :style="{ backgroundImage: `url(${url})` }"
            :aria-label="`Agrandir la photo ${i + 2}`"
            @click="openLightbox(i + 1)"
          />
        </div>

        <button v-if="photos.length" type="button" class="absolute bottom-3.5 right-3.5 inline-flex items-center gap-1.5 rounded-pill bg-white/[.95] px-3.5 py-2 text-[12.5px] font-bold text-sand-900 shadow-card transition-transform hover:-translate-y-px" @click="openLightbox(carouselIndex)">
          <Images class="h-4 w-4" :stroke-width="1.9" />{{ photosLabel }}
        </button>
      </div>

      <div v-if="shareOpen" class="mt-3.5 flex animate-[im-rise_.25s_ease_both] flex-wrap items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-4">
        <div class="min-w-[200px] flex-1">
          <p class="m-0 text-[15px] font-bold">Partager cette annonce</p>
          <p class="mb-0 mt-0.5 text-[13.5px] text-[var(--text-muted)]">Le lien ouvre ce logement, avec le choix en cours.</p>
        </div>
        <div class="flex flex-wrap gap-2.5">
          <a :href="`https://wa.me/?text=${encodeURIComponent(shareUrl)}`" target="_blank" rel="noopener" class="rounded-md bg-whatsapp px-4 py-2.5 text-[13px] font-bold text-white">WhatsApp</a>
          <button type="button" class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold" @click="copyLink">
            <Check v-if="linkCopied" class="h-4 w-4 text-ok-fg" :stroke-width="2.4" />{{ linkCopied ? 'Lien copié' : 'Copier le lien' }}
          </button>
        </div>
      </div>

      <div class="mt-8 grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-[52px]">
        <div class="min-w-0">
          <div class="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
            <div class="min-w-0">
              <h1 class="m-0 font-display text-title-1 font-bold tracking-title-1">{{ selectedUnit.name }}</h1>
              <p class="mb-0 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-[var(--text-secondary)]">
                <span class="inline-flex items-center gap-1.5"><MapPin class="h-4 w-4 text-[var(--text-faint)]" :stroke-width="1.9" />{{ placeLabel || 'Localisation non précisée' }}</span>
                <template v-if="reviewStats && reviewStats.count > 0">
                  <span class="text-[var(--text-faint)]">·</span>
                  <span class="inline-flex items-center gap-1"><Star class="h-4 w-4 fill-current text-clay-500" :stroke-width="1.6" /><span class="font-mono font-bold">{{ formatRating(reviewStats.average) }}</span> · {{ reviewStats.count }} avis</span>
                </template>
              </p>
            </div>
            <CoreBadge v-if="owner?.is_verified" tone="ok" bordered class="!text-[12px] normal-case">
              <BadgeCheck class="h-4 w-4" :stroke-width="2" />Propriétaire vérifié
            </CoreBadge>
          </div>

          <div class="mt-[22px] flex flex-wrap gap-2.5">
            <div v-for="s in specs" :key="s.label" class="flex items-center gap-2.5 rounded-md border border-[var(--border-subtle)] bg-white px-3.5 py-3">
              <span class="grid h-8 w-8 flex-none place-items-center rounded-pill bg-sand-100 text-green-700"><component :is="s.icon" class="h-4 w-4" :stroke-width="1.9" /></span>
              <div>
                <p class="m-0 text-[10.5px] font-bold uppercase tracking-[.05em] text-[var(--text-faint)]">{{ s.label }}</p>
                <p class="mb-0 mt-0.5 text-[13.5px] font-semibold">{{ s.value }}</p>
              </div>
            </div>
          </div>

          <template v-if="features.length">
            <div class="my-[30px] h-px bg-sand-300" />
            <h2 class="mb-3 mt-0 font-display text-[19px] font-bold tracking-[-.02em]">Équipements</h2>
            <div class="flex flex-wrap gap-2">
              <span v-for="f in features" :key="f" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-subtle)] bg-white px-3.5 py-2 text-[13px] font-semibold text-[var(--text-secondary)]"><Check class="h-3.5 w-3.5 text-green-600" :stroke-width="2.4" />{{ f }}</span>
            </div>
          </template>

          <template v-if="description">
            <div class="my-[30px] h-px bg-sand-300" />
            <h2 class="mb-3 mt-0 font-display text-[19px] font-bold tracking-[-.02em]">À propos du logement</h2>
            <p class="m-0 max-w-[640px] whitespace-pre-line text-[15px] leading-[1.65] text-[var(--text-secondary)]">{{ description }}</p>
          </template>

          <template v-if="owner">
            <div class="my-[30px] h-px bg-sand-300" />
            <NuxtLink :to="`/vitrine/${property.owner_id}`" class="group flex items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-5 transition-shadow hover:shadow-card">
              <CoreAvatar :name="owner.display_name" :avatar-url="owner.avatar_url" :size="52" color="var(--color-green-50)" class="!text-green-700" />
              <div class="min-w-0 flex-1">
                <p class="m-0 flex flex-wrap items-center gap-2 text-[15px] font-bold">
                  {{ owner.display_name }}
                  <CoreBadge v-if="owner.is_verified" tone="ok" bordered><BadgeCheck class="h-3.5 w-3.5" :stroke-width="2" />Vérifié</CoreBadge>
                </p>
                <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">Membre depuis {{ formatMemberSince(owner.member_since) }}</p>
              </div>
              <span class="hidden items-center gap-1 whitespace-nowrap text-[12.5px] font-bold text-green-700 sm:inline-flex">Voir sa vitrine <ArrowRight class="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" :stroke-width="2" /></span>
              <ChevronRight class="h-5 w-5 flex-none text-[var(--text-faint)] sm:hidden" :stroke-width="1.9" />
            </NuxtLink>
          </template>

          <div class="my-[30px] h-px bg-sand-300" />
          <h2 class="mb-4 mt-0 font-display text-[19px] font-bold tracking-[-.02em]">Avis des locataires</h2>
          <p v-if="!reviews.length" class="m-0 text-[13.5px] text-[var(--text-muted)]">Aucun avis pour l'instant : ce logement n'a pas encore été noté par un locataire.</p>
          <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div v-for="r in reviews" :key="r.id" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5">
              <div class="flex items-center gap-2.5">
                <CoreAvatar :name="personName(r.reviewer.first_name, r.reviewer.last_name) || 'Locataire'" :avatar-url="r.reviewer.avatar_url" :size="36" color="var(--color-green-600)" />
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-sm font-bold">{{ personName(r.reviewer.first_name, r.reviewer.last_name) || 'Locataire' }}</p>
                  <p class="mb-0 mt-px text-xs text-[var(--text-faint)]">{{ new Date(r.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }}</p>
                </div>
                <span class="inline-flex items-center gap-1 rounded-pill bg-sand-100 px-2.5 py-1 font-mono text-xs font-bold"><Star class="h-3.5 w-3.5 fill-current text-clay-500" :stroke-width="1.6" />{{ r.rating }}</span>
              </div>
              <p v-if="r.comment" class="mb-0 mt-3.5 text-sm leading-[1.6] text-[var(--text-secondary)]">{{ r.comment }}</p>
            </div>
          </div>

          <div class="my-[30px] h-px bg-sand-300" />
          <h2 class="mb-4 mt-0 font-display text-[19px] font-bold tracking-[-.02em]">Localisation</h2>
          <div v-if="mapMarkers.length" class="relative isolate h-[280px] overflow-hidden rounded-2xl border border-[var(--border-subtle)]">
            <MapView :markers="mapMarkers" :active-id="property.id" :single-zoom="15" />
            <a v-if="mapsUrl" :href="mapsUrl" target="_blank" rel="noopener" class="absolute bottom-7 right-3.5 z-[1000] inline-flex items-center gap-1.5 rounded-pill bg-white/[.94] px-3.5 py-2 text-[12.5px] font-bold text-green-700 shadow-card">Ouvrir dans Maps <ExternalLink class="h-3.5 w-3.5" :stroke-width="2" /></a>
          </div>
          <div v-else class="grid h-[120px] place-items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-6 text-center text-[13.5px] text-[var(--text-muted)]">
            {{ placeLabel || 'Localisation non précisée' }}
          </div>
          <p v-if="geoLocation && !geoLocation.precise" class="mb-0 mt-2.5 text-xs text-[var(--text-faint)]">Position approximative : l'emplacement exact de ce bien n'est pas disponible. La zone correspond au secteur de {{ property.city?.name }}.</p>
          <p v-if="property.address" class="mb-0 mt-2.5 text-[13.5px] text-[var(--text-muted)]">{{ property.address }}</p>

          <p class="mb-2.5 mt-5 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Aux alentours</p>
          <p v-if="!pois.length" class="m-0 text-[13.5px] text-[var(--text-muted)]">Aucun point d'intérêt signalé pour l'instant.</p>
          <div v-else class="rounded-2xl border border-[var(--border-subtle)] bg-white px-5">
            <div v-for="p in pois" :key="p.id" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
              <span class="grid h-8 w-8 flex-none place-items-center rounded-pill bg-sand-100 text-[var(--text-secondary)]"><component :is="poiIcon(p.poi_type)" class="h-4 w-4" :stroke-width="1.9" /></span>
              <div class="min-w-0 flex-1">
                <p class="m-0 text-[13.5px] font-semibold">{{ p.name }} <span class="font-normal text-[var(--text-faint)]">· {{ poiLabel(p.poi_type) }}</span></p>
                <p v-if="p.distance_meters !== null" class="mb-0 mt-0.5 font-mono text-xs text-[var(--text-faint)]">{{ p.distance_meters }} m</p>
              </div>
              <CoreBadge v-if="p.verified" tone="ok" bordered><Check class="h-3 w-3" :stroke-width="2.6" />Vérifié</CoreBadge>
            </div>
          </div>
        </div>

        <aside ref="panelEl" class="scroll-mt-[84px] lg:sticky lg:top-[94px]" aria-label="Réserver ou candidater">
          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 shadow-panel sm:p-6">
            <div v-if="property.units.length > 1" class="mb-4">
              <p class="mb-2 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ property.units.length }} logements dans ce bien</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="u in property.units"
                  :key="u.id"
                  type="button"
                  class="rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                  :class="u.id === selectedUnit.id ? 'border-green-600 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:border-green-400'"
                  :aria-pressed="u.id === selectedUnit.id"
                  @click="pickUnit(u)"
                >{{ u.name }}</button>
              </div>
            </div>
            <div v-if="hasBothModes" class="mb-3.5 grid grid-cols-2 gap-1 rounded-pill bg-[var(--surface-sunken)] p-1" role="radiogroup" aria-label="Type de location">
              <button
                v-for="m in MODE_TABS"
                :key="m.key"
                type="button"
                role="radio"
                :aria-checked="viewMode === m.key"
                class="rounded-pill py-2 text-[13px] font-bold transition-all"
                :class="viewMode === m.key ? 'bg-white text-green-900 shadow-[0_2px_8px_rgba(26,23,20,.12)]' : 'text-[var(--text-secondary)]'"
                @click="viewMode = m.key"
              >{{ m.label }}</button>
            </div>

            <div v-if="pricingState === 'loading' && !pricing.length" class="flex flex-col gap-2.5" aria-busy="true">
              <div class="h-8 w-40 animate-[im-shimmer_1.3s_linear_infinite] rounded-sm bg-[linear-gradient(90deg,var(--color-sand-200)_25%,var(--color-sand-100)_50%,var(--color-sand-200)_75%)] bg-[length:460px_100%]" />
              <div class="h-[52px] animate-[im-shimmer_1.3s_linear_infinite] rounded-md bg-[linear-gradient(90deg,var(--color-sand-200)_25%,var(--color-sand-100)_50%,var(--color-sand-200)_75%)] bg-[length:460px_100%]" />
            </div>

            <div v-else-if="pricingState === 'error'" class="rounded-md border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] text-danger-fg-deep">
              <p class="m-0 font-bold">Tarifs et disponibilités indisponibles</p>
              <p class="mb-0 mt-1">Le prix et le calendrier de ce logement n'ont pas pu être chargés. Rien n'est réservé.</p>
              <button type="button" class="mt-2 font-bold underline" @click="retryPricing">Réessayer</button>
            </div>

            <template v-else>
              <div class="flex items-baseline gap-2">
                <span class="font-mono text-[28px] font-bold tracking-[-.02em] text-green-900">{{ panelPrice !== null ? formatFcfaShort(panelPrice) : '' }}</span>
                <span class="text-[15px] font-semibold text-[var(--text-muted)]">{{ panelSuffix }}</span>
              </div>

              <!-- Courte durée : réservation créée -->
              <template v-if="bookingDone && heldBooking">
                <div v-if="bookingConfirmed" class="mt-4 rounded-md border border-ok-border bg-ok-bg p-4 text-green-900">
                  <p class="m-0 flex items-center gap-2 text-sm font-bold"><CircleCheck class="h-[18px] w-[18px] text-ok-fg" :stroke-width="2" />Séjour confirmé</p>
                  <p class="mb-0 mt-1.5 text-[13px] leading-[1.5]">Du {{ shortDay(heldBooking.check_in) }} au {{ shortDay(heldBooking.check_out) }}. Vos dates sont bloquées ; le séjour et son reçu sont dans vos réservations.</p>
                  <NuxtLink to="/locataire/reservations" class="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-green-700">Mes réservations <ArrowRight class="h-3.5 w-3.5" :stroke-width="2" /></NuxtLink>
                </div>
                <div v-else-if="hold?.expired" class="mt-4 rounded-md border border-warn-border bg-warn-bg p-4 text-warn-fg-deep">
                  <p class="m-0 text-sm font-bold">Le délai de 15 minutes est dépassé</p>
                  <p class="mb-0 mt-1.5 text-[13px] leading-[1.5]">La réservation n'a pas été payée : les dates du {{ shortDay(heldBooking.check_in) }} au {{ shortDay(heldBooking.check_out) }} ne vous sont plus gardées.</p>
                  <CoreButton full-width class="mt-3" @click="onBookingChanged">Choisir à nouveau mes dates</CoreButton>
                </div>
                <div v-else class="mt-4 rounded-md border border-warn-border bg-warn-bg p-4 text-warn-fg-deep">
                  <div class="flex items-center justify-between gap-3">
                    <p class="m-0 flex items-center gap-2 text-sm font-bold"><Clock class="h-4 w-4" :stroke-width="2" />Dates gardées</p>
                    <span v-if="holdClock" class="rounded-pill bg-white/70 px-2.5 py-1 font-mono text-[13px] font-bold" aria-live="polite">{{ holdClock }}</span>
                  </div>
                  <p class="mb-0 mt-1.5 text-[13px] leading-[1.5]">
                    Du {{ shortDay(heldBooking.check_in) }} au {{ shortDay(heldBooking.check_out) }} · <span class="font-mono font-bold">{{ formatFcfa(Number(heldBooking.total_price)) }}</span>.
                    {{ holdClock ? 'Payez avant la fin du délai pour confirmer : sans paiement, les dates sont libérées.' : 'Payez dans les 15 minutes pour confirmer : sans paiement, les dates sont libérées.' }}
                  </p>
                  <CoreButton size="lg" full-width class="mt-3" @click="payOpen = true">Payer maintenant</CoreButton>
                  <NuxtLink to="/locataire/reservations" class="mt-2.5 block text-center text-[13px] font-bold text-[var(--text-secondary)] underline">Voir mes réservations</NuxtLink>
                </div>
              </template>

              <!-- Courte durée : choix des dates -->
              <template v-else-if="isShortStay">
                <p class="mb-2.5 mt-4 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Vos dates<span v-if="minStay && minStay > 1" class="ml-1.5 font-semibold normal-case tracking-normal">· {{ minStay }} nuits minimum</span></p>
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
                    <p v-if="stayQuote.saving > 0" class="mb-1 mt-1 text-xs font-semibold text-ok-fg">Tarif long séjour appliqué : −{{ formatFcfa(stayQuote.saving) }}</p>
                  </template>
                  <DataMoneyLine label="Total à payer" :value="formatFcfa(stayTotal)" total />
                </div>

                <p v-if="resumeNotice && nights > 0 && !stayProblem" class="mb-0 mt-3 rounded-md border border-info-border bg-info-bg px-3.5 py-2.5 text-[13px] font-semibold text-info-fg-deep">Vos dates sont reprises : vérifiez le total puis réservez.</p>
                <p v-if="stayProblem" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ stayProblem }}</p>
                <p v-if="bookingError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ bookingError }}</p>
                <CoreButton size="lg" full-width class="mt-4" :disabled="!nights || !!stayProblem || bookingLoading" @click="submitBooking">{{ bookingLoading ? 'Réservation…' : 'Réserver' }}</CoreButton>
                <p class="mb-0 mt-2.5 text-center text-xs text-[var(--text-faint)]">Aucun montant prélevé à cette étape : le paiement suit, dans les 15 minutes.</p>
              </template>

              <!-- Longue durée : candidature et visite -->
              <template v-else>
                <div class="mt-4.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
                  <p class="mb-2.5 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Ce que vous payez à l'entrée</p>
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
                <div v-else-if="myRequest?.status === 'pending'" class="mt-4 rounded-md border border-warn-border bg-warn-bg p-3.5 text-[13px] leading-[1.55] text-warn-fg-deep">
                  <p class="m-0 flex items-center gap-2 font-bold"><Clock class="h-4 w-4" :stroke-width="2" />Candidature envoyée le {{ shortDate(myRequest.created_at) }}</p>
                  <p class="mb-0 mt-1">Le propriétaire ne l'a pas encore traitée. <NuxtLink :to="`/locataire/candidatures?request=${myRequest.id}`" class="font-bold underline">Suivre ma candidature</NuxtLink></p>
                </div>
                <div v-else-if="myRequest?.status === 'accepted'" class="mt-4 rounded-md border border-ok-border bg-ok-bg p-3.5 text-[13px] leading-[1.55] text-green-900">
                  <p class="m-0 flex items-center gap-2 font-bold"><CircleCheck class="h-4 w-4 text-ok-fg" :stroke-width="2" />Votre candidature a été retenue</p>
                  <p class="mb-0 mt-1">Le propriétaire prépare le bail. <NuxtLink to="/locataire/bail" class="font-bold underline">Voir mon bail</NuxtLink></p>
                </div>
                <template v-else>
                  <p v-if="myRequest?.status === 'rejected'" class="mb-0 mt-3 text-[13px] text-[var(--text-muted)]">Votre précédente candidature n'a pas été retenue. Vous pouvez en déposer une nouvelle.</p>
                  <p v-else-if="myRequest?.status === 'withdrawn'" class="mb-0 mt-3 text-[13px] text-[var(--text-muted)]">Vous avez retiré votre précédente candidature. Vous pouvez en déposer une nouvelle.</p>
                  <CoreButton size="lg" full-width class="mt-4" @click="openCandidature"><CoreLockIcon v-if="!canAct" :size="15" class="mr-1.5" />Déposer ma candidature</CoreButton>
                </template>
                <CoreButton tone="secondary" size="lg" full-width class="mt-2.5" @click="openVisitModal"><CoreLockIcon v-if="!canAct" :size="15" class="mr-1.5" />Demander une visite</CoreButton>
              </template>

              <!-- Question au propriétaire : à la nuit comme au mois -->
              <template v-if="!bookingDone">
                <p v-if="contactError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ contactError }}</p>
                <button type="button" class="mt-3 flex w-full items-center justify-center gap-1.5 text-[13px] font-bold text-green-700 hover:underline disabled:opacity-60" :disabled="contactLoading" @click="sendInquiry">
                  <MessageCircle class="h-4 w-4" :stroke-width="1.9" />{{ contactLoading ? 'Ouverture…' : 'Poser une question au propriétaire' }}
                </button>
                <p v-if="!isShortStay" class="mb-0 mt-2.5 text-center text-xs text-[var(--text-faint)]">Aucun montant prélevé à cette étape</p>
              </template>
            </template>
          </div>
        </aside>
      </div>

      <TenantBookingPayModal v-if="payOpen && heldBooking" :booking="heldBooking" @close="payOpen = false" @paid="onPaid" @changed="onBookingChanged" />

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
        <div class="mb-[18px] flex items-end justify-between gap-3">
          <h2 class="m-0 font-display text-[22px] font-bold tracking-[-.025em]">Vous pourriez aussi aimer</h2>
          <NuxtLink :to="similarLink" class="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-bold text-green-700">Tout voir <ArrowRight class="h-3.5 w-3.5" :stroke-width="2" /></NuxtLink>
        </div>
        <div class="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
          <SearchPropertyCard
            v-for="s in similar"
            :key="s.listing.unitId"
            :listing="s.listing"
            :price-suffix="s.suffix"
            :favorite="s.listing.propertyId ? favorites.isFavoriteProperty(s.listing.propertyId) : false"
            @open="s.listing.propertyId && navigateTo(`/biens/${s.listing.propertyId}?unit=${s.listing.unitId}`)"
            @favorite="onFavoriteSimilar(s.listing)"
          />
        </div>
      </div>

      <!-- Barre d'action mobile : le panneau est sous tout le contenu ; elle le rend atteignable d'un geste. -->
      <Transition enter-from-class="translate-y-4 opacity-0" leave-to-class="translate-y-4 opacity-0" enter-active-class="transition duration-200" leave-active-class="transition duration-150">
        <div v-if="!panelVisible && pricingState !== 'error'" class="fixed inset-x-0 bottom-[var(--mobile-tabbar-space)] z-20 px-3 pb-2 lg:hidden">
          <div class="mx-auto flex max-w-[480px] items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-white/[.97] px-4 py-3 shadow-panel backdrop-blur">
            <div class="min-w-0 flex-1">
              <p v-if="holdActive && holdClock" class="m-0 font-mono text-[15px] font-bold text-warn-fg-deep">{{ holdClock }}</p>
              <p v-else-if="panelPrice !== null" class="m-0 truncate">
                <span class="font-mono text-[17px] font-bold text-green-900">{{ formatFcfaShort(panelPrice) }}</span>
                <span class="text-[12.5px] font-semibold text-[var(--text-muted)]"> {{ panelSuffix }}</span>
              </p>
              <p class="m-0 truncate text-xs text-[var(--text-faint)]">
                {{ holdActive ? 'Dates gardées, en attente de paiement' : isShortStay && nights ? `${nights} nuit${nights > 1 ? 's' : ''} · du ${shortDay(checkIn!)} au ${shortDay(checkOut!)}` : selectedUnit.name }}
              </p>
            </div>
            <CoreButton @click="barAction.run()">{{ barAction.label }}</CoreButton>
          </div>
        </div>
      </Transition>

      <!-- Galerie plein écran -->
      <Teleport to="body">
        <div v-if="lightboxOpen" class="fixed inset-0 z-[95] flex animate-[im-veil_.2s_ease_both] flex-col bg-[rgba(14,12,10,.96)] text-white" role="dialog" aria-modal="true" :aria-label="`Photos — ${selectedUnit.name}`">
          <div class="flex flex-none items-center justify-between gap-3 px-4 pb-2 pt-[calc(12px+env(safe-area-inset-top))] sm:px-6">
            <p class="m-0 min-w-0 truncate text-[13px] font-semibold text-white/80">{{ selectedUnit.name }}</p>
            <div class="flex items-center gap-3">
              <span class="font-mono text-[13px] font-bold">{{ lightboxIndex + 1 }} / {{ photos.length }}</span>
              <button type="button" class="grid h-10 w-10 place-items-center rounded-pill bg-white/10 transition-colors hover:bg-white/20" aria-label="Fermer la galerie" @click="lightboxOpen = false">
                <X class="h-5 w-5" :stroke-width="2" />
              </button>
            </div>
          </div>
          <div class="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-20" @touchstart.passive="onSwipeStart" @touchend="onSwipeEnd">
            <img :key="lightboxIndex" :src="photos[lightboxIndex]" :alt="`Photo ${lightboxIndex + 1} sur ${photos.length}`" class="max-h-full max-w-full animate-[im-fade_.2s_ease_backwards] select-none rounded-md object-contain" draggable="false">
            <template v-if="photos.length > 1">
              <button type="button" class="absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-pill bg-white/10 transition-colors hover:bg-white/20 sm:grid" aria-label="Photo précédente" @click="stepLightbox(-1)">
                <ChevronLeft class="h-6 w-6" :stroke-width="2" />
              </button>
              <button type="button" class="absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-pill bg-white/10 transition-colors hover:bg-white/20 sm:grid" aria-label="Photo suivante" @click="stepLightbox(1)">
                <ChevronRight class="h-6 w-6" :stroke-width="2" />
              </button>
            </template>
          </div>
          <div v-if="photos.length > 1" class="flex flex-none gap-2 overflow-x-auto px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3 [scrollbar-width:none] sm:justify-center">
            <button
              v-for="(url, i) in photos"
              :key="url"
              type="button"
              class="h-14 w-20 flex-none rounded-sm bg-cover bg-center ring-2 transition-opacity"
              :class="i === lightboxIndex ? 'opacity-100 ring-white' : 'opacity-45 ring-transparent hover:opacity-80'"
              :style="{ backgroundImage: `url(${url})` }"
              :aria-label="`Voir la photo ${i + 1}`"
              :aria-current="i === lightboxIndex"
              @click="lightboxIndex = i"
            />
          </div>
        </div>
      </Teleport>
    </template>
  </div>
</template>
