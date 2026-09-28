<script setup lang="ts">
import type { UserRole } from '~/types/auth'
import { roleHomePath, roleLabel } from '~/utils/roleRoutes'
import { draftFromQuery, summarizeSearch } from '~/utils/searchPill'

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

/**
 * « Langue et devise » (Lot 56) : le choix d'une langue ou d'une devise ne
 * changeait rien, aucune page n'étant traduite ni convertie. La fenêtre dit
 * maintenant ce qui existe (français, prix en FCFA) et donne les équivalents
 * indicatifs publiés par l'API (GET /currencies/active).
 */
const pub = usePublicApi()
const rates = ref<{ currency_code: string; rate_to_cfa: string }[]>([])
async function openLang() {
  langOpen.value = true
  closeMenu()
  if (rates.value.length) return
  try {
    rates.value = (await pub.get<{ currency_code: string; rate_to_cfa: string }[]>('/currencies/active')).filter(r => r.currency_code !== 'XOF')
  } catch {
    rates.value = []
  }
}
function rateLine(r: { currency_code: string; rate_to_cfa: string }) {
  const symbol = r.currency_code === 'EUR' ? '€' : r.currency_code === 'USD' ? '$' : r.currency_code
  return `1 ${symbol} ≈ ${Number(r.rate_to_cfa).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA`
}
/** Retour à la page courante après la connexion (la fiche d'un logement, par exemple). */
const loginLink = computed(() => (route.path === '/' || route.path === '/connexion' ? '/connexion' : { path: '/connexion', query: { redirect: route.fullPath } }))

const NAV_LINKS = [
  { to: '/', label: 'Accueil' },
  { to: '/recherche', label: 'Rechercher' },
  { to: '/louer', label: 'Louer votre bien' },
  { to: '/faq', label: 'Aide' },
  { to: '/contact', label: 'Contact' }
]

/*
 * Sous lg, pas de menu déroulant : la barre d'onglets du bas couvre déjà la
 * navigation. L'en-tête porte une longue pilule de recherche (résumé de la
 * recherche en cours sur /recherche), et l'avatar à son bout ouvre une feuille
 * « compte » limitée à ce que la barre du bas n'offre pas : langue, aide,
 * contact, changement d'espace, déconnexion.
 */
const searchOpen = ref(false)
const accountOpen = ref(false)
const searchSummary = computed(() => summarizeSearch(route.path === '/recherche' ? draftFromQuery(route.query) : null))

function openAccount() {
  accountOpen.value = true
  ensureRoles()
}

watch(() => route.fullPath, () => {
  searchOpen.value = false
  accountOpen.value = false
})

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

function closeMenu() {
  menuOpen.value = false
}
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-sand-300 bg-[rgba(250,248,244,.88)] backdrop-blur-[14px]">
    <!-- Sous lg, la marque et la navigation vivent ailleurs (bannière d'app, barre d'onglets du bas) : l'en-tête ne garde que la pilule de recherche. -->
    <div class="mx-auto flex h-[72px] max-w-[1240px] items-center justify-center gap-[22px] px-4 sm:px-[26px] lg:justify-between">
      <NuxtLink to="/" class="hidden items-center gap-2.5 lg:flex">
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

      <!-- Mobile : longue pilule de recherche + avatar (compte) -->
      <div class="flex h-14 w-full max-w-[28rem] items-center rounded-pill border border-[var(--border-default)] bg-white p-1.5 shadow-card lg:hidden">
        <button
          type="button"
          class="flex h-full min-w-0 flex-1 items-center gap-3 rounded-pill pl-3.5 pr-2 text-left transition-transform duration-[var(--duration-fast)] active:scale-[.98]"
          :aria-expanded="searchOpen"
          @click="searchOpen = true"
        >
          <span class="flex-none text-green-700"><LayoutNavIcon name="search" :size="22" /></span>
          <span class="min-w-0">
            <span class="block truncate text-[14.5px] font-extrabold leading-tight text-[var(--text-primary)]">{{ searchSummary.title }}</span>
            <span class="mt-0.5 block truncate text-[12px] leading-tight text-[var(--text-muted)]">{{ searchSummary.subtitle }}</span>
          </span>
        </button>
        <span class="mx-1.5 h-7 w-px flex-none bg-sand-300" />
        <button
          type="button"
          class="flex-none rounded-pill transition-transform duration-[var(--duration-fast)] active:scale-95"
          :aria-expanded="accountOpen"
          aria-label="Mon compte"
          @click="openAccount"
        >
          <CoreAvatar v-if="auth.user.value" :name="displayName" :size="42" color="var(--color-green-700)" />
          <span v-else class="grid h-[42px] w-[42px] place-items-center rounded-pill bg-green-700 text-white"><LayoutNavIcon name="user" :size="22" /></span>
        </button>
      </div>

      <div class="hidden items-center gap-2.5 lg:flex">
        <NuxtLink to="/louer" class="hidden rounded-pill px-3.5 py-2.5 text-[13.5px] font-bold text-sand-900 transition-colors hover:bg-sand-100 lg:inline-flex">
          Publier un bien
        </NuxtLink>
        <button
          type="button"
          class="hidden h-[42px] w-[42px] place-items-center rounded-pill border border-[var(--border-default)] bg-white text-[17px] transition-colors hover:border-green-600 lg:grid"
          aria-label="Langue et devise"
          @click="openLang"
        >✦</button>
        <button
          type="button"
          class="relative flex items-center gap-[9px] rounded-pill border bg-white py-[5px] pl-[13px] pr-[6px] shadow-card transition-[box-shadow,border-color] duration-[var(--duration-base)] hover:shadow-raised"
          :class="menuOpen ? 'border-green-600 shadow-raised' : 'border-[var(--border-default)]'"
          :aria-expanded="menuOpen"
          aria-label="Menu"
          @click="menuOpen = !menuOpen; if (menuOpen) ensureRoles()"
        >
          <!-- Les trois traits se croisent en ✕ quand le menu est ouvert. -->
          <span class="flex flex-col gap-[3px]">
            <span class="h-0.5 w-4 rounded-sm bg-sand-900 transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]" :class="menuOpen ? 'translate-y-[5px] rotate-45' : ''" />
            <span class="h-0.5 w-4 rounded-sm bg-sand-900 transition-[opacity,transform] duration-[var(--duration-base)]" :class="menuOpen ? 'scale-x-0 opacity-0' : ''" />
            <span class="h-0.5 w-4 rounded-sm bg-sand-900 transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]" :class="menuOpen ? '-translate-y-[5px] -rotate-45' : ''" />
          </span>
          <CoreAvatar :name="displayName" :size="32" color="var(--color-green-700)" />
        </button>
      </div>
    </div>

    <!-- Menu utilisateur (desktop — sur mobile : feuilles recherche et compte ci-dessous) -->
    <template v-if="menuOpen">
      <div class="fixed inset-0 z-[44]" @click="closeMenu" />
      <div class="absolute right-[26px] top-[66px] z-[45] w-80 animate-[im-rise_.2s_ease_both] rounded-xl border border-[var(--border-subtle)] bg-white p-2 shadow-panel">
        <button type="button" class="flex w-full items-center gap-3.5 rounded-md px-3.5 py-3 text-left hover:bg-sand-100" @click="openLang">
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
        <NuxtLink v-else :to="loginLink" class="block rounded-md px-3.5 py-3 text-[14.5px] font-bold hover:bg-sand-100" @click="closeMenu">
          Se connecter ou s'inscrire
        </NuxtLink>
      </div>
    </template>
  </header>

  <LayoutSearchSheet v-model:open="searchOpen" />

  <!-- Compte (mobile) -->
  <LayoutBottomSheet v-model:open="accountOpen" :title="auth.user.value ? 'Mon compte' : 'Bienvenue sur Immo'">
    <template v-if="auth.user.value">
      <div class="flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-hairline">
        <CoreAvatar :name="displayName" :size="48" color="var(--color-green-700)" />
        <div class="min-w-0">
          <p class="m-0 truncate text-[15.5px] font-bold">{{ displayName }}</p>
          <p class="mb-0 mt-0.5 truncate text-[13px] text-[var(--text-faint)]">{{ auth.user.value.email }}</p>
        </div>
      </div>
      <p v-if="auth.user.value.status === 'restricted'" class="mb-0 mt-3 rounded-xl bg-warn-bg px-4 py-3 text-[13px] font-semibold text-warn-fg">
        Compte restreint — contactez le support si besoin.
      </p>
      <NuxtLink :to="spacePath" class="mt-3 flex items-center justify-between rounded-2xl bg-green-700 px-4 py-3.5 text-white shadow-action transition-transform active:scale-[.98]">
        <span class="text-[15px] font-bold">Mon espace {{ roleLabel(auth.user.value.role).toLowerCase() }}</span>
        <span aria-hidden="true" class="text-lg">→</span>
      </NuxtLink>
      <template v-if="otherRoles.length">
        <p class="mb-1.5 mt-5 text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Basculer vers</p>
        <div class="overflow-hidden rounded-2xl bg-white shadow-hairline">
          <button
            v-for="r in otherRoles"
            :key="r"
            type="button"
            class="flex w-full items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3.5 text-left last:border-b-0 disabled:opacity-50"
            :disabled="switchingRole"
            @click="pickRole(r)"
          >
            <span class="text-[15px] font-semibold">{{ switchingRole ? 'Changement…' : `Espace ${roleLabel(r).toLowerCase()}` }}</span>
            <span aria-hidden="true" class="text-[var(--text-faint)]">⇄</span>
          </button>
        </div>
      </template>
    </template>
    <NuxtLink v-else :to="loginLink" class="flex items-center justify-center rounded-pill bg-[image:var(--action-primary)] py-3.5 text-[15.5px] font-bold text-white shadow-action transition-transform active:scale-[.98]">
      Se connecter ou s'inscrire
    </NuxtLink>

    <div class="mt-4 overflow-hidden rounded-2xl bg-white shadow-hairline">
      <button type="button" class="flex w-full items-center gap-3.5 border-b border-[var(--border-subtle)] px-4 py-3.5 text-left" @click="accountOpen = false; openLang()">
        <span class="w-[22px] text-center text-lg">✦</span><span class="flex-1 text-[15px] font-semibold">Langue et devise</span><span aria-hidden="true" class="text-[var(--text-faint)]">›</span>
      </button>
      <NuxtLink to="/faq" class="flex items-center gap-3.5 border-b border-[var(--border-subtle)] px-4 py-3.5">
        <span class="w-[22px] text-center text-lg">?</span><span class="flex-1 text-[15px] font-semibold">Centre d'aide</span><span aria-hidden="true" class="text-[var(--text-faint)]">›</span>
      </NuxtLink>
      <NuxtLink to="/contact" class="flex items-center gap-3.5 px-4 py-3.5">
        <span class="w-[22px] text-center text-lg">✉</span><span class="flex-1 text-[15px] font-semibold">Nous contacter</span><span aria-hidden="true" class="text-[var(--text-faint)]">›</span>
      </NuxtLink>
    </div>

    <button v-if="auth.user.value" type="button" class="mt-4 w-full rounded-2xl bg-white px-4 py-3.5 text-left text-[15px] font-bold text-danger-fg shadow-hairline" @click="accountOpen = false; handleLogout()">
      Se déconnecter
    </button>
  </LayoutBottomSheet>

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
          <div class="rounded-md border-[1.5px] border-green-600 bg-green-50 px-4 py-3.5">
            <p class="m-0 text-sm font-bold">Français</p>
            <p class="mb-0 mt-[3px] text-[12.5px] text-[var(--text-muted)]">Seule langue disponible pour l'instant. L'anglais, le fɔngbè et le yorùbá sont prévus.</p>
          </div>
          <p class="mb-3 mt-6 text-xs font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Devise</p>
          <div class="rounded-md border border-[var(--border-default)] bg-white px-4 py-3.5">
            <p class="m-0 text-sm font-bold">Franc CFA (XOF)</p>
            <p class="mb-0 mt-[3px] text-[12.5px] text-[var(--text-muted)]">Tous les prix, loyers et paiements sont en FCFA.</p>
            <ul v-if="rates.length" class="mb-0 mt-2.5 list-none p-0 text-[12.5px] text-[var(--text-secondary)]">
              <li v-for="r in rates" :key="r.currency_code" class="font-mono">{{ rateLine(r) }}</li>
            </ul>
            <p v-if="rates.length" class="mb-0 mt-1.5 text-[11.5px] text-[var(--text-faint)]">Équivalents indicatifs, pour se repérer depuis l'étranger.</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
