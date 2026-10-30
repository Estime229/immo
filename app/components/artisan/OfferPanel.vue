<script setup lang="ts">
import type { ArtisanOffer, ArtisanRequestSummary } from '~/types/artisan'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { isMine, OFFER_STATUS, paymentSplit, pendingOffer, validateOffer } from '~/utils/artisanRequests'

/**
 * Négociation d'une intervention, commune aux deux espaces (Lot 54). L'API
 * permet aux deux parties de proposer (une nouvelle offre remplace la
 * précédente) et seule l'autre partie répond. Accepter ou refuser passe par
 * une confirmation en ligne qui rappelle le montant ; le formulaire est celui
 * de la modale « Faire une offre » (ArtisanOfferForm).
 */
const props = defineProps<{ request: ArtisanRequestSummary; side: 'requester' | 'artisan' }>()
const emit = defineEmits<{ changed: [] }>()

const api = useArtisanRequestsApi()
const authUser = useAuthUser()
const me = computed(() => authUser.value?.id)

const offers = ref<ArtisanOffer[]>([])
const loadState = ref<'loading' | 'success' | 'error'>('loading')
const busy = ref(false)
const error = ref('')
const notice = ref('')
async function load() {
  loadState.value = 'loading'
  try {
    offers.value = (await api.listOffers(props.request.id)).sort((a, b) => b.created_at.localeCompare(a.created_at))
    loadState.value = 'success'
  } catch {
    loadState.value = 'error'
  }
}
onMounted(load)

const pending = computed(() => pendingOffer(offers.value))
const canNegotiate = computed(() => props.request.status === 'open')
const otherLabel = computed(() => (props.side === 'requester' ? "l'artisan" : 'le demandeur'))

/* ---- Accepter / refuser : confirmation en ligne, montant rappelé ---- */
const confirming = ref<{ id: string; action: 'accept' | 'reject' } | null>(null)
function confirmMessage(o: ArtisanOffer, action: 'accept' | 'reject') {
  const price = Number(o.price)
  const { immediate, retained } = paymentSplit(price, o.retention_percentage)
  if (action === 'reject') {
    return `Refuser l'offre à ${formatFcfa(price)} ? La négociation reste ouverte : une nouvelle offre pourra être faite.`
  }
  const money = retained > 0
    ? `${formatFcfa(immediate)} versés au paiement, ${formatFcfa(retained)} retenus pendant ${o.warranty_days} jours de garantie`
    : `${formatFcfa(price)} versés au paiement, sans retenue`
  return props.side === 'requester'
    ? `Accepter l'offre à ${formatFcfa(price)} ? Le prix est fixé et il vous restera à la payer (${money}).`
    : `Accepter le prix de ${formatFcfa(price)} ? Il devient définitif ; le demandeur doit ensuite payer (${money}).`
}

async function respond(o: ArtisanOffer, action: 'accept' | 'reject') {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await api.respondOffer(o.id, action)
    confirming.value = null
    notice.value = action === 'accept'
      ? (props.side === 'requester' ? `Offre acceptée à ${formatFcfa(Number(o.price))} : il reste à la payer pour lancer l'intervention.` : `Prix accepté à ${formatFcfa(Number(o.price))} : le demandeur doit maintenant payer.`)
      : 'Offre refusée. La négociation reste ouverte : vous pouvez faire une nouvelle offre.'
    await load()
    emit('changed')
  } catch (e) {
    error.value = e instanceof ApiRequestError ? errorText(e.mapped, "La réponse n'a pas pu être enregistrée.") : "La réponse n'a pas pu être enregistrée."
  } finally {
    busy.value = false
  }
}

/* ---- Proposer / contre-proposer ---- */
const proposing = ref(false)
const form = reactive({ price: '', warrantyDays: '7', retention: '20' })
function startProposal() {
  const base = pending.value ?? offers.value[0]
  form.price = base ? String(Math.round(Number(base.price))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : ''
  form.warrantyDays = base ? String(base.warranty_days) : '7'
  form.retention = base ? String(base.retention_percentage) : '20'
  confirming.value = null
  proposing.value = true
  error.value = ''
  notice.value = ''
}
async function propose() {
  error.value = validateOffer(form) ?? ''
  if (error.value) return
  busy.value = true
  try {
    await api.submitOffer(props.request.id, { price: Number(form.price.replace(/\s/g, '')), warranty_days: Number(form.warrantyDays), retention_percentage: Number(form.retention) })
    proposing.value = false
    notice.value = `Offre envoyée : ${otherLabel.value} peut l'accepter, la refuser ou contre-proposer.`
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
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
</script>

<template>
  <div class="mt-4">
    <div v-if="loadState === 'loading'" class="flex flex-col gap-2">
      <DataSkeletonCard :height="64" :lines="0" />
    </div>
    <div v-else-if="loadState === 'error'" class="rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">
      Impossible de charger les offres.
      <button type="button" class="ml-1 font-bold underline" @click="load">Réessayer</button>
    </div>
    <template v-else>
      <p v-if="notice" class="mb-3 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ notice }}</p>

      <p v-if="!offers.length && !proposing" class="m-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        {{ side === 'requester' ? "Aucune offre pour l'instant : l'artisan propose son prix, sa garantie et la part retenue." : "Aucune offre envoyée : proposez votre prix, votre garantie et la part retenue jusqu'à la fin de la garantie." }}
      </p>

      <div v-for="o in offers" :key="o.id" class="mb-2 rounded-md border px-3.5 py-3" :class="o.status === 'pending' ? 'border-warn-border bg-warn-bg' : o.status === 'accepted' ? 'border-ok-border bg-ok-bg' : 'border-[var(--border-subtle)] bg-white'">
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p class="m-0 font-mono text-[15px] font-bold text-green-900">{{ formatFcfa(Number(o.price)) }}</p>
          <CoreBadge :tone="OFFER_STATUS[o.status]?.tone ?? 'neutral'">{{ OFFER_STATUS[o.status]?.label ?? 'Offre' }}</CoreBadge>
        </div>
        <p class="mb-0 mt-1 text-[12.5px] text-[var(--text-secondary)]">
          Garantie <span class="font-mono">{{ o.warranty_days }}</span> j · retenue <span class="font-mono">{{ o.retention_percentage }}</span> %
        </p>
        <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Proposée par {{ who(o) }} le <span class="font-mono">{{ formatDay(o.created_at) }}</span></p>

        <template v-if="o.status === 'pending' && canNegotiate && !isMine(o, me)">
          <CoreInlineConfirm
            v-if="confirming?.id === o.id"
            class="mt-2.5"
            :tone="confirming.action === 'reject' ? 'danger' : 'warning'"
            :message="confirmMessage(o, confirming.action)"
            :confirm-label="confirming.action === 'accept' ? 'Accepter' : 'Refuser'"
            :loading="busy"
            @confirm="confirming && respond(o, confirming.action)"
            @cancel="confirming = null"
          />
          <div v-else class="mt-2.5 flex flex-wrap gap-2">
            <CoreButton size="sm" :disabled="busy" @click="confirming = { id: o.id, action: 'accept' }; error = ''">Accepter</CoreButton>
            <CoreButton size="sm" tone="secondary" :disabled="busy" @click="startProposal">Contre-proposer</CoreButton>
            <CoreButton size="sm" tone="ghost" :disabled="busy" @click="confirming = { id: o.id, action: 'reject' }; error = ''">Refuser</CoreButton>
          </div>
        </template>
        <p v-else-if="o.status === 'pending' && isMine(o, me)" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-warn-fg">En attente de la réponse de {{ otherLabel }}.</p>
      </div>

      <template v-if="canNegotiate">
        <div v-if="proposing" class="mt-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-page)] p-4">
          <p class="mb-3 mt-0 text-sm font-bold">{{ pending && !isMine(pending, me) ? 'Votre contre-proposition' : offers.length ? 'Nouvelle offre' : 'Votre offre' }}</p>
          <ArtisanOfferForm v-model:price="form.price" v-model:warrantyDays="form.warrantyDays" v-model:retention="form.retention" :side="side" :error="error" />
          <div class="mt-3.5 flex flex-wrap gap-2">
            <CoreButton size="sm" :disabled="busy || !form.price.trim()" @click="propose">{{ busy ? 'Envoi…' : "Envoyer l'offre" }}</CoreButton>
            <CoreButton size="sm" tone="secondary" :disabled="busy" @click="proposing = false; error = ''">Annuler</CoreButton>
          </div>
        </div>
        <CoreButton v-else-if="!pending || isMine(pending, me)" size="sm" :tone="offers.length ? 'secondary' : 'primary'" class="mt-1" @click="startProposal">
          {{ offers.length ? (pending ? 'Modifier mon offre' : 'Faire une nouvelle offre') : side === 'artisan' ? 'Faire une offre' : 'Proposer un prix' }}
        </CoreButton>
      </template>
      <p v-if="error && !proposing" class="mb-0 mt-2 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ error }}</p>
    </template>
  </div>
</template>
