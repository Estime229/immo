<script setup lang="ts">
/** Pastille d'état courte, posée à côté d'un titre ou sur une photo. */
interface BadgeProps {
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'onPhoto'
  /** Ajoute la bordure du trio sémantique — recommandé sur fond blanc */
  bordered?: boolean
}

const props = withDefaults(defineProps<BadgeProps>(), { tone: 'neutral', bordered: false })

const TONE = {
  neutral: { bg: 'bg-sand-200', fg: 'text-[var(--text-secondary)]', border: 'border-transparent' },
  ok: { bg: 'bg-ok-bg', fg: 'text-ok-fg', border: 'border-ok-border' },
  warn: { bg: 'bg-warn-bg', fg: 'text-warn-fg', border: 'border-warn-border' },
  danger: { bg: 'bg-danger-bg', fg: 'text-danger-fg', border: 'border-danger-border' },
  info: { bg: 'bg-info-bg', fg: 'text-info-fg', border: 'border-info-border' },
  onPhoto: { bg: 'bg-white/[.94]', fg: 'text-green-900', border: 'border-transparent' }
} as const

const tone = computed(() => TONE[props.tone])
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-pill px-[11px] py-[5px] font-body text-label font-bold"
    :class="[tone.bg, tone.fg, bordered ? ['border', tone.border] : 'border-0']"
  ><slot /></span>
</template>
