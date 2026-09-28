<script setup lang="ts">
import { detectMobilePlatform, pickStoreUrl, platformSubtitle, type MobilePlatform } from '~/utils/mobileNav'

/**
 * Bannière « Téléchargez l'application » en haut de page, sous `lg` uniquement.
 *
 * - La fermeture est retenue 30 jours dans un cookie (et non le localStorage) :
 *   le serveur le lit au rendu, donc une bannière fermée ne réapparaît pas
 *   une fraction de seconde avant l'hydratation.
 * - La plateforme vient du user-agent, lu côté serveur puis affiné côté client
 *   (iPad en mode bureau), pour viser le bon store dès le premier rendu.
 * - Les liens des stores viennent de la config (`NUXT_PUBLIC_APP_STORE_URL`,
 *   `NUXT_PUBLIC_PLAY_STORE_URL`). Sans lien pour l'appareil, la bannière
 *   annonce l'application (« Bientôt ») au lieu d'un bouton qui mènerait nulle part.
 */
const config = useRuntimeConfig()
const dismissed = useCookie<string | null>('immo_app_banner_dismissed', {
  default: () => null,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 30
})

const serverUa = import.meta.server ? useRequestHeaders(['user-agent'])['user-agent'] : undefined
const platform = useState<MobilePlatform>('mobilePlatform', () => detectMobilePlatform(serverUa))
onMounted(() => {
  platform.value = detectMobilePlatform(navigator.userAgent, navigator.maxTouchPoints)
})

const storeUrl = computed(() => pickStoreUrl(platform.value, {
  ios: String(config.public.appStoreUrl ?? ''),
  android: String(config.public.playStoreUrl ?? '')
}))
const subtitle = computed(() => platformSubtitle(platform.value))

function dismiss() {
  dismissed.value = '1'
}
</script>

<template>
  <div
    v-if="!dismissed"
    class="flex items-center gap-2.5 border-b border-[var(--border-subtle)] bg-white py-3 pl-2 pr-4 lg:hidden"
    role="region"
    aria-label="Application mobile Immo"
  >
    <button
      type="button"
      class="grid h-8 w-8 flex-none place-items-center rounded-pill text-[var(--text-faint)] transition-colors hover:bg-sand-100 hover:text-sand-900"
      aria-label="Fermer la bannière"
      @click="dismiss"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
    <img src="/images/logo.png" alt="" class="h-[52px] w-[52px] flex-none rounded-[13px] shadow-card" width="52" height="52">
    <div class="min-w-0 flex-1">
      <p class="m-0 text-[15px] font-bold leading-[1.25] text-[var(--text-primary)]">Téléchargez l'application</p>
      <p class="mb-0 mt-0.5 text-[12.5px] leading-[1.35] text-[var(--text-muted)]">{{ subtitle }}</p>
    </div>
    <a
      v-if="storeUrl"
      :href="storeUrl"
      target="_blank"
      rel="noopener"
      class="flex-none whitespace-nowrap rounded-pill bg-green-600 px-4 py-2.5 text-[12.5px] font-black uppercase tracking-[.03em] text-white shadow-action transition-colors hover:bg-green-700"
    >
      <span class="hidden min-[400px]:inline">Utiliser l'application</span>
      <span class="min-[400px]:hidden">Ouvrir</span>
    </a>
    <span
      v-else
      class="flex-none whitespace-nowrap rounded-pill border border-green-200 bg-green-50 px-3.5 py-2 text-[12px] font-black uppercase tracking-[.03em] text-green-700"
    >Bientôt</span>
  </div>
</template>
