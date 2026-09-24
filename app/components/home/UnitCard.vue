<script setup lang="ts">
interface UnitCardProps {
  id: string
  photo: string
  headline: string
  price: string
  per: string
  /** Absent tant qu'aucune note réelle n'est disponible — jamais une valeur inventée. */
  rating?: string
  badge?: string
  owner?: string
  favorite?: boolean
}

withDefaults(defineProps<UnitCardProps>(), { favorite: false })
const emit = defineEmits<{ open: []; favorite: [] }>()
</script>

<template>
  <div class="w-[214px] flex-none cursor-pointer" @click="emit('open')">
    <div class="relative h-[206px] overflow-hidden rounded-xl bg-cover bg-center" :style="{ backgroundImage: photo }">
      <span
        v-if="badge"
        class="absolute left-3 top-3 rounded-pill bg-white/[.94] px-3 py-[7px] text-[11.5px] font-bold text-green-900 shadow-[0_2px_8px_rgba(0,0,0,.1)]"
      >{{ badge }}</span>
      <button
        type="button"
        class="absolute right-[11px] top-[11px] grid h-[30px] w-[30px] place-items-center"
        @click.stop="emit('favorite')"
      >
        <span
          class="text-[22px] leading-none"
          :class="favorite ? 'animate-[im-pop_.45s_ease] text-fav' : 'text-white/[.72]'"
          style="text-shadow: 0 1px 3px rgba(0,0,0,.35)"
        >♥</span>
      </button>
    </div>
    <p class="mb-0 mt-[11px] overflow-hidden text-ellipsis whitespace-nowrap text-[14.5px] font-bold tracking-[-.01em]">{{ headline }}</p>
    <p v-if="owner" class="mb-0 mt-[2px] text-[13px] text-[var(--text-faint)]">{{ owner }}</p>
    <p class="mb-0 mt-[3px] text-[13.5px] text-[var(--text-muted)]">
      <span class="font-mono font-bold text-[var(--text-primary)]">{{ price }}</span>{{ per }}<template v-if="rating"> · ★ {{ rating }}</template>
    </p>
  </div>
</template>
