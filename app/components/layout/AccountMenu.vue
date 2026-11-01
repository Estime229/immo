<script setup lang="ts">
import { ArrowLeftRight, Lightbulb } from '@lucide/vue'
import type { UserRole } from '~/types/auth'
import { roleHomePath, roleLabel } from '~/utils/roleRoutes'
/**
 * Menu du compte des espaces connectés — pilule « ☰ + avatar », la même que l'en-tête public
 * (SiteHeader) : un avatar seul ne se lisait pas comme cliquable.
 */
interface Props {
  name: string
  color?: string
}
withDefaults(defineProps<Props>(), { color: 'var(--color-green-700)' })

const auth = useAuthApi()
const guide = useGuideMode()
const open = ref(false)

/** Comptes à plusieurs rôles (locataire + propriétaire…) : GET /auth/roles n'est interrogé qu'à l'ouverture du menu. */
const otherRoles = ref<UserRole[]>([])
const rolesLoaded = ref(false)
const switchingRole = ref(false)
const switchError = ref('')

async function toggle() {
  open.value = !open.value
  if (!open.value || rolesLoaded.value || !auth.user.value) return
  try {
    const res = await auth.fetchRoles()
    otherRoles.value = res.roles.filter(r => r !== res.active_role)
    rolesLoaded.value = true
  } catch {
    // Silencieux : sans la liste des rôles, le menu garde la déconnexion seule.
  }
}

async function pickRole(role: UserRole) {
  if (switchingRole.value) return
  switchingRole.value = true
  switchError.value = ''
  try {
    await auth.switchRole(role)
    rolesLoaded.value = false
    open.value = false
    await navigateTo(roleHomePath(role))
  } catch {
    switchError.value = 'Le changement d\'espace a échoué. Réessayez.'
  } finally {
    switchingRole.value = false
  }
}

async function handleLogout() {
  open.value = false
  await auth.logout()
  navigateTo('/')
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="relative flex items-center gap-[9px] rounded-pill border bg-white py-[5px] pl-[13px] pr-[6px] shadow-card transition-[box-shadow,border-color] duration-[var(--duration-base)] hover:shadow-raised"
      :class="open ? 'border-green-600 shadow-raised' : 'border-[var(--border-default)]'"
      :aria-expanded="open"
      aria-label="Mon compte"
      @click="toggle"
    >
      <!-- Les trois traits se croisent en ✕ quand le menu est ouvert. -->
      <span class="flex flex-col gap-[3px]">
        <span class="h-0.5 w-4 rounded-sm bg-sand-900 transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]" :class="open ? 'translate-y-[5px] rotate-45' : ''" />
        <span class="h-0.5 w-4 rounded-sm bg-sand-900 transition-[opacity,transform] duration-[var(--duration-base)]" :class="open ? 'scale-x-0 opacity-0' : ''" />
        <span class="h-0.5 w-4 rounded-sm bg-sand-900 transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]" :class="open ? '-translate-y-[5px] -rotate-45' : ''" />
      </span>
      <CoreAvatar :name="name" :avatar-url="auth.user.value?.avatar_url" :size="32" :color="color" />
    </button>
    <template v-if="open">
      <div class="fixed inset-0 z-40" @click="open = false" />
      <div class="absolute right-0 top-full z-50 mt-2 w-60 animate-[im-rise_.2s_ease_both] rounded-xl border border-[var(--border-subtle)] bg-white p-1.5 shadow-panel">
        <template v-if="otherRoles.length">
          <p class="mb-1 mt-1 px-3.5 text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Basculer vers</p>
          <button
            v-for="r in otherRoles"
            :key="r"
            type="button"
            class="flex w-full items-center gap-2.5 rounded-md px-3.5 py-2.5 text-left text-[13.5px] font-semibold hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="switchingRole"
            @click="pickRole(r)"
          >
            <ArrowLeftRight class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
            {{ switchingRole ? 'Changement…' : `Espace ${roleLabel(r)}` }}
          </button>
          <p v-if="switchError" class="m-0 px-3.5 pb-1.5 text-xs font-semibold text-danger-fg">{{ switchError }}</p>
          <div class="my-1.5 h-px bg-sand-200" />
        </template>
        <button type="button" role="switch" :aria-checked="guide.enabled.value" class="flex w-full items-center gap-2.5 rounded-md px-3.5 py-2.5 text-left text-[13.5px] font-semibold hover:bg-sand-100" @click="guide.toggle()">
          <Lightbulb class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
          <span class="flex-1">Mode guide</span>
          <span class="relative h-5 w-9 flex-none rounded-pill transition-colors" :class="guide.enabled.value ? 'bg-green-700' : 'bg-sand-400'">
            <span class="absolute top-0.5 h-4 w-4 rounded-pill bg-white shadow-hairline transition-all" :class="guide.enabled.value ? 'left-[18px]' : 'left-0.5'" />
          </span>
        </button>
        <div class="my-1.5 h-px bg-sand-200" />
        <button type="button" class="block w-full rounded-md px-3.5 py-2.5 text-left text-[13.5px] font-bold text-danger-fg hover:bg-sand-100" @click="handleLogout">
          Se déconnecter
        </button>
      </div>
    </template>
  </div>
</template>
