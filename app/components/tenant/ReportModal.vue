<script setup lang="ts">
import type { SignalPriority, SignalType } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

/** Catalogue de catégories UI → signal_type réel (13 valeurs déclarées côté API, voir GET /signals). */
const CATEGORY_TO_SIGNAL_TYPE: Record<string, SignalType> = {
  plomberie: 'maintenance_plomberie',
  electricite: 'maintenance_electricite',
  serrurerie: 'maintenance_serrurerie',
  peinture: 'maintenance_peinture',
  electromenager: 'maintenance_autre',
  autre: 'autre'
}

const open = useReportModal()
const { leases } = useTenantLeases()
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
const PRIORITIES: SignalPriority[] = ['low', 'medium', 'high', 'urgent']
const PRIORITY_LABEL: Record<SignalPriority, string> = { low: 'Faible', medium: 'Normal', high: 'Élevée', urgent: 'Urgent' }

const category = computed(() => REPORT_CATALOG.find(c => c.id === categoryId.value) ?? REPORT_CATALOG[0]!)
const titles: Record<Step, string> = { type: 'Signaler un problème', details: 'Décrire le problème', done: "C'est envoyé" }
const title = computed(() => titles[step.value])

function pickCategory(id: string) {
  categoryId.value = id
  step.value = 'details'
}

const activeLease = computed(() => leases.value[leaseIndex.value] ?? null)
const canSubmit = computed(() => !!activeLease.value && desc.value.trim().length > 0)

async function addPhoto(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
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
  if (!canSubmit.value || !activeLease.value) return
  loading.value = true
  errorMessage.value = ''
  const titlePrefix = room.value ? `${category.value.label} — ${room.value.toLowerCase()}` : category.value.label
  try {
    await signalsApi.create({
      unit_id: activeLease.value.unit.id,
      lease_id: activeLease.value.id,
      signal_type: CATEGORY_TO_SIGNAL_TYPE[category.value.id] ?? 'autre',
      title: titlePrefix,
      description: desc.value.trim(),
      priority: priority.value,
      attachments: uploadedPhotos.value.map(p => p.url)
    })
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'envoi a échoué.") : "L'envoi a échoué."
  } finally {
    loading.value = false
  }
}

function close() {
  open.value = false
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="flex max-h-[88vh] w-[520px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-5">
          <div class="flex items-center gap-2.5">
            <button v-if="step === 'details'" type="button" class="text-lg text-[var(--text-muted)]" @click="step = 'type'">←</button>
            <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">{{ title }}</h3>
          </div>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" @click="close">✕</button>
        </div>

        <div class="overflow-y-auto p-6">
          <template v-if="step === 'type'">
            <p v-if="!leases.length" class="mb-4 mt-0 text-[13.5px] text-[var(--text-muted)]">Vous devez avoir un bail pour signaler un problème sur un logement.</p>
            <div class="grid grid-cols-2 gap-2.5">
              <button
                v-for="c in REPORT_CATALOG"
                :key="c.id"
                type="button"
                class="flex flex-col items-start gap-2.5 rounded-md border border-[var(--border-subtle)] bg-white p-4 text-left transition-colors hover:border-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!leases.length"
                @click="pickCategory(c.id)"
              >
                <div class="grid h-9 w-9 place-items-center rounded-sm text-base" :class="c.iconBg">{{ c.icon }}</div>
                <span class="text-sm font-bold">{{ c.label }}</span>
              </button>
            </div>
          </template>

          <template v-else-if="step === 'details'">
            <template v-if="leases.length > 1">
              <p class="mb-2 mt-0 text-[12.5px] font-bold uppercase tracking-[.05em] text-[var(--text-faint)]">Logement concerné</p>
              <div class="mb-4 flex flex-wrap gap-2">
                <button
                  v-for="(l, i) in leases"
                  :key="l.id"
                  type="button"
                  class="rounded-pill border px-3.5 py-2 text-[13px] font-semibold transition-all"
                  :class="leaseIndex === i ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                  @click="leaseIndex = i"
                >{{ l.unit?.name ?? 'Logement' }}</button>
              </div>
            </template>

            <p class="mb-2 mt-0 text-[12.5px] font-bold uppercase tracking-[.05em] text-[var(--text-faint)]">Pièce (facultatif)</p>
            <div class="mb-4 flex flex-wrap gap-2">
              <button
                v-for="r in ROOMS"
                :key="r"
                type="button"
                class="rounded-pill border px-3.5 py-2 text-[13px] font-semibold transition-all"
                :class="room === r ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                @click="room = room === r ? '' : r"
              >{{ r }}</button>
            </div>

            <p class="mb-2 mt-0 text-[12.5px] font-bold uppercase tracking-[.05em] text-[var(--text-faint)]">Description</p>
            <textarea v-model="desc" rows="4" placeholder="Décrivez le problème constaté…" class="w-full resize-y rounded-md border border-[var(--border-default)] bg-white p-3.5 text-sm outline-none" />

            <p class="mb-2 mt-4 text-[12.5px] font-bold uppercase tracking-[.05em] text-[var(--text-faint)]">Photos</p>
            <div class="flex flex-wrap gap-2.5">
              <div v-for="(p, i) in uploadedPhotos" :key="p.url" class="relative h-[70px] w-[88px] overflow-hidden rounded-sm bg-cover bg-center" :style="{ backgroundImage: `url(${p.url})` }">
                <button type="button" class="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-pill bg-sand-800 text-[10px] text-white" @click="removePhoto(i)">✕</button>
              </div>
              <label class="grid h-[70px] w-[88px] cursor-pointer place-items-center rounded-sm border-[1.5px] border-dashed border-[var(--border-default)] text-xl text-[var(--text-faint)]">
                <span v-if="uploading">…</span>
                <span v-else>＋</span>
                <input type="file" accept="image/*" class="hidden" :disabled="uploading" @change="addPhoto">
              </label>
            </div>

            <p class="mb-2 mt-4 text-[12.5px] font-bold uppercase tracking-[.05em] text-[var(--text-faint)]">Priorité</p>
            <div class="flex gap-2">
              <button
                v-for="p in PRIORITIES"
                :key="p"
                type="button"
                class="flex-1 rounded-md border px-3 py-2.5 text-sm font-bold transition-all"
                :class="priority === p ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                @click="priority = p"
              >{{ PRIORITY_LABEL[p] }}</button>
            </div>

            <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
            <button
              type="button"
              class="mt-5 w-full rounded-md py-3.5 text-[15px] font-bold text-white transition-colors"
              :class="canSubmit && !loading ? 'cursor-pointer bg-[image:var(--action-primary)] shadow-action' : 'cursor-not-allowed bg-sand-400'"
              :disabled="!canSubmit || loading"
              @click="submit"
            >{{ loading ? 'Envoi…' : 'Envoyer le signalement' }}</button>
          </template>

          <template v-else>
            <div class="px-1 py-1 text-center">
              <div class="mx-auto grid h-16 w-16 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[30px] text-white">✓</div>
              <p class="mb-0 mt-5 text-lg font-bold">Signalement envoyé</p>
              <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">
                Le propriétaire est notifié et vous serez tenu informé de l'avancement.
              </p>
              <CoreButton size="lg" full-width class="mt-6" @click="close">Terminé</CoreButton>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
