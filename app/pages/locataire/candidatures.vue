<script setup lang="ts">
import type { LeaseSummary, RentalRequestSummary } from '~/types/tenant'
import { CANDIDATURE_LABEL, CANDIDATURE_TONE, draftLeaseFor } from '~/utils/rentalRequests'
import { leasePhase } from '~/utils/leases'

definePageMeta({ layout: 'locataire' })

const route = useRoute()
const rentalApi = useRentalRequestsApi()
const leasesApi = useLeasesApi()
const authUser = useAuthUser()

const requests = ref<RentalRequestSummary[]>([])
const leases = ref<LeaseSummary[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')
const highlight = typeof route.query.request === 'string' ? route.query.request : null

async function load() {
  state.value = 'loading'
  try {
    const [r, l] = await Promise.all([rentalApi.fetchMine('tenant'), leasesApi.fetchMine().catch(() => [] as LeaseSummary[])])
    requests.value = r
    leases.value = l
    state.value = 'ready'
    if (highlight) nextTick(() => document.getElementById(`request-${highlight}`)?.scrollIntoView({ block: 'center' }))
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const tab = ref<'open' | 'closed'>('open')
const open = computed(() => requests.value.filter(r => r.status !== 'rejected'))
const closed = computed(() => requests.value.filter(r => r.status === 'rejected'))
const shown = computed(() => (tab.value === 'open' ? open.value : closed.value))
watch(requests, list => {
  if (highlight && list.find(r => r.id === highlight)?.status === 'rejected') tab.value = 'closed'
})

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function listingLink(r: RentalRequestSummary) {
  const pid = r.unit?.property_id ?? r.unit?.property?.id
  return pid ? `/biens/${pid}?unit=${r.unit_id}` : null
}
/** Où en est le bail né de la candidature : le texte suit (brouillon → à signer → entrée → actif). */
function leaseStep(r: RentalRequestSummary): string {
  const l = draftLeaseFor(leases.value, r.unit_id, authUser.value?.id ?? r.tenant_id)
  switch (l ? leasePhase(l) : 'draft') {
    case 'awaiting_tenant': return 'Le propriétaire vous a envoyé le bail : lisez-le et signez-le.'
    case 'awaiting_entry': return "Bail signé : il reste le paiement d'entrée pour l'activer."
    case 'active':
    case 'notice': return 'Votre bail est actif.'
    default: return "Le propriétaire prépare le bail. Vous le lirez et le signerez dès qu'il vous l'aura envoyé."
  }
}
function leaseLink(r: RentalRequestSummary) {
  const l = draftLeaseFor(leases.value, r.unit_id, authUser.value?.id ?? r.tenant_id)
  return l ? `/locataire/bail?lease=${l.id}` : '/locataire/bail'
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="state === 'loading'" class="flex flex-col gap-3">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="110" :lines="1" />
    </div>
    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos candidatures pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>
    <FeedbackEmptyState
      v-else-if="!requests.length"
      title="Aucune candidature pour l'instant"
      description="Un logement vous plaît après la visite ? Depuis son annonce, « Déposer ma candidature » : le propriétaire vous répond ici."
    />

    <template v-else>
      <div class="mb-4 flex gap-1.5 self-start rounded-pill bg-sand-200 p-1" style="width: fit-content">
        <button type="button" class="rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold" :class="tab === 'open' ? 'bg-white shadow-sm' : 'text-[var(--text-muted)]'" @click="tab = 'open'">En cours ({{ open.length }})</button>
        <button type="button" class="rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold" :class="tab === 'closed' ? 'bg-white shadow-sm' : 'text-[var(--text-muted)]'" @click="tab = 'closed'">Non retenues ({{ closed.length }})</button>
      </div>
      <p v-if="!shown.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-8 text-center text-[13.5px] text-[var(--text-muted)]">
        {{ tab === 'open' ? 'Aucune candidature en cours.' : 'Aucune candidature non retenue.' }}
      </p>

      <div
        v-for="r in shown"
        :id="`request-${r.id}`"
        :key="r.id"
        class="mb-3.5 rounded-2xl border bg-white p-5"
        :class="r.id === highlight ? 'border-green-600 ring-2 ring-green-600/20' : 'border-[var(--border-subtle)]'"
      >
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="m-0 text-base font-bold tracking-[-.015em]">{{ r.unit?.name ?? 'Logement supprimé' }}<template v-if="r.unit?.property?.name"> — {{ r.unit.property.name }}</template></p>
            <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">
              <template v-if="r.unit">{{ formatFcfa(Number(r.unit.price)) }} / mois · </template>envoyée le {{ formatDate(r.created_at) }}<template v-if="r.desired_move_in_at"> · emménagement souhaité le {{ formatDate(r.desired_move_in_at) }}</template>
            </p>
          </div>
          <CoreBadge :tone="CANDIDATURE_TONE[r.status]">{{ CANDIDATURE_LABEL[r.status] }}</CoreBadge>
        </div>
        <p v-if="r.message" class="mb-0 mt-3 rounded-md bg-[var(--surface-page)] p-3 text-[13px] leading-[1.55] text-[var(--text-secondary)] [overflow-wrap:anywhere]">« {{ r.message }} »</p>

        <p v-if="r.status === 'pending'" class="mb-0 mt-3 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
          Le propriétaire n'a pas encore répondu. Pour retirer votre candidature, écrivez-lui : l'application ne permet pas encore de la retirer vous-même.
        </p>
        <div v-else-if="r.status === 'accepted'" class="mt-3 rounded-md border border-ok-border bg-ok-bg p-3.5 text-[13px] leading-[1.55] text-green-900">
          <p class="m-0 font-bold">Retenue le {{ formatDate(r.responded_at) }} ✓</p>
          <p class="mb-0 mt-1">{{ leaseStep(r) }}</p>
        </div>
        <p v-else class="mb-0 mt-3 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
          Non retenue{{ r.responded_at ? ` le ${formatDate(r.responded_at)}` : '' }} : le propriétaire a choisi un autre candidat ou décliné.
        </p>

        <div class="mt-3.5 flex flex-wrap gap-2.5">
          <NuxtLink v-if="r.status === 'accepted'" :to="leaseLink(r)" class="rounded-sm bg-[image:var(--action-primary)] px-4 py-2.5 text-[12.5px] font-bold text-white">Voir mon bail</NuxtLink>
          <NuxtLink v-if="r.conversation_id" :to="`/locataire/messages?conversation=${r.conversation_id}`" class="rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold">Conversation</NuxtLink>
          <NuxtLink v-if="listingLink(r)" :to="listingLink(r) ?? ''" class="rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold">Voir l'annonce</NuxtLink>
        </div>
      </div>
    </template>
  </div>
</template>
