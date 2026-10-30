<script setup lang="ts">
import { CircleCheck, Flag, MessageCircle, Paperclip, UserRound, Wrench } from '@lucide/vue'
import type { SignalPriority, SignalStatus, SignalSummary } from '~/types/tenant'
import type { LandlordSignalAction } from '~/utils/signals'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { isActiveSignal, isStaleTransition, landlordActions, signalAuthor, signalPlace, SIGNAL_STATUS_LABEL, SIGNAL_STATUS_TONE, SIGNAL_TYPE_LABEL, sortSignals } from '~/utils/signals'

definePageMeta({ layout: 'pro' })

const signalsApi = useSignalsApi()
const messagingApi = useMessagingApi()
const preview = useProtectedFile()

/*
 * Filtres dans l'URL : `?statut=` (absent = « en cours », `tous` = tous statuts),
 * `?priorite=`, `?bien=`. Rechargement, retour arrière et lien partagé gardent la vue.
 */
const route = useRoute()
const router = useRouter()
const PRIORITIES: SignalPriority[] = ['urgent', 'high', 'medium', 'low']
const statusFilter = computed<SignalStatus | 'active' | ''>(() => {
  const q = route.query.statut
  if (q === 'tous') return ''
  return typeof q === 'string' && q in SIGNAL_STATUS_LABEL ? q as SignalStatus : 'active'
})
const priorityFilter = computed<SignalPriority | ''>(() => (PRIORITIES.includes(route.query.priorite as SignalPriority) ? route.query.priorite as SignalPriority : ''))
const propertyFilter = computed(() => (typeof route.query.bien === 'string' ? route.query.bien : ''))
function setFilter(key: 'statut' | 'priorite' | 'bien', value: string) {
  const query = { ...route.query }
  if (key === 'statut') {
    if (value === 'active') delete query.statut
    else query.statut = value || 'tous'
  } else if (value) query[key] = value
  else delete query[key]
  router.replace({ query })
}
function onFilter(key: 'statut' | 'priorite' | 'bien', e: Event) {
  setFilter(key, (e.target as HTMLSelectElement).value)
}
const hasFilters = computed(() => statusFilter.value !== 'active' || !!priorityFilter.value || !!propertyFilter.value)
function resetFilters() {
  const { statut: _, priorite: __, bien: ___, ...rest } = route.query
  router.replace({ query: rest })
}

/** Filtre « en cours » fait côté écran (l'API ne filtre que sur un statut à la fois). */
const serverStatus = computed(() => (statusFilter.value && statusFilter.value !== 'active' ? statusFilter.value : ''))
const block = useFetchBlock(() => signalsApi.list(serverStatus.value ? { status: serverStatus.value } : {}))
/** Lien profond depuis une notification (?signal=) : filtre élargi si besoin, carte mise en avant — suivi même déjà sur la page. */
const focusId = computed(() => (typeof route.query.signal === 'string' ? route.query.signal : ''))
async function focusSignal() {
  const target = focusId.value ? block.items.value.find(s => s.id === focusId.value) : null
  if (!target) return
  if (statusFilter.value === 'active' && !isActiveSignal(target)) setFilter('statut', '')
  nextTick(() => document.getElementById(`signal-${target.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}
onMounted(async () => {
  await block.load()
  focusSignal()
})
onMounted(() => useLandlordSignalementsBadge().markAllSeen())
watch(serverStatus, block.load)
watch(focusId, focusSignal)

/** La liste renvoie `unit`, `property` et `author` (vérifié en live, Lot 55) : plus besoin de recroiser avec la liste des biens. */
const propertyOptions = computed(() => {
  const byId = new Map<string, string>()
  for (const s of block.items.value) if (s.property) byId.set(s.property.id, s.property.name)
  return [...byId].map(([id, name]) => ({ id, name }))
})

const filteredSignals = computed(() => sortSignals(block.items.value.filter(s =>
  (statusFilter.value !== 'active' || isActiveSignal(s)) &&
  (!priorityFilter.value || s.priority === priorityFilter.value) &&
  (!propertyFilter.value || s.property_id === propertyFilter.value)
)))

const PRIO_TONE: Record<SignalPriority, 'danger' | 'warn' | 'ok' | 'neutral'> = { urgent: 'danger', high: 'warn', medium: 'neutral', low: 'ok' }
const PRIO_LABEL: Record<SignalPriority, string> = { urgent: 'Urgent', high: 'Élevée', medium: 'Normal', low: 'Faible' }
const ACCENT: Record<SignalPriority, string> = { urgent: 'border-l-4 border-l-danger-fg', high: 'border-l-4 border-l-clay-500', medium: 'border-l-4 border-l-[var(--border-default)]', low: 'border-l-4 border-l-[var(--border-default)]' }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const errors = ref<Record<string, string>>({})
function setError(id: string, e: unknown, fallback: string) {
  const message = e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback
  errors.value = { ...errors.value, [id]: isStaleTransition(message) ? 'Ce signalement a changé entre-temps (annulé par le locataire, ou traité ailleurs) : la liste vient d\'être rechargée.' : message }
}
function clearError(id: string) {
  const { [id]: _, ...rest } = errors.value
  errors.value = rest
}

const openingAttachment = ref<string | null>(null)
async function openAttachment(signal: SignalSummary, index: number) {
  const key = `${signal.id}-${index}`
  openingAttachment.value = key
  await preview.load(signalsApi.attachmentDownloadUrl(signal.id, index))
  if (preview.objectUrl.value) window.open(preview.objectUrl.value, '_blank')
  openingAttachment.value = null
}

/* ---- Statut ---- */
const busyId = ref<string | null>(null)
const resolvingId = ref<string | null>(null)
const resolutionNote = ref('')

const done = ref('')
/** « Clore sans suite » est un refus : motif obligatoire, transmis au locataire comme note. */
const closingId = ref<string | null>(null)
const closeReason = ref('')
const CLOSE_REASONS = ['Problème déjà réglé', 'Hors de la responsabilité du propriétaire', 'Signalement en double']
function isDismissal(signal: SignalSummary, action: LandlordSignalAction) {
  return signal.status === 'open' && action.to === 'closed'
}

async function runAction(signal: SignalSummary, action: LandlordSignalAction) {
  if (action.needsNote && resolvingId.value !== signal.id) {
    resolvingId.value = signal.id
    closingId.value = null
    resolutionNote.value = signal.resolution_notes ?? ''
    return
  }
  if (isDismissal(signal, action) && closingId.value !== signal.id) {
    closingId.value = signal.id
    resolvingId.value = null
    closeReason.value = ''
    return
  }
  busyId.value = signal.id
  clearError(signal.id)
  done.value = ''
  try {
    const note = isDismissal(signal, action) ? closeReason.value.trim() : resolutionNote.value.trim()
    await signalsApi.update(signal.id, (action.needsNote || isDismissal(signal, action)) && note ? { status: action.to, resolution_notes: note } : { status: action.to })
    resolvingId.value = null
    closingId.value = null
    done.value = `« ${signal.title} » : ${SIGNAL_STATUS_LABEL[action.to].toLowerCase()}.`
    await block.load()
  } catch (e) {
    setError(signal.id, e, 'Le changement de statut a échoué.')
    await block.load()
  } finally {
    busyId.value = null
  }
}

function confirmResolve(signal: SignalSummary) {
  const action = landlordActions(signal.status).find(a => a.needsNote)
  if (action) runAction(signal, action)
}
function confirmDismiss(signal: SignalSummary) {
  if (!closeReason.value.trim()) return
  const action = landlordActions(signal.status).find(a => isDismissal(signal, a))
  if (action) runAction(signal, action)
}

/* ---- Priorité ---- */
function onPriorityChange(signal: SignalSummary, e: Event) {
  changePriority(signal, (e.target as HTMLSelectElement).value as SignalPriority)
}
async function changePriority(signal: SignalSummary, priority: SignalPriority) {
  if (priority === signal.priority) return
  busyId.value = signal.id
  clearError(signal.id)
  try {
    await signalsApi.update(signal.id, { priority })
    await block.load()
  } catch (e) {
    setError(signal.id, e, 'La priorité n\'a pas pu être changée.')
  } finally {
    busyId.value = null
  }
}

/* ---- Assignation (nom libre) ---- */
const assigningId = ref<string | null>(null)
const assignName = ref('')
function openAssign(signal: SignalSummary) {
  assigningId.value = signal.id
  assignName.value = signal.assigned_to ?? ''
}
async function submitAssign(signal: SignalSummary) {
  if (!assignName.value.trim()) return
  busyId.value = signal.id
  clearError(signal.id)
  try {
    await signalsApi.update(signal.id, { assigned_to: assignName.value.trim() })
    assigningId.value = null
    await block.load()
  } catch (e) {
    setError(signal.id, e, "L'assignation a échoué.")
  } finally {
    busyId.value = null
  }
}

/* ---- Artisan et messagerie ---- */
const proModal = useProModal()
const artisanPrefill = useArtisanReqPrefill()
/** `POST /artisan-requests` exige un compte vérifié (403 `KYC_REQUIRED`). */
const { canAct, requireVerified } = useVerification()
function callArtisan(signal: SignalSummary) {
  if (!requireVerified('demander une intervention')) return
  artisanPrefill.value = {
    unitId: signal.unit_id,
    description: `Signalement « ${signal.title} » : ${signal.description}`.slice(0, 2000),
    signalId: signal.id,
    signalStatus: signal.status
  }
  proModal.value = 'artisanReq'
}
async function writeTenant(signal: SignalSummary) {
  busyId.value = signal.id
  clearError(signal.id)
  try {
    const conv = await messagingApi.openConversation(signal.unit_id, signal.author_id)
    await navigateTo({ path: '/pro/messages', query: { conversation: conv.id } })
  } catch (e) {
    setError(signal.id, e, "La conversation n'a pas pu être ouverte.")
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 flex flex-wrap items-center gap-2.5">
      <select :value="statusFilter" aria-label="Statut" class="h-[42px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900" @change="onFilter('statut', $event)">
        <option value="active">En cours</option>
        <option value="">Tous statuts</option>
        <option v-for="(label, val) in SIGNAL_STATUS_LABEL" :key="val" :value="val">{{ label }}</option>
      </select>
      <select v-if="propertyOptions.length > 1 || propertyFilter" :value="propertyFilter" aria-label="Bien" class="h-[42px] max-w-full rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900" @change="onFilter('bien', $event)">
        <option value="">Tous les biens</option>
        <option v-for="p in propertyOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <select :value="priorityFilter" aria-label="Priorité" class="h-[42px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900" @change="onFilter('priorite', $event)">
        <option value="">Toutes priorités</option>
        <option v-for="(label, val) in PRIO_LABEL" :key="val" :value="val">{{ label }}</option>
      </select>
      <button v-if="hasFilters" type="button" class="text-[12.5px] font-bold text-green-700" @click="resetFilters">Réinitialiser</button>
    </div>

    <p v-if="done" class="mb-4.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ done }}</p>

    <div v-if="block.state.value === 'loading' || block.state.value === 'idle'" class="flex flex-col gap-4.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="150" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger les signalements pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <!-- Vide total : l'API ne renvoie rien sans filtre de statut -->
    <div v-else-if="block.state.value === 'empty' && !serverStatus" class="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
      <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><CircleCheck class="h-5 w-5" :stroke-width="1.9" /></span>
      <p class="mb-0 mt-3 max-w-[400px] text-[13.5px] text-[var(--text-muted)]">Aucun signalement sur vos biens pour l'instant. Vos locataires signalent un problème depuis leur espace ; il arrive ici.</p>
    </div>

    <!-- Vide filtré -->
    <div v-else-if="!filteredSignals.length" class="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
      <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><CircleCheck class="h-5 w-5" :stroke-width="1.9" /></span>
      <p class="mb-0 mt-3 max-w-[400px] text-[13.5px] text-[var(--text-muted)]">
        {{ statusFilter === 'active' && !priorityFilter && !propertyFilter ? 'Aucun signalement en cours : tout est traité.' : 'Aucun signalement ne correspond à ces filtres.' }}
      </p>
      <CoreButton v-if="hasFilters" size="sm" tone="secondary" class="mt-4" @click="resetFilters">Voir les signalements en cours</CoreButton>
      <CoreButton v-else size="sm" tone="secondary" class="mt-4" @click="setFilter('statut', '')">Voir tout l'historique</CoreButton>
    </div>

    <div v-else class="flex flex-col gap-4.5">
      <section v-for="r in filteredSignals" :id="`signal-${r.id}`" :key="r.id" class="rounded-2xl border bg-white p-5.5" :class="[ACCENT[r.priority], focusId === r.id ? 'border-green-600 ring-2 ring-green-100' : 'border-[var(--border-subtle)]']" data-testid="signal-card">
        <div class="flex items-start gap-3.5">
          <span class="grid h-[42px] w-[42px] flex-none place-items-center rounded-md" :class="PRIO_TONE[r.priority] === 'danger' ? 'bg-danger-bg text-danger-fg' : 'bg-sand-200 text-[var(--text-secondary)]'"><Flag class="h-[18px] w-[18px]" :stroke-width="1.9" /></span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <p class="m-0 text-[15px] font-bold">{{ r.title }}</p>
              <CoreBadge :tone="SIGNAL_STATUS_TONE[r.status]">{{ SIGNAL_STATUS_LABEL[r.status] }}</CoreBadge>
              <select
                :value="r.priority"
                aria-label="Priorité du signalement"
                class="h-7 rounded-pill border border-[var(--border-default)] bg-white px-2 text-[11.5px] font-bold"
                :class="PRIO_TONE[r.priority] === 'danger' ? 'text-danger-fg' : PRIO_TONE[r.priority] === 'warn' ? 'text-warn-fg' : 'text-[var(--text-secondary)]'"
                :disabled="busyId === r.id || !isActiveSignal(r)"
                @change="onPriorityChange(r, $event)"
              >
                <option v-for="(label, val) in PRIO_LABEL" :key="val" :value="val">{{ label }}</option>
              </select>
            </div>
            <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">{{ SIGNAL_TYPE_LABEL[r.signal_type] }} · {{ signalPlace(r) }}</p>
            <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Déclaré le <span class="font-mono">{{ formatDate(r.created_at) }}</span><template v-if="signalAuthor(r)"> par {{ signalAuthor(r) }}</template></p>
          </div>
        </div>

        <p class="mb-0 mt-4 text-[13.5px] leading-[1.6] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{{ r.description }}</p>

        <div v-if="r.attachment_count > 0" class="mt-3.5 flex flex-wrap gap-2">
          <button
            v-for="i in r.attachment_count"
            :key="i"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold text-sand-900 disabled:opacity-60"
            :disabled="openingAttachment === `${r.id}-${i - 1}`"
            @click="openAttachment(r, i - 1)"
          ><Paperclip class="h-3.5 w-3.5" :stroke-width="1.9" />{{ openingAttachment === `${r.id}-${i - 1}` ? 'Ouverture…' : `Photo ${i}` }}</button>
        </div>

        <p v-if="r.assigned_to" class="mb-0 mt-3.5 inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]"><UserRound class="h-4 w-4" :stroke-width="1.9" />Assigné à <strong class="text-[var(--text-primary)]">{{ r.assigned_to }}</strong></p>
        <p v-if="r.resolution_notes" class="mb-0 mt-3.5 rounded-md border border-info-border bg-info-bg p-3.5 text-[13.5px] text-info-fg-deep [overflow-wrap:anywhere]">
          <strong>{{ r.status === 'closed' ? 'Note de clôture :' : 'Résolution :' }}</strong> {{ r.resolution_notes }}
        </p>

        <!-- Résolution : note facultative transmise au locataire -->
        <div v-if="resolvingId === r.id" class="mt-3.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-page)] p-3.5">
          <label class="block">
            <span class="mb-[7px] block text-[12.5px] font-bold">Note transmise au locataire (facultative)</span>
            <textarea v-model="resolutionNote" rows="2" maxlength="1000" placeholder="ex. Joint du robinet remplacé par le plombier le 28 septembre." class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none" />
          </label>
          <div class="mt-2.5 flex flex-wrap gap-2">
            <CoreButton size="sm" :disabled="busyId === r.id" @click="confirmResolve(r)">Confirmer : résolu</CoreButton>
            <CoreButton size="sm" tone="secondary" @click="resolvingId = null">Annuler</CoreButton>
          </div>
        </div>

        <!-- Clore sans suite : motif obligatoire -->
        <CoreInlineConfirm
          v-if="closingId === r.id"
          class="mt-3.5"
          tone="danger"
          message="Clore ce signalement sans suite ? Le motif est transmis au locataire."
          confirm-label="Clore sans suite"
          :loading="busyId === r.id"
          :disabled="!closeReason.trim()"
          @confirm="confirmDismiss(r)"
          @cancel="closingId = null"
        >
          <div class="mb-2 flex flex-wrap gap-1.5">
            <button
              v-for="reason in CLOSE_REASONS"
              :key="reason"
              type="button"
              class="rounded-pill border px-3 py-1.5 text-[12.5px] font-semibold"
              :class="closeReason === reason ? 'border-danger-fg bg-white text-danger-fg' : 'border-danger-border bg-white text-[var(--text-secondary)]'"
              :aria-pressed="closeReason === reason"
              @click="closeReason = reason"
            >{{ reason }}</button>
          </div>
          <textarea v-model="closeReason" rows="2" maxlength="1000" placeholder="Motif (obligatoire)" aria-label="Motif de clôture" class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none" />
        </CoreInlineConfirm>

        <div v-if="isActiveSignal(r)" class="mt-4 flex flex-wrap gap-2 border-t border-sand-200 pt-4">
          <CoreButton
            v-for="a in landlordActions(r.status)"
            :key="a.to"
            size="sm"
            :tone="a.tone === 'primary' ? 'primary' : isDismissal(r, a) ? 'ghost' : 'secondary'"
            :disabled="busyId === r.id || resolvingId === r.id || closingId === r.id"
            @click="runAction(r, a)"
          >{{ a.label }}</CoreButton>
          <!-- Lot 54 : du signalement à l'intervention, sans ressaisir le logement ni le problème. -->
          <CoreButton v-if="r.status === 'open' || r.status === 'in_review'" size="sm" tone="secondary" @click="callArtisan(r)">
            <span class="inline-flex items-center gap-1.5"><CoreLockIcon v-if="!canAct" /><Wrench v-else class="h-4 w-4" :stroke-width="1.9" />Faire intervenir un artisan</span>
          </CoreButton>
          <CoreButton v-if="r.status !== 'resolved'" size="sm" tone="ghost" @click="openAssign(r)">{{ r.assigned_to ? 'Réassigner' : 'Assigner' }}</CoreButton>
          <CoreButton size="sm" tone="ghost" :disabled="busyId === r.id" @click="writeTenant(r)">
            <span class="inline-flex items-center gap-1.5"><MessageCircle class="h-4 w-4" :stroke-width="1.9" />Écrire au locataire</span>
          </CoreButton>
        </div>

        <div v-if="assigningId === r.id" class="mt-3 flex flex-wrap items-center gap-2">
          <input v-model="assignName" placeholder="Nom de l'artisan ou du prestataire" aria-label="Assigné à" class="h-[42px] min-w-0 flex-[1_1_200px] rounded-md border border-[var(--border-default)] bg-white px-3 text-[13px] outline-none">
          <CoreButton size="sm" :disabled="!assignName.trim() || busyId === r.id" @click="submitAssign(r)">Enregistrer</CoreButton>
          <CoreButton size="sm" tone="secondary" @click="assigningId = null">Annuler</CoreButton>
        </div>
        <p v-if="errors[r.id]" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ errors[r.id] }}</p>
      </section>
    </div>
  </div>
</template>
