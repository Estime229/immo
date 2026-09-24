<script setup lang="ts">
import type { ConversationSummary, MessageItem } from '~/types/messaging'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'locataire' })

const route = useRoute()
const messagingApi = useMessagingApi()
const preview = useProtectedFile()
const currentUser = useAuthUser()

const block = useFetchBlock(() => messagingApi.fetchConversations())
onMounted(async () => {
  await block.load()
  const wanted = String(route.query.conversation ?? '')
  const match = wanted && block.items.value.find(c => c.id === wanted)
  if (match) pickThread(match)
  else if (block.items.value[0]) pickThread(block.items.value[0])
})

const query = ref('')
const mobileView = ref<'list' | 'chat'>('list')
const activeId = ref<string | null>(null)
const activeConversation = computed(() => block.items.value.find(c => c.id === activeId.value) ?? null)

function otherParticipant(c: ConversationSummary) {
  return c.participants.find(p => p.user_id !== currentUser.value?.id)?.user ?? null
}
function threadName(c: ConversationSummary) {
  const u = otherParticipant(c)
  const name = u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : ''
  return name || 'Conversation'
}
function threadSubject(c: ConversationSummary) {
  return c.unit?.name ?? c.property?.name ?? ''
}
function threadColor(c: ConversationSummary) {
  const u = otherParticipant(c)
  const roleColors: Record<string, string> = { landlord: 'var(--color-green-700)', agency: 'var(--color-green-700)', agent: 'var(--color-clay-500)', admin: 'var(--color-info-fg)', tenant: '#8a2440' }
  const role = c.participants.find(p => p.user_id !== currentUser.value?.id)?.role
  return u && role ? (roleColors[role] ?? 'var(--color-green-700)') : 'var(--color-green-700)'
}

const filteredThreads = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return block.items.value
  return block.items.value.filter(c => threadName(c).toLowerCase().includes(q) || threadSubject(c).toLowerCase().includes(q))
})

function formatThreadTime(c: ConversationSummary) {
  return new Date(c.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/* ---- Messages du fil actif ---- */
const messages = ref<MessageItem[]>([])
const messagesState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')

async function pickThread(c: ConversationSummary) {
  activeId.value = c.id
  mobileView.value = 'chat'
  messagesState.value = 'loading'
  try {
    const page = await messagingApi.fetchMessages(c.id)
    messages.value = page.data
    messagesState.value = 'success'
    if (c.unread_count > 0) {
      await messagingApi.markRead(c.id)
      c.unread_count = 0
    }
  } catch {
    messagesState.value = 'error'
  }
}

const draft = ref('')
const sending = ref(false)
const sendError = ref('')

async function send() {
  const content = draft.value.trim()
  if (!content || !activeConversation.value || sending.value) return
  if (activeConversation.value.status !== 'active') return
  sending.value = true
  sendError.value = ''
  try {
    const sent = await messagingApi.sendMessage(activeConversation.value.id, content)
    messages.value = [...messages.value, sent]
    draft.value = ''
  } catch (e) {
    sendError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'envoi a échoué.") : "L'envoi a échoué."
  } finally {
    sending.value = false
  }
}

function attachmentLabel(m: MessageItem) {
  const fileName = m.metadata && typeof m.metadata.file_name === 'string' ? m.metadata.file_name : null
  return m.content || fileName || 'Pièce jointe'
}

const downloadingId = ref<string | null>(null)
async function downloadAttachment(messageId: string) {
  downloadingId.value = messageId
  await preview.load(messagingApi.attachmentDownloadUrl(messageId))
  if (preview.objectUrl.value) window.open(preview.objectUrl.value, '_blank')
  downloadingId.value = null
}

const STATUS_NOTE: Record<string, string> = {
  archived: 'Cette conversation est archivée — vous ne pouvez plus y écrire.',
  closed: 'Cette conversation est fermée — vous ne pouvez plus y écrire.'
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="grid grid-cols-1 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white lg:grid-cols-[320px_1fr]" style="height: calc(100vh - 200px); min-height: 520px">
      <div class="flex-col border-r border-[var(--border-subtle)] lg:flex" :class="mobileView === 'chat' ? 'hidden' : 'flex'">
        <div class="p-4.5 pb-3">
          <input v-model="query" placeholder="Rechercher" class="h-10 w-full rounded-pill border border-[var(--border-default)] bg-[var(--surface-input)] px-4 text-[13.5px] outline-none">
        </div>
        <div class="flex-1 overflow-y-auto px-2.5 pb-2.5">
          <p v-if="block.state.value === 'loading'" class="px-3 py-4 text-[13px] text-[var(--text-muted)]">Chargement…</p>
          <p v-else-if="block.state.value === 'error'" class="px-3 py-4 text-[13px] text-danger-fg">Impossible de charger vos conversations.</p>
          <p v-else-if="!filteredThreads.length" class="px-3 py-4 text-[13px] text-[var(--text-muted)]">Aucune conversation.</p>
          <button
            v-for="c in filteredThreads"
            :key="c.id"
            type="button"
            class="flex w-full gap-3 rounded-md p-3.5 text-left transition-colors"
            :class="c.id === activeId ? 'bg-green-50' : 'bg-transparent'"
            @click="pickThread(c)"
          >
            <CoreAvatar :name="threadName(c)" :size="40" :color="threadColor(c)" />
            <div class="min-w-0 flex-1">
              <div class="flex justify-between gap-2">
                <p class="m-0 truncate text-sm font-bold">{{ threadName(c) }}</p>
                <span class="whitespace-nowrap text-[11px] text-[var(--text-faint)]">{{ formatThreadTime(c) }}</span>
              </div>
              <p v-if="threadSubject(c)" class="mb-0 mt-1 text-[11.5px] font-bold text-[var(--text-faint)]">{{ threadSubject(c) }}</p>
              <p class="mb-0 mt-0.5 truncate text-[12.5px] text-[var(--text-muted)]">{{ c.last_message?.content ?? 'Aucun message.' }}</p>
            </div>
            <span v-if="c.unread_count" class="grid h-[19px] w-[19px] flex-none place-items-center self-center rounded-pill bg-clay-500 text-[10.5px] font-black text-white">{{ c.unread_count }}</span>
          </button>
        </div>
      </div>

      <div v-if="!activeConversation" class="hidden min-w-0 flex-1 place-items-center lg:grid">
        <p class="text-[13.5px] text-[var(--text-muted)]">Sélectionnez une conversation.</p>
      </div>

      <div v-else class="min-w-0 flex-col lg:flex" :class="mobileView === 'list' ? 'hidden' : 'flex'">
        <div class="flex items-center gap-3.5 border-b border-[var(--border-subtle)] px-5.5 py-4">
          <button type="button" class="grid h-9 w-9 flex-none place-items-center rounded-pill border border-[var(--border-default)] bg-white text-base lg:hidden" @click="mobileView = 'list'">←</button>
          <CoreAvatar :name="threadName(activeConversation)" :size="38" :color="threadColor(activeConversation)" />
          <div class="flex-1">
            <p class="m-0 text-[15px] font-bold">{{ threadName(activeConversation) }}</p>
            <p v-if="threadSubject(activeConversation)" class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-faint)]">{{ threadSubject(activeConversation) }}</p>
          </div>
        </div>

        <div class="flex-1 space-y-3.5 overflow-y-auto bg-[var(--surface-input)] p-5.5">
          <p v-if="messagesState === 'loading'" class="text-center text-[13px] text-[var(--text-muted)]">Chargement…</p>
          <p v-else-if="messagesState === 'error'" class="text-center text-[13px] text-danger-fg">Impossible de charger les messages.</p>
          <template v-else>
            <div v-for="m in messages" :key="m.id" class="max-w-[66%]" :class="m.sender_id === currentUser?.id ? 'ml-auto' : 'mr-auto'">
              <p v-if="m.type === 'system'" class="mx-auto mb-0 max-w-full text-center text-[12px] italic text-[var(--text-faint)]">{{ m.content }}</p>
              <template v-else>
                <div
                  v-if="m.type === 'text'"
                  class="px-4.5 py-3.5 text-[14.5px] leading-[1.55]"
                  :class="m.sender_id === currentUser?.id ? 'rounded-[16px_16px_5px_16px] bg-[image:var(--action-primary)] text-white' : 'rounded-[16px_16px_16px_5px] border border-[var(--border-subtle)] bg-white text-[var(--text-primary)]'"
                >{{ m.content }}</div>
                <div v-else class="flex items-center gap-3 rounded-md border border-[var(--border-subtle)] bg-white p-3.5">
                  <div class="grid h-[44px] w-[38px] flex-none place-items-center rounded-xs border border-[var(--border-default)] bg-[var(--surface-page)] text-[9.5px] font-black text-danger-fg">{{ m.type === 'image' ? 'IMG' : 'DOC' }}</div>
                  <div class="min-w-0 flex-1">
                    <p class="m-0 truncate text-[13px] font-bold">{{ attachmentLabel(m) }}</p>
                  </div>
                  <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold" :disabled="downloadingId === m.id" @click="downloadAttachment(m.id)">{{ downloadingId === m.id ? '…' : 'Télécharger' }}</button>
                </div>
                <p class="mb-0 mt-1.5 text-[11px] text-[var(--text-faint)]" :class="m.sender_id === currentUser?.id ? 'text-right' : 'text-left'">{{ formatMsgTime(m.created_at) }}</p>
              </template>
            </div>
            <p v-if="!messages.length" class="text-center text-[13px] text-[var(--text-muted)]">Aucun message pour l'instant.</p>
          </template>
        </div>

        <div v-if="activeConversation.status !== 'active'" class="border-t border-[var(--border-subtle)] px-5.5 py-4 text-center text-[13px] text-[var(--text-muted)]">
          {{ STATUS_NOTE[activeConversation.status] }}
        </div>
        <div v-else class="border-t border-[var(--border-subtle)] px-5.5 py-4">
          <p v-if="sendError" class="mb-2 mt-0 text-[12.5px] font-semibold text-danger-fg">{{ sendError }}</p>
          <div class="flex items-center gap-2.5">
            <input
              v-model="draft"
              placeholder="Écrire un message…"
              class="flex-1 rounded-pill border border-[var(--border-default)] bg-[var(--surface-input)] px-5 py-3.5 text-[14.5px] outline-none"
              :disabled="sending"
              @keydown.enter="send"
            >
            <button type="button" class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-[image:var(--action-primary)] text-lg text-white disabled:opacity-60" :disabled="sending || !draft.trim()" @click="send">↑</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
