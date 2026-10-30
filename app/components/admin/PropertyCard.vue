<script setup lang="ts">
/**
 * Carte d'un bien dans la liste admin — même anatomie que les cartes de bien d'Immo
 * (photo, nom, quartier · ville, loyer) plus ce que la modération doit voir d'un coup
 * d'œil : suspension, statut, logements, propriétaire.
 * Le nom est un lien étiré sur toute la carte ; le lien propriétaire passe au-dessus.
 */
import { Camera, ImageOff } from '@lucide/vue'
import {
  PROPERTY_STATUS_LABELS,
  propertyPhotos,
  propertyRentRange,
  propertyUnitsSummary,
  suspendedUnitsCount,
  type PropertyListItem,
  type PropertyStatus
} from '~/composables/useProperty'

const props = defineProps<{ property: PropertyListItem; typeLabel: string }>()

const STATUS_TONE: Record<PropertyStatus, 'success' | 'neutral' | 'warning' | 'info'> = {
  available: 'success',
  occupied: 'neutral',
  maintenance: 'warning',
  coming_soon: 'info'
}

const photos = computed(() => propertyPhotos(props.property))
const cover = computed(() => photos.value[0]?.url ?? null)
const isVirtual = computed(() => props.property._virtual === true)
const location = computed(() => [props.property.neighborhood?.name, props.property.city?.name].filter(Boolean).join(', '))
const unitsCount = computed(() => props.property.units?.length ?? 0)
const unitsSummary = computed(() => propertyUnitsSummary(props.property.units ?? []))
const suspendedUnits = computed(() => suspendedUnitsCount(props.property.units ?? []))
const rent = computed(() => propertyRentRange(props.property.units ?? []))

const ownerName = computed(() => {
  const o = props.property.owner
  return o ? personName(o.first_name, o.last_name) : ''
})
</script>

<template>
  <article class="relative flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white transition-shadow hover:shadow-raised">
    <div class="relative h-[160px] flex-none bg-sand-200 bg-cover bg-center" :style="cover ? { backgroundImage: `url(${cover})` } : {}">
      <div v-if="!cover" class="grid h-full place-items-center text-[var(--text-faint)]">
        <span class="flex flex-col items-center gap-1.5 text-[12px] font-semibold"><ImageOff class="h-5 w-5" :stroke-width="1.9" />Sans photo</span>
      </div>
      <div class="absolute left-3 top-3 flex flex-wrap gap-1.5">
        <AdminBadge v-if="property.is_suspended" tone="danger">Suspendu</AdminBadge>
        <AdminBadge v-if="isVirtual" tone="neutral">Logement indépendant</AdminBadge>
        <AdminBadge v-else :tone="STATUS_TONE[property.status] ?? 'neutral'">{{ PROPERTY_STATUS_LABELS[property.status] ?? property.status }}</AdminBadge>
      </div>
      <span v-if="photos.length > 1" class="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-pill bg-white/[.94] px-2.5 py-1 font-mono text-[11px] font-bold text-sand-900">
        <Camera class="h-3.5 w-3.5" :stroke-width="1.9" />{{ photos.length }}
      </span>
    </div>

    <div v-if="property.is_suspended" class="border-b border-danger-border bg-danger-bg px-4.5 py-2.5">
      <p class="m-0 text-xs font-bold text-danger-fg">Annonce suspendue</p>
      <p v-if="property.suspended_reason" class="mb-0 mt-0.5 line-clamp-2 text-[11.5px] text-danger-fg-deep">{{ property.suspended_reason }}</p>
    </div>
    <div v-else-if="suspendedUnits" class="border-b border-warn-border bg-warn-bg px-4.5 py-2">
      <p class="m-0 text-xs font-bold text-warn-fg">{{ suspendedUnits }} logement{{ suspendedUnits > 1 ? 's' : '' }} suspendu{{ suspendedUnits > 1 ? 's' : '' }}</p>
    </div>

    <div class="flex flex-1 flex-col px-4.5 pb-4 pt-3.5">
      <NuxtLink :to="`/admin/biens/${property.id}`" class="line-clamp-2 text-[15.5px] font-bold leading-[1.3] tracking-[-.01em] text-[var(--text-primary)] after:absolute after:inset-0 hover:text-green-800">
        {{ property.name }}
      </NuxtLink>
      <p class="mb-0 mt-1 truncate text-[13px] text-[var(--text-muted)]">{{ location || 'Localisation non précisée' }}</p>
      <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">
        {{ isVirtual ? 'Sans bien parent' : typeLabel }} · {{ unitsCount }} logement{{ unitsCount > 1 ? 's' : '' }}
      </p>

      <div class="mt-3.5 flex flex-wrap gap-x-5 gap-y-2.5">
        <div class="min-w-0">
          <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Logements</p>
          <p class="mb-0 mt-1 text-[13px] font-semibold">{{ unitsSummary || 'Aucun' }}</p>
        </div>
        <div v-if="rent">
          <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Loyer</p>
          <p class="mb-0 mt-1 font-mono text-[13px] font-bold text-green-900">
            {{ rent.min === rent.max ? formatFcfaShort(rent.min) : `${formatFcfaShort(rent.min)} – ${formatFcfaShort(rent.max)}` }}<span v-if="rent.suffix" class="font-body text-[11.5px] font-medium text-[var(--text-muted)]"> {{ rent.suffix }}</span>
          </p>
        </div>
      </div>

      <div class="mt-auto pt-3.5">
        <NuxtLink
          :to="`/admin/utilisateurs/${property.owner_id}`"
          class="relative z-[1] flex items-center gap-2.5 border-t border-sand-200 pt-3 hover:text-green-800"
        >
          <CoreAvatar :name="ownerName || 'Propriétaire'" :size="28" :avatar-url="property.owner?.avatar_url" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-bold">{{ ownerName || 'Fiche du propriétaire' }}</span>
            <span class="block text-[11.5px] text-[var(--text-faint)]">Propriétaire</span>
          </span>
        </NuxtLink>
      </div>
    </div>
  </article>
</template>
