<script setup lang="ts">
/**
 * Barre d'onglets fixée en bas de l'écran, sous `lg` uniquement — la
 * navigation principale reste à portée de pouce sur mobile, comme dans une
 * application native. Un onglet sans `to` est un bouton (ex. « Menu », qui
 * ouvre le tiroir complet de l'espace) et émet `select`.
 *
 * z-30 : au-dessus du contenu et des en-têtes collants (z-20), mais sous le
 * voile des tiroirs (z-40), des menus déroulants et des modales (z-[90]) —
 * ouvrir le tiroir recouvre donc la barre au lieu d'en masquer le bas.
 */
import type { MobileTab } from '~/utils/mobileNav'

defineProps<{ items: MobileTab[] }>()
const emit = defineEmits<{ select: [key: string] }>()

const TAB_CLASS = 'flex h-full w-full flex-col items-center justify-center gap-[3px] px-1 text-[11px] font-bold leading-none tracking-[.01em] transition-colors'
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(26,23,20,.06)] backdrop-blur-[12px] lg:hidden"
    aria-label="Navigation principale"
  >
    <ul class="mx-auto my-0 flex h-16 max-w-[560px] list-none items-stretch p-0">
      <li v-for="tab in items" :key="tab.key" class="min-w-0 flex-1">
        <NuxtLink
          v-if="tab.to"
          :to="tab.to"
          :class="[TAB_CLASS, tab.active ? 'text-green-700' : 'text-[var(--text-muted)]']"
          :aria-current="tab.active ? 'page' : undefined"
        >
          <span class="relative">
            <LayoutNavIcon :name="tab.icon" :size="25" />
            <span v-if="tab.badge" class="absolute -right-3 -top-1.5 min-w-[18px] rounded-pill border-2 border-white bg-clay-500 px-1 text-center text-[9.5px] font-black leading-[14px] text-white">{{ tab.badge }}</span>
          </span>
          <span class="max-w-full truncate">{{ tab.label }}</span>
        </NuxtLink>
        <button
          v-else
          type="button"
          :class="[TAB_CLASS, tab.active ? 'text-green-700' : 'text-[var(--text-muted)]']"
          @click="emit('select', tab.key)"
        >
          <span class="relative">
            <LayoutNavIcon :name="tab.icon" :size="25" />
            <span v-if="tab.badge" class="absolute -right-3 -top-1.5 min-w-[18px] rounded-pill border-2 border-white bg-clay-500 px-1 text-center text-[9.5px] font-black leading-[14px] text-white">{{ tab.badge }}</span>
          </span>
          <span class="max-w-full truncate">{{ tab.label }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>
