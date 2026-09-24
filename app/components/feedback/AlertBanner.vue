<script setup lang="ts">
/** Bandeau d'alerte en tête de tableau de bord — un fait daté et chiffré, plus une action. */
interface AlertBannerProps {
  tone?: 'danger' | 'warn' | 'ok' | 'info'
  actionLabel?: string
}

const props = withDefaults(defineProps<AlertBannerProps>(), { tone: 'danger' })
const emit = defineEmits<{ action: [] }>()

const TONE = {
  danger: { bg: 'bg-danger-bg', border: 'border-danger-border', dot: 'bg-danger-fg', fg: 'text-danger-fg-deep', btn: 'bg-danger-fg' },
  warn: { bg: 'bg-warn-bg', border: 'border-warn-border', dot: 'bg-warn-fg', fg: 'text-warn-fg-deep', btn: 'bg-warn-fg' },
  ok: { bg: 'bg-ok-bg', border: 'border-ok-border', dot: 'bg-ok-fg', fg: 'text-green-900', btn: 'bg-green-600' },
  info: { bg: 'bg-info-bg', border: 'border-info-border', dot: 'bg-info-fg', fg: 'text-info-fg-deep', btn: 'bg-info-fg' }
} as const

const t = computed(() => TONE[props.tone])
</script>

<template>
  <div class="flex items-center gap-[15px] rounded-lg border px-5 py-4 font-body" :class="[t.bg, t.border]">
    <span class="h-[9px] w-[9px] flex-none rounded-pill" :class="t.dot" />
    <p class="m-0 flex-1 text-[14.5px] font-semibold" :class="t.fg"><slot /></p>
    <button
      v-if="actionLabel"
      type="button"
      class="whitespace-nowrap rounded-pill px-[18px] py-[10px] font-body text-[13px] font-bold text-white"
      :class="t.btn"
      @click="emit('action')"
    >{{ actionLabel }}</button>
  </div>
</template>
