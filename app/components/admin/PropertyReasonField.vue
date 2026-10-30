<script setup lang="ts">
/**
 * Motif de suspension : puces des motifs fréquents (cumulables) puis texte libre pour préciser.
 * Posé dans le slot d'AdminInlineConfirm.
 */
const props = withDefaults(defineProps<{
  modelValue: string
  reasons: readonly string[]
  placeholder?: string
}>(), {
  // Le motif s'affiche au propriétaire sur la carte du bien suspendu (pages/pro/biens).
  placeholder: 'Précisez le motif : le propriétaire le verra dans son espace'
})

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const SEPARATOR = ' · '

const parts = computed(() => props.modelValue.split(SEPARATOR).map(s => s.trim()).filter(Boolean))

function toggle(reason: string) {
  const next = parts.value.includes(reason) ? parts.value.filter(p => p !== reason) : [...parts.value, reason]
  emit('update:modelValue', next.join(SEPARATOR))
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="r in reasons"
        :key="r"
        type="button"
        class="cursor-pointer rounded-pill border px-3 py-1.5 text-[12px] font-bold transition-colors"
        :class="parts.includes(r) ? 'border-green-100 bg-green-50 text-green-800' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:bg-sand-50'"
        :aria-pressed="parts.includes(r)"
        @click="toggle(r)"
      >{{ r }}</button>
    </div>
    <textarea
      :value="modelValue"
      rows="2"
      maxlength="500"
      :placeholder="placeholder"
      aria-label="Motif"
      class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none focus:border-green-600"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>
</template>
