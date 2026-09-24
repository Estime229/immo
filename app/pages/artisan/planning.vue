<script setup lang="ts">
definePageMeta({ layout: 'artisan' })

const modal = useArtisanModal()

const PLANNING = [
  { day: 'Lundi', date: '8 sept.', free: false, slots: [{ time: '09:00 · 1 h', title: 'Fuite lavabo — A2', place: 'Résidence Étoile', accent: 'var(--color-info-fg)' }] },
  { day: 'Mardi', date: '9 sept.', free: false, slots: [
    { time: '08:00 · 2 h', title: 'Chauffe-eau — B1', place: 'Résidence Étoile', accent: 'var(--color-clay-500)' },
    { time: '14:00 · 1 h', title: 'Débouchage — Cocotiers', place: 'Les Cocotiers', accent: 'var(--color-green-600)' }
  ] },
  { day: 'Mercredi', date: '10 sept.', free: true, slots: [] },
  { day: 'Jeudi', date: '11 sept.', free: false, slots: [{ time: '10:00 · 1 h 30', title: 'Robinetterie — Godomey', place: 'Godomey', accent: 'var(--color-info-fg)' }] },
  { day: 'Vendredi', date: '12 sept.', free: true, slots: [] }
]
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-4 flex items-center justify-between">
      <p class="m-0 text-[15px] font-bold">Semaine du 8 au 14 septembre</p>
      <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold" @click="modal = 'bloquer'">+ Bloquer une plage</button>
    </div>

    <div v-for="d in PLANNING" :key="d.day" class="mb-2.5 rounded-xl border border-[var(--border-subtle)] bg-white px-4.5 py-4">
      <div class="mb-3 flex items-center gap-3" :class="d.slots.length === 0 ? 'mb-0' : ''">
        <span class="text-sm font-bold">{{ d.day }}</span>
        <span class="text-[12.5px] text-[var(--text-faint)]">{{ d.date }}</span>
      </div>
      <div
        v-for="sl in d.slots"
        :key="sl.title"
        class="mb-2 flex items-center gap-3.5 rounded-md bg-[var(--surface-page)] p-2.5"
        :style="{ borderLeft: `3px solid ${sl.accent}` }"
      >
        <span class="min-w-[96px] font-mono text-[13px] font-bold">{{ sl.time }}</span>
        <div class="flex-1">
          <p class="m-0 text-[13.5px] font-semibold">{{ sl.title }}</p>
          <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ sl.place }}</p>
        </div>
        <button type="button" class="whitespace-nowrap rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[11.5px] font-bold">+ Calendrier</button>
      </div>
      <p v-if="d.free" class="m-0 px-0.5 text-[12.5px] text-[var(--text-faint)]">Aucune intervention</p>
    </div>
  </div>
</template>
