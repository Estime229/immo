<script setup lang="ts">
const route = useRoute()
const currentUser = useAuthUser()
const displayName = computed(() => {
  const u = currentUser.value
  if (!u) return ''
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email
})
const roleLabel = computed(() => {
  const r = currentUser.value?.role
  const labels: Record<string, string> = { landlord: 'Propriétaire', agent: 'Agent', agency: 'Agence', admin: 'Admin' }
  return (r && labels[r]) || 'Compte pro'
})

const currentKey = computed(() => {
  for (const g of NAV_GROUPS) {
    const found = g.items.find(n => n.to === route.path)
    if (found) return found.key
  }
  return 'apercu'
})
const pageTitle = computed(() => PAGE_TITLES[currentKey.value] ?? '')

const drawerOpen = ref(false)

watch(() => route.path, () => { drawerOpen.value = false })
</script>

<template>
  <div class="grid min-h-screen grid-cols-1 bg-[var(--surface-page)] lg:grid-cols-[270px_1fr]">
    <div v-if="drawerOpen" class="fixed inset-0 z-40 bg-black/50 lg:hidden" @click="drawerOpen = false" />

    <aside
      class="fixed inset-y-0 left-0 z-50 flex h-screen w-[270px] flex-col gap-1.5 overflow-y-auto border-r border-[var(--border-subtle)] bg-white p-3.5 transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0"
      :class="drawerOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <NuxtLink to="/" class="flex items-center gap-2.5 px-2 pb-3">
        <img src="/images/logo.png" alt="Immo" class="h-[30px] w-[30px] rounded-sm" width="30" height="30">
        <span class="font-display text-xl font-extrabold tracking-[-.025em] text-green-900">Immo <span class="text-xs font-bold tracking-normal text-clay-500">Pro</span></span>
      </NuxtLink>

      <div class="flex items-center gap-2.5 rounded-lg bg-[var(--surface-page)] p-2.5">
        <CoreAvatar :name="displayName" :size="40" color="var(--color-green-700)" />
        <div class="min-w-0">
          <p class="m-0 truncate text-sm font-bold">{{ displayName }}</p>
          <p class="mb-0 mt-0.5 text-[11.5px] text-[var(--text-faint)]">{{ roleLabel }}</p>
        </div>
      </div>

      <template v-for="g in NAV_GROUPS" :key="g.header || 'main'">
        <p v-if="g.header" class="mb-1 ml-2.5 mt-3.5 text-[10px] font-black uppercase tracking-[.07em] text-[var(--text-faint)]">{{ g.header }}</p>
        <NuxtLink
          v-for="n in g.items"
          :key="n.key"
          :to="n.to"
          class="flex w-full items-center gap-2.5 rounded-sm px-3 py-2.5 text-left text-[13.5px] font-semibold transition-all"
          :class="currentKey === n.key ? 'bg-green-50 text-green-800' : 'bg-transparent text-[var(--text-secondary)]'"
        >
          <span class="w-[17px] flex-none text-center text-sm">{{ n.icon }}</span>
          <span class="flex-1">{{ n.label }}</span>
          <span v-if="n.count" class="rounded-pill bg-clay-500 px-[7px] py-0.5 text-[10px] font-black text-white">{{ n.count }}</span>
        </NuxtLink>
      </template>
    </aside>

    <main class="min-w-0">
      <header class="sticky top-0 z-20 flex h-[70px] items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[rgba(250,248,244,.9)] px-4 backdrop-blur-[12px] sm:px-8">
        <div class="flex min-w-0 items-center gap-3.5">
          <button type="button" class="grid h-9 w-9 flex-none place-items-center rounded-pill border border-[var(--border-default)] bg-white text-base lg:hidden" @click="drawerOpen = true">☰</button>
          <h1 class="m-0 truncate font-display text-[19px] font-bold tracking-[-.025em] sm:text-[22px]">{{ pageTitle }}</h1>
        </div>
        <div class="flex flex-none items-center gap-3">
          <LayoutNotificationBell />
          <LayoutAccountMenu :name="displayName" :size="38" color="var(--color-green-700)" />
        </div>
      </header>

      <div class="max-w-[1120px] px-4 pb-[60px] pt-7 sm:px-8">
        <slot />
      </div>
    </main>

    <ProRetraitModal />
    <ProInviteModal />
    <ProQrModal />
    <ProFlashModal />
    <ProPromoModal />
    <ProArtisanReqModal />
    <ProTarifModal />
  </div>
</template>
