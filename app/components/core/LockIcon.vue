<script setup lang="ts">
/** Cadenas des actions réservées aux comptes vérifiés — hérite de la couleur du texte. */
withDefaults(defineProps<{ size?: number }>(), { size: 13 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 16 16" fill="none" aria-hidden="true" class="inline-block flex-none align-[-2px]">
    <rect x="3" y="7" width="10" height="7.5" rx="1.8" fill="currentColor" />
    <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
  </svg>
</template>
