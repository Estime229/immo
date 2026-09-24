<script setup lang="ts">
import { flattenSearchResults, type ListingCard } from '~/utils/propertyListing'

definePageMeta({ layout: 'locataire' })

const favoritesApi = useFavoritesApi()
const favorites = usePropertyFavorites()

const cards = ref<ListingCard[]>([])
const state = ref<'loading' | 'success' | 'error'>('loading')

async function load() {
  state.value = 'loading'
  try {
    const entries = await favoritesApi.fetchMine()
    const properties = entries.map(e => e.property).filter((p): p is NonNullable<typeof p> => p !== null)
    cards.value = flattenSearchResults(properties)
    state.value = 'success'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

async function removeFavorite(l: ListingCard) {
  if (!l.propertyId) return
  const ok = await favorites.toggleProperty(l.propertyId)
  if (ok) cards.value = cards.value.filter(c => c.propertyId !== l.propertyId)
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="240" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos favoris pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <FeedbackEmptyState
      v-else-if="!cards.length"
      title="Vous n'avez pas encore de favori"
      description="Touchez le cœur sur une annonce pour la retrouver ici."
      action-label="Voir les logements disponibles"
      @action="navigateTo('/recherche')"
    />

    <div v-else class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="l in cards" :key="l.unitId" class="cursor-pointer" @click="l.propertyId && navigateTo(`/biens/${l.propertyId}?unit=${l.unitId}`)">
        <div class="relative h-[200px] overflow-hidden rounded-xl bg-cover bg-center bg-sand-200" :style="l.photoUrl ? { backgroundImage: `url(${l.photoUrl})` } : {}">
          <button type="button" class="absolute right-2.5 top-2.5 grid h-[30px] w-[30px] place-items-center" @click.stop="removeFavorite(l)">
            <span class="text-[22px] text-fav" style="text-shadow: 0 1px 3px rgba(0,0,0,.35)">♥</span>
          </button>
        </div>
        <p class="mb-0 mt-2.5 text-[14.5px] font-bold tracking-[-.01em]">{{ l.title }}</p>
        <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">
          <span class="font-mono font-bold text-[var(--text-primary)]">{{ formatFcfaShort(l.price) }}</span>
          <template v-if="[l.neighborhoodName, l.cityName].filter(Boolean).length"> · {{ [l.neighborhoodName, l.cityName].filter(Boolean).join(', ') }}</template>
        </p>
      </div>
    </div>
  </div>
</template>
