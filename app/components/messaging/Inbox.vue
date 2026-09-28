<script setup lang="ts">
/**
 * Messagerie commune aux trois espaces (Lot 54 pour pro et artisan, Lot 55 :
 * le locataire avait sa propre copie). Lot 55 : rafraîchissement automatique
 * (rien n'arrivait sans recharger la page), messages plus anciens au-delà de
 * 50, réactions, réponse citée et pièces jointes — tous gérés par l'API
 * sans écran jusqu'ici.
 */
import type { ConversationSummary, MessageItem } from '~/types/messaging'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { attachmentKind, mergeMessages, myReaction, newIncoming, QUICK_REACTIONS, quoteExcerpt, reactionChips, validateAttachment } from '~/utils/messaging'

const props = defineProps<{ space: 'locataire' | 'pro' | 'artisan' }>()

const messagingApi = useMessagingApi()
const preview = useProtectedFile()
const currentUser = useAuthUser()
const unread = useUnreadMessages()
const me = computed(() => currentUser.value?.id)

const route = useRoute()
const block = useFetchBlock(() => messagingApi.fetchConversations())
onMounted(async () => {
  await block.load()
  // Lien profond ?conversation= — utilisé depuis une visite, une réservation, un bail, un signalement…
  const wanted = String(route.query.conversation ?? '')
  const match = wanted ? block.items.value.find(c => c.id === wanted) : undefined
  const first = match ?? (window.matchMedia('(min-width: 1024px)').matches ? block.items.value[0] : undefined)
  if (first) pickThread(first)
})

const mobileView = ref<'list' | 'chat'>('list')
const activeId = ref<string | null>(null)
const activeConversation = computed(() => block.items.value.find(c => c.id === activeId.value) ?? null)
const propertyFilter = ref('')
const query = ref('')

const ROLE_LABEL: Record<string, string> = { tenant: 'Locataire', landlord: 'Propriétaire', agent: 'Agent', agency: 'Agence', artisan: 'Artisan', admin: 'Admin' }
const ROLE_COLOR: Record<string, string> = { tenant: '#8a2440', landlord: 'var(--color-green-700)', agency: 'var(--color-green-700)', agent: 'var(--color-clay-500)', admin: 'var(--color-info-fg)' }

function otherParticipant(c: ConversationSummary) {
  return c.participants.find(p => p.user_id !== me.value) ?? null
}
function threadName(c: ConversationSummary) {
  const p = otherParticipant(c)
  const name = p ? `${p.user.first_name ?? ''} ${p.user.last_name ?? ''}`.trim() : ''
  // Compte sans nom renseigné : son rôle plutôt qu'un « Conversation » anonyme.
  return name || (p?.role ? ROLE_LABEL[p.role] : '') || 'Conversation'
}
function threadRoleLabel(c: ConversationSummary) {
  const role = otherParticipant(c)?.role
  return role ? (ROLE_LABEL[role] ?? role) : ''
}
function threadSubject(c: ConversationSummary) {
  return c.unit?.name ?? c.property?.name ?? ''
}
function threadColor(c: ConversationSummary) {
  const role = otherParticipant(c)?.role
  return (role && ROLE_COLOR[role]) || 'var(--color-green-700)'
}
function senderName(senderId: string) {
  if (senderId === me.value) return 'Vous'
  const p = activeConversation.value?.participants.find(x => x.user_id === senderId)
  return (p?.user.first_name ?? '').trim() || (p?.role ? ROLE_LABEL[p.role] : '') || 'Correspondant'
}

const propertyOptions = computed(() => [...new Set(block.items.value.map(threadSubject).filter(Boolean))])
const filteredThreads = computed(() => {
  const q = query.value.trim().toLowerCase()
  return block.items.value.filter(c =>
    (!propertyFilter.value || threadSubject(c) === propertyFilter.value) &&
    (!q || threadName(c).toLowerCase().includes(q) || threadSubject(c).toLowerCase().includes(q))
  )
})

function formatThreadTime(c: ConversationSummary) {
  return new Date(c.last_message?.created_at ?? c.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
function lastMessagePreview(c: ConversationSummary) {
  const m = c.last_message
  if (!m) return 'Aucun message.'
  const prefix = m.sender?.id === me.value ? 'Vous : ' : ''
  return prefix + quoteExcerpt(m, 80)
}

/* ---- Messages du fil actif ---- */
const messages = ref<MessageItem[]>([])
const messagesState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const loadedPages = ref(1)
const totalPages = ref(1)
const loadingOlder = ref(false)
const scroller = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight })
}
function nearBottom() {
  const el = scroller.value
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120
}

async function markReadIfNeeded(c: ConversationSummary) {
  if (!c.unread_count) return
  try {
    await messagingApi.markRead(c.id)
    c.unread_count = 0
    unread.refresh()
  } catch {
    // Sans conséquence : le compteur se corrigera au prochain passage.
  }
}

async function pickThread(c: ConversationSummary) {
  activeId.value = c.id
  mobileView.value = 'chat'
  messagesState.value = 'loading'
  replyTo.value = null
  pickerFor.value = null
  sendError.value = ''
  try {
    // Page 1 = les messages les plus récents (vérifié en live, Lot 55).
    const page = await messagingApi.fetchMessages(c.id)
    if (activeId.value !== c.id) return
    messages.value = mergeMessages([], page.data)
    loadedPages.value = 1
    totalPages.value = page.totalPages || 1
    messagesState.value = 'success'
    scrollToBottom()
    await markReadIfNeeded(c)
  } catch {
    messagesState.value = 'error'
  }
}

async function loadOlder() {
  const c = activeConversation.value
  if (!c || loadedPages.value >= totalPages.value) return
  loadingOlder.value = true
  const el = scroller.value
  const before = el?.scrollHeight ?? 0
  try {
    const page = await messagingApi.fetchMessages(c.id, loadedPages.value + 1)
    messages.value = mergeMessages(messages.value, page.data)
    loadedPages.value++
    totalPages.value = page.totalPages || totalPages.value
    // Garde la position de lecture : le contenu ajouté au-dessus ne fait pas sauter l'écran.
    nextTick(() => { if (el) el.scrollTop += el.scrollHeight - before })
  } finally {
    loadingOlder.value = false
  }
}

/* ---- Rafraîchissement : fil actif toutes les 7 s, liste toutes les 20 s, onglet visible seulement ---- */
async function refreshActive() {
  const c = activeConversation.value
  if (!c || messagesState.value !== 'success') return
  try {
    const page = await messagingApi.fetchMessages(c.id)
    if (activeId.value !== c.id) return
    const incoming = newIncoming(messages.value, page.data, me.value)
    const stick = nearBottom()
    messages.value = mergeMessages(messages.value, page.data)
    totalPages.value = Math.max(totalPages.value, page.totalPages || 1)
    if (incoming) {
      if (stick) scrollToBottom()
      await messagingApi.markRead(c.id).catch(() => {})
      unread.refresh()
    }
  } catch {
    // Silencieux : le prochain passage réessaiera.
  }
}
async function refreshList() {
  try {
    const fresh = await messagingApi.fetchConversations()
    // La conversation ouverte est lue au fil de l'eau : pas de pastille dessus.
    for (const c of fresh) if (c.id === activeId.value) c.unread_count = 0
    block.items.value = fresh
  } catch {
    // idem
  }
}
let activeTimer: ReturnType<typeof setInterval> | null = null
let listTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  activeTimer = setInterval(() => { if (document.visibilityState === 'visible') refreshActive() }, 7000)
  listTimer = setInterval(() => { if (document.visibilityState === 'visible') refreshList() }, 20000)
})
onBeforeUnmount(() => {
  if (activeTimer) clearInterval(activeTimer)
  if (listTimer) clearInterval(listTimer)
})

/* ---- Envoi ---- */
const draft = ref('')
const sending = ref(false)
const sendError = ref('')
const replyTo = ref<MessageItem | null>(null)
const QUICK_REPLIES = ['Merci de votre message', 'Je reviens vers vous rapidement', 'Pouvez-vous préciser ?']
const showQuickReplies = computed(() => props.space !== 'locataire')

function afterSend(sent: MessageItem) {
  messages.value = mergeMessages(messages.value, [sent])
  replyTo.value = null
  scrollToBottom()
  const c = activeConversation.value
  if (c) {
    c.last_message = { id: sent.id, content: sent.content, type: sent.type, created_at: sent.created_at, sender: sent.sender }
    c.updated_at = sent.created_at
    // Remonte la conversation en tête, comme le fait l'API au prochain chargement.
    block.items.value = [c, ...block.items.value.filter(x => x.id !== c.id)]
  }
}

async function send(text?: string) {
  const content = (text ?? draft.value).trim()
  const c = activeConversation.value
  if (!content || !c || sending.value || c.status !== 'active') return
  if (content.length > 5000) { sendError.value = 'Message trop long : 5 000 caractères au maximum.'; return }
  sending.value = true
  sendError.value = ''
  try {
    const sent = await messagingApi.sendMessage(c.id, replyTo.value ? { content, reply_to_id: replyTo.value.id } : content)
    if (!text) draft.value = ''
    afterSend(sent)
  } catch (e) {
    sendError.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'envoi a échoué.") : "L'envoi a échoué."
  } finally {
    sending.value = false
  }
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}

/* ---- Pièce jointe : dépôt, puis message image/document ---- */
const uploading = ref(false)
async function attach(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const c = activeConversation.value
  if (!file || !c) return
  const invalid = validateAttachment(file)
  if (invalid) { sendError.value = invalid; return }
  uploading.value = true
  sendError.value = ''
  try {
    const kind = attachmentKind(file)
    const up = await messagingApi.uploadAttachment(file, kind)
    const sent = await messagingApi.sendMessage(c.id, {
      content: file.name,
      type: kind,
      metadata: { file_url: up.url, file_name: file.name },
      ...(replyTo.value ? { reply_to_id: replyTo.value.id } : {})
    })
    afterSend(sent)
  } catch (err) {
    sendError.value = err instanceof ApiRequestError ? errorText(err.mapped, "La pièce jointe n'a pas pu être envoyée.") : "La pièce jointe n'a pas pu être envoyée."
  } finally {
    uploading.value = false
  }
}

function attachmentLabel(m: MessageItem) {
  const fileName = m.metadata && typeof m.metadata.file_name === 'string' ? m.metadata.file_name : null
  return fileName || m.content || 'Pièce jointe'
}
const downloadingId = ref<string | null>(null)
async function downloadAttachment(messageId: string) {
  downloadingId.value = messageId
  await preview.load(messagingApi.attachmentDownloadUrl(messageId))
  if (preview.objectUrl.value) window.open(preview.objectUrl.value, '_blank')
  downloadingId.value = null
}

/* ---- Réactions : une par personne, en poser une autre remplace la précédente ---- */
const pickerFor = ref<string | null>(null)
async function toggleReaction(m: MessageItem, emoji: string) {
  pickerFor.value = null
  const mine = myReaction(m.reactions, me.value)
  try {
    const res = mine === emoji ? await messagingApi.unreact(m.id) : await messagingApi.react(m.id, emoji)
    // Remplacé, pas modifié en place : après une fusion (page précédente, sondage) la mutation n'était plus rendue.
    messages.value = messages.value.map(x => (x.id === m.id ? { ...x, reactions: res.reactions ?? [] } : x))
  } catch (e) {
    sendError.value = e instanceof ApiRequestError ? errorText(e.mapped, "La réaction n'a pas pu être enregistrée.") : "La réaction n'a pas pu être enregistrée."
  }
}
function startReply(m: MessageItem) {
  replyTo.value = m
  pickerFor.value = null
}

const STATUS_NOTE: Record<string, string> = {
  archived: 'Cette conversation est archivée — vous ne pouvez plus y écrire.',
  closed: 'Cette conversation est fermée — vous ne pouvez plus y écrire.'
}
</script>

<template>
  <div
    class="grid animate-[im-fade_.3s_ease_both] grid-cols-1 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white lg:grid-cols-[320px_1fr]"
    style="height: calc(100vh - 190px); min-height: 520px"
  >
    <div class="min-h-0 flex-col border-r border-[var(--border-subtle)] lg:flex" :class="mobileView === 'chat' ? 'hidden' : 'flex'">
      <div class="flex flex-col gap-2 p-4">
        <input v-model="query" placeholder="Rechercher un nom, un logement" aria-label="Rechercher une conversation" class="h-10 w-full rounded-pill border border-[var(--border-default)] bg-[var(--surface-input)] px-4 text-[13.5px] outline-none">
        <select v-if="propertyOptions.length > 1" v-model="propertyFilter" aria-label="Logement" class="h-10 w-full rounded-pill border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-[13px] font-semibold text-sand-900">
          <option value="">Tous les logements</option>
          <option v-for="p in propertyOptions" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5">
        <p v-if="block.state.value === 'loading'" class="px-3 py-4 text-[13px] text-[var(--text-muted)]">Chargement…</p>
        <p v-else-if="block.state.value === 'error'" class="px-3 py-4 text-[13px] text-danger-fg">
          Impossible de charger vos conversations.
          <button type="button" class="ml-1 font-bold underline" @click="block.load">Réessayer</button>
        </p>
        <p v-else-if="!filteredThreads.length" class="px-3 py-4 text-[13px] text-[var(--text-muted)]">
          {{ block.items.value.length ? 'Aucune conversation ne correspond.' : space === 'locataire' ? 'Aucune conversation. Écrivez à un propriétaire depuis une annonce, une visite ou votre bail.' : 'Aucune conversation pour l\'instant.' }}
        </p>
        <button
          v-for="c in filteredThreads"
          :key="c.id"
          type="button"
          class="flex w-full gap-3 rounded-md p-3.5 text-left"
          :class="c.id === activeId ? 'bg-green-50' : 'bg-transparent'"
          data-testid="thread"
          @click="pickThread(c)"
        >
          <CoreAvatar :name="threadName(c)" :size="40" :color="threadColor(c)" />
          <div class="min-w-0 flex-1">
            <div class="flex justify-between gap-2">
              <p class="m-0 truncate text-sm" :class="c.unread_count ? 'font-black' : 'font-bold'">{{ threadName(c) }}</p>
              <span class="whitespace-nowrap text-[11px] text-[var(--text-faint)]">{{ formatThreadTime(c) }}</span>
            </div>
            <p class="mb-0 mt-0.5 text-[11.5px] font-bold text-[var(--text-faint)]">{{ [threadRoleLabel(c), threadSubject(c)].filter(Boolean).join(' · ') }}</p>
            <p class="mb-0 mt-0.5 truncate text-[12.5px]" :class="c.unread_count ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'">{{ lastMessagePreview(c) }}</p>
          </div>
          <span v-if="c.unread_count" class="grid h-[19px] min-w-[19px] flex-none place-items-center self-center rounded-pill bg-clay-500 px-1 text-[10.5px] font-black text-white">{{ c.unread_count }}</span>
        </button>
      </div>
    </div>

    <div v-if="!activeConversation" class="hidden min-w-0 flex-1 place-items-center lg:grid">
      <p class="text-[13.5px] text-[var(--text-muted)]">Sélectionnez une conversation.</p>
    </div>

    <div v-else class="min-h-0 min-w-0 flex-col lg:flex" :class="mobileView === 'list' ? 'hidden' : 'flex'">
      <div class="flex items-center gap-3.5 border-b border-[var(--border-subtle)] px-5.5 py-3.5">
        <button type="button" class="grid h-9 w-9 flex-none place-items-center rounded-pill border border-[var(--border-default)] bg-white text-base lg:hidden" aria-label="Retour aux conversations" @click="mobileView = 'list'">←</button>
        <CoreAvatar :name="threadName(activeConversation)" :size="38" :color="threadColor(activeConversation)" />
        <div class="min-w-0 flex-1">
          <p class="m-0 truncate text-[15px] font-bold">{{ threadName(activeConversation) }}</p>
          <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">{{ [threadRoleLabel(activeConversation), threadSubject(activeConversation)].filter(Boolean).join(' · ') }}</p>
        </div>
      </div>

      <div ref="scroller" class="min-h-0 flex-1 space-y-3.5 overflow-y-auto bg-[var(--surface-input)] p-5.5" data-testid="messages">
        <p v-if="messagesState === 'loading'" class="text-center text-[13px] text-[var(--text-muted)]">Chargement…</p>
        <p v-else-if="messagesState === 'error'" class="text-center text-[13px] text-danger-fg">
          Impossible de charger les messages.
          <button type="button" class="ml-1 font-bold underline" @click="pickThread(activeConversation)">Réessayer</button>
        </p>
        <template v-else>
          <div v-if="loadedPages < totalPages" class="text-center">
            <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-1.5 text-xs font-bold disabled:opacity-60" :disabled="loadingOlder" @click="loadOlder">{{ loadingOlder ? 'Chargement…' : 'Messages précédents' }}</button>
          </div>
          <div v-for="m in messages" :key="m.id" class="group max-w-[78%] sm:max-w-[66%]" :class="m.type === 'system' ? 'mx-auto max-w-full' : m.sender_id === me ? 'ml-auto' : 'mr-auto'" data-testid="message">
            <p v-if="m.type === 'system'" class="mx-auto mb-0 max-w-full text-center text-[12px] italic text-[var(--text-faint)]">{{ m.content }}</p>
            <template v-else>
              <div v-if="m.reply_to" class="mb-1 rounded-md border-l-[3px] border-green-600 bg-white/70 px-3 py-1.5 text-[12px] text-[var(--text-muted)]" :class="m.sender_id === me ? 'ml-auto' : ''">
                <span class="font-bold">{{ senderName(m.reply_to.sender_id) }}</span> · {{ quoteExcerpt(m.reply_to) }}
              </div>
              <div
                v-if="m.type === 'text'"
                class="whitespace-pre-wrap px-4.5 py-3.5 text-[14.5px] leading-[1.5] [overflow-wrap:anywhere]"
                :class="m.sender_id === me ? 'ml-auto rounded-[16px_16px_5px_16px] bg-[image:var(--action-primary)] text-white' : 'mr-auto rounded-[16px_16px_16px_5px] border border-[var(--border-subtle)] bg-white text-[var(--text-primary)]'"
              >{{ m.content }}</div>
              <div v-else class="flex items-center gap-3 rounded-md border border-[var(--border-subtle)] bg-white p-3.5">
                <div class="grid h-[44px] w-[38px] flex-none place-items-center rounded-xs border border-[var(--border-default)] bg-[var(--surface-page)] text-[9.5px] font-black text-danger-fg">{{ m.type === 'image' ? 'IMG' : 'DOC' }}</div>
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-[13px] font-bold">{{ attachmentLabel(m) }}</p>
                </div>
                <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold" :disabled="downloadingId === m.id" @click="downloadAttachment(m.id)">{{ downloadingId === m.id ? '…' : 'Ouvrir' }}</button>
              </div>

              <div class="mt-1 flex flex-wrap items-center gap-1.5" :class="m.sender_id === me ? 'justify-end' : 'justify-start'">
                <button
                  v-for="chip in reactionChips(m.reactions, me)"
                  :key="chip.emoji"
                  type="button"
                  class="rounded-pill border px-2 py-0.5 text-[12px]"
                  :class="chip.mine ? 'border-green-600 bg-green-50' : 'border-[var(--border-subtle)] bg-white'"
                  :title="chip.mine ? 'Retirer ma réaction' : 'Réagir pareil'"
                  @click="toggleReaction(m, chip.emoji)"
                >{{ chip.emoji }}<template v-if="chip.count > 1"> {{ chip.count }}</template></button>
                <span class="text-[11px] text-[var(--text-faint)]">{{ formatMsgTime(m.created_at) }}</span>
                <button type="button" class="rounded-pill px-1.5 text-[12px] text-[var(--text-faint)] hover:text-[var(--text-primary)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" aria-label="Réagir" @click="pickerFor = pickerFor === m.id ? null : m.id">☺</button>
                <button v-if="activeConversation.status === 'active'" type="button" class="rounded-pill px-1.5 text-[12px] text-[var(--text-faint)] hover:text-[var(--text-primary)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" aria-label="Répondre" @click="startReply(m)">↩</button>
              </div>
              <div v-if="pickerFor === m.id" class="mt-1 flex gap-1 rounded-pill border border-[var(--border-subtle)] bg-white p-1 shadow-sm" :class="m.sender_id === me ? 'ml-auto w-fit' : 'w-fit'" role="menu">
                <button v-for="e in QUICK_REACTIONS" :key="e" type="button" class="rounded-pill px-1.5 py-0.5 text-[16px] hover:bg-sand-200" :class="myReaction(m.reactions, me) === e ? 'bg-green-50' : ''" @click="toggleReaction(m, e)">{{ e }}</button>
              </div>
            </template>
          </div>
          <p v-if="!messages.length" class="text-center text-[13px] text-[var(--text-muted)]">Aucun message pour l'instant.</p>
        </template>
      </div>

      <div v-if="activeConversation.status !== 'active'" class="border-t border-[var(--border-subtle)] px-5.5 py-4 text-center text-[13px] text-[var(--text-muted)]">
        {{ STATUS_NOTE[activeConversation.status] }}
      </div>
      <div v-else class="border-t border-[var(--border-subtle)] px-4 py-3 sm:px-5.5">
        <p v-if="sendError" class="mb-2 mt-0 text-[12.5px] font-semibold text-danger-fg">{{ sendError }}</p>
        <div v-if="replyTo" class="mb-2 flex items-center gap-2 rounded-md border-l-[3px] border-green-600 bg-[var(--surface-page)] px-3 py-1.5 text-[12px] text-[var(--text-muted)]">
          <span class="min-w-0 flex-1 truncate">Réponse à <strong>{{ senderName(replyTo.sender_id) }}</strong> · {{ quoteExcerpt(replyTo) }}</span>
          <button type="button" class="text-[13px]" aria-label="Annuler la réponse" @click="replyTo = null">✕</button>
        </div>
        <div v-if="showQuickReplies" class="mb-2.5 flex flex-wrap gap-1.5">
          <button v-for="q in QUICK_REPLIES" :key="q" type="button" class="rounded-pill border border-[var(--border-default)] bg-[var(--surface-page)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]" :disabled="sending" @click="send(q)">{{ q }}</button>
        </div>
        <div class="flex items-end gap-2">
          <label class="grid h-[46px] w-[46px] flex-none cursor-pointer place-items-center rounded-pill border border-[var(--border-default)] bg-white text-lg" :class="uploading ? 'opacity-60' : ''" :title="uploading ? 'Envoi…' : 'Joindre une photo ou un PDF'">
            {{ uploading ? '…' : '📎' }}
            <input type="file" accept="image/*,application/pdf" class="hidden" :disabled="uploading" aria-label="Joindre une photo ou un PDF" @change="attach">
          </label>
          <textarea
            v-model="draft"
            rows="1"
            maxlength="5000"
            placeholder="Écrire un message…"
            aria-label="Message"
            class="max-h-[140px] min-h-[46px] flex-1 resize-none rounded-[23px] border border-[var(--border-default)] bg-[var(--surface-input)] px-5 py-3 text-[14.5px] leading-[1.45] outline-none"
            :disabled="sending"
            @keydown="onKeydown"
          />
          <button type="button" class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-[image:var(--action-primary)] text-lg text-white disabled:opacity-60" aria-label="Envoyer" :disabled="sending || !draft.trim()" @click="send()">↑</button>
        </div>
      </div>
    </div>
  </div>
</template>
