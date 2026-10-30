<script setup lang="ts">
/**
 * En-tête et informations du bien. L'édition (nom, état, description — les champs que l'admin
 * pouvait déjà modifier) passe par un mode explicite : « Modifier » → formulaire → Enregistrer / Annuler.
 */
import { MapPin, Pencil } from '@lucide/vue'
import {
  PROPERTY_EDIT_STATUSES,
  PROPERTY_STATUS_LABELS,
  refLabel,
  humanizeCode,
  type PropertyDetail,
  type PropertyRefs,
  type PropertyStatus
} from '~/composables/useProperty'
import { PROPERTY_CHARACTERISTICS } from '~/utils/propertyForm'
import { preciseLocation, toCoordinate } from '~/utils/geo'

const props = defineProps<{ property: PropertyDetail; refs: PropertyRefs; canEdit: boolean }>()
const emit = defineEmits<{ saved: [] }>()

const { updateProperty } = useProperty()

const STATUS_TONE: Record<PropertyStatus, 'success' | 'neutral' | 'warning' | 'info'> = {
  available: 'success',
  occupied: 'neutral',
  maintenance: 'warning',
  coming_soon: 'info'
}

const isVirtual = computed(() => props.property._virtual === true)
const location = computed(() => [props.property.address, props.property.neighborhood?.name, props.property.city?.name].filter(Boolean).join(', '))
const gps = computed(() => preciseLocation(props.property.gps_latitude, props.property.gps_longitude))
const gpsOutside = computed(() => !gps.value && toCoordinate(props.property.gps_latitude) !== null && toCoordinate(props.property.gps_longitude) !== null)
const mapsUrl = computed(() => (gps.value ? `https://www.google.com/maps?q=${gps.value.lat},${gps.value.lng}` : null))

/** Équipements du bâtiment cochés ; les clés inconnues restent affichées, lisibles. */
const equipments = computed(() => Object.entries(props.property.characteristics ?? {})
  .filter(([, v]) => v === true || (typeof v === 'string' && v.trim()))
  .map(([k, v]) => {
    const label = PROPERTY_CHARACTERISTICS.find(c => c.key === k)?.label ?? humanizeCode(k)
    return v === true ? label : `${label} : ${v}`
  }))

function formatDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
}

const facts = computed(() => {
  const p = props.property
  const units = p.units?.length ?? 0
  return [
    { label: 'Type de bâtiment', value: isVirtual.value ? 'Logement indépendant' : refLabel(props.refs, 'PROPERTY_TYPE', p.building_type) || '—' },
    { label: 'Logements', value: `${units}`, mono: true },
    { label: 'Vitrine du propriétaire', value: p.is_publicly_listed ? 'Affiché' : 'Masqué' },
    { label: 'Ajouté le', value: formatDate(p.created_at) },
    { label: 'Modifié le', value: formatDate(p.updated_at) },
    { label: 'Référence', value: p.id, mono: true, small: true }
  ]
})

/* ---------- Édition ---------- */
const editing = ref(false)
const form = reactive({ name: '', status: 'available' as PropertyStatus, description: '' })
const nameError = ref('')
const saveError = ref('')
const saving = ref(false)
const notice = ref('')

// Un bien « Bientôt disponible » garde son état tant qu'on ne le change pas, même si l'API refuse de l'y remettre.
const statusOptions = computed(() => PROPERTY_EDIT_STATUSES.includes(props.property.status)
  ? PROPERTY_EDIT_STATUSES
  : [props.property.status, ...PROPERTY_EDIT_STATUSES])

function startEdit() {
  form.name = props.property.name
  form.status = props.property.status
  form.description = props.property.description?.fr ?? ''
  nameError.value = ''
  saveError.value = ''
  notice.value = ''
  editing.value = true
}

async function save() {
  nameError.value = form.name.trim() ? '' : 'Le nom du bien est obligatoire.'
  if (nameError.value) return
  saving.value = true
  saveError.value = ''
  try {
    await updateProperty(props.property.id, {
      name: form.name.trim(),
      status: form.status,
      description: { ...(props.property.description ?? {}), fr: form.description.trim() }
    })
    editing.value = false
    notice.value = 'Modifications enregistrées.'
    emit('saved')
  } catch (e: any) {
    saveError.value = e?.message || "L'enregistrement a échoué. Réessayez."
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1">
        <div class="mb-2.5 flex flex-wrap gap-1.5">
          <AdminBadge v-if="property.is_suspended" tone="danger">Suspendu</AdminBadge>
          <AdminBadge v-if="isVirtual" tone="neutral">Logement indépendant</AdminBadge>
          <AdminBadge v-else :tone="STATUS_TONE[property.status] ?? 'neutral'">{{ PROPERTY_STATUS_LABELS[property.status] ?? property.status }}</AdminBadge>
        </div>
        <h2 class="m-0 break-words font-display text-[23px] font-bold leading-[1.2] tracking-[-.02em]">{{ property.name }}</h2>
        <p class="mb-0 mt-1.5 flex items-start gap-1.5 text-[13.5px] text-[var(--text-muted)]">
          <MapPin class="mt-[2px] h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
          <span>
            {{ location || 'Adresse non renseignée' }}
            <a v-if="mapsUrl" :href="mapsUrl" target="_blank" rel="noopener" class="ml-1 whitespace-nowrap font-bold text-green-700">Voir sur la carte</a>
            <span v-else-if="gpsOutside" class="ml-1 font-semibold text-warn-fg">Position GPS enregistrée hors du Bénin.</span>
          </span>
        </p>
      </div>
      <AdminButton v-if="canEdit && !isVirtual && !editing" variant="secondary" size="sm" @click="startEdit">
        <Pencil class="h-4 w-4" :stroke-width="1.9" /> Modifier
      </AdminButton>
    </div>

    <template v-if="!editing">
      <p v-if="property.description?.fr" class="mb-0 mt-4.5 whitespace-pre-line text-[14px] leading-[1.6] text-[var(--text-secondary)]">{{ property.description.fr }}</p>
      <p v-else class="mb-0 mt-4.5 text-[13.5px] text-[var(--text-faint)]">Pas de description.</p>

      <div v-if="equipments.length" class="mt-4.5">
        <p class="mb-2 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Le bâtiment dispose de</p>
        <div class="flex flex-wrap gap-1.5">
          <span v-for="e in equipments" :key="e" class="rounded-pill bg-sand-100 px-3 py-1.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">{{ e }}</span>
        </div>
      </div>

      <dl class="mb-0 mt-5 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-sand-200 pt-4.5 sm:grid-cols-3">
        <div v-for="f in facts" :key="f.label" class="min-w-0">
          <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ f.label }}</dt>
          <dd class="m-0 mt-1 font-semibold" :class="[f.mono ? 'font-mono' : '', f.small ? 'break-all text-xs text-[var(--text-muted)]' : 'text-[13.5px]']">{{ f.value }}</dd>
        </div>
      </dl>

      <p v-if="notice" class="mb-0 mt-4 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ notice }}</p>
    </template>

    <form v-else class="mt-4.5 flex flex-col gap-4 border-t border-sand-200 pt-4.5" @submit.prevent="save">
      <AdminInput v-model="form.name" label="Nom du bien" :error="nameError" />

      <label class="block">
        <span class="mb-[7px] block text-[12.5px] font-bold text-[var(--text-primary)]">État du bâtiment</span>
        <select v-model="form.status" class="h-[46px] w-full cursor-pointer rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 text-[14.5px] text-sand-900 outline-none focus:border-green-600">
          <option v-for="s in statusOptions" :key="s" :value="s">{{ PROPERTY_STATUS_LABELS[s] }}</option>
        </select>
        <span class="mt-[7px] block text-xs text-[var(--text-faint)]">Informatif : la présence dans la recherche dépend des logements libres, pas de cet état.</span>
      </label>

      <label class="block">
        <span class="mb-[7px] block text-[12.5px] font-bold text-[var(--text-primary)]">Description</span>
        <textarea v-model="form.description" rows="5" class="w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3.5 text-[14px] leading-[1.55] outline-none focus:border-green-600" />
      </label>

      <p v-if="saveError" class="m-0 text-[13px] font-semibold text-danger-fg">{{ saveError }}</p>

      <div class="flex flex-wrap gap-2.5">
        <AdminButton type="submit" :loading="saving">Enregistrer</AdminButton>
        <AdminButton variant="secondary" :disabled="saving" @click="editing = false">Annuler</AdminButton>
      </div>
    </form>
  </section>
</template>
