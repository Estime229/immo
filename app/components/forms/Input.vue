<script setup lang="ts">
/** Champ texte Immo — fond crème, bordure sable, jamais de fond blanc pur. */
interface InputProps {
  label?: string
  hint?: string
  invalid?: boolean
  /** Space Mono — pour montants, numéros Mobile Money, références */
  mono?: boolean
  modelValue?: string
  type?: string
  placeholder?: string
}

withDefaults(defineProps<InputProps>(), { invalid: false, mono: false, type: 'text' })
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="block font-body">
    <span v-if="label" class="mb-[7px] block text-[12.5px] font-bold">{{ label }}</span>
    <input
      :type="type"
      :placeholder="placeholder"
      :value="modelValue"
      class="h-[46px] w-full rounded-md border bg-[var(--surface-input)] px-[15px] text-[14.5px] text-[var(--text-primary)] outline-none"
      :class="[invalid ? 'border-danger-border' : 'border-[var(--border-default)]', mono ? 'font-mono' : 'font-body']"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span
      v-if="hint"
      class="mt-[7px] block text-[12.5px]"
      :class="invalid ? 'text-danger-fg' : 'text-[var(--text-faint)]'"
    >{{ hint }}</span>
  </label>
</template>
