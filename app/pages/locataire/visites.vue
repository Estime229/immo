<script setup lang="ts">
import type { VisitSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { visitBucket, visitDate, visitExpired, visitMoved } from '~/utils/visits'

definePageMeta({ layout: 'locataire' })

const route = useRoute()
const visitsApi = useVisitsApi()
const messagingApi = useMessagingApi()
const currentUser = useAuthUser()
const block = useFetchBlock(() => visitsApi.fetchMine('tenant'))

/** `?visit=<id>` (lien des notifications) : bon onglet + visite mise en évidence. */
const highlighted = ref(String(route.query.visit ?? ''))
onMounted(async () => {
  await block.load()
  focusFromQuery()
})
watch(() => route.query.visit, async id => {
  highlighted.value = String(id ?? '')
  await block.load()
  focusFromQuery()
})
function focusFromQuery() {
  const v = block.items.value.find(x => x.id === highlighted.value)
  if (!v) return
  tab.value = isUpcoming(v) ? 'avenir' : 'passees'
  nextTick(() => document.getElementById(`visit-${v.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}

const tab = ref<'avenir' | 'passees'>('avenir')
function isUpcoming(v: VisitSummary) {
  const b = visitBucket(v)
  return b === 'todo' || b === 'upcoming'
}
/** À venir : le plus proche d'abord ; passées : le plus récent d'abord. */
const rows = computed(() => block.items.value
  .filter(v => (tab.value === 'avenir' ? isUpcoming(v) : !isUpcoming(v)))
  .sort((a, b) => {
    const d = new Date(visitDate(a)).getTime() - new Date(visitDate(b)).getTime()
    return tab.value === 'avenir' ? d : -d
  }))
const upcomingCount = computed(() => block.items.value.filter(isUpcoming).length)

function statusOf(v: VisitSummary): { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  if (visitExpired(v)) return { label: 'Restée sans réponse', tone: 'neutral' }
  switch (v.status) {
    case 'pending': return { label: 'En attente du propriétaire', tone: 'warn' }
    case 'confirmed': return visitBucket(v) === 'upcoming' ? { label: 'Confirmée', tone: 'ok' } : { label: 'Passée', tone: 'neutral' }
    case 'rejected': return { label: 'Refusée', tone: 'danger' }
    case 'cancelled': return { label: v.cancelled_by && v.cancelled_by !== currentUser.value?.id ? 'Annulée par le propriétaire' : 'Annulée par vous', tone: 'neutral' }
    default: return { label: 'Réalisée', tone: 'neutral' }
  }
}

function dayOf(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit' })
}
function monthOf(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'short' })
}
function whenOf(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

const actionError = ref('')
const confirmCancelId = ref<string | null>(null)
const busyId = ref<string | null>(null)
async function cancelVisit(v: VisitSummary) {
  busyId.value = v.id
  actionError.value = ''
  try {
    await visitsApi.cancel(v.id)
    confirmCancelId.value = null
    await block.load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Annulation impossible.') : 'Annulation impossible.'
  } finally {
    busyId.value = null
  }
}
async function contactOwner(v: VisitSummary) {
  if (!v.landlord_id) return
  busyId.value = v.id
  actionError.value = ''
  try {
    const conv = await messagingApi.createConversation(v.unit_id, v.landlord_id)
    await navigateTo(`/locataire/messages?conversation=${conv.id}`)
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Impossible d'ouvrir la conversation.") : "Impossible d'ouvrir la conversation."
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex w-fit gap-[5px] rounded-pill bg-sand-200 p-1">
      <button type="button" class="rounded-pill px-5 py-2.5 text-[13.5px] font-bold transition-all" :class="tab === 'avenir' ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'" @click="tab = 'avenir'">À venir<template v-if="upcomingCount"> ({{ upcomingCount }})</template></button>
      <button type="button" class="rounded-pill px-5 py-2.5 text-[13.5px] font-bold transition-all" :class="tab === 'passees' ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'" @click="tab = 'passees'">Passées</button>
    </div>

    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="90" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos visites pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <p v-if="actionError" class="mb-3.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>
      <div v-if="!rows.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        <p class="m-0">{{ tab === 'avenir' ? 'Aucune visite à venir.' : 'Aucune visite passée.' }}</p>
        <NuxtLink v-if="tab === 'avenir'" to="/recherche" class="mt-3 inline-block font-bold text-green-700">Trouver un logement à visiter →</NuxtLink>
      </div>

      <div
        v-for="v in rows"
        :id="`visit-${v.id}`"
        :key="v.id"
        class="mb-3.5 rounded-xl border bg-white p-5 transition-shadow"
        :class="highlighted === v.id ? 'border-green-600 shadow-raised' : 'border-[var(--border-subtle)]'"
      >
        <div class="flex flex-wrap items-center gap-4.5">
          <div class="flex h-16 w-16 flex-none flex-col items-center justify-center rounded-md bg-green-50">
            <span class="font-display text-xl font-extrabold leading-none text-green-800">{{ dayOf(visitDate(v)) }}</span>
            <span class="text-[11px] font-bold uppercase text-green-700">{{ monthOf(visitDate(v)) }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <p class="m-0 text-[15.5px] font-bold">{{ v.unit?.name ?? 'Logement retiré de la plateforme' }}</p>
              <CoreBadge :tone="statusOf(v).tone">{{ statusOf(v).label }}</CoreBadge>
            </div>
            <p v-if="v.unit?.property?.name" class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-faint)]">{{ v.unit.property.name }}</p>
            <p class="mb-0 mt-1.5 text-[13.5px] text-[var(--text-muted)] first-letter:uppercase">{{ whenOf(visitDate(v)) }}</p>
          </div>
          <div v-if="isUpcoming(v)" class="flex flex-none flex-wrap gap-2">
            <CoreButton v-if="v.landlord_id" size="sm" tone="secondary" :disabled="busyId === v.id" @click="contactOwner(v)">Écrire au propriétaire</CoreButton>
            <CoreButton size="sm" tone="secondary" @click="confirmCancelId = v.id">Annuler</CoreButton>
          </div>
        </div>

        <p v-if="visitMoved(v) && v.status === 'confirmed'" class="mb-0 mt-3 rounded-md bg-info-bg px-3.5 py-2 text-[12.5px] text-info-fg-deep">
          Nouvel horaire fixé par le propriétaire — vous aviez demandé le <span>{{ whenOf(v.requested_at) }}</span>.
        </p>
        <p v-if="v.status === 'rejected'" class="mb-0 mt-3 text-[12.5px] text-danger-fg [overflow-wrap:anywhere]">{{ v.rejection_reason ? `Motif : ${v.rejection_reason}` : 'Aucun motif précisé par le propriétaire.' }}</p>
        <p v-if="visitExpired(v)" class="mb-0 mt-3 text-[12.5px] text-[var(--text-muted)]">Le propriétaire n'a pas répondu avant la date. Vous pouvez redemander une visite depuis l'annonce.</p>
        <p v-if="v.note" class="mb-0 mt-2 line-clamp-4 text-[12.5px] text-[var(--text-secondary)] [overflow-wrap:anywhere]">Votre message : « {{ v.note }} »</p>
        <NuxtLink v-if="v.unit && (v.unit.property_id ?? v.property_id)" :to="`/biens/${v.unit.property_id ?? v.property_id}`" class="mt-2 inline-block text-[12.5px] font-bold text-green-700">Voir l'annonce →</NuxtLink>

        <div v-if="confirmCancelId === v.id" class="mt-3 flex flex-wrap items-center gap-2.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5">
          <p class="m-0 flex-1 text-[13px] font-semibold text-warn-fg-deep">Annuler cette visite ? Le propriétaire sera prévenu.</p>
          <CoreButton size="sm" tone="danger" :disabled="busyId === v.id" @click="cancelVisit(v)">{{ busyId === v.id ? '…' : 'Oui, annuler' }}</CoreButton>
          <CoreButton size="sm" tone="secondary" @click="confirmCancelId = null">Non</CoreButton>
        </div>
      </div>
    </template>
  </div>
</template>
