<script setup lang="ts">
/** Modale promotionnelle affichée une fois par visiteur (voir localStorage côté page d'accueil). */
const emit = defineEmits<{ close: []; explore: [] }>()
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="emit('close')">
      <div
        class="relative w-[480px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-3xl p-8 text-center shadow-panel"
        style="background-image: radial-gradient(120% 70% at 20% 0%, #fff, transparent 60%), linear-gradient(160deg, #fff, var(--color-sand-100))"
        @click.stop
      >
        <button
          type="button"
          class="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-pill text-lg text-[var(--text-muted)] transition-colors hover:bg-sand-200"
          @click="emit('close')"
        >✕</button>

        <div class="mx-auto grid h-[92px] w-[92px] place-items-center rounded-pill bg-sand-100 text-4xl font-black text-green-700">%</div>

        <span class="mt-6 inline-block rounded-pill bg-clay-500 px-4 py-[7px] text-[12px] font-black uppercase tracking-[.06em] text-white">Offre de lancement</span>

        <h3 class="m-0 mt-4 font-display text-[26px] font-bold leading-[1.2] tracking-[-.02em] text-[var(--text-primary)]">
          Frais de service offerts sur votre 1ère location
        </h3>

        <p class="mx-auto mb-0 mt-3.5 max-w-[380px] text-[15px] leading-[1.6] text-[var(--text-muted)]">
          Réservez votre premier logement avant la fin du mois : les frais de service sont entièrement pris en charge. Aucun code à saisir, l'offre s'applique automatiquement au moment du paiement.
        </p>

        <CoreButton tone="primary" size="lg" full-width class="mt-7" @click="emit('explore')">Explorer les biens vérifiés</CoreButton>

        <button type="button" class="mt-4 text-[14px] font-semibold text-[var(--text-faint)]" @click="emit('close')">Plus tard</button>
      </div>
    </div>
  </Teleport>
</template>
