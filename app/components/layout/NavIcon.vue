<script setup lang="ts">
/**
 * Icônes au trait de la barre d'onglets mobile. Le reste de l'app utilise des
 * glyphes Unicode (◧, ⚒…), trop irréguliers à 24 px côte à côte : ici, un jeu
 * SVG homogène (trait 1.75, bouts arrondis), qui prend la couleur du texte.
 */
import type { NavIconName } from '~/utils/mobileNav'

defineProps<{ name: NavIconName; size?: number }>()
</script>

<template>
  <svg
    :width="size ?? 24"
    :height="size ?? 24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'search'">
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.55-4.55" />
    </template>
    <path v-else-if="name === 'heart'" d="M12 20.5s-7.5-4.4-7.5-10.1A4.4 4.4 0 0 1 8.9 6c1.4 0 2.4.6 3.1 1.6.7-1 1.7-1.6 3.1-1.6a4.4 4.4 0 0 1 4.4 4.4c0 5.7-7.5 10.1-7.5 10.1Z" />
    <template v-else-if="name === 'plus'">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </template>
    <path v-else-if="name === 'message'" d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-4 3.5v-3.5h-2a2 2 0 0 1-2-2Z" />
    <template v-else-if="name === 'user'">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.6 18.5a6 6 0 0 1 10.8 0" />
    </template>
    <path v-else-if="name === 'menu'" d="M4.5 7h15M4.5 12h15M4.5 17h15" />
    <template v-else-if="name === 'grid'">
      <rect x="4" y="4" width="6.5" height="8" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="4.5" rx="1.5" />
      <rect x="13.5" y="11.5" width="6.5" height="8.5" rx="1.5" />
      <rect x="4" y="15" width="6.5" height="5" rx="1.5" />
    </template>
    <template v-else-if="name === 'key'">
      <circle cx="8" cy="15.5" r="4.5" />
      <path d="m11.2 12.3 8.3-8.3M16.5 7l2.5 2.5M14 9.5l2 2" />
    </template>
    <template v-else-if="name === 'wallet'">
      <path d="M18.5 7.5V5.5a1.5 1.5 0 0 0-1.5-1.5H6a2 2 0 0 0 0 4h13a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 20H6a2 2 0 0 1-2-2V6" />
      <path d="M16.5 14h.01" />
    </template>
    <template v-else-if="name === 'building'">
      <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
      <path d="M10 20.5v-3.5h4v3.5M9 7.5h.01M12 7.5h.01M15 7.5h.01M9 11h.01M12 11h.01M15 11h.01M9 14h.01M15 14h.01" />
    </template>
    <template v-else-if="name === 'inbox'">
      <path d="M20.5 13h-5l-1.5 2.5h-4L8.5 13h-5" />
      <path d="M6.2 5.4 3.5 13v4.5a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V13l-2.7-7.6A1.5 1.5 0 0 0 16.4 4.5H7.6a1.5 1.5 0 0 0-1.4.9Z" />
    </template>
    <path v-else-if="name === 'wrench'" d="M14.5 6.5a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.2-3.2a5.5 5.5 0 0 1-7.3 7.3l-6.2 6.2a2 2 0 0 1-2.8-2.8l6.2-6.2a5.5 5.5 0 0 1 7.3-7.3Z" />
    <template v-else-if="name === 'calendar'">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </template>
    <template v-else-if="name === 'receipt'">
      <path d="M5.5 3.5v17l2-1.2 2 1.2 2.5-1.2 2.5 1.2 2-1.2 2 1.2v-17l-2 1.2-2-1.2-2.5 1.2-2.5-1.2-2 1.2Z" />
      <path d="M9 9h6M9 12.5h6M9 16h3.5" />
    </template>
  </svg>
</template>
