<script setup lang="ts">
/**
 * Fiche d'un litige ou d'une demande de maintenance : le dossier à gauche (description, pièces
 * jointes, parties, historique), le traitement à droite (statut, priorité, suivi, note).
 * Les transitions proposées sont celles que l'API accepte (utils/signals.ts, relevé en live).
 */
import { ArrowRight, ExternalLink, FileText, Home, ImageOff, UserRound } from '@lucide/vue'
import { PRIORITY_LABELS, PRIORITY_OPTIONS, PRIORITY_TONE, SIGNAL_TYPE_LABELS, STATUS_LABELS, STATUS_TONE, type SignalItem, type SignalPriority } from '~/composables/useSignals'
import { isQueuedSignal, nextQueuedSignal, SIGNAL_KINDS, SIGNAL_TYPE_ICON, signalAttachmentCount, signalHistory, signalPersonName, type SignalKind } from '~/utils/adminSignals'
import { isStaleTransition, landlordActions, signalPlace, type LandlordSignalAction } from '~/utils/signals'

const props = defineProps<{ kind: SignalKind }>()
const cfg = computed(() => SIGNAL_KINDS[props.kind])
/** « Ce litige », « Cette demande » en début de phrase. */
const thisCap = computed(() => cfg.value.this.charAt(0).toUpperCase() + cfg.value.this.slice(1))

const route = useRoute()
const id = String(route.params.id)
const { fetchSignal, fetchSignals, updateSignal, fetchAttachmentBlob } = useSignals()
const { refresh: refreshCounts } = useAdminCounts()

const signal = ref<SignalItem | null>(null)
const state = ref<'loading' | 'ready' | 'error' | 'missing'>('loading')

async function load() {
  state.value = 'loading'
  try {
    signal.value = await fetchSignal(id)
    state.value = 'ready'
    loadAttachments()
  } catch (e) {
    const status = (e as { status?: number | null }).status
    state.value = status === 404 || status === 400 ? 'missing' : 'error'
  }
}
onMounted(load)

/* ---------- Pièces jointes (blobs protégés, servis par index) ---------- */
interface Attachment { state: 'loading' | 'ready' | 'error'; url: string | null; isImage: boolean }
const attachments = ref<Attachment[]>([])
const objectUrls: string[] = []

async function loadAttachments() {
  const n = signal.value ? signalAttachmentCount(signal.value) : 0
  if (attachments.value.length === n) return
  attachments.value = Array.from({ length: n }, () => ({ state: 'loading' as const, url: null, isImage: false }))
  await Promise.all(attachments.value.map(async (_, i) => {
    try {
      const blob = await fetchAttachmentBlob(id, i)
      const url = URL.createObjectURL(blob)
      objectUrls.push(url)
      attachments.value[i] = { state: 'ready', url, isImage: blob.type.startsWith('image/') }
    } catch {
      attachments.value[i] = { state: 'error', url: null, isImage: false }
    }
  }))
}
onBeforeUnmount(() => objectUrls.forEach(u => URL.revokeObjectURL(u)))

/* ---------- Traitement ---------- */
type Panel = 'resolve' | 'close' | 'assign' | 'note' | null
const panel = ref<Panel>(null)
const busy = ref(false)
const flash = ref('')
const actionError = ref('')
const note = ref('')
const assignee = ref('')

/** Après une sortie de file : élément suivant de la même rubrique, ou file à jour. */
const next = ref<{ state: 'idle' | 'loading' | 'ready'; item: SignalItem | null }>({ state: 'idle', item: null })

function open(p: Panel) {
  panel.value = p
  actionError.value = ''
  if (p === 'resolve' || p === 'note') note.value = signal.value?.resolution_notes ?? ''
  if (p === 'assign') assignee.value = signal.value?.assigned_to ?? ''
}

async function findNext() {
  next.value = { state: 'loading', item: null }
  try {
    next.value = { state: 'ready', item: nextQueuedSignal(await fetchSignals(), props.kind, id) }
  } catch {
    next.value = { state: 'ready', item: null }
  }
}

async function save(payload: Parameters<typeof updateSignal>[1], success: string) {
  const before = signal.value
  if (!before) return
  busy.value = true
  actionError.value = ''
  flash.value = ''
  try {
    const updated = await updateSignal(id, payload)
    // La réponse du PATCH ne porte pas forcément l'auteur, le bien… : on relit la fiche complète.
    const after = await fetchSignal(id).catch(() => ({ ...before, ...updated }))
    signal.value = after
    panel.value = null
    const leaves = isQueuedSignal(before) && !isQueuedSignal(after)
    const enters = !isQueuedSignal(before) && isQueuedSignal(after)
    flash.value = leaves
      ? `${success} ${cfg.value.pronoun} sort de la file ${cfg.value.inQueue}.`
      : enters ? `${success} ${cfg.value.pronoun} revient dans la file ${cfg.value.inQueue}.` : success
    if (isQueuedSignal(before) !== isQueuedSignal(after) || before.priority !== after.priority) refreshCounts()
    if (leaves) findNext()
    else next.value = { state: 'idle', item: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (isStaleTransition(message)) {
      actionError.value = `${thisCap.value} a changé entre-temps (autre onglet, ou annulation par son auteur) : la fiche vient d'être rechargée.`
      signal.value = await fetchSignal(id).catch(() => before)
    } else {
      actionError.value = message || "L'enregistrement a échoué."
    }
  } finally {
    busy.value = false
  }
}

const actions = computed(() => signal.value ? landlordActions(signal.value.status) : [])

function runAction(a: LandlordSignalAction) {
  if (a.to === 'resolved') return open('resolve')
  if (a.to === 'closed') return open('close')
  save({ status: a.to }, `Statut passé à « ${STATUS_LABELS[a.to]} ».`)
}

function resolve() {
  save({ status: 'resolved', resolution_notes: note.value.trim() }, `${cfg.value.resolved} : la note est enregistrée sur le signalement.`)
}
function closeSignal() {
  save({ status: 'closed' }, 'Statut passé à « Clôturé ».')
}
function saveNote() {
  save({ resolution_notes: note.value.trim() }, 'Note de résolution mise à jour.')
}
function saveAssignee() {
  const name = assignee.value.trim()
  if (name) save({ assigned_to: name }, `Suivi confié à ${name}.`)
}
async function onPriority(e: Event) {
  const select = e.target as HTMLSelectElement
  const priority = select.value as SignalPriority
  if (!signal.value || priority === signal.value.priority) return
  await save({ priority }, `Priorité passée à « ${PRIORITY_LABELS[priority]} ».`)
  // En cas d'échec, la liste reprend la priorité enregistrée.
  if (signal.value) select.value = signal.value.priority
}

const closeMessage = computed(() => signal.value?.status === 'open'
  ? `Clore ${cfg.value.this} sans suite ? ${cfg.value.pronoun} sort de la file ${cfg.value.inQueue}.`
  : `Clôturer ${cfg.value.this} ? « Clôturé » est le statut final.`)

/* ---------- Affichage ---------- */
const author = computed(() => signalPersonName(signal.value?.author))
const resolver = computed(() => signalPersonName(signal.value?.resolver))
const history = computed(() => signal.value ? signalHistory(signal.value) : [])
const unitFacts = computed(() => {
  const u = signal.value?.unit
  if (!u) return ''
  return [
    u.price ? `Loyer ${formatPrix(Number(u.price))}` : '',
    u.surface_m2 != null ? `${u.surface_m2} m²` : '',
    u.floor != null ? (u.floor === 0 ? 'rez-de-chaussée' : `étage ${u.floor}`) : ''
  ].filter(Boolean).join(' · ')
})

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <NuxtLink :to="cfg.path" class="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700">← {{ cfg.section }}</NuxtLink>

    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="flex flex-col gap-4.5">
        <DataSkeletonCard :height="220" :lines="0" />
        <DataSkeletonCard :height="140" :lines="0" />
      </div>
      <DataSkeletonCard :height="260" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger {{ cfg.this }} pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="state === 'missing' || !signal" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      {{ thisCap }} est introuvable : le lien est peut-être erroné.
      <NuxtLink :to="cfg.path" class="ml-1 font-bold text-green-700">Retour à la liste</NuxtLink>
    </p>

    <div v-else class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <!-- Dossier -->
      <div class="flex min-w-0 flex-col gap-4.5">
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="flex items-start gap-3.5">
            <div class="grid h-[46px] w-[46px] flex-none place-items-center rounded-md bg-sand-200 text-sand-900">
              <component :is="SIGNAL_TYPE_ICON[signal.signal_type]" class="h-5 w-5" :stroke-width="1.9" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="m-0 text-[17px] font-bold leading-[1.3] [overflow-wrap:anywhere]">{{ signal.title }}</h2>
                <AdminBadge :tone="STATUS_TONE[signal.status]">{{ STATUS_LABELS[signal.status] }}</AdminBadge>
                <AdminBadge :tone="PRIORITY_TONE[signal.priority]">Priorité {{ PRIORITY_LABELS[signal.priority].toLowerCase() }}</AdminBadge>
              </div>
              <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">
                {{ SIGNAL_TYPE_LABELS[signal.signal_type] }} · déclaré le <span class="font-mono text-[12px]">{{ formatDate(signal.created_at) }}</span><template v-if="author"> par {{ author }}</template>
              </p>
            </div>
          </div>

          <p class="mb-0 mt-4 whitespace-pre-line text-sm leading-[1.6] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{{ signal.description }}</p>

          <div v-if="attachments.length" class="mt-4.5">
            <p class="mb-2 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Pièces jointes</p>
            <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <template v-for="(a, i) in attachments" :key="i">
                <div v-if="a.state === 'loading'" class="aspect-[4/3] animate-pulse rounded-md bg-sand-200" />
                <div v-else-if="a.state === 'error'" class="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--border-default)] p-2 text-center text-[11.5px] text-[var(--text-muted)]">
                  <ImageOff class="h-[18px] w-[18px]" :stroke-width="1.9" />
                  Pièce {{ i + 1 }} indisponible
                </div>
                <a v-else-if="a.isImage" :href="a.url ?? undefined" target="_blank" rel="noopener" class="block aspect-[4/3] overflow-hidden rounded-md border border-[var(--border-subtle)] bg-sand-100" :title="`Ouvrir la pièce ${i + 1} dans un nouvel onglet`">
                  <img :src="a.url ?? undefined" :alt="`Pièce jointe ${i + 1}`" class="h-full w-full object-cover transition-transform hover:scale-[1.03]">
                </a>
                <a v-else :href="a.url ?? undefined" target="_blank" rel="noopener" class="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] text-[12px] font-bold text-sand-900 hover:border-[var(--border-default)]">
                  <FileText class="h-5 w-5" :stroke-width="1.9" />
                  Document {{ i + 1 }}
                </a>
              </template>
            </div>
          </div>

          <div v-if="signal.resolution_notes" class="mt-4.5 rounded-md border border-info-border bg-info-bg p-3.5 text-[13.5px] text-info-fg-deep [overflow-wrap:anywhere]">
            <strong>Note de résolution :</strong> {{ signal.resolution_notes }}
          </div>
        </section>

        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <h2 class="m-0 mb-1 text-[15px] font-bold">Parties</h2>
          <div class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
            <CoreAvatar :name="author || 'Auteur'" :size="38" />
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold">{{ author || 'Auteur sans nom' }}</p>
              <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">Auteur du signalement<template v-if="signal.author?.email && signal.author.email !== author"> · {{ signal.author.email }}</template></p>
            </div>
            <NuxtLink :to="`/admin/utilisateurs/${signal.author_id}`" class="flex-none text-[12.5px] font-bold text-green-700">Fiche</NuxtLink>
          </div>
          <div v-if="signal.landlord_id && signal.landlord_id !== signal.author_id" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
            <div class="grid h-[38px] w-[38px] flex-none place-items-center rounded-pill bg-sand-200 text-[var(--text-secondary)]"><UserRound class="h-[18px] w-[18px]" :stroke-width="1.9" /></div>
            <p class="m-0 min-w-0 flex-1 text-sm font-bold">Propriétaire du bien</p>
            <NuxtLink :to="`/admin/utilisateurs/${signal.landlord_id}`" class="flex-none text-[12.5px] font-bold text-green-700">Fiche</NuxtLink>
          </div>
          <div v-if="signal.property || signal.unit || signal.property_id" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
            <div class="grid h-[38px] w-[38px] flex-none place-items-center rounded-md bg-sand-200 text-[var(--text-secondary)]"><Home class="h-[18px] w-[18px]" :stroke-width="1.9" /></div>
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold">{{ signalPlace(signal, 'Bien concerné') }}</p>
              <p v-if="signal.property?.address || unitFacts" class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">{{ [signal.property?.address, unitFacts].filter(Boolean).join(' · ') }}</p>
            </div>
            <NuxtLink v-if="signal.property_id" :to="`/admin/biens/${signal.property_id}`" class="flex-none text-[12.5px] font-bold text-green-700">Fiche du bien</NuxtLink>
          </div>
          <div v-if="signal.resolver" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
            <CoreAvatar :name="resolver || 'Résolu par'" :size="38" />
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold">{{ resolver || 'Compte sans nom' }}</p>
              <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">A marqué {{ cfg.this }} résolu{{ kind === 'maintenance' ? 'e' : '' }}</p>
            </div>
            <NuxtLink :to="`/admin/utilisateurs/${signal.resolver.id}`" class="flex-none text-[12.5px] font-bold text-green-700">Fiche</NuxtLink>
          </div>
        </section>

        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <h2 class="m-0 text-[15px] font-bold">Historique</h2>
          <p class="mb-3 mt-1 text-xs text-[var(--text-faint)]">Reconstitué à partir des dates du signalement : l'API ne garde pas le détail de chaque changement.</p>
          <ol class="m-0 list-none p-0">
            <li v-for="ev in history" :key="ev.label + ev.at" class="relative flex gap-3 pb-3.5 pl-0.5 last:pb-0">
              <span class="mt-[5px] h-2.5 w-2.5 flex-none rounded-pill bg-green-600" />
              <div class="min-w-0 flex-1">
                <p class="m-0 text-[13.5px] font-bold">{{ ev.label }}<span v-if="ev.by" class="font-normal text-[var(--text-muted)]"> par {{ ev.by }}</span></p>
                <p class="mb-0 mt-0.5 font-mono text-xs text-[var(--text-faint)]">{{ formatDateTime(ev.at) }}</p>
              </div>
            </li>
          </ol>
        </section>
      </div>

      <!-- Traitement -->
      <aside class="self-start rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 lg:sticky lg:top-[94px]">
        <div class="flex items-center justify-between gap-3">
          <h2 class="m-0 text-[15px] font-bold">Traitement</h2>
          <AdminBadge :tone="STATUS_TONE[signal.status]">{{ STATUS_LABELS[signal.status] }}</AdminBadge>
        </div>

        <p v-if="flash" class="mb-0 mt-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>
        <template v-if="next.state !== 'idle'">
          <p v-if="next.state === 'loading'" class="mb-0 mt-2.5 text-xs text-[var(--text-faint)]">Recherche {{ kind === 'dispute' ? 'du litige suivant' : 'de la demande suivante' }}…</p>
          <NuxtLink v-else-if="next.item" :to="`${cfg.path}/${next.item.id}`" class="mt-2.5 flex items-center gap-2 rounded-md border border-[var(--border-default)] px-3.5 py-2.5 hover:border-green-600">
            <div class="min-w-0 flex-1">
              <p class="m-0 text-xs font-bold text-green-700">{{ cfg.next }}</p>
              <p class="mb-0 mt-0.5 truncate text-[13px] font-bold">{{ next.item.title }}</p>
            </div>
            <ArrowRight class="h-4 w-4 flex-none text-green-700" :stroke-width="1.9" />
          </NuxtLink>
          <p v-else class="mb-0 mt-2.5 text-[13px] text-[var(--text-muted)]">File à jour : plus rien en cours. <NuxtLink :to="cfg.path" class="font-bold text-green-700">Retour à la liste</NuxtLink></p>
        </template>

        <!-- Statut -->
        <div class="mt-4">
          <p class="mb-2 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Statut</p>
          <AdminInlineConfirm
            v-if="panel === 'resolve'"
            :message="`Marquer ${cfg.this} résolu${kind === 'maintenance' ? 'e' : ''} ? La note est enregistrée sur le signalement et visible par son auteur.`"
            confirm-label="Marquer résolu"
            cancel-label="Annuler"
            :loading="busy"
            :disabled="!note.trim()"
            @confirm="resolve"
            @cancel="panel = null"
          >
            <textarea v-model="note" rows="3" maxlength="1000" placeholder="Note de résolution (obligatoire) : ce qui a été décidé ou réparé." class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none focus:border-green-600" />
          </AdminInlineConfirm>
          <AdminInlineConfirm
            v-else-if="panel === 'close'"
            :message="closeMessage"
            confirm-label="Clôturer"
            :loading="busy"
            @confirm="closeSignal"
            @cancel="panel = null"
          />
          <div v-else-if="actions.length" class="flex flex-col gap-2">
            <AdminButton
              v-for="a in actions"
              :key="a.to"
              full-width
              :variant="a.tone === 'primary' ? 'primary' : 'secondary'"
              :disabled="busy"
              @click="runAction(a)"
            >{{ a.label }}</AdminButton>
          </div>
          <p v-else class="m-0 text-[13px] text-[var(--text-muted)]">{{ signal.status === 'cancelled' ? `${thisCap} a été annulé${kind === 'maintenance' ? 'e' : ''} : aucune action possible.` : `${thisCap} est clôturé${kind === 'maintenance' ? 'e' : ''} : aucune action possible.` }}</p>
        </div>

        <!-- Priorité -->
        <div class="mt-4 border-t border-sand-200 pt-4">
          <label class="flex items-center justify-between gap-3">
            <span class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Priorité</span>
            <select
              :value="signal.priority"
              class="h-9 cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3 text-[13px] font-semibold text-sand-900 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="busy || !isQueuedSignal(signal)"
              @change="onPriority"
            >
              <option v-for="p in PRIORITY_OPTIONS" :key="p" :value="p">{{ PRIORITY_LABELS[p] }}</option>
            </select>
          </label>
        </div>

        <!-- Suivi -->
        <div class="mt-4 border-t border-sand-200 pt-4">
          <p class="mb-1.5 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Suivi par</p>
          <form v-if="panel === 'assign'" class="flex flex-col gap-2" @submit.prevent="saveAssignee">
            <input v-model="assignee" maxlength="120" :placeholder="cfg.assignPlaceholder" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13px] outline-none focus:border-green-600">
            <div class="flex gap-2">
              <AdminButton type="submit" size="sm" :loading="busy" :disabled="!assignee.trim()">Enregistrer</AdminButton>
              <AdminButton size="sm" variant="secondary" :disabled="busy" @click="panel = null">Annuler</AdminButton>
            </div>
          </form>
          <div v-else class="flex items-center justify-between gap-3">
            <p class="m-0 min-w-0 truncate text-sm" :class="signal.assigned_to ? 'font-bold' : 'text-[var(--text-muted)]'">{{ signal.assigned_to || 'Personne pour l\'instant' }}</p>
            <button v-if="isQueuedSignal(signal)" type="button" class="flex-none text-[12.5px] font-bold text-green-700 disabled:opacity-50" :disabled="busy" @click="open('assign')">{{ signal.assigned_to ? 'Changer' : 'Confier le suivi' }}</button>
          </div>
        </div>

        <!-- Note de résolution (après résolution) -->
        <div v-if="signal.status === 'resolved'" class="mt-4 border-t border-sand-200 pt-4">
          <form v-if="panel === 'note'" class="flex flex-col gap-2" @submit.prevent="saveNote">
            <textarea v-model="note" rows="3" maxlength="1000" placeholder="Note de résolution" class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none focus:border-green-600" />
            <div class="flex gap-2">
              <AdminButton type="submit" size="sm" :loading="busy" :disabled="!note.trim()">Enregistrer</AdminButton>
              <AdminButton size="sm" variant="secondary" :disabled="busy" @click="panel = null">Annuler</AdminButton>
            </div>
          </form>
          <button v-else type="button" class="text-[12.5px] font-bold text-green-700 disabled:opacity-50" :disabled="busy" @click="open('note')">{{ signal.resolution_notes ? 'Modifier la note de résolution' : 'Ajouter une note de résolution' }}</button>
        </div>

        <p v-if="actionError" class="mb-0 mt-3.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>
      </aside>
    </div>
  </div>
</template>
