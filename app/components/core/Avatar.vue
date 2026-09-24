<script setup lang="ts">
/** Pastille d'initiales — Immo n'utilise pas de photo de profil. */
interface AvatarProps {
  /** Nom complet ; les deux premières initiales sont extraites */
  name: string
  /** Diamètre en px (34 en liste, 40 en fil de discussion, 52 en fiche) */
  size?: number
  /** Force la couleur ; sinon dérivée du nom */
  color?: string
}

const props = withDefaults(defineProps<AvatarProps>(), { size: 40 })

const PALETTE = ['var(--color-green-600)', 'var(--color-clay-500)', 'var(--color-info-fg)', '#8a2440', 'var(--color-sand-800)']

const initials = computed(() =>
  props.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
)
const background = computed(() => props.color || PALETTE[props.name.length % PALETTE.length])
const fontSize = computed(() => Math.round(props.size * 0.32))
</script>

<template>
  <div
    class="grid flex-none place-items-center rounded-pill font-body font-bold text-white"
    :style="{ width: `${size}px`, height: `${size}px`, background, fontSize: `${fontSize}px` }"
  >{{ initials }}</div>
</template>
