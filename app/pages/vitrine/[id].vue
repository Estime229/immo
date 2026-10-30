<script setup lang="ts">
import { ArrowLeft, BadgeCheck, Check, House, Share2, ShieldCheck, Star, Store } from '@lucide/vue'
import type { PropertySearchResult } from '~/types/property'
import type { UserRole } from '~/types/auth'
import { flattenSearchResults } from '~/utils/propertyListing'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { ROLE_LABELS, roleHomePath } from '~/utils/roleRoutes'
import { mapLimited } from '~/utils/rentalMode'
import { recallSearch } from '~/utils/searchPill'

const route = useRoute()
const router = useRouter()
const ownerId = String(route.params.id)
const searchApi = usePropertySearchApi()
const reviewsApi = useReviewsApi()
const messagingApi = useMessagingApi()
const favorites = usePropertyFavorites()
const currentUser = useAuthUser()
const requestUrl = useRequestURL()

/** Biens par page de vitrine : l'API en renvoie 20 par défaut, ce qui coupait la liste sans le dire. */
const PAGE_SIZE = 50

/**
 * Chargée côté serveur (Lot 56) : un lien de vitrine partagé sur WhatsApp
 * affiche le nom et la présentation du propriétaire, plus une page vide.
 * `notFound` distingue un compte inexistant d'une panne (avant : « introuvable » dans les deux cas).
 */
const { data: storefront, error, status, refresh } = await useAsyncData(`vitrine-${ownerId}`, async () => {
  try {
    return await searchApi.fetchOwnerStorefront(ownerId, { limit: PAGE_SIZE })
  } catch (e) {
    // Le code HTTP doit survivre au passage serveur → client (l'erreur est sérialisée dans le payload).
    throw createError({ statusCode: e instanceof ApiRequestError && e.status ? e.status : 500 })
  }
})
const notFound = computed(() => error.value?.statusCode === 404 || error.value?.statusCode === 400)
const state = computed<'loading' | 'success' | 'error'>(() => (status.value === 'pending' ? 'loading' : error.value || !storefront.value ? 'error' : 'success'))

/* ---- Biens suivants (au-delà de la première page) ---- */
const morePages = ref<PropertySearchResult[]>([])
const loadedPage = ref(1)
const moreLoading = ref(false)
const moreError = ref(false)
const properties = computed(() => [...((storefront.value?.properties.data ?? []) as PropertySearchResult[]), ...morePages.value])
const hasMore = computed(() => !!storefront.value && loadedPage.value < (storefront.value.properties.totalPages ?? 1))
async function loadMore() {
  moreLoading.value = true
  moreError.value = false
  try {
    const res = await searchApi.fetchOwnerStorefront(ownerId, { limit: PAGE_SIZE, page: loadedPage.value + 1 })
    morePages.value = [...morePages.value, ...(res.properties.data as PropertySearchResult[])]
    loadedPage.value += 1
  } catch {
    moreError.value = true
  } finally {
    moreLoading.value = false
  }
}

/**
 * Le chiffre de la vitrine et le titre de la liste comptent la même chose : les
 * logements affichés. Avant, la tuile montrait `properties.total` (des biens, toutes
 * pages confondues) au-dessus d'une liste de logements de la première page seulement.
 */
const listings = computed(() => flattenSearchResults(properties.value))
const listingCount = computed(() => (listings.value.length > 1 ? `${listings.value.length} logements disponibles` : `${listings.value.length} logement disponible`))
const listingTile = computed(() => `${listings.value.length}${hasMore.value ? '+' : ''}`)

useSeoMeta({
  title: () => storefront.value?.profile.display_name ?? 'Vitrine',
  description: () => storefront.value?.profile.bio || (storefront.value ? `Les logements de ${storefront.value.profile.display_name} sur Immo.` : undefined),
  ogTitle: () => (storefront.value ? `${storefront.value.profile.display_name} · Immo` : undefined),
  ogDescription: () => storefront.value?.profile.bio || (storefront.value ? `${listingCount.value} sur Immo.` : undefined),
  ogUrl: () => `${requestUrl.origin}${route.path}`
})

const roleText = computed(() => {
  const role = storefront.value?.profile.role
  return role && role in ROLE_LABELS ? ROLE_LABELS[role as UserRole] : ''
})

/**
 * Aucune statistique d'agrégation par propriétaire n'existe côté API — seuls
 * des avis par BIEN (`GET /reviews/property/:id/stats`). Calculée ici en
 * agrégeant les biens listés dans cette vitrine (nombre borné par la même
 * pagination que la vitrine elle-même, jamais un balayage complet du catalogue).
 */
const avgRating = ref<number | null>(null)
const totalReviews = ref(0)
async function loadReviewStats(list: PropertySearchResult[]) {
  try {
    const stats = await mapLimited(list, 6, p => reviewsApi.fetchPropertyStats(p.id))
    const count = stats.reduce((sum, s) => sum + s.count, 0)
    if (count > 0) {
      avgRating.value = stats.reduce((sum, s) => sum + s.average * s.count, 0) / count
      totalReviews.value = count
    }
  } catch {
    avgRating.value = null
    totalReviews.value = 0
  }
}

/* ---- Retour : la page d'où l'on vient (fiche, recherche), sinon la dernière recherche ---- */
const backTo = ref('/recherche')
const hasHistory = ref(false)
onMounted(() => {
  hasHistory.value = typeof router.options.history.state.back === 'string'
  backTo.value = recallSearch()
})
function goBack() {
  if (hasHistory.value) router.back()
  else navigateTo(backTo.value)
}

onMounted(() => {
  favorites.ensureLoaded()
  shareUrl.value = `${window.location.origin}${route.path}`
  if (storefront.value) loadReviewStats(storefront.value.properties.data as PropertySearchResult[])
  // Retour de connexion après « Se connecter pour écrire » : on ouvre la conversation demandée.
  if (route.query.action === 'contact') {
    router.replace({ query: { ...route.query, action: undefined } })
    if (currentUser.value) contactOwner()
  }
})

function formatMemberSince(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}
function openListing(l: (typeof listings.value)[number]) {
  if (l.virtual || !l.propertyId) return
  navigateTo(`/biens/${l.propertyId}?unit=${l.unitId}`)
}
function toLogin(action?: 'contact') {
  const redirect = action ? router.resolve({ path: route.path, query: { ...route.query, action } }).fullPath : route.fullPath
  return navigateTo({ path: '/connexion', query: { redirect } })
}
async function onFavorite(l: (typeof listings.value)[number]) {
  if (!l.propertyId) return
  if (!currentUser.value) { await toLogin(); return }
  await favorites.toggleProperty(l.propertyId)
}

/* ---- Contacter le propriétaire (avant : lien vers le formulaire de contact d'Immo) ---- */
const isSelf = computed(() => !!currentUser.value && currentUser.value.id === ownerId)
const contactLoading = ref(false)
const contactError = ref('')
async function contactOwner() {
  if (!currentUser.value) { await toLogin('contact'); return }
  // Une conversation porte sur un logement : celle du premier logement de la vitrine.
  const unitId = listings.value.find(l => !l.virtual)?.unitId
  if (!unitId) return
  contactLoading.value = true
  contactError.value = ''
  try {
    const conv = await messagingApi.openConversation(unitId, ownerId)
    const home = roleHomePath(currentUser.value.role)
    await navigateTo({ path: `${home === '/' ? '/locataire' : home}/messages`, query: { conversation: conv.id } })
  } catch (e) {
    contactError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La conversation n\'a pas pu être ouverte.') : 'La conversation n\'a pas pu être ouverte.'
  } finally {
    contactLoading.value = false
  }
}

/* ---- Partage : l'URL est lue au montage (`location` n'existe pas dans un template Vue : le bouton plantait) ---- */
const shareOpen = ref(false)
const linkCopied = ref(false)
const shareUrl = ref('')
async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 2000)
  } catch {
    linkCopied.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-[1180px] animate-[im-fade_.3s_ease_backwards] px-4 pb-[70px] pt-6 sm:px-[26px]">
    <a :href="backTo" class="mb-5 inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13.5px] font-semibold text-sand-900 transition-colors hover:border-green-600 hover:text-green-700" @click.prevent="goBack">
      <ArrowLeft class="h-4 w-4" :stroke-width="2" />Retour
    </a>

    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="grid grid-cols-1 gap-[22px] sm:grid-cols-2">
        <DataSkeletonCard v-for="i in 4" :key="i" :height="168" :lines="2" />
      </div>
      <DataSkeletonCard :height="300" :lines="1" class="order-first lg:order-none" />
    </div>

    <div v-else-if="state === 'error' && notFound" class="rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-6 py-12 text-center">
      <div class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Store class="h-5 w-5" :stroke-width="1.9" /></div>
      <p class="mb-0 mt-4 text-[15px] font-bold">Cette vitrine n'existe pas ou plus</p>
      <p class="mx-auto mb-4.5 mt-1.5 max-w-[420px] text-[13.5px] text-[var(--text-muted)]">Le lien est peut-être incomplet. Les logements disponibles restent consultables dans la recherche.</p>
      <NuxtLink to="/recherche" class="inline-block rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-sm font-bold text-white shadow-action">Voir les logements</NuxtLink>
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error' || !storefront" tone="danger">
      Impossible de charger cette vitrine pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="refresh()">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
      <!-- Profil et actions : en tête sur mobile (qui loue), collé à droite sur grand écran, comme le panneau de la fiche. -->
      <aside class="lg:sticky lg:top-[94px] lg:order-last">
        <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 text-center shadow-panel sm:p-6">
          <div class="relative mx-auto h-[88px] w-[88px]">
            <CoreAvatar :name="storefront.profile.display_name" :avatar-url="storefront.profile.avatar_url" :size="88" color="var(--color-green-700)" />
            <span v-if="storefront.profile.is_verified" class="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-pill border-[3px] border-white bg-green-600 text-white" aria-label="Identité vérifiée">
              <Check class="h-3.5 w-3.5" :stroke-width="3" />
            </span>
          </div>
          <h1 class="mb-0 mt-4 font-display text-2xl font-bold tracking-[-.025em]">{{ storefront.profile.display_name }}</h1>
          <p class="mb-0 mt-1.5 text-[13.5px] text-[var(--text-muted)]">
            {{ [roleText, `Membre depuis ${formatMemberSince(storefront.profile.member_since)}`].filter(Boolean).join(' · ') }}
          </p>
          <CoreBadge v-if="storefront.profile.is_verified" tone="ok" bordered class="mt-3"><BadgeCheck class="h-3.5 w-3.5" :stroke-width="2" />Identité vérifiée</CoreBadge>
          <CoreBadge v-else tone="neutral" class="mt-3">Identité non vérifiée</CoreBadge>

          <div class="my-5 grid grid-cols-2 gap-3 text-left">
            <div class="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
              <p class="m-0 truncate font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ listingTile }}</p>
              <p class="mb-0 mt-1.5 text-[11.5px] leading-[1.3] text-[var(--text-muted)]">{{ listings.length > 1 ? 'logements en ligne' : 'logement en ligne' }}</p>
            </div>
            <div class="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
              <p class="m-0 flex items-center gap-1 truncate font-mono text-xl font-bold tracking-[-.02em] text-green-900">
                <template v-if="avgRating">{{ avgRating.toFixed(1).replace('.', ',') }}<Star class="h-4 w-4 fill-current text-clay-500" :stroke-width="1.6" /></template>
                <template v-else>—</template>
              </p>
              <p class="mb-0 mt-1.5 text-[11.5px] leading-[1.3] text-[var(--text-muted)]">{{ totalReviews ? `${totalReviews} avis de locataires` : 'Aucun avis pour l\'instant' }}</p>
            </div>
          </div>

          <CoreButton v-if="listings.length && !isSelf" size="lg" full-width :disabled="contactLoading" @click="contactOwner">
            {{ contactLoading ? 'Ouverture…' : currentUser ? 'Écrire à ce propriétaire' : 'Se connecter pour écrire' }}
          </CoreButton>
          <p v-else-if="isSelf" class="m-0 rounded-md bg-sand-100 px-3 py-2.5 text-[13px] text-[var(--text-muted)]">C'est votre vitrine, telle que la voient les visiteurs.</p>
          <p v-if="contactError" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ contactError }}</p>
          <CoreButton tone="secondary" full-width class="mt-2.5" :aria-expanded="shareOpen" @click="shareOpen = !shareOpen">
            <Share2 class="mr-1.5 inline h-4 w-4 align-[-3px]" :stroke-width="1.9" />Partager cette vitrine
          </CoreButton>
        </div>
        <div v-if="storefront.profile.is_verified" class="mt-3 flex items-start gap-2.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-3">
          <ShieldCheck class="mt-px h-4 w-4 flex-none text-ok-fg" :stroke-width="1.9" />
          <p class="m-0 text-[13px] leading-[1.5] text-green-900">Ce compte a passé la vérification d'identité Immo.</p>
        </div>
      </aside>

      <div class="min-w-0">
        <p v-if="storefront.profile.bio" class="mb-5.5 mt-0 max-w-[640px] whitespace-pre-line text-[15px] leading-[1.6] text-[var(--text-secondary)]">{{ storefront.profile.bio }}</p>

        <div v-if="shareOpen" class="mb-5.5 flex animate-[im-rise_.25s_ease_both] flex-wrap items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-4">
          <div class="min-w-[200px] flex-1">
            <p class="m-0 text-[15px] font-bold">Partager la vitrine de {{ storefront.profile.display_name }}</p>
            <p class="mb-0 mt-0.5 text-[13.5px] text-[var(--text-muted)]">Le lien ouvre cette page, avec tous ses logements.</p>
          </div>
          <div class="flex flex-wrap gap-2.5">
            <a :href="`https://wa.me/?text=${encodeURIComponent(shareUrl)}`" target="_blank" rel="noopener" class="rounded-md bg-whatsapp px-4 py-2.5 text-[13px] font-bold text-white">WhatsApp</a>
            <button type="button" class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold" @click="copyLink">
              <Check v-if="linkCopied" class="h-4 w-4 text-ok-fg" :stroke-width="2.4" />{{ linkCopied ? 'Lien copié' : 'Copier le lien' }}
            </button>
          </div>
        </div>

        <h2 class="mb-[18px] mt-0 font-display text-xl font-bold tracking-[-.025em]">{{ listingCount }}</h2>

        <div v-if="!listings.length" class="rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-6 py-12 text-center">
          <div class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><House class="h-5 w-5" :stroke-width="1.9" /></div>
          <p class="mb-0 mt-4 text-[15px] font-bold">Aucune annonce en ligne pour le moment</p>
          <p class="mx-auto mb-4.5 mt-1.5 max-w-[420px] text-[13.5px] text-[var(--text-muted)]">Les logements de ce compte sont occupés ou ne sont pas listés publiquement. D'autres logements vous attendent dans la recherche.</p>
          <NuxtLink to="/recherche" class="inline-block rounded-md border border-[var(--border-default)] bg-white px-5 py-3 text-sm font-bold text-sand-900 hover:border-green-600">Voir les logements</NuxtLink>
        </div>
        <template v-else>
          <div class="grid grid-cols-1 gap-[22px] sm:grid-cols-2 xl:grid-cols-3">
            <SearchPropertyCard
              v-for="l in listings"
              :key="l.unitId"
              :listing="l"
              :favorite="l.propertyId ? favorites.isFavoriteProperty(l.propertyId) : false"
              @open="openListing(l)"
              @favorite="onFavorite(l)"
            />
          </div>
          <div v-if="hasMore" class="mt-[34px] flex flex-col items-center gap-2">
            <CoreButton tone="secondary" pill :disabled="moreLoading" @click="loadMore">{{ moreLoading ? 'Chargement…' : 'Afficher plus de logements' }}</CoreButton>
            <p v-if="moreError" class="m-0 text-[13px] font-semibold text-danger-fg">Le chargement a échoué. Réessayez.</p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
