<script setup lang="ts">
/** Critère de recherche affiché et retirable — le retour visible de la recherche en langage naturel. */
interface ChipProps {
  /** Vert clair = critère appliqué */
  active?: boolean
  /** Affiche la croix de suppression */
  removable?: boolean
}

withDefaults(defineProps<ChipProps>(), { active: false, removable: false })
const emit = defineEmits<{ remove: []; click: [] }>()
</script>

<template>
  <span
    class="inline-flex cursor-pointer items-center gap-[9px] rounded-pill border px-[14px] py-2 font-body text-[13.5px] font-bold"
    :class="active ? 'border-green-100 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
    @click="emit('click')"
  >
    <slot />
    <span v-if="removable" class="cursor-pointer text-xs text-sand-600" @click.stop="emit('remove')">✕</span>
  </span>
</template>
