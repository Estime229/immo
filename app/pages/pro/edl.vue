<script setup lang="ts">
import type { InventoryDetail, InventoryType, LeaseSummary } from '~/types/tenant'
import type { LandlordBookingSummary } from '~/types/landlordBookings'

definePageMeta({ layout: 'pro' })

const leasesApi = useLeasesApi()
const bookingsApi = useLandlordBookingsApi()
const inventoriesApi = useInventoriesApi()

interface EdlRow {
  key: string
  title: string
  meta: string
  leaseId?: string
  bookingId?: string
  type: InventoryType
  inventory: InventoryDetail | null
}

function tenantName(p?: { first_name?: string | null; last_name?: string | null; email?: string }) {
  if (!p) return 'Locataire'
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Locataire'
}

const rows = ref<EdlRow[]>([])
const state = ref<'idle' | 'loading' | 'error' | 'empty' | 'success'>('idle')

/** Pas d'endpoint « mes états des lieux » — reconstruit à partir des baux et réservations réels, un par un. */
async function load() {
  state.value = 'loading'
  try {
    const [leases, bookings] = await Promise.all([leasesApi.fetchMine(), bookingsApi.fetchMine()])
    const out: EdlRow[] = []

    const leaseCandidates = leases.filter((l: LeaseSummary) => ['signed', 'active', 'terminated'].includes(l.status))
    await Promise.all(leaseCandidates.map(async l => {
      const invs = await inventoriesApi.fetchByLease(l.id).catch(() => [])
      out.push({ key: `${l.id}-entry`, title: `Entrée — ${l.unit.name}`, meta: `Bail · ${tenantName(l.tenant)}`, leaseId: l.id, type: 'entry', inventory: invs.find(i => i.type === 'entry') ?? null })
      if (l.status === 'terminated') {
        out.push({ key: `${l.id}-exit`, title: `Sortie — ${l.unit.name}`, meta: `Bail clos · ${tenantName(l.tenant)}`, leaseId: l.id, type: 'exit', inventory: invs.find(i => i.type === 'exit') ?? null })
      }
    }))

    const bookingCandidates = bookings.filter((b: LandlordBookingSummary) => b.status === 'confirmed')
    await Promise.all(bookingCandidates.map(async b => {
      const invs = await inventoriesApi.fetchByBooking(b.id).catch(() => [])
      const checkIn = new Date(b.check_in).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
      out.push({ key: `${b.id}-entry`, title: `Réservation du ${checkIn}`, meta: `Séjour · ${tenantName(b.tenant)}`, bookingId: b.id, type: 'entry', inventory: invs.find(i => i.type === 'entry') ?? null })
    }))

    rows.value = out.sort((a, b) => (a.inventory ? 0 : 1) - (b.inventory ? 0 : 1))
    state.value = rows.value.length ? 'success' : 'empty'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const STATUS_LABEL: Record<string, string> = { draft: 'Brouillon', pending_signature: 'En attente', signed: 'Signé' }
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'neutral'> = { draft: 'neutral', pending_signature: 'warn', signed: 'ok' }

const editing = ref<EdlRow | null>(null)
function openRow(r: EdlRow) {
  editing.value = r
}
function onSaved() {
  editing.value = null
  load()
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="state === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="70" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos états des lieux pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="state === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucun bail signé ni réservation confirmée pour l'instant — un état des lieux se rattache à l'un des deux.
    </p>

    <template v-else>
      <div class="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white p-2">
        <div v-for="r in rows" :key="r.key" class="flex items-center gap-3.5 border-b border-sand-200 p-3.5 last:border-b-0">
          <div class="grid h-10 w-10 flex-none place-items-center rounded-md text-[15px]" :class="r.inventory?.status === 'signed' ? 'bg-ok-bg' : r.inventory ? 'bg-warn-bg' : 'bg-sand-200'">
            {{ r.type === 'exit' ? '⇤' : '☑' }}
          </div>
          <div class="flex-1">
            <p class="m-0 text-[14.5px] font-bold">{{ r.title }}</p>
            <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">{{ r.meta }}</p>
          </div>
          <CoreBadge :tone="r.inventory ? STATUS_TONE[r.inventory.status] : 'neutral'">{{ r.inventory ? STATUS_LABEL[r.inventory.status] : 'Non créé' }}</CoreBadge>
          <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold" @click="openRow(r)">{{ r.inventory ? 'Ouvrir' : 'Créer' }}</button>
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
      @close="editing = null"
      @saved="onSaved"
    />
  </div>
</template>
