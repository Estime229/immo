<script setup lang="ts">
import type { ArtisanPartnership } from '~/types/artisan'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'artisan' })

const artisanApi = useArtisanRequestsApi()
const block = useFetchBlock(() => artisanApi.myPartnerships())
onMounted(block.load)

const pending = computed(() => block.items.value.filter(p => p.status === 'pending'))
const active = computed(() => block.items.value.filter(p => p.status === 'active'))

function managerName(p: ArtisanPartnership) {
  return p.manager ? [p.manager.first_name, p.manager.last_name].filter(Boolean).join(' ') || 'Un gestionnaire' : 'Un gestionnaire'
}

const busyId = ref<string | null>(null)
const actionError = ref('')

async function respond(p: ArtisanPartnership, action: 'accept' | 'decline') {
  busyId.value = p.id
  actionError.value = ''
  try {
    await artisanApi.respondPartnership(p.id, action)
    await block.load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "La réponse a échoué.") : "La réponse a échoué."
  } finally {
    busyId.value = null
  }
}

async function end(p: ArtisanPartnership) {
  busyId.value = p.id
  actionError.value = ''
  try {
    await artisanApi.endPartnership(p.id)
    await block.load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'arrêt a échoué.") : "L'arrêt a échoué."
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <p v-if="actionError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>

    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard :height="90" :lines="1" />
    </div>
    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos partenariats pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>
    <p v-else-if="block.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucun partenariat pour l'instant.
    </p>

    <template v-else>
      <div v-for="p in active" :key="p.id" class="mb-3.5 flex items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <CoreAvatar :name="managerName(p)" :size="44" color="var(--color-clay-500)" />
        <div class="flex-1">
          <p class="m-0 text-base font-bold">{{ managerName(p) }}</p>
          <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">Partenaire depuis le {{ new Date(p.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) }}</p>
        </div>
        <CoreBadge tone="ok">Actif</CoreBadge>
        <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold" :disabled="busyId === p.id" @click="end(p)">{{ busyId === p.id ? '…' : 'Mettre fin' }}</button>
      </div>

      <div v-for="p in pending" :key="p.id" class="mt-1 rounded-2xl border border-info-border bg-info-bg p-5.5">
        <p class="m-0 text-[15px] font-bold text-info-fg-deep">Invitation de partenariat</p>
        <p class="mb-3.5 mt-2 text-[13.5px] leading-[1.55] text-info-fg-deep"><strong>{{ managerName(p) }}</strong> vous propose un partenariat.</p>
        <div class="flex gap-2.5">
          <button type="button" class="rounded-md bg-info-fg px-4.5 py-2.5 text-[13px] font-bold text-white" :disabled="busyId === p.id" @click="respond(p, 'accept')">Accepter</button>
          <button type="button" class="rounded-md border border-info-border bg-white px-4.5 py-2.5 text-[13px] font-bold text-info-fg-deep" :disabled="busyId === p.id" @click="respond(p, 'decline')">Refuser</button>
        </div>
      </div>
    </template>
  </div>
</template>
