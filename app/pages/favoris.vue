<script setup lang="ts">
import { Heart } from '@lucide/vue'
import type { FavoriteEntry } from '~/composables/useFavoritesApi'
import { flattenSearchResults, type ListingCard } from '~/utils/propertyListing'
import { classifyRental, displayPrice, mapLimited, type RentalMode } from '~/utils/rentalMode'

const route = useRoute()
const router = useRouter()
const favoritesApi = useFavoritesApi()
const favorites = usePropertyFavorites()
const searchApi = usePropertySearchApi()
const { isAuthenticated } = useApiAuth()

const entries = ref<FavoriteEntry[]>([])
/** `guest` (Lot 56) : un visiteur voyait « Impossible de charger vos favoris » (401) au lieu d'une invitation à se connecter. */
const state = ref<'loading' | 'success' | 'error' | 'guest'>('loading')

async function load() {
  if (!isAuthenticated()) {
    state.value = 'guest'
    return
  }
  state.value = 'loading'
  try {
    entries.value = await favoritesApi.fetchMine()
    state.value = 'success'
    classify()
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

/**
 * Prix et unité (« / nuit », « / mois ») de chaque logement, lus dans sa grille
 * tarifaire comme dans la recherche : avant, la carte maison affichait le prix de
 * base sans unité, faux pour un logement qui ne se loue qu'à la nuit.
 */
const modeByUnit = ref<Record<string, RentalMode>>({})
async function classify() {
  const todo = flattenSearchResults(entries.value.map(e => e.property).filter((p): p is NonNullable<typeof p> => p !== null))
    .filter(c => !modeByUnit.value[c.unitId])
  const modes = await mapLimited(todo, 6, async c => {
    try {
      return classifyRental(await searchApi.fetchPricing(c.unitId), c.price)
    } catch {
      return null
    }
  })
  const next = { ...modeByUnit.value }
  todo.forEach((c, i) => { if (modes[i]) next[c.unitId] = modes[i]! })
  modeByUnit.value = next
}

/** Tri gardé dans l'URL (`?tri=`), comme les filtres de la recherche. */
type FavSort = 'recent' | 'prix-asc' | 'prix-desc'
const SORTS: FavSort[] = ['recent', 'prix-asc', 'prix-desc']
const sort = computed<FavSort>({
  get: () => (SORTS.includes(route.query.tri as FavSort) ? route.query.tri as FavSort : 'recent'),
  set: v => { router.replace({ query: { ...route.query, tri: v === 'recent' ? undefined : v } }) }
})

const items = computed<{ listing: ListingCard; suffix: string | undefined }[]>(() => {
  const properties = entries.value.map(e => e.property).filter((p): p is NonNullable<typeof p> => p !== null)
  let list = flattenSearchResults(properties).map(c => {
    const d = displayPrice(modeByUnit.value[c.unitId], c.price)
    return { listing: { ...c, price: d.price }, suffix: d.suffix }
  })
  if (sort.value === 'recent') list = [...list].reverse()
  if (sort.value === 'prix-asc') list = [...list].sort((a, b) => a.listing.price - b.listing.price)
  if (sort.value === 'prix-desc') list = [...list].sort((a, b) => b.listing.price - a.listing.price)
  return list
})

const favLabel = computed(() => (items.value.length > 1 ? `${items.value.length} logements enregistrés` : `${items.value.length} logement enregistré`))

/* ---- Retirer, avec possibilité d'annuler ---- */
const removed = ref<FavoriteEntry | null>(null)
const removeError = ref('')
async function removeFavorite(l: ListingCard) {
  if (!l.propertyId) return
  removeError.value = ''
  const entry = entries.value.find(e => e.property_id === l.propertyId) ?? null
  const ok = await favorites.toggleProperty(l.propertyId)
  if (!ok) {
    removeError.value = 'Le logement n\'a pas pu être retiré de vos favoris. Réessayez.'
    return
  }
  entries.value = entries.value.filter(e => e.property_id !== l.propertyId)
  removed.value = entry
}
async function undoRemove() {
  const entry = removed.value
  if (!entry?.property_id) return
  const ok = await favorites.toggleProperty(entry.property_id)
  if (!ok) {
    removeError.value = 'Le logement n\'a pas pu être remis dans vos favoris.'
    return
  }
  entries.value = [...entries.value, entry]
  removed.value = null
}

function openListing(l: ListingCard) {
  if (l.virtual || !l.propertyId) return
  navigateTo(`/biens/${l.propertyId}?unit=${l.unitId}`)
}
</script>

<template>
  <div class="mx-auto max-w-[1240px] animate-[im-fade_.3s_ease_backwards] px-4 pb-[70px] pt-[26px] sm:px-[26px]">
    <div class="mb-5.5 flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
      <div>
        <h1 class="m-0 font-display text-[30px] font-bold tracking-[-.03em]">Mes favoris</h1>
        <p v-if="state === 'success'" class="mb-0 mt-1.5 text-[13.5px] text-[var(--text-muted)]">{{ items.length ? favLabel : 'Aucun logement enregistré' }}</p>
      </div>
      <select v-if="state === 'success' && items.length > 1" v-model="sort" aria-label="Trier les favoris" class="h-[42px] cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none">
        <option value="recent">Ajoutés récemment</option>
        <option value="prix-asc">Prix croissant</option>
        <option value="prix-desc">Prix décroissant</option>
      </select>
    </div>

    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="168" :lines="2" />
    </div>

    <div v-else-if="state === 'guest'" class="rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-6 py-12 text-center">
      <div class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Heart class="h-5 w-5" :stroke-width="1.9" /></div>
      <p class="mb-0 mt-4 text-[15px] font-bold">Connectez-vous pour retrouver vos favoris</p>
      <p class="mx-auto mb-4.5 mt-1.5 max-w-[420px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Vos favoris sont enregistrés sur votre compte : vous les retrouvez sur votre téléphone comme sur ordinateur.
      </p>
      <NuxtLink :to="{ path: '/connexion', query: { redirect: '/favoris' } }" class="inline-block rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-sm font-bold text-white shadow-action">Se connecter ou créer un compte</NuxtLink>
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos favoris pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <div v-if="removed" class="mb-4.5 flex flex-wrap items-center gap-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5">
        <p class="m-0 flex-1 text-[13px] font-semibold text-green-900">« {{ removed.property?.name ?? 'Ce logement' }} » est retiré de vos favoris.</p>
        <button type="button" class="text-[13px] font-bold text-green-700 underline" @click="undoRemove">Annuler</button>
      </div>
      <p v-if="removeError" class="mb-4.5 mt-0 text-[13px] font-semibold text-danger-fg">{{ removeError }}</p>

      <div v-if="!items.length" class="rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-6 py-12 text-center">
        <div class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Heart class="h-5 w-5" :stroke-width="1.9" /></div>
        <p class="mb-0 mt-4 text-[15px] font-bold">Vous n'avez pas encore de favori</p>
        <p class="mx-auto mb-4.5 mt-1.5 max-w-[440px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
          Touchez le cœur sur une annonce pour la retrouver ici. C'est le moyen le plus simple de comparer trois ou quatre logements avant de vous décider.
        </p>
        <NuxtLink to="/recherche" class="inline-block rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-sm font-bold text-white shadow-action">Voir les logements disponibles</NuxtLink>
      </div>

      <div v-else class="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
        <SearchPropertyCard
          v-for="item in items"
          :key="item.listing.unitId"
          :listing="item.listing"
          :price-suffix="item.suffix"
          :favorite="true"
          @open="openListing(item.listing)"
          @favorite="removeFavorite(item.listing)"
        />
      </div>
    </template>
  </div>
</template>
