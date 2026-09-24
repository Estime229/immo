<script setup lang="ts">
/** Carte d'annonce — l'unité de base des grilles de recherche. */
interface PropertyCardProps {
  /** Valeur CSS background-image complète (url(...) ou dégradé de substitution) */
  photo: string
  title: string
  /** Quartier · type · surface */
  subtitle: string
  /** Pré-formaté, ex. "75 000 F" */
  price: string
  /** " / mois" ou " / nuit" */
  per: string
  rating?: string
  /** Étiquette posée sur la photo, ex. "Courte durée" */
  badge?: string
  verified?: boolean
  favorite?: boolean
}

withDefaults(defineProps<PropertyCardProps>(), { verified: false, favorite: false })
const emit = defineEmits<{ favorite: [] }>()
</script>

<template>
  <div
    class="cursor-pointer overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white font-body transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-1 hover:shadow-raised"
  >
    <div class="relative h-[186px] bg-cover bg-center" :style="{ backgroundImage: photo }">
      <button
        type="button"
        class="absolute right-3 top-3 grid h-[34px] w-[34px] place-items-center rounded-pill bg-white/[.93]"
        @click.stop="emit('favorite')"
      >
        <span
          class="text-base leading-none"
          :class="favorite ? 'animate-[im-pop_.45s_ease] text-fav' : 'text-[var(--text-secondary)]'"
        >♥</span>
      </button>
      <CoreBadge v-if="badge" tone="onPhoto" class="absolute left-3.5 top-3.5">{{ badge }}</CoreBadge>
    </div>
    <div class="p-[15px_17px_17px]">
      <div class="flex items-baseline justify-between gap-2.5">
        <p class="m-0 font-mono text-[17px] font-bold text-green-900">
          {{ price }}<span class="font-body text-[12.5px] font-medium text-[var(--text-muted)]">{{ per }}</span>
        </p>
        <span v-if="rating" class="text-[12.5px] font-bold">★ {{ rating }}</span>
      </div>
      <p class="mb-0 mt-[7px] text-[15px] font-bold tracking-[-.01em]">{{ title }}</p>
      <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">{{ subtitle }}</p>
      <div v-if="verified" class="mt-3">
        <CoreBadge tone="ok" bordered>✓ Propriétaire vérifié</CoreBadge>
      </div>
    </div>
  </div>
</template>
