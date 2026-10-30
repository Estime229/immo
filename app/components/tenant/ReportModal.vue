<script setup lang="ts">
import { ArrowLeft, Camera, Check, X } from '@lucide/vue'
import type { SignalPriority, SignalType } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { validateAttachment } from '~/utils/messaging'
import { reportableLeases } from '~/utils/signals'

/** Catalogue de catégories UI → signal_type réel (13 valeurs déclarées côté API, voir GET /signals). */
const CATEGORY_TO_SIGNAL_TYPE: Record<string, SignalType> = {
  plomberie: 'maintenance_plomberie',
  electricite: 'maintenance_electricite',
  serrurerie: 'maintenance_serrurerie',
  peinture: 'maintenance_peinture',
  electromenager: 'maintenance_autre',
  parties_communes: 'infrastructure_commune',
  nuisance: 'nuisance_sonore',
  voisinage: 'dispute_neighbor',
  insalubrite: 'insalubrite',
  autre: 'autre'
}

const open = useReportModal()
const { leases: allLeases } = useTenantLeases()
/** Bail actif seulement (Lot 55) : l'API accepte un signalement sur n'importe quel logement (#87), l'écran proposait aussi les baux en brouillon ou résiliés. */
const leases = computed(() => reportableLeases(allLeases.value))
const signalsApi = useSignalsApi()

type Step = 'type' | 'details' | 'done'
const step = ref<Step>('type')
const categoryId = ref('')
const leaseIndex = ref(0)
const room = ref('')
const desc = ref('')
const priority = ref<SignalPriority>('medium')
const uploadedPhotos = ref<{ url: string; name: string }[]>([])
const uploading = ref(false)
const loading = ref(false)
const errorMessage = ref('')

watch(open, v => {
  if (v) {
    step.value = 'type'
    categoryId.value = ''
    leaseIndex.value = 0
    room.value = ''
    desc.value = ''
    priority.value = 'medium'
    uploadedPhotos.value = []
    errorMessage.value = ''
  }
})

const ROOMS = ['Cuisine', 'Salon', 'Chambre 1', 'Chambre 2', 'Douche', 'Entrée']
const PRIORITY_OPTIONS: { value: SignalPriority; label: string }[] = [
  { value: 'low', label: 'Faible' },
  { value: 'medium', label: 'Normal' },
  { value: 'high', label: 'Élevée' },
  { value: 'urgent', label: 'Urgent' }
]

const category = computed(() => REPORT_CATALOG.find(c => c.id === categoryId.value) ?? REPORT_CATALOG[0]!)
const titles: Record<Step, string> = { type: 'Signaler un problème', details: 'Décrire le problème', done: 'Signalement envoyé' }
const title = computed(() => titles[step.value])

function pickCategory(id: string) {
  if (categoryId.value !== id) room.value = ''
  categoryId.value = id
  step.value = 'details'
}

const activeLease = computed(() => leases.value[leaseIndex.value] ?? null)
const canSubmit = computed(() => !!activeLease.value && desc.value.trim().length > 0)

async function addPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const invalid = validateAttachment(file)
  if (invalid || !file.type.startsWith('image/')) {
    errorMessage.value = invalid ?? 'Ajoutez une photo (JPG, PNG…).'
    ;(e.target as HTMLInputElement).value = ''
    return
  }
  errorMessage.value = ''
  uploading.value = true
  try {
    const result = await signalsApi.uploadFile(file)
    uploadedPhotos.value = [...uploadedPhotos.value, { url: result.url, name: result.original_filename }]
  } catch {
    errorMessage.value = "L'envoi de la photo a échoué."
  } finally {
    uploading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}
function removePhoto(i: number) {
  uploadedPhotos.value = uploadedPhotos.value.filter((_, j) => j !== i)
}

async function submit() {
  const unitId = activeLease.value?.unit?.id
  if (!canSubmit.value || !activeLease.value || !unitId) return
  loading.value = true
  errorMessage.value = ''
  const titlePrefix = room.value ? `${category.value.label} — ${room.value.toLowerCase()}` : category.value.label
  try {
    await signalsApi.create({
      unit_id: unitId,
      lease_id: activeLease.value.id,
      signal_type: CATEGORY_TO_SIGNAL_TYPE[category.value.id] ?? 'autre',
      title: titlePrefix,
      description: desc.value.trim(),
      priority: priority.value,
      attachments: uploadedPhotos.value.map(p => p.url)
    })
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'envoi a échoué.") : "L'envoi a échoué."
  } finally {
    loading.value = false
  }
}

function close() {
  open.value = false
}
function follow() {
  close()
  navigateTo('/locataire/signalements')
}

const dirty = computed(() => step.value === 'details' && (!!desc.value.trim() || uploadedPhotos.value.length > 0))
</script>

<template>
  <CoreModal :open="open" :title="title" width="540px" :dirty="dirty" @close="close">
    <template v-if="step === 'type'">
      <p v-if="!leases.length" class="mb-4 mt-0 rounded-md border border-info-border bg-info-bg px-3.5 py-3 text-[13px] text-info-fg-deep">
        Un signalement porte sur le logement que vous occupez : il sera possible dès que votre bail sera actif (signé des deux côtés et paiement d'entrée réglé).
      </p>
      <p v-else class="mb-3.5 mt-0 text-[13.5px] text-[var(--text-muted)]">De quoi s'agit-il ?</p>
      <div class="grid grid-cols-2 gap-2.5">
        <button
          v-for="c in REPORT_CATALOG"
          :key="c.id"
          type="button"
          class="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-white p-3.5 text-left transition-colors hover:border-green-600 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!leases.length"
          @click="pickCategory(c.id)"
        >
          <span class="grid h-9 w-9 flex-none place-items-center rounded-md" :class="c.iconBg"><component :is="c.icon" class="h-[18px] w-[18px]" :stroke-width="1.9" /></span>
          <span class="text-[13.5px] font-bold leading-snug">{{ c.label }}</span>
        </button>
      </div>
    </template>

    <template v-else-if="step === 'details'">
      <button type="button" class="mb-3.5 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700" @click="step = 'type'">
        <ArrowLeft class="h-4 w-4" :stroke-width="1.9" />{{ category.label }} · changer
      </button>

      <template v-if="leases.length > 1">
        <p class="mb-2 mt-0 text-[12.5px] font-bold">Logement concerné</p>
        <div class="mb-4 overflow-x-auto">
          <FormsSegmentedControl :model-value="String(leaseIndex)" :options="leases.map((l, i) => ({ value: String(i), label: l.unit?.name ?? 'Logement' }))" size="sm" @update:model-value="leaseIndex = Number($event)" />
        </div>
      </template>

      <template v-if="category.maintenance">
        <p class="mb-2 mt-0 text-[12.5px] font-bold">Pièce <span class="font-normal text-[var(--text-faint)]">(facultatif)</span></p>
        <div class="mb-4 flex flex-wrap gap-2">
          <FormsChip v-for="r in ROOMS" :key="r" :active="room === r" @click="room = room === r ? '' : r">{{ r }}</FormsChip>
        </div>
      </template>

      <label class="block">
        <span class="mb-[7px] flex items-baseline justify-between text-[12.5px] font-bold">Description <span class="font-mono font-normal text-[var(--text-faint)]">{{ desc.length }} / 2000</span></span>
        <textarea v-model="desc" rows="4" maxlength="2000" placeholder="Décrivez le problème constaté : depuis quand, ce qui a déjà été tenté…" class="w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3 text-sm outline-none" />
      </label>

      <p class="mb-2 mt-4 text-[12.5px] font-bold">Photos</p>
      <div class="flex flex-wrap gap-2.5">
        <div v-for="(p, i) in uploadedPhotos" :key="p.url" class="relative h-[70px] w-[88px] overflow-hidden rounded-md bg-sand-200 bg-cover bg-center" :style="{ backgroundImage: `url(${p.url})` }">
          <button type="button" :aria-label="`Retirer la photo ${i + 1}`" class="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-pill bg-sand-900/80 text-white" @click="removePhoto(i)"><X class="h-3.5 w-3.5" :stroke-width="2.2" /></button>
        </div>
        <label class="grid h-[70px] w-[88px] cursor-pointer place-items-center rounded-md border-[1.5px] border-dashed border-[var(--border-default)] text-[var(--text-faint)] hover:border-green-600 hover:text-green-700" :class="{ 'pointer-events-none opacity-60': uploading }">
          <span v-if="uploading" class="text-xs font-bold">Envoi…</span>
          <span v-else class="flex flex-col items-center gap-1 text-[11px] font-bold"><Camera class="h-5 w-5" :stroke-width="1.9" />Ajouter</span>
          <input type="file" accept="image/*" class="hidden" :disabled="uploading" @change="addPhoto">
        </label>
      </div>

      <p class="mb-2 mt-4 text-[12.5px] font-bold">Priorité</p>
      <FormsSegmentedControl :model-value="priority" :options="PRIORITY_OPTIONS" size="sm" @update:model-value="priority = $event as SignalPriority" />

      <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
    </template>

    <div v-else class="py-1 text-center">
      <div class="mx-auto grid h-14 w-14 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-white"><Check class="h-7 w-7" :stroke-width="2.4" /></div>
      <p class="mb-0 mt-4 text-base font-bold">{{ category.label }}<template v-if="activeLease?.unit?.name"> · {{ activeLease.unit.name }}</template></p>
      <p class="mx-auto mb-0 mt-2 max-w-[340px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Votre propriétaire reçoit une notification. Suivez l'avancement dans « Signalements » : vous pourrez y ajouter des photos tant qu'il n'est pas résolu.
      </p>
    </div>

    <template #footer>
      <CoreButton v-if="step === 'type'" tone="secondary" full-width @click="close">Annuler</CoreButton>
      <div v-else-if="step === 'details'" class="flex gap-2.5">
        <CoreButton tone="secondary" full-width @click="close">Annuler</CoreButton>
        <CoreButton full-width :disabled="!canSubmit || loading || uploading" @click="submit">{{ loading ? 'Envoi…' : 'Envoyer le signalement' }}</CoreButton>
      </div>
      <div v-else class="flex gap-2.5">
        <CoreButton tone="secondary" full-width @click="close">Fermer</CoreButton>
        <CoreButton full-width @click="follow">Suivre mon signalement</CoreButton>
      </div>
    </template>
  </CoreModal>
</template>
