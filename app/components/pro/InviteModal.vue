<script setup lang="ts">
/**
 * Inviter un membre d'équipe dépend du contexte d'équipe (I2) — `POST
 * /team/invite` renvoie une erreur serveur confirmée (500) quel que soit le
 * corps envoyé, revérifié en direct le 2026-09-24 (Lot 39, TEST-CASES.md
 * PRO-26). Plutôt que de fabriquer un formulaire (postes/permissions/biens
 * imaginaires) qui affichait ensuite un faux écran de succès sans jamais
 * appeler l'API, ce composant affiche honnêtement l'indisponibilité —
 * même principe que Kkiapay dans PaymentModal.vue.
 */
const modal = useProModal()
const open = computed(() => modal.value === 'invite')
function close() {
  modal.value = ''
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="w-[440px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5 text-center shadow-panel" @click.stop>
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-sand-200 text-xl text-[var(--text-muted)]">⚇</div>
        <h3 class="mb-0 mt-4.5 font-display text-lg font-bold tracking-[-.02em]">Inviter un membre d'équipe</h3>
        <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">
          Cette fonctionnalité n'est pas encore disponible — le contexte d'équipe rencontre actuellement une erreur côté serveur, indépendante de ce site.
        </p>
        <CoreButton size="lg" full-width class="mt-5.5" @click="close">Compris</CoreButton>
      </div>
    </div>
  </Teleport>
</template>
