<script setup lang="ts">
/** Pastille d'état — même rendu que CoreBadge (pilule, capitales légères, bordure du trio sémantique). */
type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const props = withDefaults(defineProps<{ tone?: Tone }>(), { tone: 'primary' })

const TONE: Record<Tone, string> = {
  primary: 'border-green-100 bg-green-50 text-green-800',
  success: 'border-ok-border bg-ok-bg text-ok-fg',
  warning: 'border-warn-border bg-warn-bg text-warn-fg',
  danger: 'border-danger-border bg-danger-bg text-danger-fg',
  info: 'border-info-border bg-info-bg text-info-fg',
  neutral: 'border-transparent bg-sand-200 text-[var(--text-secondary)]'
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-[11px] py-[4px] font-body text-label font-bold"
    :class="TONE[props.tone]"
  >
    <slot />
  </span>
</template>
