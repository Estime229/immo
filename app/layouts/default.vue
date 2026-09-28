<template>
  <!-- Sous lg, la barre d'onglets fixée en bas recouvrirait la fin du pied de page : on réserve sa hauteur. -->
  <div class="pb-[var(--mobile-tabbar-space)] lg:pb-0">
    <LayoutAppDownloadBanner />
    <LayoutSiteHeader />
    <slot />
    <LayoutSiteFooter />
    <LayoutPublicTabBar />
  </div>
</template>
