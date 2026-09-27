<script setup lang="ts">
/**
 * Feuille qui monte du bas de l'écran — remplace, sur mobile, les menus
 * déroulants accrochés à l'en-tête ; sur tablette (sm+), carte flottante
 * centrée de 560px plutôt qu'une feuille pleine largeur. Se ferme au voile, à
 * Échap, au ✕, ou en la tirant vers le bas par sa poignée (comme une feuille
 * native iOS/Android).
 *
 * Le glissé passe par la propriété CSS `translate`, pas `transform` :
 * l'animation d'entrée (`im-sheet-up`, remplissage `both`) garde la main sur
 * `transform`, qu'un style en ligne ne pourrait pas surcharger.
 */
const open = defineModel<boolean>('open', { required: true })
defineProps<{ title?: string }>()

const DISMISS_DISTANCE = 90
const dragY = ref(0)
const dragging = ref(false)
let startY = 0

function onDragStart(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button, a, input, select')) return
  dragging.value = true
  startY = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onDragMove(e: PointerEvent) {
  if (dragging.value) dragY.value = Math.max(0, e.clientY - startY)
}
function onDragEnd() {
  if (!dragging.value) return
  dragging.value = false
  if (dragY.value > DISMISS_DISTANCE) open.value = false
  dragY.value = 0
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

/** Le fond ne défile pas sous la feuille ouverte. */
watch(open, isOpen => {
  if (!import.meta.client) return
  document.documentElement.style.overflow = isOpen ? 'hidden' : ''
  if (isOpen) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.documentElement.style.overflow = ''
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[92] flex animate-[im-veil_.22s_ease_both] items-end bg-black/45 backdrop-blur-[2px] sm:px-4 sm:pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden"
      @click="open = false"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        class="mx-auto flex max-h-[92dvh] w-full animate-[im-sheet-up_.36s_var(--ease-standard)_both] flex-col overflow-hidden rounded-t-[28px] bg-[var(--surface-page)] shadow-overlay sm:max-h-[85dvh] sm:max-w-[560px] sm:rounded-[28px]"
        :style="{ translate: `0 ${dragY}px`, transition: dragging ? 'none' : 'translate .25s var(--ease-standard)' }"
        @click.stop
      >
        <div
          class="flex-none touch-none select-none px-5 pb-2 pt-2.5"
          @pointerdown="onDragStart"
          @pointermove="onDragMove"
          @pointerup="onDragEnd"
          @pointercancel="onDragEnd"
        >
          <div class="mx-auto h-[5px] w-11 rounded-pill bg-sand-400" />
          <div v-if="title" class="mt-3 flex items-center justify-between gap-3">
            <h2 class="m-0 font-display text-[21px] font-bold tracking-[-.025em]">{{ title }}</h2>
            <button
              type="button"
              class="grid h-9 w-9 flex-none place-items-center rounded-pill bg-sand-200 text-sand-800 transition-colors hover:bg-sand-300"
              aria-label="Fermer"
              @click="open = false"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
