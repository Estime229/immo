<script setup lang="ts">
import { ClipboardCheck, DoorOpen, FileText } from '@lucide/vue'
import type { InventoryDetail, InventoryType, LeaseSummary } from '~/types/tenant'
import type { LandlordBookingSummary } from '~/types/landlordBookings'
import { leasePhase } from '~/utils/leases'
import { bookingPhase } from '~/utils/bookings'
import { awaitingMySignature, INVENTORY_STATUS_LABEL, INVENTORY_STATUS_TONE, pickInventory } from '~/utils/inventories'

definePageMeta({ layout: 'pro' })

const route = useRoute()
const leasesApi = useLeasesApi()
const bookingsApi = useLandlordBookingsApi()
const inventoriesApi = useInventoriesApi()
const authUser = useAuthUser()

interface EdlRow {
  key: string
  title: string
  meta: string
  tenant: string
  leaseId?: string
  bookingId?: string
  type: InventoryType
  inventory: InventoryDetail | null
  /** Réservation dont la retenue attend un état des lieux (`requires_booking_inventory`). */
  required?: boolean
}

function tenantName(p?: { first_name?: string | null; last_name?: string | null; email?: string }) {
  if (!p) return 'Locataire'
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Locataire'
}

const rows = ref<EdlRow[]>([])
const state = ref<'idle' | 'loading' | 'error' | 'empty' | 'success'>('idle')

/** Priorité d'affichage : ce qui attend une action de votre part d'abord. */
function rank(r: EdlRow) {
  if (!r.inventory) return r.required ? 0 : 2
  if (awaitingMySignature(r.inventory, false) || r.inventory.status === 'draft') return 1
  if (r.inventory.status === 'pending_signature') return 3
  return 4
}

/**
 * Pas d'endpoint « mes états des lieux » — reconstruit à partir des baux et
 * réservations réels. L'API peut créer un second état des lieux du même type
 * (constaté Lot 50) : `pickInventory` retient le plus avancé.
 */
async function load() {
  state.value = 'loading'
  try {
    const [leases, bookings] = await Promise.all([leasesApi.fetchMine(), bookingsApi.fetchMine()])
    const out: EdlRow[] = []
    const me = authUser.value?.id
    const leaseCandidates = leases.filter((l: LeaseSummary) => (l.tenant_id ?? l.tenant.id) !== me && ['awaiting_entry', 'active', 'notice', 'terminated', 'inconsistent'].includes(leasePhase(l)))
    await Promise.all(leaseCandidates.map(async l => {
      const invs = await inventoriesApi.fetchByLease(l.id).catch(() => [] as InventoryDetail[])
      const unit = l.unit?.name ?? 'logement supprimé'
      const phase = leasePhase(l)
      out.push({ key: `${l.id}-entry`, title: `Entrée — ${unit}`, meta: `Bail · ${tenantName(l.tenant)}`, tenant: tenantName(l.tenant), leaseId: l.id, type: 'entry', inventory: pickInventory(invs, 'entry') })
      // Sortie : dès le préavis (on la prépare avant le départ), ou si elle existe déjà.
      const exit = pickInventory(invs, 'exit')
      if (phase === 'notice' || phase === 'terminated' || exit) {
        out.push({ key: `${l.id}-exit`, title: `Sortie — ${unit}`, meta: phase === 'notice' ? `Préavis donné · ${tenantName(l.tenant)}` : `Bail · ${tenantName(l.tenant)}`, tenant: tenantName(l.tenant), leaseId: l.id, type: 'exit', inventory: exit })
      }
    }))
    const bookingCandidates = bookings.filter((b: LandlordBookingSummary) => b.status === 'confirmed')
    await Promise.all(bookingCandidates.map(async b => {
      const invs = await inventoriesApi.fetchByBooking(b.id).catch(() => [] as InventoryDetail[])
      const checkIn = new Date(b.check_in).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
      out.push({
        key: `${b.id}-entry`,
        title: `Arrivée du ${checkIn} — ${b.unit?.name ?? 'logement supprimé'}`,
        meta: `Séjour · ${tenantName(b.tenant)}`,
        tenant: tenantName(b.tenant),
        bookingId: b.id,
        type: 'entry',
        inventory: pickInventory(invs, 'entry'),
        required: !!b.unit?.requires_booking_inventory
      })
      // Départ : proposé dès le début du séjour (l'API l'accepte), pour constater l'état au check-out.
      const exit = pickInventory(invs, 'exit')
      const phase = bookingPhase(b)
      if (exit || phase === 'ongoing' || phase === 'past') {
        const checkOut = new Date(b.check_out).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
        out.push({ key: `${b.id}-exit`, title: `Départ du ${checkOut} — ${b.unit?.name ?? 'logement supprimé'}`, meta: `Séjour · ${tenantName(b.tenant)}`, tenant: tenantName(b.tenant), bookingId: b.id, type: 'exit', inventory: exit })
      }
    }))
    rows.value = out.sort((a, b) => rank(a) - rank(b))
    state.value = rows.value.length ? 'success' : 'empty'
    openFromQuery()
  } catch {
    state.value = 'error'
  }
}
onMounted(load)
onMounted(() => useLandlordEdlBadge().markAllSeen())

/**
 * `?inventory=` (notification), `?lease=…&type=…` (fiche du bail) ou `?booking=…&type=…`
 * (réservation dont la retenue attend l'état des lieux) ouvre directement l'état des lieux.
 * Suivi aussi quand on est déjà sur la page (clic de notification) ; un même lien ne rouvre pas deux fois.
 */
let lastQueryKey = ''
function openFromQuery() {
  const q = route.query
  const type = q.type === 'exit' ? 'exit' : 'entry'
  const key = [q.inventory, q.lease, q.booking, type].join('|')
  if (key === lastQueryKey || state.value === 'loading') return
  lastQueryKey = key
  const r = typeof q.inventory === 'string'
    ? rows.value.find(x => x.inventory?.id === q.inventory)
    : typeof q.lease === 'string'
      ? rows.value.find(x => x.leaseId === q.lease && x.type === type)
      : typeof q.booking === 'string'
        ? rows.value.find(x => x.bookingId === q.booking && x.type === type)
        : undefined
  if (r) {
    tab.value = category(r)
    editing.value = r
  } else if (typeof q.inventory === 'string' || typeof q.lease === 'string' || typeof q.booking === 'string') {
    queryMiss.value = true
  }
}
/** Lien vers un état des lieux qui n'est plus (ou pas encore) dans la liste : on le dit au lieu de ne rien faire. */
const queryMiss = ref(false)
watch(() => [route.query.inventory, route.query.lease, route.query.booking, route.query.type], () => {
  queryMiss.value = false
  if (state.value === 'success') openFromQuery()
})

function badge(r: EdlRow): { label: string; tone: 'ok' | 'warn' | 'neutral' | 'danger' } {
  if (!r.inventory) return r.required ? { label: 'Exigé', tone: 'danger' } : { label: 'À faire', tone: 'neutral' }
  if (awaitingMySignature(r.inventory, false)) return { label: 'À signer', tone: 'warn' }
  if (r.inventory.status === 'pending_signature') return { label: 'Chez le locataire', tone: 'warn' }
  return { label: INVENTORY_STATUS_LABEL[r.inventory.status] ?? r.inventory.status, tone: INVENTORY_STATUS_TONE[r.inventory.status] ?? 'neutral' }
}

/** Onglets : ce qui attend une action de votre part, ce qui attend le locataire, ce qui est signé (gardés dans l'URL). */
type EdlTab = 'todo' | 'waiting' | 'done'
const router = useRouter()
function tabFrom(v: unknown): EdlTab {
  return v === 'waiting' || v === 'done' ? v : 'todo'
}
const tab = ref<EdlTab>(tabFrom(route.query.onglet))
watch(tab, t => router.replace({ query: { ...route.query, onglet: t === 'todo' ? undefined : t } }))
const tabModel = computed({ get: () => tab.value as string, set: (v: string) => { tab.value = tabFrom(v) } })
function category(r: EdlRow): 'todo' | 'waiting' | 'done' {
  if (!r.inventory || r.inventory.status === 'draft' || awaitingMySignature(r.inventory, false)) return 'todo'
  return r.inventory.status === 'signed' ? 'done' : 'waiting'
}
const counts = computed(() => ({
  todo: rows.value.filter(r => category(r) === 'todo').length,
  waiting: rows.value.filter(r => category(r) === 'waiting').length,
  done: rows.value.filter(r => category(r) === 'done').length
}))
const shown = computed(() => rows.value.filter(r => category(r) === tab.value))
const tabOptions = computed(() => [
  { value: 'todo', label: `À faire · ${counts.value.todo}` },
  { value: 'waiting', label: `Chez le locataire · ${counts.value.waiting}` },
  { value: 'done', label: `Signés · ${counts.value.done}` }
])

const editing = ref<EdlRow | null>(null)
function onSaved() {
  load()
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="state === 'loading' && !rows.length" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="70" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos états des lieux pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <ProEmptyPanel v-else-if="state === 'empty'" :icon="ClipboardCheck" title="Aucun état des lieux à faire" text="Un état des lieux se rattache à un bail signé ou à un séjour confirmé. Il apparaîtra ici dès que l'un des deux existe.">
      <NuxtLink to="/pro/baux" class="inline-flex items-center rounded-md border border-[var(--border-default)] bg-white px-5 py-3 text-[14px] font-bold text-sand-900">Voir mes baux</NuxtLink>
    </ProEmptyPanel>

    <template v-else>
      <p class="mb-4.5 mt-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Faites l'état des lieux d'entrée à la remise des clés et celui de sortie au départ, idéalement ensemble : chacun signe sur son téléphone. Une fois signé des deux côtés, il ne peut plus être modifié.
      </p>
      <p v-if="queryMiss" class="mb-4 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[13px] font-semibold text-warn-fg">
        L'état des lieux demandé par le lien n'est pas dans votre liste : le bail ou le séjour n'est peut-être plus actif.
      </p>
      <div class="mb-4.5 max-w-full overflow-x-auto">
        <FormsSegmentedControl v-model="tabModel" :options="tabOptions" size="sm" class="whitespace-nowrap" />
      </div>
      <p v-if="!shown.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        {{ tab === 'todo' ? 'Rien à faire pour l\'instant : tout est envoyé ou signé.' : tab === 'waiting' ? 'Aucun état des lieux en attente du locataire.' : 'Aucun état des lieux signé pour l\'instant.' }}
      </p>
      <section v-else class="rounded-2xl border border-[var(--border-subtle)] bg-white px-5.5 py-2">
        <div v-for="r in shown" :key="r.key" class="flex flex-wrap items-center gap-3 border-b border-sand-200 py-3.5 last:border-b-0">
          <div class="grid h-10 w-10 flex-none place-items-center rounded-md" :class="r.inventory?.status === 'signed' ? 'bg-ok-bg text-ok-fg' : r.inventory ? 'bg-warn-bg text-warn-fg' : 'bg-sand-200 text-[var(--text-secondary)]'">
            <DoorOpen v-if="r.type === 'exit'" class="h-4.5 w-4.5" :stroke-width="1.9" />
            <ClipboardCheck v-else class="h-4.5 w-4.5" :stroke-width="1.9" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="m-0 text-sm font-bold">{{ r.title }}</p>
              <CoreBadge :tone="badge(r).tone">{{ badge(r).label }}</CoreBadge>
            </div>
            <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">
              {{ r.meta }}<template v-if="r.required && !r.inventory"> · la retenue du séjour n'est versée qu'une fois l'état des lieux fait</template>
            </p>
          </div>
          <div class="flex flex-none items-center gap-1">
            <NuxtLink v-if="r.leaseId" :to="`/pro/baux/${r.leaseId}`" class="inline-flex items-center gap-1 rounded-pill px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-sand-100"><FileText class="h-3.5 w-3.5" :stroke-width="1.9" />Bail</NuxtLink>
            <NuxtLink v-else-if="r.bookingId" :to="{ path: '/pro/reservations', query: { booking: r.bookingId } }" class="inline-flex items-center gap-1 rounded-pill px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-sand-100">Séjour</NuxtLink>
            <CoreButton size="sm" tone="secondary" @click="editing = r">{{ r.inventory ? 'Ouvrir' : 'Commencer' }}</CoreButton>
          </div>
        </div>
      </section>
    </template>

    <ProEdlEditorModal
      v-if="editing"
      :inventory="editing.inventory"
      :lease-id="editing.leaseId"
      :booking-id="editing.bookingId"
      :type="editing.type"
      :title="editing.title"
      :tenant-name="editing.tenant"
      @close="editing = null"
      @saved="onSaved"
    />
  </div>
</template>
