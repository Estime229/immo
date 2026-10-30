<script setup lang="ts">
import { ChevronRight, FileText, Plus } from '@lucide/vue'
import type { LeaseSummary } from '~/types/tenant'
import { cancelUnpaidState, leasePhase, LEASE_PHASE_LABEL, LEASE_PHASE_TONE, noticeDepartureDate, RENT_SUFFIX } from '~/utils/leases'

definePageMeta({ layout: 'pro' })

const leasesApi = useLeasesApi()
const authUser = useAuthUser()
/** Côté pro, seulement les baux où l'on n'est pas le locataire (un propriétaire peut aussi louer ailleurs). */
const block = useFetchBlock(async () => (await leasesApi.fetchMine()).filter(l => (l.tenant_id ?? l.tenant.id) !== authUser.value?.id))
onMounted(block.load)
onMounted(() => useLandlordBauxBadge().markAllSeen())

const ACCENT: Record<string, string> = {
  draft: 'border-l-[var(--border-default)]',
  awaiting_tenant: 'border-l-clay-500',
  awaiting_entry: 'border-l-clay-500',
  active: 'border-l-green-600',
  notice: 'border-l-clay-500',
  terminated: 'border-l-[var(--border-default)]',
  cancelled_unpaid: 'border-l-[var(--border-default)]',
  inconsistent: 'border-l-danger-fg'
}

/* ---- Onglets, gardés dans l'URL (?onglet=termines) ---- */
const route = useRoute()
const router = useRouter()
const tab = ref<'current' | 'closed'>(route.query.onglet === 'termines' ? 'closed' : 'current')
watch(tab, t => router.replace({ query: { ...route.query, onglet: t === 'closed' ? 'termines' : undefined } }))
watch(() => route.query.onglet, v => { tab.value = v === 'termines' ? 'closed' : 'current' })
const tabModel = computed({ get: () => tab.value as string, set: (v: string) => { tab.value = v === 'closed' ? 'closed' : 'current' } })
const closedPhases = ['terminated', 'cancelled_unpaid']
const current = computed(() => block.items.value.filter(l => !closedPhases.includes(leasePhase(l))))
const closed = computed(() => block.items.value.filter(l => closedPhases.includes(leasePhase(l))))
const shown = computed(() => (tab.value === 'current' ? current.value : closed.value))
const tabs = computed(() => [
  { value: 'current', label: `En cours · ${current.value.length}` },
  { value: 'closed', label: `Terminés · ${closed.value.length}` }
])

function tenantName(l: LeaseSummary) {
  return `${l.tenant.first_name ?? ''} ${l.tenant.last_name ?? ''}`.trim() || 'Locataire'
}
function fmtDate(iso: string) {
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Ce que le propriétaire doit savoir ou faire, en une ligne. */
function nextLine(l: LeaseSummary): string {
  switch (leasePhase(l)) {
    case 'draft': return 'À relire puis envoyer au locataire.'
    case 'awaiting_tenant': return 'Envoyé — en attente de la signature du locataire.'
    case 'awaiting_entry': {
      const u = cancelUnpaidState(l)
      return u?.allowed ? "Entrée toujours impayée après 72 h : vous pouvez annuler le bail." : `Entrée non payée${u ? ` — annulable dans ${u.hoursLeft} h si rien ne bouge` : ''}.`
    }
    case 'notice': {
      const d = noticeDepartureDate(l)
      return d ? `Départ prévu le ${fmtDate(d)} : préparez l'état des lieux de sortie.` : 'Préavis donné.'
    }
    case 'active': {
      const late = (l.invoices ?? []).some(i => i.status === 'overdue')
      return late ? 'Une échéance est en retard.' : l.next_billing_date ? `Prochaine échéance le ${fmtDate(l.next_billing_date)}.` : 'Bail en cours.'
    }
    case 'terminated': return l.end_date ? `Terminé le ${fmtDate(l.end_date)}.` : 'Terminé.'
    case 'cancelled_unpaid': return "Annulé : l'entrée n'a pas été payée."
    case 'inconsistent': return 'Statut incohérent — contactez le support.'
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="110" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos baux pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <ProEmptyPanel v-else-if="block.state.value === 'empty'" :icon="FileText" title="Aucun bail pour l'instant" text="Après une visite ou une candidature retenue, créez le bail : le locataire le signe en ligne, paie son entrée, et les loyers sont suivis ici.">
      <NuxtLink to="/pro/baux/nouveau" class="inline-flex items-center gap-1.5 rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-[14px] font-bold text-white shadow-action"><Plus class="h-4 w-4" :stroke-width="1.9" />Créer un bail</NuxtLink>
    </ProEmptyPanel>

    <template v-else>
      <div class="mb-4.5 flex flex-wrap items-center gap-2.5">
        <FormsSegmentedControl v-model="tabModel" :options="tabs" size="sm" />
        <NuxtLink to="/pro/baux/nouveau" class="ml-auto inline-flex items-center gap-1.5 rounded-pill bg-[image:var(--action-primary)] px-4 py-[9px] text-[13px] font-bold text-white shadow-action"><Plus class="h-4 w-4" :stroke-width="1.9" />Créer un bail</NuxtLink>
      </div>

      <p v-if="!shown.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        {{ tab === 'current' ? 'Aucun bail en cours : les baux terminés sont dans l\'autre onglet.' : 'Aucun bail terminé pour l\'instant.' }}
      </p>

      <NuxtLink
        v-for="l in shown"
        :key="l.id"
        :to="`/pro/baux/${l.id}`"
        class="group mb-3.5 block rounded-2xl border border-l-4 border-[var(--border-subtle)] bg-white p-5 transition-shadow hover:shadow-raised"
        :class="ACCENT[leasePhase(l)]"
        data-testid="lease-card"
      >
        <div class="flex items-center gap-3.5">
          <CoreAvatar :name="tenantName(l)" :size="40" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="m-0 text-[15px] font-bold tracking-[-.01em] group-hover:text-green-700">{{ tenantName(l) }}</p>
              <CoreBadge :tone="LEASE_PHASE_TONE[leasePhase(l)]">{{ LEASE_PHASE_LABEL[leasePhase(l)] }}</CoreBadge>
            </div>
            <p class="mb-0 mt-1 text-xs text-[var(--text-faint)]">
              {{ l.unit?.name ?? 'Logement supprimé' }}<template v-if="l.property"> · {{ l.property.name }}</template> · <span class="font-mono">{{ formatFcfa(Number(l.signed_rent)) }} {{ RENT_SUFFIX[l.billing_frequency ?? 'monthly'] }}</span> · <span class="font-mono">{{ fmtDate(l.start_date) }}{{ l.end_date ? ` au ${fmtDate(l.end_date)}` : '' }}</span>
            </p>
            <p class="mb-0 mt-1.5 text-[13.5px] font-semibold text-[var(--text-secondary)]">{{ nextLine(l) }}</p>
          </div>
          <ChevronRight class="h-5 w-5 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
        </div>
      </NuxtLink>
    </template>
  </div>
</template>
