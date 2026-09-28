<script setup lang="ts">
import type { UserRole } from '~/types/auth'
import type { MobileTab } from '~/utils/mobileNav'
import { isTabActive } from '~/utils/mobileNav'
import { roleHomePath } from '~/utils/roleRoutes'

/** Onglets du site public sur mobile — pendant de la navigation du `SiteHeader` desktop. */
const route = useRoute()
const user = useAuthUser()

/** L'artisan (et l'admin) n'ont pas de messagerie : l'onglet disparaît plutôt que de mener nulle part. */
const MESSAGES_PATHS: Partial<Record<UserRole, string>> = {
  tenant: '/locataire/messages',
  landlord: '/pro/messages',
  agent: '/pro/messages',
  agency: '/pro/messages'
}

const tabs = computed<MobileTab[]>(() => {
  const path = route.path
  const u = user.value
  const list: MobileTab[] = [
    { key: 'explorer', label: 'Explorer', icon: 'search', to: '/', active: isTabActive(path, { to: '/', alsoActiveOn: ['/recherche', '/biens', '/vitrine'] }) },
    { key: 'favoris', label: 'Favoris', icon: 'heart', to: '/favoris', active: isTabActive(path, { to: '/favoris' }) },
    { key: 'publier', label: 'Publier', icon: 'plus', to: '/louer', active: isTabActive(path, { to: '/louer' }) }
  ]
  const messagesPath = u ? MESSAGES_PATHS[u.role] : '/connexion'
  if (messagesPath) list.push({ key: 'messages', label: 'Messages', icon: 'message', to: messagesPath, active: false })
  list.push(u
    ? { key: 'espace', label: 'Mon espace', icon: 'user', to: roleHomePath(u.role), active: false }
    : { key: 'connexion', label: 'Connexion', icon: 'user', to: '/connexion', active: false })
  return list
})
</script>

<template>
  <LayoutMobileTabBar :items="tabs" />
</template>
