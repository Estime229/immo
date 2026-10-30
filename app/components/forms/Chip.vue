<script setup lang="ts">
import { X } from '@lucide/vue'

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
    <button v-if="removable" type="button" aria-label="Retirer ce critère" class="-mr-1 grid h-5 w-5 cursor-pointer place-items-center rounded-pill text-sand-600 hover:bg-sand-200" @click.stop="emit('remove')"><X class="h-3.5 w-3.5" /></button>
  </span>
</template>
