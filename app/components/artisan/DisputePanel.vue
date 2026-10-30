<script setup lang="ts">
import { Scale, ShieldCheck } from '@lucide/vue'
import type { ArtisanRequestSummary, DisputeResolution } from '~/types/artisan'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { canDispute, disputeSplit, validateRefund, warrantyLine } from '~/utils/artisanRequests'

/**
 * Garantie et litige d'une intervention, communs aux deux espaces (Lot 54) —
 * toute la mécanique existait côté API sans aucun écran. Pendant la garantie,
 * le demandeur signale un problème ; la part retenue est gelée ; chacun
 * propose un partage ; l'autre accepte et la demande se clôture.
 */
const props = defineProps<{ request: ArtisanRequestSummary; side: 'requester' | 'artisan' }>()
const emit = defineEmits<{ changed: [] }>()

const api = useArtisanRequestsApi()
const authUser = useAuthUser()
const me = computed(() => authUser.value?.id)

const retained = computed(() => Number(props.request.retained_amount ?? 0))
const disputed = computed(() => !!props.request.disputed_at && props.request.status === 'completed')
const disputedOn = computed(() => (props.request.disputed_at ? new Date(props.request.disputed_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''))
const resolutions = ref<DisputeResolution[]>([])
const resolutionsState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const busy = ref(false)
const error = ref('')
const notice = ref('')

async function loadResolutions() {
  if (!props.request.disputed_at) return
  resolutionsState.value = 'loading'
  try {
    resolutions.value = (await api.listResolutions(props.request.id)).sort((a, b) => b.created_at.localeCompare(a.created_at))
    resolutionsState.value = 'success'
  } catch {
    resolutionsState.value = 'error'
  }
}
onMounted(loadResolutions)
watch(() => props.request.disputed_at, loadResolutions)

const pendingResolution = computed(() => resolutions.value.find(r => r.status === 'pending') ?? null)
const otherLabel = computed(() => (props.side === 'requester' ? "l'artisan" : 'le demandeur'))

/* ---- Ouvrir un litige (demandeur) ---- */
const opening = ref(false)
const reason = ref('')
async function openDispute() {
  if (reason.value.trim().length < 10) { error.value = 'Décrivez le problème en quelques mots (10 caractères au moins).'; return }
  busy.value = true
  error.value = ''
  try {
    await api.openDispute(props.request.id, reason.value.trim())
    opening.value = false
    emit('changed')
  } catch (e) {
    error.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le problème n'a pas pu être signalé.") : "Le problème n'a pas pu être signalé."
  } finally {
    busy.value = false
  }
}

/* ---- Proposer / accepter un partage ---- */
const refund = ref('')
const split = computed(() => disputeSplit(retained.value, Number(refund.value.replace(/\s/g, '')) || 0))
async function propose() {
  error.value = validateRefund(refund.value, retained.value) ?? ''
  if (error.value) return
  busy.value = true
  notice.value = ''
  confirmingId.value = null
  try {
    await api.proposeResolution(props.request.id, Number(refund.value.replace(/\s/g, '')))
    refund.value = ''
    notice.value = `Proposition envoyée : ${otherLabel.value} peut l'accepter ou faire une contre-proposition.`
    await loadResolutions()
  } catch (e) {
    error.value = e instanceof ApiRequestError ? errorText(e.mapped, "La proposition n'a pas pu être envoyée.") : "La proposition n'a pas pu être envoyée."
  } finally {
    busy.value = false
  }
}
/* Accepter un partage clôt la demande : confirmation en ligne, montants rappelés. */
const confirmingId = ref<string | null>(null)
function acceptMessage(r: DisputeResolution) {
  const s = disputeSplit(retained.value, Number(r.requester_refund_amount))
  const parts = props.side === 'artisan'
    ? `vous recevez ${formatFcfa(s.artisan)}, ${formatFcfa(s.requester)} sont rendus au demandeur`
    : `vous récupérez ${formatFcfa(s.requester)}, ${formatFcfa(s.artisan)} sont versés à l'artisan`
  return `Accepter ce partage ? ${parts.charAt(0).toUpperCase()}${parts.slice(1)}. Le litige est clos et la demande clôturée : ce choix est définitif.`
}
async function accept(r: DisputeResolution) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await api.acceptResolution(r.id)
    confirmingId.value = null
    notice.value = 'Partage accepté : le litige est clos et la demande clôturée.'
    emit('changed')
  } catch (e) {
    error.value = e instanceof ApiRequestError ? errorText(e.mapped, "La proposition n'a pas pu être acceptée.") : "La proposition n'a pas pu être acceptée."
  } finally {
    busy.value = false
  }
}
function mine(r: DisputeResolution) {
  return r.proposed_by === me.value
}
function formatLong(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}
</script>

<template>
  <div class="mt-4">
    <p v-if="notice" class="mb-3 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ notice }}</p>

    <!-- Garantie en cours, sans litige -->
    <div v-if="request.status === 'completed' && !disputed" class="rounded-md border border-ok-border bg-ok-bg px-3.5 py-3 text-[13px] leading-[1.55] text-green-900">
      <p class="m-0 inline-flex items-center gap-1.5 font-bold"><ShieldCheck class="h-4 w-4 flex-none" :stroke-width="1.9" aria-hidden="true" />Terminée le {{ request.completed_at ? formatLong(request.completed_at) : '—' }}<template v-if="warrantyLine(request)"> · {{ warrantyLine(request) }}</template></p>
      <p v-if="retained" class="mb-0 mt-1">
        <span class="font-mono font-bold">{{ formatFcfa(retained) }}</span> restent retenus par Immo : {{ side === 'requester' ? 'ils seront versés à l\'artisan à la fin de la garantie, sauf si vous signalez un problème d\'ici là.' : 'ils vous seront versés à la fin de la garantie, sauf si le demandeur signale un problème.' }}
      </p>
      <template v-if="side === 'requester' && canDispute(request)">
        <div v-if="opening" class="mt-2.5">
          <textarea v-model="reason" rows="3" maxlength="1000" placeholder="Ce qui ne va pas (ex. la fuite est revenue deux jours après)…" class="w-full resize-none rounded-md border border-[var(--border-default)] bg-white p-2.5 text-[13px] text-[var(--text-primary)] outline-none" />
          <p class="mb-0 mt-1 text-[12px]">La part retenue sera gelée jusqu'à ce que vous trouviez un accord avec l'artisan.</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <CoreButton size="sm" tone="danger" :disabled="busy" @click="openDispute">Signaler le problème</CoreButton>
            <CoreButton size="sm" tone="secondary" @click="opening = false">Annuler</CoreButton>
          </div>
        </div>
        <button v-else type="button" class="mt-2 font-bold text-danger-fg underline" @click="opening = true; error = ''">Signaler un problème</button>
      </template>
    </div>

    <!-- Litige -->
    <div v-else-if="disputed" class="rounded-md border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] text-danger-fg-deep">
      <p class="m-0 inline-flex items-center gap-1.5 font-bold text-danger-fg"><Scale class="h-4 w-4 flex-none" :stroke-width="1.9" aria-hidden="true" />Litige ouvert le {{ disputedOn }}</p>
      <p v-if="request.dispute_reason" class="mb-0 mt-1 [overflow-wrap:anywhere]">« {{ request.dispute_reason }} »</p>
      <p class="mb-0 mt-1.5 text-[12.5px] leading-[1.55]"><span class="font-mono font-bold">{{ formatFcfa(retained) }}</span> sont gelés. Mettez-vous d'accord sur leur partage : la proposition acceptée par l'autre partie clôt la demande.</p>

      <p v-if="resolutionsState === 'loading'" class="mb-0 mt-2.5 text-[12.5px]">Chargement des propositions…</p>
      <p v-else-if="resolutionsState === 'error'" class="mb-0 mt-2.5 rounded-sm bg-white px-2.5 py-2 text-[12.5px] font-semibold text-danger-fg">
        Impossible de charger les propositions de partage.
        <button type="button" class="ml-1 font-bold underline" @click="loadResolutions">Réessayer</button>
      </p>

      <div v-for="r in resolutions" :key="r.id" class="mt-2 rounded-sm bg-white px-3 py-2.5 text-[12.5px] text-[var(--text-secondary)]">
        <div class="flex flex-wrap items-center gap-2">
          <span class="min-w-0 flex-1">
            {{ mine(r) ? 'Vous proposez' : `${otherLabel.charAt(0).toUpperCase()}${otherLabel.slice(1)} propose` }} :
            <strong class="font-mono">{{ formatFcfa(disputeSplit(retained, Number(r.requester_refund_amount)).requester) }}</strong> rendus au demandeur,
            <strong class="font-mono">{{ formatFcfa(disputeSplit(retained, Number(r.requester_refund_amount)).artisan) }}</strong> à l'artisan
          </span>
          <CoreBadge :tone="r.status === 'pending' ? 'warn' : r.status === 'accepted' ? 'ok' : 'neutral'">{{ r.status === 'pending' ? 'En attente' : r.status === 'accepted' ? 'Acceptée' : 'Remplacée' }}</CoreBadge>
        </div>
        <template v-if="r.status === 'pending' && !mine(r)">
          <CoreInlineConfirm
            v-if="confirmingId === r.id"
            class="mt-2"
            :message="acceptMessage(r)"
            confirm-label="Accepter"
            :loading="busy"
            @confirm="accept(r)"
            @cancel="confirmingId = null"
          />
          <CoreButton v-else size="sm" class="mt-2" :disabled="busy" @click="confirmingId = r.id; error = ''">Accepter ce partage</CoreButton>
        </template>
      </div>

      <div class="mt-2.5 rounded-sm bg-white px-3 py-2.5 text-[var(--text-primary)]">
        <p class="m-0 text-[12.5px] font-bold">{{ pendingResolution && !mine(pendingResolution) ? 'Ou faites une contre-proposition' : 'Proposer un partage' }}</p>
        <div class="mt-1.5 flex flex-wrap items-center gap-2">
          <input v-model="refund" inputmode="numeric" :placeholder="`Rendu au demandeur (0 à ${retained})`" aria-label="Montant rendu au demandeur, en FCFA" class="h-10 min-w-0 flex-1 basis-[180px] rounded-sm border border-[var(--border-default)] bg-[var(--surface-input)] px-2.5 font-mono text-[13px] outline-none">
          <CoreButton size="sm" tone="secondary" :disabled="busy || !refund.trim()" @click="propose">Proposer</CoreButton>
        </div>
        <p v-if="refund" class="mb-0 mt-1 text-[12px] text-[var(--text-muted)]">Demandeur : <span class="font-mono">{{ formatFcfa(split.requester) }}</span> · artisan : <span class="font-mono">{{ formatFcfa(split.artisan) }}</span></p>
      </div>
      <p class="mb-0 mt-2 text-[12px] text-danger-fg-deep">
        Sans accord, l'équipe Immo peut trancher :
        <NuxtLink :to="{ path: '/contact', query: { sujet: 'Problème de paiement' } }" class="font-bold underline">contacter Immo</NuxtLink>.
      </p>
    </div>

    <!-- Clôturée -->
    <p v-else-if="request.status === 'closed'" class="m-0 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3.5 py-3 text-[13px] text-[var(--text-secondary)]">
      Clôturée le {{ request.closed_at ? formatLong(request.closed_at) : '—' }}{{ request.disputed_at ? ' après accord sur le litige' : retained ? ', part retenue versée à l\'artisan' : '' }}.
    </p>
    <p v-if="error" class="mb-0 mt-2 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ error }}</p>
  </div>
</template>
