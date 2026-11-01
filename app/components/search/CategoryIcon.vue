<script setup lang="ts">
/**
 * Pictogramme d'une catégorie de logement (code UNIT_TYPE) : un plan vu de dessus — salon à
 * gauche, une pièce par chambre à droite, un lit dans chacune — pour que « 2 » et « 3 chambres-
 * salon » se distinguent d'un coup d'œil ; une maison pour `maison`. Trait en `currentColor`.
 */
const props = defineProps<{ code: string }>()

const BEDROOMS: Record<string, number> = { chambre_salon: 1, '2_chambres_salon': 2, '3_chambres_salon': 3, '4_chambres_salon': 4 }

interface Room { x: number; y: number; w: number; h: number }

function withBed(r: Room) {
  const width = Math.min(r.w * 0.5, 12)
  const height = Math.min(r.h * 0.45, 9)
  return { ...r, bed: { x: r.x + (r.w - width) / 2, y: r.y + (r.h - height) / 2, width, height } }
}

/** Partie droite du plan (x 28→56, y 12→52) découpée en chambres : rangées, ou 2 × 2 à partir de 4. */
const rooms = computed(() => {
  const n = BEDROOMS[props.code] ?? 0
  const cells: Room[] = n === 4
    ? [0, 1, 2, 3].map(i => ({ x: 28 + (i % 2) * 14, y: 12 + Math.floor(i / 2) * 20, w: 14, h: 20 }))
    : Array.from({ length: n }, (_, i) => ({ x: 28, y: 12 + i * (40 / n), w: 28, h: 40 / n }))
  return cells.map(withBed)
})
</script>

<template>
  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="code === 'maison'">
      <path d="M8 30 32 10l24 20" />
      <path d="M44 20v-7h5v11" />
      <path d="M14 26v28h36V26" />
      <rect x="27" y="40" width="10" height="14" fill="currentColor" fill-opacity=".14" />
      <rect x="18" y="32" width="6" height="6" />
      <rect x="40" y="32" width="6" height="6" />
    </template>

    <template v-else>
      <!-- Murs extérieurs, porte d'entrée en bas à gauche -->
      <path d="M20 52H8V12h48v40H26" />

      <template v-if="code === 'studio'">
        <rect x="12" y="16" width="16" height="6" fill="currentColor" fill-opacity=".14" />
        <circle cx="17" cy="19" r="1" fill="currentColor" />
        <circle cx="23" cy="19" r="1" fill="currentColor" />
        <rect x="36" y="26" width="14" height="18" rx="1.5" fill="currentColor" fill-opacity=".14" />
        <path d="M38 31h10" />
      </template>

      <template v-else>
        <path d="M28 12v40" />
        <!-- Canapé du salon -->
        <rect x="11" y="27" width="14" height="5" rx="1.5" />
        <rect x="11" y="32" width="14" height="5" rx="1.5" fill="currentColor" fill-opacity=".14" />
        <template v-for="(r, i) in rooms" :key="i">
          <path v-if="r.y > 12" :d="`M${r.x} ${r.y}h${r.w}`" />
          <path v-if="r.x > 28" :d="`M${r.x} ${r.y}v${r.h}`" />
          <rect v-bind="r.bed" rx="1" fill="currentColor" fill-opacity=".14" stroke-width="1.8" />
          <path :d="`M${r.bed.x} ${r.bed.y + r.bed.height * 0.38}h${r.bed.width}`" stroke-width="1.6" />
        </template>
      </template>
    </template>
  </svg>
</template>
