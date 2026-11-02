<script setup lang="ts">
/**
 * Écran de transition affiché pendant un changement d'espace (Mon espace ⇄ équipe) : il masque
 * les listes de l'espace quitté, dit où l'on va, et reste jusqu'au rechargement de la page.
 */
const { switching, target, activeTeam } = useTeamSwitch()
const toPersonal = computed(() => target.value === 'Mon espace')
</script>

<template>
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-150" leave-to-class="opacity-0">
      <div v-if="switching" class="fixed inset-0 z-[120] grid place-items-center bg-[var(--surface-page)]" role="status" aria-live="polite">
        <div class="flex w-[300px] max-w-[calc(100vw-2rem)] flex-col items-center text-center">
          <span class="relative grid h-16 w-16 place-items-center rounded-2xl bg-green-50 text-green-700">
            <LayoutSpaceSwitchIcon :team="!toPersonal" />
            <span class="absolute -inset-1.5 animate-[im-spin_1s_linear_infinite] rounded-[22px] border-2 border-green-200 border-t-green-600" aria-hidden="true" />
          </span>
          <p class="mb-0 mt-6 text-[12px] font-bold uppercase tracking-label text-[var(--text-faint)]">{{ activeTeam && toPersonal ? `Quitte ${activeTeam.team.name}` : 'Changement d’espace' }}</p>
          <p class="mb-0 mt-1.5 font-display text-[22px] font-bold tracking-[-.02em] text-[var(--text-primary)]">{{ toPersonal ? 'Retour à votre espace' : target }}</p>
          <p class="mb-0 mt-2 text-[13.5px] text-[var(--text-muted)]">{{ toPersonal ? 'Vos biens et vos mandats se chargent…' : 'Les biens et les droits de votre poste se chargent…' }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
