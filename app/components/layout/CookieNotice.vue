<script setup lang="ts">
/**
 * Information cookies, sur tout le site : un petit bandeau non bloquant, en bas, qui ne couvre
 * aucun bouton d'action. Bayo ne dépose aujourd'hui que des cookies nécessaires (connexion,
 * préférences d'affichage) ; « Refuser » est pourtant proposé, et aussi visible qu'« Accepter »
 * (même taille, même style) : le choix est gardé (`accepted` / `refused`) pour qu'un futur outil
 * de mesure d'audience ou de publicité ne se charge qu'après acceptation. Les cookies nécessaires
 * restent déposés dans les deux cas — le texte le dit.
 *
 * Cookie lu au rendu serveur (comme AppDownloadBanner) : une fois le choix fait, le bandeau ne
 * réapparaît pas avant l'hydratation. L'ancienne valeur `1` (« J'ai compris ») vaut un choix fait.
 */
const choice = useCookie<string | null>('immo_cookie_notice', {
  default: () => null,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 395
})

const route = useRoute()
/**
 * Sous lg, la fiche d'un logement a sa propre barre « prix + Réserver » collée au-dessus de la
 * barre d'onglets : le bandeau se pose au-dessus d'elle (≈ 76 px) au lieu de la recouvrir.
 */
const aboveListingBar = computed(() => route.path.startsWith('/biens/'))
</script>

<template>
  <div
    v-if="!choice"
    role="region"
    aria-label="Cookies"
    class="fixed inset-x-3 z-[60] animate-[im-rise_.3s_var(--ease-standard)_both] rounded-xl border border-[var(--border-subtle)] bg-white px-3.5 py-3 shadow-panel sm:left-4 sm:right-auto sm:w-[400px] lg:bottom-4"
    :class="aboveListingBar ? 'bottom-[calc(var(--mobile-tabbar-space)+84px)]' : 'bottom-[calc(var(--mobile-tabbar-space)+8px)]'"
  >
    <p class="m-0 text-[12.5px] leading-[1.45] text-[var(--text-secondary)]">
      Bayo n'utilise que des cookies nécessaires (connexion, préférences d'affichage), déposés dans tous les cas. Votre choix vaudra pour une éventuelle mesure d'audience, aujourd'hui absente.
      <NuxtLink to="/legal?doc=confidentialite#cookies" class="font-bold text-[var(--text-primary)] underline underline-offset-2 hover:text-green-700">En savoir plus</NuxtLink>
    </p>
    <!-- Deux boutons strictement identiques : refuser ne doit pas être plus difficile qu'accepter. -->
    <div class="mt-2.5 grid grid-cols-2 gap-2">
      <button
        type="button"
        class="rounded-pill border border-[var(--border-default)] bg-white py-2 text-[13px] font-bold text-[var(--text-primary)] transition-colors hover:border-green-600 hover:text-green-700"
        @click="choice = 'refused'"
      >Refuser</button>
      <button
        type="button"
        class="rounded-pill border border-[var(--border-default)] bg-white py-2 text-[13px] font-bold text-[var(--text-primary)] transition-colors hover:border-green-600 hover:text-green-700"
        @click="choice = 'accepted'"
      >Accepter</button>
    </div>
  </div>
</template>
