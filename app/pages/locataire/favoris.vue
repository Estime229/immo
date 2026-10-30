<script setup lang="ts">
import { BedDouble, Heart, ImageOff, MapPin, Search, X } from '@lucide/vue'
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

/* ---- Retrait : le favori porte sur le bien entier ; un échec se dit sur la carte, un succès peut s'annuler ---- */
const removingId = ref<string | null>(null)
const removeError = ref<{ propertyId: string; text: string } | null>(null)
const removed = ref<{ propertyId: string; title: string } | null>(null)
async function removeFavorite(l: ListingCard) {
  if (!l.propertyId) return
  removingId.value = l.propertyId
  removeError.value = null
  removed.value = null
  const ok = await favorites.toggleProperty(l.propertyId)
  removingId.value = null
  if (ok) {
    cards.value = cards.value.filter(c => c.propertyId !== l.propertyId)
    removed.value = { propertyId: l.propertyId, title: l.title }
  } else {
    removeError.value = { propertyId: l.propertyId, text: "Le favori n'a pas pu être retiré. Réessayez." }
  }
}
const undoing = ref(false)
async function undoRemove() {
  const r = removed.value
  if (!r) return
  undoing.value = true
  const ok = await favorites.toggleProperty(r.propertyId)
  undoing.value = false
  if (ok) {
    removed.value = null
    await load()
  }
}
function listingLink(l: ListingCard) {
  return l.propertyId ? `/biens/${l.propertyId}?unit=${l.unitId}` : '/recherche'
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="removed" class="mb-4.5 flex flex-wrap items-center gap-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">
      <p class="m-0 flex-1">« {{ removed.title }} » retiré de vos favoris.</p>
      <button type="button" class="font-bold underline disabled:opacity-60" :disabled="undoing" @click="undoRemove">{{ undoing ? '…' : 'Annuler' }}</button>
      <button type="button" aria-label="Masquer" class="text-green-900/70 hover:text-green-900" @click="removed = null"><X class="h-4 w-4" :stroke-width="1.9" /></button>
    </div>

    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="240" :lines="2" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos favoris pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else-if="!cards.length" class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-12 text-center">
      <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Heart class="h-5 w-5" :stroke-width="1.9" /></div>
      <p class="m-0 text-[15px] font-bold">Aucun favori pour l'instant</p>
      <p class="m-0 max-w-[400px] text-[13.5px] text-[var(--text-muted)]">Touchez le cœur sur une annonce pour la retrouver ici et comparer plus tard.</p>
      <NuxtLink to="/recherche" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-2 text-[13px] font-bold text-sand-900"><Search class="h-4 w-4" :stroke-width="1.9" />Voir les logements disponibles</NuxtLink>
    </div>

    <div v-else class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
      <article v-for="l in cards" :key="l.unitId" class="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white transition-shadow hover:shadow-raised">
        <NuxtLink :to="listingLink(l)" class="block">
          <div class="h-[180px] bg-sand-200 bg-cover bg-center" :style="l.photoUrl ? { backgroundImage: `url(${l.photoUrl})` } : {}">
            <div v-if="!l.photoUrl" class="grid h-full place-items-center text-[var(--text-faint)]"><ImageOff class="h-6 w-6" :stroke-width="1.9" /></div>
          </div>
          <div class="p-4.5">
            <p class="m-0 line-clamp-2 text-sm font-bold leading-snug">{{ l.title }}</p>
            <p class="mb-0 mt-1.5 font-mono text-[15px] font-bold text-green-900">{{ formatFcfaShort(l.price) }}</p>
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-faint)]">
              <span v-if="[l.neighborhoodName, l.cityName].filter(Boolean).length" class="inline-flex items-center gap-1"><MapPin class="h-3.5 w-3.5" :stroke-width="1.9" />{{ [l.neighborhoodName, l.cityName].filter(Boolean).join(', ') }}</span>
              <span v-if="l.bedrooms" class="inline-flex items-center gap-1"><BedDouble class="h-3.5 w-3.5" :stroke-width="1.9" />{{ l.bedrooms }} chambre{{ l.bedrooms > 1 ? 's' : '' }}</span>
            </div>
          </div>
        </NuxtLink>
        <button
          type="button"
          :aria-label="`Retirer « ${l.title} » des favoris`"
          class="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-pill bg-white/[.94] text-fav shadow-card disabled:opacity-60"
          :disabled="removingId === l.propertyId"
          @click="removeFavorite(l)"
        ><Heart class="h-[18px] w-[18px] fill-current" :stroke-width="1.9" /></button>
        <p v-if="removeError?.propertyId === l.propertyId" class="m-0 border-t border-danger-border bg-danger-bg px-4.5 py-2 text-[12.5px] font-semibold text-danger-fg">{{ removeError.text }}</p>
      </article>
    </div>
  </div>
</template>
