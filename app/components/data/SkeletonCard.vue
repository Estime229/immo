<script setup lang="ts">
/** Substitut de chargement — reproduit la silhouette exacte de la carte attendue. */
interface SkeletonCardProps {
  /** Hauteur du bloc image, à aligner sur la carte réelle */
  height?: number
  lines?: number
}

withDefaults(defineProps<SkeletonCardProps>(), { height: 186, lines: 2 })
</script>

<template>
  <div>
    <div
      class="animate-[im-shimmer_1.3s_linear_infinite] rounded-xl bg-[linear-gradient(90deg,var(--color-sand-200)_25%,var(--color-sand-100)_50%,var(--color-sand-200)_75%)] bg-[length:460px_100%]"
      :style="{ height: `${height}px` }"
    />
    <div
      v-for="i in lines"
      :key="i"
      class="rounded-pill"
      :class="i === 1 ? 'mt-[14px] h-[13px] w-[70%] bg-sand-200' : 'mt-[9px] h-[11px] w-[45%] bg-[#f4f0e8]'"
    />
  </div>
</template>
