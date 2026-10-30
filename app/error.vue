<script setup lang="ts">
import { ArrowRight, House, Lock, RefreshCw, Search, SearchX, ServerCrash } from '@lucide/vue'

/**
 * Page d'erreur. Avant : « Cette page n'existe pas » quel que soit le code, même pour une panne
 * serveur — on renvoyait chercher ailleurs un contenu qui existait. Le texte suit maintenant
 * `statusCode` : 404 → introuvable, 401/403 → accès, autre → panne avec « Réessayer ».
 */
const props = defineProps<{ error: { statusCode?: number; statusMessage?: string } }>()

const code = computed(() => props.error?.statusCode ?? 404)
type Kind = 'missing' | 'access' | 'failure'
const kind = computed<Kind>(() => (code.value === 404 ? 'missing' : code.value === 401 || code.value === 403 ? 'access' : 'failure'))

const COPY: Record<Kind, { icon: typeof SearchX; title: string; text: string }> = {
  missing: { icon: SearchX, title: "Cette page n'existe pas ou plus", text: "L'annonce a peut-être été retirée par son propriétaire, ou le lien comporte une erreur." },
  access: { icon: Lock, title: "Vous n'avez pas accès à cette page", text: 'Elle est réservée à un autre compte ou demande une connexion. Connectez-vous avec le bon compte, ou revenez à l\'accueil.' },
  failure: { icon: ServerCrash, title: 'Une erreur est survenue', text: "Le service n'a pas répondu comme prévu. Ce n'est pas de votre fait : réessayez dans un instant." }
}
const copy = computed(() => COPY[kind.value])

const query = ref('')
function search() {
  clearError({ redirect: query.value.trim() ? `/recherche?q=${encodeURIComponent(query.value.trim())}` : '/recherche' })
}
function goHome() {
  clearError({ redirect: '/' })
}
function goLogin() {
  const path = import.meta.client ? window.location.pathname + window.location.search : '/'
  clearError({ redirect: `/connexion?redirect=${encodeURIComponent(path)}` })
}
function retry() {
  if (import.meta.client) window.location.reload()
}

const QUICK_LINKS = [
  { to: '/recherche', label: 'Rechercher un logement' },
  { to: '/louer', label: 'Louer votre bien' },
  { to: '/faq', label: 'Questions fréquentes' }
]
</script>

<template>
  <div class="grid min-h-screen place-items-center bg-[var(--surface-page)] px-[26px] py-10">
    <div class="w-full max-w-[560px] animate-[im-fade_.3s_ease_backwards] text-center">
      <button type="button" class="mb-[30px] inline-flex items-center gap-2.5" aria-label="Accueil Immo" @click="goHome">
        <img src="/images/logo.png" alt="" class="h-8 w-8 rounded-[9px]" width="32" height="32">
        <span class="font-display text-xl font-extrabold tracking-[-.025em] text-green-900">Immo</span>
      </button>

      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 sm:p-8">
        <span class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill" :class="kind === 'failure' ? 'bg-danger-bg text-danger-fg' : 'bg-green-50 text-green-700'">
          <component :is="copy.icon" class="h-5 w-5" :stroke-width="1.9" />
        </span>
        <p class="mb-0 mt-4 font-mono text-xs font-bold text-[var(--text-faint)]">Erreur {{ code }}</p>
        <h1 class="mb-0 mt-2 font-display text-[26px] font-bold leading-[1.15] tracking-[-.03em] sm:text-[30px]">{{ copy.title }}</h1>
        <p class="mx-auto mb-0 mt-2.5 max-w-[420px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">{{ copy.text }}</p>

        <!-- Introuvable : on cherche autre chose -->
        <template v-if="kind === 'missing'">
          <div class="mx-auto mt-5.5 flex max-w-[440px] gap-2.5">
            <label class="relative min-w-0 flex-1">
              <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" :stroke-width="1.9" />
              <input
                v-model="query"
                placeholder="Rechercher un logement"
                aria-label="Rechercher un logement"
                class="h-[42px] w-full rounded-pill border border-[var(--border-default)] bg-white pl-10 pr-4 text-[13px] font-semibold outline-none focus:border-green-600"
                @keydown.enter="search"
              >
            </label>
            <CoreButton size="sm" pill @click="search">Chercher</CoreButton>
          </div>
          <div class="mt-4.5 flex flex-wrap justify-center gap-2">
            <NuxtLink
              v-for="l in QUICK_LINKS"
              :key="l.to"
              :to="l.to"
              class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-semibold text-sand-900 hover:border-green-600"
            >{{ l.label }}</NuxtLink>
          </div>
        </template>

        <!-- Accès : se connecter avec le bon compte -->
        <div v-else-if="kind === 'access'" class="mt-5.5 flex flex-wrap justify-center gap-2.5">
          <CoreButton @click="goLogin">Se connecter</CoreButton>
          <CoreButton tone="secondary" @click="goHome"><span class="inline-flex items-center gap-1.5"><House class="h-4 w-4" :stroke-width="1.9" />Accueil</span></CoreButton>
        </div>

        <!-- Panne : réessayer d'abord -->
        <div v-else class="mt-5.5 flex flex-wrap justify-center gap-2.5">
          <CoreButton @click="retry"><span class="inline-flex items-center gap-1.5"><RefreshCw class="h-4 w-4" :stroke-width="1.9" />Réessayer</span></CoreButton>
          <CoreButton tone="secondary" @click="goHome"><span class="inline-flex items-center gap-1.5"><House class="h-4 w-4" :stroke-width="1.9" />Accueil</span></CoreButton>
        </div>
      </div>

      <button v-if="kind !== 'missing'" type="button" class="mt-4.5 inline-flex items-center gap-1.5 text-[13px] font-bold text-green-700" @click="clearError({ redirect: '/contact?sujet=Autre' })">
        Le problème persiste ? Nous contacter<ArrowRight class="h-4 w-4" :stroke-width="1.9" />
      </button>
    </div>
  </div>
</template>
