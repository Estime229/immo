<script setup lang="ts">
import { ClipboardCheck, FileText, FolderOpen, Receipt, Search, X } from '@lucide/vue'
import type { Component } from 'vue'
import type { DocumentResult } from '~/composables/usePdfDocument'
import type { InventoryDetail } from '~/types/tenant'

definePageMeta({ layout: 'pro' })

const leasesApi = useLeasesApi()
const inventoriesApi = useInventoriesApi()
const artisanApi = useArtisanRequestsApi()
const bookingsApi = useLandlordBookingsApi()
const pdfDoc = usePdfDocument()
const preview = useProtectedFile()
const authUser = useAuthUser()

type DocType = 'bail' | 'edl' | 'facture' | 'recu'
interface DocRow {
  key: string
  name: string
  type: DocType
  /** Date qui situe le document (début du bail, signature, paiement, arrivée). */
  date: string | null
  /** Écran d'origine du document, pour un lien croisé. */
  to: string | null
  pdfUrl: string
  htmlUrl?: string
}

const TYPE_LABEL: Record<DocType, string> = { bail: 'Contrat de bail', edl: 'État des lieux', facture: "Facture d'artisan", recu: 'Reçu de séjour' }
const TYPE_ICON: Record<DocType, Component> = { bail: FileText, edl: ClipboardCheck, facture: Receipt, recu: Receipt }
const SOURCE_LABEL = { leases: 'les baux et états des lieux', artisans: "les factures d'artisan", bookings: 'les reçus de séjour' } as const
type Source = keyof typeof SOURCE_LABEL

const rows = ref<DocRow[]>([])
const state = ref<'loading' | 'error' | 'empty' | 'success'>('loading')
/** Sources en échec alors que les autres ont répondu : on affiche ce qu'on a, et on le dit. */
const failedSources = ref<Source[]>([])

function unitName(u: { name: string } | null | undefined) {
  return u?.name ?? 'logement supprimé'
}
function personFull(p?: { first_name?: string | null; last_name?: string | null } | null) {
  return `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'Locataire'
}

/**
 * Aucun endpoint « tous mes documents » : la liste est reconstruite à partir de
 * trois sources lues en parallèle (baux et leurs états des lieux, factures
 * d'artisan, reçus de séjour). Un échec n'efface pas les autres sources.
 */
async function load() {
  state.value = 'loading'
  const [leasesRes, artisansRes, bookingsRes] = await Promise.allSettled([
    leasesApi.fetchMine(),
    artisanApi.listMine(),
    bookingsApi.fetchMine()
  ])
  const out: DocRow[] = []
  const failed: Source[] = []

  if (leasesRes.status === 'fulfilled') {
    // Côté pro, seulement les baux où l'on n'est pas le locataire (un propriétaire peut aussi louer ailleurs).
    const mine = leasesRes.value.filter(l => (l.tenant_id ?? l.tenant.id) !== authUser.value?.id && l.status !== 'draft' && l.status !== 'pending_signature')
    const invsByLease = await Promise.all(mine.map(l => inventoriesApi.fetchByLease(l.id).catch(() => [] as InventoryDetail[])))
    mine.forEach((l, i) => {
      out.push({ key: `lease-${l.id}`, name: `Contrat de bail · ${unitName(l.unit)} · ${personFull(l.tenant)}`, type: 'bail', date: l.start_date, to: `/pro/baux/${l.id}`, pdfUrl: `/leases/${l.id}/pdf`, htmlUrl: `/leases/${l.id}/pdf` })
      for (const inv of invsByLease[i] ?? []) {
        if (inv.status !== 'signed') continue
        out.push({ key: `inv-${inv.id}`, name: `État des lieux ${inv.type === 'exit' ? 'de sortie' : "d'entrée"} · ${unitName(l.unit)}`, type: 'edl', date: inv.signed_at ?? inv.updated_at, to: `/pro/baux/${l.id}`, pdfUrl: `/pdf/inventories/${inv.id}` })
      }
    })
  } else failed.push('leases')

  if (artisansRes.status === 'fulfilled') {
    for (const r of artisansRes.value.filter(x => x.paid_at)) {
      out.push({ key: `art-${r.id}`, name: `Facture d'artisan · ${r.description?.slice(0, 60) || 'intervention'}`, type: 'facture', date: r.paid_at ?? null, to: `/pro/artisans?request=${r.id}`, pdfUrl: `/artisan-requests/${r.id}/invoice` })
    }
  } else failed.push('artisans')

  if (bookingsRes.status === 'fulfilled') {
    for (const b of bookingsRes.value.filter(x => x.status === 'confirmed')) {
      out.push({ key: `booking-${b.id}`, name: `Reçu de séjour · ${unitName(b.unit)} · ${personFull(b.tenant)}`, type: 'recu', date: b.check_in, to: `/pro/reservations?booking=${b.id}`, pdfUrl: `/bookings/${b.id}/receipt` })
    }
  } else failed.push('bookings')

  rows.value = out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  failedSources.value = failed
  state.value = failed.length === 3 ? 'error' : out.length ? 'success' : (failed.length ? 'success' : 'empty')
}
onMounted(load)

function fmtDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ---- Recherche et filtre, gardés dans l'URL (?q=, ?type=) ---- */
const route = useRoute()
const router = useRouter()
const query = ref(String(route.query.q ?? ''))
const typeFilter = ref(String(route.query.type ?? ''))
watch([query, typeFilter], ([q, t]) => router.replace({ query: { ...route.query, q: q.trim() || undefined, type: t || undefined } }))
watch(() => route.query, q => {
  query.value = String(q.q ?? '')
  typeFilter.value = String(q.type ?? '')
})
const hasFilters = computed(() => !!query.value.trim() || !!typeFilter.value)
function clearFilters() {
  query.value = ''
  typeFilter.value = ''
}
const filtered = computed(() => rows.value.filter(d =>
  (!query.value.trim() || d.name.toLowerCase().includes(query.value.trim().toLowerCase())) &&
  (!typeFilter.value || d.type === typeFilter.value)
))

/*
 * Ouverture : l'onglet est ouvert tout de suite, au clic, puis rempli quand le
 * document est prêt. Ouvert après l'attente (génération du PDF), il serait
 * bloqué comme fenêtre surgissante sur iOS Safari.
 */
const openingKey = ref<string | null>(null)
const openError = ref<{ key: string; text: string } | null>(null)
async function openDoc(row: DocRow) {
  const tab = window.open('', '_blank')
  try {
    tab?.document.write('<p style="font-family:sans-serif;padding:24px;color:#555">Préparation du document…</p>')
  } catch {
    // onglet inaccessible : il sera simplement rempli plus tard
  }
  openingKey.value = row.key
  openError.value = null
  const show = (url: string) => {
    if (tab && !tab.closed) tab.location.href = url
    else window.open(url, '_blank')
  }
  try {
    const result: DocumentResult = await pdfDoc.fetchDocument(row.pdfUrl, row.htmlUrl)
    if (result.mode === 'pdf') {
      await preview.load(result.downloadUrl)
      if (preview.objectUrl.value) show(preview.objectUrl.value)
      else throw new Error(preview.errorMessage.value ?? 'Aperçu indisponible.')
    } else if (result.mode === 'html') {
      show(URL.createObjectURL(new Blob([result.html], { type: 'text/html' })))
    } else {
      throw new Error(result.message)
    }
  } catch (e) {
    tab?.close()
    openError.value = { key: row.key, text: e instanceof Error ? e.message : 'Ce document est momentanément indisponible.' }
  } finally {
    openingKey.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 flex flex-wrap items-center gap-2.5">
      <div class="flex h-[42px] min-w-0 flex-[1_1_220px] items-center gap-2 rounded-pill border border-[var(--border-default)] bg-white px-4 focus-within:border-green-600 sm:max-w-[360px]">
        <Search class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
        <input v-model="query" type="search" aria-label="Rechercher un document" placeholder="Logement, locataire…" class="w-full min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--text-faint)]">
      </div>
      <select v-model="typeFilter" aria-label="Type de document" class="h-[42px] cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none">
        <option value="">Tous les types</option>
        <option v-for="(label, t) in TYPE_LABEL" :key="t" :value="t">{{ label }}</option>
      </select>
      <button v-if="hasFilters" type="button" class="flex h-[42px] items-center gap-1.5 rounded-pill px-3 text-[13px] font-bold text-[var(--text-muted)] hover:text-danger-fg" @click="clearFilters">
        <X class="h-3.5 w-3.5" :stroke-width="1.9" /> Effacer
      </button>
    </div>

    <div v-if="state === 'loading'" class="flex flex-col gap-2.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="60" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos documents pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <ProEmptyPanel v-else-if="state === 'empty'" :icon="FolderOpen" title="Aucun document pour l'instant" text="Les contrats de bail envoyés, les états des lieux signés, les factures d'artisan payées et les reçus de séjour s'ajoutent ici automatiquement.">
      <NuxtLink to="/pro/baux" class="inline-flex items-center rounded-md border border-[var(--border-default)] bg-white px-5 py-3 text-[14px] font-bold text-sand-900">Voir mes baux</NuxtLink>
    </ProEmptyPanel>

    <template v-else>
      <FeedbackAlertBanner v-if="failedSources.length" tone="warn" class="mb-4">
        Impossible de charger {{ failedSources.map(s => SOURCE_LABEL[s]).join(' ni ') }} : la liste ci-dessous est incomplète.
        <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
      </FeedbackAlertBanner>

      <div v-if="!filtered.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        <p class="m-0">{{ rows.length ? 'Aucun document ne correspond à cette recherche.' : 'Aucun document dans les sources chargées.' }}</p>
        <button v-if="hasFilters" type="button" class="mt-2 font-bold text-green-700 underline" @click="clearFilters">Effacer la recherche et le filtre</button>
      </div>

      <section v-else class="rounded-2xl border border-[var(--border-subtle)] bg-white px-5.5 py-2">
        <div v-for="d in filtered" :key="d.key" class="border-b border-sand-200 py-3 last:border-b-0">
          <div class="flex items-center gap-3">
            <div class="grid h-9 w-9 flex-none place-items-center rounded-md bg-sand-200 text-[var(--text-secondary)]">
              <component :is="TYPE_ICON[d.type]" class="h-4 w-4" :stroke-width="1.9" />
            </div>
            <div class="min-w-0 flex-1">
              <NuxtLink v-if="d.to" :to="d.to" class="m-0 block truncate text-sm font-bold hover:text-green-700">{{ d.name }}</NuxtLink>
              <p v-else class="m-0 truncate text-sm font-bold">{{ d.name }}</p>
              <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ TYPE_LABEL[d.type] }}<template v-if="d.date"> · <span class="font-mono">{{ fmtDate(d.date) }}</span></template></p>
            </div>
            <CoreButton size="sm" tone="secondary" :disabled="openingKey === d.key" @click="openDoc(d)">{{ openingKey === d.key ? 'Génération…' : 'Ouvrir' }}</CoreButton>
          </div>
          <p v-if="openError?.key === d.key" class="mb-0 mt-2 pl-12 text-[13px] font-semibold text-danger-fg">{{ openError.text }}</p>
        </div>
      </section>
    </template>
  </div>
</template>
