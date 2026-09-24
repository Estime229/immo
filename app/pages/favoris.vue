<script setup lang="ts">
import type { FavoriteEntry } from '~/composables/useFavoritesApi'
import { flattenSearchResults, type ListingCard } from '~/utils/propertyListing'

const favoritesApi = useFavoritesApi()
const favorites = usePropertyFavorites()

const entries = ref<FavoriteEntry[]>([])
const state = ref<'loading' | 'success' | 'error'>('loading')

async function load() {
  state.value = 'loading'
  try {
    entries.value = await favoritesApi.fetchMine()
    state.value = 'success'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const sort = ref<'recent' | 'prix-asc' | 'prix-desc'>('recent')

const cards = computed<ListingCard[]>(() => {
  const properties = entries.value.map(e => e.property).filter((p): p is NonNullable<typeof p> => p !== null)
  let list = flattenSearchResults(properties)
  if (sort.value === 'recent') list = [...list].reverse()
  if (sort.value === 'prix-asc') list = [...list].sort((a, b) => a.price - b.price)
  if (sort.value === 'prix-desc') list = [...list].sort((a, b) => b.price - a.price)
  return list
})

const favLabel = computed(() => (cards.value.length > 1 ? `${cards.value.length} logements enregistrés` : `${cards.value.length} logement enregistré`))

const STATUS_LABEL: Record<string, string> = {
  occupied: 'Occupé',
  notice_given: 'Bientôt libéré'
}

async function removeFavorite(l: ListingCard) {
  if (!l.propertyId) return
  const ok = await favorites.toggleProperty(l.propertyId)
  if (ok) entries.value = entries.value.filter(e => e.property_id !== l.propertyId)
}
</script>

<template>
  <div class="mx-auto max-w-[1240px] px-[26px] pb-[70px] pt-[26px]">
    <div class="mb-[22px] flex items-end justify-between gap-5">
      <div>
        <h1 class="m-0 font-display text-[30px] font-bold tracking-[-.03em]">Mes favoris</h1>
        <p class="mb-0 mt-2 text-[14.5px] text-[var(--text-muted)]">{{ state === 'success' ? favLabel : '' }}</p>
      </div>
      <select v-if="cards.length" v-model="sort" class="h-11 rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13.5px] text-sand-900">
        <option value="recent">Trier : ajouté récemment</option>
        <option value="prix-asc">Prix croissant</option>
        <option value="prix-desc">Prix décroissant</option>
      </select>
    </div>

    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="260" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos favoris pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else-if="!cards.length" class="rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-10 py-[60px] text-center">
      <div class="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-green-50 text-2xl text-fav">♥</div>
      <p class="mb-0 mt-5 text-lg font-bold">Vous n'avez pas encore de favori</p>
      <p class="mx-auto mb-[22px] mt-2.5 max-w-[420px] text-[14.5px] leading-[1.6] text-[var(--text-muted)]">
        Touchez le cœur sur une annonce pour la retrouver ici. C'est le moyen le plus simple de comparer trois ou quatre logements avant de vous décider.
      </p>
      <NuxtLink to="/recherche" class="inline-block rounded-md bg-[image:var(--action-primary)] px-7 py-3.5 text-[15px] font-bold text-white shadow-action">Voir les logements disponibles</NuxtLink>
    </div>

    <div v-else class="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="l in cards"
        :key="l.unitId"
        class="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-1 hover:shadow-raised"
      >
        <NuxtLink :to="l.propertyId ? `/biens/${l.propertyId}?unit=${l.unitId}` : '#'" class="relative block h-[186px] bg-cover bg-center bg-sand-200" :style="l.photoUrl ? { backgroundImage: `url(${l.photoUrl})` } : {}">
          <button
            type="button"
            class="absolute right-3 top-3 grid h-[34px] w-[34px] place-items-center rounded-pill bg-white/[.93]"
            @click.stop.prevent="removeFavorite(l)"
          >
            <span class="text-base leading-none text-fav">♥</span>
          </button>
          <div v-if="l.status !== 'available'" class="absolute inset-0 grid place-items-center bg-black/[.42]">
            <span class="rounded-pill bg-white/95 px-[15px] py-2 text-[12.5px] font-bold text-sand-900">{{ STATUS_LABEL[l.status] ?? l.status }}</span>
          </div>
        </NuxtLink>
        <div class="px-[17px] pb-[17px] pt-[15px]">
          <p class="m-0 font-mono text-[17px] font-bold text-green-900">{{ formatFcfaShort(l.price) }}</p>
          <p class="mb-0 mt-[7px] text-[15px] font-bold tracking-[-.01em]">{{ l.title }}</p>
          <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">{{ [l.neighborhoodName, l.cityName].filter(Boolean).join(', ') }}<template v-if="l.surface"> · {{ l.surface }} m²</template></p>
        </div>
      </div>
    </div>
  </div>
</template>
