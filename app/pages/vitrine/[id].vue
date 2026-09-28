<script setup lang="ts">
import type { OwnerStorefront, PropertySearchResult } from '~/types/property'
import { flattenSearchResults } from '~/utils/propertyListing'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { roleHomePath } from '~/utils/roleRoutes'

const route = useRoute()
const ownerId = String(route.params.id)
const searchApi = usePropertySearchApi()
const reviewsApi = useReviewsApi()
const messagingApi = useMessagingApi()
const favorites = usePropertyFavorites()
const currentUser = useAuthUser()
const requestUrl = useRequestURL()

/**
 * Chargée côté serveur (Lot 56) : un lien de vitrine partagé sur WhatsApp
 * affiche le nom et la présentation du propriétaire, plus une page vide.
 * `notFound` distingue un compte inexistant d'une panne (avant : « introuvable » dans les deux cas).
 */
const { data: storefront, error, status, refresh } = await useAsyncData(`vitrine-${ownerId}`, async () => {
  try {
    return await searchApi.fetchOwnerStorefront(ownerId)
  } catch (e) {
    // Le code HTTP doit survivre au passage serveur → client (l'erreur est sérialisée dans le payload).
    throw createError({ statusCode: e instanceof ApiRequestError && e.status ? e.status : 500 })
  }
})
const notFound = computed(() => error.value?.statusCode === 404)
const state = computed<'loading' | 'success' | 'error'>(() => (status.value === 'pending' ? 'loading' : error.value || !storefront.value ? 'error' : 'success'))

const listings = computed(() => storefront.value ? flattenSearchResults(storefront.value.properties.data as PropertySearchResult[]) : [])
const listingCount = computed(() => (listings.value.length > 1 ? `${listings.value.length} logements disponibles` : `${listings.value.length} logement disponible`))

useSeoMeta({
  title: () => storefront.value?.profile.display_name ?? 'Vitrine',
  description: () => storefront.value?.profile.bio || (storefront.value ? `Les logements de ${storefront.value.profile.display_name} sur Immo.` : undefined),
  ogTitle: () => (storefront.value ? `${storefront.value.profile.display_name} · Immo` : undefined),
  ogDescription: () => storefront.value?.profile.bio || (storefront.value ? `${listingCount.value} sur Immo.` : undefined),
  ogUrl: () => `${requestUrl.origin}${route.path}`
})

/**
 * Aucune statistique d'agrégation par propriétaire n'existe côté API — seuls
 * des avis par BIEN (`GET /reviews/property/:id/stats`). Calculée ici en
 * agrégeant les biens listés dans cette vitrine (nombre borné par la même
 * pagination que la vitrine elle-même, jamais un balayage complet du catalogue).
 */
const avgRating = ref<number | null>(null)
const totalReviews = ref(0)
async function loadReviewStats(properties: PropertySearchResult[]) {
  try {
    const stats = await Promise.all(properties.map(p => reviewsApi.fetchPropertyStats(p.id)))
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
onMounted(() => {
  favorites.ensureLoaded()
  shareUrl.value = window.location.href
  if (storefront.value) loadReviewStats(storefront.value.properties.data as PropertySearchResult[])
})

function formatMemberSince(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}
function openListing(l: (typeof listings.value)[number]) {
  if (l.virtual || !l.propertyId) return
  navigateTo(`/biens/${l.propertyId}?unit=${l.unitId}`)
}
function toLogin() {
  return navigateTo({ path: '/connexion', query: { redirect: route.fullPath } })
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
  if (!currentUser.value) { await toLogin(); return }
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
  <div class="mx-auto max-w-[1180px] px-[26px] pb-[70px] pt-6">
    <NuxtLink to="/recherche" class="mb-5 inline-block rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13.5px] font-semibold text-sand-900">← Retour</NuxtLink>

    <div v-if="state === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard :height="260" :lines="1" />
    </div>

    <div v-else-if="state === 'error' && notFound" class="rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-8 py-12 text-center">
      <p class="m-0 text-lg font-bold">Cette vitrine n'existe pas ou plus</p>
      <p class="mx-auto mb-5 mt-2 max-w-[420px] text-[14.5px] text-[var(--text-muted)]">Le lien est peut-être incomplet. Les logements disponibles restent consultables dans la recherche.</p>
      <NuxtLink to="/recherche" class="inline-block rounded-md bg-[image:var(--action-primary)] px-6 py-3 text-sm font-bold text-white">Voir les logements</NuxtLink>
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error' || !storefront" tone="danger">
      Impossible de charger cette vitrine pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="refresh()">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else class="grid grid-cols-1 items-start gap-10 lg:grid-cols-[340px_1fr]">
      <div class="lg:sticky lg:top-[94px]">
        <div class="rounded-2xl border border-[var(--border-subtle)] bg-white px-[26px] py-[30px] text-center shadow-raised">
          <div class="relative mx-auto h-[104px] w-[104px]">
            <CoreAvatar :name="storefront.profile.display_name" :size="104" color="var(--color-green-700)" />
            <span v-if="storefront.profile.is_verified" class="absolute bottom-0.5 right-0.5 grid h-[30px] w-[30px] place-items-center rounded-pill border-[3px] border-white bg-green-600 text-sm text-white">✓</span>
          </div>
          <h1 class="mb-0 mt-4 font-display text-2xl font-bold tracking-[-.025em]">{{ storefront.profile.display_name }}</h1>
          <p class="mb-0 mt-[5px] text-[13.5px] text-[var(--text-muted)]">
            {{ storefront.profile.is_verified ? 'Vérifié' : 'Non vérifié' }} · Membre depuis {{ formatMemberSince(storefront.profile.member_since) }}
          </p>
          <div class="my-[22px] flex border-y border-[var(--border-subtle)]">
            <div class="flex-1 border-l-0 px-1.5 py-4">
              <p class="m-0 font-display text-[19px] font-black tracking-[-.02em]">{{ storefront.properties.total }}</p>
              <p class="mb-0 mt-1 text-[11px] leading-[1.3] text-[var(--text-faint)]">biens publiés</p>
            </div>
            <div class="flex-1 border-l border-[var(--border-subtle)] px-1.5 py-4">
              <p class="m-0 font-display text-[19px] font-black tracking-[-.02em]">{{ avgRating ? `${avgRating.toFixed(1).replace('.', ',')} ★` : '—' }}</p>
              <p class="mb-0 mt-1 text-[11px] leading-[1.3] text-[var(--text-faint)]">{{ totalReviews ? `${totalReviews} avis` : 'Aucun avis' }}</p>
            </div>
          </div>
          <button
            v-if="listings.length && !isSelf"
            type="button"
            class="block w-full rounded-md bg-[image:var(--action-primary)] py-3.5 text-[14.5px] font-bold text-white shadow-action disabled:opacity-60"
            :disabled="contactLoading"
            @click="contactOwner"
          >{{ contactLoading ? 'Ouverture…' : currentUser ? 'Écrire à ce propriétaire' : 'Se connecter pour écrire' }}</button>
          <p v-else-if="isSelf" class="m-0 rounded-md bg-sand-100 px-3 py-2.5 text-[12.5px] text-[var(--text-muted)]">C'est votre vitrine, telle que la voient les visiteurs.</p>
          <p v-if="contactError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ contactError }}</p>
          <button type="button" class="mt-2.5 w-full rounded-md border border-[var(--border-default)] bg-white py-3 text-[13.5px] font-bold" @click="shareOpen = !shareOpen">Partager cette vitrine</button>
        </div>
        <div v-if="storefront.profile.is_verified" class="mt-4 flex items-start gap-2.5 rounded-lg border border-green-100 bg-green-50 p-4">
          <span class="text-base text-green-700">⛨</span>
          <p class="m-0 text-[12.5px] leading-[1.55] text-green-800">Ce compte a passé la vérification d'identité Immo.</p>
        </div>
      </div>

      <div>
        <p v-if="storefront.profile.bio" class="m-0 max-w-[600px] text-[15px] leading-[1.6] text-[var(--text-secondary)]">{{ storefront.profile.bio }}</p>

        <div v-if="shareOpen" class="mt-5 flex flex-wrap items-center gap-4.5 rounded-lg border border-[var(--border-subtle)] bg-white p-[18px] animate-[im-rise_.25s_ease_both]">
          <div class="flex-1">
            <p class="m-0 text-[14.5px] font-bold">Partager la vitrine de {{ storefront.profile.display_name }}</p>
          </div>
          <div class="flex gap-2.5">
            <a :href="`https://wa.me/?text=${encodeURIComponent(shareUrl)}`" target="_blank" rel="noopener" class="rounded-sm bg-whatsapp px-[17px] py-[11px] text-[13px] font-bold text-white">WhatsApp</a>
            <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-[17px] py-[11px] text-[13px] font-bold" @click="copyLink">{{ linkCopied ? 'Lien copié ✓' : 'Copier le lien' }}</button>
          </div>
        </div>

        <h2 class="mb-[18px] mt-[30px] font-display text-xl font-bold tracking-[-.025em]">{{ listingCount }}</h2>

        <div v-if="!listings.length" class="rounded-xl border border-dashed border-[var(--border-default)] bg-white p-12 text-center">
          <p class="m-0 text-lg font-bold">Aucune annonce disponible pour le moment</p>
          <p class="mb-0 mt-2 text-[14.5px] text-[var(--text-muted)]">Tous les biens de ce compte sont actuellement occupés ou non listés publiquement.</p>
        </div>
        <div v-else class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <SearchPropertyCard
            v-for="l in listings"
            :key="l.unitId"
            :listing="l"
            :favorite="l.propertyId ? favorites.isFavoriteProperty(l.propertyId) : false"
            @open="openListing(l)"
            @favorite="onFavorite(l)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
