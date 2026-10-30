<script setup lang="ts">
import { Building2, Camera, Droplets, Ellipsis, KeyRound, MessageSquare, PaintRoller, Paperclip, Plus, TriangleAlert, Users, Volume2, Wrench, X, Zap } from '@lucide/vue'
import type { Component } from 'vue'
import type { SignalPriority, SignalSummary, SignalType } from '~/types/tenant'
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
const router = useRouter()

/** Lien profond depuis une notification (?signal=) : bon onglet, carte mise en avant — suivi aussi sur place. */
const focusId = ref('')
function focusFromQuery() {
  focusId.value = String(route.query.signal ?? '')
  const target = focusId.value ? block.items.value.find(s => s.id === focusId.value) : null
  if (!target) return
  tab.value = isActiveSignal(target) ? 'active' : 'done'
  nextTick(() => document.getElementById(`signal-${target.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}
onMounted(async () => {
  await block.load()
  focusFromQuery()
})
watch(() => route.query.signal, async () => {
  await block.load()
  focusFromQuery()
})
onMounted(() => useLandlordSignalementsBadge().markAllSeen())

const reportOpen = useReportModal()
/** `TenantReportModal` est monté globalement dans le layout, pas ici — recharger au ferme-après-envoi plutôt que d'attendre un événement qu'il ne peut pas émettre vers cette page. */
watch(reportOpen, (open, wasOpen) => { if (!open && wasOpen) block.load() })

const tab = ref<'active' | 'done'>(route.query.tab === 'done' ? 'done' : 'active')
watch(() => route.query.tab, t => { tab.value = t === 'done' ? 'done' : 'active' })
function setTab(v: string) {
  tab.value = v === 'done' ? 'done' : 'active'
  if (route.query.tab !== tab.value) router.replace({ query: { ...route.query, tab: tab.value } })
}
const activeSignals = computed(() => sortSignals(block.items.value.filter(isActiveSignal)))
const doneSignals = computed(() => sortSignals(block.items.value.filter(s => !isActiveSignal(s))))
const shown = computed(() => (tab.value === 'active' ? activeSignals.value : doneSignals.value))
const tabOptions = computed(() => [
  { value: 'active', label: `En cours (${activeSignals.value.length})` },
  { value: 'done', label: `Terminés (${doneSignals.value.length})` }
])

const PRIO_TONE: Record<SignalPriority, 'danger' | 'warn' | 'ok' | 'neutral'> = { urgent: 'danger', high: 'warn', medium: 'neutral', low: 'ok' }
const PRIO_LABEL: Record<SignalPriority, string> = { urgent: 'Urgent', high: 'Élevée', medium: 'Normal', low: 'Faible' }
/** Même pictogramme que dans la fenêtre de déclaration. */
const TYPE_ICON: Partial<Record<SignalType, Component>> = {
  maintenance_plomberie: Droplets,
  maintenance_electricite: Zap,
  maintenance_serrurerie: KeyRound,
  maintenance_peinture: PaintRoller,
  maintenance_autre: Wrench,
  infrastructure_commune: Building2,
  nuisance_sonore: Volume2,
  dispute_neighbor: Users,
  insalubrite: TriangleAlert,
  autre: Ellipsis
}

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
  clearError(signal.id)
  await preview.load(signalsApi.attachmentDownloadUrl(signal.id, index))
  if (preview.objectUrl.value) window.open(preview.objectUrl.value, '_blank')
  else errors.value = { ...errors.value, [signal.id]: preview.errorMessage.value ?? `La photo ${index + 1} n'a pas pu être ouverte. Réessayez.` }
  openingAttachment.value = null
}

/* ---- Ajouter une photo après coup : dépôt POST /files, puis POST /signals/:id/attachments ---- */
const uploadingId = ref<string | null>(null)
const flash = ref('')
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
    flash.value = `Photo ajoutée au signalement « ${signal.title} ».`
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
    flash.value = `Signalement « ${signal.title} » annulé.`
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
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 flex flex-wrap items-center justify-between gap-3">
      <div v-if="block.items.value.length" class="overflow-x-auto">
        <FormsSegmentedControl :model-value="tab" :options="tabOptions" size="sm" @update:model-value="setTab" />
      </div>
      <span v-else />
      <CoreButton @click="reportOpen = true"><span class="inline-flex items-center gap-1.5"><Plus class="h-4 w-4" :stroke-width="2.2" />Signaler un problème</span></CoreButton>
    </div>

    <div v-if="flash" class="mb-4.5 flex items-start gap-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">
      <p class="m-0 flex-1">{{ flash }}</p>
      <button type="button" aria-label="Masquer" class="flex-none text-green-900/70 hover:text-green-900" @click="flash = ''"><X class="h-4 w-4" :stroke-width="1.9" /></button>
    </div>

    <div v-if="block.state.value === 'loading' || block.state.value === 'idle'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="150" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos signalements pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <div v-else-if="block.state.value === 'empty'" class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-12 text-center">
      <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><TriangleAlert class="h-5 w-5" :stroke-width="1.9" /></div>
      <p class="m-0 text-[15px] font-bold">Aucun signalement pour l'instant</p>
      <p class="m-0 max-w-[440px] text-[13.5px] text-[var(--text-muted)]">Une panne, une fuite, un souci dans les parties communes ? Signalez-le : votre propriétaire en reçoit une notification et vous suivez l'avancement ici.</p>
    </div>

    <p v-else-if="!shown.length" class="m-0 rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      {{ tab === 'active' ? 'Aucun signalement en cours : tout est traité.' : 'Aucun signalement terminé.' }}
    </p>

    <template v-else>
      <article v-for="r in shown" :id="`signal-${r.id}`" :key="r.id" class="mb-3.5 rounded-2xl border bg-white p-5.5" :class="focusId === r.id ? 'border-green-600 ring-2 ring-green-600/15' : 'border-[var(--border-subtle)]'" data-testid="signal-card">
        <div class="flex items-start gap-3.5">
          <div class="grid h-10 w-10 flex-none place-items-center rounded-md bg-sand-200 text-[var(--text-secondary)]">
            <component :is="TYPE_ICON[r.signal_type] ?? TriangleAlert" class="h-[18px] w-[18px]" :stroke-width="1.9" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="m-0 text-[15px] font-bold tracking-[-.01em]">{{ r.title }}</h2>
              <CoreBadge :tone="SIGNAL_STATUS_TONE[r.status]">{{ SIGNAL_STATUS_LABEL[r.status] }}</CoreBadge>
              <CoreBadge :tone="PRIO_TONE[r.priority]">{{ PRIO_LABEL[r.priority] }}</CoreBadge>
            </div>
            <p class="mb-0 mt-1 text-xs text-[var(--text-faint)]">{{ SIGNAL_TYPE_LABEL[r.signal_type] }} · {{ signalPlace(r) }} · déclaré le <span class="font-mono">{{ formatDate(r.created_at) }}</span></p>
          </div>
        </div>

        <div v-if="r.status !== 'cancelled'" class="mt-5 flex items-start overflow-x-auto pb-1">
          <div v-for="(label, i) in TENANT_STEPS" :key="label" class="flex flex-1 items-start">
            <div class="flex flex-col items-start gap-1.5">
              <span class="h-[11px] w-[11px] rounded-pill" :class="tenantStep(r.status) >= i + 1 ? 'bg-green-600' : 'bg-[var(--border-default)]'" />
              <span class="whitespace-nowrap text-[11px] font-semibold" :class="tenantStep(r.status) === i + 1 ? 'text-green-700' : 'text-[var(--text-faint)]'">{{ label }}</span>
            </div>
            <div v-if="i < TENANT_STEPS.length - 1" class="mx-1.5 mt-1.5 h-0.5 flex-1" :class="tenantStep(r.status) > i + 1 ? 'bg-green-600' : 'bg-[var(--border-subtle)]'" />
          </div>
        </div>

        <p class="mb-0 mt-4 text-[13.5px] leading-[1.6] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{{ r.description }}</p>
        <p v-if="r.assigned_to" class="mb-0 mt-2.5 text-[13px] text-[var(--text-muted)]">Intervenant prévu : <strong>{{ r.assigned_to }}</strong></p>

        <div v-if="r.attachment_count > 0 || canAddAttachments(r)" class="mt-3.5 flex flex-wrap gap-2">
          <button
            v-for="i in r.attachment_count"
            :key="i"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold text-sand-900 disabled:opacity-60"
            :disabled="openingAttachment === `${r.id}-${i - 1}`"
            @click="openAttachment(r, i - 1)"
          ><Paperclip class="h-3.5 w-3.5" :stroke-width="1.9" />{{ openingAttachment === `${r.id}-${i - 1}` ? 'Ouverture…' : `Photo ${i}` }}</button>
          <label v-if="canAddAttachments(r)" class="inline-flex cursor-pointer items-center gap-1.5 rounded-pill border border-dashed border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold text-green-700" :class="{ 'pointer-events-none opacity-60': uploadingId === r.id }">
            <Camera class="h-3.5 w-3.5" :stroke-width="1.9" />{{ uploadingId === r.id ? 'Envoi…' : 'Ajouter une photo' }}
            <input type="file" accept="image/*" class="hidden" :disabled="uploadingId === r.id" @change="addPhoto(r, $event)">
          </label>
        </div>

        <div v-if="r.status === 'resolved'" class="mt-4 rounded-md border border-ok-border bg-ok-bg px-3.5 py-3 text-[13.5px] text-green-900">
          <p class="m-0 font-bold">Résolu selon le propriétaire<template v-if="r.resolved_at"> le <span class="font-mono">{{ formatDate(r.resolved_at) }}</span></template></p>
          <p v-if="r.resolution_notes" class="mb-0 mt-1 [overflow-wrap:anywhere]">« {{ r.resolution_notes }} »</p>
          <p class="mb-0 mt-1.5 text-[12.5px]">Le problème persiste ? Écrivez-lui : il peut rouvrir le signalement.</p>
        </div>
        <p v-else-if="r.resolution_notes" class="mb-0 mt-4 rounded-md border border-info-border bg-info-bg px-3.5 py-3 text-[13.5px] text-info-fg-deep">
          <strong>Note du propriétaire :</strong> {{ r.resolution_notes }}
        </p>

        <CoreInlineConfirm
          v-if="confirmCancelId === r.id"
          class="mt-4"
          tone="danger"
          message="Annuler ce signalement ? Il passe dans « Terminés » et ne peut plus être pris en charge."
          confirm-label="Annuler le signalement"
          cancel-label="Garder"
          :loading="busyId === r.id"
          @confirm="cancelSignal(r)"
          @cancel="confirmCancelId = null"
        />
        <div v-if="isActiveSignal(r) || r.status === 'resolved'" class="mt-4 flex flex-wrap items-center gap-2 border-t border-sand-200 pt-4">
          <CoreButton size="sm" tone="secondary" :disabled="busyId === r.id" @click="writeLandlord(r)">
            <span class="inline-flex items-center gap-1.5"><MessageSquare class="h-4 w-4" :stroke-width="1.9" />Écrire au propriétaire</span>
          </CoreButton>
          <CoreButton v-if="canTenantCancel(r) && confirmCancelId !== r.id" size="sm" tone="ghost" @click="confirmCancelId = r.id">Annuler le signalement</CoreButton>
        </div>
        <p v-if="errors[r.id]" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ errors[r.id] }}</p>
      </article>
    </template>
  </div>
</template>
