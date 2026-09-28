<script setup lang="ts">
import type { ArtisanOffer, ArtisanRequestSummary } from '~/types/artisan'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { isMine, OFFER_STATUS, paymentSplit, pendingOffer, validateOffer } from '~/utils/artisanRequests'

/**
 * Négociation d'une intervention, commune aux deux espaces (Lot 54). L'API
 * permet aux deux parties de proposer (une nouvelle offre remplace la
 * précédente) et seule l'autre partie répond. Avant : le propriétaire ne
 * pouvait qu'accepter ou refuser, l'artisan ne voyait que sa propre offre.
 */
const props = defineProps<{ request: ArtisanRequestSummary; side: 'requester' | 'artisan' }>()
const emit = defineEmits<{ changed: [] }>()

const api = useArtisanRequestsApi()
const authUser = useAuthUser()
const me = computed(() => authUser.value?.id)

const offers = ref<ArtisanOffer[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
async function load() {
  loading.value = true
  try {
    offers.value = (await api.listOffers(props.request.id)).sort((a, b) => b.created_at.localeCompare(a.created_at))
  } catch {
    offers.value = []
  } finally {
    loading.value = false
  }
}
onMounted(load)

const pending = computed(() => pendingOffer(offers.value))
const canNegotiate = computed(() => props.request.status === 'open')
const otherLabel = computed(() => (props.side === 'requester' ? "l'artisan" : 'le demandeur'))

async function respond(o: ArtisanOffer, action: 'accept' | 'reject') {
  busy.value = true
  error.value = ''
  try {
    await api.respondOffer(o.id, action)
    await load()
    emit('changed')
  } catch (e) {
    error.value = e instanceof ApiRequestError ? errorText(e.mapped, "La réponse n'a pas pu être enregistrée.") : "La réponse n'a pas pu être enregistrée."
  } finally {
    busy.value = false
  }
}

const proposing = ref(false)
const form = reactive({ price: '', warrantyDays: '7', retention: '20' })
function startProposal() {
  const base = pending.value ?? offers.value[0]
  form.price = base ? String(Math.round(Number(base.price))) : ''
  form.warrantyDays = base ? String(base.warranty_days) : '7'
  form.retention = base ? String(base.retention_percentage) : '20'
  proposing.value = true
  error.value = ''
}
const preview = computed(() => {
  const price = Number(form.price.replace(/\s/g, '')) || 0
  return paymentSplit(price, Number(form.retention) || 0)
})
async function propose() {
  error.value = validateOffer(form) ?? ''
  if (error.value) return
  busy.value = true
  try {
    await api.submitOffer(props.request.id, { price: Number(form.price.replace(/\s/g, '')), warranty_days: Number(form.warrantyDays), retention_percentage: Number(form.retention) })
    proposing.value = false
    await load()
    emit('changed')
  } catch (e) {
    error.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'offre n'a pas pu être envoyée.") : "L'offre n'a pas pu être envoyée."
  } finally {
    busy.value = false
  }
}

function who(o: ArtisanOffer) {
  if (isMine(o, me.value)) return 'vous'
  return otherLabel.value
}
</script>

<template>
  <div class="mt-3.5">
    <p v-if="loading" class="m-0 text-[13px] text-[var(--text-muted)]">Chargement des offres…</p>
    <template v-else>
      <p v-if="!offers.length" class="m-0 text-[13px] text-[var(--text-muted)]">
        {{ side === 'requester' ? "Aucune offre pour l'instant : l'artisan propose son prix, sa garantie et la part retenue." : 'Proposez votre prix, votre garantie et la part retenue jusqu\'à la fin de la garantie.' }}
      </p>
      <div v-for="o in offers" :key="o.id" class="mb-2 rounded-md border p-3" :class="o.status === 'pending' ? 'border-warn-border bg-warn-bg' : o.status === 'accepted' ? 'border-ok-border bg-ok-bg' : 'border-[var(--border-subtle)] bg-white'">
        <div class="flex flex-wrap items-center gap-2">
          <p class="m-0 flex-1 text-[13.5px] font-bold">{{ formatFcfa(Number(o.price)) }} · garantie {{ o.warranty_days }} j · retenue {{ o.retention_percentage }} %</p>
          <CoreBadge :tone="OFFER_STATUS[o.status]?.tone ?? 'neutral'">{{ OFFER_STATUS[o.status]?.label ?? o.status }}</CoreBadge>
        </div>
        <p class="mb-0 mt-1 text-[12px] text-[var(--text-muted)]">Proposée par {{ who(o) }} le {{ new Date(o.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) }}</p>
        <div v-if="o.status === 'pending' && canNegotiate && !isMine(o, me)" class="mt-2 flex flex-wrap gap-2">
          <CoreButton size="sm" :disabled="busy" @click="respond(o, 'accept')">Accepter</CoreButton>
          <CoreButton size="sm" tone="secondary" :disabled="busy" @click="respond(o, 'reject')">Refuser</CoreButton>
          <CoreButton size="sm" tone="ghost" :disabled="busy" @click="startProposal">Contre-proposer</CoreButton>
        </div>
        <p v-else-if="o.status === 'pending' && isMine(o, me)" class="mb-0 mt-1.5 text-[12px] font-semibold text-warn-fg">En attente de la réponse de {{ otherLabel }}.</p>
      </div>

      <template v-if="canNegotiate">
        <div v-if="proposing" class="mt-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-page)] p-3.5">
          <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <label class="block"><span class="mb-1 block text-[11.5px] font-bold text-[var(--text-muted)]">Prix (F)</span><input v-model="form.price" inputmode="numeric" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 font-mono text-[13px] outline-none"></label>
            <label class="block"><span class="mb-1 block text-[11.5px] font-bold text-[var(--text-muted)]">Garantie (jours)</span><input v-model="form.warrantyDays" inputmode="numeric" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] outline-none"></label>
            <label class="block"><span class="mb-1 block text-[11.5px] font-bold text-[var(--text-muted)]">Retenue (%)</span><input v-model="form.retention" inputmode="numeric" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] outline-none"></label>
          </div>
          <p class="mb-0 mt-2 text-[12px] text-[var(--text-muted)]">Au paiement : {{ formatFcfa(preview.immediate) }} versés à l'artisan, {{ formatFcfa(preview.retained) }} retenus jusqu'à la fin de la garantie.</p>
          <div class="mt-2.5 flex gap-2">
            <CoreButton size="sm" :disabled="busy" @click="propose">Envoyer l'offre</CoreButton>
            <CoreButton size="sm" tone="secondary" @click="proposing = false">Annuler</CoreButton>
          </div>
        </div>
        <button v-else-if="!pending || isMine(pending, me)" type="button" class="mt-1 text-[12.5px] font-bold text-green-700" @click="startProposal">
          {{ offers.length ? (pending ? 'Modifier mon offre' : 'Faire une nouvelle offre') : side === 'artisan' ? 'Faire une offre' : 'Proposer un prix' }}
        </button>
      </template>
      <p v-if="error" class="mb-0 mt-2 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[12.5px] font-semibold text-danger-fg">{{ error }}</p>
    </template>
  </div>
</template>
