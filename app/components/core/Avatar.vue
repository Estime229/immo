<script setup lang="ts">
/** Pastille d'initiales, ou photo si `avatarUrl` est fourni (voir `useUserApi().uploadAvatar`). */
interface AvatarProps {
  /** Nom complet ; les deux premières initiales sont extraites */
  name: string
  /** Diamètre en px (34 en liste, 40 en fil de discussion, 52 en fiche) */
  size?: number
  /** Force la couleur ; sinon dérivée du nom */
  color?: string
  /** Photo de profil (`avatar_url`) — absente ou en échec de chargement : repli sur les initiales. */
  avatarUrl?: string | null
}

const props = withDefaults(defineProps<AvatarProps>(), { size: 40 })

const PALETTE = ['var(--color-green-600)', 'var(--color-clay-500)', 'var(--color-info-fg)', '#8a2440', 'var(--color-sand-800)']

const initials = computed(() =>
  props.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
)
const background = computed(() => props.color || PALETTE[props.name.length % PALETTE.length])
const fontSize = computed(() => Math.round(props.size * 0.32))

const imgFailed = ref(false)
watch(() => props.avatarUrl, () => { imgFailed.value = false })
</script>

<template>
  <div class="flex-none overflow-hidden rounded-pill" :style="{ width: `${size}px`, height: `${size}px` }">
    <img v-if="avatarUrl && !imgFailed" :src="avatarUrl" :alt="name" class="h-full w-full object-cover" @error="imgFailed = true">
    <div v-else class="grid h-full w-full place-items-center font-body font-bold text-white" :style="{ background, fontSize: `${fontSize}px` }">{{ initials }}</div>
  </div>
</template>
