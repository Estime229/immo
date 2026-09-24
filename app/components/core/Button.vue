<script setup lang="ts">
/** Bouton d'action Immo. */
interface ButtonProps {
  /** primary = dégradé vert (une seule par vue) ; accent = terracotta ; secondary = contour ; danger = impayé/litige ; ghost = tertiaire */
  tone?: 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  /** Force le rayon pilule — obligatoire dans les barres de filtres et les en-têtes */
  pill?: boolean
  disabled?: boolean
  fullWidth?: boolean
}

const props = withDefaults(defineProps<ButtonProps>(), {
  tone: 'primary',
  size: 'md',
  pill: false,
  disabled: false,
  fullWidth: false
})

const TONE = {
  primary: 'bg-[image:var(--action-primary)] text-white shadow-action',
  accent: 'bg-clay-500 text-white shadow-accent',
  secondary: 'bg-white text-sand-900 border border-[var(--border-default)] shadow-none',
  danger: 'bg-danger-fg text-white shadow-none',
  ghost: 'bg-transparent text-[var(--text-secondary)] shadow-none'
} as const

const SIZE = {
  sm: { text: 'text-[13px]', pad: 'px-4 py-[9px]', radius: 'rounded-pill' },
  md: { text: 'text-[14px]', pad: 'px-5 py-3', radius: 'rounded-md' },
  lg: { text: 'text-[16px]', pad: 'px-7 py-4', radius: 'rounded-md' }
} as const
</script>

<template>
  <button
    :disabled="disabled"
    class="whitespace-nowrap font-body font-bold transition-[transform,box-shadow] duration-[var(--duration-fast)]"
    :class="[
      TONE[tone],
      SIZE[size].text,
      SIZE[size].pad,
      pill ? 'rounded-pill' : SIZE[size].radius,
      fullWidth ? 'w-full' : 'w-auto',
      disabled ? 'cursor-not-allowed opacity-[.45]' : 'cursor-pointer'
    ]"
  ><slot /></button>
</template>
