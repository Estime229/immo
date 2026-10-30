<script setup lang="ts">
import { BedDouble, ChevronLeft, ChevronRight, Heart, ImageOff, MapPin } from '@lucide/vue'
import type { ListingCard } from '~/utils/propertyListing'
import { listingStatusLabel } from '~/utils/propertyListing'

const props = defineProps<{ listing: ListingCard; favorite: boolean; priceSuffix?: string }>()
const emit = defineEmits<{ open: []; favorite: []; hover: []; unhover: [] }>()

/** Libellé français de l'état (jamais le code brut) — vide pour un logement libre. */
const statusLabel = computed(() => listingStatusLabel(props.listing.status))

const photos = computed(() => (props.listing.photoUrls.length ? props.listing.photoUrls : props.listing.photoUrl ? [props.listing.photoUrl] : []))
const slideCount = computed(() => Math.max(photos.value.length, 1))
const slideWidthPct = computed(() => 100 / slideCount.value)
const activeIndex = ref(0)

function setIndex(i: number) {
  activeIndex.value = (i + slideCount.value) % slideCount.value
}

function onFavoriteClick(e: MouseEvent) {
  e.stopPropagation()
  emit('favorite')
}

let touchStartX = 0
function onTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0]!.clientX
}
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0]!.clientX - touchStartX
  if (Math.abs(dx) > 32) setIndex(activeIndex.value + (dx < 0 ? 1 : -1))
}
</script>

<template>
  <div
    class="group cursor-pointer overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-0.5 hover:shadow-card"
    :class="{ 'opacity-70': listing.virtual }"
    role="link"
    tabindex="0"
    :aria-label="listing.title"
    @click="!listing.virtual && emit('open')"
    @keydown.enter.self="!listing.virtual && emit('open')"
    @mouseenter="emit('hover')"
    @mouseleave="emit('unhover')"
  >
    <div class="relative h-[168px] overflow-hidden bg-sand-200" @touchstart="onTouchStart" @touchend="onTouchEnd">
      <div
        class="flex h-full transition-transform duration-300 ease-out"
        :style="{ width: `${slideCount * 100}%`, transform: `translateX(-${activeIndex * slideWidthPct}%)` }"
      >
        <div
          v-for="(url, i) in (photos.length ? photos : [null])"
          :key="i"
          class="h-full flex-none bg-cover bg-center"
          :style="{ width: `${slideWidthPct}%`, backgroundImage: url ? `url(${url})` : undefined }"
        />
      </div>
      <ImageOff v-if="!photos.length" class="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-sand-500" :stroke-width="1.6" aria-hidden="true" />

      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/30 to-transparent" />

      <template v-if="photos.length > 1">
        <button
          type="button"
          class="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-pill bg-white/[.9] text-sand-900 opacity-0 shadow-[0_1px_4px_rgba(0,0,0,.18)] transition-opacity group-hover:opacity-100"
          aria-label="Photo précédente"
          @click.stop="setIndex(activeIndex - 1)"
        ><ChevronLeft class="h-4 w-4" :stroke-width="2.2" /></button>
        <button
          type="button"
          class="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-pill bg-white/[.9] text-sand-900 opacity-0 shadow-[0_1px_4px_rgba(0,0,0,.18)] transition-opacity group-hover:opacity-100"
          aria-label="Photo suivante"
          @click.stop="setIndex(activeIndex + 1)"
        ><ChevronRight class="h-4 w-4" :stroke-width="2.2" /></button>
        <div class="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
          <button
            v-for="(url, i) in photos"
            :key="i"
            type="button"
            class="h-1.5 rounded-pill transition-[width,background-color]"
            :class="i === activeIndex ? 'w-3.5 bg-white' : 'w-1.5 bg-white/50'"
            :aria-label="`Photo ${i + 1}`"
            @click.stop="setIndex(i)"
          />
        </div>
      </template>

      <button
        type="button"
        class="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-pill bg-white/[.92] shadow-[0_1px_4px_rgba(0,0,0,.12)]"
        :aria-label="favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
        :aria-pressed="favorite"
        @click="onFavoriteClick"
      >
        <Heart class="h-4 w-4" :class="favorite ? 'fill-current text-fav' : 'text-[var(--text-secondary)]'" :stroke-width="2" />
      </button>
      <CoreBadge v-if="statusLabel" tone="onPhoto" class="absolute bottom-2.5 left-2.5 !text-clay-700">{{ statusLabel }}</CoreBadge>
    </div>
    <div class="p-4">
      <p class="m-0 truncate text-sm font-bold">{{ listing.title }}</p>
      <p class="mb-0 mt-1 flex items-center gap-1 truncate text-[12.5px] text-[var(--text-muted)]">
        <MapPin class="h-3.5 w-3.5 flex-none" :stroke-width="1.9" />
        <span class="truncate">{{ [listing.neighborhoodName, listing.cityName].filter(Boolean).join(', ') || 'Localisation non précisée' }}</span>
      </p>
      <p class="mb-0 mt-1 flex items-center gap-1 text-xs text-[var(--text-faint)]">
        <BedDouble class="h-3.5 w-3.5 flex-none" :stroke-width="1.9" />
        {{ listing.bedrooms > 0 ? `${listing.bedrooms} chambre${listing.bedrooms > 1 ? 's' : ''}` : 'Studio' }}<span v-if="listing.surface"> · {{ listing.surface }} m²</span>
      </p>
      <div class="mt-2.5 flex items-baseline justify-between gap-2">
        <p class="m-0 font-mono text-[16px] font-bold text-green-900">{{ formatFcfaShort(listing.price) }}<span v-if="priceSuffix" class="font-body text-[12px] font-semibold text-[var(--text-faint)]"> {{ priceSuffix }}</span></p>
        <span v-if="photos.length > 1" class="font-mono text-[11px] font-semibold text-[var(--text-faint)]">{{ activeIndex + 1 }}/{{ photos.length }}</span>
      </div>
    </div>
  </div>
</template>
