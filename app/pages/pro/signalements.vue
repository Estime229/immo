<script setup lang="ts">
import type { PropertySearchResult } from '~/types/property'
import type { SignalPriority, SignalStatus, SignalSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'pro' })

const signalsApi = useSignalsApi()
const landlordPropertiesApi = useLandlordPropertiesApi()
const preview = useProtectedFile()

const statusFilter = ref<SignalStatus | ''>('')
const priorityFilter = ref<SignalPriority | ''>('')
const propertyFilter = ref('')

const block = useFetchBlock(() => signalsApi.list(statusFilter.value ? { status: statusFilter.value } : {}))
onMounted(block.load)
watch(statusFilter, block.load)

const myProperties = ref<PropertySearchResult[]>([])
onMounted(async () => {
  try {
    const page = await landlordPropertiesApi.fetchMine({ limit: 100 })
    myProperties.value = page.data as PropertySearchResult[]
  } catch {
    myProperties.value = []
  }
})

function propertyName(id: string) {
  return myProperties.value.find(p => p.id === id)?.name ?? null
}
function unitName(signal: SignalSummary) {
  for (const p of myProperties.value) {
    const u = p.units.find(x => x.id === signal.unit_id)
    if (u) return u.name
  }
  return null
}
function placeLabel(signal: SignalSummary) {
  const unit = unitName(signal)
  const property = propertyName(signal.property_id)
  if (unit && property) return `${unit} — ${property}`
  return property ?? 'Logement'
}

const filteredSignals = computed(() => {
  return block.items.value.filter(s =>
    (!priorityFilter.value || s.priority === priorityFilter.value) &&
    (!propertyFilter.value || s.property_id === propertyFilter.value)
  )
})

const PRIO_TONE: Record<SignalPriority, 'danger' | 'warn' | 'ok' | 'neutral'> = { urgent: 'danger', high: 'warn', medium: 'neutral', low: 'ok' }
const PRIO_LABEL: Record<SignalPriority, string> = { urgent: 'Urgent', high: 'Élevée', medium: 'Normal', low: 'Faible' }
const STATUS_LABEL: Record<SignalStatus, string> = { open: 'Ouvert', in_review: 'En examen', resolved: 'Résolu', closed: 'Clôturé', cancelled: 'Annulé' }
const ACCENT: Record<SignalPriority, string> = { urgent: 'border-l-4 border-l-danger-fg', high: 'border-l-4 border-l-clay-500', medium: 'border-l-4 border-l-[var(--border-default)]', low: 'border-l-4 border-l-[var(--border-default)]' }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const openingAttachment = ref<string | null>(null)
async function openAttachment(signal: SignalSummary, index: number) {
  const key = `${signal.id}-${index}`
  openingAttachment.value = key
  await preview.load(signalsApi.attachmentDownloadUrl(signal.id, index))
  if (preview.objectUrl.value) window.open(preview.objectUrl.value, '_blank')
  openingAttachment.value = null
}

/* ---- Statut / assignation ---- */
const busyId = ref<string | null>(null)
const actionError = ref('')
const assigningId = ref<string | null>(null)
const assignName = ref('')

async function changeStatus(signal: SignalSummary, status: SignalStatus) {
  busyId.value = signal.id
  actionError.value = ''
  try {
    await signalsApi.update(signal.id, { status })
    await block.load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "Le changement de statut a échoué.") : "Le changement de statut a échoué."
  } finally {
    busyId.value = null
  }
}

function openAssign(signal: SignalSummary) {
  assigningId.value = signal.id
  assignName.value = signal.assigned_to ?? ''
}
async function submitAssign(signal: SignalSummary) {
  if (!assignName.value.trim()) return
  busyId.value = signal.id
  actionError.value = ''
  try {
    await signalsApi.update(signal.id, { assigned_to: assignName.value.trim() })
    assigningId.value = null
    await block.load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'assignation a échoué.") : "L'assignation a échoué."
  } finally {
    busyId.value = null
  }
}

const NEXT_STATUSES: Record<SignalStatus, SignalStatus[]> = {
  open: ['in_review', 'closed'],
  in_review: ['resolved', 'closed'],
  resolved: ['closed'],
  closed: [],
  cancelled: []
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-4.5 flex flex-wrap gap-2.5">
      <select v-model="propertyFilter" class="h-[42px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900">
        <option value="">Tous les biens</option>
        <option v-for="p in myProperties" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <select v-model="priorityFilter" class="h-[42px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900">
        <option value="">Toutes priorités</option>
        <option v-for="(label, val) in PRIO_LABEL" :key="val" :value="val">{{ label }}</option>
      </select>
      <select v-model="statusFilter" class="h-[42px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900">
        <option value="">Tous statuts</option>
        <option v-for="(label, val) in STATUS_LABEL" :key="val" :value="val">{{ label }}</option>
      </select>
    </div>

    <p v-if="actionError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>

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
      Aucun signalement ne correspond à ces filtres.
    </p>

    <template v-else>
      <div v-for="r in filteredSignals" :key="r.id" class="mb-3.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5" :class="ACCENT[r.priority]">
        <div class="flex items-start gap-3.5">
          <div class="grid h-[42px] w-[42px] flex-none place-items-center rounded-md bg-sand-200 text-[17px]">⚑</div>
          <div class="flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <p class="m-0 text-[15.5px] font-bold">{{ r.title }}</p>
              <CoreBadge :tone="PRIO_TONE[r.priority]">{{ PRIO_LABEL[r.priority] }}</CoreBadge>
              <CoreBadge tone="neutral">{{ STATUS_LABEL[r.status] }}</CoreBadge>
            </div>
            <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">{{ placeLabel(r) }} · déclaré le {{ formatDate(r.created_at) }}</p>
          </div>
        </div>

        <p class="mb-0 mt-4 text-sm leading-[1.6] text-[var(--text-secondary)]">{{ r.description }}</p>

        <div v-if="r.attachment_count > 0" class="mt-3.5 flex flex-wrap gap-2">
          <button
            v-for="i in r.attachment_count"
            :key="i"
            type="button"
            class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12px] font-bold text-sand-900"
            :disabled="openingAttachment === `${r.id}-${i - 1}`"
            @click="openAttachment(r, i - 1)"
          >{{ openingAttachment === `${r.id}-${i - 1}` ? '…' : `📎 Pièce jointe ${i}` }}</button>
        </div>

        <p v-if="r.assigned_to" class="mb-0 mt-3.5 text-[13px] text-[var(--text-muted)]">Assigné à <strong>{{ r.assigned_to }}</strong></p>
        <p v-if="r.resolution_notes" class="mt-3.5 rounded-md border border-info-border bg-info-bg p-3.5 text-[13.5px] text-info-fg-deep">
          <strong>Résolution :</strong> {{ r.resolution_notes }}
        </p>

        <div class="mt-4 flex flex-wrap gap-2 border-t border-sand-200 pt-4">
          <button
            v-for="s in NEXT_STATUSES[r.status]"
            :key="s"
            type="button"
            class="rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold"
            :disabled="busyId === r.id"
            @click="changeStatus(r, s)"
          >Passer à « {{ STATUS_LABEL[s] }} »</button>
          <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold" @click="openAssign(r)">{{ r.assigned_to ? 'Réassigner' : 'Assigner' }}</button>
        </div>

        <div v-if="assigningId === r.id" class="mt-3 flex items-center gap-2">
          <input v-model="assignName" placeholder="Nom de l'artisan ou prestataire" class="h-10 flex-1 rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13px] outline-none">
          <button type="button" class="rounded-sm bg-[image:var(--action-primary)] px-3.5 py-2.5 text-xs font-bold text-white" :disabled="!assignName.trim() || busyId === r.id" @click="submitAssign(r)">Enregistrer</button>
          <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-3.5 py-2.5 text-xs font-bold" @click="assigningId = null">Annuler</button>
        </div>
      </div>
    </template>
  </div>
</template>
