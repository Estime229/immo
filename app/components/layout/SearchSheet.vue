<script setup lang="ts">
import { buildSearchQuery, digitsOnly, draftFromQuery, type RentalChoice, type SearchDraft } from '~/utils/searchPill'

/**
 * Recherche plein écran ouverte depuis la pilule de l'en-tête mobile. Mène à
 * `/recherche` avec les mêmes paramètres que la barre de l'accueil (q, city,
 * budget) plus `mode` (nuit/mois), déjà lu par cette page.
 */
const open = defineModel<boolean>('open', { required: true })

const route = useRoute()
const refData = useReferenceData()

const draft = reactive<SearchDraft>({ q: '', city: '', budget: '', mode: 'tous' })
const cities = ref<{ id: string; name: string }[]>([])

const MODES: { key: RentalChoice; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'nuit', label: 'À la nuit' },
  { key: 'mois', label: 'Au mois' }
]

/** À chaque ouverture : on repart de la recherche affichée (si l'on est sur /recherche), sinon d'un formulaire vide. */
watch(open, async isOpen => {
  if (!isOpen) return
  Object.assign(draft, route.path === '/recherche' ? draftFromQuery(route.query) : { q: '', city: '', budget: '', mode: 'tous' })
  if (!cities.value.length) {
    try {
      cities.value = await refData.fetchCities()
    } catch {
      // Sans la liste, le champ Ville propose « Toutes » seulement — la recherche reste possible.
    }
  }
})

function onBudgetInput(e: Event) {
  draft.budget = digitsOnly((e.target as HTMLInputElement).value)
}
const budgetDisplay = computed(() => (draft.budget ? Number(draft.budget).toLocaleString('fr-FR') : ''))

function reset() {
  Object.assign(draft, { q: '', city: '', budget: '', mode: 'tous' })
}

function submit() {
  open.value = false
  navigateTo({ path: '/recherche', query: buildSearchQuery(draft) })
}
</script>

<template>
  <LayoutBottomSheet v-model:open="open" title="Rechercher un logement">
    <form class="flex flex-col gap-3 pt-1" @submit.prevent="submit">
      <div class="grid grid-cols-3 gap-1 rounded-pill bg-sand-200 p-1" role="radiogroup" aria-label="Type de location">
        <button
          v-for="m in MODES"
          :key="m.key"
          type="button"
          role="radio"
          :aria-checked="draft.mode === m.key"
          class="rounded-pill py-2.5 text-[13.5px] font-bold transition-all duration-[var(--duration-base)]"
          :class="draft.mode === m.key ? 'bg-white text-green-800 shadow-card' : 'text-[var(--text-secondary)]'"
          @click="draft.mode = m.key"
        >{{ m.label }}</button>
      </div>

      <label class="block rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 shadow-hairline transition-colors focus-within:border-green-600">
        <span class="block text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Où</span>
        <input v-model="draft.q" type="search" enterkeyhint="search" placeholder="Quartier, type de logement…" class="mt-1 w-full border-0 bg-transparent text-[16px] font-semibold text-[var(--text-primary)] outline-none placeholder:font-medium placeholder:text-[var(--text-faint)]">
      </label>

      <label class="relative block rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 shadow-hairline transition-colors focus-within:border-green-600">
        <span class="block text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Ville</span>
        <select v-model="draft.city" class="mt-1 w-full cursor-pointer appearance-none border-0 bg-transparent text-[16px] font-semibold text-[var(--text-primary)] outline-none">
          <option value="">Toutes les villes</option>
          <option v-for="c in cities" :key="c.id" :value="c.name">{{ c.name }}</option>
        </select>
        <span class="pointer-events-none absolute bottom-3.5 right-4 text-[12px] text-[var(--text-faint)]">▾</span>
      </label>

      <label class="block rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3 shadow-hairline transition-colors focus-within:border-green-600">
        <span class="block text-[11px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Budget max</span>
        <span class="mt-1 flex items-baseline gap-1.5">
          <input :value="budgetDisplay" inputmode="numeric" placeholder="Peu importe" class="w-full border-0 bg-transparent text-[16px] font-semibold text-[var(--text-primary)] outline-none placeholder:font-medium placeholder:text-[var(--text-faint)]" @input="onBudgetInput">
          <span v-if="draft.budget" class="text-[13px] font-bold text-[var(--text-muted)]">FCFA</span>
        </span>
      </label>

      <div class="mt-2 flex items-center gap-3">
        <button type="button" class="px-2 py-3 text-[14.5px] font-bold text-sand-900 underline underline-offset-4" @click="reset">Effacer</button>
        <button type="submit" class="flex flex-1 items-center justify-center gap-2.5 rounded-pill bg-[image:var(--action-primary)] py-3.5 text-[15.5px] font-bold text-white shadow-action transition-transform active:scale-[.98]">
          <LayoutNavIcon name="search" :size="19" />
          Rechercher
        </button>
      </div>
    </form>
  </LayoutBottomSheet>
</template>
