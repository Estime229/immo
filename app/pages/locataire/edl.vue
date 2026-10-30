<script setup lang="ts">
import { ChevronRight, ClipboardCheck, FileText, MessageSquare } from '@lucide/vue'
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
const messagingApi = useMessagingApi()
const doc = useOpenDocument()
const photos = useInventoryPhotos()

/** `unitId` / `otherId` : pour « Écrire au propriétaire » (ou à l'hôte) depuis l'état des lieux. */
interface Row { inv: InventoryDetail; context: string; unitId: string | null; otherId: string | null; host: boolean }

const leaseRows = ref<Row[]>([])
const bookingRows = ref<Row[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')
/** Chaque source a son propre échec : l'une peut manquer sans vider l'autre, et ça se voit. */
const leaseFailed = ref(false)
const bookingsFailed = ref(false)
const openId = ref<string | null>(null)

function shortDate(iso: string) {
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

async function loadLease() {
  const l = activeLease.value
  leaseRows.value = []
  leaseFailed.value = false
  if (!l) return
  try {
    const invs = await inventoriesApi.fetchByLease(l.id)
    leaseRows.value = invs
      .sort((a, b) => (a.type === b.type ? b.updated_at.localeCompare(a.updated_at) : a.type === 'entry' ? -1 : 1))
      .map(inv => ({ inv, context: `Bail — ${l.unit?.name ?? 'logement'}`, unitId: l.unit?.id ?? null, otherId: l.landlord_id ?? l.landlord?.id ?? null, host: false }))
  } catch {
    leaseFailed.value = true
  }
}

/**
 * Séjours courts : l'hôte prépare l'état des lieux d'arrivée et l'envoie ;
 * jusqu'ici le voyageur n'avait aucun écran pour le lire ni le signer.
 * Séjours confirmés en cours, à venir ou terminés depuis moins de 30 jours.
 */
async function loadBookings() {
  bookingRows.value = []
  bookingsFailed.value = false
  let all: BookingSummary[]
  try {
    all = await bookingsApi.fetchMine()
  } catch {
    bookingsFailed.value = true
    return
  }
  const limit = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const relevant = all.filter(b => b.status === 'confirmed' && (bookingPhase(b) !== 'past' || b.check_out.slice(0, 10) >= limit))
  const rows = await Promise.all(relevant.map(async b => {
    const invs = await inventoriesApi.fetchByBooking(b.id).catch(() => { bookingsFailed.value = true; return [] as InventoryDetail[] })
    return invs.map(inv => ({ inv, context: `Séjour du ${shortDate(b.check_in)} au ${shortDate(b.check_out)} — ${b.unit?.name ?? 'logement'}`, unitId: b.unit_id, otherId: b.landlord_id ?? null, host: true }))
  }))
  bookingRows.value = rows.flat()
}

async function load() {
  state.value = 'loading'
  await Promise.all([loadLease(), loadBookings()])
  // Les deux sources en échec : rien de fiable à montrer.
  state.value = leaseFailed.value && bookingsFailed.value ? 'error' : 'ready'
  focusFromQuery()
}

/** `?inventory=` (notification, tableau de bord) déplie l'état des lieux visé ; sinon le premier qui attend ma signature. */
function focusFromQuery() {
  const wanted = typeof route.query.inventory === 'string' ? route.query.inventory : null
  const target = wanted ? rows.value.find(r => r.inv.id === wanted) : null
  openId.value = target?.inv.id ?? openId.value ?? rows.value.find(r => awaitingMySignature(r.inv, true))?.inv.id ?? null
  if (target) nextTick(() => document.getElementById(`inventory-${target.inv.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

async function applyLeaseQuery() {
  await ensureLoaded()
  const id = typeof route.query.lease === 'string' ? route.query.lease : null
  if (id && leases.value.some(l => l.id === id)) selectLease(id)
}
onMounted(async () => {
  await applyLeaseQuery()
  load()
})
onMounted(() => useLandlordEdlBadge().markAllSeen())
watch(() => activeLease.value?.id, (id, old) => { if (old && id !== old) load() })
// Liens profonds suivis même quand on est déjà sur la page (clic sur une notification).
watch(() => route.query.lease, applyLeaseQuery)
watch(() => route.query.inventory, async () => {
  if (state.value !== 'ready') return
  await load()
})

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
function comparison(inv: InventoryDetail, room: string, item: string, itemState: string) {
  const e = entryFor(inv)
  return e ? compareItem(entryStates(e.rooms), room, item, itemState) : null
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
const signedFlash = ref('')
async function sign(inv: InventoryDetail) {
  const signature = signatures.value[inv.id]
  if (!signature) return
  signingId.value = inv.id
  signError.value = ''
  signedFlash.value = ''
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
    signedFlash.value = updated.signed_at
      ? "État des lieux signé par les deux parties : il fait désormais référence. Le PDF signé est disponible."
      : 'Votre signature est enregistrée. Il ne manque plus que celle du propriétaire.'
    await pads.value[inv.id]?.rememberIfAsked()
  } catch (e) {
    signError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La signature a échoué.') : 'La signature a échoué.'
  } finally {
    signingId.value = null
  }
}

/* ---- Écrire au propriétaire / à l'hôte (même conversation que les signalements) ---- */
const writingId = ref<string | null>(null)
const writeError = ref<{ id: string; text: string } | null>(null)
async function writeOther(row: Row) {
  if (!row.unitId || !row.otherId) return
  writingId.value = row.inv.id
  writeError.value = null
  try {
    const conv = await messagingApi.openConversation(row.unitId, row.otherId)
    await navigateTo({ path: '/locataire/messages', query: { conversation: conv.id } })
  } catch (e) {
    writeError.value = { id: row.inv.id, text: e instanceof ApiRequestError ? errorText(e.mapped, "La conversation n'a pas pu être ouverte.") : "La conversation n'a pas pu être ouverte." }
  } finally {
    writingId.value = null
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
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="leaseState === 'loading' || state === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="72" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos états des lieux pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <FeedbackAlertBanner v-if="leaseFailed || bookingsFailed" tone="danger" class="mb-4.5">
        {{ leaseFailed ? 'Les états des lieux de votre bail' : 'Les états des lieux de vos séjours' }} n'ont pas pu être chargés : la liste est incomplète.
        <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
      </FeedbackAlertBanner>

      <div v-if="!rows.length && !leaseFailed && !bookingsFailed" class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-12 text-center">
        <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><ClipboardCheck class="h-5 w-5" :stroke-width="1.9" /></div>
        <p class="m-0 text-[15px] font-bold">Aucun état des lieux pour l'instant</p>
        <p class="m-0 max-w-[440px] text-[13.5px] text-[var(--text-muted)]">
          {{ activeLease ? 'Le propriétaire le remplit à la remise des clés, puis vous l\'envoie : vous le relirez et le signerez ici.' : 'Il apparaîtra ici dès qu\'un propriétaire ou un hôte vous en enverra un.' }}
        </p>
        <NuxtLink v-if="activeLease" :to="`/locataire/bail?lease=${activeLease.id}`" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-2 text-[13px] font-bold text-sand-900">Retour à mon bail</NuxtLink>
      </div>

      <template v-else-if="rows.length">
        <p class="mb-4.5 mt-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
          L'état des lieux décrit le logement à votre arrivée et à votre départ. Relisez-le avant de signer : c'est la référence en cas de désaccord sur la caution.
        </p>
        <p v-if="signedFlash" class="mb-4.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ signedFlash }}</p>
        <p v-if="signError" class="mb-4.5 mt-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ signError }}</p>
        <p v-if="docError" class="mb-4.5 mt-0 text-[13px] font-semibold text-danger-fg">{{ docError }}</p>

        <article v-for="row in rows" :id="`inventory-${row.inv.id}`" :key="row.inv.id" class="mb-3.5 overflow-hidden rounded-2xl border bg-white" :class="openId === row.inv.id ? 'border-[var(--border-default)]' : 'border-[var(--border-subtle)]'">
          <button type="button" class="flex w-full items-center gap-3.5 px-5.5 py-4.5 text-left" :aria-expanded="openId === row.inv.id" @click="toggle(row.inv.id)">
            <div class="grid h-9 w-9 flex-none place-items-center rounded-md bg-green-50 text-green-700"><ClipboardCheck class="h-[18px] w-[18px]" :stroke-width="1.9" /></div>
            <span class="min-w-0 flex-1">
              <span class="block text-[15px] font-bold tracking-[-.01em]">{{ INVENTORY_TYPE_LABEL[row.inv.type] ?? 'État des lieux' }}</span>
              <span class="mt-0.5 block truncate text-xs text-[var(--text-faint)]">{{ row.context }}</span>
            </span>
            <CoreBadge :tone="awaitingMySignature(row.inv, true) ? 'warn' : INVENTORY_STATUS_TONE[row.inv.status]">
              {{ awaitingMySignature(row.inv, true) ? 'À signer' : row.inv.status === 'draft' ? 'En préparation' : INVENTORY_STATUS_LABEL[row.inv.status] }}
            </CoreBadge>
            <ChevronRight class="h-4 w-4 flex-none text-[var(--text-faint)] transition-transform" :class="openId === row.inv.id ? 'rotate-90' : 'rotate-0'" :stroke-width="1.9" />
          </button>

          <div v-if="openId === row.inv.id" class="border-t border-sand-200 px-5.5 pb-5.5 pt-4">
            <p v-if="row.inv.status === 'draft'" class="m-0 text-[13.5px] text-[var(--text-muted)]">{{ row.host ? "L'hôte" : 'Le propriétaire' }} est en train de le remplir. Vous pourrez le relire et le signer dès qu'il vous l'aura envoyé.</p>
            <p v-if="row.inv.signed_at" class="m-0 text-[13.5px] text-[var(--text-muted)]">Signé par les deux parties le {{ formatDate(row.inv.signed_at) }}.</p>
            <p v-if="row.inv.general_comment" class="mb-0 mt-2.5 text-[13.5px] leading-[1.55] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{{ row.inv.general_comment }}</p>
            <div v-if="row.inv.meter_readings?.electricity || row.inv.meter_readings?.water" class="mt-3 grid grid-cols-2 gap-3 sm:max-w-[360px]">
              <div v-if="row.inv.meter_readings.electricity" class="rounded-lg border border-[var(--border-subtle)] p-3">
                <p class="m-0 font-mono text-base font-bold text-green-900">{{ row.inv.meter_readings.electricity }}</p>
                <p class="mb-0 mt-1 text-[11.5px] text-[var(--text-muted)]">Compteur électricité</p>
              </div>
              <div v-if="row.inv.meter_readings.water" class="rounded-lg border border-[var(--border-subtle)] p-3">
                <p class="m-0 font-mono text-base font-bold text-green-900">{{ row.inv.meter_readings.water }}</p>
                <p class="mb-0 mt-1 text-[11.5px] text-[var(--text-muted)]">Compteur eau</p>
              </div>
            </div>
            <p v-if="row.inv.status !== 'draft' && !row.inv.rooms.length" class="mb-0 mt-3.5 text-[13px] text-[var(--text-muted)]">Aucune pièce détaillée.</p>
            <div v-if="row.inv.type === 'exit' && row.inv.status !== 'draft' && entryFor(row.inv)" class="mt-3.5 rounded-md border p-3.5" :class="degradationsOf(row.inv).length ? 'border-danger-border bg-danger-bg' : 'border-[var(--border-subtle)] bg-[var(--surface-page)]'">
              <p class="m-0 text-[13px] font-bold" :class="degradationsOf(row.inv).length ? 'text-danger-fg' : ''">
                {{ degradationsOf(row.inv).length ? `${degradationsOf(row.inv).length} élément${degradationsOf(row.inv).length > 1 ? 's' : ''} noté${degradationsOf(row.inv).length > 1 ? 's' : ''} en moins bon état qu'à l'entrée` : "Rien n'est noté en moins bon état qu'à l'entrée" }}
              </p>
              <ul v-if="degradationsOf(row.inv).length" class="mb-0 mt-1.5 list-disc pl-5 text-[12.5px] text-danger-fg">
                <li v-for="d in degradationsOf(row.inv)" :key="`${d.room}|${d.item}`">{{ d.room }} · {{ d.item }} : {{ itemStateLabel(d.from) }}, désormais {{ itemStateLabel(d.to).toLowerCase() }}</li>
              </ul>
              <p v-if="hasConsumption(row.inv)" class="mb-0 mt-1.5 text-[12.5px] text-[var(--text-muted)]">
                Consommation depuis l'entrée :<template v-if="consumptionOf(row.inv)?.electricity !== null"> électricité <span class="font-mono">{{ consumptionOf(row.inv)?.electricity }}</span></template><template v-if="consumptionOf(row.inv)?.water !== null"> · eau <span class="font-mono">{{ consumptionOf(row.inv)?.water }}</span></template>
              </p>
            </div>
            <template v-if="row.inv.status !== 'draft'">
              <div v-for="(room, ri) in row.inv.rooms" :key="ri" class="mt-3.5 border-t border-sand-200 pt-3.5">
                <h3 class="m-0 text-sm font-bold">{{ room.name }}</h3>
                <div v-for="(item, i) in room.items" :key="i" class="mt-2.5">
                  <div class="flex items-center gap-2.5">
                    <p class="m-0 flex-1 text-[13.5px] font-semibold">{{ item.name || 'Élément' }}</p>
                    <CoreBadge :tone="itemStateTone(item.state)">{{ itemStateLabel(item.state) }}</CoreBadge>
                  </div>
                  <p v-if="item.comment" class="mb-0 mt-1 text-[13px] text-[var(--text-muted)] [overflow-wrap:anywhere]">{{ item.comment }}</p>
                  <p v-if="comparison(row.inv, room.name, item.name, item.state)?.entryState" class="mb-0 mt-1 text-[11.5px]" :class="comparison(row.inv, room.name, item.name, item.state)?.degraded ? 'font-bold text-danger-fg' : 'text-[var(--text-faint)]'">
                    À l'entrée : {{ itemStateLabel(comparison(row.inv, room.name, item.name, item.state)?.entryState ?? '') }}
                  </p>
                  <EdlPhotoStrip v-if="item.photo_count" :api="photos" :inventory-id="row.inv.id" :origin="{ ri, ii: i }" :existing="range(item.photo_count)" />
                </div>
              </div>
            </template>

            <div v-if="awaitingMySignature(row.inv, true)" class="mt-4.5 rounded-2xl border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-5">
              <h3 class="m-0 text-[15px] font-bold text-clay-700">Votre signature est attendue</h3>
              <p class="mb-3.5 mt-1.5 text-[13px] leading-[1.6] text-clay-900">
                En signant, vous reconnaissez l'état décrit ci-dessus. S'il ne correspond pas à ce que vous constatez, ne signez pas : écrivez d'abord {{ row.host ? "à l'hôte" : 'au propriétaire' }} pour qu'il le corrige.
              </p>
              <CoreButton v-if="row.unitId && row.otherId" size="sm" tone="secondary" class="mb-3.5" :disabled="writingId === row.inv.id" @click="writeOther(row)">
                <span class="inline-flex items-center gap-1.5"><MessageSquare class="h-4 w-4" :stroke-width="1.9" />{{ writingId === row.inv.id ? 'Ouverture…' : row.host ? "Écrire à l'hôte" : 'Écrire au propriétaire' }}</span>
              </CoreButton>
              <p v-if="writeError?.id === row.inv.id" class="mb-3 mt-0 text-[12.5px] font-semibold text-danger-fg">{{ writeError.text }}</p>
              <FormsSignaturePad :ref="(el: any) => { pads[row.inv.id] = el }" v-model="signatures[row.inv.id]" />
              <CoreButton tone="accent" class="mt-3.5" :disabled="signingId === row.inv.id || !signatures[row.inv.id]" @click="sign(row.inv)">{{ signingId === row.inv.id ? 'Signature…' : "Signer l'état des lieux" }}</CoreButton>
            </div>
            <p v-else-if="row.inv.status === 'pending_signature'" class="mb-0 mt-4.5 text-[13px] text-[var(--text-muted)]">Vous avez signé — en attente de la signature {{ row.host ? "de l'hôte" : 'du propriétaire' }}.</p>

            <CoreButton v-if="row.inv.status !== 'draft'" size="sm" tone="secondary" class="mt-4" :disabled="doc.loadingKey.value === row.inv.id" @click="openPdf(row.inv)">
              <span class="inline-flex items-center gap-1.5"><FileText class="h-4 w-4" :stroke-width="1.9" />{{ doc.loadingKey.value === row.inv.id ? 'Génération du PDF…' : 'Télécharger le PDF' }}</span>
            </CoreButton>
          </div>
        </article>
      </template>
    </template>
  </div>
</template>
