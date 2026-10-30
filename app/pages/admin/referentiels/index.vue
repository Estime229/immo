<script setup lang="ts">
/**
 * Référentiels, par famille (`?famille=`) : listes de choix des biens, villes et quartiers,
 * devises. Ajout et modification dans une modale ; suppression confirmée en ligne avec sa
 * conséquence. Un élément système est verrouillé : ses libellés se corrigent, il ne se
 * supprime pas. Après chaque écriture, la liste est relue et le message dit ce que l'API a
 * réellement enregistré.
 */
import { Lock, Search } from '@lucide/vue'
import type { City, Country, Neighborhood } from '~/composables/useLocation'
import { BASE_CURRENCY, currencyName, type Currency } from '~/composables/useCurrencies'
import { isValidReferenceCode, referenceCodeFrom, type ReferenceItem } from '~/composables/useReferences'
import type { Permission } from '~/composables/useAdminLevels'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: ['manage:location', 'manage:currency', 'manage:references'] })

const route = useRoute()
const router = useRouter()
const { hasPermission } = useAdminAuth()
const { fetchCountries, fetchCities, fetchNeighborhoods, createCity, createNeighborhood, deleteNeighborhood } = useLocation()
const { fetchCurrencies, createCurrency, updateRate, deleteCurrency } = useCurrencies()
const { fetchReferencesByType, createReference, updateReference, deleteReference } = useReferences()

function setQuery(patch: Record<string, string | undefined>) {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) if (typeof v === 'string' && v) query[k] = v
  return router.replace({ query })
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback
}
function formatDay(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

/* ---------- Familles ---------- */
type Famille = 'biens' | 'lieux' | 'devises'
const FAMILIES: Array<{ value: Famille; label: string; permission: Permission }> = [
  { value: 'biens', label: 'Types de biens & équipements', permission: 'manage:references' },
  { value: 'lieux', label: 'Villes & quartiers', permission: 'manage:location' },
  { value: 'devises', label: 'Devises', permission: 'manage:currency' }
]
const families = computed(() => FAMILIES.filter(f => hasPermission(f.permission)))
const famille = computed<Famille>(() => families.value.find(f => f.value === route.query.famille)?.value ?? families.value[0]?.value ?? 'biens')

/** Résultat de la dernière action, et l'erreur d'une action précise (clé `ref:<id>`, `quartier:<id>`…). */
const flash = ref('')
const actionError = ref<{ key: string; message: string } | null>(null)
/** Une seule confirmation ouverte à la fois sur l'écran. */
const confirming = ref<string | null>(null)
const busyKey = ref<string | null>(null)

function resetFeedback() {
  flash.value = ''
  actionError.value = null
  confirming.value = null
}
function askConfirm(key: string) {
  resetFeedback()
  confirming.value = key
}

function selectFamily(v: string) {
  resetFeedback()
  setQuery({ famille: v, liste: undefined, ville: undefined })
}

/* ---------- Types de biens & équipements ---------- */
interface RefList { type: string; label: string; singular: string; hint: string; creatable: boolean }
const REF_LISTS: RefList[] = [
  { type: 'PROPERTY_TYPE', label: 'Types de biens', singular: 'un type de bien', hint: "Proposés à la création d'un bien et affichés sur sa fiche.", creatable: true },
  { type: 'UNIT_TYPE', label: 'Types de logements', singular: 'un type de logement', hint: 'Proposés pour chaque logement, dans la recherche et dans les demandes de logement.', creatable: true },
  { type: 'FEATURE', label: 'Équipements', singular: 'un équipement', hint: "Cochés sur la fiche d'un logement (climatisation, parking…).", creatable: true },
  { type: 'FURNISHED_LEVEL', label: 'Ameublement', singular: "un niveau d'ameublement", hint: "Niveau d'ameublement d'un logement, aussi demandé par les locataires.", creatable: true },
  { type: 'WATER_SOURCE', label: "Sources d'eau", singular: "une source d'eau", hint: "Source d'eau d'un logement, filtrable dans la recherche.", creatable: true },
  { type: 'METER_TYPE', label: 'Compteurs', singular: 'un type de compteur', hint: "Type de compteur d'un logement, filtrable dans la recherche.", creatable: true },
  { type: 'TOILET_TYPE', label: 'Toilettes', singular: 'un type de toilettes', hint: "Type de toilettes d'un logement.", creatable: true },
  { type: 'ARTISAN_TRADE', label: "Métiers d'artisan", singular: "un métier d'artisan", hint: "Spécialités des artisans, proposées dans les demandes d'intervention.", creatable: true },
  { type: 'PROPERTY_STATUS', label: "Statuts d'un bien", singular: 'un statut', hint: "L'application dépend de ces statuts : la liste ne s'étend pas depuis l'admin.", creatable: false }
]
const STATUS_DOT: Record<string, string> = { green: 'bg-green-600', amber: 'bg-warn-fg', orange: 'bg-clay-500', gray: 'bg-sand-500', red: 'bg-danger-fg', blue: 'bg-info-fg' }

const refs = ref<Record<string, ReferenceItem[]>>({})
const listState = ref<Record<string, 'loading' | 'ready' | 'error'>>({})
const refsLoaded = ref(false)
/** Libellés des catégories d'équipements (référentiel FEATURE_CATEGORY : COMFORT → Confort…). */
const featureCategories = ref<Record<string, string>>({})

function refLabel(r: ReferenceItem) {
  return r.labels?.fr || r.labels?.en || r.code
}
function sortRefs(items: ReferenceItem[]) {
  return [...items].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || refLabel(a).localeCompare(refLabel(b), 'fr'))
}

async function loadList(type: string) {
  listState.value = { ...listState.value, [type]: 'loading' }
  try {
    refs.value = { ...refs.value, [type]: sortRefs(await fetchReferencesByType(type)) }
    listState.value = { ...listState.value, [type]: 'ready' }
  } catch {
    listState.value = { ...listState.value, [type]: 'error' }
  }
}
async function loadRefs() {
  refsLoaded.value = true
  fetchReferencesByType('FEATURE_CATEGORY', false)
    .then(list => { featureCategories.value = Object.fromEntries(list.map(c => [c.code, refLabel(c)])) })
    .catch(() => { /* la catégorie n'est qu'une étiquette : sans elle, la liste reste utilisable */ })
  await Promise.all(REF_LISTS.map(l => loadList(l.type)))
}

const currentList = computed(() => REF_LISTS.find(l => l.type === route.query.liste) ?? REF_LISTS[0]!)
const currentState = computed(() => listState.value[currentList.value.type] ?? 'loading')
const currentItems = computed(() => refs.value[currentList.value.type] ?? [])
const activeItems = computed(() => currentItems.value.filter(r => r.is_active !== false))
const inactiveItems = computed(() => currentItems.value.filter(r => r.is_active === false))
const hasSystemItems = computed(() => activeItems.value.some(r => r.is_system))

function selectList(type: string) {
  resetFeedback()
  setQuery({ liste: type === REF_LISTS[0]!.type ? undefined : type })
}
function featureCategory(r: ReferenceItem) {
  const code = r.metadata?.category_code
  return typeof code === 'string' ? (featureCategories.value[code] ?? '') : ''
}
function statusDot(r: ReferenceItem) {
  const color = r.color ?? (typeof r.metadata?.color === 'string' ? r.metadata.color : '')
  return STATUS_DOT[color] ?? ''
}

const refForm = reactive({ open: false, editing: null as ReferenceItem | null, fr: '', en: '', code: '', codeTouched: false, error: '', busy: false })
const refFormTitle = computed(() => (refForm.editing ? `Modifier « ${refLabel(refForm.editing)} »` : `Ajouter ${currentList.value.singular}`))
watch(() => refForm.fr, fr => {
  if (!refForm.editing && !refForm.codeTouched) refForm.code = referenceCodeFrom(fr)
})

function openRefCreate() {
  resetFeedback()
  Object.assign(refForm, { open: true, editing: null, fr: '', en: '', code: '', codeTouched: false, error: '', busy: false })
}
function openRefEdit(r: ReferenceItem) {
  resetFeedback()
  Object.assign(refForm, { open: true, editing: r, fr: r.labels?.fr ?? '', en: r.labels?.en ?? '', code: r.code, codeTouched: true, error: '', busy: false })
}

async function submitRef() {
  const list = currentList.value
  const fr = refForm.fr.trim()
  const en = refForm.en.trim() || fr
  const code = refForm.code.trim()
  const editingId = refForm.editing?.id
  if (!fr) {
    refForm.error = 'Saisissez le libellé en français.'
    return
  }
  if (!editingId) {
    if (!isValidReferenceCode(code)) {
      refForm.error = 'Le code ne peut contenir que des minuscules, des chiffres et des _ (ex. eau_chaude).'
      return
    }
    if (currentItems.value.some(r => r.code === code)) {
      refForm.error = 'Ce code existe déjà dans cette liste.'
      return
    }
  }
  if (currentItems.value.some(r => r.id !== editingId && refLabel(r).trim().toLowerCase() === fr.toLowerCase())) {
    refForm.error = 'Ce libellé existe déjà dans cette liste.'
    return
  }
  refForm.busy = true
  refForm.error = ''
  try {
    if (editingId) await updateReference(editingId, { labels: { fr, en } })
    else await createReference({ type: list.type, code, labels: { fr, en } })
    refForm.open = false
    await loadList(list.type)
    flash.value = editingId ? `« ${fr} » mis à jour.` : `« ${fr} » ajouté à la liste « ${list.label} ».`
  } catch (e) {
    refForm.error = errorMessage(e, editingId ? "La modification n'a pas pu être enregistrée." : "L'ajout a échoué.")
  } finally {
    refForm.busy = false
  }
}

/** Désactiver / réactiver : la liste est relue pour vérifier ce que l'API a réellement fait. */
async function setRefActive(r: ReferenceItem, active: boolean) {
  const key = `ref:${r.id}`
  const type = currentList.value.type
  busyKey.value = key
  actionError.value = null
  try {
    if (active) await updateReference(r.id, { is_active: true })
    else await deleteReference(r.id)
    confirming.value = null
    await loadList(type)
    const after = (refs.value[type] ?? []).find(x => x.id === r.id)
    const nowActive = !!after && after.is_active !== false
    if (nowActive !== active) {
      actionError.value = { key, message: `L'API a répondu sans ${active ? 'réactiver' : 'désactiver'} « ${refLabel(r)} ».` }
      return
    }
    flash.value = active
      ? `« ${refLabel(r)} » est de nouveau proposé dans les formulaires.`
      : `« ${refLabel(r)} » est désactivé : il n'est plus proposé dans les formulaires.`
  } catch (e) {
    actionError.value = { key, message: errorMessage(e, active ? 'La réactivation a échoué.' : 'La désactivation a échoué.') }
  } finally {
    busyKey.value = null
  }
}

/* ---------- Villes & quartiers ---------- */
const countries = ref<Country[]>([])
const cities = ref<City[]>([])
const neighborhoods = ref<Neighborhood[]>([])
const lieuxState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

async function loadLieux() {
  if (lieuxState.value !== 'ready') lieuxState.value = 'loading'
  try {
    const [c, v, n] = await Promise.all([fetchCountries(), fetchCities(), fetchNeighborhoods()])
    countries.value = c
    cities.value = v
    neighborhoods.value = n
    lieuxState.value = 'ready'
  } catch {
    lieuxState.value = 'error'
  }
}

const sortedCities = computed(() => [...cities.value].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
const selectedCity = computed(() => sortedCities.value.find(c => c.id === route.query.ville) ?? sortedCities.value[0] ?? null)
const countByCity = computed(() => {
  const counts: Record<string, number> = {}
  for (const n of neighborhoods.value) counts[n.city_id] = (counts[n.city_id] ?? 0) + 1
  return counts
})
function countryName(id: string) {
  return countries.value.find(c => c.id === id)?.name ?? ''
}

const quartierSearch = ref('')
const cityNeighborhoods = computed(() => neighborhoods.value
  .filter(n => n.city_id === selectedCity.value?.id)
  .sort((a, b) => a.name.localeCompare(b.name, 'fr')))
const filteredNeighborhoods = computed(() => cityNeighborhoods.value.filter(n => matchesQuery([n.name], quartierSearch.value)))

function selectCity(id: string) {
  resetFeedback()
  quartierSearch.value = ''
  setQuery({ ville: id })
}

const placeForm = reactive({ open: false, kind: 'quartier' as 'ville' | 'quartier', name: '', parentId: '', error: '', busy: false })

function openPlaceForm(kind: 'ville' | 'quartier') {
  resetFeedback()
  const parentId = kind === 'ville' ? (countries.value[0]?.id ?? '') : (selectedCity.value?.id ?? '')
  Object.assign(placeForm, { open: true, kind, name: '', parentId, error: '', busy: false })
}

async function submitPlace() {
  const name = placeForm.name.trim().replace(/\s+/g, ' ')
  if (!name) {
    placeForm.error = placeForm.kind === 'ville' ? 'Saisissez le nom de la ville.' : 'Saisissez le nom du quartier.'
    return
  }
  if (!placeForm.parentId) {
    placeForm.error = placeForm.kind === 'ville' ? 'Choisissez un pays.' : 'Choisissez une ville.'
    return
  }
  const same = (s: string) => s.trim().toLowerCase() === name.toLowerCase()
  const duplicate = placeForm.kind === 'ville'
    ? cities.value.some(c => c.country_id === placeForm.parentId && same(c.name))
    : neighborhoods.value.some(n => n.city_id === placeForm.parentId && same(n.name))
  if (duplicate) {
    placeForm.error = placeForm.kind === 'ville' ? 'Cette ville existe déjà dans ce pays.' : 'Ce quartier existe déjà dans cette ville.'
    return
  }
  placeForm.busy = true
  placeForm.error = ''
  try {
    if (placeForm.kind === 'ville') {
      const created = await createCity(name, placeForm.parentId)
      await loadLieux()
      placeForm.open = false
      if (created?.id) await setQuery({ ville: created.id })
      flash.value = `Ville « ${name} » ajoutée : ajoutez-lui maintenant ses quartiers.`
    } else {
      const cityId = placeForm.parentId
      await createNeighborhood(name, cityId)
      await loadLieux()
      placeForm.open = false
      if (cityId !== selectedCity.value?.id) await setQuery({ ville: cityId })
      flash.value = `Quartier « ${name} » ajouté à ${cities.value.find(c => c.id === cityId)?.name ?? 'la ville'}.`
    }
  } catch (e) {
    placeForm.error = errorMessage(e, "L'ajout a échoué.")
  } finally {
    placeForm.busy = false
  }
}

async function removeNeighborhood(n: Neighborhood) {
  const key = `quartier:${n.id}`
  busyKey.value = key
  actionError.value = null
  try {
    await deleteNeighborhood(n.id)
    confirming.value = null
    await loadLieux()
    flash.value = `Quartier « ${n.name} » supprimé.`
  } catch (e) {
    actionError.value = { key, message: errorMessage(e, 'La suppression a échoué.') }
  } finally {
    busyKey.value = null
  }
}

/* ---------- Devises ---------- */
const currencies = ref<Currency[]>([])
const devisesState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

async function loadDevises() {
  if (devisesState.value !== 'ready') devisesState.value = 'loading'
  try {
    currencies.value = await fetchCurrencies()
    devisesState.value = 'ready'
  } catch {
    devisesState.value = 'error'
  }
}

function isBase(c: Currency) {
  return c.currency_code.toUpperCase() === BASE_CURRENCY
}
const sortedCurrencies = computed(() => [...currencies.value].sort((a, b) => Number(isBase(b)) - Number(isBase(a)) || a.currency_code.localeCompare(b.currency_code)))
function formatRate(v: string | number) {
  return Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 6 })
}
function parseRate(raw: string) {
  const n = Number(raw.trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

const rateForm = reactive({ open: false, currency: null as Currency | null, value: '', error: '', busy: false })
function openRate(c: Currency) {
  resetFeedback()
  Object.assign(rateForm, { open: true, currency: c, value: String(Number(c.rate_to_cfa)), error: '', busy: false })
}
async function submitRate() {
  const c = rateForm.currency
  if (!c) return
  const rate = parseRate(rateForm.value)
  if (rate === null) {
    rateForm.error = 'Saisissez un taux supérieur à 0 (ex. 655,957).'
    return
  }
  rateForm.busy = true
  rateForm.error = ''
  try {
    await updateRate(c.id, rate)
    await loadDevises()
    const after = currencies.value.find(x => x.id === c.id)
    if (after && Math.abs(Number(after.rate_to_cfa) - rate) > 1e-6) {
      rateForm.error = "L'API a répondu sans enregistrer ce taux : le taux affiché n'a pas changé."
      return
    }
    rateForm.open = false
    flash.value = `Taux mis à jour : 1 ${c.currency_code} = ${formatRate(rate)} FCFA.`
  } catch (e) {
    rateForm.error = errorMessage(e, "Le taux n'a pas pu être enregistré.")
  } finally {
    rateForm.busy = false
  }
}

const currencyForm = reactive({ open: false, code: '', name: '', nameTouched: false, symbol: '', rate: '', error: '', busy: false })
watch(() => currencyForm.code, code => {
  if (!currencyForm.nameTouched) currencyForm.name = /^[A-Za-z]{3}$/.test(code) ? currencyName(code) : ''
})
function openCurrencyCreate() {
  resetFeedback()
  Object.assign(currencyForm, { open: true, code: '', name: '', nameTouched: false, symbol: '', rate: '', error: '', busy: false })
}
async function submitCurrency() {
  const code = currencyForm.code.trim().toUpperCase()
  const name = currencyForm.name.trim()
  const rate = parseRate(currencyForm.rate)
  if (!/^[A-Z]{3}$/.test(code)) {
    currencyForm.error = 'Le code ISO compte 3 lettres (ex. USD, EUR, GHS).'
    return
  }
  if (currencies.value.some(c => c.currency_code.toUpperCase() === code)) {
    currencyForm.error = `La devise ${code} existe déjà.`
    return
  }
  if (!name) {
    currencyForm.error = 'Saisissez le nom de la devise.'
    return
  }
  if (rate === null) {
    currencyForm.error = 'Saisissez un taux supérieur à 0.'
    return
  }
  currencyForm.busy = true
  currencyForm.error = ''
  try {
    await createCurrency({ code, name, symbol: currencyForm.symbol.trim(), rate_to_xof: rate })
    currencyForm.open = false
    await loadDevises()
    flash.value = `Devise ${code} ajoutée : 1 ${code} = ${formatRate(rate)} FCFA.`
  } catch (e) {
    currencyForm.error = errorMessage(e, "L'ajout a échoué.")
  } finally {
    currencyForm.busy = false
  }
}

async function removeCurrency(c: Currency) {
  const key = `devise:${c.id}`
  busyKey.value = key
  actionError.value = null
  try {
    await deleteCurrency(c.id)
    confirming.value = null
    await loadDevises()
    flash.value = `Devise ${c.currency_code} supprimée.`
  } catch (e) {
    actionError.value = { key, message: errorMessage(e, 'La suppression a échoué.') }
  } finally {
    busyKey.value = null
  }
}

/* Chaque famille se charge à sa première ouverture (côté navigateur, comme les autres pages admin). */
function loadFamily(f: Famille) {
  if (f === 'biens' && !refsLoaded.value) loadRefs()
  if (f === 'lieux' && lieuxState.value === 'idle') loadLieux()
  if (f === 'devises' && devisesState.value === 'idle') loadDevises()
}
onMounted(() => loadFamily(famille.value))
watch(famille, loadFamily)
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="families.length > 1" class="mb-4.5 max-w-full overflow-x-auto [&_button]:whitespace-nowrap">
      <FormsSegmentedControl :options="families" :model-value="famille" size="sm" @update:model-value="selectFamily" />
    </div>

    <p v-if="flash" class="mb-4.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>

    <!-- Types de biens & équipements -->
    <template v-if="famille === 'biens'">
      <div class="mb-4 flex flex-wrap gap-2">
        <AdminTag v-for="l in REF_LISTS" :key="l.type" :selected="l.type === currentList.type" @click="selectList(l.type)">
          {{ l.label }}
          <span v-if="listState[l.type] === 'ready'" class="font-mono text-[11.5px] opacity-70">{{ (refs[l.type] ?? []).filter(r => r.is_active !== false).length }}</span>
        </AdminTag>
      </div>

      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="m-0 text-[15px] font-bold">{{ currentList.label }}</h2>
            <p class="mb-0 mt-1 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">{{ currentList.hint }}</p>
          </div>
          <AdminButton v-if="currentList.creatable && currentState === 'ready'" size="sm" @click="openRefCreate">+ Ajouter {{ currentList.singular }}</AdminButton>
        </div>

        <div v-if="currentState === 'loading'" class="mt-4 flex flex-col gap-2.5">
          <DataSkeletonCard v-for="i in 4" :key="i" :height="44" :lines="0" />
        </div>
        <FeedbackAlertBanner v-else-if="currentState === 'error'" tone="danger" class="mt-4">
          Impossible de charger cette liste.
          <button type="button" class="ml-2 font-bold underline" @click="loadList(currentList.type)">Réessayer</button>
        </FeedbackAlertBanner>

        <template v-else>
          <p v-if="hasSystemItems" class="mb-1 mt-4 flex items-start gap-2 rounded-md bg-sand-100 px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-[var(--text-secondary)]">
            <Lock class="mt-0.5 h-3.5 w-3.5 flex-none" :stroke-width="2.2" />
            Les éléments « Système » sont utilisés par l'application : leurs libellés se corrigent, mais ils ne se désactivent pas.
          </p>

          <p v-if="!activeItems.length" class="mb-0 mt-4 rounded-md border border-dashed border-[var(--border-default)] px-4 py-8 text-center text-[13.5px] text-[var(--text-muted)]">
            Aucun élément actif dans cette liste{{ currentList.creatable ? ' : ajoutez le premier.' : '.' }}
          </p>

          <div v-for="r in activeItems" :key="r.id" class="border-b border-sand-200 py-3 last:border-b-0">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span v-if="statusDot(r)" class="h-2.5 w-2.5 flex-none rounded-pill" :class="statusDot(r)" />
              <div class="min-w-0 flex-1 basis-[180px]">
                <p class="m-0 text-sm font-bold">{{ refLabel(r) }}</p>
                <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">
                  <template v-if="r.labels?.en && r.labels.en !== r.labels.fr">EN : {{ r.labels.en }} · </template><span class="font-mono">{{ r.code }}</span>
                </p>
              </div>
              <AdminBadge v-if="featureCategory(r)" tone="neutral">{{ featureCategory(r) }}</AdminBadge>
              <span v-if="r.is_system" class="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-faint)]" title="Utilisé par l'application : ne se désactive pas">
                <Lock class="h-3 w-3" :stroke-width="2.2" />Système
              </span>
              <div v-if="confirming !== `ref:${r.id}`" class="flex flex-none items-center gap-3.5">
                <button type="button" class="text-xs font-bold text-green-700" @click="openRefEdit(r)">Modifier</button>
                <button v-if="!r.is_system" type="button" class="text-xs font-bold text-danger-fg" @click="askConfirm(`ref:${r.id}`)">Désactiver</button>
              </div>
            </div>
            <AdminInlineConfirm
              v-if="confirming === `ref:${r.id}`"
              class="mt-2.5"
              tone="danger"
              :message="`Désactiver « ${refLabel(r)} » ? Il ne sera plus proposé dans les formulaires ; les fiches qui l'utilisent déjà le gardent.`"
              confirm-label="Désactiver"
              :loading="busyKey === `ref:${r.id}`"
              @confirm="setRefActive(r, false)"
              @cancel="confirming = null"
            />
            <p v-if="actionError?.key === `ref:${r.id}`" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
          </div>

          <template v-if="inactiveItems.length">
            <p class="mb-1 mt-5 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Désactivés · {{ inactiveItems.length }}</p>
            <div v-for="r in inactiveItems" :key="r.id" class="border-b border-sand-200 py-3 last:border-b-0">
              <div class="flex flex-wrap items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p class="m-0 text-sm font-bold text-[var(--text-faint)]">{{ refLabel(r) }}</p>
                  <p class="mb-0 mt-0.5 font-mono text-xs text-[var(--text-faint)]">{{ r.code }}</p>
                </div>
                <AdminBadge tone="neutral">Désactivé</AdminBadge>
                <AdminButton size="sm" variant="secondary" :loading="busyKey === `ref:${r.id}`" @click="resetFeedback(); setRefActive(r, true)">Réactiver</AdminButton>
              </div>
              <p v-if="actionError?.key === `ref:${r.id}`" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
            </div>
          </template>
        </template>
      </section>
    </template>

    <!-- Villes & quartiers -->
    <template v-else-if="famille === 'lieux'">
      <div v-if="lieuxState === 'loading' || lieuxState === 'idle'" class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <DataSkeletonCard :height="220" :lines="0" />
        <DataSkeletonCard :height="320" :lines="0" />
      </div>
      <FeedbackAlertBanner v-else-if="lieuxState === 'error'" tone="danger">
        Impossible de charger les villes et quartiers.
        <button type="button" class="ml-2 font-bold underline" @click="loadLieux">Réessayer</button>
      </FeedbackAlertBanner>

      <div v-else class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="mb-2 flex items-baseline justify-between gap-3">
            <h2 class="m-0 text-[15px] font-bold">Villes</h2>
            <button v-if="countries.length" type="button" class="text-[12.5px] font-bold text-green-700" @click="openPlaceForm('ville')">+ Ville</button>
          </div>
          <p v-if="!cities.length" class="m-0 py-6 text-center text-[13px] text-[var(--text-muted)]">Aucune ville pour l'instant.</p>
          <button
            v-for="c in sortedCities"
            :key="c.id"
            type="button"
            class="-mx-2.5 flex w-[calc(100%+20px)] items-center gap-3 rounded-md px-2.5 py-3 text-left transition-colors"
            :class="c.id === selectedCity?.id ? 'bg-green-50' : 'hover:bg-sand-50'"
            :aria-pressed="c.id === selectedCity?.id"
            @click="selectCity(c.id)"
          >
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold" :class="c.id === selectedCity?.id ? 'text-green-900' : ''">{{ c.name }}</p>
              <p v-if="countryName(c.country_id)" class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ countryName(c.country_id) }}</p>
            </div>
            <span class="flex-none text-xs text-[var(--text-faint)]"><span class="font-mono font-bold text-[var(--text-secondary)]">{{ countByCity[c.id] ?? 0 }}</span> quartier{{ (countByCity[c.id] ?? 0) > 1 ? 's' : '' }}</span>
          </button>
          <p class="mb-0 mt-3 border-t border-sand-200 pt-3 text-[12px] leading-[1.5] text-[var(--text-faint)]">Une ville ne se renomme ni ne se supprime ici : l'API ne le permet pas.</p>
        </section>

        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <template v-if="selectedCity">
            <div class="flex flex-wrap items-start gap-3">
              <div class="min-w-0 flex-1">
                <h2 class="m-0 text-[15px] font-bold">Quartiers de {{ selectedCity.name }}</h2>
                <p class="mb-0 mt-1 text-[12.5px] text-[var(--text-muted)]">Proposés aux propriétaires pour situer un bien, et dans la recherche par quartier.</p>
              </div>
              <AdminButton size="sm" @click="openPlaceForm('quartier')">+ Ajouter un quartier</AdminButton>
            </div>

            <div v-if="cityNeighborhoods.length > 8 || quartierSearch" class="mt-4 flex h-[42px] max-w-[340px] items-center gap-2 rounded-pill border border-[var(--border-default)] bg-white px-4 focus-within:border-green-600">
              <Search class="h-4 w-4 flex-none text-[var(--text-faint)]" />
              <input v-model="quartierSearch" type="search" aria-label="Rechercher un quartier" placeholder="Rechercher un quartier…" class="w-full min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--text-faint)]">
            </div>

            <p v-if="!cityNeighborhoods.length" class="mb-0 mt-4 rounded-md border border-dashed border-[var(--border-default)] px-4 py-8 text-center text-[13.5px] text-[var(--text-muted)]">
              Aucun quartier à {{ selectedCity.name }} : ajoutez le premier pour que les propriétaires puissent situer leurs biens.
            </p>
            <p v-else-if="!filteredNeighborhoods.length" class="mb-0 mt-4 rounded-md border border-dashed border-[var(--border-default)] px-4 py-8 text-center text-[13.5px] text-[var(--text-muted)]">
              Aucun quartier ne correspond à « {{ quartierSearch }} ».
            </p>

            <div class="mt-2">
              <div v-for="n in filteredNeighborhoods" :key="n.id" class="border-b border-sand-200 py-3 last:border-b-0">
                <div class="flex flex-wrap items-center gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="m-0 text-sm font-bold">{{ n.name }}</p>
                    <p v-if="n.created_at" class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">ajouté le <span class="font-mono">{{ formatDay(n.created_at) }}</span></p>
                  </div>
                  <button v-if="confirming !== `quartier:${n.id}`" type="button" class="text-xs font-bold text-danger-fg" @click="askConfirm(`quartier:${n.id}`)">Supprimer</button>
                </div>
                <AdminInlineConfirm
                  v-if="confirming === `quartier:${n.id}`"
                  class="mt-2.5"
                  tone="danger"
                  :message="`Supprimer le quartier « ${n.name} » ? Il ne sera plus proposé dans les formulaires ni dans la recherche.`"
                  confirm-label="Supprimer"
                  :loading="busyKey === `quartier:${n.id}`"
                  @confirm="removeNeighborhood(n)"
                  @cancel="confirming = null"
                />
                <p v-if="actionError?.key === `quartier:${n.id}`" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
              </div>
            </div>
          </template>
          <p v-else class="m-0 py-10 text-center text-[13.5px] text-[var(--text-muted)]">Ajoutez d'abord une ville pour pouvoir lui rattacher des quartiers.</p>
        </section>
      </div>
    </template>

    <!-- Devises -->
    <template v-else>
      <div v-if="devisesState === 'loading' || devisesState === 'idle'" class="flex flex-col gap-2.5">
        <DataSkeletonCard v-for="i in 3" :key="i" :height="64" :lines="0" />
      </div>
      <FeedbackAlertBanner v-else-if="devisesState === 'error'" tone="danger">
        Impossible de charger les devises.
        <button type="button" class="ml-2 font-bold underline" @click="loadDevises">Réessayer</button>
      </FeedbackAlertBanner>

      <section v-else class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="m-0 text-[15px] font-bold">Devises et taux de change</h2>
            <p class="mb-0 mt-1 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">Chaque taux convertit la devise en franc CFA (XOF), la devise de référence d'Immo.</p>
          </div>
          <AdminButton size="sm" @click="openCurrencyCreate">+ Ajouter une devise</AdminButton>
        </div>

        <p v-if="!currencies.length" class="mb-0 mt-4 rounded-md border border-dashed border-[var(--border-default)] px-4 py-8 text-center text-[13.5px] text-[var(--text-muted)]">
          Aucune devise enregistrée : ajoutez-en une pour afficher des montants convertis.
        </p>

        <div class="mt-2">
          <div v-for="c in sortedCurrencies" :key="c.id" class="border-b border-sand-200 py-3.5 last:border-b-0">
            <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
              <span class="grid h-10 w-12 flex-none place-items-center rounded-md bg-sand-100 font-mono text-[13px] font-bold text-sand-900">{{ c.currency_code }}</span>
              <div class="min-w-0 flex-1 basis-[200px]">
                <p class="m-0 flex flex-wrap items-center gap-2 text-sm font-bold">
                  {{ currencyName(c.currency_code) || c.currency_code }}
                  <AdminBadge v-if="isBase(c)" tone="primary">Devise de référence</AdminBadge>
                  <AdminBadge v-if="!c.is_active" tone="neutral">Inactive</AdminBadge>
                </p>
                <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">
                  <span class="font-mono text-[var(--text-secondary)]">1 {{ c.currency_code }} = {{ formatRate(c.rate_to_cfa) }} FCFA</span><template v-if="c.updated_at"> · mis à jour le <span class="font-mono">{{ formatDay(c.updated_at) }}</span></template>
                </p>
              </div>
              <span v-if="isBase(c) || c.is_system" class="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-faint)]" :title="isBase(c) ? 'Taux fixe à 1 : les autres taux sont exprimés dans cette devise' : 'Devise système'">
                <Lock class="h-3 w-3" :stroke-width="2.2" />{{ isBase(c) ? 'Taux fixe' : 'Système' }}
              </span>
              <div v-else-if="confirming !== `devise:${c.id}`" class="flex flex-none items-center gap-3.5">
                <button type="button" class="text-xs font-bold text-green-700" @click="openRate(c)">Modifier le taux</button>
                <button type="button" class="text-xs font-bold text-danger-fg" @click="askConfirm(`devise:${c.id}`)">Supprimer</button>
              </div>
            </div>
            <AdminInlineConfirm
              v-if="confirming === `devise:${c.id}`"
              class="mt-2.5"
              tone="danger"
              :message="`Supprimer la devise ${c.currency_code} ? Son taux de change sera effacé et elle ne sera plus proposée.`"
              confirm-label="Supprimer"
              :loading="busyKey === `devise:${c.id}`"
              @confirm="removeCurrency(c)"
              @cancel="confirming = null"
            />
            <p v-if="actionError?.key === `devise:${c.id}`" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
          </div>
        </div>
      </section>
    </template>

    <!-- Formulaire d'une liste de choix -->
    <AdminModal :open="refForm.open" :title="refFormTitle" @close="refForm.open = false">
      <form id="ref-form" class="flex flex-col gap-3.5" @submit.prevent="submitRef">
        <AdminInput v-model="refForm.fr" label="Libellé en français" placeholder="Ex. Eau chaude" />
        <AdminInput v-model="refForm.en" label="Libellé en anglais (facultatif)" placeholder="Repris du français s'il est vide" />
        <div v-if="!refForm.editing">
          <AdminInput :model-value="refForm.code" label="Code technique" placeholder="eau_chaude" @update:model-value="v => { refForm.code = v; refForm.codeTouched = true }" />
          <p class="mb-0 mt-[7px] text-[12px] leading-[1.45] text-[var(--text-faint)]">Enregistré sur les fiches : minuscules, chiffres et _. Il ne pourra plus être modifié.</p>
        </div>
        <p v-else class="m-0 text-[12.5px] text-[var(--text-muted)]">
          Code <span class="font-mono font-bold">{{ refForm.editing.code }}</span> : enregistré sur les fiches, il ne se modifie pas.
          <template v-if="refForm.editing.is_system"> Élément système : seuls ses libellés se corrigent.</template>
        </p>
        <p v-if="refForm.error" class="m-0 text-[13px] font-semibold text-danger-fg">{{ refForm.error }}</p>
      </form>
      <template #footer>
        <div class="flex flex-wrap gap-2">
          <AdminButton type="submit" form="ref-form" :loading="refForm.busy">{{ refForm.editing ? 'Enregistrer' : 'Ajouter' }}</AdminButton>
          <AdminButton variant="secondary" :disabled="refForm.busy" @click="refForm.open = false">Annuler</AdminButton>
        </div>
      </template>
    </AdminModal>

    <!-- Formulaire ville / quartier -->
    <AdminModal :open="placeForm.open" :title="placeForm.kind === 'ville' ? 'Ajouter une ville' : 'Ajouter un quartier'" @close="placeForm.open = false">
      <form id="place-form" class="flex flex-col gap-3.5" @submit.prevent="submitPlace">
        <AdminInput v-model="placeForm.name" :label="placeForm.kind === 'ville' ? 'Nom de la ville' : 'Nom du quartier'" :placeholder="placeForm.kind === 'ville' ? 'Ex. Porto-Novo' : 'Ex. Fidjrossè'" />
        <label v-if="placeForm.kind === 'quartier' || countries.length > 1" class="block">
          <span class="mb-[7px] block text-[12.5px] font-bold">{{ placeForm.kind === 'ville' ? 'Pays' : 'Ville' }}</span>
          <select v-model="placeForm.parentId" class="h-[46px] w-full cursor-pointer rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-[14px] outline-none focus:border-green-600">
            <template v-if="placeForm.kind === 'ville'">
              <option v-for="c in countries" :key="c.id" :value="c.id">{{ c.name }}</option>
            </template>
            <template v-else>
              <option v-for="c in sortedCities" :key="c.id" :value="c.id">{{ c.name }}</option>
            </template>
          </select>
        </label>
        <p v-else-if="countries[0]" class="m-0 text-[12.5px] text-[var(--text-muted)]">Pays : <strong>{{ countries[0].name }}</strong></p>
        <p v-if="placeForm.error" class="m-0 text-[13px] font-semibold text-danger-fg">{{ placeForm.error }}</p>
      </form>
      <template #footer>
        <div class="flex flex-wrap gap-2">
          <AdminButton type="submit" form="place-form" :loading="placeForm.busy">Ajouter</AdminButton>
          <AdminButton variant="secondary" :disabled="placeForm.busy" @click="placeForm.open = false">Annuler</AdminButton>
        </div>
      </template>
    </AdminModal>

    <!-- Taux d'une devise -->
    <AdminModal :open="rateForm.open" :title="rateForm.currency ? `Taux ${rateForm.currency.currency_code}` : 'Taux de change'" @close="rateForm.open = false">
      <form v-if="rateForm.currency" id="rate-form" class="flex flex-col gap-3.5" @submit.prevent="submitRate">
        <p class="m-0 text-[13px] text-[var(--text-muted)]">
          Taux actuel : <span class="font-mono font-bold text-[var(--text-primary)]">1 {{ rateForm.currency.currency_code }} = {{ formatRate(rateForm.currency.rate_to_cfa) }} FCFA</span>
        </p>
        <label class="block">
          <span class="mb-[7px] block text-[12.5px] font-bold">Nouveau taux</span>
          <span class="flex h-[46px] items-center gap-2.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 focus-within:border-green-600">
            <span class="whitespace-nowrap font-mono text-[13.5px] text-[var(--text-muted)]">1 {{ rateForm.currency.currency_code }} =</span>
            <input v-model="rateForm.value" inputmode="decimal" class="w-full min-w-0 bg-transparent font-mono text-[14.5px] outline-none">
            <span class="font-mono text-[13.5px] text-[var(--text-muted)]">FCFA</span>
          </span>
        </label>
        <p v-if="rateForm.error" class="m-0 text-[13px] font-semibold text-danger-fg">{{ rateForm.error }}</p>
      </form>
      <template #footer>
        <div class="flex flex-wrap gap-2">
          <AdminButton type="submit" form="rate-form" :loading="rateForm.busy">Enregistrer le taux</AdminButton>
          <AdminButton variant="secondary" :disabled="rateForm.busy" @click="rateForm.open = false">Annuler</AdminButton>
        </div>
      </template>
    </AdminModal>

    <!-- Nouvelle devise -->
    <AdminModal :open="currencyForm.open" title="Ajouter une devise" @close="currencyForm.open = false">
      <form id="currency-form" class="flex flex-col gap-3.5" @submit.prevent="submitCurrency">
        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <AdminInput :model-value="currencyForm.code" label="Code ISO" placeholder="USD" @update:model-value="v => { currencyForm.code = v.trim().toUpperCase() }" />
          <AdminInput v-model="currencyForm.symbol" label="Symbole (facultatif)" placeholder="$" />
        </div>
        <AdminInput :model-value="currencyForm.name" label="Nom" placeholder="Ex. dollar des États-Unis" @update:model-value="v => { currencyForm.name = v; currencyForm.nameTouched = true }" />
        <label class="block">
          <span class="mb-[7px] block text-[12.5px] font-bold">Taux vers le franc CFA</span>
          <span class="flex h-[46px] items-center gap-2.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 focus-within:border-green-600">
            <span class="whitespace-nowrap font-mono text-[13.5px] text-[var(--text-muted)]">1 {{ currencyForm.code || '…' }} =</span>
            <input v-model="currencyForm.rate" inputmode="decimal" placeholder="600" class="w-full min-w-0 bg-transparent font-mono text-[14.5px] outline-none placeholder:text-[var(--text-faint)]">
            <span class="font-mono text-[13.5px] text-[var(--text-muted)]">FCFA</span>
          </span>
        </label>
        <p v-if="currencyForm.error" class="m-0 text-[13px] font-semibold text-danger-fg">{{ currencyForm.error }}</p>
      </form>
      <template #footer>
        <div class="flex flex-wrap gap-2">
          <AdminButton type="submit" form="currency-form" :loading="currencyForm.busy">Ajouter la devise</AdminButton>
          <AdminButton variant="secondary" :disabled="currencyForm.busy" @click="currencyForm.open = false">Annuler</AdminButton>
        </div>
      </template>
    </AdminModal>
  </div>
</template>
