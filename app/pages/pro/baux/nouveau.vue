<script setup lang="ts">
import type { PropertySearchResult } from '~/types/property'
import type { ConversationSummary } from '~/types/messaging'
import type { LeaseBillingFrequency, LeaseContractType } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { depositExceedsCap, startDateWarning, validateLeaseForm } from '~/utils/leases'

definePageMeta({ layout: 'pro' })

const route = useRoute()
const leasesApi = useLeasesApi()
const landlordPropertiesApi = useLandlordPropertiesApi()
const messagingApi = useMessagingApi()

/**
 * Aucune recherche de locataire par email n'est accessible à un propriétaire :
 * `GET /user/all?search=` existe mais est réservé aux administrateurs
 * (vérifié sur le Swagger). Les locataires candidats viennent donc d'une
 * source réelle et déjà accessible au propriétaire : ses propres
 * conversations (chaque participant `tenant` y porte un vrai id).
 */
const tenantCandidates = ref<{ id: string; name: string; hint: string }[]>([])
const visitsApi = useVisitsApi()
onMounted(async () => {
  const seen = new Map<string, { name: string; hint: string }>()
  const [conversations, visits] = await Promise.allSettled([messagingApi.fetchConversations(), visitsApi.fetchMine('landlord')])
  // Visites d'abord (réalisées ou confirmées) : c'est d'elles que naît un bail le plus souvent (Lot 50).
  if (visits.status === 'fulfilled') {
    for (const v of visits.value) {
      if (!v.tenant || !['completed', 'confirmed'].includes(v.status) || seen.has(v.tenant.id)) continue
      const name = `${v.tenant.first_name ?? ''} ${v.tenant.last_name ?? ''}`.trim() || v.tenant.email
      seen.set(v.tenant.id, { name, hint: `a visité ${v.unit?.name ?? 'un logement'}` })
    }
  }
  if (conversations.status === 'fulfilled') {
    for (const c of conversations.value as ConversationSummary[]) {
      const tenant = c.participants.find(p => p.role === 'tenant')
      if (tenant && !seen.has(tenant.user_id)) {
        seen.set(tenant.user_id, { name: `${tenant.user.first_name ?? ''} ${tenant.user.last_name ?? ''}`.trim() || 'Locataire', hint: 'conversation' })
      }
    }
  }
  tenantCandidates.value = [...seen].map(([id, t]) => ({ id, ...t }))
  // Lien « Proposer un bail » : locataire hors des listes → on montre le champ d'identifiant pré-rempli.
  if (tenantId.value && !seen.has(tenantId.value)) showIdField.value = true
})

const myProperties = ref<PropertySearchResult[]>([])
onMounted(async () => {
  try {
    const page = await landlordPropertiesApi.fetchMine({ limit: 100 })
    myProperties.value = page.data as PropertySearchResult[]
  } catch {
    myProperties.value = []
  }
})
const myUnits = computed(() => myProperties.value.flatMap(p => p.units.map(u => ({ id: u.id, propertyId: p.id, label: `${u.name} — ${p.name}`, price: u.price }))))

const tenantId = ref(typeof route.query.tenantId === 'string' ? route.query.tenantId : '')
const unitId = ref(typeof route.query.unitId === 'string' ? route.query.unitId : '')
const billingFrequency = ref<LeaseBillingFrequency>('monthly')
const monthlyRent = ref('')
const depositAmount = ref('')
const startDate = ref('')
const endDate = ref('')
const contractType = ref<LeaseContractType>('standard')
const depositAck = ref(false)
const noticePeriod = ref('3')
const showIdField = ref(false)

const selectedUnit = computed(() => myUnits.value.find(u => u.id === unitId.value) ?? null)

/**
 * Loyer pré-rempli depuis la grille tarifaire de la fréquence choisie (celle
 * que l'API utiliserait si le loyer était omis), sinon le prix de base pour un
 * bail mensuel. Avant : toujours le prix de base, même pour un bail
 * trimestriel ou si le tarif mensuel avait été changé dans « Tarifs ».
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
    rentHint.value = 'Aucun tarif pour cette fréquence : saisissez le loyer de la période.'
    if (!rentTouched.value) monthlyRent.value = ''
  }
}
watch(selectedUnit, u => { if (u && !unitPricing.value.length) prefillRent() })

const depositMonths = computed(() => {
  const rent = Number(monthlyRent.value)
  const deposit = Number(depositAmount.value)
  return rent > 0 ? deposit / rent : 0
})
const depositExceeds = computed(() => depositExceedsCap(billingFrequency.value, Number(monthlyRent.value), Number(depositAmount.value)))

const canSubmit = computed(() => !!(tenantId.value.trim() && unitId.value && startDate.value))
const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const startWarning = computed(() => startDateWarning(startDate.value, todayIso))

const loading = ref(false)
const errorMessage = ref('')

async function submit() {
  if (!canSubmit.value) return
  const unit = selectedUnit.value
  errorMessage.value = validateLeaseForm({
    tenantId: tenantId.value, unitId: unitId.value, rent: monthlyRent.value, deposit: depositAmount.value,
    startDate: startDate.value, endDate: endDate.value, noticePeriod: noticePeriod.value
  }) ?? (depositExceeds.value && !depositAck.value ? "Cochez l'accord des deux parties pour une caution au-delà de 3 mois de loyer." : '')
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
          : e.status === 404 ? "Ce locataire est introuvable : vérifiez l'identifiant." : errorText(e.mapped, 'La création du bail a échoué.'))
      : 'La création du bail a échoué.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-[640px]">
    <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6.5">
      <h2 class="mb-1 mt-0 font-display text-[22px] font-bold tracking-[-.02em]">Créer un bail</h2>
      <p class="mb-5.5 mt-0 text-[13.5px] text-[var(--text-muted)]">Sélectionnez le locataire et l'unité, puis les conditions du bail.</p>

      <p v-if="errorMessage" class="mb-3.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>

      <div class="flex flex-col gap-3.5">
        <div>
          <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Locataire</p>
          <select v-if="tenantCandidates.length" v-model="tenantId" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
            <option value="" disabled>Choisir parmi vos visites et conversations</option>
            <option v-for="t in tenantCandidates" :key="t.id" :value="t.id">{{ t.name }} — {{ t.hint }}</option>
          </select>
          <p v-else class="m-0 text-[12.5px] text-[var(--text-muted)]">Aucun locataire dans vos visites ni vos conversations pour l'instant. Le locataire doit avoir un compte Immo.</p>
          <button v-if="!showIdField && tenantCandidates.length" type="button" class="mt-1.5 text-[12px] font-bold text-[var(--text-muted)] underline" @click="showIdField = true">Le locataire n'est pas dans la liste ?</button>
          <input v-if="showIdField || !tenantCandidates.length" v-model="tenantId" placeholder="Identifiant du compte locataire" class="mt-2 h-[42px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-[12.5px] outline-none">
        </div>
        <div>
          <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Unité</p>
          <select v-model="unitId" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
            <option value="" disabled>Choisir une de vos unités</option>
            <option v-for="u in myUnits" :key="u.id" :value="u.id">{{ u.label }}</option>
          </select>
        </div>

        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Fréquence</p>
            <select v-model="billingFrequency" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
              <option value="monthly">Mensuelle</option>
              <option value="daily">Journalière</option>
              <option value="weekly">Hebdomadaire</option>
              <option value="quarterly">Trimestrielle</option>
              <option value="semi_annual">Semestrielle</option>
              <option value="annual">Annuelle</option>
            </select>
          </div>
          <div>
            <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Loyer par période</p>
            <input v-model="monthlyRent" inputmode="numeric" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none" @input="rentTouched = true">
            <p v-if="rentHint" class="mb-0 mt-1 text-[11.5px] text-[var(--text-faint)]">{{ rentHint }}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Caution</p><input v-model="depositAmount" inputmode="numeric" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
          <div>
            <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Type de contrat</p>
            <select v-model="contractType" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
              <option value="standard">Standard</option>
              <option value="compact">Compact</option>
              <option value="detailed">Détaillé</option>
            </select>
          </div>
        </div>

        <div v-if="depositExceeds" class="rounded-md border border-warn-border bg-warn-bg p-4">
          <p class="m-0 text-[13.5px] font-bold text-warn-fg-deep">Caution supérieure au plafond légal</p>
          <p class="mb-3 mt-1.5 text-[13px] leading-[1.55] text-clay-900">La Loi 2022-30 plafonne la caution à 3 mois de loyer hors charges. Vous demandez l'équivalent de {{ depositMonths.toFixed(1) }} mois. Une caution supérieure exige l'accord explicite des deux parties.</p>
          <label class="flex cursor-pointer items-center gap-2.5" @click="depositAck = !depositAck">
            <span class="grid h-5 w-5 flex-none place-items-center rounded-xs border-2 text-xs text-white" :class="depositAck ? 'border-green-600 bg-green-600' : 'border-[var(--border-default)] bg-white'">{{ depositAck ? '✓' : '' }}</span>
            <span class="text-[13px] font-semibold">Je confirme cet accord dérogatoire des deux parties</span>
          </label>
        </div>

        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Date de début</p><input v-model="startDate" type="date" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Date de fin (facultatif)</p><input v-model="endDate" type="date" :min="startDate || undefined" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Préavis (mois)</p><input v-model="noticePeriod" inputmode="numeric" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
        </div>
        <p v-if="startWarning" class="m-0 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[12.5px] text-warn-fg">{{ startWarning }}</p>
        <p class="m-0 text-[12px] leading-[1.5] text-[var(--text-faint)]">
          Le bail est créé en brouillon : vous le relisez, puis vous l'envoyez (ce qui vaut votre signature). Dès sa création, le logement est bloqué dans votre calendrier sur cette période.
        </p>
      </div>

      <div class="mt-6 flex justify-end">
        <button type="button" class="rounded-md bg-[image:var(--action-primary)] px-6 py-3.5 text-sm font-bold text-white shadow-action" :disabled="!canSubmit || loading" @click="submit">{{ loading ? 'Création…' : 'Créer le bail (brouillon)' }}</button>
      </div>
    </div>
  </div>
</template>
