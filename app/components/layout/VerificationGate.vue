<script setup lang="ts">
import { verificationGateCopy, verificationLink } from '~/utils/kycStatus'

/**
 * Fenêtre ouverte par `requireVerified()` quand on touche une action que l'API
 * refuserait (403 `KYC_REQUIRED`). Montée une seule fois, dans app.vue.
 */
const { gate, stage, closeGate } = useVerification()
const copy = computed(() => (gate.value ? verificationGateCopy(stage.value, gate.value.action) : null))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closeGate()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="gate && copy" class="fixed inset-0 z-[95] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="closeGate">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-gate-title"
        class="w-[440px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-7 text-center shadow-panel"
        @click.stop
      >
        <span class="mx-auto grid h-14 w-14 place-items-center rounded-pill" :class="stage === 'rejected' ? 'bg-danger-bg text-danger-fg' : stage === 'review' ? 'bg-info-bg text-info-fg' : 'bg-green-50 text-green-700'">
          <CoreLockIcon :size="24" />
        </span>
        <p id="verification-gate-title" class="mb-0 mt-4 font-display text-[20px] font-bold tracking-[-.02em]">{{ copy.title }}</p>
        <p class="mb-0 mt-2 text-[14px] leading-[1.55] text-[var(--text-secondary)]">{{ copy.text }}</p>
        <NuxtLink
          :to="verificationLink(gate.redirect)"
          class="mt-5.5 block rounded-md bg-[image:var(--action-primary)] px-5 py-3.5 text-[15px] font-bold text-white shadow-action"
          @click="closeGate"
        >{{ copy.cta }}</NuxtLink>
        <button type="button" class="mt-2.5 w-full rounded-md px-5 py-3 text-[14px] font-bold text-[var(--text-muted)]" @click="closeGate">Plus tard</button>
      </div>
    </div>
  </Teleport>
</template>
