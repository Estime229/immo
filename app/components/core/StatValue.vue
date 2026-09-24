<script setup lang="ts">
/** Couple étiquette + montant : le bloc de donnée chiffrée d'Immo. */
interface StatValueProps {
  /** Étiquette en capitales espacées */
  label: string
  /** Valeur — toujours pré-formatée avec espaces milliers et « F » ou « FCFA » */
  value: string
  hint?: string
  /** locked = terracotta (fonds immobilisés) ; danger = impayé ; onDark = sur carte de solde */
  tone?: 'default' | 'locked' | 'danger' | 'onDark'
}

const props = withDefaults(defineProps<StatValueProps>(), { tone: 'default' })

const VALUE_COLOR = {
  default: 'text-[var(--text-primary)]',
  locked: 'text-[var(--text-money-locked)]',
  danger: 'text-danger-fg',
  onDark: 'text-white'
} as const
</script>

<template>
  <div class="font-body">
    <p
      class="m-0 text-label font-bold tracking-label uppercase"
      :class="tone === 'onDark' ? 'text-white/[.58]' : 'text-[var(--text-faint)]'"
    >{{ label }}</p>
    <p class="mb-0 mt-[11px] font-mono text-[26px] font-bold tracking-[-.02em]" :class="VALUE_COLOR[props.tone]">{{ value }}</p>
    <p
      v-if="hint"
      class="mb-0 mt-2 text-caption"
      :class="tone === 'onDark' ? 'text-white/[.75]' : 'text-[var(--text-muted)]'"
    >{{ hint }}</p>
  </div>
</template>
