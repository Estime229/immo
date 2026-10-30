<script setup lang="ts">
/**
 * Galerie en tête de fiche : grande photo + vignettes, photos du bien puis de ses logements.
 * Glisser au doigt sur mobile ; « Ouvrir l'original » pour examiner une photo en pleine taille.
 */
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff } from '@lucide/vue'
import type { PropertyPhoto } from '~/composables/useProperty'

const props = defineProps<{ photos: PropertyPhoto[]; name: string }>()

const index = ref(0)
watch(() => props.photos.length, n => { if (index.value >= n) index.value = 0 })

const current = computed(() => props.photos[index.value] ?? null)

function go(i: number) {
  const n = props.photos.length
  if (n) index.value = (i + n) % n
}

let touchStartX = 0
function onTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0]!.clientX
}
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0]!.clientX - touchStartX
  if (Math.abs(dx) > 32) go(index.value + (dx < 0 ? 1 : -1))
}

function captionOf(p: PropertyPhoto) {
  if (p.caption) return `Logement · ${p.caption}`
  return p.primary ? 'Photo principale' : 'Photo du bien'
}
</script>

<template>
  <div v-if="!photos.length" class="grid h-[180px] place-items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white text-center">
    <div>
      <ImageOff class="mx-auto h-6 w-6 text-[var(--text-faint)]" :stroke-width="1.9" />
      <p class="mb-0 mt-2 text-[13.5px] text-[var(--text-muted)]">Aucune photo pour ce bien ni pour ses logements.</p>
    </div>
  </div>

  <div v-else>
    <div
      class="group relative h-[230px] overflow-hidden rounded-2xl bg-sand-200 sm:h-[320px] xl:h-[380px]"
      @touchstart.passive="onTouchStart"
      @touchend="onTouchEnd"
      @keydown.left="go(index - 1)"
      @keydown.right="go(index + 1)"
    >
      <img
        v-if="current"
        :key="current.url"
        :src="current.url"
        :alt="`${name} — ${captionOf(current)}`"
        class="h-full w-full animate-[im-fade_.25s_ease_backwards] object-cover"
      >

      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />

      <span v-if="current" class="absolute bottom-3 left-3 max-w-[60%] truncate rounded-pill bg-white/[.94] px-3 py-1.5 text-[11.5px] font-bold text-sand-900">{{ captionOf(current) }}</span>
      <span v-if="photos.length > 1" class="absolute bottom-3 right-3 rounded-pill bg-white/[.94] px-3 py-1.5 font-mono text-[11.5px] font-bold text-sand-900">{{ index + 1 }} / {{ photos.length }}</span>

      <a
        v-if="current"
        :href="current.url"
        target="_blank"
        rel="noopener"
        class="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-pill bg-white/[.94] px-3 py-1.5 text-[12px] font-bold text-sand-900 hover:bg-white"
      >
        <ExternalLink class="h-3.5 w-3.5" :stroke-width="1.9" /> Ouvrir l'original
      </a>

      <template v-if="photos.length > 1">
        <button
          type="button"
          aria-label="Photo précédente"
          class="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-pill bg-white/[.94] text-sand-900 shadow-[0_1px_4px_rgba(0,0,0,.18)] transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          @click="go(index - 1)"
        >
          <ChevronLeft class="h-[18px] w-[18px]" :stroke-width="1.9" />
        </button>
        <button
          type="button"
          aria-label="Photo suivante"
          class="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-pill bg-white/[.94] text-sand-900 shadow-[0_1px_4px_rgba(0,0,0,.18)] transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          @click="go(index + 1)"
        >
          <ChevronRight class="h-[18px] w-[18px]" :stroke-width="1.9" />
        </button>
      </template>
    </div>

    <div v-if="photos.length > 1" class="mt-2.5 flex gap-2 overflow-x-auto pb-1">
      <button
        v-for="(p, i) in photos"
        :key="p.url"
        type="button"
        :aria-label="`Voir la photo ${i + 1} : ${captionOf(p)}`"
        :aria-current="i === index"
        class="h-[52px] w-[72px] flex-none cursor-pointer rounded-md bg-sand-200 bg-cover bg-center transition-opacity"
        :class="i === index ? 'ring-2 ring-green-600 ring-offset-2' : 'opacity-70 hover:opacity-100'"
        :style="{ backgroundImage: `url(${p.url})` }"
        @click="index = i"
      />
    </div>
  </div>
</template>
