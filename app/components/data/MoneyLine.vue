<script setup lang="ts">
/** Ligne d'un décompte de prix ou d'un relevé. */
interface MoneyLineProps {
  label: string
  /** Montant pré-formaté, avec signe pour un mouvement */
  value: string
  tone?: 'default' | 'credit' | 'debit'
  /** Dernière ligne : filet au-dessus, corps gras */
  total?: boolean
}

const props = withDefaults(defineProps<MoneyLineProps>(), { tone: 'default', total: false })

const TONE_COLOR = {
  credit: 'text-ok-fg',
  debit: 'text-danger-fg'
} as const
</script>

<template>
  <div
    class="flex justify-between font-mono"
    :class="[
      total ? 'mt-[7px] border-t border-[var(--border-subtle)] pt-[11px] text-[15px] font-bold' : 'py-[6px] text-[13px] font-normal',
      props.tone === 'default' ? (total ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]') : TONE_COLOR[props.tone]
    ]"
  >
    <span>{{ label }}</span><span>{{ value }}</span>
  </div>
</template>
