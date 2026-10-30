<script setup lang="ts">
/**
 * Bouton de l'espace admin — même rendu que CoreButton (dégradé vert, terracotta, contour…),
 * avec en plus `loading` et `type`, dont les écrans admin ont besoin.
 */
import { LoaderCircle } from '@lucide/vue'

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const props = withDefaults(defineProps<{
  /** primary = action principale (une par vue) ; accent = terracotta ; secondary = contour ; danger = destructif ; ghost = tertiaire */
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit'
}>(), {
  variant: 'primary',
  size: 'md',
  fullWidth: false,
  disabled: false,
  loading: false,
  type: 'button'
})

defineEmits<{ click: [MouseEvent] }>()

const VARIANT: Record<Variant, string> = {
  primary: 'bg-[image:var(--action-primary)] text-white shadow-action',
  accent: 'bg-clay-500 text-white shadow-accent',
  secondary: 'border border-[var(--border-default)] bg-white text-sand-900 hover:bg-sand-50',
  ghost: 'bg-transparent text-green-700 hover:bg-green-50',
  danger: 'bg-danger-fg text-white'
}

const SIZE: Record<Size, string> = {
  sm: 'h-9 gap-1.5 rounded-pill px-4 text-[13px]',
  md: 'h-11 gap-2 rounded-md px-5 text-[14px]',
  lg: 'h-[52px] gap-2 rounded-md px-7 text-[15.5px]'
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="inline-flex cursor-pointer items-center justify-center whitespace-nowrap font-body font-bold transition-[transform,box-shadow,background-color] duration-[var(--duration-fast)] active:scale-[.98] disabled:pointer-events-none disabled:opacity-[.45]"
    :class="[VARIANT[props.variant], SIZE[props.size], fullWidth ? 'w-full' : '']"
    @click="$emit('click', $event)"
  >
    <LoaderCircle v-if="loading" class="h-4 w-4 shrink-0 animate-spin" />
    <slot />
  </button>
</template>
