<script setup lang="ts">
import { CalendarClock, MessageSquare, Search, X } from '@lucide/vue'
import type { VisitSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { visitBucket, visitDate, visitExpired, visitMoved } from '~/utils/visits'

definePageMeta({ layout: 'locataire' })

const route = useRoute()
const router = useRouter()
const visitsApi = useVisitsApi()
const messagingApi = useMessagingApi()
const currentUser = useAuthUser()
const block = useFetchBlock(() => visitsApi.fetchMine('tenant'))

/** `?visit=<id>` (lien des notifications) : bon onglet + visite mise en évidence ; `?tab=` garde l'onglet. */
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

const tab = ref<'avenir' | 'passees'>(route.query.tab === 'passees' ? 'passees' : 'avenir')
watch(() => route.query.tab, t => { tab.value = t === 'passees' ? 'passees' : 'avenir' })
function setTab(v: string) {
  tab.value = v === 'passees' ? 'passees' : 'avenir'
  if (route.query.tab !== tab.value) router.replace({ query: { ...route.query, tab: tab.value } })
}
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
const tabOptions = computed(() => [
  { value: 'avenir', label: upcomingCount.value ? `À venir (${upcomingCount.value})` : 'À venir' },
  { value: 'passees', label: 'Passées' }
])

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
  const label = new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const actionError = ref('')
const flash = ref('')
const confirmCancelId = ref<string | null>(null)
const busyId = ref<string | null>(null)
async function cancelVisit(v: VisitSummary) {
  busyId.value = v.id
  actionError.value = ''
  try {
    await visitsApi.cancel(v.id)
    confirmCancelId.value = null
    flash.value = `Visite du ${whenOf(visitDate(v)).toLowerCase()} annulée. Le propriétaire en reçoit la notification.`
    await block.load()
  } catch (e) {
    // Une erreur serveur peut cacher une annulation enregistrée : on relit avant de dire quoi que ce soit.
    await block.load()
    const fresh = block.items.value.find(x => x.id === v.id)
    if (fresh?.status === 'cancelled') {
      confirmCancelId.value = null
      flash.value = 'Visite annulée.'
    } else if (!(e instanceof ApiRequestError) || !e.status || e.status >= 500) {
      actionError.value = "Le serveur a répondu par une erreur : vérifiez le statut de cette visite ci-dessous avant de réessayer."
    } else {
      actionError.value = errorText(e.mapped, 'Annulation impossible.')
    }
  } finally {
    busyId.value = null
  }
}
async function contactOwner(v: VisitSummary) {
  if (!v.landlord_id) return
  busyId.value = v.id
  actionError.value = ''
  try {
    const conv = await messagingApi.openConversation(v.unit_id, v.landlord_id)
    await navigateTo({ path: '/locataire/messages', query: { conversation: conv.id } })
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Impossible d'ouvrir la conversation.") : "Impossible d'ouvrir la conversation."
  } finally {
    busyId.value = null
  }
}
function listingOf(v: VisitSummary) {
  const pid = v.unit?.property_id ?? v.property_id
  return v.unit && pid ? `/biens/${pid}` : null
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5">
      <FormsSegmentedControl :model-value="tab" :options="tabOptions" size="sm" @update:model-value="setTab" />
    </div>

    <div v-if="flash" class="mb-4.5 flex items-start gap-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">
      <p class="m-0 flex-1">{{ flash }}</p>
      <button type="button" aria-label="Masquer" class="flex-none text-green-900/70 hover:text-green-900" @click="flash = ''"><X class="h-4 w-4" :stroke-width="1.9" /></button>
    </div>

    <div v-if="block.state.value === 'loading' || block.state.value === 'idle'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="90" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos visites pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <p v-if="actionError" class="mb-3.5 mt-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>
      <div v-if="!rows.length" class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-12 text-center">
        <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><CalendarClock class="h-5 w-5" :stroke-width="1.9" /></div>
        <p class="m-0 text-[13.5px] text-[var(--text-muted)]">{{ tab === 'avenir' ? 'Aucune visite à venir. Demandez-en une depuis l\'annonce d\'un logement : le propriétaire la confirme ici.' : 'Aucune visite passée.' }}</p>
        <NuxtLink v-if="tab === 'avenir'" to="/recherche" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-2 text-[13px] font-bold text-sand-900"><Search class="h-4 w-4" :stroke-width="1.9" />Trouver un logement à visiter</NuxtLink>
      </div>

      <article
        v-for="v in rows"
        :id="`visit-${v.id}`"
        :key="v.id"
        class="mb-3.5 rounded-2xl border bg-white p-5.5 transition-shadow"
        :class="highlighted === v.id ? 'border-green-600 shadow-raised ring-2 ring-green-600/15' : 'border-[var(--border-subtle)]'"
      >
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex h-[60px] w-[60px] flex-none flex-col items-center justify-center rounded-md bg-green-50">
            <span class="font-mono text-xl font-bold leading-none text-green-800">{{ dayOf(visitDate(v)) }}</span>
            <span class="mt-0.5 text-[11px] font-bold uppercase text-green-700">{{ monthOf(visitDate(v)) }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="m-0 text-[15px] font-bold">{{ v.unit?.name ?? 'Logement retiré de la plateforme' }}</h2>
              <CoreBadge :tone="statusOf(v).tone">{{ statusOf(v).label }}</CoreBadge>
            </div>
            <p v-if="v.unit?.property?.name" class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ v.unit.property.name }}</p>
            <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">{{ whenOf(visitDate(v)) }}</p>
          </div>
          <div v-if="isUpcoming(v)" class="flex flex-none flex-wrap gap-2">
            <CoreButton v-if="v.landlord_id" size="sm" tone="secondary" :disabled="busyId === v.id" @click="contactOwner(v)">
              <span class="inline-flex items-center gap-1.5"><MessageSquare class="h-4 w-4" :stroke-width="1.9" />Écrire au propriétaire</span>
            </CoreButton>
            <CoreButton v-if="confirmCancelId !== v.id" size="sm" tone="ghost" @click="confirmCancelId = v.id">Annuler</CoreButton>
          </div>
        </div>

        <p v-if="visitMoved(v) && v.status === 'confirmed'" class="mb-0 mt-3.5 rounded-md bg-info-bg px-3.5 py-2 text-[12.5px] text-info-fg-deep">
          Nouvel horaire fixé par le propriétaire — vous aviez demandé le {{ whenOf(v.requested_at).toLowerCase() }}.
        </p>
        <p v-if="v.status === 'rejected'" class="mb-0 mt-3 text-[12.5px] text-danger-fg [overflow-wrap:anywhere]">{{ v.rejection_reason ? `Motif : ${v.rejection_reason}` : 'Aucun motif précisé par le propriétaire.' }}</p>
        <p v-if="visitExpired(v)" class="mb-0 mt-3 text-[12.5px] text-[var(--text-muted)]">Le propriétaire n'a pas répondu avant la date. Vous pouvez redemander une visite depuis l'annonce.</p>
        <p v-if="v.note" class="mb-0 mt-2 line-clamp-4 text-[12.5px] text-[var(--text-secondary)] [overflow-wrap:anywhere]">Votre message : « {{ v.note }} »</p>

        <CoreInlineConfirm
          v-if="confirmCancelId === v.id"
          class="mt-3.5"
          tone="danger"
          message="Annuler cette visite ? Elle apparaîtra comme annulée chez le propriétaire, qui en reçoit la notification."
          confirm-label="Annuler la visite"
          cancel-label="Garder"
          :loading="busyId === v.id"
          @confirm="cancelVisit(v)"
          @cancel="confirmCancelId = null"
        />

        <div v-if="listingOf(v)" class="mt-3.5 flex flex-wrap items-center gap-2 border-t border-sand-200 pt-3.5">
          <!-- Suite naturelle d'une visite réalisée (Lot 51) : l'annonce s'ouvre sur la candidature. -->
          <NuxtLink v-if="v.status === 'completed'" :to="`${listingOf(v)}?unit=${v.unit_id}&candidature=1`" class="rounded-pill bg-[image:var(--action-primary)] px-4 py-[9px] text-[13px] font-bold text-white shadow-action">Déposer ma candidature</NuxtLink>
          <NuxtLink :to="listingOf(v) ?? ''" class="text-[12.5px] font-bold text-green-700">Voir l'annonce</NuxtLink>
        </div>
      </article>
    </template>
  </div>
</template>
