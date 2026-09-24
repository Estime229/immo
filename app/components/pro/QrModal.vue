<script setup lang="ts">
const modal = useProModal()
const open = computed(() => modal.value === 'qr')
function close() {
  modal.value = ''
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[400px] max-w-[calc(100vw-3rem)] rounded-2xl bg-[var(--surface-page)] p-6.5 text-center animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">QR code — Résidence Étoile</h3>
        <p class="mb-4.5 mt-2 text-[13px] text-[var(--text-muted)]">À afficher devant le bien : le passant accède à l'annonce et aux unités disponibles.</p>
        <div class="mx-auto h-[180px] w-[180px] rounded-md border border-[var(--border-default)] bg-white p-3">
          <div class="h-full w-full" style="background-image: repeating-conic-gradient(var(--text-primary) 0 25%, #fff 0 50%); background-size: 15px 15px" />
        </div>
        <div class="mt-5 flex gap-2.5">
          <CoreButton tone="secondary" size="lg" full-width @click="close">Fermer</CoreButton>
          <CoreButton size="lg" full-width @click="close">Télécharger</CoreButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
