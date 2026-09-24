<script setup lang="ts">
const FOOTER_COLUMNS = [
  {
    title: 'Louer',
    links: [
      { to: '/recherche', label: 'Rechercher un logement' },
      { to: '/favoris', label: 'Mes favoris' },
      { to: '/faq', label: 'Questions fréquentes' },
      { to: '/connexion', label: 'Créer un compte' }
    ]
  },
  {
    title: 'Propriétaires',
    links: [
      { to: '/louer', label: 'Louer votre bien' },
      { to: '/louer', label: 'Tarifs' },
      { to: '/kyc', label: 'Vérification du compte' }
    ]
  },
  {
    title: 'Immo',
    links: [
      { to: '/contact', label: 'Nous contacter' },
      { to: '/legal', label: "Conditions d'utilisation" },
      { to: '/legal', label: 'Confidentialité' },
      { to: '/legal', label: 'Mentions légales' }
    ]
  }
]
</script>

<template>
  <footer class="relative mt-[60px] overflow-hidden bg-green-900">
    <div class="pointer-events-none absolute inset-x-0 -bottom-[3.5vw] flex select-none justify-center">
      <span
        class="font-display font-extrabold leading-[.8] tracking-[-.04em] text-transparent"
        style="font-size: 19vw; -webkit-text-stroke: 1.5px rgba(255,255,255,.09)"
      >Immo</span>
    </div>

    <div class="relative mx-auto grid max-w-[1240px] grid-cols-1 gap-7 px-8 pt-14 sm:grid-cols-[1.6fr_1fr_1fr_1fr]">
      <div>
        <div class="flex items-center gap-2.5">
          <img src="/images/logo.png" alt="Immo" class="h-[30px] w-[30px] rounded-[9px]" width="30" height="30">
          <span class="font-display text-2xl font-extrabold tracking-[-.03em] text-white">Immo</span>
        </div>
        <p class="mb-0 mt-4 font-display text-[19px] font-bold tracking-[-.02em] text-white">Louez sans vous faire avoir</p>
        <p class="mb-0 mt-[26px] text-[12.5px] font-black tracking-[.04em] text-white/50">ADRESSE</p>
        <p class="mb-0 mt-[9px] text-sm leading-[1.6] text-white/[.82]">Boulevard de la Marina<br>Cotonou, Bénin</p>
        <div class="mt-[26px] flex items-center gap-3.5">
          <div class="flex items-center gap-2 rounded-md border border-white/[.22] px-3.5 py-2.5">
            <span class="text-[15px] text-white/90">⛨</span>
            <span class="text-[11.5px] font-black leading-[1.15] tracking-[.02em] text-white/90">CAUTION<br>SÉQUESTRÉE</span>
          </div>
          <div class="flex items-center gap-2 rounded-md border border-white/[.22] px-3.5 py-2.5">
            <span class="text-[15px] text-white/90">§</span>
            <span class="text-[11.5px] font-black leading-[1.15] tracking-[.02em] text-white/90">LOI<br>2022-30</span>
          </div>
        </div>
      </div>

      <div v-for="col in FOOTER_COLUMNS" :key="col.title">
        <p class="mb-5 mt-0 text-[15px] font-bold text-white">{{ col.title }}</p>
        <NuxtLink
          v-for="(link, i) in col.links"
          :key="col.title + i"
          :to="link.to"
          class="mb-4 block w-fit text-sm text-white/[.72] transition-colors hover:text-white"
        >{{ link.label }}</NuxtLink>
      </div>
    </div>

    <div class="relative mx-auto mt-10 flex max-w-[1240px] flex-wrap items-center justify-between gap-[18px] px-8 pb-[30px] pt-10">
      <p class="m-0 font-display text-[15px] font-bold text-white/90">Immo © 2026</p>
      <div class="flex flex-wrap items-center gap-6">
        <div class="flex items-center gap-3">
          <span class="text-[13.5px] text-white/[.72]">Nous suivre :</span>
          <span class="grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-sm bg-white/[.12] text-sm text-white">✉</span>
          <span class="grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-sm bg-white/[.12] text-[13px] font-black text-white">in</span>
        </div>
        <NuxtLink to="/legal" class="text-sm text-white/[.72] transition-colors hover:text-white">Centre de confiance</NuxtLink>
        <NuxtLink to="/legal" class="text-sm text-white/[.72] transition-colors hover:text-white">Confidentialité</NuxtLink>
      </div>
    </div>
  </footer>
</template>
