<script setup lang="ts">
import type { AvailabilityBlock, OwnerProfile, PointOfInterest, PropertySearchResult, ReviewItem, ReviewStats, UnitPricing, UnitSearchResult } from '~/types/property'
import { buildCalendarDays } from '~/utils/availabilityCalendar'
import { flattenSearchResults } from '~/utils/propertyListing'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

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

/* ---- Référentiels réels pour les libellés (eau, compteur, meublé) ---- */
const waterRef = ref<{ code: string; labels: Record<string, string> }[]>([])
const meterRef = ref<{ code: string; labels: Record<string, string> }[]>([])
const furnishedRef = ref<{ code: string; labels: Record<string, string> }[]>([])
onMounted(async () => {
  const [w, m, f] = await Promise.all([refData.fetchRef('WATER_SOURCE'), refData.fetchRef('METER_TYPE'), refData.fetchRef('FURNISHED_LEVEL')])
  waterRef.value = w
  meterRef.value = m
  furnishedRef.value = f
})
function labelOf(list: { code: string; labels: Record<string, string> }[], code: string | null) {
  if (!code) return null
  return list.find(e => e.code === code)?.labels.fr ?? code
}

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

/* ---- Localisation : carte statique + points d'intérêt signalés (GET /properties/:id/pois, public) ---- */
const pois = ref<PointOfInterest[]>([])
watch(() => property.value?.id, async id => {
  if (!id) return
  try {
    pois.value = await searchApi.fetchPois(id)
  } catch {
    pois.value = []
  }
})

const mapsUrl = computed(() => {
  const lat = property.value?.gps_latitude
  const lng = property.value?.gps_longitude
  return lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null
})

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
const isShortStay = computed(() => !!dailyPricing.value)

/* ---- Calendrier réel (30 jours à partir d'aujourd'hui) ---- */
const calendarDays = computed(() => buildCalendarDays(new Date(), 30, availabilityBlocks.value))
const checkIn = ref<string | null>(null)
const checkOut = ref<string | null>(null)
function pickDate(day: { iso: string; blocked: boolean }) {
  if (day.blocked) return
  // Une plage complète (checkOut déjà posé) ou un jour <= checkIn : on recommence une nouvelle sélection.
  if (!checkIn.value || checkOut.value || day.iso <= checkIn.value) {
    checkIn.value = day.iso
    checkOut.value = null
  } else {
    checkOut.value = day.iso
  }
}
const nights = computed(() => {
  if (!checkIn.value || !checkOut.value) return 0
  return Math.round((new Date(checkOut.value).getTime() - new Date(checkIn.value).getTime()) / 86400000)
})
const nightlyPrice = computed(() => Number(dailyPricing.value?.price ?? 0))
const stayTotal = computed(() => nights.value * nightlyPrice.value)

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
async function submitBooking() {
  if (!currentUser.value) { navigateTo(`/connexion?redirect=/biens/${propertyId}`); return }
  if (!selectedUnit.value || !checkIn.value || !checkOut.value) return
  bookingLoading.value = true
  bookingError.value = ''
  try {
    await bookingsApi.create(selectedUnit.value.id, checkIn.value, checkOut.value)
    bookingDone.value = true
  } catch (e) {
    bookingError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La réservation a échoué.') : 'La réservation a échoué.'
  } finally {
    bookingLoading.value = false
  }
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
  if (!currentUser.value) { navigateTo('/connexion'); return }
  await favorites.toggleProperty(propertyId)
}

/* ---- Partage ---- */
const shareOpen = ref(false)
const linkCopied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/biens/${propertyId}`)
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
  if (!currentUser.value) { navigateTo('/connexion'); return }
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
          <a :href="`https://wa.me/?text=${encodeURIComponent(`${location.origin}/biens/${propertyId}`)}`" target="_blank" rel="noopener" class="rounded-sm bg-whatsapp px-[17px] py-[11px] text-[13px] font-bold text-white">WhatsApp</a>
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
          <div class="relative h-[220px] overflow-hidden rounded-xl border border-[var(--border-subtle)]" style="background-image: radial-gradient(60% 60% at 30% 25%, #e7f0e8, transparent), linear-gradient(150deg, var(--color-sand-200), #e4ecdf 60%, #dfe9ef)">
            <div class="absolute inset-0 opacity-45" style="background-image: linear-gradient(var(--border-default) 1px, transparent 1px), linear-gradient(90deg, var(--border-default) 1px, transparent 1px); background-size: 44px 44px" />
            <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div class="whitespace-nowrap rounded-pill bg-green-900 px-3.5 py-2.5 font-mono text-[12.5px] font-bold text-white shadow-[0_10px_24px_rgba(18,60,41,.4)]">
                {{ [property.neighborhood?.name, property.city?.name].filter(Boolean).join(', ') || 'Localisation non précisée' }}
              </div>
            </div>
            <a v-if="mapsUrl" :href="mapsUrl" target="_blank" rel="noopener" class="absolute bottom-3.5 right-3.5 rounded-pill bg-white/[.94] px-3.5 py-2 text-[12.5px] font-bold text-green-700">Ouvrir dans Maps →</a>
          </div>
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
            <div class="flex items-baseline gap-2">
              <span class="font-mono text-[28px] font-bold tracking-[-.02em] text-green-900">{{ formatFcfaShort(isShortStay ? nightlyPrice : Number(selectedUnit.price)) }}</span>
              <span class="text-[15px] font-semibold text-[var(--text-muted)]">{{ isShortStay ? '/ nuit' : '/ mois' }}</span>
            </div>

            <template v-if="bookingDone">
              <div class="mt-4 rounded-md border border-ok-border bg-ok-bg p-4 text-center">
                <p class="m-0 text-sm font-bold text-ok-fg">Réservation créée</p>
                <p class="mb-0 mt-1.5 text-[12.5px] text-ok-fg">Vous avez 15 minutes pour la payer.</p>
                <NuxtLink to="/locataire/reservations" class="mt-3 inline-block rounded-md bg-[image:var(--action-primary)] px-4 py-2.5 text-[13px] font-bold text-white">Payer maintenant</NuxtLink>
              </div>
            </template>
            <template v-else-if="isShortStay">
              <p class="mb-2.5 mt-4 text-xs font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Vos dates</p>
              <div class="grid grid-cols-7 gap-[5px]">
                <button
                  v-for="day in calendarDays"
                  :key="day.iso"
                  type="button"
                  class="h-[36px] rounded-xs text-[12px] font-semibold transition-all"
                  :class="[
                    day.blocked ? 'cursor-not-allowed bg-[var(--surface-page)] text-sand-500 line-through' :
                    (day.iso === checkIn || day.iso === checkOut) ? 'cursor-pointer bg-green-900 text-white' :
                    (checkIn && checkOut && day.iso > checkIn && day.iso < checkOut) ? 'cursor-pointer bg-green-50 text-green-800' :
                    'cursor-pointer bg-white text-[var(--text-primary)]'
                  ]"
                  @click="pickDate(day)"
                >{{ day.date.getDate() }}</button>
              </div>

              <div v-if="nights > 0" class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
                <DataMoneyLine :label="`${nights} nuit${nights > 1 ? 's' : ''} × ${formatFcfa(nightlyPrice)}`" :value="formatFcfa(stayTotal)" />
                <DataMoneyLine label="Total à payer" :value="formatFcfa(stayTotal)" total />
              </div>

              <p v-if="bookingError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ bookingError }}</p>
              <CoreButton size="lg" full-width class="mt-4" :disabled="!nights || bookingLoading" @click="submitBooking">{{ bookingLoading ? 'Réservation…' : 'Réserver' }}</CoreButton>
              <p class="mb-0 mt-2.5 text-center text-[12.5px] text-[var(--text-faint)]">Aucun montant prélevé à cette étape</p>
            </template>

            <template v-else>
              <div class="mt-4.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
                <p class="mb-2.5 mt-0 text-xs font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Ce que vous payez à l'entrée</p>
                <template v-if="entryLines.length">
                  <DataMoneyLine v-for="l in entryLines" :key="l.label" :label="l.label" :value="l.value" />
                  <DataMoneyLine label="Total à l'entrée" :value="entryTotal" total />
                  <FeedbackEscrowNotice v-if="cautionLabel" :amount="`Dont ${cautionLabel} de caution séquestrée`" class="mt-3.5">
                    Conservée par Immo, ni par vous ni par le propriétaire. Restituée sous 7 jours après l'état des lieux de sortie.
                  </FeedbackEscrowNotice>
                </template>
                <p v-else class="m-0 text-[13px] text-[var(--text-muted)]">Détail des frais d'entrée communiqué par le propriétaire.</p>
              </div>

              <p v-if="contactError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ contactError }}</p>
              <CoreButton size="lg" full-width class="mt-4" :disabled="contactLoading" @click="sendInquiry">{{ contactLoading ? 'Envoi…' : 'Envoyer une demande' }}</CoreButton>
              <CoreButton tone="secondary" size="lg" full-width class="mt-2.5" @click="openVisitModal">Demander une visite</CoreButton>
              <p class="mb-0 mt-2.5 text-center text-[12.5px] text-[var(--text-faint)]">Aucun montant prélevé à cette étape</p>
            </template>
          </div>
        </div>
      </div>

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
