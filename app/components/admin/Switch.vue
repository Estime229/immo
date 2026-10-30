<script setup lang="ts">
/** Interrupteur — même rendu que FormsToggle. */
defineProps<{ label?: string; modelValue?: boolean }>()
defineEmits<{ 'update:modelValue': [boolean] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    class="inline-flex cursor-pointer items-center gap-3 font-body"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span
      class="block h-[27px] w-[46px] flex-none rounded-pill p-[3px] transition-colors duration-[var(--duration-base)]"
      :class="modelValue ? 'bg-green-600' : 'bg-[var(--border-default)]'"
    >
      <span
        class="block h-[21px] w-[21px] rounded-pill bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)] transition-transform duration-[var(--duration-base)]"
        :class="modelValue ? 'translate-x-[19px]' : 'translate-x-0'"
      />
    </span>
    <span v-if="label" class="text-sm font-bold text-[var(--text-primary)]">{{ label }}</span>
  </button>
</template>
