<script setup lang="ts">
import { CircleCheck, Star } from '@lucide/vue'
import type { PropertySearchResult } from '~/types/property'
import type { ArtisanProfile } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'

/**
 * « Demander une intervention », monté une fois dans le layout pro. Peut arriver
 * prérempli depuis un signalement (`useArtisanReqPrefill`) ou avec un artisan
 * choisi dans l'annuaire (`useArtisanReqTarget`).
 */
const modal = useProModal()
const open = computed(() => modal.value === 'artisanReq')

const landlordPropertiesApi = useLandlordPropertiesApi()
const refData = useReferenceData()
const artisanApi = useArtisanRequestsApi()
const refresh = useArtisanRequestsRefresh()
const prefill = useArtisanReqPrefill()
const target = useArtisanReqTarget()
const signalsApi = useSignalsApi()
const signalUpdated = ref(false)

const step = ref<'form' | 'done'>('form')
const loading = ref(false)
const errorMessage = ref('')
const createdId = ref<string | null>(null)

const unitId = ref('')
const tradeId = ref('')
const mode = ref<'direct' | 'open'>('direct')
const targetArtisanId = ref('')
const restrictedToPartners = ref(false)
const description = ref('')
const initialDescription = ref('')
const touched = ref(false)

const properties = ref<PropertySearchResult[]>([])
const unitsState = ref<'loading' | 'error' | 'ready'>('loading')
const trades = ref<RefEntry[]>([])
const artisans = ref<ArtisanProfile[]>([])
const artisansState = ref<'idle' | 'loading' | 'error' | 'ready'>('idle')

const units = computed(() => properties.value.flatMap(p => p.units.map(u => ({ id: u.id, label: `${u.name} — ${p.name}` }))))
const MODES = [{ value: 'direct', label: 'Artisan précis' }, { value: 'open', label: 'Poste ouvert' }]

/** Formulaire entamé : le voile ne ferme plus la fenêtre. */
const dirty = computed(() => step.value === 'form' && (touched.value || description.value.trim() !== initialDescription.value.trim()))

async function loadUnits() {
  unitsState.value = 'loading'
  try {
    const page = await landlordPropertiesApi.fetchMine({ limit: 100 })
    properties.value = page.data as PropertySearchResult[]
    const wanted = prefill.value?.unitId
    unitId.value = wanted && units.value.some(u => u.id === wanted) ? wanted : units.value[0]?.id ?? ''
    unitsState.value = 'ready'
  } catch {
    properties.value = []
    unitsState.value = 'error'
  }
}

async function reset() {
  step.value = 'form'
  errorMessage.value = ''
  createdId.value = null
  unitId.value = ''
  mode.value = 'direct'
  targetArtisanId.value = ''
  restrictedToPartners.value = false
  description.value = prefill.value?.description ?? ''
  initialDescription.value = description.value
  touched.value = false
  signalUpdated.value = false
  artisans.value = []
  await loadUnits()
  try {
    trades.value = await refData.fetchRef('ARTISAN_TRADE')
  } catch {
    trades.value = []
  }
  const wantedTrade = target.value?.tradeId
  tradeId.value = wantedTrade && trades.value.some(t => t.id === wantedTrade) ? wantedTrade : trades.value[0]?.id ?? ''
  // Le watcher de `tradeId` ne part pas si la valeur n'a pas changé : on charge explicitement.
  await loadArtisans()
}
watch(open, v => { if (v) reset() })

let lastRequest = 0
async function loadArtisans() {
  if (!tradeId.value || mode.value !== 'direct') { artisans.value = []; artisansState.value = 'idle'; return }
  const req = ++lastRequest
  artisansState.value = 'loading'
  const preselect = target.value && target.value.tradeId === tradeId.value ? target.value.profile : null
  targetArtisanId.value = preselect?.user_id ?? ''
  try {
    const res = await artisanApi.searchArtisans(tradeId.value)
    if (req !== lastRequest) return
    // L'artisan choisi dans l'annuaire peut être au-delà de la première page : on le garde en tête.
    artisans.value = preselect && !res.data.some(a => a.user_id === preselect.user_id) ? [preselect, ...res.data] : res.data
    artisansState.value = 'ready'
  } catch {
    if (req !== lastRequest) return
    artisans.value = preselect ? [preselect] : []
    artisansState.value = preselect ? 'ready' : 'error'
  }
}
watch(tradeId, (v, old) => { if (old && v !== old) loadArtisans() })
watch(mode, () => loadArtisans())
function setMode(v: string) {
  touched.value = true
  mode.value = v === 'open' ? 'open' : 'direct'
}

function pickTrade(id: string) {
  touched.value = true
  tradeId.value = id
}
function pickArtisan(id: string) {
  touched.value = true
  targetArtisanId.value = id
}

const canSubmit = computed(() => !!unitId.value && !!tradeId.value && description.value.trim().length > 0 && (mode.value === 'open' || !!targetArtisanId.value))
const missing = computed(() => {
  if (!unitId.value) return 'Choisissez le logement concerné.'
  if (mode.value === 'direct' && !targetArtisanId.value) return "Choisissez l'artisan, ou passez en poste ouvert."
  if (!description.value.trim()) return 'Décrivez les travaux.'
  return ''
})

async function submit() {
  if (!canSubmit.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const created = await artisanApi.create({
      unit_id: unitId.value,
      trade_reference_id: tradeId.value,
      description: description.value.trim(),
      target_artisan_id: mode.value === 'direct' ? targetArtisanId.value : undefined,
      restricted_to_partners: mode.value === 'open' ? restrictedToPartners.value : undefined,
      signal_id: prefill.value?.signalId
    })
    createdId.value = created?.id ?? null
    refresh.value++
    // Venue d'un signalement : il passe « En examen », l'artisan en assigné (sans bloquer si ça échoue).
    const origin = prefill.value
    if (origin?.signalId) {
      const chosen = artisans.value.find(a => a.user_id === targetArtisanId.value)
      await signalsApi.update(origin.signalId, {
        assigned_to: mode.value === 'direct' && chosen ? artisanName(chosen) : 'Artisan (poste ouvert)',
        ...(origin.signalStatus === 'open' ? { status: 'in_review' as const } : {})
      }).then(() => { signalUpdated.value = true }).catch(() => undefined)
    }
    prefill.value = null
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La demande a échoué. Réessayez.') : 'La demande a échoué. Réessayez.'
  } finally {
    loading.value = false
  }
}

function close() {
  modal.value = ''
  prefill.value = null
  target.value = null
}

function artisanName(a: ArtisanProfile) {
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Artisan'
}
const chosenName = computed(() => {
  const a = artisans.value.find(x => x.user_id === targetArtisanId.value)
  return a ? artisanName(a) : "l'artisan"
})
</script>

<template>
  <CoreModal :open="open" :title="step === 'form' ? 'Demander une intervention' : 'Demande publiée'" width="520px" :dirty="dirty" @close="close">
    <div v-if="step === 'form'" class="flex flex-col gap-4">
      <label class="block">
        <span class="mb-[7px] block text-[12.5px] font-bold">Logement concerné</span>
        <select v-model="unitId" :disabled="unitsState !== 'ready' || !units.length" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm text-sand-900" @change="touched = true">
          <option v-if="unitsState === 'loading'" value="">Chargement de vos logements…</option>
          <option v-else-if="!units.length" value="">Aucun logement</option>
          <option v-for="u in units" :key="u.id" :value="u.id">{{ u.label }}</option>
        </select>
        <span v-if="unitsState === 'error'" class="mt-[7px] block text-[12.5px] font-semibold text-danger-fg">
          Vos logements n'ont pas pu être chargés. <button type="button" class="font-bold underline" @click="loadUnits">Réessayer</button>
        </span>
        <span v-else-if="unitsState === 'ready' && !units.length" class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">
          Une intervention se rattache à un logement. <NuxtLink to="/pro/biens/ajouter" class="font-bold text-green-700" @click="close">Ajouter un bien</NuxtLink>
        </span>
      </label>

      <div>
        <p class="mb-[7px] mt-0 text-[12.5px] font-bold">Métier</p>
        <p v-if="!trades.length" class="m-0 text-[12.5px] text-[var(--text-muted)]">Liste des métiers indisponible pour le moment.</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="t in trades"
            :key="t.id"
            type="button"
            class="rounded-pill border px-3.5 py-2 text-[13px] font-semibold transition-colors"
            :class="tradeId === t.id ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
            :aria-pressed="tradeId === t.id"
            @click="pickTrade(t.id)"
          >{{ t.labels.fr }}</button>
        </div>
      </div>

      <div>
        <p class="mb-[7px] mt-0 text-[12.5px] font-bold">Destinataire</p>
        <FormsSegmentedControl :model-value="mode" :options="MODES" size="sm" @update:model-value="setMode" />
        <div class="mt-3">
          <template v-if="mode === 'direct'">
            <div v-if="artisansState === 'loading'" class="flex flex-col gap-2">
              <DataSkeletonCard v-for="i in 2" :key="i" :height="58" :lines="0" />
            </div>
            <p v-else-if="artisansState === 'error'" class="m-0 text-[13px] font-semibold text-danger-fg">
              Les artisans n'ont pas pu être chargés. <button type="button" class="font-bold underline" @click="loadArtisans">Réessayer</button>
            </p>
            <p v-else-if="!artisans.length" class="m-0 text-[13px] text-[var(--text-muted)]">
              Aucun artisan inscrit pour ce métier. Publiez plutôt un <button type="button" class="font-bold text-green-700" @click="setMode('open')">poste ouvert</button>.
            </p>
            <div v-else class="flex max-h-[260px] flex-col gap-2 overflow-y-auto">
              <button
                v-for="a in artisans"
                :key="a.user_id"
                type="button"
                class="flex w-full items-center gap-3 rounded-md border-[1.5px] p-3 text-left"
                :class="targetArtisanId === a.user_id ? 'border-green-600 bg-green-50' : 'border-[var(--border-default)] bg-white'"
                :aria-pressed="targetArtisanId === a.user_id"
                @click="pickArtisan(a.user_id)"
              >
                <CoreAvatar :name="artisanName(a)" :avatar-url="a.avatar_url" :size="34" color="var(--color-green-700)" />
                <span class="min-w-0 flex-1">
                  <span class="block text-[13.5px] font-bold">{{ artisanName(a) }}</span>
                  <span class="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-[var(--text-faint)]">
                    <template v-if="a.reputation_score !== null"><Star class="h-3.5 w-3.5 text-warn-fg" :stroke-width="1.9" /><span class="font-mono">{{ a.reputation_score.toFixed(1) }}</span> · {{ a.review_count }} avis</template>
                    <template v-else>Aucun avis pour l'instant</template>
                    <template v-if="a.years_experience"> · {{ a.years_experience }} ans d'expérience</template>
                  </span>
                </span>
              </button>
            </div>
          </template>
          <label v-else class="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-[var(--text-secondary)]">
            <input v-model="restrictedToPartners" type="checkbox" class="h-4 w-4 accent-green-600" @change="touched = true">
            Réserver à mes artisans partenaires
          </label>
        </div>
      </div>

      <label class="block">
        <span class="mb-[7px] block text-[12.5px] font-bold">Description des travaux</span>
        <textarea v-model="description" maxlength="2000" placeholder="Précisez la nature de l'intervention…" class="min-h-[90px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3.5 text-sm outline-none" />
        <span class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">Visible par {{ mode === 'direct' ? "l'artisan choisi" : 'les artisans du métier' }}.</span>
      </label>

      <p v-if="errorMessage" class="m-0 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
    </div>

    <div v-else class="flex flex-col items-center px-1 py-2 text-center">
      <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><CircleCheck class="h-6 w-6" :stroke-width="1.9" /></span>
      <p class="mb-0 mt-3.5 text-[15px] font-bold">Demande publiée</p>
      <p class="mx-auto mb-0 mt-2 max-w-[360px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
        {{ mode === 'direct' ? `La demande apparaît dans l'espace de ${chosenName}, qui peut y répondre par une offre.` : 'Les artisans du métier peuvent maintenant faire une offre ; vous les comparerez dans Interventions.' }}
      </p>
      <p v-if="signalUpdated" class="mx-auto mb-0 mt-2 max-w-[360px] text-[12.5px] font-semibold text-ok-fg">Le signalement est passé « En examen », avec l'artisan en assigné.</p>
    </div>

    <template #footer>
      <div v-if="step === 'form'" class="flex flex-col gap-2">
        <p v-if="missing && !loading" class="m-0 text-xs text-[var(--text-faint)]">{{ missing }}</p>
        <CoreButton size="lg" full-width :disabled="!canSubmit || loading" @click="submit">{{ loading ? 'Publication…' : 'Publier la demande' }}</CoreButton>
      </div>
      <div v-else class="flex flex-wrap justify-end gap-2.5">
        <CoreButton tone="secondary" @click="close">Fermer</CoreButton>
        <NuxtLink :to="createdId ? `/pro/artisans?request=${createdId}` : '/pro/artisans'" class="inline-flex items-center rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-[14px] font-bold text-white shadow-action" @click="close">Suivre la demande</NuxtLink>
      </div>
    </template>
  </CoreModal>
</template>
