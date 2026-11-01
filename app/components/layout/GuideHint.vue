<script setup lang="ts">
import { Lightbulb } from '@lucide/vue'

/** Petite explication visible seulement en mode guide : `<LayoutGuideHint title="…">texte</LayoutGuideHint>`. */
defineProps<{ title?: string }>()
const { enabled } = useGuideMode()
</script>

<template>
  <aside v-if="enabled" class="flex items-start gap-2.5 rounded-md border border-info-border bg-info-bg px-3.5 py-2.5 text-[12.5px] leading-[1.55] text-info-fg-deep" role="note">
    <Lightbulb class="mt-0.5 h-4 w-4 flex-none" :stroke-width="1.9" aria-hidden="true" />
    <p class="m-0 min-w-0"><strong v-if="title" class="font-bold">{{ title }} · </strong><slot /></p>
  </aside>
</template>
