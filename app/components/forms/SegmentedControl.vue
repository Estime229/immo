<script setup lang="ts">
/** Bascule entre deux ou trois vues d'un même contenu (Liste/Carte, Longue/Courte durée). */
interface SegmentedOption {
  value: string
  label: string
}
interface SegmentedControlProps {
  options: Array<string | SegmentedOption>
  modelValue: string
  size?: 'sm' | 'md'
}

withDefaults(defineProps<SegmentedControlProps>(), { size: 'md' })
defineEmits<{ 'update:modelValue': [value: string] }>()

function optionValue(o: string | SegmentedOption) {
  return typeof o === 'string' ? o : o.value
}
function optionLabel(o: string | SegmentedOption) {
  return typeof o === 'string' ? o : o.label
}
</script>

<template>
  <div class="inline-flex gap-1 rounded-pill bg-[var(--surface-sunken)] p-1">
    <button
      v-for="o in options"
      :key="optionValue(o)"
      type="button"
      class="rounded-pill font-body font-bold transition-all duration-[var(--duration-base)]"
      :class="[
        size === 'sm' ? 'px-4 py-2 text-[12.5px]' : 'px-5 py-[10px] text-[13.5px]',
        optionValue(o) === modelValue ? 'bg-white text-green-900 shadow-[0_2px_8px_rgba(26,23,20,.12)]' : 'bg-transparent text-[var(--text-secondary)]'
      ]"
      @click="$emit('update:modelValue', optionValue(o))"
    >{{ optionLabel(o) }}</button>
  </div>
</template>
