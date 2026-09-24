<script setup lang="ts">
import type { UserRole } from '~/types/auth'
import { roleHomePath, roleLabel } from '~/utils/roleRoutes'

const route = useRoute()
const favorites = usePropertyFavorites()
onMounted(favorites.ensureLoaded)
const favoriteCount = computed(() => favorites.ids.value.property_ids.length + favorites.ids.value.unit_ids.length)
const auth = useAuthApi()
const spacePath = computed(() => (auth.user.value ? roleHomePath(auth.user.value.role) : '/'))

const displayName = computed(() => {
  const u = auth.user.value
  if (!u) return 'Invité'
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email
})

/** Comptes multiples (ex. locataire + bailleur) — GET /auth/roles n'est interrogé qu'à l'ouverture du menu. */
const otherRoles = ref<UserRole[]>([])
const rolesLoaded = ref(false)
const switchingRole = ref(false)

async function ensureRoles() {
  if (!auth.user.value || rolesLoaded.value) return
  try {
    const res = await auth.fetchRoles()
    otherRoles.value = res.roles.filter(r => r !== res.active_role)
    rolesLoaded.value = true
  } catch {
    // Silencieux — sans la liste des rôles, "Mon espace" reste utilisable seul.
  }
}

async function pickRole(role: UserRole) {
  if (switchingRole.value) return
  switchingRole.value = true
  try {
    await auth.switchRole(role)
    rolesLoaded.value = false
    closeMenu()
    navigateTo(roleHomePath(role))
  } catch {
    // Le rôle actif reste inchangé si le switch échoue côté API.
  } finally {
    switchingRole.value = false
  }
}

async function handleLogout() {
  await auth.logout()
  otherRoles.value = []
  rolesLoaded.value = false
  closeMenu()
  navigateTo('/')
}

const menuOpen = ref(false)
const langOpen = ref(false)
const lang = ref('fr')
const currency = ref('fcfa')

const NAV_LINKS = [
  { to: '/', label: 'Accueil' },
  { to: '/recherche', label: 'Rechercher' },
  { to: '/louer', label: 'Louer votre bien' },
  { to: '/faq', label: 'Aide' },
  { to: '/contact', label: 'Contact' }
]

/** Le menu mobile a déjà une carte dédiée "Mettre un bien en location" plus bas. */
const MOBILE_NAV_LINKS = NAV_LINKS.filter(l => l.to !== '/louer')

const LANG_OPTIONS = [
  { key: 'fr', label: 'Français', region: 'France, Bénin' },
  { key: 'en', label: 'English', region: 'United States' },
  { key: 'yo', label: 'Yorùbá', region: 'Bénin, Nigeria' },
  { key: 'fon', label: 'Fɔngbè', region: 'Bénin' }
]

const CURRENCY_OPTIONS = [
  { key: 'fcfa', code: 'XOF', label: 'Franc CFA' },
  { key: 'eur', code: 'EUR', label: 'Euro' },
  { key: 'usd', code: 'USD', label: 'Dollar' }
]

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

function closeMenu() {
  menuOpen.value = false
}
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-sand-300 bg-[rgba(250,248,244,.88)] backdrop-blur-[14px]">
    <div class="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-[22px] px-4 sm:px-[26px]">
      <NuxtLink to="/" class="flex items-center gap-2.5">
        <img src="/images/logo.png" alt="Immo" class="h-8 w-8 rounded-[9px]" width="32" height="32">
        <span class="font-display text-[22px] font-extrabold tracking-[-.025em] text-green-900">Immo</span>
      </NuxtLink>

      <nav class="hidden items-center gap-0.5 rounded-pill border border-sand-300 bg-sand-100 p-1 lg:flex">
        <NuxtLink
          v-for="link in NAV_LINKS"
          :key="link.to"
          :to="link.to"
          class="rounded-pill px-4 py-[9px] text-[13.5px] font-bold transition-all"
          :class="isActive(link.to) ? 'bg-white text-green-700 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'"
        >{{ link.label }}</NuxtLink>
      </nav>

      <div class="flex items-center gap-2.5">
        <NuxtLink to="/louer" class="hidden rounded-pill px-3.5 py-2.5 text-[13.5px] font-bold text-sand-900 transition-colors hover:bg-sand-100 lg:inline-flex">
          Publier un bien
        </NuxtLink>
        <button
          type="button"
          class="hidden h-[42px] w-[42px] place-items-center rounded-pill border border-[var(--border-default)] bg-white text-[17px] transition-colors hover:border-green-600 sm:grid"
          @click="langOpen = true"
        >✦</button>
        <div
          class="relative flex cursor-pointer items-center gap-[9px] rounded-pill border bg-white py-[5px] pl-[13px] pr-[6px] shadow-card transition-shadow hover:shadow-raised"
          :class="menuOpen ? 'border-green-600' : 'border-[var(--border-default)]'"
          @click="menuOpen = !menuOpen; if (menuOpen) ensureRoles()"
        >
          <span class="flex flex-col gap-[3px]">
            <span class="h-0.5 w-4 rounded-sm bg-sand-900" />
            <span class="h-0.5 w-4 rounded-sm bg-sand-900" />
            <span class="h-0.5 w-4 rounded-sm bg-sand-900" />
          </span>
          <CoreAvatar :name="displayName" :size="32" color="var(--color-green-700)" />
        </div>
      </div>
    </div>

    <!-- Menu utilisateur -->
    <template v-if="menuOpen">
      <div class="fixed inset-0 z-[44]" @click="closeMenu" />
      <div class="absolute right-4 top-[66px] z-[45] w-80 max-w-[calc(100vw-2rem)] animate-[im-rise_.2s_ease_both] rounded-xl border border-[var(--border-subtle)] bg-white p-2 shadow-panel sm:right-[26px]">
        <NuxtLink
          v-for="link in MOBILE_NAV_LINKS"
          :key="link.to"
          :to="link.to"
          class="flex items-center gap-3.5 rounded-md px-3.5 py-3 hover:bg-sand-100 lg:hidden"
          :class="isActive(link.to) ? 'text-green-700' : ''"
          @click="closeMenu"
        >
          <span class="text-[14.5px] font-semibold">{{ link.label }}</span>
        </NuxtLink>
        <div class="my-2 h-px bg-sand-200 lg:hidden" />
        <button type="button" class="flex w-full items-center gap-3.5 rounded-md px-3.5 py-3 text-left hover:bg-sand-100" @click="langOpen = true; closeMenu()">
          <span class="w-[22px] text-center text-lg">✦</span><span class="text-[14.5px] font-semibold">Langue et devise</span>
        </button>
        <NuxtLink to="/faq" class="flex items-center gap-3.5 rounded-md px-3.5 py-3 hover:bg-sand-100" @click="closeMenu">
          <span class="w-[22px] text-center text-lg">?</span><span class="text-[14.5px] font-semibold">Centre d'aide</span>
        </NuxtLink>
        <div class="my-2 h-px bg-sand-200" />
        <NuxtLink to="/louer" class="flex items-start gap-3.5 rounded-md px-3.5 py-3 hover:bg-clay-50" @click="closeMenu">
          <span class="w-[22px] text-center text-lg">⌂</span>
          <span>
            <p class="m-0 text-[14.5px] font-bold">Mettre un bien en location</p>
            <p class="mb-0 mt-[3px] text-[12.5px] leading-[1.5] text-[var(--text-muted)]">Loyers suivis et caution séquestrée. C'est simple, et sans frais de publication.</p>
          </span>
        </NuxtLink>
        <NuxtLink to="/favoris" class="flex items-center gap-3.5 rounded-md px-3.5 py-3 hover:bg-sand-100" @click="closeMenu">
          <span class="w-[22px] text-center text-base text-fav">♥</span>
          <span class="text-[14.5px] font-semibold">Mes favoris{{ favoriteCount ? ` (${favoriteCount})` : '' }}</span>
        </NuxtLink>
        <div class="my-2 h-px bg-sand-200" />
        <template v-if="auth.user.value">
          <NuxtLink :to="spacePath" class="flex items-center gap-3.5 rounded-md px-3.5 py-3 hover:bg-green-50" @click="closeMenu">
            <span class="w-[22px] text-center text-lg text-green-700">◧</span>
            <span class="text-[14.5px] font-bold text-green-700">Mon espace{{ auth.user.value ? ` (${roleLabel(auth.user.value.role)})` : '' }}</span>
          </NuxtLink>
          <template v-if="otherRoles.length">
            <p class="mb-1 mt-2 px-3.5 text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Basculer vers</p>
            <button
              v-for="r in otherRoles"
              :key="r"
              type="button"
              class="flex w-full items-center gap-3.5 rounded-md px-3.5 py-3 text-left hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="switchingRole"
              @click="pickRole(r)"
            >
              <span class="w-[22px] text-center text-lg text-[var(--text-faint)]">⇄</span>
              <span class="text-[14.5px] font-semibold">{{ switchingRole ? 'Changement…' : `Espace ${roleLabel(r)}` }}</span>
            </button>
          </template>
          <div class="my-2 h-px bg-sand-200" />
          <div class="px-3.5 py-2">
            <p class="m-0 truncate text-[13.5px] font-bold">{{ displayName }}</p>
            <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">{{ auth.user.value.email }}</p>
            <p v-if="auth.user.value.status === 'restricted'" class="mb-0 mt-1.5 text-xs font-semibold text-clay-700">
              Compte restreint — contactez le support si besoin.
            </p>
          </div>
          <button type="button" class="block w-full rounded-md px-3.5 py-3 text-left text-[14.5px] font-bold text-danger-fg hover:bg-sand-100" @click="handleLogout">
            Se déconnecter
          </button>
        </template>
        <NuxtLink v-else to="/connexion" class="block rounded-md px-3.5 py-3 text-[14.5px] font-bold hover:bg-sand-100" @click="closeMenu">
          Se connecter ou s'inscrire
        </NuxtLink>
      </div>
    </template>
  </header>

  <!-- Langue et devise -->
  <Teleport to="body">
    <div
      v-if="langOpen"
      class="fixed inset-0 z-[96] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]"
      @click="langOpen = false"
    >
      <div class="flex max-h-[86vh] w-[560px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] flex-col overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-[18px]">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">Langue et devise</h3>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" @click="langOpen = false">✕</button>
        </div>
        <div class="overflow-y-auto p-6">
          <p class="mb-3 mt-0 text-xs font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Langue</p>
          <div class="grid grid-cols-2 gap-2.5">
            <button
              v-for="l in LANG_OPTIONS"
              :key="l.key"
              type="button"
              class="rounded-md border-[1.5px] px-4 py-3.5 text-left"
              :class="lang === l.key ? 'border-green-600 bg-green-50' : 'border-[var(--border-default)] bg-white'"
              @click="lang = l.key"
            >
              <p class="m-0 text-sm font-bold">{{ l.label }}</p>
              <p class="mb-0 mt-[3px] text-[12.5px] text-[var(--text-muted)]">{{ l.region }}</p>
            </button>
          </div>
          <p class="mb-3 mt-6 text-xs font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Devise</p>
          <div class="grid grid-cols-3 gap-2.5">
            <button
              v-for="c in CURRENCY_OPTIONS"
              :key="c.key"
              type="button"
              class="rounded-md border-[1.5px] px-4 py-3.5 text-left"
              :class="currency === c.key ? 'border-green-600 bg-green-50' : 'border-[var(--border-default)] bg-white'"
              @click="currency = c.key"
            >
              <p class="m-0 text-sm font-bold">{{ c.code }}</p>
              <p class="mb-0 mt-[3px] text-[12.5px] text-[var(--text-muted)]">{{ c.label }}</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
