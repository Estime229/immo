<script setup lang="ts">
/** Liste déroulante des barres de filtres. */
interface SelectOption {
  value: string
  label: string
}
interface SelectProps {
  label?: string
  /** Chaînes simples, ou objets {value,label} */
  options?: Array<string | SelectOption>
  /** Première option neutre, ex. « Tous les quartiers » */
  placeholder?: string
  modelValue?: string
}

withDefaults(defineProps<SelectProps>(), { options: () => [] })
defineEmits<{ 'update:modelValue': [value: string] }>()

function optionValue(o: string | SelectOption) {
  return typeof o === 'string' ? o : o.value
}
function optionLabel(o: string | SelectOption) {
  return typeof o === 'string' ? o : o.label
}
</script>

<template>
  <label class="block font-body">
    <span v-if="label" class="mb-[7px] block text-[12.5px] font-bold">{{ label }}</span>
    <select
      :value="modelValue"
      class="h-[44px] rounded-sm border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-[13.5px] text-sand-900 outline-none"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-if="placeholder" value="">{{ placeholder }}</option>
      <option v-for="o in options" :key="optionValue(o)" :value="optionValue(o)">{{ optionLabel(o) }}</option>
    </select>
  </label>
</template>
