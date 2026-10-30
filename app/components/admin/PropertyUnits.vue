<script setup lang="ts">
/** Logements du bien, chacun avec son état et sa modération individuelle. */
import {
  propertyUnitsSummary,
  suspendedUnitsCount,
  type PropertyDetail,
  type PropertyRefs,
  type PropertyUnit
} from '~/composables/useProperty'

const props = defineProps<{
  property: PropertyDetail
  refs: PropertyRefs
  coverPhoto: string | null
  canModerate: boolean
  confirming: string | null
}>()

const emit = defineEmits<{
  'update:confirming': [string | null]
  'unit-changed': [unitId: string, patch: Partial<PropertyUnit>]
}>()

const units = computed(() => props.property.units ?? [])
const summary = computed(() => propertyUnitsSummary(units.value))
const suspended = computed(() => suspendedUnitsCount(units.value))
</script>

<template>
  <section class="rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-4.5">
    <div class="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 class="m-0 text-[15px] font-bold">Logements <span class="font-mono text-[var(--text-faint)]">{{ units.length }}</span></h2>
      <p v-if="summary" class="m-0 text-[12.5px] text-[var(--text-muted)]">
        {{ summary }}<span v-if="suspended" class="font-semibold text-danger-fg"> · {{ suspended }} suspendu{{ suspended > 1 ? 's' : '' }}</span>
      </p>
    </div>

    <p v-if="!units.length" class="mb-1 mt-3 rounded-md border border-dashed border-[var(--border-default)] px-4 py-6 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucun logement : le bien n'apparaît pas dans la recherche tant qu'il n'en a pas.
    </p>

    <AdminPropertyUnitRow
      v-for="u in units"
      :key="u.id"
      :unit="u"
      :property-id="u.property_id ?? property.id"
      :fallback-photo="coverPhoto"
      :refs="refs"
      :can-moderate="canModerate"
      :confirming="confirming"
      @update:confirming="emit('update:confirming', $event)"
      @changed="emit('unit-changed', u.id, $event)"
    />
  </section>
</template>
