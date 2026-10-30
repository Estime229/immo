<script setup lang="ts">
/**
 * Confirmation à deux temps, posée à l'endroit de l'action (fin de mandat, retrait, paiement…) :
 * une phrase qui dit la conséquence concrète, puis Confirmer / Non. Le slot accueille un champ
 * quand l'action en demande un (motif, numéro…). Même patron que AdminInlineConfirm.
 */
type Tone = 'warning' | 'danger' | 'neutral'

withDefaults(defineProps<{
  message: string
  tone?: Tone
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  /** Bloque « Confirmer » tant qu'un champ obligatoire du slot est vide. */
  disabled?: boolean
}>(), {
  tone: 'warning',
  confirmLabel: 'Confirmer',
  cancelLabel: 'Non',
  loading: false,
  disabled: false
})

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const TONE: Record<Tone, { box: string; fg: string }> = {
  warning: { box: 'border-warn-border bg-warn-bg', fg: 'text-warn-fg-deep' },
  danger: { box: 'border-danger-border bg-danger-bg', fg: 'text-danger-fg-deep' },
  neutral: { box: 'border-[var(--border-default)] bg-[var(--surface-page)]', fg: 'text-[var(--text-primary)]' }
}
</script>

<template>
  <div class="animate-[im-fade_.2s_ease_backwards] rounded-md border px-3.5 py-3 font-body" :class="TONE[tone].box" role="alertdialog" :aria-label="message">
    <div class="flex flex-wrap items-center gap-2.5">
      <p class="m-0 min-w-[180px] flex-1 text-[13px] font-semibold leading-[1.45]" :class="TONE[tone].fg">{{ message }}</p>
      <div class="flex flex-none gap-2">
        <CoreButton size="sm" :tone="tone === 'danger' ? 'danger' : 'primary'" :disabled="disabled || loading" @click="emit('confirm')">{{ loading ? '…' : confirmLabel }}</CoreButton>
        <CoreButton size="sm" tone="secondary" :disabled="loading" @click="emit('cancel')">{{ cancelLabel }}</CoreButton>
      </div>
    </div>
    <div v-if="$slots.default" class="mt-2.5">
      <slot />
    </div>
  </div>
</template>
