<script setup lang="ts">
import type { AvailabilityBlock, BillingFrequency, LandlordWaitlistEntry, PropertySearchResult, UnitPricing } from '~/types/property'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'pro' })

const landlordPropertiesApi = useLandlordPropertiesApi()
const pricingApi = useUnitPricingApi()
const waitlistApi = useWaitlistApi()
const messagingApi = useMessagingApi()

/* ---- Sélection de l'unité ---- */
const myProperties = ref<PropertySearchResult[]>([])
const myUnitsState = ref<'loading' | 'error' | 'empty' | 'success'>('loading')
const selectedUnitId = ref('')
const myUnits = computed(() => myProperties.value.flatMap(p => p.units.map(u => ({ id: u.id, propertyId: p.id, label: `${u.name} — ${p.name}` }))))

onMounted(async () => {
  myUnitsState.value = 'loading'
  try {
    const page = await landlordPropertiesApi.fetchMine({ limit: 100 })
    myProperties.value = page.data as PropertySearchResult[]
    myUnitsState.value = myUnits.value.length ? 'success' : 'empty'
    selectedUnitId.value = myUnits.value[0]?.id ?? ''
  } catch {
    myUnitsState.value = 'error'
  }
})

/* ---- Tarifs ---- */
const pricing = ref<UnitPricing[]>([])
const pricingState = ref<'idle' | 'loading' | 'error' | 'empty' | 'success'>('idle')
async function loadPricing() {
  if (!selectedUnitId.value) return
  pricingState.value = 'loading'
  try {
    pricing.value = await pricingApi.fetchPricing(selectedUnitId.value)
    pricingState.value = pricing.value.length ? 'success' : 'empty'
  } catch {
    pricingState.value = 'error'
  }
}

const FREQ_LABEL: Record<BillingFrequency, string> = { daily: 'À la nuit', weekly: 'À la semaine', monthly: 'Au mois', quarterly: 'Au trimestre', semi_annual: 'Au semestre', annual: "À l'année" }
/** `as BillingFrequency` n'est pas supporté dans les expressions `<template>` de ce projet — extrait ici (piège déjà documenté, socle §méthodologie). */
function freqLabel(billingFrequency: string) {
  return FREQ_LABEL[billingFrequency as BillingFrequency] ?? billingFrequency
}
function fmtFcfa(v: string) { return `${Number(v).toLocaleString('fr-FR')} F` }

const showAddPricing = ref(false)
const newFreq = ref<BillingFrequency>('monthly')
const newPrice = ref('')
const newMinPeriods = ref('1')
const pricingError = ref('')
const pricingBusy = ref<string | null>(null)

async function addPricing() {
  if (!newPrice.value || !selectedUnitId.value) return
  pricingBusy.value = 'new'
  pricingError.value = ''
  try {
    await pricingApi.createPricing(selectedUnitId.value, { billing_frequency: newFreq.value, price: Number(newPrice.value), min_periods: newMinPeriods.value ? Number(newMinPeriods.value) : undefined })
    showAddPricing.value = false
    newPrice.value = ''
    await loadPricing()
  } catch (e) {
    pricingError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'ajout a échoué.") : "L'ajout a échoué."
  } finally {
    pricingBusy.value = null
  }
}
async function toggleAvailable(p: UnitPricing) {
  pricingBusy.value = p.id
  try {
    await pricingApi.updatePricing(selectedUnitId.value, p.id, { is_available: !p.is_available })
    await loadPricing()
  } catch {
    // le prochain rechargement reflétera l'état réel si l'action a échoué
  } finally {
    pricingBusy.value = null
  }
}
async function removePricing(p: UnitPricing) {
  pricingBusy.value = p.id
  try {
    await pricingApi.removePricing(selectedUnitId.value, p.id)
    await loadPricing()
  } catch (e) {
    pricingError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Le retrait a échoué.') : 'Le retrait a échoué.'
  } finally {
    pricingBusy.value = null
  }
}

/* ---- Liste d'attente ---- */
const waitlist = ref<LandlordWaitlistEntry[]>([])
const waitlistState = ref<'idle' | 'loading' | 'error' | 'empty' | 'success'>('idle')
async function loadWaitlist() {
  if (!selectedUnitId.value) return
  waitlistState.value = 'loading'
  try {
    waitlist.value = await waitlistApi.fetchForUnit(selectedUnitId.value)
    waitlistState.value = waitlist.value.length ? 'success' : 'empty'
  } catch {
    waitlistState.value = 'error'
  }
}
function waitlistName(w: LandlordWaitlistEntry) {
  return `${w.tenant.first_name ?? ''} ${w.tenant.last_name ?? ''}`.trim() || 'Locataire'
}
/** Aucune action « notifier » côté API — ouvrir une vraie conversation est le seul moyen réel de prévenir. */
function contactWaitlistTenant(w: LandlordWaitlistEntry) {
  messagingApi.createConversation(selectedUnitId.value, w.tenant.id).then(() => navigateTo('/pro/messages'))
}

/* ---- Calendrier de disponibilité (mois courant) ---- */
const availability = ref<AvailabilityBlock[]>([])
const availabilityState = ref<'idle' | 'loading' | 'error' | 'success'>('idle')
async function loadAvailability() {
  if (!selectedUnitId.value) return
  availabilityState.value = 'loading'
  try {
    availability.value = await pricingApi.fetchAvailability(selectedUnitId.value)
    availabilityState.value = 'success'
  } catch {
    availabilityState.value = 'error'
  }
}

const now = new Date()
const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
const firstWeekday = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7 // lundi = 0

function blockFor(day: number) {
  const d = new Date(now.getFullYear(), now.getMonth(), day)
  return availability.value.find(b => {
    const start = new Date(b.start_date)
    const end = b.end_date ? new Date(b.end_date) : null
    return d >= start && (!end || d < end)
  })
}
const calendarCells = computed(() => {
  const out: { d: number | null; block: AvailabilityBlock | undefined }[] = Array.from({ length: firstWeekday }, () => ({ d: null, block: undefined }))
  for (let d = 1; d <= daysInMonth; d++) out.push({ d, block: blockFor(d) })
  return out
})
const BLOCK_COLOR: Record<string, string> = { lease: 'bg-green-300 text-green-900', short_stay_booking: 'bg-green-300 text-green-900', manual: 'bg-sand-300 text-[var(--text-secondary)]' }

const showBlockForm = ref(false)
const blockStart = ref('')
const blockEnd = ref('')
const blockNote = ref('')
const blockError = ref('')
const blockBusy = ref(false)
async function submitBlock() {
  if (!blockStart.value || !blockEnd.value || !selectedUnitId.value) return
  blockBusy.value = true
  blockError.value = ''
  try {
    await pricingApi.blockAvailability(selectedUnitId.value, { start_date: blockStart.value, end_date: blockEnd.value, note: blockNote.value.trim() || undefined })
    showBlockForm.value = false
    blockStart.value = ''
    blockEnd.value = ''
    blockNote.value = ''
    await loadAvailability()
  } catch (e) {
    blockError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Le blocage a échoué.') : 'Le blocage a échoué.'
  } finally {
    blockBusy.value = false
  }
}

watch(selectedUnitId, () => {
  loadPricing()
  loadWaitlist()
  loadAvailability()
}, { immediate: false })
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="myUnitsState === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard :height="90" :lines="1" />
    </div>
    <p v-else-if="myUnitsState === 'error'" class="rounded-md border border-dashed border-danger-border bg-white px-4 py-10 text-center text-[13.5px] text-danger-fg">Impossible de charger vos unités pour le moment.</p>
    <p v-else-if="myUnitsState === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">Aucune unité pour l'instant — ajoutez d'abord un bien.</p>

    <template v-else>
      <select v-model="selectedUnitId" class="mb-4.5 h-11 rounded-pill border border-[var(--border-default)] bg-white px-4 text-[13px] font-semibold text-sand-900" @change="loadPricing(); loadWaitlist(); loadAvailability()">
        <option v-for="u in myUnits" :key="u.id" :value="u.id">{{ u.label }}</option>
      </select>

      <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <div class="mb-3.5 flex items-baseline justify-between">
              <p class="m-0 text-[15px] font-bold">Grilles tarifaires</p>
              <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold" @click="showAddPricing = !showAddPricing">+ Tarif</button>
            </div>

            <p v-if="pricingError" class="m-0 mb-2.5 text-[12.5px] font-semibold text-danger-fg">{{ pricingError }}</p>

            <div v-if="showAddPricing" class="mb-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5">
              <div class="grid grid-cols-2 gap-2">
                <select v-model="newFreq" class="h-9 rounded-sm border border-[var(--border-default)] bg-white px-2 text-[12.5px]">
                  <option v-for="(label, f) in FREQ_LABEL" :key="f" :value="f">{{ label }}</option>
                </select>
                <input v-model="newPrice" inputmode="numeric" placeholder="Prix FCFA" class="h-9 rounded-sm border border-[var(--border-default)] bg-white px-2 text-[12.5px] outline-none">
              </div>
              <div class="mt-2 flex gap-2">
                <button type="button" class="rounded-sm bg-[image:var(--action-primary)] px-3.5 py-2 text-xs font-bold text-white" :disabled="!newPrice || pricingBusy === 'new'" @click="addPricing">{{ pricingBusy === 'new' ? '…' : 'Ajouter' }}</button>
                <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold" @click="showAddPricing = false">Annuler</button>
              </div>
            </div>

            <div v-if="pricingState === 'loading'" class="flex flex-col gap-2"><DataSkeletonCard :height="40" :lines="1" /></div>
            <p v-else-if="pricingState === 'empty'" class="m-0 text-[13px] text-[var(--text-muted)]">Aucun tarif défini pour cette unité.</p>
            <div v-else v-for="p in pricing" :key="p.id" class="flex items-center gap-3.5 border-b border-sand-200 py-3 last:border-b-0">
              <div class="flex-1">
                <p class="m-0 text-sm font-bold">{{ freqLabel(p.billing_frequency) }}</p>
                <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">min. {{ p.min_periods }} période{{ p.min_periods > 1 ? 's' : '' }}</p>
              </div>
              <span class="font-mono text-[15px] font-bold">{{ fmtFcfa(p.price) }}</span>
              <button type="button" class="rounded-pill px-2.5 py-1.5 text-[11px] font-bold" :class="p.is_available ? 'bg-green-50 text-green-700' : 'bg-sand-200 text-[var(--text-muted)]'" :disabled="pricingBusy === p.id" @click="toggleAvailable(p)">{{ p.is_available ? 'Actif' : 'Inactif' }}</button>
              <button type="button" class="text-xs font-bold text-danger-fg" :disabled="pricingBusy === p.id" @click="removePricing(p)">Retirer</button>
            </div>
          </div>

          <div class="mt-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="m-0 text-[15px] font-bold">Liste d'attente</p>
            <div v-if="waitlistState === 'loading'" class="mt-3"><DataSkeletonCard :height="40" :lines="1" /></div>
            <p v-else-if="waitlistState === 'empty'" class="mb-0 mt-2 text-[12.5px] text-[var(--text-muted)]">Personne en attente pour cette unité.</p>
            <div v-else v-for="w in waitlist" :key="w.id" class="flex items-center gap-3.5 border-t border-sand-200 py-2.5 first:border-t-0 first:pt-3.5">
              <CoreAvatar :name="waitlistName(w)" :size="34" />
              <div class="flex-1">
                <p class="m-0 text-[13.5px] font-semibold">{{ waitlistName(w) }}</p>
                <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">inscrit le {{ new Date(w.created_at).toLocaleDateString('fr-FR') }}</p>
              </div>
              <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold" @click="contactWaitlistTenant(w)">Contacter</button>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="mb-3.5 flex items-baseline justify-between">
            <p class="m-0 text-[15px] font-bold capitalize">Calendrier — {{ monthLabel }}</p>
            <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold" @click="showBlockForm = !showBlockForm">+ Bloquer</button>
          </div>

          <p v-if="blockError" class="m-0 mb-2.5 text-[12.5px] font-semibold text-danger-fg">{{ blockError }}</p>
          <div v-if="showBlockForm" class="mb-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5">
            <div class="grid grid-cols-2 gap-2">
              <input v-model="blockStart" type="date" class="h-9 rounded-sm border border-[var(--border-default)] bg-white px-2 text-[12.5px] outline-none">
              <input v-model="blockEnd" type="date" class="h-9 rounded-sm border border-[var(--border-default)] bg-white px-2 text-[12.5px] outline-none">
            </div>
            <input v-model="blockNote" placeholder="Motif (optionnel, visible par vous seul)" class="mt-2 h-9 w-full rounded-sm border border-[var(--border-default)] bg-white px-2 text-[12.5px] outline-none">
            <div class="mt-2 flex gap-2">
              <button type="button" class="rounded-sm bg-[image:var(--action-primary)] px-3.5 py-2 text-xs font-bold text-white" :disabled="!blockStart || !blockEnd || blockBusy" @click="submitBlock">{{ blockBusy ? '…' : 'Bloquer' }}</button>
              <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold" @click="showBlockForm = false">Annuler</button>
            </div>
          </div>

          <div v-if="availabilityState === 'loading'" class="flex flex-col gap-2"><DataSkeletonCard :height="180" :lines="1" /></div>
          <template v-else>
            <div class="grid grid-cols-7 gap-1.5">
              <div v-for="(c, i) in calendarCells" :key="i" class="aspect-square rounded-sm">
                <div
                  v-if="c.d"
                  class="grid h-full w-full place-items-center rounded-sm font-mono text-xs font-bold"
                  :class="c.block ? (BLOCK_COLOR[c.block.blocked_by] ?? 'bg-sand-300 text-[var(--text-secondary)]') : 'bg-white text-[var(--text-secondary)]'"
                  :title="c.block ? c.block.blocked_by : ''"
                >{{ c.d }}</div>
              </div>
            </div>
            <div class="mt-4 flex flex-wrap gap-4">
              <span class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><span class="h-3 w-3 rounded-xs bg-green-300" />Bail / réservation</span>
              <span class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><span class="h-3 w-3 rounded-xs bg-sand-300" />Blocage manuel</span>
              <span class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><span class="h-3 w-3 rounded-xs border border-[var(--border-default)] bg-white" />Libre</span>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
