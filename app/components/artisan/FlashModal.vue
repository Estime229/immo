<script setup lang="ts">
const { open, title, body, close } = useArtisanFlashModal()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[420px] max-w-[calc(100vw-3rem)] rounded-2xl bg-[var(--surface-page)] p-6.5 text-center animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <div class="mx-auto grid h-14 w-14 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-2xl text-white">✓</div>
        <p class="mb-0 mt-4.5 text-lg font-bold tracking-[-.015em]">{{ title }}</p>
        <p class="mb-0 mt-2.5 text-sm leading-[1.6] text-[var(--text-muted)]">{{ body }}</p>
        <CoreButton size="lg" full-width class="mt-5.5" @click="close">Terminé</CoreButton>
      </div>
    </div>
  </Teleport>
</template>
