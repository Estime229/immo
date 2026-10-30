<script setup lang="ts">
/** Puce de filtre — même rendu que FormsChip (vert clair quand appliquée). */
withDefaults(defineProps<{ selected?: boolean }>(), { selected: false })

defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-pill border px-[14px] py-2 font-body text-[13px] font-bold transition-colors duration-[var(--duration-fast)]"
    :class="selected
      ? 'border-green-100 bg-green-50 text-green-800'
      : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:bg-sand-50'"
    :aria-pressed="selected"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>
