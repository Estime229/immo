<script setup lang="ts">
/**
 * Liste des litiges ou des demandes de maintenance (même `GET /signals`, découpé par type).
 * Filtres et page dans l'URL ; « en cours » par défaut, le plus urgent puis le plus ancien en tête.
 */
import { ChevronRight, Paperclip } from '@lucide/vue'
import { PRIORITY_LABELS, PRIORITY_OPTIONS, PRIORITY_TONE, SIGNAL_TYPE_LABELS, STATUS_LABELS, STATUS_OPTIONS, STATUS_TONE, type SignalItem, type SignalPriority } from '~/composables/useSignals'
import { filterSignals, isQueuedSignal, parseSignalFilters, SIGNAL_KINDS, SIGNAL_TYPE_ICON, signalAttachmentCount, signalFiltersToQuery, signalPersonName, type SignalFilters, type SignalKind } from '~/utils/adminSignals'
import { signalPlace } from '~/utils/signals'

const props = defineProps<{ kind: SignalKind }>()

const PAGE_SIZE = 10
const cfg = computed(() => SIGNAL_KINDS[props.kind])

const { fetchSignals } = useSignals()
const route = useRoute()
const router = useRouter()

const items = ref<SignalItem[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

async function load() {
  state.value = 'loading'
  try {
    items.value = await fetchSignals()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

/* ---------- Filtres ---------- */
const filters = computed(() => parseSignalFilters(route.query, props.kind))

function setFilter(patch: Partial<SignalFilters>) {
  router.replace({ query: signalFiltersToQuery({ ...filters.value, ...patch }) })
}
function onSelect(key: keyof SignalFilters, e: Event) {
  setFilter({ [key]: (e.target as HTMLSelectElement).value } as Partial<SignalFilters>)
}

const ofKind = computed(() => items.value.filter(s => cfg.value.types.includes(s.signal_type)))
const activeCount = computed(() => ofKind.value.filter(isQueuedSignal).length)
const statusCount = computed(() => {
  const c: Record<string, number> = {}
  for (const s of ofKind.value) c[s.status] = (c[s.status] ?? 0) + 1
  return c
})

const rows = computed(() => filterSignals(ofKind.value, props.kind, filters.value))
const pages = computed(() => pageCount(rows.value.length, PAGE_SIZE))
const page = computed(() => Math.min(Math.max(1, Number(route.query.page) || 1), pages.value))
const pageRows = computed(() => paginate(rows.value, page.value, PAGE_SIZE))

function setPage(p: number) {
  router.replace({ query: { ...signalFiltersToQuery(filters.value), ...(p > 1 ? { page: String(p) } : {}) } })
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

const filtered = computed(() => filters.value.status !== 'active' || !!filters.value.priority || !!filters.value.type)

/* ---------- Affichage ---------- */
const ACCENT: Record<SignalPriority, string> = {
  urgent: 'border-l-4 border-l-danger-fg',
  high: 'border-l-4 border-l-clay-500',
  medium: 'border-l-4 border-l-[var(--border-default)]',
  low: 'border-l-4 border-l-[var(--border-default)]'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 flex flex-wrap gap-2.5">
      <select :value="filters.status" aria-label="Statut" class="h-[42px] cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900" @change="onSelect('status', $event)">
        <option value="active">En cours{{ state === 'ready' ? ` (${activeCount})` : '' }}</option>
        <option value="all">Tous statuts</option>
        <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ STATUS_LABELS[s] }}{{ state === 'ready' ? ` (${statusCount[s] ?? 0})` : '' }}</option>
      </select>
      <select :value="filters.priority" aria-label="Priorité" class="h-[42px] cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900" @change="onSelect('priority', $event)">
        <option value="">Toutes priorités</option>
        <option v-for="p in PRIORITY_OPTIONS" :key="p" :value="p">{{ PRIORITY_LABELS[p] }}</option>
      </select>
      <select :value="filters.type" aria-label="Type" class="h-[42px] cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900" @change="onSelect('type', $event)">
        <option value="">Tous les types</option>
        <option v-for="t in cfg.types" :key="t" :value="t">{{ SIGNAL_TYPE_LABELS[t] }}</option>
      </select>
      <button v-if="filtered" type="button" class="h-[42px] px-2 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700" @click="router.replace({ query: {} })">Revenir aux {{ kind === 'dispute' ? 'litiges' : 'demandes' }} en cours</button>
    </div>

    <div v-if="state === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="118" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger les {{ kind === 'dispute' ? 'litiges' : 'demandes de maintenance' }} pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="!ofKind.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      {{ cfg.emptyAll }}
    </p>

    <p v-else-if="!rows.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      {{ filtered ? 'Aucun résultat pour ces filtres.' : cfg.emptyActive }}
    </p>

    <template v-else>
      <NuxtLink
        v-for="s in pageRows"
        :key="s.id"
        :to="`${cfg.path}/${s.id}`"
        class="group mb-3 block rounded-2xl border border-[var(--border-subtle)] bg-white p-5 transition-colors hover:border-[var(--border-default)]"
        :class="ACCENT[s.priority]"
        data-testid="signal-card"
      >
        <div class="flex items-start gap-3.5">
          <div class="grid h-[42px] w-[42px] flex-none place-items-center rounded-md bg-sand-200 text-sand-900">
            <component :is="SIGNAL_TYPE_ICON[s.signal_type]" class="h-[18px] w-[18px]" :stroke-width="1.9" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="m-0 text-[15px] font-bold [overflow-wrap:anywhere]">{{ s.title }}</p>
              <AdminBadge :tone="STATUS_TONE[s.status]">{{ STATUS_LABELS[s.status] }}</AdminBadge>
              <AdminBadge v-if="s.priority === 'urgent' || s.priority === 'high'" :tone="PRIORITY_TONE[s.priority]">{{ PRIORITY_LABELS[s.priority] }}</AdminBadge>
            </div>
            <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">
              {{ SIGNAL_TYPE_LABELS[s.signal_type] }} · {{ signalPlace(s, 'Bien non précisé') }} · déclaré le <span class="font-mono text-[12px]">{{ formatDate(s.created_at) }}</span><template v-if="signalPersonName(s.author)"> par {{ signalPersonName(s.author) }}</template>
            </p>
            <p class="mb-0 mt-2.5 line-clamp-2 text-[13.5px] leading-[1.55] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{{ s.description }}</p>
            <div v-if="signalAttachmentCount(s) || s.assigned_to" class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-faint)]">
              <span v-if="signalAttachmentCount(s)" class="inline-flex items-center gap-1"><Paperclip class="h-3.5 w-3.5" :stroke-width="1.9" />{{ signalAttachmentCount(s) }} pièce{{ signalAttachmentCount(s) > 1 ? 's' : '' }} jointe{{ signalAttachmentCount(s) > 1 ? 's' : '' }}</span>
              <span v-if="s.assigned_to">Suivi par <strong class="text-[var(--text-secondary)]">{{ s.assigned_to }}</strong></span>
            </div>
          </div>
          <ChevronRight class="mt-3 hidden h-[18px] w-[18px] flex-none text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5 sm:block" :stroke-width="1.9" />
        </div>
      </NuxtLink>

      <AdminPagination :page="page" :page-count="pages" @update:page="setPage" />
    </template>
  </div>
</template>
