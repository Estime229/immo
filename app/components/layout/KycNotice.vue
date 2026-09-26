<script setup lang="ts">
import { deriveVerificationNotice, type VerificationSpace } from '~/utils/kycStatus'

const props = defineProps<{ space: VerificationSpace }>()
const currentUser = useAuthUser()

const notice = computed(() => {
  const u = currentUser.value
  if (!u) return null
  return deriveVerificationNotice(u.profile?.kyc_status, u.has_id_card, props.space)
})

const TONE = {
  warn: { box: 'border-warn-border bg-warn-bg', ink: 'text-warn-fg', icon: '!', dot: 'bg-warn-fg' },
  danger: { box: 'border-danger-border bg-danger-bg', ink: 'text-danger-fg', icon: '✕', dot: 'bg-danger-fg' },
  info: { box: 'border-info-border bg-info-bg', ink: 'text-info-fg-deep', icon: '◷', dot: 'bg-info-fg' }
} as const
</script>

<template>
  <div v-if="notice" class="mb-5 flex flex-col gap-3.5 rounded-xl border px-5 py-4 sm:flex-row sm:items-center" :class="TONE[notice.tone].box" role="status">
    <span class="grid h-9 w-9 flex-none place-items-center rounded-pill text-[15px] font-black text-white" :class="TONE[notice.tone].dot">{{ TONE[notice.tone].icon }}</span>
    <div class="min-w-0 flex-1">
      <p class="m-0 text-[14.5px] font-bold" :class="TONE[notice.tone].ink">{{ notice.title }}</p>
      <p class="mb-0 mt-0.5 text-[13.5px] leading-[1.5] text-[var(--text-secondary)]">{{ notice.text }}</p>
    </div>
    <NuxtLink to="/kyc" class="flex-none whitespace-nowrap rounded-md bg-[image:var(--action-primary)] px-5 py-2.5 text-center text-[13.5px] font-bold text-white shadow-action">{{ notice.cta }}</NuxtLink>
  </div>
</template>
