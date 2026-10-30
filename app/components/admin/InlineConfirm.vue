<script setup lang="ts">
/**
 * Confirmation en ligne, posée à l'endroit de l'action — le principe des espaces Immo
 * (fin de mandat, suppression de compte) plutôt qu'une modale qui coupe le contexte.
 * Une phrase qui dit ce qui va se passer, puis Confirmer / Non. Le slot accueille un
 * champ quand l'action en demande un (motif, référence de virement…).
 */
type Tone = 'warning' | 'danger'

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
  danger: { box: 'border-danger-border bg-danger-bg', fg: 'text-danger-fg-deep' }
}
</script>

<template>
  <div class="animate-[im-fade_.2s_ease_backwards] rounded-md border px-3.5 py-3 font-body" :class="TONE[tone].box" role="alertdialog" :aria-label="message">
    <div class="flex flex-wrap items-center gap-2.5">
      <p class="m-0 min-w-[180px] flex-1 text-[13px] font-semibold leading-[1.45]" :class="TONE[tone].fg">{{ message }}</p>
      <div class="flex flex-none gap-2">
        <AdminButton size="sm" :variant="tone === 'danger' ? 'danger' : 'primary'" :loading="loading" :disabled="disabled" @click="emit('confirm')">{{ confirmLabel }}</AdminButton>
        <AdminButton size="sm" variant="secondary" :disabled="loading" @click="emit('cancel')">{{ cancelLabel }}</AdminButton>
      </div>
    </div>
    <div v-if="$slots.default" class="mt-2.5">
      <slot />
    </div>
  </div>
</template>
