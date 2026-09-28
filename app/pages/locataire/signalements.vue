<script setup lang="ts">
import type { SignalPriority, SignalSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { validateAttachment } from '~/utils/messaging'
import { canAddAttachments, canTenantCancel, isActiveSignal, signalPlace, SIGNAL_STATUS_LABEL, SIGNAL_STATUS_TONE, SIGNAL_TYPE_LABEL, sortSignals, TENANT_STEPS, tenantStep } from '~/utils/signals'

definePageMeta({ layout: 'locataire' })

const signalsApi = useSignalsApi()
const messagingApi = useMessagingApi()
const preview = useProtectedFile()
const block = useFetchBlock(() => signalsApi.list())
const route = useRoute()
/** Lien profond depuis une notification (?signal=) : bon onglet, carte mise en avant. */
const focusId = ref(String(route.query.signal ?? ''))
onMounted(async () => {
  await block.load()
  const target = focusId.value ? block.items.value.find(s => s.id === focusId.value) : null
  if (!target) return
  tab.value = isActiveSignal(target) ? 'active' : 'done'
  nextTick(() => document.getElementById(`signal-${target.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
})

const reportOpen = useReportModal()
/** `TenantReportModal` est monté globalement dans le layout, pas ici — recharger au ferme-après-envoi plutôt que d'attendre un événement qu'il ne peut pas émettre vers cette page. */
watch(reportOpen, (open, wasOpen) => { if (!open && wasOpen) block.load() })

const tab = ref<'active' | 'done'>('active')
const activeSignals = computed(() => sortSignals(block.items.value.filter(isActiveSignal)))
const doneSignals = computed(() => sortSignals(block.items.value.filter(s => !isActiveSignal(s))))
const shown = computed(() => (tab.value === 'active' ? activeSignals.value : doneSignals.value))

const PRIO_TONE: Record<SignalPriority, 'danger' | 'warn' | 'ok' | 'neutral'> = { urgent: 'danger', high: 'warn', medium: 'neutral', low: 'ok' }
const PRIO_LABEL: Record<SignalPriority, string> = { urgent: 'Urgent', high: 'Élevée', medium: 'Normal', low: 'Faible' }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const errors = ref<Record<string, string>>({})
function setError(id: string, e: unknown, fallback: string) {
  errors.value = { ...errors.value, [id]: e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback }
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

/* ---- Ajouter une photo après coup : dépôt POST /files, puis POST /signals/:id/attachments ---- */
const uploadingId = ref<string | null>(null)
async function addPhoto(signal: SignalSummary, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const invalid = validateAttachment(file) ?? (file.type.startsWith('image/') ? null : 'Ajoutez une photo (JPG, PNG…).')
  if (invalid) { errors.value = { ...errors.value, [signal.id]: invalid }; return }
  clearError(signal.id)
  uploadingId.value = signal.id
  try {
    const uploaded = await signalsApi.uploadFile(file)
    await signalsApi.addAttachments(signal.id, [uploaded.url])
    await block.load()
  } catch (err) {
    setError(signal.id, err, "La photo n'a pas pu être ajoutée.")
  } finally {
    uploadingId.value = null
  }
}

/* ---- Annuler (seul statut que l'auteur peut poser, et seulement tant que c'est « ouvert ») ---- */
const confirmCancelId = ref<string | null>(null)
const busyId = ref<string | null>(null)
async function cancelSignal(signal: SignalSummary) {
  busyId.value = signal.id
  clearError(signal.id)
  try {
    await signalsApi.update(signal.id, { status: 'cancelled' })
    confirmCancelId.value = null
    await block.load()
  } catch (e) {
    setError(signal.id, e, "Le signalement n'a pas pu être annulé.")
    // Pris en charge entre-temps : l'état affiché est périmé.
    await block.load()
  } finally {
    busyId.value = null
  }
}

/* ---- Écrire au propriétaire (réutilise la conversation du logement s'il y en a une) ---- */
async function writeLandlord(signal: SignalSummary) {
  busyId.value = signal.id
  clearError(signal.id)
  try {
    const conv = await messagingApi.openConversation(signal.unit_id, signal.landlord_id)
    await navigateTo({ path: '/locataire/messages', query: { conversation: conv.id } })
  } catch (e) {
    setError(signal.id, e, "La conversation n'a pas pu être ouverte.")
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div v-if="block.items.value.length" class="flex gap-1.5 rounded-pill bg-sand-200 p-1">
        <button type="button" class="rounded-pill px-4 py-2 text-[13px] font-bold" :class="tab === 'active' ? 'bg-white text-green-800 shadow-sm' : 'text-[var(--text-secondary)]'" @click="tab = 'active'">En cours ({{ activeSignals.length }})</button>
        <button type="button" class="rounded-pill px-4 py-2 text-[13px] font-bold" :class="tab === 'done' ? 'bg-white text-green-800 shadow-sm' : 'text-[var(--text-secondary)]'" @click="tab = 'done'">Terminés ({{ doneSignals.length }})</button>
      </div>
      <span v-else />
      <CoreButton @click="reportOpen = true">+ Signaler un problème</CoreButton>
    </div>

    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="150" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos signalements pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="block.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucun signalement pour l'instant. Une panne, une fuite, un souci dans les parties communes ? Signalez-le : votre propriétaire est prévenu tout de suite.
    </p>

    <p v-else-if="!shown.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      {{ tab === 'active' ? 'Aucun signalement en cours.' : 'Aucun signalement terminé.' }}
    </p>

    <template v-else>
      <div v-for="r in shown" :id="`signal-${r.id}`" :key="r.id" class="mb-3.5 rounded-2xl border bg-white p-5.5" :class="focusId === r.id ? 'border-green-600 ring-2 ring-green-100' : 'border-[var(--border-subtle)]'" data-testid="signal-card">
        <div class="flex items-start gap-3.5">
          <div class="grid h-[42px] w-[42px] flex-none place-items-center rounded-md bg-sand-200 text-[17px]">⚑</div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <p class="m-0 text-base font-bold tracking-[-.015em]">{{ r.title }}</p>
              <CoreBadge :tone="SIGNAL_STATUS_TONE[r.status]">{{ SIGNAL_STATUS_LABEL[r.status] }}</CoreBadge>
              <CoreBadge :tone="PRIO_TONE[r.priority]">{{ PRIO_LABEL[r.priority] }}</CoreBadge>
            </div>
            <p class="mb-0 mt-1.5 text-[13px] text-[var(--text-muted)]">{{ SIGNAL_TYPE_LABEL[r.signal_type] }} · {{ signalPlace(r) }} · déclaré le {{ formatDate(r.created_at) }}</p>
          </div>
        </div>

        <div v-if="r.status !== 'cancelled'" class="mt-5 flex items-start">
          <div v-for="(label, i) in TENANT_STEPS" :key="label" class="flex flex-1 items-start">
            <div class="flex flex-col items-start gap-1.5">
              <span class="h-[11px] w-[11px] rounded-pill" :class="tenantStep(r.status) >= i + 1 ? 'bg-green-600' : 'bg-[var(--border-default)]'" />
              <span class="whitespace-nowrap text-[11px] font-semibold" :class="tenantStep(r.status) === i + 1 ? 'text-green-700' : 'text-[var(--text-faint)]'">{{ label }}</span>
            </div>
            <div v-if="i < TENANT_STEPS.length - 1" class="mt-1.5 h-0.5 flex-1" :class="tenantStep(r.status) > i + 1 ? 'bg-green-600' : 'bg-[var(--border-subtle)]'" />
          </div>
        </div>

        <p class="mb-0 mt-4 text-sm leading-[1.6] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{{ r.description }}</p>
        <p v-if="r.assigned_to" class="mb-0 mt-2.5 text-[13px] text-[var(--text-muted)]">Intervenant prévu : <strong>{{ r.assigned_to }}</strong></p>

        <div v-if="r.attachment_count > 0 || canAddAttachments(r)" class="mt-3.5 flex flex-wrap gap-2">
          <button
            v-for="i in r.attachment_count"
            :key="i"
            type="button"
            class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12px] font-bold text-sand-900"
            :disabled="openingAttachment === `${r.id}-${i - 1}`"
            @click="openAttachment(r, i - 1)"
          >{{ openingAttachment === `${r.id}-${i - 1}` ? '…' : `📎 Photo ${i}` }}</button>
          <label v-if="canAddAttachments(r)" class="cursor-pointer rounded-pill border border-dashed border-[var(--border-default)] bg-white px-3.5 py-2 text-[12px] font-bold text-green-700">
            {{ uploadingId === r.id ? 'Envoi…' : '＋ Ajouter une photo' }}
            <input type="file" accept="image/*" class="hidden" :disabled="uploadingId === r.id" @change="addPhoto(r, $event)">
          </label>
        </div>

        <div v-if="r.status === 'resolved'" class="mt-4 rounded-md border border-ok-border bg-ok-bg p-3.5 text-[13.5px] text-green-900">
          <p class="m-0 font-bold">Résolu selon le propriétaire<template v-if="r.resolved_at"> le {{ formatDate(r.resolved_at) }}</template></p>
          <p v-if="r.resolution_notes" class="mb-0 mt-1 [overflow-wrap:anywhere]">« {{ r.resolution_notes }} »</p>
          <p class="mb-0 mt-1.5 text-[12.5px]">Le problème persiste ? Écrivez-lui : il peut rouvrir le signalement.</p>
        </div>
        <p v-else-if="r.resolution_notes" class="mt-4 rounded-md border border-info-border bg-info-bg p-3.5 text-[13.5px] text-info-fg-deep">
          <strong>Note du propriétaire :</strong> {{ r.resolution_notes }}
        </p>

        <div v-if="isActiveSignal(r)" class="mt-4 flex flex-wrap items-center gap-2 border-t border-sand-200 pt-4">
          <CoreButton size="sm" tone="secondary" :disabled="busyId === r.id" @click="writeLandlord(r)">Écrire au propriétaire</CoreButton>
          <template v-if="canTenantCancel(r)">
            <template v-if="confirmCancelId === r.id">
              <span class="text-[12.5px] text-[var(--text-muted)]">Annuler ce signalement ?</span>
              <CoreButton size="sm" tone="danger" :disabled="busyId === r.id" @click="cancelSignal(r)">Oui, annuler</CoreButton>
              <CoreButton size="sm" tone="ghost" @click="confirmCancelId = null">Non</CoreButton>
            </template>
            <CoreButton v-else size="sm" tone="ghost" @click="confirmCancelId = r.id">Annuler le signalement</CoreButton>
          </template>
        </div>
        <p v-if="errors[r.id]" class="mb-0 mt-2.5 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[12.5px] font-semibold text-danger-fg">{{ errors[r.id] }}</p>
      </div>
    </template>
  </div>
</template>
