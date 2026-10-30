<script setup lang="ts">
/**
 * Boîte de réception du formulaire de contact. On lit le message, on répond depuis sa
 * messagerie (lien mailto, l'API n'envoie pas de réponse), puis on le marque traité :
 * le message suivant s'ouvre aussitôt. Vue et page dans l'URL (`?status=handled&page=2`).
 */
import { ChevronDown, Mail, Search } from '@lucide/vue'
import { contactReplyHref, type ContactMessage } from '~/composables/useContact'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'manage:contact' })

const route = useRoute()
const router = useRouter()
const { fetchMessages, markHandled } = useContact()
const { counts, refresh: refreshCounts } = useAdminCounts()

const PAGE_SIZE = 20
type View = 'pending' | 'handled'

const view = computed<View>(() => (route.query.status === 'handled' ? 'handled' : 'pending'))
const page = computed(() => Math.max(1, Number.parseInt(typeof route.query.page === 'string' ? route.query.page : '', 10) || 1))

function setQuery(next: { view?: View; page?: number }) {
  const v = next.view ?? view.value
  const p = next.page ?? page.value
  const query: Record<string, string> = {}
  if (v === 'handled') query.status = 'handled'
  if (p > 1) query.page = String(p)
  router.replace({ query })
}
function setView(v: string) {
  flash.value = ''
  setQuery({ view: v === 'handled' ? 'handled' : 'pending', page: 1 })
}
function goToPage(p: number) {
  flash.value = ''
  setQuery({ page: p })
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

/* ---------- Chargement ---------- */
const messages = ref<ContactMessage[]>([])
const total = ref(0)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const openId = ref<string | null>(null)
let requestId = 0

async function load(silent = false) {
  const id = ++requestId
  if (!silent) state.value = 'loading'
  try {
    const res = await fetchMessages({ handled: view.value === 'handled', page: page.value, limit: PAGE_SIZE })
    if (id !== requestId) return
    messages.value = res.data
    total.value = res.total
    state.value = 'ready'
    if (!res.data.length && res.total > 0 && page.value > 1) {
      setQuery({ page: pageCount(res.total, PAGE_SIZE) })
      return
    }
    // File à traiter : le premier message s'ouvre d'office, on enchaîne sans chercher.
    if (!openId.value || !res.data.some(m => m.id === openId.value)) {
      openId.value = view.value === 'pending' ? res.data[0]?.id ?? null : null
    }
  } catch {
    if (id === requestId && !silent) state.value = 'error'
  }
}

watch(() => `${view.value}|${page.value}`, () => {
  openId.value = null
  load()
})
onMounted(() => load())

const pages = computed(() => pageCount(total.value, PAGE_SIZE))
/** Dans la vue « À traiter », le total de la liste fait foi ; ailleurs, le compteur du menu. */
const pendingCount = computed(() => (view.value === 'pending' && state.value === 'ready' ? total.value : counts.value.contact))
const viewOptions = computed(() => [
  { value: 'pending', label: pendingCount.value ? `À traiter (${pendingCount.value})` : 'À traiter' },
  { value: 'handled', label: 'Traités' }
])

function toggle(id: string) {
  openId.value = openId.value === id ? null : id
  actionError.value = null
}

function shortDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}
function longDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/* ---------- Traiter puis passer au suivant ---------- */
const handlingId = ref<string | null>(null)
const actionError = ref<{ id: string; message: string } | null>(null)
const flash = ref('')

async function handle(m: ContactMessage) {
  handlingId.value = m.id
  actionError.value = null
  flash.value = ''
  const index = messages.value.findIndex(x => x.id === m.id)
  try {
    await markHandled(m.id)
    messages.value = messages.value.filter(x => x.id !== m.id)
    total.value = Math.max(0, total.value - 1)
    const next = messages.value[index] ?? messages.value[index - 1] ?? null
    openId.value = next?.id ?? null
    flash.value = next
      ? `Message de ${m.name} marqué comme traité. Le suivant est ouvert ci-dessous.`
      : `Message de ${m.name} marqué comme traité.`
    refreshCounts()
    // Page vidée alors qu'il reste des messages ailleurs : on recharge pour les faire remonter.
    if (!messages.value.length && total.value > 0) load(true)
    if (next) nextTick(() => document.getElementById(`message-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  } catch (e: any) {
    actionError.value = { id: m.id, message: e?.message || "Le message n'a pas pu être marqué comme traité." }
  } finally {
    handlingId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 flex flex-wrap items-center justify-between gap-3">
      <FormsSegmentedControl :model-value="view" :options="viewOptions" size="sm" @update:model-value="setView" />
      <p v-if="state === 'ready' && total" class="m-0 text-[13px] text-[var(--text-muted)]">
        <span class="font-mono font-bold text-[var(--text-primary)]">{{ total }}</span>
        message{{ total > 1 ? 's' : '' }} {{ view === 'pending' ? 'à traiter' : `traité${total > 1 ? 's' : ''}` }}
      </p>
    </div>

    <p v-if="flash" class="mb-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>

    <div v-if="state === 'loading'" class="flex flex-col gap-3">
      <DataSkeletonCard v-for="i in 4" :key="i" :height="76" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger les messages pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load()">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="!messages.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      {{ view === 'pending' ? 'Aucun message à traiter : la boîte de réception est à jour.' : 'Aucun message traité pour l\'instant.' }}
    </p>

    <template v-else>
      <article
        v-for="m in messages"
        :id="`message-${m.id}`"
        :key="m.id"
        class="mb-3 rounded-xl border bg-white transition-colors"
        :class="openId === m.id ? 'border-[var(--border-default)] shadow-card' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'"
      >
        <button
          type="button"
          class="flex w-full items-start gap-3 px-4.5 py-4 text-left"
          :aria-expanded="openId === m.id"
          :aria-controls="`message-body-${m.id}`"
          @click="toggle(m.id)"
        >
          <CoreAvatar :name="m.name" :size="38" />
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <p class="m-0 min-w-0 flex-1 truncate text-sm font-bold">{{ m.name }}</p>
              <span class="flex-none font-mono text-xs text-[var(--text-faint)]">{{ shortDate(m.created_at) }}</span>
            </div>
            <p class="mb-0 mt-0.5 truncate text-[13.5px] font-semibold text-[var(--text-secondary)]">{{ m.subject || 'Sans objet' }}</p>
            <p v-if="openId !== m.id" class="mb-0 mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{{ m.message }}</p>
          </div>
          <ChevronDown class="mt-1 h-4 w-4 flex-none text-[var(--text-faint)] transition-transform" :class="openId === m.id ? 'rotate-180' : ''" :stroke-width="1.9" />
        </button>

        <div v-if="openId === m.id" :id="`message-body-${m.id}`" class="border-t border-sand-200 px-4.5 pb-4.5 pt-4">
          <p class="mb-3 mt-0 text-xs text-[var(--text-faint)] [overflow-wrap:anywhere]">
            De <a :href="`mailto:${m.email}`" class="font-semibold text-green-700 hover:underline">{{ m.email }}</a>
            · reçu le {{ longDate(m.created_at) }}
          </p>
          <p class="m-0 whitespace-pre-line text-sm leading-[1.6] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{{ m.message }}</p>
          <p v-if="m.handled_at" class="mb-0 mt-3 text-xs text-[var(--text-faint)]">Traité le <span class="font-mono">{{ shortDate(m.handled_at) }}</span></p>

          <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-sand-200 pt-4">
            <a :href="contactReplyHref(m)" class="inline-flex h-9 items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 text-[13px] font-bold text-sand-900 hover:bg-sand-50">
              <Mail class="h-4 w-4" :stroke-width="1.9" /> Répondre par email
            </a>
            <AdminButton v-if="!m.handled_at" size="sm" :loading="handlingId === m.id" @click="handle(m)">Marquer comme traité</AdminButton>
            <NuxtLink :to="{ path: '/admin/utilisateurs', query: { q: m.email } }" class="inline-flex items-center gap-1.5 px-1 text-[12.5px] font-bold text-green-700">
              <Search class="h-3.5 w-3.5" :stroke-width="1.9" /> Chercher un compte avec cet email
            </NuxtLink>
          </div>
          <p v-if="actionError?.id === m.id" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
        </div>
      </article>

      <AdminPagination :page="page" :page-count="pages" @update:page="goToPage" />
    </template>
  </div>
</template>
