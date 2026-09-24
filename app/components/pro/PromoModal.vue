<script setup lang="ts">
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
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="close">
      <div class="flex max-h-[90vh] w-[480px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4.5">
          <h3 class="m-0 font-display text-[19px] font-bold tracking-[-.02em]">{{ step === 'form' ? 'Créer un code promo' : 'Code créé' }}</h3>
          <button type="button" class="grid h-[34px] w-[34px] place-items-center rounded-pill bg-sand-200 text-[15px] text-sand-800" @click="close">✕</button>
        </div>

        <div class="overflow-y-auto p-6">
          <template v-if="step === 'form'">
            <p v-if="errorMessage" class="mb-3.5 mt-0 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>

            <p class="mb-2 mt-0 text-[12.5px] font-bold">Code (optionnel — laissez vide pour un code auto-appliqué)</p>
            <input v-model="code" placeholder="RENTREE26" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-[15px] font-bold uppercase outline-none">

            <p class="mb-2 mt-4 text-[12.5px] font-bold">Portée</p>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="rounded-pill border px-3.5 py-2.5 text-[13px] font-semibold transition-all" :class="scope === 'portfolio' ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'" @click="scope = 'portfolio'; scopeTargetId = ''">Tout mon portefeuille</button>
              <button type="button" class="rounded-pill border px-3.5 py-2.5 text-[13px] font-semibold transition-all" :class="scope === 'property' ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'" @click="scope = 'property'; scopeTargetId = ''">Un bien précis</button>
              <button type="button" class="rounded-pill border px-3.5 py-2.5 text-[13px] font-semibold transition-all" :class="scope === 'unit' ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'" @click="scope = 'unit'; scopeTargetId = ''">Une unité précise</button>
            </div>
            <select v-if="scope === 'property'" v-model="scopeTargetId" class="mt-2.5 h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-[13px] outline-none">
              <option value="" disabled>Choisir un bien</option>
              <option v-for="p in myProperties" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <select v-if="scope === 'unit'" v-model="scopeTargetId" class="mt-2.5 h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-[13px] outline-none">
              <option value="" disabled>Choisir une unité</option>
              <option v-for="u in myUnits" :key="u.id" :value="u.id">{{ u.label }}</option>
            </select>

            <div class="mt-4 grid grid-cols-2 gap-3.5">
              <div>
                <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Réduction locataire</p>
                <div class="flex gap-1.5">
                  <input v-model.number="discountValue" type="number" min="0" placeholder="10" class="h-[46px] w-full min-w-0 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none">
                  <select v-model="discountType" class="h-[46px] flex-none rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-2 text-xs outline-none">
                    <option value="percentage">%</option>
                    <option value="fixed">F</option>
                  </select>
                </div>
              </div>
              <div>
                <p class="mb-1.5 mt-0 text-[12.5px] font-bold">Récompense parrain</p>
                <div class="flex gap-1.5">
                  <input v-model.number="rewardValue" type="number" min="0" placeholder="2000" class="h-[46px] w-full min-w-0 rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-sm outline-none">
                  <select v-model="rewardType" class="h-[46px] flex-none rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-2 text-xs outline-none">
                    <option value="fixed">F</option>
                    <option value="percentage">%</option>
                  </select>
                </div>
              </div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">Valide du</p><input v-model="validFrom" type="date" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
              <div><p class="mb-1.5 mt-0 text-[12.5px] font-bold">au</p><input v-model="validUntil" type="date" class="h-[46px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-sm outline-none"></div>
            </div>

            <button
              type="button"
              class="mt-5.5 w-full rounded-md py-3.5 text-[15px] font-bold text-white transition-colors"
              :class="blocked || loading ? 'cursor-not-allowed bg-sand-400' : 'cursor-pointer bg-[image:var(--action-primary)] shadow-action'"
              :disabled="blocked || loading"
              @click="submit"
            >{{ loading ? 'Création…' : 'Créer le code' }}</button>
          </template>

          <template v-else>
            <div class="px-0.5 py-1 text-center">
              <div class="mx-auto grid h-15 w-15 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[28px] text-white">✓</div>
              <p class="mb-0 mt-4.5 text-lg font-bold">Code créé</p>
              <p class="mx-auto mb-0 mt-2.5 max-w-[320px] text-sm leading-[1.6] text-[var(--text-muted)]">Le code <strong class="font-mono">{{ codeUpper || 'auto-appliqué' }}</strong> est actif et apparaît dans la liste.</p>
              <CoreButton size="lg" full-width class="mt-5.5" @click="close">Terminé</CoreButton>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
