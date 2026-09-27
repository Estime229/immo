<script setup lang="ts">
import type { BookingSummary, InventoryDetail } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { bookingPhase } from '~/utils/bookings'
import { awaitingMySignature, compareItem, entryStates, exitDegradations, INVENTORY_STATUS_LABEL, INVENTORY_STATUS_TONE, INVENTORY_TYPE_LABEL, inventoryChanged, itemStateLabel, itemStateTone, meterConsumption, pickInventory } from '~/utils/inventories'

definePageMeta({ layout: 'locataire' })

const route = useRoute()
const { activeLease, leases, state: leaseState, ensureLoaded, selectLease } = useTenantLeases()
const inventoriesApi = useInventoriesApi()
const bookingsApi = useBookingsApi()
const doc = useOpenDocument()
const photos = useInventoryPhotos()

interface Row { inv: InventoryDetail; context: string }

const leaseRows = ref<Row[]>([])
const bookingRows = ref<Row[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')
const openId = ref<string | null>(typeof route.query.inventory === 'string' ? route.query.inventory : null)

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

async function loadLease() {
  const l = activeLease.value
  leaseRows.value = []
  if (!l) return
  const invs = await inventoriesApi.fetchByLease(l.id)
  leaseRows.value = invs
    .sort((a, b) => (a.type === b.type ? b.updated_at.localeCompare(a.updated_at) : a.type === 'entry' ? -1 : 1))
    .map(inv => ({ inv, context: `Bail — ${l.unit?.name ?? 'logement'}` }))
}

/**
 * Séjours courts : l'hôte prépare l'état des lieux d'arrivée et l'envoie ;
 * jusqu'ici le voyageur n'avait aucun écran pour le lire ni le signer.
 * Séjours confirmés en cours, à venir ou terminés depuis moins de 30 jours.
 */
async function loadBookings() {
  const all = await bookingsApi.fetchMine().catch(() => [] as BookingSummary[])
  const limit = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const relevant = all.filter(b => b.status === 'confirmed' && (bookingPhase(b) !== 'past' || b.check_out.slice(0, 10) >= limit))
  const rows = await Promise.all(relevant.map(async b => {
    const invs = await inventoriesApi.fetchByBooking(b.id).catch(() => [] as InventoryDetail[])
    return invs.map(inv => ({ inv, context: `Séjour du ${shortDate(b.check_in)} au ${shortDate(b.check_out)} — ${b.unit?.name ?? 'logement'}` }))
  }))
  bookingRows.value = rows.flat()
}

async function load() {
  state.value = 'loading'
  try {
    await Promise.all([loadLease(), loadBookings()])
    state.value = 'ready'
    // Lien direct (notification) : on déplie l'état des lieux visé.
    if (!openId.value) openId.value = [...leaseRows.value, ...bookingRows.value].find(r => awaitingMySignature(r.inv, true))?.inv.id ?? null
  } catch {
    state.value = 'error'
  }
}

onMounted(async () => {
  await ensureLoaded()
  const id = typeof route.query.lease === 'string' ? route.query.lease : null
  if (id && leases.value.some(l => l.id === id)) selectLease(id)
  load()
})
watch(() => activeLease.value?.id, (id, old) => { if (old && id !== old) load() })

const rows = computed(() => [...leaseRows.value, ...bookingRows.value])

function toggle(id: string) {
  openId.value = openId.value === id ? null : id
}

/* ---- Sortie comparée à l'entrée du même bail ou séjour (Lot 52) ---- */
function entryFor(inv: InventoryDetail): InventoryDetail | null {
  if (inv.type !== 'exit') return null
  const same = rows.value.map(r => r.inv).filter(i => (inv.lease_id ? i.lease_id === inv.lease_id : i.booking_id === inv.booking_id))
  return pickInventory(same, 'entry')
}
function comparison(inv: InventoryDetail, room: string, item: string, state: string) {
  const e = entryFor(inv)
  return e ? compareItem(entryStates(e.rooms), room, item, state) : null
}
function degradationsOf(inv: InventoryDetail) {
  const e = entryFor(inv)
  return e ? exitDegradations(inv.rooms, e.rooms) : []
}
function consumptionOf(inv: InventoryDetail) {
  const e = entryFor(inv)
  return e ? meterConsumption(e.meter_readings, inv.meter_readings) : null
}
function hasConsumption(inv: InventoryDetail) {
  const c = consumptionOf(inv)
  return !!c && (c.electricity !== null || c.water !== null)
}
function range(n?: number) {
  return Array.from({ length: n ?? 0 }, (_, k) => k)
}

/* ---- Signature (tracé réel, imprimé sur le PDF) ---- */
const signatures = ref<Record<string, string>>({})
const pads = ref<Record<string, { rememberIfAsked: () => Promise<void> } | null>>({})
const signingId = ref<string | null>(null)
const signError = ref('')
async function sign(inv: InventoryDetail) {
  const signature = signatures.value[inv.id]
  if (!signature) return
  signingId.value = inv.id
  signError.value = ''
  try {
    // Le propriétaire peut encore modifier tant que personne n'a signé : on vérifie qu'on signe bien ce qui est affiché.
    const fresh = await inventoriesApi.fetchOne(inv.id)
    if (inventoryChanged(inv, fresh)) {
      for (const list of [leaseRows, bookingRows]) list.value = list.value.map(r => (r.inv.id === fresh.id ? { ...r, inv: fresh } : r))
      signError.value = "Le propriétaire vient de modifier cet état des lieux : relisez-le, puis signez."
      return
    }
    const updated = await inventoriesApi.sign(inv.id, signature)
    for (const list of [leaseRows, bookingRows]) {
      list.value = list.value.map(r => (r.inv.id === updated.id ? { ...r, inv: updated } : r))
    }
    await pads.value[inv.id]?.rememberIfAsked()
  } catch (e) {
    signError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La signature a échoué.') : 'La signature a échoué.'
  } finally {
    signingId.value = null
  }
}

const docError = ref('')
async function openPdf(inv: InventoryDetail) {
  const url = `/pdf/inventories/${inv.id}`
  docError.value = (await doc.open(inv.id, url, url)) ?? ''
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="leaseState === 'loading' || state === 'loading'" class="flex flex-col gap-3">
      <DataSkeletonCard :height="120" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos états des lieux pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <FeedbackEmptyState
      v-else-if="!rows.length"
      title="Aucun état des lieux pour l'instant"
      :description="activeLease ? 'Le propriétaire le remplit à la remise des clés, puis vous l\'envoie : vous le relirez et le signerez ici.' : 'Il apparaîtra ici dès qu\'un propriétaire ou un hôte vous en enverra un.'"
    />

    <template v-else>
      <p class="mb-4 mt-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        L'état des lieux décrit le logement à votre arrivée et à votre départ. Relisez-le avant de signer : c'est la référence en cas de désaccord sur la caution.
      </p>
      <p v-if="signError" class="mb-3.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ signError }}</p>
      <p v-if="docError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ docError }}</p>

      <div v-for="{ inv, context } in rows" :key="inv.id" class="mb-3.5 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white">
        <button type="button" class="flex w-full items-center gap-3.5 px-5.5 py-4.5 text-left" @click="toggle(inv.id)">
          <span class="text-[13px] text-[var(--text-faint)] transition-transform" :class="openId === inv.id ? 'rotate-90' : 'rotate-0'">▶</span>
          <span class="min-w-0 flex-1">
            <span class="block text-base font-bold tracking-[-.015em]">{{ INVENTORY_TYPE_LABEL[inv.type] ?? inv.type }}</span>
            <span class="mt-0.5 block truncate text-[12.5px] text-[var(--text-muted)]">{{ context }}</span>
          </span>
          <CoreBadge :tone="awaitingMySignature(inv, true) ? 'warn' : INVENTORY_STATUS_TONE[inv.status]">
            {{ awaitingMySignature(inv, true) ? 'À signer' : inv.status === 'draft' ? 'En préparation' : INVENTORY_STATUS_LABEL[inv.status] }}
          </CoreBadge>
        </button>

        <div v-if="openId === inv.id" class="px-5.5 pb-5">
          <p v-if="inv.status === 'draft'" class="m-0 text-[13px] text-[var(--text-muted)]">Le propriétaire est en train de le remplir. Vous pourrez le relire et le signer dès qu'il vous l'aura envoyé.</p>
          <p v-if="inv.signed_at" class="m-0 text-[13px] text-[var(--text-muted)]">Signé par les deux parties le {{ formatDate(inv.signed_at) }}.</p>
          <p v-if="inv.general_comment" class="mb-0 mt-2.5 text-[13.5px] leading-[1.55] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{{ inv.general_comment }}</p>
          <p v-if="inv.meter_readings?.electricity || inv.meter_readings?.water" class="mb-0 mt-2.5 text-[12.5px] text-[var(--text-muted)]">
            <template v-if="inv.meter_readings.electricity">Électricité : {{ inv.meter_readings.electricity }}</template>
            <template v-if="inv.meter_readings.electricity && inv.meter_readings.water"> · </template>
            <template v-if="inv.meter_readings.water">Eau : {{ inv.meter_readings.water }}</template>
          </p>
          <p v-if="inv.status !== 'draft' && !inv.rooms.length" class="mb-0 mt-3.5 text-[13px] text-[var(--text-muted)]">Aucune pièce détaillée.</p>
          <div v-if="inv.type === 'exit' && inv.status !== 'draft' && entryFor(inv)" class="mt-3.5 rounded-md border p-3.5" :class="degradationsOf(inv).length ? 'border-danger-border bg-danger-bg' : 'border-[var(--border-subtle)] bg-[var(--surface-page)]'">
            <p class="m-0 text-[13px] font-bold" :class="degradationsOf(inv).length ? 'text-danger-fg' : ''">
              {{ degradationsOf(inv).length ? `${degradationsOf(inv).length} élément${degradationsOf(inv).length > 1 ? 's' : ''} noté${degradationsOf(inv).length > 1 ? 's' : ''} en moins bon état qu'à l'entrée` : "Rien n'est noté en moins bon état qu'à l'entrée" }}
            </p>
            <ul v-if="degradationsOf(inv).length" class="mb-0 mt-1.5 list-disc pl-5 text-[12.5px] text-danger-fg">
              <li v-for="d in degradationsOf(inv)" :key="`${d.room}|${d.item}`">{{ d.room }} · {{ d.item }} : {{ itemStateLabel(d.from) }} → {{ itemStateLabel(d.to) }}</li>
            </ul>
            <p v-if="hasConsumption(inv)" class="mb-0 mt-1.5 text-[12.5px] text-[var(--text-muted)]">
              Consommation depuis l'entrée :<template v-if="consumptionOf(inv)?.electricity !== null"> électricité {{ consumptionOf(inv)?.electricity }}</template><template v-if="consumptionOf(inv)?.water !== null"> · eau {{ consumptionOf(inv)?.water }}</template>
            </p>
          </div>
          <template v-if="inv.status !== 'draft'">
            <div v-for="(room, ri) in inv.rooms" :key="ri" class="mt-3.5 border-t border-sand-200 pt-3.5">
              <p class="m-0 text-[14.5px] font-bold">{{ room.name }}</p>
              <div v-for="(item, i) in room.items" :key="i" class="mt-2.5">
                <div class="flex items-center gap-2.5">
                  <p class="m-0 flex-1 text-[13.5px] font-semibold">{{ item.name || 'Élément' }}</p>
                  <CoreBadge :tone="itemStateTone(item.state)">{{ itemStateLabel(item.state) }}</CoreBadge>
                </div>
                <p v-if="item.comment" class="mb-0 mt-1 text-[13px] text-[var(--text-muted)] [overflow-wrap:anywhere]">{{ item.comment }}</p>
                <p v-if="comparison(inv, room.name, item.name, item.state)?.entryState" class="mb-0 mt-1 text-[11.5px]" :class="comparison(inv, room.name, item.name, item.state)?.degraded ? 'font-bold text-danger-fg' : 'text-[var(--text-faint)]'">
                  À l'entrée : {{ itemStateLabel(comparison(inv, room.name, item.name, item.state)?.entryState ?? '') }}
                </p>
                <EdlPhotoStrip v-if="item.photo_count" :api="photos" :inventory-id="inv.id" :origin="{ ri, ii: i }" :existing="range(item.photo_count)" />
              </div>
            </div>
          </template>

          <div v-if="awaitingMySignature(inv, true)" class="mt-4.5 rounded-xl border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-5">
            <p class="m-0 text-[14.5px] font-bold text-clay-700">Votre signature est attendue</p>
            <p class="mb-3.5 mt-2 text-[13px] leading-[1.6] text-clay-900">
              En signant, vous reconnaissez l'état décrit ci-dessus. S'il ne correspond pas à ce que vous constatez, ne signez pas : écrivez d'abord au propriétaire.
            </p>
            <FormsSignaturePad :ref="(el: any) => { pads[inv.id] = el }" v-model="signatures[inv.id]" />
            <CoreButton tone="accent" class="mt-3.5" :disabled="signingId === inv.id || !signatures[inv.id]" @click="sign(inv)">{{ signingId === inv.id ? 'Signature…' : "Signer l'état des lieux" }}</CoreButton>
          </div>
          <p v-else-if="inv.status === 'pending_signature'" class="mt-4.5 text-[13px] text-[var(--text-muted)]">Vous avez signé — en attente de la signature du propriétaire.</p>

          <button v-if="inv.status !== 'draft'" type="button" class="mt-4 text-[13px] font-bold text-green-700 underline disabled:opacity-60" :disabled="doc.loadingKey.value === inv.id" @click="openPdf(inv)">
            {{ doc.loadingKey.value === inv.id ? 'Génération du PDF…' : 'Télécharger le PDF' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
