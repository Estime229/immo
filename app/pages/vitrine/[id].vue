<script setup lang="ts">
import type { OwnerStorefront, PropertySearchResult } from '~/types/property'
import { flattenSearchResults } from '~/utils/propertyListing'

const route = useRoute()
const ownerId = String(route.params.id)
const searchApi = usePropertySearchApi()
const reviewsApi = useReviewsApi()
const favorites = usePropertyFavorites()

const storefront = ref<OwnerStorefront | null>(null)
const state = ref<'loading' | 'success' | 'error'>('loading')

const listings = computed(() => storefront.value ? flattenSearchResults(storefront.value.properties.data as PropertySearchResult[]) : [])
const listingCount = computed(() => (listings.value.length > 1 ? `${listings.value.length} logements disponibles` : `${listings.value.length} logement disponible`))

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

async function load() {
  state.value = 'loading'
  try {
    storefront.value = await searchApi.fetchOwnerStorefront(ownerId)
    state.value = 'success'
    await loadReviewStats(storefront.value.properties.data as PropertySearchResult[])
  } catch {
    state.value = 'error'
  }
}
onMounted(async () => {
  await load()
  favorites.ensureLoaded()
})

function formatMemberSince(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}
function openListing(l: (typeof listings.value)[number]) {
  if (l.virtual || !l.propertyId) return
  navigateTo(`/biens/${l.propertyId}?unit=${l.unitId}`)
}
async function onFavorite(l: (typeof listings.value)[number]) {
  if (!l.propertyId) return
  const ok = await favorites.toggleProperty(l.propertyId)
  if (!ok && !useApiAuth().isAuthenticated()) navigateTo('/connexion')
}

const shareOpen = ref(false)
const linkCopied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href)
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

    <FeedbackAlertBanner v-else-if="state === 'error' || !storefront" tone="danger">
      Ce propriétaire est introuvable.
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
          <NuxtLink to="/contact" class="block w-full rounded-md bg-[image:var(--action-primary)] py-3.5 text-[14.5px] font-bold text-white shadow-action">Contacter</NuxtLink>
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
            <a :href="`https://wa.me/?text=${encodeURIComponent(location.href)}`" target="_blank" rel="noopener" class="rounded-sm bg-whatsapp px-[17px] py-[11px] text-[13px] font-bold text-white">WhatsApp</a>
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
