<script setup lang="ts">
/**
 * État vide des pages de gestion pro : pastille d'icône, une phrase utile et
 * l'action qui fait sortir du vide (slot). Une erreur ne passe jamais par ici :
 * elle a son bandeau `FeedbackAlertBanner` avec « Réessayer ».
 */
import type { Component } from 'vue'

withDefaults(defineProps<{
  icon: Component
  title: string
  text?: string
  /** `compact` : dans une carte (moins de marge, sans bordure propre). */
  compact?: boolean
}>(), { compact: false })
</script>

<template>
  <div
    class="text-center font-body"
    :class="compact ? 'px-4 py-7' : 'rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-6 py-10'"
  >
    <span class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700">
      <component :is="icon" class="h-5 w-5" :stroke-width="1.9" />
    </span>
    <p class="mb-0 mt-3.5 text-[15px] font-bold text-[var(--text-primary)]">{{ title }}</p>
    <p v-if="text" class="mx-auto mb-0 mt-1.5 max-w-[440px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">{{ text }}</p>
    <div v-if="$slots.default" class="mt-4.5 flex flex-wrap justify-center gap-2.5">
      <slot />
    </div>
  </div>
</template>
