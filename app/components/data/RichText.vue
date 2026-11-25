<script setup lang="ts">
import { parseRichText, type RichLine } from '~/utils/richText'

/**
 * Texte libre saisi par un propriétaire (description d'annonce), mis en forme
 * sans `v-html` : `parseRichText` renvoie une structure (paragraphes, puces,
 * gras, italique) et chaque morceau est interpolé, donc échappé par Vue.
 */
const props = defineProps<{ text: string }>()

const blocks = computed(() => parseRichText(props.text))

/** Clé stable d'une ligne : son texte brut (pour `v-for` dans une même liste). */
function lineKey(line: RichLine, index: number) {
  return `${index}:${line.map(s => s.text).join('')}`
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <template v-for="(block, bi) in blocks" :key="bi">
      <p v-if="block.type === 'heading'" class="mb-0 mt-1 font-bold text-[var(--text-primary)]">
        <DataRichTextLine :line="block.line" />
      </p>
      <ul v-else-if="block.type === 'list'" class="m-0 flex list-disc flex-col gap-1 pl-5 marker:text-green-600">
        <li v-for="(item, ii) in block.items" :key="lineKey(item, ii)"><DataRichTextLine :line="item" /></li>
      </ul>
      <p v-else class="m-0">
        <template v-for="(line, li) in block.lines" :key="lineKey(line, li)">
          <br v-if="li > 0"><DataRichTextLine :line="line" />
        </template>
      </p>
    </template>
  </div>
</template>
