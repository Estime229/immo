<script setup lang="ts">
/**
 * Un logement du bien : état, prix, détails dépliables et modération individuelle
 * (suspendre avec motif / réactiver), confirmée en ligne sous la ligne.
 */
import { ChevronDown } from '@lucide/vue'
import {
  UNIT_STATUS_LABELS,
  UNIT_SUSPEND_REASONS,
  refLabel,
  unitPriceSuffix,
  type PropertyRefs,
  type PropertyUnit
} from '~/composables/useProperty'

const props = defineProps<{
  unit: PropertyUnit
  /** Bien parent ; pour un logement indépendant, l'id du logement lui-même. */
  propertyId: string
  fallbackPhoto: string | null
  refs: PropertyRefs
  canModerate: boolean
  confirming: string | null
}>()

const emit = defineEmits<{
  'update:confirming': [string | null]
  changed: [patch: Partial<PropertyUnit>]
}>()

const { moderateUnit } = useProperty()

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'warning' | 'info'> = {
  available: 'success',
  occupied: 'neutral',
  notice_given: 'warning',
  maintenance: 'warning',
  coming_soon: 'info'
}

const suspendKey = computed(() => `unit-suspend:${props.unit.id}`)
const reactivateKey = computed(() => `unit-reactivate:${props.unit.id}`)

const thumb = computed(() => {
  const media = [...(props.unit.unit_media ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.rank - b.rank)
  return media[0]?.url ?? props.fallbackPhoto
})
const price = computed(() => Number(props.unit.price) || 0)

const summary = computed(() => {
  const u = props.unit
  return [
    u.ref_type?.labels?.fr,
    u.bedrooms_count ? `${u.bedrooms_count} ch.` : '',
    u.bathrooms_count ? `${u.bathrooms_count} salle${u.bathrooms_count > 1 ? 's' : ''} d'eau` : '',
    u.surface_m2 ? `${u.surface_m2} m²` : '',
    refLabel(props.refs, 'FURNISHED_LEVEL', u.furnished_level)
  ].filter(Boolean).join(' · ')
})

function formatDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}
function months(n: number | null) {
  return n != null ? `${n} mois` : ''
}

/** Détails non vides seulement — pas de mur de tirets. */
const details = computed(() => {
  const u = props.unit
  const duration = u.min_duration_days && u.max_duration_days
    ? `${u.min_duration_days} à ${u.max_duration_days} jours`
    : u.min_duration_days ? `${u.min_duration_days} jours minimum` : u.max_duration_days ? `${u.max_duration_days} jours maximum` : ''
  return [
    { label: 'Étage', value: u.floor == null ? '' : u.floor === 0 ? 'Rez-de-chaussée' : `${u.floor}` },
    { label: 'Toilettes', value: refLabel(props.refs, 'TOILET_TYPE', u.toilet_type) },
    { label: 'Eau', value: refLabel(props.refs, 'WATER_SOURCE', u.water_source) },
    { label: 'Compteur', value: refLabel(props.refs, 'METER_TYPE', u.meter_type) },
    { label: 'Disponible le', value: formatDate(u.available_from) },
    { label: 'Caution', value: months(u.caution_months) },
    { label: 'Avance', value: months(u.avance_months) },
    { label: 'Prépayé', value: months(u.prepaye_months) },
    { label: 'Frais de dossier', value: Number(u.frais_dossier) > 0 ? formatFcfaShort(Number(u.frais_dossier)) : '' },
    { label: 'Durée de séjour', value: duration }
  ].filter(d => d.value)
})
const features = computed(() => (props.unit.resolved_features ?? []).map(f => f.labels?.fr ?? f.code))
const unitPhotos = computed(() => [...(props.unit.unit_media ?? [])].sort((a, b) => a.rank - b.rank))

const open = ref(false)

/* ---------- Modération ---------- */
const reason = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')

function ask(key: string) {
  reason.value = ''
  error.value = ''
  notice.value = ''
  emit('update:confirming', key)
}

async function setSuspended(suspended: boolean) {
  const r = reason.value.trim()
  if (suspended && !r) return
  busy.value = true
  error.value = ''
  try {
    const res = await moderateUnit(props.propertyId, props.unit.id, suspended, suspended ? r : undefined)
    const isSuspended = res?.is_suspended ?? suspended
    emit('changed', {
      is_suspended: isSuspended,
      suspended_reason: isSuspended ? r : null,
      suspended_at: isSuspended ? new Date().toISOString() : null
    })
    notice.value = isSuspended
      ? 'Logement suspendu : il n\'apparaît plus dans la recherche. Le propriétaire reçoit une notification.'
      : 'Logement réactivé : il revient dans la recherche s\'il est libre.'
    emit('update:confirming', null)
  } catch (e: any) {
    error.value = e?.message || (suspended ? 'La suspension a échoué. Réessayez.' : 'La réactivation a échoué. Réessayez.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="border-b border-sand-200 py-3.5 last:border-b-0">
    <div class="flex items-start gap-3">
      <div class="h-12 w-12 flex-none rounded-md bg-sand-200 bg-cover bg-center" :style="thumb ? { backgroundImage: `url(${thumb})` } : {}" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p class="m-0 text-sm font-bold">{{ unit.name }}</p>
          <AdminBadge v-if="unit.is_suspended" tone="danger">Suspendu</AdminBadge>
          <AdminBadge :tone="STATUS_TONE[unit.unit_status] ?? 'neutral'">{{ UNIT_STATUS_LABELS[unit.unit_status] ?? unit.unit_status }}</AdminBadge>
        </div>
        <p v-if="summary" class="mb-0 mt-1 text-[12.5px] text-[var(--text-muted)]">{{ summary }}</p>
        <p v-if="price" class="mb-0 mt-1 font-mono text-[13.5px] font-bold text-green-900 sm:hidden">
          {{ formatFcfaShort(price) }}<span class="font-body text-[11.5px] font-medium text-[var(--text-muted)]"> {{ unitPriceSuffix(unit) }}</span>
        </p>
        <p v-if="unit.is_suspended && (unit.suspended_reason || unit.suspended_at)" class="mb-0 mt-1.5 text-[12.5px] text-danger-fg">
          <template v-if="unit.suspended_reason">Motif : {{ unit.suspended_reason }}</template>
          <template v-if="unit.suspended_at"> · depuis le {{ formatDate(unit.suspended_at) }}</template>
        </p>
      </div>
      <p v-if="price" class="m-0 hidden flex-none text-right font-mono text-[14px] font-bold text-green-900 sm:block">
        {{ formatFcfaShort(price) }}<span class="block font-body text-[11.5px] font-medium text-[var(--text-muted)]">{{ unitPriceSuffix(unit) }}</span>
      </p>
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-[60px]">
      <button
        type="button"
        class="inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-bold text-green-700"
        :aria-expanded="open"
        @click="open = !open"
      >
        {{ open ? 'Masquer les détails' : 'Détails' }}
        <ChevronDown class="h-3.5 w-3.5 transition-transform" :class="open ? 'rotate-180' : ''" :stroke-width="1.9" />
      </button>
      <template v-if="canModerate && confirming !== suspendKey && confirming !== reactivateKey">
        <button v-if="unit.is_suspended" type="button" class="cursor-pointer text-[12.5px] font-bold text-green-700" @click="ask(reactivateKey)">Réactiver ce logement</button>
        <button v-else type="button" class="cursor-pointer text-[12.5px] font-bold text-danger-fg" @click="ask(suspendKey)">Suspendre ce logement</button>
      </template>
    </div>

    <div v-if="open" class="mt-3 animate-[im-fade_.2s_ease_backwards] rounded-lg bg-sand-50 p-3.5 sm:ml-[60px]">
      <dl v-if="details.length" class="m-0 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <div v-for="d in details" :key="d.label" class="min-w-0">
          <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ d.label }}</dt>
          <dd class="m-0 mt-0.5 text-[13px] font-semibold">{{ d.value }}</dd>
        </div>
      </dl>
      <div v-if="features.length" :class="details.length ? 'mt-3.5' : ''">
        <p class="mb-1.5 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Équipements</p>
        <div class="flex flex-wrap gap-1.5">
          <span v-for="f in features" :key="f" class="rounded-pill bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--text-secondary)]">{{ f }}</span>
        </div>
      </div>
      <p v-if="unit.description?.fr" class="mb-0 whitespace-pre-line text-[13px] leading-[1.55] text-[var(--text-secondary)]" :class="details.length || features.length ? 'mt-3.5' : 'mt-0'">{{ unit.description.fr }}</p>
      <div v-if="unitPhotos.length" class="mt-3.5 flex gap-2 overflow-x-auto pb-1">
        <a v-for="m in unitPhotos" :key="m.id" :href="m.url" target="_blank" rel="noopener" class="block h-14 w-[72px] flex-none rounded-md bg-sand-200 bg-cover bg-center" :style="{ backgroundImage: `url(${m.url})` }" :aria-label="`Ouvrir une photo de ${unit.name}`" />
      </div>
      <p v-if="!details.length && !features.length && !unit.description?.fr && !unitPhotos.length" class="m-0 text-[13px] text-[var(--text-muted)]">Aucun détail renseigné pour ce logement.</p>
    </div>

    <div v-if="confirming === suspendKey || confirming === reactivateKey" class="mt-3 sm:ml-[60px]">
      <AdminInlineConfirm
        v-if="confirming === suspendKey"
        tone="danger"
        :message="`Suspendre « ${unit.name} » ? Il disparaît de la recherche jusqu'à sa réactivation, sans rien supprimer. Le propriétaire reçoit une notification.`"
        confirm-label="Suspendre"
        :loading="busy"
        :disabled="!reason.trim()"
        @confirm="setSuspended(true)"
        @cancel="emit('update:confirming', null)"
      >
        <AdminPropertyReasonField v-model="reason" :reasons="UNIT_SUSPEND_REASONS" />
      </AdminInlineConfirm>
      <AdminInlineConfirm
        v-else
        tone="warning"
        :message="`Réactiver « ${unit.name} » ? Il revient dans la recherche dès qu'il est libre.`"
        confirm-label="Réactiver"
        :loading="busy"
        @confirm="setSuspended(false)"
        @cancel="emit('update:confirming', null)"
      />
      <p v-if="error" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ error }}</p>
    </div>

    <p v-if="notice" class="mb-0 mt-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900 sm:ml-[60px]">{{ notice }}</p>
  </div>
</template>
