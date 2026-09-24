<script setup lang="ts">
import type { ArtisanProfile } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'

const route = useRoute()
const dispo = useArtisanDispo()
const drawerOpen = ref(false)
const currentUser = useAuthUser()
const profileApi = useArtisanProfileApi()
const refData = useReferenceData()

const currentKey = computed(() => ARTISAN_NAV_ITEMS.find(n => n.to === route.path)?.key ?? 'apercu')
const pageTitle = computed(() => ARTISAN_PAGE_TITLES[currentKey.value] ?? '')

watch(() => route.path, () => { drawerOpen.value = false })

const displayName = computed(() => {
  const u = currentUser.value
  if (!u) return ''
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email
})

const profile = ref<ArtisanProfile | null>(null)
onMounted(async () => {
  try {
    profile.value = await profileApi.fetchMine()
  } catch {
    profile.value = null
  }
})
const trades = ref<RefEntry[]>([])
onMounted(async () => {
  try {
    trades.value = await refData.fetchRef('ARTISAN_TRADE')
  } catch {
    trades.value = []
  }
})
const identitySubtitle = computed(() => {
  const trade = trades.value.find(t => t.id === profile.value?.trade_reference_id)?.labels.fr
  const rating = profile.value?.reputation_score != null ? `★ ${profile.value.reputation_score.toFixed(1)}` : null
  return [trade, rating].filter(Boolean).join(' · ') || 'Artisan'
})
</script>

<template>
  <div class="grid min-h-screen grid-cols-1 bg-[var(--surface-page)] lg:grid-cols-[250px_1fr]">
    <div v-if="drawerOpen" class="fixed inset-0 z-40 bg-black/50 lg:hidden" @click="drawerOpen = false" />

    <aside
      class="fixed inset-y-0 left-0 z-50 flex h-screen w-[250px] flex-col gap-1.5 overflow-y-auto border-r border-[var(--border-subtle)] bg-white p-3.5 transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0"
      :class="drawerOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <NuxtLink to="/" class="flex items-center gap-2.5 px-2 pb-3">
        <img src="/images/logo.png" alt="Immo" class="h-[30px] w-[30px] rounded-sm" width="30" height="30">
        <span class="font-display text-xl font-extrabold tracking-[-.025em] text-green-900">Immo <span class="text-xs font-bold tracking-normal text-info-fg">Artisan</span></span>
      </NuxtLink>

      <div class="mb-1.5 flex items-center gap-2.5 rounded-lg bg-[var(--surface-page)] p-2.5">
        <CoreAvatar :name="displayName || 'Artisan'" :size="40" color="var(--color-green-700)" />
        <div class="min-w-0">
          <p class="m-0 truncate text-sm font-bold">{{ displayName }}</p>
          <p class="mb-0 mt-0.5 text-[11.5px] text-[var(--text-faint)]">{{ identitySubtitle }}</p>
        </div>
      </div>

      <NuxtLink
        v-for="n in ARTISAN_NAV_ITEMS"
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
        <div class="flex flex-none items-center gap-2.5 sm:gap-4">
          <label
            class="flex cursor-pointer items-center gap-2 rounded-pill border px-2.5 py-2 sm:gap-2.5 sm:px-3.5"
            :class="dispo ? 'border-green-200 bg-green-50' : 'border-[var(--border-default)] bg-white'"
            @click="dispo = !dispo"
          >
            <span class="h-2 w-2 flex-none rounded-pill" :class="dispo ? 'bg-ok-fg' : 'bg-[var(--text-faint)]'" />
            <span class="hidden text-[13px] font-bold sm:inline" :class="dispo ? 'text-green-800' : 'text-[var(--text-muted)]'">{{ dispo ? 'Disponible' : 'Indisponible' }}</span>
            <span class="h-6 w-[42px] flex-none rounded-pill p-[3px] transition-colors" :class="dispo ? 'bg-green-600' : 'bg-[var(--border-default)]'">
              <span class="block h-[18px] w-[18px] rounded-pill bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)] transition-transform" :class="dispo ? 'translate-x-[18px]' : 'translate-x-0'" />
            </span>
          </label>
          <LayoutAccountMenu :name="displayName || 'Artisan'" :size="38" color="var(--color-green-700)" />
        </div>
      </header>

      <div class="max-w-[1080px] px-4 pb-[60px] pt-7 sm:px-8">
        <slot />
      </div>
    </main>

    <ArtisanOffreModal />
    <ArtisanTerminerModal />
    <ArtisanRetraitModal />
    <ArtisanBloquerModal />
    <ArtisanFlashModal />
  </div>
</template>
