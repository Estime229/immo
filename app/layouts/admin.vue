<script setup lang="ts">
import type { MobileTab } from '~/utils/mobileNav'

/** Layout de l'espace admin — même grille que les espaces pro/locataire : menu fixe, en-tête collant, barre d'onglets mobile. */
const route = useRoute()
const { ensure: ensureCounts, counts } = useAdminCounts()
onMounted(ensureCounts)

const currentItem = computed(() => adminNavItemFor(route.path))
const currentKey = computed(() => currentItem.value?.key ?? 'apercu')
const pageTitle = computed(() => currentItem.value?.title ?? currentItem.value?.label ?? 'Admin')
useHead({ title: computed(() => `${pageTitle.value} · Admin`) })

const drawerOpen = ref(false)
watch(() => route.path, () => { drawerOpen.value = false })

/** Raccourcis mobiles : les trois files qui attendent le plus souvent une action, puis « Menu ». */
const mobileTabs = computed<MobileTab[]>(() => [
  { key: 'apercu', label: 'Aperçu', icon: 'grid', to: '/admin', active: !drawerOpen.value && currentKey.value === 'apercu' },
  { key: 'kyc', label: 'KYC', icon: 'user', to: '/admin/kyc', active: !drawerOpen.value && currentKey.value === 'kyc', badge: adminCountLabel(counts.value.kyc) },
  { key: 'biens', label: 'Annonces', icon: 'building', to: '/admin/biens', active: !drawerOpen.value && currentKey.value === 'biens' },
  { key: 'wallet', label: 'Retraits', icon: 'wallet', to: '/admin/wallet', active: !drawerOpen.value && currentKey.value === 'wallet', badge: adminCountLabel(counts.value.withdrawals) },
  { key: 'menu', label: 'Menu', icon: 'menu', active: drawerOpen.value || !['apercu', 'kyc', 'biens', 'wallet'].includes(currentKey.value) }
])
</script>

<template>
  <div class="grid min-h-screen grid-cols-1 bg-[var(--surface-page)] font-body text-[var(--text-primary)] lg:grid-cols-[270px_1fr]">
    <div v-if="drawerOpen" class="fixed inset-0 z-40 bg-black/50 lg:hidden" @click="drawerOpen = false" />

    <aside
      class="fixed inset-y-0 left-0 z-50 h-screen w-[270px] border-r border-[var(--border-subtle)] bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0"
      :class="drawerOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <AdminSidebar :current-key="currentKey" />
    </aside>

    <main class="min-w-0">
      <AdminTopbar :title="pageTitle" />
      <div class="w-full px-4 pb-[calc(var(--mobile-tabbar-space)+1.5rem)] pt-7 sm:px-8 lg:pb-[60px]">
        <slot />
      </div>
    </main>

    <LayoutMobileTabBar :items="mobileTabs" @select="drawerOpen = !drawerOpen" />
  </div>
</template>
