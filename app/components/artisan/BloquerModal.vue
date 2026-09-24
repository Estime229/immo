<script setup lang="ts">
const modal = useArtisanModal()
const open = computed(() => modal.value === 'bloquer')
const step = ref<'form' | 'done'>('form')

watch(open, v => {
  if (v) step.value = 'form'
})

function close() {
  modal.value = ''
}
function submit() {
  step.value = 'done'
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[440px] max-w-[calc(100vw-3rem)] rounded-2xl bg-[var(--surface-page)] p-6.5 shadow-panel animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <template v-if="step === 'form'">
          <h3 class="m-0 font-display text-xl font-bold tracking-[-.02em]">Bloquer une indisponibilité</h3>
          <p class="mb-4.5 mt-2.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Aucune nouvelle mission ne pourra être planifiée sur cette période.</p>

          <div class="grid grid-cols-2 gap-3.5">
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Du</p>
              <input value="10 sept. 2026" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none">
            </div>
            <div>
              <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Au</p>
              <input value="11 sept. 2026" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none">
            </div>
          </div>

          <p class="mb-1.5 mt-4 text-[12.5px] font-bold">Motif</p>
          <input placeholder="Congés, formation…" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none">

          <div class="mt-5 flex gap-2.5">
            <button type="button" class="flex-1 rounded-md border border-[var(--border-default)] bg-white py-3.5 text-sm font-bold" @click="close">Annuler</button>
            <button type="button" class="flex-1 rounded-md bg-[image:var(--action-primary)] py-3.5 text-sm font-bold text-white shadow-action" @click="submit">Bloquer</button>
          </div>
        </template>

        <template v-else>
          <div class="px-0.5 py-1 text-center">
            <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
            <p class="mb-0 mt-4.5 text-lg font-bold">Plage bloquée</p>
            <p class="mx-auto mb-0 mt-2.5 max-w-[300px] text-sm leading-[1.6] text-[var(--text-muted)]">Du 10 au 11 septembre, vous n'êtes pas disponible pour de nouvelles missions.</p>
            <CoreButton size="lg" full-width class="mt-5" @click="close">Terminé</CoreButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
