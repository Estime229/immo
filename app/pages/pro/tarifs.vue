<script setup lang="ts">
import { CalendarOff, Check, ChevronLeft, ChevronRight, DoorOpen, MessageSquare, Plus, UserRound, X } from '@lucide/vue'
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
function pickUnit(wanted: string) {
  selectedUnitId.value = myUnits.value.some(u => u.id === wanted) ? wanted : (selectedUnitId.value || myUnits.value[0]?.id || '')
}
async function loadAll() {
  myUnitsState.value = 'loading'
  try {
    await loadUnits()
    myUnitsState.value = myUnits.value.length ? 'success' : 'empty'
    pickUnit(String(route.query.unit ?? ''))
  } catch {
    myUnitsState.value = 'error'
  }
}
onMounted(loadAll)
/* Lien profond (?unit=) suivi même si l'on est déjà sur la page ; le logement choisi est reporté dans l'URL. */
const router = useRouter()
watch(() => route.query.unit, v => { if (typeof v === 'string' && v && v !== selectedUnitId.value && myUnitsState.value === 'success') pickUnit(v) })
watch(selectedUnitId, id => { if (id && route.query.unit !== id) router.replace({ query: { ...route.query, unit: id } }) })
const unitOptions = computed(() => myUnits.value.map(u => ({ value: u.id, label: u.label })))
onMounted(() => useLandlordTarifsBadge().markAllSeen())
watch(selectedUnitId, id => {
  if (!id) return
  pricingError.value = ''
  pricingNote.value = ''
  pricingFlash.value = ''
  blockError.value = ''
  blockFlash.value = ''
  confirmRemoveId.value = null
  confirmSuspendId.value = null
  confirmUnblock.value = null
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
/** Résultat d'une action réussie sur la grille (bandeau vert). */
const pricingFlash = ref('')
const FREQ_OPTIONS = computed(() => missingFreqs.value.map(f => ({ value: f, label: FREQ_LABEL[f] })))
const newFreqModel = computed({ get: () => newFreq.value as string, set: (v: string) => { newFreq.value = v as BillingFrequency } })
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
    pricingFlash.value = `Tarif « ${freqLabel(newFreq.value).toLowerCase()} » ajouté.`
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
    pricingFlash.value = `Tarif « ${freqLabel(p.billing_frequency).toLowerCase()} » mis à jour.`
    await loadPricing()
    await syncBase()
  } catch (e) {
    pricingError.value = formatError(e, "L'enregistrement a échoué.")
  } finally {
    pricingBusy.value = null
  }
}
/** Suspendre se confirme (comme retirer) : un tarif « à la nuit » suspendu ferme la réservation en ligne. Réactiver, non. */
const confirmSuspendId = ref<string | null>(null)
function askToggle(p: UnitPricing) {
  pricingFlash.value = ''
  confirmRemoveId.value = null
  if (p.is_available) confirmSuspendId.value = p.id
  else toggleAvailable(p)
}
function suspendMessage(p: UnitPricing) {
  return p.billing_frequency === 'daily'
    ? 'Suspendre le tarif à la nuit ? La réservation en ligne de ce logement sera fermée jusqu\'à sa réactivation.'
    : `Suspendre le tarif « ${freqLabel(p.billing_frequency).toLowerCase()} » ? Il ne s'appliquera plus aux séjours, jusqu'à sa réactivation.`
}
async function toggleAvailable(p: UnitPricing) {
  pricingBusy.value = p.id
  pricingError.value = ''
  pricingNote.value = ''
  try {
    await pricingApi.updatePricing(selectedUnitId.value, p.id, { is_available: !p.is_available })
    confirmSuspendId.value = null
    pricingFlash.value = p.is_available ? `Tarif « ${freqLabel(p.billing_frequency).toLowerCase()} » suspendu.` : `Tarif « ${freqLabel(p.billing_frequency).toLowerCase()} » réactivé.`
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
    pricingFlash.value = `Tarif « ${freqLabel(p.billing_frequency).toLowerCase()} » retiré.`
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
function onStayInput(which: 'min' | 'max', v: string) {
  if (which === 'min') minStay.value = v
  else maxStay.value = v
  staySaved.value = false
}
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
    const conv = await messagingApi.openConversation(selectedUnitId.value, w.tenant.id)
    await navigateTo({ path: '/pro/messages', query: { conversation: conv.id } })
  } catch (e) {
    waitlistError.value = formatError(e, "Impossible d'ouvrir la conversation.")
  }
}
const confirmWaitId = ref<string | null>(null)
const waitlistBusy = ref(false)
async function removeWaitlistEntry(w: LandlordWaitlistEntry) {
  waitlistError.value = ''
  waitlistBusy.value = true
  try {
    await waitlistApi.removeEntry(selectedUnitId.value, w.tenant.id)
    confirmWaitId.value = null
    waitlist.value = waitlist.value.filter(x => x.id !== w.id)
  } catch (e) {
    waitlistError.value = formatError(e, 'Le retrait a échoué.')
  } finally {
    waitlistBusy.value = false
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
const blockFlash = ref('')
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
    blockFlash.value = blockFirst.value === blockLast.value ? `Le ${fmtDay(blockFirst.value)} est bloqué.` : `Du ${fmtDay(blockFirst.value)} au ${fmtDay(blockLast.value)} : dates bloquées.`
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
/** Débloquer rouvre les dates à la réservation : confirmé sur place, comme un retrait. */
const confirmUnblock = ref<AvailabilityBlock | null>(null)
const unblocking = ref(false)
function askUnblock(b: AvailabilityBlock) {
  blockFlash.value = ''
  confirmUnblock.value = b
}
async function unblockConfirmed() {
  const b = confirmUnblock.value
  const k = b ? knownFor(b) : undefined
  if (!b || !k) return
  blockError.value = ''
  unblocking.value = true
  try {
    await pricingApi.unblockAvailability(selectedUnitId.value, k.id)
  } catch (e) {
    if (!(e instanceof ApiRequestError && e.status === 404)) {
      blockError.value = formatError(e, 'Le retrait a échoué.')
      unblocking.value = false
      return
    }
  }
  knownBlocks.value = knownBlocks.value.filter(x => x.id !== k.id)
  writeKnown(selectedUnitId.value, knownBlocks.value)
  confirmUnblock.value = null
  unblocking.value = false
  blockFlash.value = `Dates rouvertes à la réservation (${blockRange(b)}).`
  await loadAvailability()
}
function sameBlock(a: AvailabilityBlock | null, b: AvailabilityBlock) {
  return !!a && a.start_date === b.start_date && a.end_date === b.end_date && a.blocked_by === b.blocked_by
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="myUnitsState === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard :height="42" :lines="0" />
      <DataSkeletonCard :height="180" :lines="1" />
    </div>
    <FeedbackAlertBanner v-else-if="myUnitsState === 'error'" tone="danger">
      Impossible de charger vos logements pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="loadAll">Réessayer</button>
    </FeedbackAlertBanner>
    <ProEmptyPanel v-else-if="myUnitsState === 'empty'" :icon="DoorOpen" title="Aucun logement à tarifer" text="Les tarifs et le calendrier se règlent logement par logement. Ajoutez d'abord un bien avec au moins un logement.">
      <NuxtLink to="/pro/biens" class="inline-flex items-center gap-1.5 rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-[14px] font-bold text-white shadow-action">Mes biens</NuxtLink>
    </ProEmptyPanel>

    <template v-else>
      <div class="mb-4.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <select v-model="selectedUnitId" aria-label="Logement" class="h-[42px] max-w-full cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none">
          <option v-for="u in unitOptions" :key="u.value" :value="u.value">{{ u.label }}</option>
        </select>
        <span v-if="selectedUnit" class="text-xs text-[var(--text-faint)]">Prix affiché sur l'annonce : <strong class="font-mono text-[13px] text-[var(--text-primary)]">{{ fmtF(selectedUnit.price) }}</strong></span>
        <NuxtLink v-if="selectedUnit" :to="`/pro/biens/fiche?id=${selectedUnit.propertyId}`" class="ml-auto text-[12.5px] font-bold text-green-700">Fiche du bien</NuxtLink>
      </div>

      <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div class="flex min-w-0 flex-col gap-4.5">
          <!-- Grille tarifaire -->
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <div class="mb-1 flex flex-wrap items-center justify-between gap-3">
              <h2 class="m-0 text-[15px] font-bold">Grille tarifaire</h2>
              <CoreButton v-if="missingFreqs.length && !showAdd" size="sm" tone="secondary" class="inline-flex items-center gap-1.5" @click="openAdd"><Plus class="h-4 w-4" :stroke-width="1.9" />Ajouter un tarif</CoreButton>
            </div>
            <p class="mb-3.5 mt-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
              <template v-if="hasDaily">Réservation en ligne <strong class="text-ok-fg">ouverte</strong> : le voyageur paie le prix de la nuit, et Immo applique vos tarifs semaine/mois dès que le séjour est assez long (la combinaison la moins chère).</template>
              <template v-else>Sans tarif « À la nuit » actif, ce logement ne peut pas être réservé en ligne : il se loue uniquement avec un bail.</template>
            </p>
            <p v-if="example" class="mb-3.5 mt-0 rounded-md bg-green-50 px-3.5 py-2.5 text-[12.5px] text-green-900">
              Exemple : <span class="font-mono">{{ example.nights }}</span> nuits = {{ example.q.lines.map(l => l.label).join(' + ') }}, soit <strong class="font-mono">{{ fmtF(example.q.total) }}</strong> au lieu de <span class="font-mono">{{ fmtF(example.q.total + example.q.saving) }}</span>.
            </p>

            <div v-if="showAdd" class="mb-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
              <div class="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
                <FormsSelect v-model="newFreqModel" label="Fréquence" :options="FREQ_OPTIONS" class="[&_select]:w-full" />
                <FormsInput v-model="newPrice" label="Prix (FCFA)" type="number" mono placeholder="15000" />
                <FormsInput v-model="newMin" :label="newFreq === 'daily' ? 'Nuits minimum' : 'Périodes minimum'" type="number" mono />
              </div>
              <div class="mt-3 flex gap-2">
                <CoreButton size="sm" :disabled="pricingBusy === 'new'" @click="addPricing">{{ pricingBusy === 'new' ? 'Ajout…' : 'Ajouter' }}</CoreButton>
                <CoreButton size="sm" tone="secondary" @click="showAdd = false">Annuler</CoreButton>
              </div>
            </div>

            <div v-if="baseMismatch !== null && selectedUnit" class="mb-3 flex flex-wrap items-center gap-2.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[12.5px] text-warn-fg">
              <span class="min-w-0 flex-1">Le prix affiché sur l'annonce (<span class="font-mono">{{ fmtF(selectedUnit.price) }}</span>) ne correspond pas à votre grille (<span class="font-mono">{{ fmtF(baseMismatch) }}</span>) : la recherche et le bail utilisent le prix affiché.</span>
              <CoreButton size="sm" tone="secondary" @click="syncBase">Aligner</CoreButton>
            </div>
            <p v-if="pricingFlash" class="mb-3 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ pricingFlash }}</p>
            <p v-if="pricingError" class="mb-3 mt-0 text-[13px] font-semibold text-danger-fg">{{ pricingError }}</p>
            <p v-if="pricingNote" class="mb-3 mt-0 rounded-md bg-sand-100 px-3.5 py-2.5 text-[12.5px] text-[var(--text-secondary)]">{{ pricingNote }}</p>

            <DataSkeletonCard v-if="pricingState === 'loading'" :height="44" :lines="0" />
            <FeedbackAlertBanner v-else-if="pricingState === 'error'" tone="danger">
              Impossible de charger les tarifs.
              <button type="button" class="ml-2 font-bold underline" @click="loadPricing">Réessayer</button>
            </FeedbackAlertBanner>
            <p v-else-if="!pricing.length" class="m-0 rounded-md border border-dashed border-[var(--border-default)] px-4 py-6 text-center text-[13.5px] text-[var(--text-muted)]">Aucun tarif : le logement se loue au prix affiché sur l'annonce, avec un bail. Ajoutez un tarif « À la nuit » pour ouvrir la réservation en ligne.</p>
            <div v-for="p in sortedPricing" v-else :key="p.id" class="border-b border-sand-200 py-3 last:border-b-0">
              <div v-if="editingId !== p.id" class="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="m-0 text-sm font-bold" :class="p.is_available ? '' : 'text-[var(--text-faint)]'">{{ freqLabel(p.billing_frequency) }}</p>
                    <CoreBadge :tone="p.is_available ? 'ok' : 'neutral'">{{ p.is_available ? 'Actif' : 'Suspendu' }}</CoreBadge>
                  </div>
                  <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ minLabel(p) }}</p>
                </div>
                <span class="font-mono text-[15px] font-bold" :class="p.is_available ? '' : 'text-[var(--text-faint)] line-through'">{{ fmtF(p.price) }}</span>
                <div class="flex w-full flex-wrap gap-1 sm:w-auto">
                  <button type="button" class="rounded-pill px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-sand-100 disabled:opacity-50" :disabled="pricingBusy === p.id" @click="askToggle(p)">{{ p.is_available ? 'Suspendre' : 'Réactiver' }}</button>
                  <button type="button" class="rounded-pill px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-50" @click="startEdit(p); confirmSuspendId = null">Modifier</button>
                  <button type="button" class="rounded-pill px-3 py-2 text-xs font-bold text-danger-fg hover:bg-danger-bg disabled:opacity-50" :disabled="pricingBusy === p.id" @click="confirmRemoveId = p.id; confirmSuspendId = null; pricingFlash = ''">Retirer</button>
                </div>
              </div>
              <div v-else class="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5">
                <p class="m-0 mb-2.5 text-sm font-bold">{{ freqLabel(p.billing_frequency) }}</p>
                <div class="grid grid-cols-2 gap-3">
                  <FormsInput v-model="editPrice" label="Prix (FCFA)" type="number" mono />
                  <FormsInput v-model="editMin" :label="p.billing_frequency === 'daily' ? 'Nuits minimum' : 'Périodes minimum'" type="number" mono />
                </div>
                <div class="mt-3 flex gap-2">
                  <CoreButton size="sm" :disabled="pricingBusy === p.id" @click="saveEdit(p)">{{ pricingBusy === p.id ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
                  <CoreButton size="sm" tone="secondary" @click="editingId = null">Annuler</CoreButton>
                </div>
              </div>
              <CoreInlineConfirm
                v-if="confirmSuspendId === p.id"
                class="mt-2.5"
                tone="warning"
                :message="suspendMessage(p)"
                confirm-label="Suspendre"
                :loading="pricingBusy === p.id"
                @confirm="toggleAvailable(p)"
                @cancel="confirmSuspendId = null"
              />
              <CoreInlineConfirm
                v-if="confirmRemoveId === p.id"
                class="mt-2.5"
                tone="danger"
                :message="`Retirer le tarif « ${freqLabel(p.billing_frequency).toLowerCase()} » ?${p.billing_frequency === 'daily' ? ' La réservation en ligne sera fermée.' : ''}`"
                confirm-label="Retirer"
                :loading="pricingBusy === p.id"
                @confirm="removePricing(p)"
                @cancel="confirmRemoveId = null"
              />
            </div>
          </section>

          <!-- Durée de séjour -->
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Durée de séjour</h2>
            <p class="mb-3.5 mt-1 text-[13.5px] text-[var(--text-muted)]">Appliquée à chaque réservation en ligne. Laissez vide pour ne rien imposer.</p>
            <div class="grid grid-cols-2 items-start gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <FormsInput :model-value="minStay" label="Minimum (nuits)" type="number" mono placeholder="1" @update:model-value="onStayInput('min', $event)" />
              <FormsInput :model-value="maxStay" label="Maximum (nuits)" type="number" mono placeholder="Aucun" @update:model-value="onStayInput('max', $event)" />
              <CoreButton tone="secondary" class="col-span-2 sm:col-span-1 sm:mt-[26px]" :disabled="staySaving" @click="saveStayLimits">{{ staySaving ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
            </div>
            <p v-if="staySaved" class="mb-0 mt-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-ok-fg"><Check class="h-4 w-4" :stroke-width="2" />Durées enregistrées : elles s'appliquent aux prochaines réservations.</p>
            <p v-if="stayError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ stayError }}</p>
          </section>

          <!-- Liste d'attente -->
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Liste d'attente</h2>
            <p class="mb-3 mt-1 text-[13.5px] text-[var(--text-muted)]">Immo ne prévient pas encore automatiquement ces personnes quand le logement se libère : contactez-les.</p>
            <DataSkeletonCard v-if="waitlistState === 'loading'" :height="44" :lines="0" />
            <FeedbackAlertBanner v-else-if="waitlistState === 'error'" tone="danger">
              Impossible de charger la liste d'attente.
              <button type="button" class="ml-2 font-bold underline" @click="loadWaitlist">Réessayer</button>
            </FeedbackAlertBanner>
            <div v-else-if="!waitlist.length" class="flex items-center gap-3 rounded-md border border-dashed border-[var(--border-default)] px-4 py-3.5">
              <UserRound class="h-4.5 w-4.5 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
              <p class="m-0 text-[13.5px] text-[var(--text-muted)]">Personne en attente pour ce logement. Les locataires s'inscrivent depuis l'annonce quand il est occupé.</p>
            </div>
            <div v-for="w in waitlist" :key="w.id" class="border-b border-sand-200 py-3 last:border-b-0">
              <div class="flex flex-wrap items-center gap-3">
                <CoreAvatar :name="waitlistName(w)" :size="36" />
                <div class="min-w-0 flex-1">
                  <p class="m-0 text-sm font-bold">{{ waitlistName(w) }}</p>
                  <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Inscrit le <span class="font-mono">{{ fmtDay(w.created_at) }}</span></p>
                  <p v-if="w.message" class="mb-0 mt-1 text-[13px] italic text-[var(--text-secondary)] [overflow-wrap:anywhere]">« {{ w.message }} »</p>
                </div>
                <div class="flex gap-1">
                  <CoreButton size="sm" tone="secondary" class="inline-flex items-center gap-1.5" @click="contactWaitlistTenant(w)"><MessageSquare class="h-3.5 w-3.5" :stroke-width="1.9" />Écrire</CoreButton>
                  <button v-if="confirmWaitId !== w.id" type="button" class="inline-flex items-center gap-1 rounded-pill px-3 py-2 text-xs font-bold text-danger-fg hover:bg-danger-bg" @click="confirmWaitId = w.id"><X class="h-3.5 w-3.5" :stroke-width="1.9" />Retirer</button>
                </div>
              </div>
              <CoreInlineConfirm
                v-if="confirmWaitId === w.id"
                class="mt-2.5"
                tone="danger"
                :message="`Retirer ${waitlistName(w)} de la liste d'attente ? Rien ne lui est envoyé.`"
                confirm-label="Retirer"
                :loading="waitlistBusy"
                @confirm="removeWaitlistEntry(w)"
                @cancel="confirmWaitId = null"
              />
            </div>
            <p v-if="waitlistError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ waitlistError }}</p>
          </section>
        </div>

        <!-- Calendrier -->
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="mb-3.5 flex items-center justify-between gap-2">
            <button type="button" class="grid h-9 w-9 place-items-center rounded-pill border border-[var(--border-default)] bg-white text-sand-900 disabled:opacity-40" aria-label="Mois précédent" :disabled="monthOffset <= 0" @click="monthOffset--"><ChevronLeft class="h-4 w-4" :stroke-width="1.9" /></button>
            <h2 class="m-0 text-[15px] font-bold capitalize">{{ monthLabel }}</h2>
            <button type="button" class="grid h-9 w-9 place-items-center rounded-pill border border-[var(--border-default)] bg-white text-sand-900" aria-label="Mois suivant" @click="monthOffset++"><ChevronRight class="h-4 w-4" :stroke-width="1.9" /></button>
          </div>

          <DataSkeletonCard v-if="availabilityState === 'loading'" :height="220" :lines="0" />
          <FeedbackAlertBanner v-else-if="availabilityState === 'error'" tone="danger">
            Impossible de charger le calendrier.
            <button type="button" class="ml-2 font-bold underline" @click="loadAvailability">Réessayer</button>
          </FeedbackAlertBanner>
          <template v-else>
            <div class="mb-1 grid grid-cols-7 gap-1.5 text-center text-label font-bold text-[var(--text-faint)]">
              <span v-for="(d, i) in ['L', 'M', 'M', 'J', 'V', 'S', 'D']" :key="i">{{ d }}</span>
            </div>
            <div class="grid grid-cols-7 gap-1.5">
              <div v-for="(c, i) in calendarCells" :key="i" class="aspect-square rounded-sm">
                <div
                  v-if="c.d"
                  class="grid h-full w-full place-items-center rounded-sm font-mono text-xs font-bold"
                  :class="[c.block ? (BLOCK_COLOR[c.block.blocked_by] ?? 'bg-sand-300') : 'border border-sand-200 bg-white text-[var(--text-secondary)]', c.past ? 'opacity-40' : '']"
                  :title="c.block ? BLOCK_LABEL[c.block.blocked_by] ?? 'Indisponible' : 'Libre'"
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
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p class="m-0 text-sm font-bold">Indisponibilités à venir</p>
                <CoreButton v-if="!showBlockForm" size="sm" tone="secondary" class="inline-flex items-center gap-1.5" @click="showBlockForm = true; blockFlash = ''"><CalendarOff class="h-4 w-4" :stroke-width="1.9" />Bloquer des dates</CoreButton>
              </div>

              <div v-if="showBlockForm" class="mb-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormsInput v-model="blockFirst" label="Premier jour bloqué" type="date" />
                  <FormsInput v-model="blockLast" label="Dernier jour bloqué" type="date" />
                </div>
                <FormsInput v-model="blockNote" label="Motif (facultatif)" placeholder="Travaux, usage personnel…" hint="Visible par vous seul, sur cet appareil." class="mt-3" />
                <div class="mt-3 flex gap-2">
                  <CoreButton size="sm" :disabled="blockBusy" @click="submitBlock">{{ blockBusy ? 'Blocage…' : 'Bloquer' }}</CoreButton>
                  <CoreButton size="sm" tone="secondary" @click="showBlockForm = false">Annuler</CoreButton>
                </div>
              </div>
              <p v-if="blockFlash" class="mb-2.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ blockFlash }}</p>
              <p v-if="blockError" class="mb-2.5 mt-0 text-[13px] font-semibold text-danger-fg">{{ blockError }}</p>

              <p v-if="!upcomingBlocks.length" class="m-0 text-[13.5px] text-[var(--text-muted)]">Aucune indisponibilité prévue : le logement est libre à la réservation.</p>
              <div v-for="(b, i) in upcomingBlocks" :key="i" class="border-b border-sand-200 py-2.5 last:border-b-0">
                <div class="flex items-center gap-2.5">
                  <span class="h-2.5 w-2.5 flex-none rounded-pill" :class="BLOCK_COLOR[b.blocked_by]?.split(' ')[0] ?? 'bg-sand-300'" />
                  <div class="min-w-0 flex-1">
                    <p class="m-0 text-[13.5px] font-semibold">{{ BLOCK_LABEL[b.blocked_by] ?? 'Indisponible' }}<template v-if="knownFor(b)?.note"> · {{ knownFor(b)?.note }}</template></p>
                    <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ blockRange(b) }}</p>
                  </div>
                  <button v-if="b.blocked_by === 'manual' && knownFor(b) && !sameBlock(confirmUnblock, b)" type="button" class="rounded-pill px-3 py-2 text-xs font-bold text-danger-fg hover:bg-danger-bg" @click="askUnblock(b)">Débloquer</button>
                </div>
                <p v-if="b.blocked_by === 'manual' && !knownFor(b)" class="mb-0 mt-1 pl-5 text-xs text-[var(--text-faint)]">
                  Créé depuis un autre appareil : <NuxtLink :to="{ path: '/contact', query: { sujet: 'Autre' } }" class="font-bold text-green-700">contactez le support</NuxtLink> pour le retirer.
                </p>
                <CoreInlineConfirm
                  v-if="sameBlock(confirmUnblock, b)"
                  class="mt-2"
                  tone="warning"
                  :message="`Débloquer ces dates (${blockRange(b)}) ? Elles redeviennent réservables en ligne.`"
                  confirm-label="Débloquer"
                  :loading="unblocking"
                  @confirm="unblockConfirmed"
                  @cancel="confirmUnblock = null"
                />
              </div>
            </div>
          </template>
        </section>
      </div>
    </template>
  </div>
</template>
