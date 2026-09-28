<script setup lang="ts">
/**
 * Barre d'onglets flottante en bas de l'écran, sous `lg` uniquement — la
 * navigation principale reste à portée de pouce sur mobile, comme dans une
 * application native. Un onglet sans `to` est un bouton (ex. « Menu », qui
 * ouvre le tiroir complet de l'espace) et émet `select`.
 *
 * Capsule en verre dépoli détachée des bords ; une pastille verte glisse d'un
 * onglet à l'autre (translation en % de sa propre largeur = 1/n de la barre,
 * donc sans mesure du DOM, et juste dès le rendu serveur).
 *
 * z-30 : au-dessus du contenu et des en-têtes collants (z-20), mais sous le
 * voile des tiroirs (z-40), des menus déroulants et des modales (z-[90]) —
 * ouvrir le tiroir recouvre donc la barre au lieu d'en masquer le bas.
 * Hauteur occupée : `--mobile-tabbar-space` (main.css), réservée par les layouts.
 */
import type { MobileTab } from '~/utils/mobileNav'

const props = defineProps<{ items: MobileTab[] }>()
const emit = defineEmits<{ select: [key: string] }>()

const NuxtLink = resolveComponent('NuxtLink')

const activeIndex = computed(() => props.items.findIndex(t => t.active))
const indicatorStyle = computed(() => ({
  width: `${100 / props.items.length}%`,
  transform: `translateX(${Math.max(activeIndex.value, 0) * 100}%)`,
  opacity: activeIndex.value < 0 ? 0 : 1
}))

const TAB_CLASS = 'group relative z-[1] flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-[10.5px] font-bold leading-none tracking-[.01em] transition-colors duration-300'
</script>

<template>
  <nav
    class="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] lg:hidden"
    aria-label="Navigation principale"
  >
    <div class="pointer-events-auto mx-auto max-w-[480px] rounded-[28px] border border-white/70 bg-white/[.86] p-1.5 shadow-[0_12px_32px_rgba(26,23,20,.16),0_2px_6px_rgba(26,23,20,.06)] backdrop-blur-xl backdrop-saturate-150">
      <ul class="relative m-0 flex h-[58px] list-none items-stretch p-0">
        <li
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 left-0 p-[3px] transition-[transform,opacity] duration-[420ms] ease-[var(--ease-standard)] motion-reduce:transition-none"
          :style="indicatorStyle"
        >
          <span class="block h-full w-full rounded-[20px] bg-[image:linear-gradient(150deg,var(--color-green-600),var(--color-green-800))] shadow-[0_6px_16px_rgba(26,93,62,.35)]" />
        </li>
        <li v-for="tab in items" :key="tab.key" class="min-w-0 flex-1">
          <component
            :is="tab.to ? NuxtLink : 'button'"
            v-bind="tab.to ? { to: tab.to, 'aria-current': tab.active ? 'page' : undefined } : { type: 'button' }"
            :class="[TAB_CLASS, tab.active ? 'text-white' : 'text-[var(--text-muted)]']"
            @click="tab.to ? undefined : emit('select', tab.key)"
          >
            <span class="relative transition-transform duration-200 ease-[var(--ease-standard)] group-active:scale-[.82]">
              <LayoutNavIcon :name="tab.icon" :size="23" />
              <span v-if="tab.badge" class="absolute -right-3 -top-1.5 min-w-[18px] rounded-pill border-2 border-white bg-clay-500 px-1 text-center text-[9.5px] font-black leading-[14px] text-white">{{ tab.badge }}</span>
            </span>
            <span class="max-w-full truncate">{{ tab.label }}</span>
          </component>
        </li>
      </ul>
    </div>
  </nav>
</template>
