<script setup lang="ts">
/** Avatar cliquable avec déconnexion — pour les en-têtes des espaces connectés. */
interface Props {
  name: string
  size?: number
  color?: string
}
withDefaults(defineProps<Props>(), { size: 38, color: 'var(--color-green-700)' })

const auth = useAuthApi()
const open = ref(false)

async function handleLogout() {
  open.value = false
  await auth.logout()
  navigateTo('/')
}
</script>

<template>
  <div class="relative">
    <button type="button" class="block rounded-pill" @click="open = !open">
      <CoreAvatar :name="name" :size="size" :color="color" />
    </button>
    <template v-if="open">
      <div class="fixed inset-0 z-40" @click="open = false" />
      <div class="absolute right-0 top-full z-50 mt-2 w-52 animate-[im-rise_.2s_ease_both] rounded-xl border border-[var(--border-subtle)] bg-white p-1.5 shadow-panel">
        <button type="button" class="block w-full rounded-md px-3.5 py-2.5 text-left text-[13.5px] font-bold text-danger-fg hover:bg-sand-100" @click="handleLogout">
          Se déconnecter
        </button>
      </div>
    </template>
  </div>
</template>
