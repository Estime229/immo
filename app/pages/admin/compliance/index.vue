<script setup lang="ts">
/**
 * Demandes de suppression de compte (droit à l'effacement). L'API exécute seule une demande
 * sans blocant ; restent à instruire celles qu'un bail actif ou un solde de wallet bloque.
 * L'admin les rejette (motif obligatoire) ou anonymise le compte malgré le blocage, puis
 * passe à la suivante. Vue et recherche dans l'URL (`?status=rejected&q=…`).
 */
import { ArrowUpRight, Mail, Search } from '@lucide/vue'
import { DELETION_ORIGIN, DELETION_STATUS, deletionBucket, type DeletionBucket, type DeletionPerson, type DeletionRequest } from '~/composables/useCompliance'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'manage:users' })

const route = useRoute()
const router = useRouter()
const { fetchDeletionRequests, reviewDeletionRequest } = useCompliance()
const { refresh: refreshCounts } = useAdminCounts()

const TABS: Array<{ value: DeletionBucket; label: string; empty: string }> = [
  { value: 'todo', label: 'À instruire', empty: 'Aucune demande à instruire : la file est à jour.' },
  { value: 'done', label: 'Anonymisées', empty: "Aucun compte anonymisé pour l'instant." },
  { value: 'rejected', label: 'Rejetées', empty: 'Aucune demande rejetée.' }
]

const tab = computed<DeletionBucket>(() => (TABS.some(t => t.value === route.query.status) ? (route.query.status as DeletionBucket) : 'todo'))
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''))

function setQuery(next: { status?: string; q?: string }) {
  const status = next.status ?? tab.value
  const text = next.q ?? q.value
  const query: Record<string, string> = {}
  if (status !== 'todo') query.status = status
  if (text) query.q = text
  router.replace({ query })
}
function setTab(v: string) {
  panel.value = null
  flash.value = null
  focusId.value = null
  setQuery({ status: v })
}

const search = ref(q.value)
let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, v => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    if (v.trim() !== q.value) setQuery({ q: v.trim() })
  }, 300)
})
watch(q, v => {
  if (v !== search.value.trim()) search.value = v
})
onBeforeUnmount(() => clearTimeout(debounce))

/* ---------- Chargement ---------- */
const requests = ref<DeletionRequest[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

async function load(silent = false) {
  if (!silent) state.value = 'loading'
  try {
    requests.value = await fetchDeletionRequests()
    state.value = 'ready'
  } catch {
    if (!silent) state.value = 'error'
  }
}
onMounted(() => load())

function personLabel(p: DeletionPerson | null) {
  if (!p) return 'Compte supprimé'
  return personName(p.first_name, p.last_name) || p.email || 'Compte sans nom'
}
function formatDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}
function waiting(iso: string) {
  const a = formatAnciennete(iso)
  return a === "aujourd'hui" ? 'demandée aujourd\'hui' : `en attente depuis ${a}`
}
/** Demande faite par quelqu'un d'autre que le titulaire (admin, ordre de l'APDP). */
function requestedByOther(r: DeletionRequest) {
  return !!(r.requested_by && r.user_id && r.requested_by !== r.user_id)
}

const counts = computed(() => {
  const c: Record<DeletionBucket, number> = { todo: 0, done: 0, rejected: 0 }
  for (const r of requests.value) c[deletionBucket(r.status)]++
  return c
})
const tabOptions = computed(() => TABS.map(t => ({ value: t.value, label: t.value === 'todo' && counts.value.todo ? `${t.label} (${counts.value.todo})` : t.label })))
const currentTab = computed(() => TABS.find(t => t.value === tab.value) ?? TABS[0]!)

/** File à instruire : la plus ancienne d'abord. Historique : la décision la plus récente d'abord. */
const rows = computed(() => requests.value
  .filter(r => deletionBucket(r.status) === tab.value)
  .filter(r => matchesQuery([personLabel(r.user), r.user?.email, r.user?.phone_number, personLabel(r.requester), r.requester?.email], q.value))
  .sort((a, b) => (tab.value === 'todo'
    ? a.created_at.localeCompare(b.created_at)
    : (b.reviewed_at ?? b.updated_at).localeCompare(a.reviewed_at ?? a.updated_at))))

/* ---------- Instruction : un seul panneau ouvert à la fois ---------- */
const REJECT_REASONS = [
  'Bail en cours : à résilier avant la suppression',
  'Solde du wallet à retirer avant la suppression',
  'Paiement ou litige en cours sur ce compte',
  'Demande non confirmée par le titulaire du compte'
]

const panel = ref<{ id: string; kind: 'approve' | 'reject' } | null>(null)
const reason = ref('')
const reasonInput = ref<HTMLTextAreaElement | null>(null)
const busy = ref(false)
const actionError = ref<{ id: string; message: string } | null>(null)
const flash = ref<{ text: string; email?: string | null } | null>(null)
const focusId = ref<string | null>(null)

function openPanel(r: DeletionRequest, kind: 'approve' | 'reject') {
  panel.value = { id: r.id, kind }
  reason.value = ''
  actionError.value = null
}
function pickReason(text: string) {
  reason.value = text
  nextTick(() => reasonInput.value?.focus())
}

function approveMessage(r: DeletionRequest) {
  return `${r.status === 'blocked' ? 'Anonymiser ce compte malgré le blocage' : 'Anonymiser ce compte maintenant'} ? Nom, email, téléphone, photo et pièce d'identité de ${personLabel(r.user)} sont effacés définitivement ; baux, factures et transactions sont conservés (obligation comptable). Action irréversible.`
}
function rejectMessage(r: DeletionRequest) {
  return `Rejeter cette demande ? Le compte de ${personLabel(r.user)} est conservé tel quel et le motif est enregistré sur la demande. La personne n'est pas prévenue automatiquement.`
}

async function decide(r: DeletionRequest, kind: 'approve' | 'reject') {
  if (kind === 'reject' && !reason.value.trim()) return
  busy.value = true
  actionError.value = null
  flash.value = null
  const name = personLabel(r.user)
  const index = rows.value.findIndex(x => x.id === r.id)
  try {
    const res = await reviewDeletionRequest(r.id, kind, kind === 'reject' ? reason.value.trim() : undefined)
    // La réponse ne porte pas les comptes liés : on garde ceux qu'on a, le rechargement suit.
    requests.value = requests.value.map(x => (x.id === r.id ? { ...x, ...res, user: x.user, requester: x.requester } : x))
    panel.value = null
    flash.value = kind === 'approve'
      ? { text: `Compte de ${name} anonymisé. Baux, factures et transactions sont conservés.` }
      : { text: `Demande de ${name} rejetée : le compte est conservé. La personne n'est pas prévenue automatiquement.`, email: r.user?.email }
    refreshCounts()
    await load(true)
    // Élément suivant de la file : mis en avant, sans renvoyer en haut de liste.
    const next = tab.value === 'todo' ? rows.value[index] ?? rows.value[index - 1] ?? null : null
    focusId.value = next?.id ?? null
    if (next) nextTick(() => document.getElementById(`request-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  } catch (e: any) {
    actionError.value = { id: r.id, message: e?.message || "La décision n'a pas pu être enregistrée." }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 flex flex-wrap items-center gap-2.5">
      <div class="max-w-full overflow-x-auto">
        <FormsSegmentedControl :model-value="tab" :options="tabOptions" size="sm" @update:model-value="setTab" />
      </div>
      <div class="flex h-[42px] min-w-0 flex-[1_1_220px] items-center gap-2 rounded-pill border border-[var(--border-default)] bg-white px-4 focus-within:border-green-600 sm:max-w-[320px]">
        <Search class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
        <input
          v-model="search"
          type="search"
          aria-label="Rechercher une demande"
          placeholder="Nom, email ou téléphone…"
          class="w-full min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--text-faint)]"
        >
      </div>
    </div>

    <p v-if="tab === 'todo'" class="mb-4 mt-0 max-w-[780px] text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
      Une demande sans blocage est exécutée tout de suite : le compte est anonymisé dès la demande. Restent ici celles qu'un bail actif ou un solde de wallet bloque. Vous pouvez attendre que la personne règle la situation, rejeter la demande, ou anonymiser le compte malgré le blocage (sur ordre de l'APDP par exemple).
    </p>

    <p v-if="flash" class="mb-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">
      {{ flash.text }}
      <a v-if="flash.email" :href="`mailto:${flash.email}`" class="ml-1 font-bold underline">Lui écrire</a>
    </p>

    <div v-if="state === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="132" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger les demandes de suppression pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load()">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="!requests.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucune demande de suppression de compte pour l'instant.
    </p>

    <div v-else-if="!rows.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      <template v-if="q">
        <p class="m-0">Aucune demande ne correspond à « {{ q }} » dans cet onglet.</p>
        <button type="button" class="mt-2 font-bold text-green-700 underline" @click="search = ''">Effacer la recherche</button>
      </template>
      <p v-else class="m-0">{{ currentTab.empty }}</p>
    </div>

    <template v-else>
      <article
        v-for="r in rows"
        :id="`request-${r.id}`"
        :key="r.id"
        class="mb-3.5 rounded-2xl border bg-white p-5"
        :class="focusId === r.id ? 'border-green-600 ring-2 ring-green-100' : 'border-[var(--border-subtle)]'"
      >
        <div class="flex items-start gap-3.5">
          <CoreAvatar :name="personLabel(r.user)" :size="44" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <NuxtLink v-if="r.user" :to="`/admin/utilisateurs/${r.user.id}`" class="text-[15px] font-bold hover:text-green-700 [overflow-wrap:anywhere]">{{ personLabel(r.user) }}</NuxtLink>
              <p v-else class="m-0 text-[15px] font-bold">{{ personLabel(r.user) }}</p>
              <AdminBadge :tone="DELETION_STATUS[r.status]?.tone ?? 'neutral'">{{ DELETION_STATUS[r.status]?.label ?? r.status }}</AdminBadge>
            </div>
            <p v-if="r.user?.email || r.user?.phone_number" class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)] [overflow-wrap:anywhere]">
              {{ r.user?.email }}<template v-if="r.user?.email && r.user?.phone_number"> · </template><span v-if="r.user?.phone_number" class="font-mono">{{ r.user.phone_number }}</span>
            </p>
            <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">
              Demandée le <span class="font-mono">{{ formatDate(r.created_at) }}</span><template v-if="DELETION_ORIGIN[r.reason]"> · {{ DELETION_ORIGIN[r.reason] }}</template>
              <template v-if="requestedByOther(r) && r.requester"> par <NuxtLink :to="`/admin/utilisateurs/${r.requester.id}`" class="font-semibold text-green-700 hover:underline">{{ personLabel(r.requester) }}</NuxtLink></template>
              <template v-if="tab === 'todo'"> · {{ waiting(r.created_at) }}</template>
            </p>
          </div>
        </div>

        <p v-if="r.status === 'blocked' && r.blocking_reason" class="mb-0 mt-3.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-fg-deep [overflow-wrap:anywhere]">
          <strong>Bloquée :</strong> {{ r.blocking_reason }}
        </p>
        <p v-else-if="r.status === 'rejected'" class="mb-0 mt-3.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-fg-deep [overflow-wrap:anywhere]">
          <strong>Rejetée{{ r.reviewed_at ? ` le ${formatDate(r.reviewed_at)}` : '' }}</strong><template v-if="r.blocking_reason"> — {{ r.blocking_reason }}</template>
        </p>
        <p v-else-if="r.status === 'completed' || r.status === 'approved'" class="mb-0 mt-3.5 rounded-md border border-info-border bg-info-bg px-3.5 py-2.5 text-[13px] text-info-fg-deep [overflow-wrap:anywhere]">
          <strong>{{ r.processed_at ? `Anonymisé le ${formatDate(r.processed_at)}` : 'Approuvée' }}{{ r.reviewed_by ? ' par un administrateur' : ', sans blocage' }}.</strong>
          <template v-if="r.retention_note"> {{ r.retention_note }}</template>
        </p>

        <div v-if="tab === 'todo'" class="mt-4 border-t border-sand-200 pt-4">
          <AdminInlineConfirm
            v-if="panel?.id === r.id && panel.kind === 'approve'"
            tone="danger"
            :message="approveMessage(r)"
            confirm-label="Anonymiser"
            cancel-label="Annuler"
            :loading="busy"
            @confirm="decide(r, 'approve')"
            @cancel="panel = null"
          />
          <AdminInlineConfirm
            v-else-if="panel?.id === r.id && panel.kind === 'reject'"
            tone="warning"
            :message="rejectMessage(r)"
            confirm-label="Rejeter"
            cancel-label="Annuler"
            :loading="busy"
            :disabled="!reason.trim()"
            @confirm="decide(r, 'reject')"
            @cancel="panel = null"
          >
            <div class="mb-2 flex flex-wrap gap-1.5">
              <button
                v-for="text in REJECT_REASONS"
                :key="text"
                type="button"
                class="rounded-pill border bg-white px-3 py-1 text-[12px] font-semibold"
                :class="reason === text ? 'border-green-600 text-green-800' : 'border-[var(--border-default)] text-[var(--text-secondary)]'"
                @click="pickReason(text)"
              >{{ text }}</button>
            </div>
            <textarea
              ref="reasonInput"
              v-model="reason"
              rows="2"
              maxlength="500"
              placeholder="Motif du rejet (obligatoire, enregistré sur la demande)"
              class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none"
            />
          </AdminInlineConfirm>
          <div v-else class="flex flex-wrap items-center gap-2">
            <AdminButton size="sm" variant="secondary" @click="openPanel(r, 'reject')">Rejeter la demande</AdminButton>
            <AdminButton size="sm" variant="danger" @click="openPanel(r, 'approve')">{{ r.status === 'blocked' ? 'Anonymiser malgré le blocage' : 'Anonymiser le compte' }}</AdminButton>
            <NuxtLink v-if="r.user" :to="`/admin/utilisateurs/${r.user.id}`" class="inline-flex items-center gap-1 px-1 text-[12.5px] font-bold text-green-700">
              Voir la fiche du compte <ArrowUpRight class="h-3.5 w-3.5" :stroke-width="1.9" />
            </NuxtLink>
            <a v-if="r.user?.email" :href="`mailto:${r.user.email}`" class="inline-flex items-center gap-1 px-1 text-[12.5px] font-bold text-green-700">
              <Mail class="h-3.5 w-3.5" :stroke-width="1.9" /> Écrire à la personne
            </a>
          </div>
          <p v-if="actionError?.id === r.id" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
        </div>
      </article>
    </template>
  </div>
</template>
