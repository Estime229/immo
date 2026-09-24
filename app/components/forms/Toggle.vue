<script setup lang="ts">
/** Interrupteur — un réglage qui s'applique immédiatement, sans bouton Enregistrer. */
interface ToggleProps {
  modelValue?: boolean
  label?: string
  /** Conséquence concrète du réglage, pas une paraphrase du libellé */
  hint?: string
}

withDefaults(defineProps<ToggleProps>(), { modelValue: false })
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const KNOB = 21
const TRACK = 46
</script>

<template>
  <label
    class="flex cursor-pointer items-center justify-between gap-4 font-body"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span v-if="label || hint">
      <span v-if="label" class="block text-sm font-bold">{{ label }}</span>
      <span v-if="hint" class="mt-[3px] block text-[12.5px] text-[var(--text-muted)]">{{ hint }}</span>
    </span>
    <span
      class="block h-[27px] w-[46px] flex-none rounded-pill p-[3px] transition-colors duration-[var(--duration-base)]"
      :class="modelValue ? 'bg-green-600' : 'bg-[var(--border-default)]'"
    >
      <span
        class="block h-[21px] w-[21px] rounded-pill bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)] transition-transform duration-[var(--duration-base)]"
        :style="{ transform: modelValue ? `translateX(${TRACK - KNOB - 6}px)` : 'translateX(0)' }"
      />
    </span>
  </label>
</template>
