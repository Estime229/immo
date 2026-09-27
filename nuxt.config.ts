import { createResolver } from '@nuxt/kit'
import tailwindcss from '@tailwindcss/vite'

const { resolve } = createResolver(import.meta.url)

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: [resolve('./app/assets/css/main.css')],
  runtimeConfig: {
    // Serveur uniquement — jamais exposé au navigateur. Le backend ne renvoie pas
    // d'en-têtes CORS pour l'origine du front (vérifié le 2026-09-17 : un appel
    // direct depuis le navigateur est bloqué). Toutes les requêtes passent donc par
    // server/api/proxy/[...path].ts, qui tourne côté serveur Nuxt (pas de CORS entre
    // deux serveurs) et ne connaît, lui, que cette URL.
    // Surchargeable en local via NUXT_API_BASE=http://localhost:3000/v1/api
    apiBase: 'https://immo-b89b.onrender.com/v1/api',
    public: {
      // Chemin relatif appelé par le navigateur — même origine, donc pas de CORS.
      apiProxyBase: '/api/proxy',
      // Liens des applications mobiles, affichés par la bannière « Téléchargez
      // l'application » (LayoutAppDownloadBanner). Vides tant que les apps ne
      // sont pas publiées : la bannière affiche alors « Bientôt » sans lien.
      // Surchargeables via NUXT_PUBLIC_APP_STORE_URL / NUXT_PUBLIC_PLAY_STORE_URL.
      appStoreUrl: '',
      playStoreUrl: ''
    }
  },
  vite: {
    plugins: [tailwindcss()]
  }
})
