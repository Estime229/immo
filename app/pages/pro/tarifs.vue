<script setup lang="ts">
import type { AvailabilityBlock, BillingFrequency, LandlordWaitlistEntry, PropertySearchResult, UnitPricing } from '~/types/property'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { PERIOD_NIGHTS, addDays, isDayBlocked, quoteStay, syncedBasePrice, validatePrice } from '~/utils/stayPricing'

definePageMeta({ layout: 'pro' })

const route = useRoute()
const landlordPropertiesApi = useLandlordPropertiesApi()
const pricingApi = useUnitPricingApi()
const waitlistApi = useWaitlistApi()
const messagingApi = useMessagingApi()

function formatError(e: unknown, fallback: string) {
  return e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback
}
function fmtF(v: number | string) {
  return `${Math.round(Number(v)).toLocaleString('fr-FR').replace(/ /g, ' ')} F`
}
function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
const todayIso = localIso(new Date())

/* ---- Sélection du logement (préselection via ?unit= depuis la fiche d'un bien) ---- */
type MyUnit = PropertySearchResult['units'][number] & { propertyId: string; label: string }
const myProperties = ref<PropertySearchResult[]>([])
const myUnitsState = ref<'loading' | 'error' | 'empty' | 'success'>('loading')
const selectedUnitId = ref('')
const myUnits = computed<MyUnit[]>(() => myProperties.value.flatMap(p => p.units.map(u => ({ ...u, propertyId: p.id, label: `${u.name} — ${p.name}` }))))
const selectedUnit = computed(() => myUnits.value.find(u => u.id === selectedUnitId.value) ?? null)

async function loadUnits() {
  const page = await landlordPropertiesApi.fetchMine({ limit: 100 })
  myProperties.value = page.data as PropertySearchResult[]
}
onMounted(async () => {
  try {
    await loadUnits()
    myUnitsState.value = myUnits.value.length ? 'success' : 'empty'
    const wanted = String(route.query.unit ?? '')
    selectedUnitId.value = myUnits.value.some(u => u.id === wanted) ? wanted : (myUnits.value[0]?.id ?? '')
  } catch {
    myUnitsState.value = 'error'
  }
})
watch(selectedUnitId, id => {
  if (!id) return
  pricingError.value = ''
  pricingNote.value = ''
  blockError.value = ''
  loadPricing()
  loadWaitlist()
  loadAvailability()
  resetStayLimits()
})

/* ---- Grille tarifaire ---- */
const pricing = ref<UnitPricing[]>([])
const pricingState = ref<'idle' | 'loading' | 'error' | 'success'>('idle')
async function loadPricing() {
  pricingState.value = 'loading'
  try {
    pricing.value = await pricingApi.fetchPricing(selectedUnitId.value)
    pricingState.value = 'success'
  } catch {
    pricingState.value = 'error'
  }
}

const FREQ_LABEL: Record<BillingFrequency, string> = { daily: 'À la nuit', weekly: 'À la semaine', monthly: 'Au mois', quarterly: 'Au trimestre', semi_annual: 'Au semestre', annual: "À l'année" }
const FREQ_UNIT: Record<string, [string, string]> = { daily: ['nuit', 'nuits'], weekly: ['semaine', 'semaines'], monthly: ['mois', 'mois'], quarterly: ['trimestre', 'trimestres'], semi_annual: ['semestre', 'semestres'], annual: ['an', 'ans'] }
const FREQ_ORDER: BillingFrequency[] = ['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual']
function freqLabel(f: string) {
  return FREQ_LABEL[f as BillingFrequency] ?? f
}
function minLabel(p: UnitPricing) {
  if (p.billing_frequency === 'daily') return p.min_periods > 1 ? `dès ${p.min_periods} nuits` : 'dès 1 nuit'
  const [one, many] = FREQ_UNIT[p.billing_frequency] ?? ['période', 'périodes']
  return `s'applique dès ${p.min_periods} ${p.min_periods > 1 ? many : one} (${(PERIOD_NIGHTS[p.billing_frequency] ?? 0) * p.min_periods} nuits)`
}
const sortedPricing = computed(() => [...pricing.value].sort((a, b) => FREQ_ORDER.indexOf(a.billing_frequency as BillingFrequency) - FREQ_ORDER.indexOf(b.billing_frequency as BillingFrequency)))
const missingFreqs = computed(() => FREQ_ORDER.filter(f => !pricing.value.some(p => p.billing_frequency === f)))
const hasDaily = computed(() => pricing.value.some(p => p.billing_frequency === 'daily' && p.is_available))

/** Exemple chiffré avec la vraie règle de l'API (combinaison la moins chère). */
const example = computed(() => {
  if (!hasDaily.value) return null
  for (const n of [10, 35]) {
    const q = quoteStay(n, pricing.value)
    if (q && q.saving > 0) return { nights: n, q }
  }
  return null
})

const pricingError = ref('')
const pricingNote = ref('')
/** Écart déjà présent à l'ouverture (tarif modifié ailleurs, ou avant ce lot) : signalé, alignement en un clic. */
const baseMismatch = computed(() => (selectedUnit.value && pricingState.value === 'success') ? syncedBasePrice(pricing.value, Number(selectedUnit.value.price)) : null)
const pricingBusy = ref<string | null>(null)

/** Le prix de base de l'unité sert à la recherche (filtre budget), aux fiches et au bail : on le réaligne sur la grille. */
async function syncBase() {
  const u = selectedUnit.value
  if (!u) return
  const target = syncedBasePrice(pricing.value, Number(u.price))
  if (target === null) return
  try {
    await landlordPropertiesApi.updateUnit(u.propertyId, u.id, { price: target })
    await loadUnits()
    pricingNote.value = `Prix affiché sur l'annonce mis à jour : ${fmtF(target)}.`
  } catch {
    pricingNote.value = `Le prix affiché sur l'annonce (${fmtF(u.price)}) n'a pas pu être aligné sur ce tarif : modifiez-le depuis la fiche du bien.`
  }
}

const showAdd = ref(false)
const newFreq = ref<BillingFrequency>('daily')
const newPrice = ref('')
const newMin = ref('1')
function openAdd() {
  showAdd.value = !showAdd.value
  newFreq.value = missingFreqs.value[0] ?? 'daily'
  newPrice.value = ''
  newMin.value = '1'
}
async function addPricing() {
  pricingError.value = validatePrice(newPrice.value) ?? (Number(newMin.value) >= 1 && Number.isInteger(Number(newMin.value)) ? '' : 'Le minimum doit être un nombre entier ≥ 1.')
  if (pricingError.value) return
  pricingBusy.value = 'new'
  pricingNote.value = ''
  try {
    await pricingApi.createPricing(selectedUnitId.value, { billing_frequency: newFreq.value, price: Number(newPrice.value.replace(/\s/g, '')), min_periods: Number(newMin.value) })
    showAdd.value = false
    await loadPricing()
    await syncBase()
  } catch (e) {
    pricingError.value = formatError(e, "L'ajout a échoué.")
  } finally {
    pricingBusy.value = null
  }
}

const editingId = ref<string | null>(null)
const editPrice = ref('')
const editMin = ref('1')
function startEdit(p: UnitPricing) {
  editingId.value = p.id
  editPrice.value = String(Math.round(Number(p.price)))
  editMin.value = String(p.min_periods)
  confirmRemoveId.value = null
}
async function saveEdit(p: UnitPricing) {
  pricingError.value = validatePrice(editPrice.value) ?? (Number(editMin.value) >= 1 && Number.isInteger(Number(editMin.value)) ? '' : 'Le minimum doit être un nombre entier ≥ 1.')
  if (pricingError.value) return
  pricingBusy.value = p.id
  pricingNote.value = ''
  try {
    await pricingApi.updatePricing(selectedUnitId.value, p.id, { price: Number(editPrice.value.replace(/\s/g, '')), min_periods: Number(editMin.value) })
    editingId.value = null
    await loadPricing()
    await syncBase()
  } catch (e) {
    pricingError.value = formatError(e, "L'enregistrement a échoué.")
  } finally {
    pricingBusy.value = null
  }
}
async function toggleAvailable(p: UnitPricing) {
  pricingBusy.value = p.id
  pricingError.value = ''
  pricingNote.value = ''
  try {
    await pricingApi.updatePricing(selectedUnitId.value, p.id, { is_available: !p.is_available })
    await loadPricing()
    await syncBase()
  } catch (e) {
    pricingError.value = formatError(e, 'La modification a échoué.')
  } finally {
    pricingBusy.value = null
  }
}
const confirmRemoveId = ref<string | null>(null)
async function removePricing(p: UnitPricing) {
  pricingBusy.value = p.id
  pricingError.value = ''
  pricingNote.value = ''
  try {
    await pricingApi.removePricing(selectedUnitId.value, p.id)
    confirmRemoveId.value = null
    await loadPricing()
    await syncBase()
  } catch (e) {
    pricingError.value = formatError(e, 'Le retrait a échoué.')
  } finally {
    pricingBusy.value = null
  }
}

/* ---- Durée de séjour (appliquée par l'API à chaque réservation) ---- */
const minStay = ref('')
const maxStay = ref('')
const stayError = ref('')
const staySaved = ref(false)
const staySaving = ref(false)
function resetStayLimits() {
  const u = selectedUnit.value
  minStay.value = u?.min_duration_days ? String(u.min_duration_days) : ''
  maxStay.value = u?.max_duration_days ? String(u.max_duration_days) : ''
  stayError.value = ''
  staySaved.value = false
}
async function saveStayLimits() {
  const u = selectedUnit.value
  if (!u) return
  const min = minStay.value.trim() ? Number(minStay.value) : null
  const max = maxStay.value.trim() ? Number(maxStay.value) : null
  if ((min !== null && (!Number.isInteger(min) || min < 1)) || (max !== null && (!Number.isInteger(max) || max < 1))) {
    stayError.value = 'Saisissez un nombre entier de nuits (1 ou plus).'
    return
  }
  if (min !== null && max !== null && max < min) {
    stayError.value = 'Le maximum doit être supérieur ou égal au minimum.'
    return
  }
  staySaving.value = true
  stayError.value = ''
  try {
    await landlordPropertiesApi.updateUnit(u.propertyId, u.id, { min_duration_days: min, max_duration_days: max })
    await loadUnits()
    staySaved.value = true
  } catch (e) {
    stayError.value = formatError(e, "L'enregistrement a échoué.")
  } finally {
    staySaving.value = false
  }
}

/* ---- Liste d'attente ---- */
const waitlist = ref<LandlordWaitlistEntry[]>([])
const waitlistState = ref<'idle' | 'loading' | 'error' | 'success'>('idle')
const waitlistError = ref('')
async function loadWaitlist() {
  waitlistState.value = 'loading'
  waitlistError.value = ''
  try {
    waitlist.value = await waitlistApi.fetchForUnit(selectedUnitId.value)
    waitlistState.value = 'success'
  } catch {
    waitlistState.value = 'error'
  }
}
function waitlistName(w: LandlordWaitlistEntry) {
  return `${w.tenant.first_name ?? ''} ${w.tenant.last_name ?? ''}`.trim() || 'Locataire'
}
/** L'API ne prévient jamais automatiquement (constaté en live) : écrire au locataire est le seul moyen réel. */
async function contactWaitlistTenant(w: LandlordWaitlistEntry) {
  waitlistError.value = ''
  try {
    await messagingApi.createConversation(selectedUnitId.value, w.tenant.id)
    await navigateTo('/pro/messages')
  } catch (e) {
    waitlistError.value = formatError(e, "Impossible d'ouvrir la conversation.")
  }
}
const confirmWaitId = ref<string | null>(null)
async function removeWaitlistEntry(w: LandlordWaitlistEntry) {
  waitlistError.value = ''
  try {
    await waitlistApi.removeEntry(selectedUnitId.value, w.tenant.id)
    confirmWaitId.value = null
    waitlist.value = waitlist.value.filter(x => x.id !== w.id)
  } catch (e) {
    waitlistError.value = formatError(e, 'Le retrait a échoué.')
  }
}

/* ---- Calendrier ---- */
const availability = ref<AvailabilityBlock[]>([])
const availabilityState = ref<'idle' | 'loading' | 'error' | 'success'>('idle')
async function loadAvailability() {
  availabilityState.value = 'loading'
  try {
    availability.value = await pricingApi.fetchAvailability(selectedUnitId.value)
    availabilityState.value = 'success'
  } catch {
    availabilityState.value = 'error'
  }
}

/**
 * `GET /units/:id/availability` ne renvoie ni l'id ni le motif d'un blocage
 * (constaté en live) : seul `POST` renvoie l'id nécessaire au `DELETE`. On le
 * mémorise donc sur cet appareil pour permettre le retrait — un blocage créé
 * ailleurs ne peut pas être retiré tant que l'API ne l'expose pas.
 */
interface KnownBlock { id: string; start_date: string; end_date: string; note: string | null }
function knownKey(unitId: string) {
  return `immo:manual-blocks:${unitId}`
}
function readKnown(unitId: string): KnownBlock[] {
  try {
    return JSON.parse(localStorage.getItem(knownKey(unitId)) ?? '[]') as KnownBlock[]
  } catch {
    return []
  }
}
function writeKnown(unitId: string, list: KnownBlock[]) {
  try {
    localStorage.setItem(knownKey(unitId), JSON.stringify(list))
  } catch {
    // stockage indisponible (navigation privée…) : le retrait ne sera simplement pas proposé
  }
}
const knownBlocks = ref<KnownBlock[]>([])
watch(selectedUnitId, id => { knownBlocks.value = id ? readKnown(id) : [] })
function knownFor(b: AvailabilityBlock) {
  return knownBlocks.value.find(k => k.start_date === b.start_date.slice(0, 10) && k.end_date === b.end_date?.slice(0, 10))
}

const BLOCK_LABEL: Record<string, string> = { lease: 'Bail', short_stay_booking: 'Réservation', manual: 'Blocage manuel' }
const BLOCK_COLOR: Record<string, string> = { lease: 'bg-green-300 text-green-900', short_stay_booking: 'bg-info-bg text-info-fg-deep', manual: 'bg-sand-300 text-[var(--text-secondary)]' }

const monthOffset = ref(0)
const shownMonth = computed(() => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + monthOffset.value, 1)
})
const monthLabel = computed(() => shownMonth.value.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))
const calendarCells = computed(() => {
  const m = shownMonth.value
  const firstWeekday = (m.getDay() + 6) % 7
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
  const out: { d: number | null; iso: string; block: AvailabilityBlock | undefined; past: boolean }[] = Array.from({ length: firstWeekday }, () => ({ d: null, iso: '', block: undefined, past: false }))
  for (let d = 1; d <= days; d++) {
    const iso = localIso(new Date(m.getFullYear(), m.getMonth(), d))
    out.push({ d, iso, block: availability.value.find(b => isDayBlocked(iso, [b])), past: iso < todayIso })
  }
  return out
})
/** Blocages en cours ou à venir, du plus proche au plus lointain — visibles même hors du mois affiché. */
const upcomingBlocks = computed(() => availability.value
  .filter(b => !b.end_date || b.end_date.slice(0, 10) > todayIso)
  .sort((a, b) => a.start_date.localeCompare(b.start_date)))
function blockRange(b: AvailabilityBlock) {
  if (!b.end_date) return `depuis le ${fmtDay(b.start_date)} (sans date de fin)`
  const last = addDays(b.end_date.slice(0, 10), -1)
  return last === b.start_date.slice(0, 10) ? `le ${fmtDay(b.start_date)}` : `du ${fmtDay(b.start_date)} au ${fmtDay(last)} inclus`
}

const showBlockForm = ref(false)
const blockFirst = ref('')
const blockLast = ref('')
const blockNote = ref('')
const blockError = ref('')
const blockBusy = ref(false)
async function submitBlock() {
  blockError.value = ''
  if (!blockFirst.value || !blockLast.value) { blockError.value = 'Choisissez le premier et le dernier jour bloqués.'; return }
  if (blockFirst.value < todayIso) { blockError.value = 'On ne peut pas bloquer des jours déjà passés.'; return }
  if (blockLast.value < blockFirst.value) { blockError.value = 'Le dernier jour doit être après le premier.'; return }
  blockBusy.value = true
  try {
    const created = await pricingApi.blockAvailability(selectedUnitId.value, { start_date: blockFirst.value, end_date: addDays(blockLast.value, 1), note: blockNote.value.trim() || undefined })
    knownBlocks.value = [...knownBlocks.value, { id: created.id, start_date: blockFirst.value, end_date: addDays(blockLast.value, 1), note: blockNote.value.trim() || null }]
    writeKnown(selectedUnitId.value, knownBlocks.value)
    showBlockForm.value = false
    blockFirst.value = ''
    blockLast.value = ''
    blockNote.value = ''
    await loadAvailability()
  } catch (e) {
    blockError.value = e instanceof ApiRequestError && e.status === 409
      ? 'Ces dates chevauchent déjà un bail, une réservation ou un autre blocage.'
      : formatError(e, 'Le blocage a échoué.')
  } finally {
    blockBusy.value = false
  }
}
function unblockBlock(b: AvailabilityBlock) {
  const k = knownFor(b)
  if (k) unblock(k)
}
async function unblock(k: KnownBlock) {
  blockError.value = ''
  try {
    await pricingApi.unblockAvailability(selectedUnitId.value, k.id)
  } catch (e) {
    if (!(e instanceof ApiRequestError && e.status === 404)) {
      blockError.value = formatError(e, 'Le retrait a échoué.')
      return
    }
  }
  knownBlocks.value = knownBlocks.value.filter(x => x.id !== k.id)
  writeKnown(selectedUnitId.value, knownBlocks.value)
  await loadAvailability()
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="myUnitsState === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard :height="90" :lines="1" />
    </div>
    <p v-else-if="myUnitsState === 'error'" class="rounded-md border border-dashed border-danger-border bg-white px-4 py-10 text-center text-[13.5px] text-danger-fg">Impossible de charger vos logements pour le moment.</p>
    <p v-else-if="myUnitsState === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">Aucun logement pour l'instant — <NuxtLink to="/pro/biens/ajouter" class="font-bold text-green-700">ajoutez d'abord un bien</NuxtLink>.</p>

    <template v-else>
      <div class="mb-4.5 flex flex-wrap items-center gap-3">
        <select v-model="selectedUnitId" aria-label="Logement" class="h-11 max-w-full rounded-pill border border-[var(--border-default)] bg-white px-4 text-[13px] font-semibold text-sand-900">
          <option v-for="u in myUnits" :key="u.id" :value="u.id">{{ u.label }}</option>
        </select>
        <span v-if="selectedUnit" class="text-[12.5px] text-[var(--text-muted)]">Prix affiché sur l'annonce : <strong class="font-mono text-[var(--text-primary)]">{{ fmtF(selectedUnit.price) }}</strong></span>
      </div>

      <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[1.15fr_1fr]">
        <div class="flex flex-col gap-4.5">
          <!-- Grille tarifaire -->
          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <div class="mb-1.5 flex items-baseline justify-between gap-3">
              <p class="m-0 text-[15px] font-bold">Grille tarifaire</p>
              <button v-if="missingFreqs.length" type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold" @click="openAdd">+ Tarif</button>
            </div>
            <p class="mb-3.5 mt-0 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
              <template v-if="hasDaily">Réservation en ligne <strong class="text-ok-fg">ouverte</strong> : le locataire paie le prix de la nuit, et Immo applique automatiquement vos tarifs semaine/mois dès que le séjour est assez long (la combinaison la moins chère).</template>
              <template v-else>Sans tarif « À la nuit » actif, ce logement ne peut pas être réservé en ligne : il se loue uniquement avec un bail.</template>
            </p>
            <p v-if="example" class="mb-3.5 mt-0 rounded-md bg-green-50 px-3.5 py-2.5 text-[12.5px] text-green-900">
              Exemple : {{ example.nights }} nuits = {{ example.q.lines.map(l => l.label).join(' + ') }} → <strong>{{ fmtF(example.q.total) }}</strong> au lieu de {{ fmtF(example.q.total + example.q.saving) }}.
            </p>

            <div v-if="showAdd" class="mb-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5">
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label class="text-[11.5px] font-bold">Fréquence
                  <select v-model="newFreq" class="mt-1 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2 text-[13px] font-normal">
                    <option v-for="f in missingFreqs" :key="f" :value="f">{{ FREQ_LABEL[f] }}</option>
                  </select>
                </label>
                <label class="text-[11.5px] font-bold">Prix (FCFA)
                  <input v-model="newPrice" inputmode="numeric" placeholder="15000" class="mt-1 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2 font-mono text-[13px] font-normal outline-none">
                </label>
                <label class="text-[11.5px] font-bold">{{ newFreq === 'daily' ? 'Nuits minimum' : 'Périodes minimum' }}
                  <input v-model="newMin" inputmode="numeric" class="mt-1 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2 font-mono text-[13px] font-normal outline-none">
                </label>
              </div>
              <div class="mt-2.5 flex gap-2">
                <CoreButton size="sm" :disabled="pricingBusy === 'new'" @click="addPricing">{{ pricingBusy === 'new' ? '…' : 'Ajouter' }}</CoreButton>
                <CoreButton size="sm" tone="secondary" @click="showAdd = false">Annuler</CoreButton>
              </div>
            </div>

            <div v-if="baseMismatch !== null && selectedUnit" class="mb-2.5 flex flex-wrap items-center gap-2 rounded-md border border-warn-border bg-warn-bg px-3 py-2 text-[12.5px] text-warn-fg">
              <span class="flex-1">Le prix affiché sur l'annonce ({{ fmtF(selectedUnit.price) }}) ne correspond pas à votre grille ({{ fmtF(baseMismatch) }}) : la recherche et le bail utilisent le prix affiché.</span>
              <CoreButton size="sm" tone="secondary" @click="syncBase">Aligner</CoreButton>
            </div>
            <p v-if="pricingError" class="mb-2.5 mt-0 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[12.5px] font-semibold text-danger-fg">{{ pricingError }}</p>
            <p v-if="pricingNote" class="mb-2.5 mt-0 rounded-md bg-sand-100 px-3 py-2 text-[12.5px] text-[var(--text-secondary)]">{{ pricingNote }}</p>

            <div v-if="pricingState === 'loading'" class="flex flex-col gap-2"><DataSkeletonCard :height="40" :lines="1" /></div>
            <p v-else-if="pricingState === 'error'" class="m-0 text-[13px] text-danger-fg">Impossible de charger les tarifs. <button type="button" class="font-bold underline" @click="loadPricing">Réessayer</button></p>
            <p v-else-if="!pricing.length" class="m-0 text-[13px] text-[var(--text-muted)]">Aucun tarif : le logement se loue au prix affiché sur l'annonce, avec un bail.</p>
            <div v-for="p in sortedPricing" v-else :key="p.id" class="border-b border-sand-200 py-3 last:border-b-0">
              <div v-if="editingId !== p.id" class="flex flex-wrap items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p class="m-0 text-sm font-bold" :class="p.is_available ? '' : 'text-[var(--text-faint)]'">{{ freqLabel(p.billing_frequency) }}</p>
                  <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ minLabel(p) }}</p>
                </div>
                <span class="font-mono text-[15px] font-bold" :class="p.is_available ? '' : 'text-[var(--text-faint)] line-through'">{{ fmtF(p.price) }}</span>
                <button type="button" class="rounded-pill px-2.5 py-1.5 text-[11px] font-bold" :class="p.is_available ? 'bg-green-50 text-green-700' : 'bg-sand-200 text-[var(--text-muted)]'" :disabled="pricingBusy === p.id" :title="p.is_available ? 'Cliquer pour suspendre ce tarif' : 'Cliquer pour réactiver ce tarif'" @click="toggleAvailable(p)">{{ p.is_available ? 'Actif' : 'Suspendu' }}</button>
                <button type="button" class="text-xs font-bold text-green-700" @click="startEdit(p)">Modifier</button>
                <button type="button" class="text-xs font-bold text-danger-fg" :disabled="pricingBusy === p.id" @click="confirmRemoveId = p.id">Retirer</button>
              </div>
              <div v-else class="flex flex-wrap items-end gap-2">
                <p class="m-0 w-full text-sm font-bold">{{ freqLabel(p.billing_frequency) }}</p>
                <label class="text-[11.5px] font-bold">Prix (FCFA)<input v-model="editPrice" inputmode="numeric" class="mt-1 block h-9 w-32 rounded-sm border border-[var(--border-default)] bg-white px-2 font-mono text-[13px] font-normal outline-none"></label>
                <label class="text-[11.5px] font-bold">Minimum<input v-model="editMin" inputmode="numeric" class="mt-1 block h-9 w-20 rounded-sm border border-[var(--border-default)] bg-white px-2 font-mono text-[13px] font-normal outline-none"></label>
                <CoreButton size="sm" :disabled="pricingBusy === p.id" @click="saveEdit(p)">{{ pricingBusy === p.id ? '…' : 'Enregistrer' }}</CoreButton>
                <CoreButton size="sm" tone="secondary" @click="editingId = null">Annuler</CoreButton>
              </div>
              <div v-if="confirmRemoveId === p.id" class="mt-2.5 flex flex-wrap items-center gap-2 rounded-md border border-danger-border bg-danger-bg px-3 py-2">
                <p class="m-0 flex-1 text-[12.5px] font-semibold text-danger-fg-deep">Retirer le tarif « {{ freqLabel(p.billing_frequency).toLowerCase() }} » ?<template v-if="p.billing_frequency === 'daily'"> La réservation en ligne sera fermée.</template></p>
                <CoreButton size="sm" tone="danger" :disabled="pricingBusy === p.id" @click="removePricing(p)">Retirer</CoreButton>
                <CoreButton size="sm" tone="secondary" @click="confirmRemoveId = null">Annuler</CoreButton>
              </div>
            </div>
          </div>

          <!-- Durée de séjour -->
          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="m-0 text-[15px] font-bold">Durée de séjour</p>
            <p class="mb-3 mt-1 text-[12.5px] text-[var(--text-muted)]">Appliquée à chaque réservation en ligne. Laissez vide pour ne rien imposer.</p>
            <div class="flex flex-wrap items-end gap-2.5">
              <label class="text-[11.5px] font-bold">Minimum (nuits)<input v-model="minStay" inputmode="numeric" placeholder="1" class="mt-1 block h-10 w-28 rounded-sm border border-[var(--border-default)] bg-white px-2 font-mono text-[13px] font-normal outline-none" @input="staySaved = false"></label>
              <label class="text-[11.5px] font-bold">Maximum (nuits)<input v-model="maxStay" inputmode="numeric" placeholder="—" class="mt-1 block h-10 w-28 rounded-sm border border-[var(--border-default)] bg-white px-2 font-mono text-[13px] font-normal outline-none" @input="staySaved = false"></label>
              <CoreButton size="sm" :disabled="staySaving" @click="saveStayLimits">{{ staySaving ? '…' : 'Enregistrer' }}</CoreButton>
              <span v-if="staySaved" class="text-[12.5px] font-semibold text-ok-fg">Enregistré ✓</span>
            </div>
            <p v-if="stayError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ stayError }}</p>
          </div>

          <!-- Liste d'attente -->
          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="m-0 text-[15px] font-bold">Liste d'attente</p>
            <p class="mb-2 mt-1 text-[12.5px] text-[var(--text-muted)]">Immo ne prévient pas encore automatiquement ces personnes quand le logement se libère : contactez-les.</p>
            <div v-if="waitlistState === 'loading'" class="mt-3"><DataSkeletonCard :height="40" :lines="1" /></div>
            <p v-else-if="waitlistState === 'error'" class="mb-0 mt-2 text-[12.5px] text-danger-fg">Impossible de charger la liste d'attente.</p>
            <p v-else-if="!waitlist.length" class="mb-0 mt-2 text-[12.5px] text-[var(--text-muted)]">Personne en attente pour ce logement.</p>
            <div v-for="w in waitlist" :key="w.id" class="border-t border-sand-200 py-2.5 first:border-t-0">
              <div class="flex items-center gap-3">
                <CoreAvatar :name="waitlistName(w)" :size="34" />
                <div class="min-w-0 flex-1">
                  <p class="m-0 text-[13.5px] font-semibold">{{ waitlistName(w) }}</p>
                  <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">inscrit le {{ fmtDay(w.created_at) }}</p>
                  <p v-if="w.message" class="mb-0 mt-1 text-[12.5px] italic text-[var(--text-secondary)]">« {{ w.message }} »</p>
                </div>
                <CoreButton size="sm" tone="secondary" @click="contactWaitlistTenant(w)">Contacter</CoreButton>
                <button type="button" class="text-xs font-bold text-danger-fg" @click="confirmWaitId = w.id">Retirer</button>
              </div>
              <div v-if="confirmWaitId === w.id" class="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-danger-border bg-danger-bg px-3 py-2">
                <p class="m-0 flex-1 text-[12.5px] font-semibold text-danger-fg-deep">Retirer {{ waitlistName(w) }} de la liste ?</p>
                <CoreButton size="sm" tone="danger" @click="removeWaitlistEntry(w)">Retirer</CoreButton>
                <CoreButton size="sm" tone="secondary" @click="confirmWaitId = null">Annuler</CoreButton>
              </div>
            </div>
            <p v-if="waitlistError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ waitlistError }}</p>
          </div>
        </div>

        <!-- Calendrier -->
        <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="mb-3.5 flex items-center justify-between gap-2">
            <button type="button" class="grid h-8 w-8 place-items-center rounded-pill border border-[var(--border-default)] text-sm disabled:opacity-40" aria-label="Mois précédent" :disabled="monthOffset <= 0" @click="monthOffset--">‹</button>
            <p class="m-0 text-[15px] font-bold capitalize">{{ monthLabel }}</p>
            <button type="button" class="grid h-8 w-8 place-items-center rounded-pill border border-[var(--border-default)] text-sm" aria-label="Mois suivant" @click="monthOffset++">›</button>
          </div>

          <div v-if="availabilityState === 'loading'" class="flex flex-col gap-2"><DataSkeletonCard :height="180" :lines="1" /></div>
          <p v-else-if="availabilityState === 'error'" class="m-0 text-[13px] text-danger-fg">Impossible de charger le calendrier. <button type="button" class="font-bold underline" @click="loadAvailability">Réessayer</button></p>
          <template v-else>
            <div class="mb-1 grid grid-cols-7 gap-1.5 text-center text-[10.5px] font-bold text-[var(--text-faint)]">
              <span v-for="(d, i) in ['L', 'M', 'M', 'J', 'V', 'S', 'D']" :key="i">{{ d }}</span>
            </div>
            <div class="grid grid-cols-7 gap-1.5">
              <div v-for="(c, i) in calendarCells" :key="i" class="aspect-square rounded-sm">
                <div
                  v-if="c.d"
                  class="grid h-full w-full place-items-center rounded-sm font-mono text-xs font-bold"
                  :class="[c.block ? (BLOCK_COLOR[c.block.blocked_by] ?? 'bg-sand-300') : 'border border-sand-200 bg-white text-[var(--text-secondary)]', c.past ? 'opacity-40' : '']"
                  :title="c.block ? BLOCK_LABEL[c.block.blocked_by] ?? c.block.blocked_by : 'Libre'"
                >{{ c.d }}</div>
              </div>
            </div>
            <div class="mt-3.5 flex flex-wrap gap-3.5">
              <span class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><span class="h-3 w-3 rounded-xs bg-green-300" />Bail</span>
              <span class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><span class="h-3 w-3 rounded-xs bg-info-bg" />Réservation</span>
              <span class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><span class="h-3 w-3 rounded-xs bg-sand-300" />Blocage manuel</span>
              <span class="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><span class="h-3 w-3 rounded-xs border border-sand-200 bg-white" />Libre</span>
            </div>

            <div class="mt-4.5 border-t border-sand-200 pt-4">
              <div class="mb-2 flex items-center justify-between">
                <p class="m-0 text-[13.5px] font-bold">Indisponibilités à venir</p>
                <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold" @click="showBlockForm = !showBlockForm">+ Bloquer des dates</button>
              </div>

              <div v-if="showBlockForm" class="mb-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5">
                <div class="grid grid-cols-2 gap-2">
                  <label class="text-[11.5px] font-bold">Premier jour bloqué<input v-model="blockFirst" type="date" :min="todayIso" class="mt-1 block h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2 text-[13px] font-normal outline-none"></label>
                  <label class="text-[11.5px] font-bold">Dernier jour bloqué<input v-model="blockLast" type="date" :min="blockFirst || todayIso" class="mt-1 block h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2 text-[13px] font-normal outline-none"></label>
                </div>
                <input v-model="blockNote" maxlength="255" placeholder="Motif (optionnel, pour vous seul)" class="mt-2 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2 text-[13px] outline-none">
                <div class="mt-2.5 flex gap-2">
                  <CoreButton size="sm" :disabled="blockBusy" @click="submitBlock">{{ blockBusy ? '…' : 'Bloquer' }}</CoreButton>
                  <CoreButton size="sm" tone="secondary" @click="showBlockForm = false">Annuler</CoreButton>
                </div>
              </div>
              <p v-if="blockError" class="mb-2 mt-0 text-[12.5px] font-semibold text-danger-fg">{{ blockError }}</p>

              <p v-if="!upcomingBlocks.length" class="m-0 text-[12.5px] text-[var(--text-muted)]">Aucune indisponibilité prévue.</p>
              <div v-for="(b, i) in upcomingBlocks" :key="i" class="flex items-center gap-2.5 border-t border-sand-100 py-2 first:border-t-0">
                <span class="h-2.5 w-2.5 flex-none rounded-pill" :class="BLOCK_COLOR[b.blocked_by]?.split(' ')[0] ?? 'bg-sand-300'" />
                <div class="min-w-0 flex-1">
                  <p class="m-0 text-[13px] font-semibold">{{ BLOCK_LABEL[b.blocked_by] ?? b.blocked_by }}<template v-if="knownFor(b)?.note"> — {{ knownFor(b)?.note }}</template></p>
                  <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ blockRange(b) }}</p>
                </div>
                <button v-if="b.blocked_by === 'manual' && knownFor(b)" type="button" class="text-xs font-bold text-danger-fg" @click="unblockBlock(b)">Débloquer</button>
                <span v-else-if="b.blocked_by === 'manual'" class="text-[11px] text-[var(--text-faint)]" title="L'API ne permet de retirer un blocage que depuis l'appareil qui l'a créé.">non retirable ici</span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
