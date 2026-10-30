<script setup lang="ts">
import { ArrowLeft, FileText, UserRound } from '@lucide/vue'
import type { PropertySearchResult } from '~/types/property'
import type { LeaseBillingFrequency, LeaseContractType } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { depositExceedsCap, RENT_SUFFIX, startDateWarning, validateLeaseForm } from '~/utils/leases'
import {
  CONTRACT_TYPE_HELP, CONTRACT_TYPE_HINT, CONTRACT_TYPE_LABEL, CONTRACT_TYPES, leaseFormMissing, leaseTenantCandidates, type TenantCandidate
} from '~/utils/leaseDraft'

definePageMeta({ layout: 'pro' })

const route = useRoute()
const leasesApi = useLeasesApi()
const landlordPropertiesApi = useLandlordPropertiesApi()
const messagingApi = useMessagingApi()
const visitsApi = useVisitsApi()
const rentalApi = useRentalRequestsApi()
const authUser = useAuthUser()

const tenantId = ref('')
const unitId = ref('')

/* ---- Locataires proposés : candidatures, visites, conversations (voir utils/leaseDraft) ---- */
const tenantCandidates = ref<TenantCandidate[]>([])
const candidatesState = ref<'loading' | 'ready'>('loading')
/** Sources en échec : la liste reste utilisable, on dit seulement ce qui manque. */
const candidatesPartial = ref(false)
async function loadCandidates() {
  candidatesState.value = 'loading'
  const [requests, visits, conversations] = await Promise.allSettled([
    rentalApi.fetchMine('landlord'),
    visitsApi.fetchMine('landlord'),
    messagingApi.fetchConversations()
  ])
  candidatesPartial.value = [requests, visits, conversations].some(r => r.status === 'rejected')
  tenantCandidates.value = leaseTenantCandidates({
    requests: requests.status === 'fulfilled' ? requests.value : [],
    visits: visits.status === 'fulfilled' ? visits.value : [],
    conversations: conversations.status === 'fulfilled' ? conversations.value : []
  }, authUser.value?.id)
  candidatesState.value = 'ready'
  ensureQueryTenant()
}
onMounted(loadCandidates)

/** Locataire passé par le lien (`?tenantId=`, depuis une visite) mais absent des listes : on le garde, sans inventer de nom. */
function ensureQueryTenant() {
  const id = tenantId.value
  if (id && !tenantCandidates.value.some(t => t.id === id)) {
    tenantCandidates.value = [{ id, name: 'Locataire du lien suivi', hint: 'compte transmis par la page précédente', unitId: null }, ...tenantCandidates.value]
  }
}
const tenantOptions = computed(() => tenantCandidates.value.map(t => ({ value: t.id, label: `${t.name} · ${t.hint}` })))
const selectedTenant = computed(() => tenantCandidates.value.find(t => t.id === tenantId.value) ?? null)
// Choisir un candidat lié à un logement pré-remplit le logement, s'il n'est pas déjà choisi.
watch(tenantId, () => {
  if (!unitId.value && selectedTenant.value?.unitId && myUnits.value.some(u => u.id === selectedTenant.value!.unitId)) unitId.value = selectedTenant.value.unitId
})

/* ---- Logements ---- */
const myProperties = ref<PropertySearchResult[]>([])
const unitsState = ref<'loading' | 'ready' | 'error'>('loading')
async function loadUnits() {
  unitsState.value = 'loading'
  try {
    const page = await landlordPropertiesApi.fetchMine({ limit: 100 })
    myProperties.value = page.data as PropertySearchResult[]
    unitsState.value = 'ready'
  } catch {
    unitsState.value = 'error'
  }
}
onMounted(loadUnits)
const myUnits = computed(() => myProperties.value.flatMap(p => p.units.map(u => ({ id: u.id, propertyId: p.id, label: `${u.name} — ${p.name}`, price: u.price }))))
const unitOptions = computed(() => myUnits.value.map(u => ({ value: u.id, label: u.label })))
const selectedUnit = computed(() => myUnits.value.find(u => u.id === unitId.value) ?? null)

/* ---- Lien profond : ?tenantId= et ?unitId= sont lus, et suivis si on y revient depuis une autre fiche ---- */
watch(() => [route.query.tenantId, route.query.unitId], ([t, u]) => {
  if (typeof t === 'string' && t) tenantId.value = t
  if (typeof u === 'string' && u) unitId.value = u
  if (candidatesState.value === 'ready') ensureQueryTenant()
}, { immediate: true })

const billingFrequency = ref<LeaseBillingFrequency>('monthly')
const FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Mensuelle' },
  { value: 'daily', label: 'Journalière' },
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'quarterly', label: 'Trimestrielle' },
  { value: 'semi_annual', label: 'Semestrielle' },
  { value: 'annual', label: 'Annuelle' }
]
const frequencyModel = computed({ get: () => billingFrequency.value as string, set: (v: string) => { billingFrequency.value = v as LeaseBillingFrequency } })
const monthlyRent = ref('')
const depositAmount = ref('')
const startDate = ref('')
const endDate = ref('')
const contractType = ref<LeaseContractType>('standard')
const contractModel = computed({ get: () => contractType.value as string, set: (v: string) => { contractType.value = v as LeaseContractType } })
const CONTRACT_OPTIONS = CONTRACT_TYPES.map(c => ({ value: c, label: CONTRACT_TYPE_LABEL[c]! }))
const depositAck = ref(false)
const noticePeriod = ref('3')

/**
 * Loyer pré-rempli depuis la grille tarifaire de la fréquence choisie (celle
 * que l'API utiliserait si le loyer était omis), sinon le prix de base pour un
 * bail mensuel.
 */
const pricingApi = useUnitPricingApi()
const unitPricing = ref<{ billing_frequency: string; price: string; is_available: boolean }[]>([])
const rentTouched = ref(false)
const rentHint = ref('')
watch(unitId, async id => {
  unitPricing.value = []
  if (!id) return
  try {
    unitPricing.value = await pricingApi.fetchPricing(id)
  } catch {
    unitPricing.value = []
  }
  prefillRent()
}, { immediate: true })
watch(billingFrequency, prefillRent)
function prefillRent() {
  const row = unitPricing.value.find(p => p.billing_frequency === billingFrequency.value && p.is_available)
  if (row) {
    rentHint.value = "D'après votre grille tarifaire."
    if (!rentTouched.value) monthlyRent.value = String(Math.round(Number(row.price)))
  } else if (billingFrequency.value === 'monthly' && selectedUnit.value) {
    rentHint.value = "Prix affiché sur l'annonce."
    if (!rentTouched.value) monthlyRent.value = String(Math.round(Number(selectedUnit.value.price)))
  } else {
    rentHint.value = selectedUnit.value ? 'Aucun tarif pour cette fréquence : saisissez le loyer de la période.' : ''
    if (!rentTouched.value) monthlyRent.value = ''
  }
}
watch(selectedUnit, u => { if (u && !unitPricing.value.length) prefillRent() })
function onRentInput(v: string) {
  monthlyRent.value = v
  rentTouched.value = true
}

const depositMonths = computed(() => {
  const rent = Number(monthlyRent.value)
  const deposit = Number(depositAmount.value)
  return rent > 0 ? deposit / rent : 0
})
const depositExceeds = computed(() => depositExceedsCap(billingFrequency.value, Number(monthlyRent.value), Number(depositAmount.value)))

const missing = computed(() => leaseFormMissing({ tenantId: tenantId.value, unitId: unitId.value, startDate: startDate.value }))
const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const startWarning = computed(() => startDateWarning(startDate.value, todayIso))

const loading = ref(false)
const errorMessage = ref('')

async function submit() {
  if (missing.value) return
  const unit = selectedUnit.value
  errorMessage.value = validateLeaseForm({
    tenantId: tenantId.value, unitId: unitId.value, rent: monthlyRent.value, deposit: depositAmount.value,
    startDate: startDate.value, endDate: endDate.value, noticePeriod: noticePeriod.value
  }) ?? (depositExceeds.value && !depositAck.value ? "Confirmez l'accord des deux parties pour une caution au-delà de 3 mois de loyer." : '')
  if (errorMessage.value || !unit) return
  loading.value = true
  try {
    const created = await leasesApi.create({
      tenantId: tenantId.value.trim(),
      propertyId: unit.propertyId,
      unitId: unit.id,
      billingFrequency: billingFrequency.value,
      monthlyRent: Number(monthlyRent.value),
      depositAmount: Number(depositAmount.value),
      startDate: startDate.value,
      endDate: endDate.value || undefined,
      contractType: contractType.value,
      depositAcknowledged: depositExceeds.value ? depositAck.value : undefined
    })
    // Le préavis n'est pas accepté à la création, seulement en modification du brouillon.
    if (Number(noticePeriod.value) !== 3) await leasesApi.updateDraft(created.id, { noticePeriod: Number(noticePeriod.value) }).catch(() => undefined)
    await navigateTo(`/pro/baux/${created.id}`)
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError
      ? (e.status === 409
          ? 'Ce logement a déjà un bail sur cette période (un brouillon compte aussi). Choisissez un autre logement ou une autre date de début.'
          : e.status === 404 ? "Ce compte locataire est introuvable : choisissez un autre locataire." : errorText(e.mapped, 'La création du bail a échoué.'))
      : 'La création du bail a échoué.'
  } finally {
    loading.value = false
  }
}

function fmtDate(iso: string) {
  return iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <NuxtLink to="/pro/baux" class="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700">
      <ArrowLeft class="h-4 w-4" :stroke-width="1.9" /> Tous les baux
    </NuxtLink>

    <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div class="flex min-w-0 flex-col gap-4.5">
        <!-- Parties -->
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <h2 class="m-0 text-[15px] font-bold">Locataire et logement</h2>
          <p class="mb-4 mt-1 text-[13.5px] text-[var(--text-muted)]">Le bail est créé en brouillon : rien n'est envoyé au locataire avant que vous ne le signiez.</p>

          <div v-if="candidatesState === 'loading'" class="h-[72px] animate-pulse rounded-md bg-sand-100" />
          <template v-else-if="tenantCandidates.length">
            <FormsSelect v-model="tenantId" label="Locataire" placeholder="Choisir parmi vos candidatures, visites et conversations" :options="tenantOptions" class="[&_select]:w-full" />
            <p class="mb-0 mt-[7px] text-[12.5px] text-[var(--text-faint)]">Le locataire doit avoir un compte Immo : il signera et paiera son entrée en ligne.</p>
          </template>
          <div v-else class="flex items-start gap-3 rounded-md border border-dashed border-[var(--border-default)] p-4">
            <span class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-green-50 text-green-700"><UserRound class="h-5 w-5" :stroke-width="1.9" /></span>
            <div class="min-w-0">
              <p class="m-0 text-sm font-bold">Aucun locataire à proposer pour l'instant</p>
              <p class="mb-0 mt-1 text-[13px] leading-[1.55] text-[var(--text-muted)]">Un locataire apparaît ici dès qu'il a candidaté, visité un de vos logements ou vous a écrit.</p>
              <div class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] font-bold">
                <NuxtLink to="/pro/candidatures" class="text-green-700">Candidatures</NuxtLink>
                <NuxtLink to="/pro/visites" class="text-green-700">Visites</NuxtLink>
                <NuxtLink to="/pro/messages" class="text-green-700">Messages</NuxtLink>
              </div>
            </div>
          </div>
          <p v-if="candidatesPartial" class="mb-0 mt-2 text-[12.5px] font-semibold text-warn-fg">
            Une partie de vos candidatures, visites ou conversations n'a pas pu être lue : la liste peut être incomplète.
            <button type="button" class="font-bold underline" @click="loadCandidates">Réessayer</button>
          </p>

          <div class="mt-4">
            <div v-if="unitsState === 'loading'" class="h-[72px] animate-pulse rounded-md bg-sand-100" />
            <p v-else-if="unitsState === 'error'" class="m-0 text-[13px] font-semibold text-danger-fg">
              Impossible de charger vos logements. <button type="button" class="font-bold underline" @click="loadUnits">Réessayer</button>
            </p>
            <template v-else-if="myUnits.length">
              <FormsSelect v-model="unitId" label="Logement" placeholder="Choisir un de vos logements" :options="unitOptions" class="[&_select]:w-full" />
            </template>
            <p v-else class="m-0 text-[13px] text-[var(--text-muted)]">
              Vous n'avez encore aucun logement. <NuxtLink to="/pro/biens/ajouter" class="font-bold text-green-700">Ajouter un bien</NuxtLink>
            </p>
          </div>
        </section>

        <!-- Conditions -->
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <h2 class="m-0 mb-4 text-[15px] font-bold">Conditions</h2>
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <FormsSelect v-model="frequencyModel" label="Fréquence de paiement" :options="FREQUENCY_OPTIONS" class="[&_select]:w-full" />
            <FormsInput :model-value="monthlyRent" label="Loyer par période (FCFA)" type="number" mono :hint="rentHint || undefined" @update:model-value="onRentInput" />
            <FormsInput v-model="depositAmount" label="Caution (FCFA)" type="number" mono hint="Conservée par Immo pendant tout le bail. 0 si aucune." />
            <div>
              <FormsSelect v-model="contractModel" label="Modèle de contrat" :options="CONTRACT_OPTIONS" class="[&_select]:w-full" />
              <p class="mb-0 mt-[7px] text-[12.5px] text-[var(--text-faint)]">{{ CONTRACT_TYPE_HINT[contractType] }}</p>
            </div>
          </div>
          <p class="mb-0 mt-3 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">{{ CONTRACT_TYPE_HELP }}</p>

          <div v-if="depositExceeds" class="mt-4 rounded-md border border-warn-border bg-warn-bg p-4">
            <p class="m-0 text-[13.5px] font-bold text-warn-fg-deep">Caution supérieure au plafond légal</p>
            <p class="mb-3 mt-1.5 text-[13px] leading-[1.55] text-warn-fg-deep">La Loi 2022-30 plafonne la caution à 3 mois de loyer hors charges. Vous demandez l'équivalent de <span class="font-mono">{{ depositMonths.toFixed(1).replace('.', ',') }}</span> mois : il faut l'accord explicite des deux parties.</p>
            <FormsToggle v-model="depositAck" label="Je confirme cet accord dérogatoire des deux parties" />
          </div>
        </section>

        <!-- Dates -->
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <h2 class="m-0 mb-4 text-[15px] font-bold">Durée</h2>
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <FormsInput v-model="startDate" label="Date de début" type="date" />
            <FormsInput v-model="endDate" label="Date de fin (facultatif)" type="date" hint="Vide : durée indéterminée." />
            <FormsInput v-model="noticePeriod" label="Préavis du locataire (mois)" type="number" mono hint="Entre 1 et 12 mois." />
          </div>
          <p v-if="startWarning" class="mb-0 mt-3.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[12.5px] text-warn-fg">{{ startWarning }}</p>
        </section>
      </div>

      <!-- Récapitulatif et action -->
      <aside class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 lg:sticky lg:top-[94px]">
        <h2 class="m-0 text-[15px] font-bold">Récapitulatif</h2>
        <div class="mt-3 flex flex-col">
          <div class="flex items-center gap-3 border-b border-sand-200 py-3">
            <UserRound class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
            <p class="m-0 min-w-0 flex-1 truncate text-[13.5px]" :class="selectedTenant ? 'font-bold' : 'text-[var(--text-faint)]'">{{ selectedTenant?.name ?? 'Locataire à choisir' }}</p>
          </div>
          <div class="flex items-center gap-3 border-b border-sand-200 py-3">
            <FileText class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
            <p class="m-0 min-w-0 flex-1 truncate text-[13.5px]" :class="selectedUnit ? 'font-bold' : 'text-[var(--text-faint)]'">{{ selectedUnit?.label ?? 'Logement à choisir' }}</p>
          </div>
        </div>
        <div class="mt-2">
          <DataMoneyLine label="Loyer" :value="Number(monthlyRent) > 0 ? `${formatFcfa(Number(monthlyRent))} ${RENT_SUFFIX[billingFrequency]}` : 'à saisir'" />
          <DataMoneyLine label="Caution" :value="depositAmount !== '' ? formatFcfa(Number(depositAmount)) : 'à saisir'" />
          <DataMoneyLine label="Début" :value="startDate ? fmtDate(startDate) : 'à choisir'" />
          <DataMoneyLine label="Contrat" :value="CONTRACT_TYPE_LABEL[contractType] ?? ''" />
        </div>

        <p v-if="errorMessage" class="mb-0 mt-4 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
        <CoreButton full-width class="mt-4.5" :disabled="!!missing || loading" @click="submit">{{ loading ? 'Création…' : 'Créer le bail en brouillon' }}</CoreButton>
        <p v-if="missing" class="mb-0 mt-2 text-center text-[12.5px] font-semibold text-[var(--text-muted)]">{{ missing }}</p>
        <p class="mb-0 mt-3 text-xs leading-[1.5] text-[var(--text-faint)]">Ensuite : vous relisez le contrat, puis vous l'envoyez, ce qui vaut votre signature. Dès sa création, le logement est bloqué dans votre calendrier sur cette période.</p>
      </aside>
    </div>
  </div>
</template>
