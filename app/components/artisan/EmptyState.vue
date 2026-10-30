<script setup lang="ts">
import type { Component } from 'vue'

/**
 * État vide des pages artisan : pictogramme lucide dans une pastille, une phrase utile et l'action
 * qui fait sortir du vide (lien `to`, ou événement `action`). Jamais utilisé pour une erreur.
 */
const props = defineProps<{ icon: Component; title?: string; text: string; actionLabel?: string; to?: string }>()
const emit = defineEmits<{ action: [] }>()

function onAction() {
  if (props.to) navigateTo(props.to)
  else emit('action')
}
</script>

<template>
  <div class="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-5 py-10 text-center">
    <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700">
      <component :is="icon" class="h-5 w-5" :stroke-width="1.9" aria-hidden="true" />
    </div>
    <p v-if="title" class="mb-0 mt-3.5 text-[15px] font-bold">{{ title }}</p>
    <p class="mx-auto mb-0 max-w-[420px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]" :class="title ? 'mt-1.5' : 'mt-3.5'">{{ text }}</p>
    <CoreButton v-if="actionLabel" size="sm" tone="secondary" class="mt-4" @click="onAction">{{ actionLabel }}</CoreButton>
  </div>
</template>
