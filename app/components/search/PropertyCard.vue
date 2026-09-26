<script setup lang="ts">
import type { ListingCard } from '~/utils/propertyListing'

const props = defineProps<{ listing: ListingCard; favorite: boolean; priceSuffix?: string }>()
const emit = defineEmits<{ open: []; favorite: []; hover: []; unhover: [] }>()

const STATUS_LABEL: Record<string, string> = {
  available: '',
  notice_given: 'Disponible bientôt',
  coming_soon: 'Bientôt disponible'
}
const statusLabel = computed(() => STATUS_LABEL[props.listing.status] ?? '')

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
    class="group cursor-pointer overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white transition-shadow hover:shadow-card"
    :class="{ 'opacity-70': listing.virtual }"
    @click="!listing.virtual && emit('open')"
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

      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/30 to-transparent" />

      <template v-if="photos.length > 1">
        <button
          type="button"
          class="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-pill bg-white/[.9] text-[13px] text-sand-900 opacity-0 shadow-[0_1px_4px_rgba(0,0,0,.18)] transition-opacity group-hover:opacity-100"
          @click.stop="setIndex(activeIndex - 1)"
        >‹</button>
        <button
          type="button"
          class="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-pill bg-white/[.9] text-[13px] text-sand-900 opacity-0 shadow-[0_1px_4px_rgba(0,0,0,.18)] transition-opacity group-hover:opacity-100"
          @click.stop="setIndex(activeIndex + 1)"
        >›</button>
        <div class="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
          <button
            v-for="(url, i) in photos"
            :key="i"
            type="button"
            class="h-1.5 rounded-pill transition-[width,background-color]"
            :class="i === activeIndex ? 'w-3.5 bg-white' : 'w-1.5 bg-white/50'"
            @click.stop="setIndex(i)"
          />
        </div>
      </template>

      <button type="button" class="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-pill bg-white/[.92]" @click="onFavoriteClick">
        <span class="text-[15px] leading-none" :class="favorite ? 'text-fav' : 'text-[var(--text-secondary)]'">♥</span>
      </button>
      <span v-if="statusLabel" class="absolute bottom-2.5 left-2.5 rounded-pill bg-white/[.94] px-3 py-1.5 text-[11.5px] font-bold text-clay-700">{{ statusLabel }}</span>
    </div>
    <div class="p-4">
      <p class="m-0 truncate text-[14.5px] font-bold">{{ listing.title }}</p>
      <p class="mb-0 mt-1 text-[12.5px] text-[var(--text-muted)]">
        {{ [listing.neighborhoodName, listing.cityName].filter(Boolean).join(', ') || 'Localisation non précisée' }}
      </p>
      <p class="mb-0 mt-1 text-[12.5px] text-[var(--text-faint)]">
        {{ listing.bedrooms > 0 ? `${listing.bedrooms} chambre${listing.bedrooms > 1 ? 's' : ''}` : 'Studio' }}<span v-if="listing.surface"> · {{ listing.surface }} m²</span>
      </p>
      <div class="mt-2.5 flex items-baseline justify-between">
        <p class="m-0 font-mono text-[16px] font-bold text-green-900">{{ formatFcfaShort(listing.price) }}<span v-if="priceSuffix" class="font-body text-[12px] font-semibold text-[var(--text-faint)]"> {{ priceSuffix }}</span></p>
        <span v-if="photos.length > 1" class="text-[11px] font-semibold text-[var(--text-faint)]">{{ activeIndex + 1 }}/{{ photos.length }}</span>
      </div>
    </div>
  </div>
</template>
