<script setup lang="ts">
import type { PropertySearchResult } from '~/types/property'
import type { ConversationSummary } from '~/types/messaging'
import type { LeaseBillingFrequency, LeaseContractType } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

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
const tenantCandidates = ref<{ id: string; name: string }[]>([])
onMounted(async () => {
  try {
    const conversations = await messagingApi.fetchConversations()
    const seen = new Map<string, string>()
    for (const c of conversations as ConversationSummary[]) {
      const tenant = c.participants.find(p => p.role === 'tenant')
      if (tenant && !seen.has(tenant.user_id)) {
        seen.set(tenant.user_id, `${tenant.user.first_name ?? ''} ${tenant.user.last_name ?? ''}`.trim() || tenant.user.id)
      }
    }
    tenantCandidates.value = [...seen].map(([id, name]) => ({ id, name }))
  } catch {
    tenantCandidates.value = []
  }
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

const selectedUnit = computed(() => myUnits.value.find(u => u.id === unitId.value) ?? null)
watch(selectedUnit, u => {
  if (u && !monthlyRent.value) monthlyRent.value = u.price
})

const depositMonths = computed(() => {
  const rent = Number(monthlyRent.value)
  const deposit = Number(depositAmount.value)
  return rent > 0 ? deposit / rent : 0
})
const depositExceeds = computed(() => billingFrequency.value === 'monthly' && depositMonths.value > 3)

const canSubmit = computed(() => !!(tenantId.value.trim() && unitId.value && depositAmount.value && startDate.value) && !(depositExceeds.value && !depositAck.value))

const loading = ref(false)
const errorMessage = ref('')

async function submit() {
  if (!canSubmit.value) return
  const unit = selectedUnit.value
  if (!unit) return
  loading.value = true
  errorMessage.value = ''
  try {
    await leasesApi.create({
      tenantId: tenantId.value.trim(),
      propertyId: unit.propertyId,
      unitId: unit.id,
      billingFrequency: billingFrequency.value,
      monthlyRent: monthlyRent.value ? Number(monthlyRent.value) : undefined,
      depositAmount: Number(depositAmount.value),
      startDate: startDate.value,
      endDate: endDate.value || undefined,
      contractType: contractType.value,
      depositAcknowledged: depositExceeds.value ? depositAck.value : undefined
    })
    await navigateTo('/pro/baux')
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La création du bail a échoué.') : 'La création du bail a échoué.'
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

      <p v-if="errorMessage" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>

      <div class="flex flex-col gap-3.5">
        <div>
          <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Locataire</p>
          <select v-if="tenantCandidates.length" v-model="tenantId" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3 text-sm text-sand-900">
            <option value="" disabled>Choisir parmi vos conversations</option>
            <option v-for="t in tenantCandidates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <p v-else class="m-0 text-[12.5px] text-[var(--text-muted)]">Aucun locataire dans vos conversations pour l'instant — l'id du locataire peut être saisi directement ci-dessous.</p>
          <input v-model="tenantId" placeholder="Ou coller directement l'id du locataire" class="mt-2 h-[42px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-[12.5px] outline-none">
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
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Loyer</p><input v-model="monthlyRent" inputmode="numeric" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none"></div>
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

        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Date de début</p><input v-model="startDate" type="date" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
          <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Date de fin (optionnel)</p><input v-model="endDate" type="date" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <button type="button" class="rounded-md bg-[image:var(--action-primary)] px-6 py-3.5 text-sm font-bold text-white shadow-action" :disabled="!canSubmit || loading" @click="submit">{{ loading ? 'Création…' : 'Créer le bail (brouillon)' }}</button>
      </div>
    </div>
  </div>
</template>
