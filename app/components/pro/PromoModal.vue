<script setup lang="ts">
import { CircleCheck } from '@lucide/vue'
import type { PropertySearchResult } from '~/types/property'
import type { CreatePromoCodePayload, PromoDiscountType } from '~/types/landlordBookings'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const modal = useProModal()
const open = computed(() => modal.value === 'promo')
const authUser = useAuthUser()
const promoApi = usePromoCodesApi()
const promoList = useLandlordPromoCodes()
const landlordPropertiesApi = useLandlordPropertiesApi()

const step = ref<'form' | 'done'>('form')
const code = ref('')
type Scope = 'portfolio' | 'property' | 'unit'
const scope = ref<Scope>('portfolio')
const scopeTargetId = ref('')
const discountType = ref<PromoDiscountType>('percentage')
const discountValue = ref<number | null>(null)
const rewardType = ref<PromoDiscountType>('fixed')
const rewardValue = ref<number | null>(null)
const validFrom = ref('')
const validUntil = ref('')
const loading = ref(false)
const errorMessage = ref('')

const myProperties = ref<PropertySearchResult[]>([])
const myUnits = computed(() => myProperties.value.flatMap(p => p.units.map(u => ({ id: u.id, label: `${u.name} — ${p.name}` }))))

watch(open, async v => {
  if (!v) return
  step.value = 'form'
  code.value = ''
  scope.value = 'portfolio'
  scopeTargetId.value = ''
  discountType.value = 'percentage'
  discountValue.value = null
  rewardType.value = 'fixed'
  rewardValue.value = null
  validFrom.value = ''
  validUntil.value = ''
  errorMessage.value = ''
  try {
    const page = await landlordPropertiesApi.fetchMine({ limit: 100 })
    myProperties.value = page.data as PropertySearchResult[]
  } catch {
    myProperties.value = []
  }
})

const codeUpper = computed(() => code.value.trim().toUpperCase())
/** Au moins une des deux réductions (locataire/parrain) requise côté API — mêmes règles vérifiées sur `CreatePromoCodeCommand`. */
const blocked = computed(() => {
  const hasDiscount = !!discountValue.value || !!rewardValue.value
  const hasScope = scope.value === 'portfolio' || !!scopeTargetId.value
  return !hasDiscount || !hasScope
})

function close() {
  modal.value = ''
}

/** Saisie entamée : la fenêtre ne se ferme plus sur un clic à côté. */
const dirty = computed(() => step.value === 'form' && !!(code.value.trim() || discountValue.value || rewardValue.value || validFrom.value || validUntil.value || scope.value !== 'portfolio'))
const SCOPES: { value: Scope; label: string }[] = [
  { value: 'portfolio', label: 'Tout mon portefeuille' },
  { value: 'property', label: 'Un bien' },
  { value: 'unit', label: 'Un logement' }
]
const scopeModel = computed({ get: () => scope.value as string, set: (v: string) => { scope.value = v as Scope; scopeTargetId.value = '' } })
const propertyOptions = computed(() => myProperties.value.map(p => ({ value: p.id, label: p.name })))
const unitOptions = computed(() => myUnits.value.map(u => ({ value: u.id, label: u.label })))
/** Ce qui manque pour créer le code, dit sous le bouton plutôt qu'un bouton grisé muet. */
const missingHint = computed(() => {
  if (!discountValue.value && !rewardValue.value) return 'Indiquez une réduction pour le voyageur ou une récompense pour le parrain.'
  if (scope.value !== 'portfolio' && !scopeTargetId.value) return scope.value === 'unit' ? 'Choisissez le logement concerné.' : 'Choisissez le bien concerné.'
  return null
})

async function submit() {
  if (blocked.value) return
  loading.value = true
  errorMessage.value = ''
  const payload: CreatePromoCodePayload = {
    ...(code.value.trim() ? { code: codeUpper.value } : {}),
    ...(discountValue.value ? { referred_discount_type: discountType.value, referred_discount_value: discountValue.value } : {}),
    ...(rewardValue.value ? { referrer_reward_type: rewardType.value, referrer_reward_value: rewardValue.value, owner_user_id: authUser.value?.id } : {}),
    ...(validFrom.value ? { valid_from: new Date(validFrom.value).toISOString() } : {}),
    ...(validUntil.value ? { valid_until: new Date(validUntil.value).toISOString() } : {}),
    ...(scope.value === 'unit' ? { unit_id: scopeTargetId.value } : {}),
    ...(scope.value === 'property' ? { property_id: scopeTargetId.value } : {}),
    ...(scope.value === 'portfolio' ? { landlord_id: authUser.value?.id } : {})
  }
  try {
    await promoApi.create(payload)
    await promoList.reload()
    step.value = 'done'
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Impossible de créer ce code.') : 'Impossible de créer ce code.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <CoreModal :open="open" :title="step === 'form' ? 'Créer un code promo' : 'Code créé'" width="480px" :dirty="dirty" @close="close">
    <template v-if="step === 'form'">
      <p v-if="errorMessage" class="mb-3.5 mt-0 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>

      <label class="block">
        <span class="mb-[7px] block text-[12.5px] font-bold">Code (facultatif)</span>
        <input v-model="code" placeholder="RENTREE26" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-[15px] font-bold uppercase outline-none">
        <span class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">Vide : la réduction s'applique d'elle-même, sans code à saisir.</span>
      </label>

      <p class="mb-2 mt-4 text-[12.5px] font-bold">Portée</p>
      <div class="max-w-full overflow-x-auto">
        <FormsSegmentedControl v-model="scopeModel" :options="SCOPES" size="sm" class="whitespace-nowrap" />
      </div>
      <FormsSelect v-if="scope === 'property'" v-model="scopeTargetId" placeholder="Choisir un bien" :options="propertyOptions" class="mt-2.5 [&_select]:w-full" />
      <FormsSelect v-if="scope === 'unit'" v-model="scopeTargetId" placeholder="Choisir un logement" :options="unitOptions" class="mt-2.5 [&_select]:w-full" />

      <div class="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div>
          <p class="mb-[7px] mt-0 text-[12.5px] font-bold">Réduction voyageur</p>
          <div class="flex gap-1.5">
            <input v-model.number="discountValue" type="number" min="0" placeholder="10" aria-label="Montant de la réduction" class="h-[46px] w-full min-w-0 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none">
            <select v-model="discountType" aria-label="Unité de la réduction" class="h-[46px] flex-none rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-2 text-[13px] outline-none">
              <option value="percentage">%</option>
              <option value="fixed">FCFA</option>
            </select>
          </div>
        </div>
        <div>
          <p class="mb-[7px] mt-0 text-[12.5px] font-bold">Récompense parrain</p>
          <div class="flex gap-1.5">
            <input v-model.number="rewardValue" type="number" min="0" placeholder="2000" aria-label="Montant de la récompense" class="h-[46px] w-full min-w-0 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none">
            <select v-model="rewardType" aria-label="Unité de la récompense" class="h-[46px] flex-none rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-2 text-[13px] outline-none">
              <option value="fixed">FCFA</option>
              <option value="percentage">%</option>
            </select>
          </div>
        </div>
        <FormsInput v-model="validFrom" label="Valide du" type="date" />
        <FormsInput v-model="validUntil" label="au" type="date" />
      </div>
    </template>

    <div v-else class="px-0.5 py-1 text-center">
      <span class="mx-auto grid h-[46px] w-[46px] animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-ok-bg text-ok-fg"><CircleCheck class="h-6 w-6" :stroke-width="1.9" /></span>
      <p class="mb-0 mt-4 text-[15px] font-bold">Code créé</p>
      <p class="mx-auto mb-0 mt-2 max-w-[320px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">Le code <strong class="font-mono">{{ codeUpper || 'auto-appliqué' }}</strong> est actif et apparaît dans la liste.</p>
    </div>

    <template #footer>
      <template v-if="step === 'form'">
        <CoreButton full-width :disabled="blocked || loading" @click="submit">{{ loading ? 'Création…' : 'Créer le code' }}</CoreButton>
        <p v-if="missingHint" class="mb-0 mt-2 text-center text-[12.5px] font-semibold text-[var(--text-muted)]">{{ missingHint }}</p>
      </template>
      <CoreButton v-else full-width @click="close">Terminé</CoreButton>
    </template>
  </CoreModal>
</template>
