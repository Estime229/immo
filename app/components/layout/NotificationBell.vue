<script setup lang="ts">
import { localizeNotification } from '~/composables/useNotificationsApi'

const notificationsApi = useNotificationsApi()
const block = useFetchBlock(() => notificationsApi.list())
onMounted(block.load)

const open = ref(false)
const unreadCount = computed(() => block.items.value.filter(n => !n.isRead).length)

function toggle() {
  open.value = !open.value
}

async function markOne(id: string) {
  const item = block.items.value.find(n => n.id === id)
  if (!item || item.isRead) return
  item.isRead = true // optimiste — la liste ne se recharge pas juste pour un accusé de lecture
  try {
    await notificationsApi.markRead(id)
  } catch {
    item.isRead = false
  }
}

const markingAll = ref(false)
async function markAll() {
  if (!unreadCount.value) return
  markingAll.value = true
  try {
    await notificationsApi.markAllRead()
    block.items.value.forEach(n => { n.isRead = true })
  } finally {
    markingAll.value = false
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Ferme le panneau au clic extérieur. */
const root = ref<HTMLElement | null>(null)
function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="root" class="relative">
    <button type="button" class="relative grid h-[38px] w-[38px] place-items-center rounded-pill border border-[var(--border-default)] bg-white text-[15px]" @click="toggle">
      🔔
      <span v-if="unreadCount" class="absolute -right-[3px] -top-[3px] grid h-4 w-4 place-items-center rounded-pill border-2 border-[var(--surface-page)] bg-clay-500 text-[9.5px] font-black text-white">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
    </button>

    <div v-if="open" class="absolute right-0 top-[46px] z-[80] w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white shadow-panel">
      <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <p class="m-0 text-sm font-bold">Notifications</p>
        <button v-if="unreadCount" type="button" class="text-[12px] font-bold text-green-700 disabled:opacity-50" :disabled="markingAll" @click="markAll">{{ markingAll ? '…' : 'Tout marquer lu' }}</button>
      </div>

      <div class="max-h-[360px] overflow-y-auto">
        <p v-if="block.state.value === 'loading'" class="px-4 py-6 text-center text-[13px] text-[var(--text-muted)]">Chargement…</p>
        <p v-else-if="block.state.value === 'error'" class="px-4 py-6 text-center text-[13px] text-danger-fg">Impossible de charger les notifications.</p>
        <p v-else-if="!block.items.value.length" class="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">Aucune notification.</p>
        <button
          v-for="n in block.items.value"
          :key="n.id"
          type="button"
          class="flex w-full items-start gap-2.5 border-b border-sand-100 px-4 py-3 text-left last:border-b-0"
          :class="n.isRead ? 'bg-white' : 'bg-green-50'"
          @click="markOne(n.id)"
        >
          <span class="mt-1.5 h-2 w-2 flex-none rounded-pill" :class="n.isRead ? 'bg-transparent' : 'bg-info-fg'" />
          <span class="min-w-0 flex-1">
            <span class="block text-[13px] font-bold">{{ localizeNotification(n.title) }}</span>
            <span class="mt-0.5 block text-[12.5px] leading-[1.4] text-[var(--text-muted)]">{{ localizeNotification(n.message) }}</span>
            <span class="mt-1 block text-[11px] text-[var(--text-faint)]">{{ formatDate(n.createdAt) }}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
