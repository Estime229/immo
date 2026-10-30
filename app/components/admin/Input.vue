<script setup lang="ts">
/** Champ texte admin — même rendu que FormsInput (fond crème, bordure sable). */
withDefaults(defineProps<{
  label?: string
  placeholder?: string
  type?: string
  error?: string
  modelValue?: string
  disabled?: boolean
}>(), {
  type: 'text',
  disabled: false
})

defineEmits<{ 'update:modelValue': [string] }>()

const id = useId()
</script>

<template>
  <label :for="id" class="block w-full font-body">
    <span v-if="label" class="mb-[7px] block text-[12.5px] font-bold text-[var(--text-primary)]">{{ label }}</span>
    <input
      :id="id"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :value="modelValue"
      class="h-[46px] w-full rounded-md border bg-[var(--surface-input)] px-[15px] text-[14.5px] text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-[var(--duration-fast)] placeholder:text-[var(--text-faint)] focus:border-green-600 focus:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-50"
      :class="error ? 'border-danger-border' : 'border-[var(--border-default)]'"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
    <span v-if="error" class="mt-[7px] block text-[12.5px] text-danger-fg">{{ error }}</span>
  </label>
</template>
