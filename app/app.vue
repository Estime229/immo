<script setup lang="ts">
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, formatTitle, isPrivatePath, publicRouteTitle, SITE_NAME } from '~/utils/seo'

/**
 * En-tête par défaut de toutes les pages (Lot 56) : langue, modèle de titre,
 * description et aperçu de partage. Une page qui connaît mieux son titre
 * (fiche, vitrine) le remplace avec useSeoMeta ; sinon le titre vient de la route.
 */
const route = useRoute()
const requestUrl = useRequestURL()
useHead({
  htmlAttrs: { lang: 'fr' },
  titleTemplate: t => formatTitle(t),
  title: computed(() => publicRouteTitle(route.path) ?? ''),
  meta: [
    { name: 'theme-color', content: '#14532d' },
    { name: 'robots', content: computed(() => (isPrivatePath(route.path) ? 'noindex, nofollow' : 'index, follow')) }
  ],
  link: [{ rel: 'icon', href: '/favicon.ico' }]
})
useSeoMeta({
  description: DEFAULT_DESCRIPTION,
  ogSiteName: SITE_NAME,
  ogType: 'website',
  ogLocale: 'fr_FR',
  ogTitle: DEFAULT_TITLE,
  ogDescription: DEFAULT_DESCRIPTION,
  ogImage: `${requestUrl.origin}/images/logo.png`,
  twitterCard: 'summary'
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <LayoutVerificationGate />
  </div>
</template>
