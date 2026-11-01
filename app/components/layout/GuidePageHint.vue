<script setup lang="ts">
import { hintForPath } from '~/utils/guideHints'

/** Aide de la page courante, montée une fois par layout au-dessus du contenu. */
const route = useRoute()
const hint = computed(() => hintForPath(route.path))
</script>

<template>
  <LayoutGuideHint v-if="hint" :title="hint.title" class="mb-4.5">{{ hint.text }}</LayoutGuideHint>
</template>
