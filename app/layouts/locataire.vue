<script setup lang="ts">
const route = useRoute()
const { leases, activeLeaseId, activeLease, ensureLoaded, selectLease: selectTenantLease } = useTenantLeases()
onMounted(ensureLoaded)

const currentUser = useAuthUser()
const displayName = computed(() => {
  const u = currentUser.value
  if (!u) return ''
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email
})
const firstName = computed(() => currentUser.value?.first_name?.trim() || displayName.value)
const verifiedLabel = computed(() => (currentUser.value?.is_verified ? 'Locataire vérifié' : 'Locataire'))

const PAGE_TITLES: Record<string, string> = {
  dash: 'Bonjour',
  demandes: 'Mes demandes',
  visites: 'Mes visites',
  reservations: 'Mes réservations',
  bail: 'Mon bail',
  edl: 'État des lieux',
  wallet: 'Mon wallet',
  signalements: 'Signalements',
  favoris: 'Mes favoris',
  messages: 'Messages',
  profil: 'Profil',
  guide: 'Guide'
}

const currentKey = computed(() => NAV_ITEMS.find(n => n.to === route.path)?.key ?? 'dash')
const pageTitle = computed(() => currentKey.value === 'dash' ? (firstName.value ? `Bonjour ${firstName.value}` : 'Bonjour') : PAGE_TITLES[currentKey.value] ?? '')
const showLeaseSwitcher = computed(() => (currentKey.value === 'bail' || currentKey.value === 'edl') && leases.value.length > 1)

const leaseMenuOpen = ref(false)
const drawerOpen = ref(false)

function pickLease(id: string) {
  selectTenantLease(id)
  leaseMenuOpen.value = false
}

/** `unit`/`property` sont réellement `null` sur au moins un bail réel (Lot 37 — signalé par l'utilisateur, `im-ee`) — jamais supposés présents. */
function leaseLabel(l: { unit: { name: string } | null; property: { name: string } | null }) {
  return [l.unit?.name, l.property?.name].filter(Boolean).join(' — ') || 'Logement'
}

watch(() => route.path, () => { drawerOpen.value = false })
</script>

<template>
  <div class="grid min-h-screen grid-cols-1 bg-[var(--surface-page)] lg:grid-cols-[264px_1fr]">
    <div v-if="drawerOpen" class="fixed inset-0 z-40 bg-black/50 lg:hidden" @click="drawerOpen = false" />

    <aside
      class="fixed inset-y-0 left-0 z-50 flex h-screen w-[264px] flex-col gap-2 overflow-y-auto border-r border-[var(--border-subtle)] bg-white p-4 transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0"
      :class="drawerOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <NuxtLink to="/" class="flex items-center gap-2.5 px-2 pb-3.5 pt-1">
        <img src="/images/logo.png" alt="Immo" class="h-[30px] w-[30px] rounded-sm" width="30" height="30">
        <span class="font-display text-xl font-extrabold tracking-[-.025em] text-green-900">Immo</span>
      </NuxtLink>

      <div class="mb-1.5 flex items-center gap-2.5 rounded-lg bg-[var(--surface-page)] p-3">
        <CoreAvatar :name="displayName || 'Locataire'" :size="42" color="var(--color-green-700)" />
        <div class="min-w-0">
          <p class="m-0 truncate text-sm font-bold">{{ displayName }}</p>
          <p class="mb-0 mt-0.5 text-[11.5px] text-[var(--text-faint)]">{{ verifiedLabel }}</p>
        </div>
      </div>

      <NuxtLink
        v-for="n in NAV_ITEMS"
        :key="n.key"
        :to="n.to"
        class="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-sm font-semibold transition-all"
        :class="currentKey === n.key ? 'bg-green-50 text-green-800' : 'bg-transparent text-[var(--text-secondary)]'"
      >
        <span class="w-[18px] flex-none text-center text-[15px]">{{ n.icon }}</span>
        <span class="flex-1">{{ n.label }}</span>
        <span v-if="n.count" class="rounded-pill bg-clay-500 px-2 py-0.5 text-[10.5px] font-black text-white">{{ n.count }}</span>
      </NuxtLink>
    </aside>

    <main class="min-w-0">
      <header class="sticky top-0 z-20 flex h-[70px] items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[rgba(250,248,244,.9)] px-4 backdrop-blur-[12px] sm:px-8">
        <div class="flex min-w-0 items-center gap-3">
          <button type="button" class="grid h-9 w-9 flex-none place-items-center rounded-pill border border-[var(--border-default)] bg-white text-base lg:hidden" @click="drawerOpen = true">☰</button>
          <h1 class="m-0 truncate font-display text-[19px] font-bold tracking-[-.025em] sm:text-[22px]">{{ pageTitle }}</h1>
        </div>
        <div class="flex flex-none items-center gap-3.5">
          <div v-if="showLeaseSwitcher" class="relative">
            <button
              type="button"
              class="flex h-10 max-w-[46vw] items-center gap-2.5 rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] font-bold text-sand-900 sm:max-w-none"
              @click="leaseMenuOpen = !leaseMenuOpen"
            >
              <span class="h-2 w-2 flex-none rounded-pill bg-green-600" />
              <span class="truncate">{{ activeLease ? leaseLabel(activeLease) : '' }}</span>
              <span class="text-[11px] text-[var(--text-faint)]">▾</span>
            </button>
            <div
              v-if="leaseMenuOpen"
              class="absolute right-0 top-12 z-40 w-[280px] animate-[im-rise_.2s_ease_both] rounded-xl border border-[var(--border-subtle)] bg-white p-1.5 shadow-panel"
            >
              <p class="mb-2 mt-1.5 px-2.5 text-[10.5px] font-black uppercase tracking-[.06em] text-[var(--text-faint)]">Changer de logement</p>
              <button
                v-for="l in leases"
                :key="l.id"
                type="button"
                class="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2.5 text-left"
                :class="l.id === activeLeaseId ? 'bg-green-50' : 'bg-white'"
                @click="pickLease(l.id)"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[13.5px] font-bold">{{ leaseLabel(l) }}</span>
                </span>
                <span v-if="l.id === activeLeaseId" class="text-[13px] font-black text-green-600">✓</span>
              </button>
            </div>
          </div>
          <LayoutNotificationBell />
          <LayoutAccountMenu :name="displayName || 'Locataire'" :size="38" color="var(--color-green-700)" />
        </div>
      </header>

      <div class="max-w-[1080px] px-4 pb-[60px] pt-7 sm:px-8">
        <slot />
      </div>
    </main>

    <TenantPaymentModal />
    <TenantAlimenterModal />
    <TenantPreavisModal />
    <TenantSignLeaseModal />
    <TenantReportModal />
  </div>
</template>
