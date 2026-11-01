<script setup lang="ts">
import { Cookie } from '@lucide/vue'

/**
 * Information cookies, sur tout le site. Immo ne dépose que des cookies nécessaires (connexion,
 * préférences d'affichage) : aucun choix à proposer, donc pas de « Refuser ». Si un outil de mesure
 * d'audience ou de publicité est ajouté un jour, ce bandeau devra devenir un vrai consentement
 * (accepter / refuser) et le script ne se charger qu'après acceptation.
 *
 * Cookie lu au rendu serveur (comme AppDownloadBanner) : une fois fermé, il ne réapparaît pas avant
 * l'hydratation. Sous le voile des modales (z-80 < z-90) : à la première visite de l'accueil, la
 * modale nuit/mois passe devant et le bandeau apparaît quand elle se ferme.
 */
const acknowledged = useCookie<string | null>('immo_cookie_notice', {
  default: () => null,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 395
})
</script>

<template>
  <div
    v-if="!acknowledged"
    role="region"
    aria-label="Cookies"
    class="fixed inset-x-4 bottom-[calc(var(--mobile-tabbar-space)+8px)] z-[80] animate-[im-rise_.3s_var(--ease-standard)_both] rounded-2xl border border-[var(--border-subtle)] bg-white p-5 shadow-overlay sm:left-6 sm:right-auto sm:w-[440px] lg:bottom-6"
  >
    <div class="flex items-start gap-3.5">
      <span class="grid h-10 w-10 flex-none place-items-center rounded-lg bg-clay-100 text-clay-700"><Cookie class="h-5 w-5" :stroke-width="1.9" /></span>
      <div class="min-w-0">
        <p class="m-0 font-display text-[16px] font-bold tracking-[-.01em] text-[var(--text-primary)]">Seulement les cookies nécessaires</p>
        <p class="mb-0 mt-1.5 text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">
          Immo utilise uniquement les cookies indispensables au site : rester connecté et retenir vos préférences d'affichage. Aucun cookie publicitaire ni de mesure d'audience.
        </p>
      </div>
    </div>
    <div class="mt-4 flex items-center justify-end gap-4">
      <NuxtLink to="/legal?doc=confidentialite#cookies" class="text-[13px] font-bold text-[var(--text-secondary)] underline underline-offset-4 hover:text-green-700">En savoir plus</NuxtLink>
      <button
        type="button"
        class="rounded-pill bg-green-800 px-5 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-green-900"
        @click="acknowledged = '1'"
      >J'ai compris</button>
    </div>
  </div>
</template>
