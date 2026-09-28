<script setup lang="ts">
import type { AvailabilityBlock } from '~/types/property'
import { dayState, formatDayLong, formatDayNumeric, localTodayIso, monthGrid, monthIndex, monthOf, monthTitle, pickDay, rangeSummary, shiftMonth, WEEKDAY_INITIALS, type MonthRef } from '~/utils/dateRangeCalendar'

/**
 * Choix des dates d'un séjour (fiche d'un logement). Deux champs « Arrivée /
 * Départ » ouvrent un calendrier par mois : deux mois côte à côte (un seul sur
 * mobile), jours de la semaine, jours pris ou passés barrés, plage surlignée,
 * résumé « 2 nuits · 16 oct. 2026 - 18 oct. 2026 ». Remplace la grille de 60
 * jours sans mois ni jours de la semaine.
 */
const props = defineProps<{
  checkIn: string | null
  checkOut: string | null
  blocks: Pick<AvailabilityBlock, 'start_date' | 'end_date'>[]
  minNights?: number | null
  maxNights?: number | null
}>()
const emit = defineEmits<{ 'update:checkIn': [string | null]; 'update:checkOut': [string | null] }>()

/** Navigation limitée à 12 mois : au-delà, le logement n'est pas réservable en ligne. */
const MONTHS_AHEAD = 11

const open = ref(false)
const today = ref(localTodayIso())
const base = ref<MonthRef>(monthOf(today.value))
const hover = ref<string | null>(null)

const rules = computed(() => ({ today: today.value, blocks: props.blocks, minNights: props.minNights, maxNights: props.maxNights }))
const sel = computed(() => ({ checkIn: props.checkIn, checkOut: props.checkOut }))
const summary = computed(() => rangeSummary(sel.value, props.minNights))
const pickingEnd = computed(() => !!props.checkIn && !props.checkOut)

const firstMonth = computed(() => monthOf(today.value))
const canPrev = computed(() => monthIndex(base.value) > monthIndex(firstMonth.value))
const canNext = computed(() => monthIndex(base.value) < monthIndex(firstMonth.value) + MONTHS_AHEAD - 1)
const months = computed(() => [base.value, shiftMonth(base.value, 1)].map(m => ({ ref: m, title: monthTitle(m), weeks: monthGrid(m) })))

function openPicker() {
  today.value = localTodayIso()
  base.value = props.checkIn ? monthOf(props.checkIn) : monthOf(today.value)
  if (monthIndex(base.value) < monthIndex(firstMonth.value)) base.value = firstMonth.value
  open.value = true
}
function close() {
  open.value = false
  hover.value = null
}
function select(iso: string) {
  const next = pickDay(iso, sel.value, rules.value)
  emit('update:checkIn', next.checkIn)
  emit('update:checkOut', next.checkOut)
}
function clearAll() {
  emit('update:checkIn', null)
  emit('update:checkOut', null)
}
function clearOut() {
  emit('update:checkOut', null)
}
function state(iso: string) {
  return dayState(iso, { ...sel.value, hover: hover.value }, rules.value)
}
/** Un départ est posé, ou survolé pendant son choix : la plage peut être dessinée. */
const hasEnd = computed(() => !!props.checkOut || (pickingEnd.value && !!hover.value && state(hover.value).end))
/** Fond continu de la plage : demi-case à droite de l'arrivée, à gauche du départ. */
function cellBand(iso: string) {
  const s = state(iso)
  if (s.inRange) return 'bg-green-50'
  if (s.start && hasEnd.value && !s.end) return 'bg-[linear-gradient(90deg,transparent_50%,var(--color-green-50)_50%)]'
  if (s.end && !s.start) return 'bg-[linear-gradient(90deg,var(--color-green-50)_50%,transparent_50%)]'
  return ''
}
function dayClass(iso: string) {
  const s = state(iso)
  if (s.start || s.end) return 'bg-green-900 font-bold text-white'
  if (s.struck) return 'cursor-not-allowed text-sand-400 line-through'
  if (s.disabled) return 'cursor-not-allowed text-sand-400'
  return 'font-semibold text-[var(--text-primary)] hover:ring-[1.5px] hover:ring-inset hover:ring-sand-900'
}
function dayLabel(iso: string) {
  const s = state(iso)
  const extra = s.start ? ', arrivée' : s.end ? ', départ' : s.departureOnly ? ', départ seulement' : s.struck ? ', indisponible' : s.disabled ? ', non disponible pour ce séjour' : ''
  return `${formatDayLong(iso)}${extra}`
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="relative">
    <div class="grid grid-cols-2 overflow-hidden rounded-md border border-[var(--border-default)]" data-testid="dates-trigger">
      <button type="button" class="border-r border-[var(--border-default)] px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--surface-page)]" @click="openPicker">
        <span class="block text-[10.5px] font-black uppercase tracking-[.06em] text-[var(--text-primary)]">Arrivée</span>
        <span class="mt-0.5 block text-[14px]" :class="checkIn ? 'text-[var(--text-primary)]' : 'text-[var(--text-faint)]'">{{ checkIn ? formatDayNumeric(checkIn) : 'Ajouter une date' }}</span>
      </button>
      <button type="button" class="px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--surface-page)]" @click="openPicker">
        <span class="block text-[10.5px] font-black uppercase tracking-[.06em] text-[var(--text-primary)]">Départ</span>
        <span class="mt-0.5 block text-[14px]" :class="checkOut ? 'text-[var(--text-primary)]' : 'text-[var(--text-faint)]'">{{ checkOut ? formatDayNumeric(checkOut) : 'Ajouter une date' }}</span>
      </button>
    </div>

    <template v-if="open">
      <div class="fixed inset-0 z-[80] bg-black/40 md:bg-transparent" @click="close" />
      <div
        class="fixed inset-x-0 bottom-0 z-[81] max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-panel animate-[im-rise_.22s_ease_both] md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-[calc(100%+10px)] md:max-h-none md:w-[720px] md:max-w-[calc(100vw-2rem)] md:rounded-3xl md:p-7"
        role="dialog"
        aria-label="Choisir les dates du séjour"
        data-testid="dates-picker"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="m-0 font-display text-[22px] font-bold tracking-[-.02em]">{{ summary.title }}</p>
            <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">{{ summary.subtitle }}</p>
          </div>
          <div class="hidden grid-cols-2 rounded-xl border border-[var(--border-default)] md:grid">
            <div class="flex min-w-[170px] items-center gap-2 rounded-xl px-3.5 py-2" :class="!pickingEnd ? 'ring-2 ring-inset ring-sand-900' : ''">
              <div class="flex-1">
                <p class="m-0 text-[10.5px] font-black uppercase tracking-[.06em]">Arrivée</p>
                <p class="m-0 text-[14px]" :class="checkIn ? '' : 'text-[var(--text-faint)]'">{{ checkIn ? formatDayNumeric(checkIn) : 'JJ/MM/AAAA' }}</p>
              </div>
              <button v-if="checkIn" type="button" class="grid h-7 w-7 place-items-center rounded-pill text-[13px] hover:bg-sand-100" aria-label="Effacer l'arrivée" @click="clearAll">✕</button>
            </div>
            <div class="flex min-w-[170px] items-center gap-2 rounded-xl px-3.5 py-2" :class="pickingEnd ? 'ring-2 ring-inset ring-sand-900' : ''">
              <div class="flex-1">
                <p class="m-0 text-[10.5px] font-black uppercase tracking-[.06em]">Départ</p>
                <p class="m-0 text-[14px]" :class="checkOut ? '' : 'text-[var(--text-faint)]'">{{ checkOut ? formatDayNumeric(checkOut) : 'JJ/MM/AAAA' }}</p>
              </div>
              <button v-if="checkOut" type="button" class="grid h-7 w-7 place-items-center rounded-pill text-[13px] hover:bg-sand-100" aria-label="Effacer le départ" @click="clearOut">✕</button>
            </div>
          </div>
        </div>

        <div class="relative mt-6 grid grid-cols-1 gap-10 md:grid-cols-2">
          <button type="button" class="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-pill text-lg transition-colors hover:bg-sand-100 disabled:opacity-25" :disabled="!canPrev" aria-label="Mois précédent" @click="base = shiftMonth(base, -1)">‹</button>
          <button type="button" class="absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-pill text-lg transition-colors hover:bg-sand-100 disabled:opacity-25" :disabled="!canNext" aria-label="Mois suivant" @click="base = shiftMonth(base, 1)">›</button>
          <div v-for="(m, i) in months" :key="`${m.ref.year}-${m.ref.month}`" :class="i === 1 ? 'hidden md:block' : ''">
            <p class="m-0 text-center text-[15.5px] font-bold" data-testid="month-title">{{ m.title }}</p>
            <div class="mt-4 grid grid-cols-7 text-center text-[11.5px] font-bold text-[var(--text-muted)]">
              <span v-for="(d, k) in WEEKDAY_INITIALS" :key="k" class="py-1">{{ d }}</span>
            </div>
            <div v-for="(week, w) in m.weeks" :key="w" class="grid grid-cols-7">
              <div v-for="(iso, d) in week" :key="d" class="py-[3px]" :class="iso ? cellBand(iso) : ''">
                <button
                  v-if="iso"
                  type="button"
                  class="mx-auto grid h-10 w-10 place-items-center rounded-pill text-[14px] transition-colors"
                  :class="dayClass(iso)"
                  :disabled="state(iso).disabled && !state(iso).start"
                  :aria-label="dayLabel(iso)"
                  :aria-pressed="state(iso).start || state(iso).end"
                  :data-iso="iso"
                  @click="select(iso)"
                  @mouseenter="hover = iso"
                  @mouseleave="hover = null"
                >{{ Number(iso.slice(8, 10)) }}</button>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
          <p class="m-0 text-[12px] text-[var(--text-faint)]">Jours barrés : déjà pris ou passés.</p>
          <div class="flex items-center gap-4">
            <button type="button" class="text-[14px] font-bold underline disabled:opacity-40" :disabled="!checkIn" @click="clearAll">Effacer les dates</button>
            <button type="button" class="rounded-md bg-sand-900 px-5 py-2.5 text-[14px] font-bold text-white" @click="close">Fermer</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
