<script setup lang="ts">
import type { VerificationSpace } from '~/utils/kycStatus'

/** Sur la page Guide : bouton pour réafficher le parcours « Bien démarrer » masqué du tableau de bord. */
const props = defineProps<{ space: VerificationSpace; home: string }>()
const { dismissed, restore } = useGuideChecklist(props.space)
function show() {
  restore()
  navigateTo(props.home)
}
</script>

<template>
  <div v-if="dismissed" class="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-5 py-3.5">
    <p class="m-0 min-w-0 flex-1 text-[13.5px] text-[var(--text-muted)]">Vous avez masqué le parcours « Bien démarrer » de votre tableau de bord.</p>
    <CoreButton size="sm" tone="secondary" @click="show">Le réafficher</CoreButton>
  </div>
</template>
