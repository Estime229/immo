<script setup lang="ts">
import type { RichLine } from '~/utils/richText'

/** Une ligne de `DataRichText` : chaque morceau est interpolé (échappé), jamais injecté en HTML. */
defineProps<{ line: RichLine }>()
</script>

<template>
  <template v-for="(span, i) in line" :key="i">
    <strong v-if="span.bold && span.italic" class="font-bold text-[var(--text-primary)]"><em>{{ span.text }}</em></strong>
    <strong v-else-if="span.bold" class="font-bold text-[var(--text-primary)]">{{ span.text }}</strong>
    <em v-else-if="span.italic">{{ span.text }}</em>
    <template v-else>{{ span.text }}</template>
  </template>
</template>
