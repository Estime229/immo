<script setup lang="ts">
/**
 * Carte propriétaire / agent d'un bien : identité, vérifications, volume géré, liens vers la
 * fiche du compte et vers ses autres biens. Le compte est chargé par la page (`/user/detail`).
 */
import { ADMIN_ROLE_LABELS, type KycStatus, type UserDetailResponse, type UserStatus } from '~/composables/useUsers'

const props = defineProps<{
  label: string
  /** Propriétaire : compteurs « en propriétaire » et lien vers ses biens ; agent : compteurs « en agent ». */
  role: 'owner' | 'agent'
  userId: string
  detail: UserDetailResponse | null
  state: 'loading' | 'ready' | 'error'
}>()

defineEmits<{ retry: [] }>()

const KYC: Record<KycStatus, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'KYC en attente', tone: 'warning' },
  verified: { label: 'KYC vérifié', tone: 'success' },
  rejected: { label: 'KYC refusé', tone: 'danger' }
}
const STATUS: Record<UserStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  active: { label: 'Compte actif', tone: 'success' },
  restricted: { label: 'Compte restreint', tone: 'warning' },
  banned: { label: 'Compte banni', tone: 'danger' }
}

const profileUrl = computed(() => `/admin/utilisateurs/${props.userId}`)
const user = computed(() => props.detail?.user ?? null)
const name = computed(() => (user.value ? personName(user.value.first_name, user.value.last_name) || user.value.email : ''))
const contact = computed(() => (user.value ? [user.value.email, user.value.phone_number].filter(Boolean).join(' · ') : ''))
const tiles = computed(() => {
  const s = props.detail?.stats
  if (!s) return []
  return props.role === 'owner'
    ? [{ label: 'Biens possédés', value: s.propertiesAsOwnerCount }, { label: 'Logements', value: s.roomsAsOwnerCount }]
    : [{ label: 'Biens gérés', value: s.propertiesAsAgentCount }, { label: 'Logements', value: s.roomsAsAgentCount }]
})
</script>

<template>
  <section class="rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-4.5">
    <div class="mb-3.5 flex items-baseline justify-between gap-3">
      <h2 class="m-0 text-[15px] font-bold">{{ label }}</h2>
      <NuxtLink :to="profileUrl" class="text-[12.5px] font-bold text-green-700">Voir la fiche</NuxtLink>
    </div>

    <div v-if="state === 'loading'" class="flex items-center gap-3" aria-busy="true">
      <span class="h-11 w-11 flex-none animate-pulse rounded-pill bg-sand-200" />
      <span class="flex-1">
        <span class="block h-3 w-1/2 animate-pulse rounded-pill bg-sand-200" />
        <span class="mt-2 block h-2.5 w-2/3 animate-pulse rounded-pill bg-sand-100" />
      </span>
    </div>

    <p v-else-if="state === 'error' || !user" class="m-0 text-[13px] text-[var(--text-muted)]">
      Impossible de charger ce compte.
      <button type="button" class="ml-1 font-bold text-green-700 underline" @click="$emit('retry')">Réessayer</button>
      <span class="mt-1 block break-all font-mono text-xs text-[var(--text-faint)]">{{ userId }}</span>
    </p>

    <template v-else>
      <NuxtLink :to="profileUrl" class="flex items-center gap-3 hover:text-green-800">
        <CoreAvatar :name="name" :size="44" :avatar-url="user.avatar_url" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-bold">{{ name }}</span>
          <span class="mt-0.5 block truncate text-xs text-[var(--text-faint)]">{{ ADMIN_ROLE_LABELS[user.role] ?? user.role }}<template v-if="contact"> · {{ contact }}</template></span>
        </span>
      </NuxtLink>

      <div class="mt-3 flex flex-wrap gap-1.5">
        <AdminBadge v-if="STATUS[user.status]" :tone="STATUS[user.status].tone">{{ STATUS[user.status].label }}</AdminBadge>
        <AdminBadge v-if="user.profile && KYC[user.profile.kyc_status]" :tone="KYC[user.profile.kyc_status].tone">{{ KYC[user.profile.kyc_status].label }}</AdminBadge>
        <AdminBadge v-else-if="!user.profile" tone="neutral">KYC non soumis</AdminBadge>
      </div>

      <div v-if="tiles.length" class="mt-3.5 grid grid-cols-2 gap-2.5">
        <div v-for="t in tiles" :key="t.label" class="rounded-lg border border-[var(--border-subtle)] bg-white px-3.5 py-3">
          <p class="m-0 font-mono text-lg font-bold tracking-[-.02em] text-green-900">{{ t.value }}</p>
          <p class="mb-0 mt-1 text-[11.5px] text-[var(--text-muted)]">{{ t.label }}</p>
        </div>
      </div>

      <NuxtLink v-if="role === 'owner'" :to="{ path: '/admin/biens', query: { owner: userId } }" class="mt-3.5 inline-block text-[12.5px] font-bold text-green-700">
        Voir ses biens dans la liste
      </NuxtLink>
    </template>
  </section>
</template>
