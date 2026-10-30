<script setup lang="ts">
/**
 * Journal d'audit : fil chronologique groupé par jour. Chaque entrée se lit comme une phrase
 * (acteur, action, objet avec lien vers sa fiche) et se déplie sur ses anciennes et nouvelles
 * valeurs. Filtres dans l'URL : `q`, `acteur`, `type`, `periode` (+ `du`/`au`), `page`.
 * L'API n'a pas de filtre de date : une période s'obtient en parcourant les pages récentes.
 */
import { ChevronDown, CircleHelp, Clock, Search, X } from '@lucide/vue'
import {
  AUDIT_MAX_PAGE_SIZE,
  AUDIT_TYPE_FILTERS,
  auditActor,
  auditChanges,
  auditPeriodRange,
  describeAuditEntry,
  groupAuditByDay,
  type AuditLogEntry,
  type AuditPeriod
} from '~/composables/useAudit'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'view:audit' })

const route = useRoute()
const router = useRouter()
const { fetchAuditLogs, fetchAuditLogsInPeriod } = useAudit()

const PAGE_SIZE = 20
/** Pages de 100 parcourues au plus pour une période (soit les 1 000 entrées les plus récentes). */
const SCAN_PAGES = 10
const PERIODS: Array<{ value: AuditPeriod; label: string }> = [
  { value: '', label: 'Toute la période' },
  { value: 'jour', label: "Aujourd'hui" },
  { value: '7j', label: '7 derniers jours' },
  { value: '30j', label: '30 derniers jours' },
  { value: 'dates', label: 'Dates précises…' }
]

/* ---------- Filtres (URL) ---------- */
function param(name: string) {
  const v = route.query[name]
  return typeof v === 'string' ? v : ''
}
/** Met à jour l'URL ; tout changement de filtre revient à la page 1. */
function setQuery(patch: Record<string, string | undefined>, keepPage = false) {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) if (typeof v === 'string' && v) query[k] = v
  if (!keepPage && !('page' in patch)) delete query.page
  return router.replace({ query })
}

const filters = computed(() => ({
  q: param('q'),
  acteur: param('acteur'),
  type: AUDIT_TYPE_FILTERS.some(t => t.key === param('type')) ? param('type') : '',
  periode: (PERIODS.some(p => p.value === param('periode')) ? param('periode') : '') as AuditPeriod,
  du: param('du'),
  au: param('au'),
  page: Math.max(1, Number.parseInt(param('page'), 10) || 1)
}))
const activeType = computed(() => AUDIT_TYPE_FILTERS.find(t => t.key === filters.value.type) ?? null)
const range = computed(() => auditPeriodRange(filters.value.periode, filters.value.du, filters.value.au))
const hasFilters = computed(() => !!(filters.value.q || filters.value.acteur || filters.value.type || filters.value.periode))

const typeGroups = computed(() => {
  const groups: Array<{ label: string; items: typeof AUDIT_TYPE_FILTERS }> = []
  for (const t of AUDIT_TYPE_FILTERS) {
    const g = groups.find(x => x.label === t.group)
    if (g) g.items.push(t)
    else groups.push({ label: t.group, items: [t] })
  }
  return groups
})

const search = ref(filters.value.q)
let searchDebounce: ReturnType<typeof setTimeout> | undefined
watch(search, v => {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    if (v.trim() !== filters.value.q) setQuery({ q: v.trim() || undefined })
  }, 400)
})
watch(() => filters.value.q, v => {
  if (v !== search.value.trim()) search.value = v
})

function onPeriod(value: string) {
  setQuery({ periode: value || undefined, du: value === 'dates' ? filters.value.du || undefined : undefined, au: value === 'dates' ? filters.value.au || undefined : undefined })
}
function clearFilters() {
  search.value = ''
  router.replace({ query: {} })
}

const todayIso = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

/* ---------- Chargement ---------- */
const entries = ref<AuditLogEntry[]>([])
const total = ref(0)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const periodComplete = ref(true)
const expanded = ref<string[]>([])
/** Nom des acteurs déjà vus, pour l'étiquette du filtre « acteur ». */
const actorNames = ref<Record<string, string>>({})
let periodCache: { key: string; data: AuditLogEntry[]; complete: boolean } | null = null
let requestId = 0

function serverQuery() {
  return {
    search: filters.value.q || undefined,
    userId: filters.value.acteur || undefined,
    entityType: activeType.value?.entityType,
    action: activeType.value?.action
  }
}

async function load() {
  const id = ++requestId
  const f = filters.value
  state.value = 'loading'
  expanded.value = []
  try {
    if (range.value) {
      const key = JSON.stringify([serverQuery(), f.periode, f.du, f.au])
      if (periodCache?.key !== key) {
        const res = await fetchAuditLogsInPeriod(serverQuery(), range.value, SCAN_PAGES)
        if (id !== requestId) return
        periodCache = { key, ...res }
      }
      total.value = periodCache.data.length
      entries.value = periodCache.data.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE)
      periodComplete.value = periodCache.complete
    } else {
      const res = await fetchAuditLogs({ ...serverQuery(), sortOrder: 'DESC', limit: PAGE_SIZE, offset: (f.page - 1) * PAGE_SIZE })
      if (id !== requestId) return
      entries.value = res.data
      total.value = res.meta.total
      periodComplete.value = true
    }
    for (const e of entries.value) {
      const a = auditActor(e)
      if (a.userId && a.kind === 'user') actorNames.value[a.userId] = a.label
    }
    // Page hors limites (lien ancien, filtre plus étroit) : retour à la dernière page existante.
    if (!entries.value.length && total.value && f.page > 1) {
      setQuery({ page: String(pageCount(total.value, PAGE_SIZE)) }, true)
      return
    }
    state.value = 'ready'
  } catch {
    if (id === requestId) state.value = 'error'
  }
}
onMounted(load)
watch(() => route.query, load)

const pages = computed(() => pageCount(total.value, PAGE_SIZE))
function goToPage(p: number) {
  setQuery({ page: p > 1 ? String(p) : undefined }, true)
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

const actorLabel = computed(() => filters.value.acteur ? (actorNames.value[filters.value.acteur] ?? `Compte ${filters.value.acteur.slice(0, 8)}`) : '')
function filterActor(userId: string | null, label: string) {
  if (!userId) return
  actorNames.value[userId] = label
  setQuery({ acteur: userId })
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

/* ---------- Affichage ---------- */
const days = computed(() => groupAuditByDay(entries.value).map(g => ({
  ...g,
  rows: g.entries.map(e => {
    const s = describeAuditEntry(e)
    const self = s.target.kind === 'user' && s.target.id === s.actor.userId
    return { e, s, self, changes: auditChanges(e) }
  })
})))

function toggle(id: string) {
  expanded.value = expanded.value.includes(id) ? expanded.value.filter(x => x !== id) : [...expanded.value, id]
}
function time(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
function fullDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <!-- Filtres -->
    <div class="mb-4.5 flex flex-col gap-2.5">
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex h-[42px] min-w-[220px] flex-1 items-center gap-2 rounded-pill border border-[var(--border-default)] bg-white px-4 focus-within:border-green-600 md:max-w-[340px]">
          <Search class="h-4 w-4 flex-none text-[var(--text-faint)]" />
          <input v-model="search" type="search" aria-label="Rechercher dans le journal" placeholder="Description, nom d'un acteur…" class="w-full min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--text-faint)]">
        </div>

        <select
          :value="filters.type"
          aria-label="Type d'action"
          class="h-[42px] max-w-full cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none"
          @change="setQuery({ type: ($event.target as HTMLSelectElement).value || undefined })"
        >
          <option value="">Tous les types d'action</option>
          <optgroup v-for="g in typeGroups" :key="g.label" :label="g.label">
            <option v-for="t in g.items" :key="t.key" :value="t.key">{{ t.label }}</option>
          </optgroup>
        </select>

        <select
          :value="filters.periode"
          aria-label="Période"
          class="h-[42px] cursor-pointer rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold text-sand-900 outline-none"
          @change="onPeriod(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="p in PERIODS" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>

        <template v-if="filters.periode === 'dates'">
          <label class="flex h-[42px] items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-3.5">
            <span class="text-[12px] font-bold text-[var(--text-faint)]">Du</span>
            <input :value="filters.du" type="date" :max="filters.au || todayIso" class="bg-transparent text-[13px] outline-none" @change="setQuery({ du: ($event.target as HTMLInputElement).value || undefined })">
          </label>
          <label class="flex h-[42px] items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-3.5">
            <span class="text-[12px] font-bold text-[var(--text-faint)]">Au</span>
            <input :value="filters.au" type="date" :min="filters.du || undefined" :max="todayIso" class="bg-transparent text-[13px] outline-none" @change="setQuery({ au: ($event.target as HTMLInputElement).value || undefined })">
          </label>
        </template>

        <button v-if="hasFilters" type="button" class="flex h-[42px] items-center gap-1.5 rounded-pill px-3 text-[13px] font-bold text-[var(--text-muted)] hover:text-danger-fg" @click="clearFilters">
          <X class="h-3.5 w-3.5" /> Effacer
        </button>
      </div>

      <div v-if="filters.acteur" class="flex flex-wrap items-center gap-3">
        <span class="inline-flex items-center gap-1.5 rounded-pill border border-green-100 bg-green-50 py-1 pl-3.5 pr-1 text-[13px] font-bold text-green-800">
          Acteur : {{ actorLabel }}
          <button type="button" aria-label="Retirer le filtre acteur" class="grid h-7 w-7 place-items-center rounded-pill hover:bg-green-100" @click="setQuery({ acteur: undefined })">
            <X class="h-3.5 w-3.5" />
          </button>
        </span>
        <NuxtLink :to="`/admin/utilisateurs/${filters.acteur}`" class="text-[12.5px] font-bold text-green-700">Voir sa fiche</NuxtLink>
      </div>
    </div>

    <!-- Chargement / erreur -->
    <div v-if="state === 'loading'" class="flex flex-col gap-4.5">
      <DataSkeletonCard :height="260" :lines="0" />
      <DataSkeletonCard :height="180" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger le journal d'audit.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <p v-if="range && !periodComplete" class="mb-4 mt-0 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[13px] font-semibold text-warn-fg-deep">
        Seules les {{ (SCAN_PAGES * AUDIT_MAX_PAGE_SIZE).toLocaleString('fr-FR') }} entrées les plus récentes ont été parcourues : la période n'est peut-être pas complète. Affinez avec un acteur ou un type d'action.
      </p>

      <p v-if="!entries.length && !hasFilters" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        Le journal est vide : aucune action n'a encore été enregistrée.
      </p>
      <div v-else-if="!entries.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
        Aucune entrée pour ces filtres.
        <button type="button" class="ml-1 font-bold text-green-700" @click="clearFilters">Effacer les filtres</button>
      </div>

      <template v-else>
        <p class="mb-3 mt-0 text-[13px] text-[var(--text-muted)]">
          <span class="font-mono font-bold text-[var(--text-primary)]">{{ total.toLocaleString('fr-FR') }}</span> entrée{{ total > 1 ? 's' : '' }}<template v-if="range"> sur la période</template><template v-else-if="hasFilters"> pour ces filtres</template>
        </p>

        <div v-for="day in days" :key="day.key" class="mb-4.5">
          <p class="mb-2 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ day.label }}</p>
          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-1 sm:px-5">
            <div v-for="{ e, s, self, changes } in day.rows" :key="e.id" class="border-b border-sand-200 last:border-b-0">
              <div class="flex items-start gap-3 py-3">
                <span class="hidden w-[42px] flex-none pt-[7px] font-mono text-xs text-[var(--text-faint)] sm:block">{{ time(e.created_at) }}</span>
                <CoreAvatar v-if="s.actor.kind === 'user'" :name="s.actor.label" :size="32" />
                <span v-else class="grid h-8 w-8 flex-none place-items-center rounded-pill bg-sand-100 text-[var(--text-muted)]" :title="s.actor.label">
                  <Clock v-if="s.actor.kind === 'system'" class="h-4 w-4" :stroke-width="1.9" />
                  <CircleHelp v-else class="h-4 w-4" :stroke-width="1.9" />
                </span>

                <div class="min-w-0 flex-1">
                  <p class="m-0 text-[13.5px] leading-[1.45] [overflow-wrap:anywhere]">
                    <template v-if="s.actor.kind !== 'unknown'">
                      <NuxtLink v-if="s.actor.userId" :to="`/admin/utilisateurs/${s.actor.userId}`" class="font-bold hover:text-green-700">{{ s.actor.label }}</NuxtLink>
                      <strong v-else>{{ s.actor.label }}</strong>
                      {{ s.verb || `· ${s.statement}` }}
                    </template>
                    <template v-else>{{ s.statement }}</template>
                  </p>
                  <p class="mb-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-faint)]">
                    <span class="font-mono sm:hidden">{{ time(e.created_at) }}</span>
                    <template v-if="!self">
                      <NuxtLink v-if="s.target.to" :to="s.target.to" class="font-bold text-green-700 [overflow-wrap:anywhere]">{{ s.target.label }}</NuxtLink>
                      <span v-else class="[overflow-wrap:anywhere]">{{ s.target.label }}</span>
                    </template>
                    <span v-if="s.reason" class="text-[var(--text-secondary)]">Motif : « {{ s.reason }} »</span>
                    <AdminBadge v-if="e.source === 'cron'" tone="neutral">Automatique</AdminBadge>
                    <AdminBadge v-else-if="e.source === 'webhook'" tone="info">Webhook</AdminBadge>
                  </p>
                </div>

                <button
                  type="button"
                  class="grid h-8 w-8 flex-none place-items-center rounded-pill text-[var(--text-faint)] hover:bg-sand-100"
                  :aria-expanded="expanded.includes(e.id)"
                  :aria-label="expanded.includes(e.id) ? 'Masquer le détail' : 'Voir le détail'"
                  @click="toggle(e.id)"
                >
                  <ChevronDown class="h-4 w-4 transition-transform" :class="expanded.includes(e.id) ? 'rotate-180' : ''" :stroke-width="1.9" />
                </button>
              </div>

              <div v-if="expanded.includes(e.id)" class="mb-3.5 rounded-md bg-[var(--surface-page)] p-3.5 sm:ml-[86px]">
                <template v-if="changes.length">
                  <p class="mb-1 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ e.before_state ? 'Valeurs modifiées' : 'Valeurs enregistrées' }}</p>
                  <div v-for="c in changes" :key="c.key" class="grid grid-cols-1 gap-0.5 border-b border-sand-200 py-2 last:border-b-0 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] sm:gap-3">
                    <span class="text-[12.5px] font-bold text-[var(--text-secondary)]">
                      {{ c.label }}<span v-if="c.label !== c.key" class="ml-1.5 font-mono text-[11px] font-normal text-[var(--text-faint)]">{{ c.key }}</span>
                    </span>
                    <span class="min-w-0 font-mono text-[12px] [overflow-wrap:anywhere]">
                      <template v-if="c.before !== null && c.after !== null">
                        <span class="text-[var(--text-faint)] line-through">{{ c.before }}</span> → <span class="font-bold">{{ c.after }}</span>
                      </template>
                      <template v-else-if="c.after !== null">{{ c.after }}</template>
                      <template v-else><span class="text-[var(--text-faint)] line-through">{{ c.before }}</span> (retiré)</template>
                    </span>
                  </div>
                </template>
                <p v-else class="m-0 text-[12.5px] text-[var(--text-muted)]">L'API ne fournit pas les anciennes et nouvelles valeurs pour cette action.</p>

                <dl class="mb-0 mt-3 grid grid-cols-1 gap-x-5 gap-y-1.5 text-[12px] sm:grid-cols-2">
                  <div v-if="s.verb && e.description" class="sm:col-span-2">
                    <dt class="inline text-[var(--text-faint)]">Description de l'API : </dt><dd class="m-0 inline [overflow-wrap:anywhere]">{{ e.description }}</dd>
                  </div>
                  <div>
                    <dt class="inline text-[var(--text-faint)]">Date : </dt><dd class="m-0 inline font-mono">{{ fullDate(e.created_at) }}</dd>
                  </div>
                  <div>
                    <dt class="inline text-[var(--text-faint)]">Action : </dt><dd class="m-0 inline font-mono">{{ e.entity_type }} · {{ e.action }}</dd>
                  </div>
                  <div class="sm:col-span-2">
                    <dt class="inline text-[var(--text-faint)]">Objet : </dt><dd class="m-0 inline font-mono [overflow-wrap:anywhere]">{{ e.entity_id }}</dd>
                  </div>
                  <div v-if="e.ip_address">
                    <dt class="inline text-[var(--text-faint)]">Adresse IP : </dt><dd class="m-0 inline font-mono">{{ e.ip_address }}</dd>
                  </div>
                  <div v-if="e.user_agent" class="sm:col-span-2">
                    <dt class="inline text-[var(--text-faint)]">Navigateur : </dt><dd class="m-0 inline [overflow-wrap:anywhere]">{{ e.user_agent }}</dd>
                  </div>
                </dl>

                <div v-if="(s.actor.userId && filters.acteur !== s.actor.userId) || s.target.to" class="mt-3 flex flex-wrap items-center gap-3">
                  <AdminButton v-if="s.actor.userId && filters.acteur !== s.actor.userId" size="sm" variant="secondary" @click="filterActor(s.actor.userId, s.actor.label)">
                    Toutes les actions de {{ s.actor.label }}
                  </AdminButton>
                  <NuxtLink v-if="s.target.to" :to="s.target.to" class="text-[12.5px] font-bold text-green-700">
                    {{ s.target.kind === 'property' ? 'Ouvrir la fiche du bien' : 'Ouvrir la fiche du compte' }}
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>
        </div>

        <AdminPagination :page="filters.page" :page-count="pages" @update:page="goToPage" />
      </template>
    </template>
  </div>
</template>
