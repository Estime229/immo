<script setup lang="ts">
import { navBadgeLabel, TENANT_TABS } from '~/utils/proNav'

/**
 * Onglets « Demandes · Visites · Candidatures », en tête des trois pages réunies
 * sous l'entrée de menu « Locataires » (audit UX). Ce sont des liens, pas un état
 * local : chaque page garde son URL, ses propres filtres (`?tab=`, `?ville=`…) et
 * les liens des notifications continuent d'y mener.
 *
 * Volontairement soulignés plutôt qu'en pilule : les pages Visites et
 * Candidatures ont déjà, juste dessous, leur propre sélecteur en pilule
 * (À traiter, À venir…). Deux rangées de pilules empilées se confondaient.
 */
const route = useRoute()
const { counts } = useProTenantCounts()
</script>

<template>
  <nav aria-label="Locataires" class="mb-5 max-w-full overflow-x-auto border-b border-[var(--border-subtle)]">
    <ul class="m-0 flex list-none gap-1 p-0">
      <li v-for="t in TENANT_TABS" :key="t.key" class="flex-none">
        <NuxtLink
          :to="t.to"
          class="-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-bold transition-colors duration-[var(--duration-base)]"
          :class="route.path === t.to ? 'border-green-700 text-green-800' : 'border-transparent text-[var(--text-secondary)] hover:text-green-800'"
          :aria-current="route.path === t.to ? 'page' : undefined"
        >
          {{ t.label }}
          <span
            v-if="navBadgeLabel(counts[t.key])"
            class="rounded-pill px-[7px] py-0.5 font-mono text-[10.5px] font-black"
            :class="route.path === t.to ? 'bg-green-50 text-green-800' : 'bg-sand-200 text-[var(--text-secondary)]'"
          >{{ navBadgeLabel(counts[t.key]) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
