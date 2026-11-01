<script setup lang="ts">
import { ArrowRight, Check, X } from '@lucide/vue'
import type { VerificationSpace } from '~/utils/kycStatus'

export interface GuideStep {
  key: string
  title: string
  text: string
  to: string
  cta: string
  done: boolean
}

/**
 * Parcours « Bien démarrer » du tableau de bord : les étapes se cochent d'après les vraies
 * données de l'API (jamais d'une case cochée à la main), la prochaine à faire est mise en
 * avant. Disparaît quand tout est fait, ou quand l'utilisateur le masque.
 */
interface Props {
  space: VerificationSpace
  title?: string
  steps: GuideStep[]
  /** Tant que les données ne sont pas là, on n'affiche rien plutôt que des étapes fausses. */
  ready?: boolean
}
const props = withDefaults(defineProps<Props>(), { title: 'Bien démarrer', ready: true })

const { dismissed, dismiss } = useGuideChecklist(props.space)
const doneCount = computed(() => props.steps.filter(s => s.done).length)
const allDone = computed(() => doneCount.value === props.steps.length)
const nextKey = computed(() => props.steps.find(s => !s.done)?.key ?? null)
const visible = computed(() => props.ready && !dismissed.value && !allDone.value)
</script>

<template>
  <section v-if="visible" class="mb-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="m-0 text-[15px] font-bold">{{ title }}</h2>
        <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]"><span class="font-mono font-bold text-[var(--text-primary)]">{{ doneCount }}/{{ steps.length }}</span> étapes faites</p>
      </div>
      <button type="button" class="grid h-8 w-8 flex-none place-items-center rounded-pill text-[var(--text-faint)] hover:bg-sand-100" aria-label="Masquer le parcours de démarrage" title="Masquer (réaffichable depuis le Guide)" @click="dismiss">
        <X class="h-4 w-4" :stroke-width="1.9" />
      </button>
    </div>
    <div class="mb-3.5 mt-3 h-1.5 overflow-hidden rounded-pill bg-sand-200" role="progressbar" :aria-valuenow="doneCount" :aria-valuemin="0" :aria-valuemax="steps.length">
      <div class="h-full rounded-pill bg-green-500 transition-all" :style="{ width: `${(doneCount / steps.length) * 100}%` }" />
    </div>
    <ol class="m-0 flex list-none flex-col p-0">
      <li v-for="(s, i) in steps" :key="s.key" class="flex flex-wrap items-center gap-3 border-b border-sand-200 py-3 last:border-b-0 last:pb-0 first:pt-0">
        <span class="grid h-8 w-8 flex-none place-items-center rounded-pill text-[13px] font-bold" :class="s.done ? 'bg-ok-bg text-ok-fg' : s.key === nextKey ? 'bg-green-700 text-white' : 'bg-sand-200 text-[var(--text-muted)]'">
          <Check v-if="s.done" class="h-4 w-4" :stroke-width="2.2" />
          <template v-else>{{ i + 1 }}</template>
        </span>
        <div class="min-w-0 flex-1">
          <p class="m-0 text-sm font-bold" :class="s.done ? 'text-[var(--text-faint)] line-through' : ''">{{ s.title }}</p>
          <p v-if="!s.done" class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ s.text }}</p>
        </div>
        <NuxtLink
          v-if="!s.done"
          :to="s.to"
          class="inline-flex items-center gap-1.5 rounded-pill px-4 py-[9px] text-[13px] font-bold"
          :class="s.key === nextKey ? 'bg-[image:var(--action-primary)] text-white' : 'border border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
        >{{ s.cta }}<ArrowRight class="h-4 w-4" :stroke-width="1.9" /></NuxtLink>
      </li>
    </ol>
  </section>
</template>
