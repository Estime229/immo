<script setup lang="ts">
import type { PropertySearchResult } from '~/types/property'
import type { ArtisanProfile } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const modal = useProModal()
const open = computed(() => modal.value === 'artisanReq')

const landlordPropertiesApi = useLandlordPropertiesApi()
const refData = useReferenceData()
const artisanApi = useArtisanRequestsApi()
const refresh = useArtisanRequestsRefresh()

const step = ref<'form' | 'done'>('form')
const loading = ref(false)
const errorMessage = ref('')

const unitId = ref('')
const tradeId = ref('')
const mode = ref<'direct' | 'open'>('direct')
const targetArtisanId = ref('')
const restrictedToPartners = ref(false)
const description = ref('')

const properties = ref<PropertySearchResult[]>([])
const trades = ref<RefEntry[]>([])
const artisans = ref<ArtisanProfile[]>([])
const artisansLoading = ref(false)

const units = computed(() => properties.value.flatMap(p => p.units.map(u => ({ id: u.id, label: `${u.name} — ${p.name}` }))))

async function reset() {
  step.value = 'form'
  errorMessage.value = ''
  unitId.value = ''
  tradeId.value = ''
  mode.value = 'direct'
  targetArtisanId.value = ''
  restrictedToPartners.value = false
  description.value = ''
  artisans.value = []
  try {
    const page = await landlordPropertiesApi.fetchMine({ limit: 100 })
    properties.value = page.data as PropertySearchResult[]
    unitId.value = units.value[0]?.id ?? ''
  } catch {
    properties.value = []
  }
  try {
    trades.value = await refData.fetchRef('ARTISAN_TRADE')
    tradeId.value = trades.value[0]?.id ?? ''
  } catch {
    trades.value = []
  }
}
watch(open, v => { if (v) reset() })

async function loadArtisans() {
  if (!tradeId.value) { artisans.value = []; return }
  artisansLoading.value = true
  targetArtisanId.value = ''
  try {
    const res = await artisanApi.searchArtisans(tradeId.value)
    artisans.value = res.data
  } catch {
    artisans.value = []
  } finally {
    artisansLoading.value = false
  }
}
watch(tradeId, () => { if (mode.value === 'direct') loadArtisans() })
watch(mode, v => { if (v === 'direct') loadArtisans() })

const canSubmit = computed(() => !!unitId.value && !!tradeId.value && description.value.trim().length > 0 && (mode.value === 'open' || !!targetArtisanId.value))

async function submit() {
  if (!canSubmit.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    await artisanApi.create({
      unit_id: unitId.value,
      trade_reference_id: tradeId.value,
      description: description.value.trim(),
      target_artisan_id: mode.value === 'direct' ? targetArtisanId.value : undefined,
      restricted_to_partners: mode.value === 'open' ? restrictedToPartners.value : undefined
    })
    refresh.value++
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La demande a échoué.') : 'La demande a échoué.'
  } finally {
    loading.value = false
  }
}

function close() {
  modal.value = ''
}

function artisanName(a: ArtisanProfile) {
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Artisan'
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="flex max-h-[90vh] w-[500px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4.5">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">{{ step === 'form' ? "Demander une intervention" : 'Demande publiée' }}</h3>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" @click="close">✕</button>
        </div>

        <div class="overflow-y-auto p-6">
          <template v-if="step === 'form'">
            <p class="mb-2 mt-0 text-[12.5px] font-bold">Logement concerné</p>
            <select v-model="unitId" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm text-sand-900">
              <option v-if="!units.length" value="">Aucun logement disponible</option>
              <option v-for="u in units" :key="u.id" :value="u.id">{{ u.label }}</option>
            </select>

            <p class="mb-2 mt-4 text-[12.5px] font-bold">Métier</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="t in trades"
                :key="t.id"
                type="button"
                class="rounded-pill border px-3.5 py-2.5 text-[13px] font-semibold transition-all"
                :class="tradeId === t.id ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
                @click="tradeId = t.id"
              >{{ t.labels.fr }}</button>
            </div>

            <p class="mb-2 mt-4 text-[12.5px] font-bold">Destinataire</p>
            <div class="mb-3 flex w-fit gap-[5px] rounded-pill bg-sand-200 p-1">
              <button type="button" class="rounded-pill px-3.5 py-2 text-[12.5px] font-bold transition-all" :class="mode === 'direct' ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'" @click="mode = 'direct'">Artisan précis</button>
              <button type="button" class="rounded-pill px-3.5 py-2 text-[12.5px] font-bold transition-all" :class="mode === 'open' ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'" @click="mode = 'open'">Poste ouvert</button>
            </div>

            <template v-if="mode === 'direct'">
              <p v-if="artisansLoading" class="m-0 text-[13px] text-[var(--text-muted)]">Recherche des artisans…</p>
              <p v-else-if="!artisans.length" class="m-0 text-[13px] text-[var(--text-muted)]">Aucun artisan pour ce métier pour l'instant.</p>
              <div v-else class="flex flex-col gap-2">
                <div
                  v-for="a in artisans"
                  :key="a.user_id"
                  class="flex cursor-pointer items-center gap-3 rounded-md border-[1.5px] p-3"
                  :class="targetArtisanId === a.user_id ? 'border-green-600 bg-green-50' : 'border-[var(--border-default)] bg-white'"
                  @click="targetArtisanId = a.user_id"
                >
                  <CoreAvatar :name="artisanName(a)" :size="34" color="var(--color-green-700)" />
                  <div class="flex-1">
                    <p class="m-0 text-[13.5px] font-bold">{{ artisanName(a) }}</p>
                    <p class="mb-0 mt-0.5 text-[12px] text-[var(--text-faint)]">{{ a.reputation_score !== null ? `★ ${a.reputation_score.toFixed(1)} · ${a.review_count} avis` : 'Aucun avis pour l\'instant' }}<template v-if="a.years_experience"> · {{ a.years_experience }} ans d'expérience</template></p>
                  </div>
                </div>
              </div>
            </template>
            <label v-else class="flex items-center gap-2.5 text-[13px] text-[var(--text-secondary)]">
              <input v-model="restrictedToPartners" type="checkbox" class="h-4 w-4">
              Réserver à mes artisans partenaires uniquement
            </label>

            <p class="mb-2 mt-4 text-[12.5px] font-bold">Description des travaux</p>
            <textarea v-model="description" placeholder="Précisez la nature de l'intervention…" class="min-h-[80px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3.5 text-sm outline-none" />

            <p v-if="errorMessage" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
            <CoreButton size="lg" full-width class="mt-5.5" :disabled="!canSubmit || loading" @click="submit">{{ loading ? 'Publication…' : 'Publier la demande' }}</CoreButton>
          </template>

          <template v-else>
            <div class="px-0.5 py-1 text-center">
              <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
              <p class="mb-0 mt-4.5 text-lg font-bold">Demande publiée</p>
              <p class="mx-auto mb-0 mt-2.5 max-w-[340px] text-sm leading-[1.6] text-[var(--text-muted)]">
                {{ mode === 'direct' ? "L'artisan a été notifié et peut répondre par une offre." : 'Les artisans du métier peuvent maintenant faire une offre. Vous les comparerez dans l\'onglet Interventions.' }}
              </p>
              <CoreButton size="lg" full-width class="mt-5.5" @click="close">Terminé</CoreButton>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
