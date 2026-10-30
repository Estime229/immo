<script setup lang="ts">
/** Menu de l'espace admin — même structure que celui de l'espace pro (logo, carte du compte, groupes). */
import type { Permission } from '~/composables/useAdminLevels'

defineProps<{ currentKey: string }>()

const { auth, hasPermission } = useAdminAuth()
const { levelDef } = useAdminLevels()
const { counts } = useAdminCounts()

const levelName = computed(() => (auth.value.adminLevel ? levelDef(auth.value.adminLevel)?.name : '') || 'Administrateur')

function canSee(permission?: Permission | Permission[]) {
  if (!permission) return true
  return (Array.isArray(permission) ? permission : [permission]).some(p => hasPermission(p))
}

const groups = computed(() =>
  ADMIN_NAV
    .map(g => ({ ...g, items: g.items.filter(it => canSee(it.permission)) }))
    .filter(g => g.items.length)
)
</script>

<template>
  <!-- Défilement interne sur ce div, séparé du conteneur sticky (même raison que dans layouts/pro.vue). -->
  <div class="flex h-full flex-col gap-1.5 overflow-y-auto p-3.5">
    <NuxtLink to="/admin" class="flex items-center gap-2.5 px-2 pb-3">
      <img src="/images/logo.png" alt="Immo" class="h-[30px] w-[30px] rounded-sm" width="30" height="30">
      <span class="font-display text-xl font-extrabold tracking-[-.025em] text-green-900">Immo <span class="text-xs font-bold tracking-normal text-clay-500">Admin</span></span>
    </NuxtLink>

    <div class="flex items-center gap-2.5 rounded-lg bg-[var(--surface-page)] p-2.5">
      <CoreAvatar :name="auth.nom || 'Admin'" :size="40" color="var(--color-green-900)" />
      <div class="min-w-0">
        <p class="m-0 truncate text-sm font-bold">{{ auth.nom }}</p>
        <p class="mb-0 mt-0.5 truncate text-[11.5px] text-[var(--text-faint)]">{{ levelName }}</p>
      </div>
    </div>

    <template v-for="g in groups" :key="g.header || 'main'">
      <p v-if="g.header" class="mb-1 ml-2.5 mt-3.5 text-[10px] font-black uppercase tracking-[.07em] text-[var(--text-faint)]">{{ g.header }}</p>
      <NuxtLink
        v-for="n in g.items"
        :key="n.key"
        :to="n.to"
        class="flex w-full items-center gap-2.5 rounded-sm px-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors"
        :class="currentKey === n.key ? 'bg-green-50 text-green-800' : 'bg-transparent text-[var(--text-secondary)] hover:bg-sand-50'"
      >
        <component :is="n.icon" class="h-[17px] w-[17px] flex-none" :stroke-width="1.9" />
        <span class="min-w-0 flex-1 truncate">{{ n.label }}</span>
        <span v-if="n.count && adminCountLabel(counts[n.count])" class="rounded-pill bg-clay-500 px-[7px] py-0.5 text-[10px] font-black text-white">{{ adminCountLabel(counts[n.count]) }}</span>
      </NuxtLink>
    </template>

    <NuxtLink to="/" class="mt-auto flex items-center gap-2 rounded-sm px-3 pb-1 pt-4 text-[12.5px] font-bold text-[var(--text-faint)] hover:text-green-700">
      ← Voir le site public
    </NuxtLink>
  </div>
</template>
