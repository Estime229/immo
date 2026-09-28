<script setup lang="ts">
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

/** `?inventory=` (notification) ou `?lease=…&type=…` (fiche du bail) ouvre directement l'état des lieux. */
let queryHandled = false
function openFromQuery() {
  if (queryHandled) return
  queryHandled = true
  const q = route.query
  const r = typeof q.inventory === 'string'
    ? rows.value.find(x => x.inventory?.id === q.inventory)
    : typeof q.lease === 'string'
      ? rows.value.find(x => x.leaseId === q.lease && x.type === (q.type === 'exit' ? 'exit' : 'entry'))
      : undefined
  if (r) {
    tab.value = category(r)
    editing.value = r
  }
}

function badge(r: EdlRow): { label: string; tone: 'ok' | 'warn' | 'neutral' | 'danger' } {
  if (!r.inventory) return r.required ? { label: 'Exigé', tone: 'danger' } : { label: 'À faire', tone: 'neutral' }
  if (awaitingMySignature(r.inventory, false)) return { label: 'À signer', tone: 'warn' }
  if (r.inventory.status === 'pending_signature') return { label: 'Chez le locataire', tone: 'warn' }
  return { label: INVENTORY_STATUS_LABEL[r.inventory.status] ?? r.inventory.status, tone: INVENTORY_STATUS_TONE[r.inventory.status] ?? 'neutral' }
}

/** Onglets : ce qui attend une action de votre part, ce qui attend le locataire, ce qui est signé. */
const tab = ref<'todo' | 'waiting' | 'done'>('todo')
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

const editing = ref<EdlRow | null>(null)
function onSaved() {
  load()
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="state === 'loading' && !rows.length" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="70" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos états des lieux pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="state === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucun bail signé ni séjour confirmé pour l'instant : un état des lieux se rattache à l'un des deux.
    </p>

    <template v-else>
      <p class="mb-4 mt-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Faites l'état des lieux d'entrée à la remise des clés et celui de sortie au départ, idéalement ensemble : chacun signe sur son téléphone. Une fois signé des deux côtés, il ne peut plus être modifié.
      </p>
      <div class="mb-4 flex gap-1.5 rounded-pill bg-sand-200 p-1" style="width: fit-content">
        <button type="button" class="rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold" :class="tab === 'todo' ? 'bg-white shadow-sm' : 'text-[var(--text-muted)]'" @click="tab = 'todo'">À faire ({{ counts.todo }})</button>
        <button type="button" class="rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold" :class="tab === 'waiting' ? 'bg-white shadow-sm' : 'text-[var(--text-muted)]'" @click="tab = 'waiting'">Chez le locataire ({{ counts.waiting }})</button>
        <button type="button" class="rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold" :class="tab === 'done' ? 'bg-white shadow-sm' : 'text-[var(--text-muted)]'" @click="tab = 'done'">Signés ({{ counts.done }})</button>
      </div>
      <p v-if="!shown.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-8 text-center text-[13.5px] text-[var(--text-muted)]">
        {{ tab === 'todo' ? 'Rien à faire pour l\'instant.' : tab === 'waiting' ? 'Aucun état des lieux en attente du locataire.' : 'Aucun état des lieux signé.' }}
      </p>
      <div v-else class="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white p-2">
        <div v-for="r in shown" :key="r.key" class="flex flex-wrap items-center gap-3.5 border-b border-sand-200 p-3.5 last:border-b-0">
          <div class="grid h-10 w-10 flex-none place-items-center rounded-md text-[15px]" :class="r.inventory?.status === 'signed' ? 'bg-ok-bg' : r.inventory ? 'bg-warn-bg' : 'bg-sand-200'">
            {{ r.type === 'exit' ? '⇤' : '☑' }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="m-0 text-[14.5px] font-bold">{{ r.title }}</p>
            <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">
              {{ r.meta }}<template v-if="r.required && !r.inventory"> · la retenue du séjour n'est versée qu'une fois l'état des lieux fait</template>
            </p>
          </div>
          <CoreBadge :tone="badge(r).tone">{{ badge(r).label }}</CoreBadge>
          <NuxtLink v-if="r.leaseId" :to="`/pro/baux/${r.leaseId}`" class="text-[12.5px] font-bold text-[var(--text-muted)] underline">Bail</NuxtLink>
          <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold" @click="editing = r">{{ r.inventory ? 'Ouvrir' : 'Commencer' }}</button>
        </div>
      </div>
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
