<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'

const props = defineProps<{ page: number; pageCount: number }>()
const emit = defineEmits<{ 'update:page': [number] }>()

function goTo(p: number) {
  if (p < 1 || p > props.pageCount) return
  emit('update:page', p)
}
</script>

<template>
  <div v-if="pageCount > 1" class="flex items-center justify-center gap-3 pt-3 font-body">
    <button
      type="button"
      aria-label="Page précédente"
      class="grid h-10 w-10 cursor-pointer place-items-center rounded-pill border border-[var(--border-default)] bg-white text-[var(--text-secondary)] transition-colors hover:bg-sand-50 disabled:pointer-events-none disabled:opacity-40"
      :disabled="page <= 1"
      @click="goTo(page - 1)"
    >
      <ChevronLeft class="h-4 w-4" />
    </button>
    <span class="text-[13px] font-bold text-[var(--text-secondary)]">Page <span class="font-mono">{{ page }}</span> sur <span class="font-mono">{{ pageCount }}</span></span>
    <button
      type="button"
      aria-label="Page suivante"
      class="grid h-10 w-10 cursor-pointer place-items-center rounded-pill border border-[var(--border-default)] bg-white text-[var(--text-secondary)] transition-colors hover:bg-sand-50 disabled:pointer-events-none disabled:opacity-40"
      :disabled="page >= pageCount"
      @click="goTo(page + 1)"
    >
      <ChevronRight class="h-4 w-4" />
    </button>
  </div>
</template>
