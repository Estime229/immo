<script setup lang="ts">
/** Fil d'avancement d'un dossier (bail, réservation, signalement). */
interface StepperProps {
  /** Libellés courts, 3 à 5 étapes */
  steps: string[]
  /** Étape courante, 1-indexée */
  current?: number
}

withDefaults(defineProps<StepperProps>(), { current: 1 })
</script>

<template>
  <div class="flex items-start font-body">
    <div v-for="(step, index) in steps" :key="step" class="flex flex-1 items-start">
      <div class="flex flex-col items-start gap-2">
        <div
          class="grid h-[26px] w-[26px] place-items-center rounded-pill text-xs font-black"
          :class="current > index + 1 ? 'bg-green-600 text-white' : current === index + 1 ? 'bg-green-900 text-white' : 'bg-[var(--border-subtle)] text-[var(--text-faint)]'"
        >{{ current > index + 1 ? '✓' : index + 1 }}</div>
        <span
          class="whitespace-nowrap text-[11.5px] font-bold"
          :class="current === index + 1 ? 'text-[var(--text-primary)]' : 'text-[var(--text-faint)]'"
        >{{ step }}</span>
      </div>
      <div
        v-if="index < steps.length - 1"
        class="mx-[9px] mt-3 h-0.5 flex-1 rounded-[2px]"
        :class="current > index + 1 ? 'bg-green-600' : 'bg-[var(--border-subtle)]'"
      />
    </div>
  </div>
</template>
