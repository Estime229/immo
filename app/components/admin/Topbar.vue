<script setup lang="ts">
/**
 * En-tête de l'espace admin : titre de la page, recherche d'un compte, menu du compte.
 * La recherche ouvre la liste des utilisateurs filtrée (`/admin/utilisateurs?q=…`) —
 * c'est la recherche la plus fréquente au support (« retrouver ce compte »).
 */
import { LogOut, Search } from '@lucide/vue'

defineProps<{ title: string }>()

const route = useRoute()
const { auth, logout, hasPermission } = useAdminAuth()

const canSearch = computed(() => hasPermission('view:users') || hasPermission('manage:users'))
const query = ref(typeof route.query.q === 'string' && route.path === '/admin/utilisateurs' ? route.query.q : '')

function submitSearch() {
  const q = query.value.trim()
  navigateTo({ path: '/admin/utilisateurs', query: q ? { q } : {} })
}

const menuOpen = ref(false)
async function doLogout() {
  menuOpen.value = false
  await logout()
  await navigateTo('/admin/login')
}
</script>

<template>
  <header class="sticky top-0 z-20 flex h-[70px] items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[rgba(250,248,244,.9)] px-4 backdrop-blur-[12px] sm:px-8">
    <h1 class="m-0 min-w-0 truncate font-display text-[19px] font-bold tracking-[-.025em] sm:text-[22px]">{{ title }}</h1>

    <div class="flex flex-none items-center gap-3">
      <form v-if="canSearch" role="search" class="hidden h-10 w-[280px] items-center gap-2 rounded-pill border border-[var(--border-default)] bg-white px-3.5 focus-within:border-green-600 md:flex" @submit.prevent="submitSearch">
        <Search class="h-4 w-4 flex-none text-[var(--text-faint)]" />
        <input v-model="query" type="search" aria-label="Rechercher un compte" placeholder="Nom, email ou téléphone…" class="w-full min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--text-faint)]">
      </form>

      <div class="relative">
        <button type="button" class="block rounded-pill" aria-label="Menu du compte" @click="menuOpen = !menuOpen">
          <CoreAvatar :name="auth.nom || 'Admin'" :size="38" color="var(--color-green-900)" />
        </button>
        <template v-if="menuOpen">
          <div class="fixed inset-0 z-40" @click="menuOpen = false" />
          <div class="absolute right-0 top-full z-50 mt-2 w-60 animate-[im-rise_.2s_ease_both] rounded-xl border border-[var(--border-subtle)] bg-white p-1.5 shadow-panel">
            <div class="px-3.5 pb-2 pt-2">
              <p class="m-0 truncate text-[13.5px] font-bold">{{ auth.nom }}</p>
              <p class="mb-0 mt-0.5 text-[11.5px] text-[var(--text-faint)]">Espace administrateur</p>
            </div>
            <NuxtLink to="/" class="block rounded-md px-3.5 py-2.5 text-[13.5px] font-bold text-[var(--text-secondary)] hover:bg-sand-100" @click="menuOpen = false">Voir le site public</NuxtLink>
            <button type="button" class="flex w-full items-center gap-2 rounded-md px-3.5 py-2.5 text-left text-[13.5px] font-bold text-danger-fg hover:bg-sand-100" @click="doLogout">
              <LogOut class="h-4 w-4" /> Se déconnecter
            </button>
          </div>
        </template>
      </div>
    </div>
  </header>
</template>
