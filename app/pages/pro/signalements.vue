<script setup lang="ts">
import type { SignalPriority, SignalStatus, SignalSummary } from '~/types/tenant'
import type { LandlordSignalAction } from '~/utils/signals'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { isActiveSignal, isStaleTransition, landlordActions, signalAuthor, signalPlace, SIGNAL_STATUS_LABEL, SIGNAL_STATUS_TONE, SIGNAL_TYPE_LABEL, sortSignals } from '~/utils/signals'

definePageMeta({ layout: 'pro' })

const signalsApi = useSignalsApi()
const messagingApi = useMessagingApi()
const preview = useProtectedFile()

const statusFilter = ref<SignalStatus | 'active' | ''>('active')
const priorityFilter = ref<SignalPriority | ''>('')
const propertyFilter = ref('')

/** Filtre « en cours » fait côté écran (l'API ne filtre que sur un statut à la fois). */
const block = useFetchBlock(() => signalsApi.list(statusFilter.value && statusFilter.value !== 'active' ? { status: statusFilter.value } : {}))
const route = useRoute()
/** Lien profond depuis une notification (?signal=) : filtre élargi si besoin, carte mise en avant. */
const focusId = ref(String(route.query.signal ?? ''))
onMounted(async () => {
  await block.load()
  const target = focusId.value ? block.items.value.find(s => s.id === focusId.value) : null
  if (!target) return
  if (!isActiveSignal(target)) statusFilter.value = ''
  nextTick(() => document.getElementById(`signal-${target.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
})
watch(statusFilter, block.load)

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

async function runAction(signal: SignalSummary, action: LandlordSignalAction) {
  if (action.needsNote && resolvingId.value !== signal.id) {
    resolvingId.value = signal.id
    resolutionNote.value = signal.resolution_notes ?? ''
    return
  }
  busyId.value = signal.id
  clearError(signal.id)
  try {
    const note = resolutionNote.value.trim()
    await signalsApi.update(signal.id, action.needsNote && note ? { status: action.to, resolution_notes: note } : { status: action.to })
    resolvingId.value = null
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
function callArtisan(signal: SignalSummary) {
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
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-4.5 flex flex-wrap gap-2.5">
      <select v-model="statusFilter" aria-label="Statut" class="h-[42px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900">
        <option value="active">En cours</option>
        <option value="">Tous statuts</option>
        <option v-for="(label, val) in SIGNAL_STATUS_LABEL" :key="val" :value="val">{{ label }}</option>
      </select>
      <select v-if="propertyOptions.length > 1" v-model="propertyFilter" aria-label="Bien" class="h-[42px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900">
        <option value="">Tous les biens</option>
        <option v-for="p in propertyOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <select v-model="priorityFilter" aria-label="Priorité" class="h-[42px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900">
        <option value="">Toutes priorités</option>
        <option v-for="(label, val) in PRIO_LABEL" :key="val" :value="val">{{ label }}</option>
      </select>
    </div>

    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="150" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger les signalements pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="block.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucun signalement sur vos biens pour l'instant.
    </p>

    <p v-else-if="!filteredSignals.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      {{ statusFilter === 'active' ? 'Aucun signalement en cours : tout est traité.' : 'Aucun signalement ne correspond à ces filtres.' }}
    </p>

    <template v-else>
      <div v-for="r in filteredSignals" :id="`signal-${r.id}`" :key="r.id" class="mb-3.5 rounded-2xl border bg-white p-5" :class="[ACCENT[r.priority], focusId === r.id ? 'border-green-600 ring-2 ring-green-100' : 'border-[var(--border-subtle)]']" data-testid="signal-card">
        <div class="flex items-start gap-3.5">
          <div class="grid h-[42px] w-[42px] flex-none place-items-center rounded-md bg-sand-200 text-[17px]">⚑</div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <p class="m-0 text-[15.5px] font-bold">{{ r.title }}</p>
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
            <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">
              {{ SIGNAL_TYPE_LABEL[r.signal_type] }} · {{ signalPlace(r) }} · déclaré le {{ formatDate(r.created_at) }}<template v-if="signalAuthor(r)"> par {{ signalAuthor(r) }}</template>
            </p>
          </div>
        </div>

        <p class="mb-0 mt-4 text-sm leading-[1.6] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{{ r.description }}</p>

        <div v-if="r.attachment_count > 0" class="mt-3.5 flex flex-wrap gap-2">
          <button
            v-for="i in r.attachment_count"
            :key="i"
            type="button"
            class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12px] font-bold text-sand-900"
            :disabled="openingAttachment === `${r.id}-${i - 1}`"
            @click="openAttachment(r, i - 1)"
          >{{ openingAttachment === `${r.id}-${i - 1}` ? '…' : `📎 Photo ${i}` }}</button>
        </div>

        <p v-if="r.assigned_to" class="mb-0 mt-3.5 text-[13px] text-[var(--text-muted)]">Assigné à <strong>{{ r.assigned_to }}</strong></p>
        <p v-if="r.resolution_notes" class="mt-3.5 rounded-md border border-info-border bg-info-bg p-3.5 text-[13.5px] text-info-fg-deep [overflow-wrap:anywhere]">
          <strong>Résolution :</strong> {{ r.resolution_notes }}
        </p>

        <div v-if="resolvingId === r.id" class="mt-3.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-page)] p-3.5">
          <p class="m-0 text-[12.5px] font-bold">Note transmise au locataire (facultatif)</p>
          <textarea v-model="resolutionNote" rows="2" maxlength="1000" placeholder="Ex. joint du robinet remplacé par le plombier le 28 septembre." class="mt-1.5 w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none" />
          <div class="mt-2 flex gap-2">
            <CoreButton size="sm" :disabled="busyId === r.id" @click="confirmResolve(r)">Confirmer : résolu</CoreButton>
            <CoreButton size="sm" tone="secondary" @click="resolvingId = null">Annuler</CoreButton>
          </div>
        </div>

        <div v-if="isActiveSignal(r)" class="mt-4 flex flex-wrap gap-2 border-t border-sand-200 pt-4">
          <button
            v-for="a in landlordActions(r.status)"
            :key="a.to"
            type="button"
            class="rounded-sm px-4 py-2.5 text-[12.5px] font-bold disabled:opacity-60"
            :class="a.tone === 'primary' ? 'bg-[image:var(--action-primary)] text-white' : 'border border-[var(--border-default)] bg-white'"
            :disabled="busyId === r.id || resolvingId === r.id"
            @click="runAction(r, a)"
          >{{ a.label }}</button>
          <button v-if="r.status !== 'resolved'" type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold" @click="openAssign(r)">{{ r.assigned_to ? 'Réassigner' : 'Assigner' }}</button>
          <!-- Lot 54 : du signalement à l'intervention, sans ressaisir le logement ni le problème. -->
          <button v-if="r.status === 'open' || r.status === 'in_review'" type="button" class="rounded-sm border border-green-600 bg-white px-4 py-2.5 text-[12.5px] font-bold text-green-700" @click="callArtisan(r)">Faire intervenir un artisan</button>
          <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold" :disabled="busyId === r.id" @click="writeTenant(r)">Écrire au locataire</button>
        </div>

        <div v-if="assigningId === r.id" class="mt-3 flex flex-wrap items-center gap-2">
          <input v-model="assignName" placeholder="Nom de l'artisan ou prestataire" class="h-10 min-w-[200px] flex-1 rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13px] outline-none">
          <button type="button" class="rounded-sm bg-[image:var(--action-primary)] px-3.5 py-2.5 text-xs font-bold text-white" :disabled="!assignName.trim() || busyId === r.id" @click="submitAssign(r)">Enregistrer</button>
          <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-3.5 py-2.5 text-xs font-bold" @click="assigningId = null">Annuler</button>
        </div>
        <p v-if="errors[r.id]" class="mb-0 mt-2.5 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[12.5px] font-semibold text-danger-fg">{{ errors[r.id] }}</p>
      </div>
    </template>
  </div>
</template>
