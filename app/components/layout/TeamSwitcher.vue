<script setup lang="ts">
import { Check, ChevronDown, User, Users } from '@lucide/vue'

/**
 * Sélecteur d'espace de l'en-tête pro : « Mon espace » ou l'une des équipes dont on est membre.
 * Masqué tant que le compte n'a aucune équipe. Dans une équipe, la liste « Mes biens » ne montre
 * que les biens assignés à notre poste (le serveur filtre) ; les biens personnels reviennent
 * en repassant sur « Mon espace ».
 */
const { memberships, activeTeam, switching, error, load, switchTo, teamLabel } = useTeamSwitch()
const open = ref(false)
onMounted(load)
</script>

<template>
  <div v-if="memberships.length" class="relative">
    <button
      type="button"
      class="inline-flex h-[38px] max-w-[210px] cursor-pointer items-center gap-2 rounded-pill border bg-white px-3 text-[13px] font-bold text-[var(--text-primary)] transition-colors hover:border-green-600"
      :class="activeTeam ? 'border-green-600' : 'border-[var(--border-default)]'"
      :aria-expanded="open"
      aria-haspopup="menu"
      aria-label="Changer d'espace"
      @click="open = !open"
    >
      <component :is="activeTeam ? Users : User" class="h-4 w-4 flex-none text-green-700" :stroke-width="2" />
      <span class="hidden min-w-0 truncate sm:inline">{{ activeTeam ? activeTeam.team.name : 'Mon espace' }}</span>
      <ChevronDown class="h-3.5 w-3.5 flex-none text-[var(--text-faint)]" :stroke-width="2" />
    </button>
    <template v-if="open">
      <div class="fixed inset-0 z-40" @click="open = false" />
      <div role="menu" class="absolute right-0 top-full z-50 mt-2 w-[280px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border-subtle)] bg-white p-1.5 shadow-panel">
        <p class="m-0 px-2.5 pb-1.5 pt-1 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Agir pour</p>
        <button type="button" role="menuitem" class="flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2.5 text-left hover:bg-sand-50 disabled:opacity-50" :disabled="switching" @click="switchTo(null)">
          <User class="h-4 w-4 flex-none text-green-700" :stroke-width="1.9" />
          <span class="min-w-0 flex-1"><span class="block text-[13.5px] font-bold">Mon espace</span><span class="block text-xs text-[var(--text-muted)]">Mes biens et ceux de mes mandats</span></span>
          <Check v-if="!activeTeam" class="h-4 w-4 flex-none text-green-700" :stroke-width="2.2" />
        </button>
        <button v-for="m in memberships" :key="m.membership_id" type="button" role="menuitem" class="flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2.5 text-left hover:bg-sand-50 disabled:opacity-50" :disabled="switching" @click="switchTo(m.team.id)">
          <Users class="h-4 w-4 flex-none text-green-700" :stroke-width="1.9" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13.5px] font-bold">{{ teamLabel(m).name }}</span>
            <span class="block truncate text-xs text-[var(--text-muted)]">{{ teamLabel(m).owner ? `Équipe de ${teamLabel(m).owner} · ` : '' }}{{ m.properties.length }} bien{{ m.properties.length > 1 ? 's' : '' }}</span>
          </span>
          <Check v-if="activeTeam?.team.id === m.team.id" class="h-4 w-4 flex-none text-green-700" :stroke-width="2.2" />
        </button>
        <p v-if="switching" class="m-0 px-2.5 py-2 text-xs text-[var(--text-muted)]">Changement d'espace…</p>
        <p v-if="error" class="m-0 px-2.5 py-2 text-xs font-semibold text-danger-fg">{{ error }}</p>
      </div>
    </template>
  </div>
</template>
