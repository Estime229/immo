<script setup lang="ts">
/**
 * Fenêtre modale partagée par les espaces : voile flouté, carte arrondie, feuille du bas sur
 * mobile, défilement interne (le bouton d'action reste atteignable à 375 px, clavier ouvert).
 * Se ferme au ✕, à Échap et au voile — sauf si `dirty` : un formulaire entamé n'est pas perdu
 * sur un clic à côté. Remplace les coques recopiées dans chaque modale (`fixed inset-0 z-[90]…`).
 */
import { X } from '@lucide/vue'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  /** Largeur max sur tablette/ordinateur. */
  width?: string
  /** Formulaire modifié : le voile ne ferme plus, seul ✕ ou Annuler le font. */
  dirty?: boolean
}>(), { width: '520px', dirty: false })

const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !props.dirty) emit('close')
}

watch(() => props.open, isOpen => {
  if (!import.meta.client) return
  document.documentElement.style.overflow = isOpen ? 'hidden' : ''
  if (isOpen) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
}, { immediate: true })

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
      class="fixed inset-0 z-[90] flex animate-[im-veil_.22s_ease_both] items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-6"
      @click.self="!dirty && emit('close')"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="title || undefined"
        class="flex max-h-[calc(100dvh-1.5rem)] w-full animate-[im-rise_.25s_var(--ease-standard)_both] flex-col rounded-t-3xl bg-white font-body shadow-overlay sm:max-h-[85vh] sm:rounded-2xl"
        :style="{ maxWidth: `min(${width}, 100vw)` }"
      >
        <div class="flex items-center justify-between gap-3 px-6 pb-2 pt-5">
          <h2 class="m-0 font-display text-[20px] font-bold tracking-[-.02em] text-[var(--text-primary)]">{{ title }}</h2>
          <button
            type="button"
            aria-label="Fermer"
            class="grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-pill bg-sand-100 text-[var(--text-secondary)] hover:bg-sand-200"
            @click="emit('close')"
          >
            <X class="h-[18px] w-[18px]" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-6 pb-5 pt-2">
          <slot />
        </div>
        <div v-if="$slots.footer" class="border-t border-[var(--border-subtle)] px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
