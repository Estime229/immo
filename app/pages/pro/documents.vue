<script setup lang="ts">
import type { DocumentResult } from '~/composables/usePdfDocument'

definePageMeta({ layout: 'pro' })

const leasesApi = useLeasesApi()
const inventoriesApi = useInventoriesApi()
const artisanApi = useArtisanRequestsApi()
const bookingsApi = useLandlordBookingsApi()
const pdfDoc = usePdfDocument()
const preview = useProtectedFile()

interface DocRow {
  key: string
  name: string
  type: 'bail' | 'edl' | 'facture' | 'recu'
  typeLabel: string
  pdfUrl: string
  htmlUrl?: string
}

const rows = ref<DocRow[]>([])
const state = ref<'loading' | 'error' | 'empty' | 'success'>('loading')

/** Aucun endpoint « tous mes documents » — reconstruit à partir des quatre sources réelles déjà câblées séparément (baux, états des lieux, factures artisan, reçus de séjour). */
async function load() {
  state.value = 'loading'
  try {
    const out: DocRow[] = []

    const leases = await leasesApi.fetchMine()
    for (const l of leases) {
      if (l.status === 'draft' || l.status === 'pending_signature') continue
      out.push({ key: `lease-${l.id}`, name: `Contrat de bail — ${l.unit.name}`, type: 'bail', typeLabel: 'Bail', pdfUrl: `/leases/${l.id}/pdf`, htmlUrl: `/leases/${l.id}/pdf` })

      const invs = await inventoriesApi.fetchByLease(l.id).catch(() => [])
      for (const inv of invs) {
        if (inv.status !== 'signed') continue
        out.push({ key: `inv-${inv.id}`, name: `État des lieux ${inv.type === 'exit' ? 'de sortie' : "d'entrée"} — ${l.unit.name}`, type: 'edl', typeLabel: 'État des lieux', pdfUrl: `/pdf/inventories/${inv.id}` })
      }
    }

    const requests = await artisanApi.listMine()
    for (const r of requests.filter(x => x.paid_at)) {
      out.push({ key: `art-${r.id}`, name: `Facture d'artisan — ${r.description ?? r.id.slice(0, 8)}`, type: 'facture', typeLabel: 'Facture', pdfUrl: `/artisan-requests/${r.id}/invoice` })
    }

    const bookings = await bookingsApi.fetchMine().catch(() => [])
    for (const b of bookings.filter(x => x.status === 'confirmed')) {
      out.push({ key: `booking-${b.id}`, name: `Reçu de séjour — ${tenantNameFor(b)}`, type: 'recu', typeLabel: 'Reçu', pdfUrl: `/bookings/${b.id}/receipt` })
    }

    rows.value = out
    state.value = out.length ? 'success' : 'empty'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

function tenantNameFor(b: { tenant?: { first_name?: string | null; last_name?: string | null } }) {
  if (!b.tenant) return 'Locataire'
  return `${b.tenant.first_name ?? ''} ${b.tenant.last_name ?? ''}`.trim() || 'Locataire'
}

const query = ref('')
const typeFilter = ref('')
const TYPE_LABEL: Record<DocRow['type'], string> = { bail: 'Bail', edl: 'État des lieux', facture: 'Facture', recu: 'Reçu' }
const filtered = computed(() => rows.value.filter(d =>
  (!query.value.trim() || d.name.toLowerCase().includes(query.value.trim().toLowerCase())) &&
  (!typeFilter.value || d.type === typeFilter.value)
))

const openingKey = ref<string | null>(null)
const openError = ref('')
async function openDoc(row: DocRow) {
  openingKey.value = row.key
  openError.value = ''
  const result: DocumentResult = await pdfDoc.fetchDocument(row.pdfUrl, row.htmlUrl)
  if (result.mode === 'pdf') {
    await preview.load(result.downloadUrl)
    if (preview.objectUrl.value) window.open(preview.objectUrl.value, '_blank')
    else openError.value = preview.errorMessage.value ?? 'Aperçu indisponible.'
  } else if (result.mode === 'html') {
    const blob = new Blob([result.html], { type: 'text/html' })
    window.open(URL.createObjectURL(blob), '_blank')
  } else {
    openError.value = result.message
  }
  openingKey.value = null
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-4.5 flex flex-wrap gap-2.5">
      <label class="flex h-11 min-w-[200px] flex-1 items-center gap-2.5 rounded-pill border border-[var(--border-default)] bg-white px-4">
        <span class="h-3.5 w-3.5 flex-none rounded-pill border-2 border-[var(--text-faint)]" />
        <input v-model="query" placeholder="Rechercher un document" class="w-full border-0 bg-transparent text-sm outline-none">
      </label>
      <select v-model="typeFilter" class="h-11 rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900">
        <option value="">Tous les types</option>
        <option v-for="(label, t) in TYPE_LABEL" :key="t" :value="t">{{ label }}</option>
      </select>
    </div>

    <p v-if="openError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ openError }}</p>

    <div v-if="state === 'loading'" class="flex flex-col gap-2.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="60" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos documents pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="state === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucun document pour l'instant.
    </p>

    <p v-else-if="!filtered.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucun document ne correspond à ces filtres.
    </p>

    <div v-else class="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white p-2">
      <div v-for="d in filtered" :key="d.key" class="flex items-center gap-3.5 border-b border-sand-200 p-3.5 last:border-b-0">
        <div class="grid h-11 w-[38px] flex-none place-items-center rounded-xs border border-[var(--border-default)] bg-[var(--surface-page)] text-[9.5px] font-black text-danger-fg">PDF</div>
        <div class="min-w-0 flex-1">
          <p class="m-0 text-sm font-bold">{{ d.name }}</p>
          <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ d.typeLabel }}</p>
        </div>
        <button type="button" class="whitespace-nowrap rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-xs font-bold" :disabled="openingKey === d.key" @click="openDoc(d)">{{ openingKey === d.key ? '…' : 'Aperçu' }}</button>
      </div>
    </div>
  </div>
</template>
