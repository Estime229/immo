<script setup lang="ts">
import type { LeaseStatus, LeaseSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'pro' })

const leasesApi = useLeasesApi()
const block = useFetchBlock(() => leasesApi.fetchMine())
onMounted(block.load)

const STATUS_LABEL: Record<LeaseStatus, string> = { draft: 'Brouillon', pending_signature: 'En attente de signature', signed: 'Signé, non payé', active: 'Actif', terminated: 'Résilié' }
const STATUS_TONE: Record<LeaseStatus, 'ok' | 'warn' | 'danger' | 'neutral'> = { draft: 'neutral', pending_signature: 'warn', signed: 'warn', active: 'ok', terminated: 'neutral' }
const ACCENT: Record<LeaseStatus, string> = {
  draft: 'border-l-4 border-l-[var(--border-default)]',
  pending_signature: 'border-l-4 border-l-clay-500',
  signed: 'border-l-4 border-l-clay-500',
  active: 'border-l-4 border-l-green-600',
  terminated: 'border-l-4 border-l-[var(--border-default)]'
}

function tenantName(l: LeaseSummary) {
  return `${l.tenant.first_name ?? ''} ${l.tenant.last_name ?? ''}`.trim() || 'Locataire'
}
function fmtFcfa(v: string) { return `${Number(v).toLocaleString('fr-FR')} F` }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }

const busyId = ref<string | null>(null)
const actionError = ref('')
async function run(l: LeaseSummary, action: () => Promise<unknown>) {
  busyId.value = l.id
  actionError.value = ''
  try {
    await action()
    await block.load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'action a échoué.") : "L'action a échoué."
  } finally {
    busyId.value = null
  }
}
function sendLease(l: LeaseSummary) { run(l, () => leasesApi.send(l.id)) }
function cancelUnpaid(l: LeaseSummary) { run(l, () => leasesApi.cancelUnpaid(l.id)) }

const terminateTarget = ref<LeaseSummary | null>(null)
function terminateLease() {
  if (!terminateTarget.value) return
  const l = terminateTarget.value
  terminateTarget.value = null
  run(l, () => leasesApi.terminate(l.id))
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="110" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos baux pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="block.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucun bail pour l'instant.
      <NuxtLink to="/pro/baux/nouveau" class="font-bold text-green-700 underline">Créer un bail</NuxtLink>
    </p>

    <template v-else>
      <p v-if="actionError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>

      <div v-for="l in block.items.value" :key="l.id" class="mb-3.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5" :class="ACCENT[l.status]">
        <div class="flex items-start gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <p class="m-0 text-base font-bold tracking-[-.015em]">{{ tenantName(l) }}</p>
              <CoreBadge :tone="STATUS_TONE[l.status]">{{ STATUS_LABEL[l.status] }}</CoreBadge>
            </div>
            <p class="mb-0 mt-1.5 text-[13.5px] text-[var(--text-muted)]">{{ l.unit.name }} · {{ fmtFcfa(l.signed_rent) }} · {{ fmtDate(l.start_date) }}{{ l.end_date ? ` → ${fmtDate(l.end_date)}` : '' }}</p>
          </div>
          <div class="flex flex-none flex-col gap-2">
            <button v-if="l.status === 'draft'" type="button" class="whitespace-nowrap rounded-sm bg-[image:var(--action-primary)] px-4 py-2.5 text-[12.5px] font-bold text-white" :disabled="busyId === l.id" @click="sendLease(l)">Envoyer pour signature</button>
            <button v-if="l.status === 'signed'" type="button" class="whitespace-nowrap rounded-sm border border-danger-border bg-white px-4 py-2.5 text-[12.5px] font-bold text-danger-fg" :disabled="busyId === l.id" @click="cancelUnpaid(l)">Annuler (jamais payé)</button>
            <button v-if="l.status === 'active'" type="button" class="whitespace-nowrap rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold text-[var(--text-muted)]" @click="terminateTarget = l">Résilier</button>
          </div>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="terminateTarget" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="terminateTarget = null">
        <div class="w-[440px] max-w-full rounded-2xl bg-[var(--surface-page)] p-6.5 animate-[im-rise_.28s_var(--ease-standard)_both]" @click.stop>
          <div class="grid h-12 w-12 place-items-center rounded-pill bg-danger-bg text-xl text-danger-fg">!</div>
          <h3 class="mb-0 mt-4.5 font-display text-xl font-bold tracking-[-.02em]">Résilier ce bail ?</h3>
          <p class="mb-0 mt-2.5 text-sm leading-[1.6] text-[var(--text-muted)]">Le bail actif sera résilié immédiatement. Cette action est irréversible.</p>
          <div class="mt-6 flex gap-2.5">
            <CoreButton tone="secondary" size="lg" full-width @click="terminateTarget = null">Annuler</CoreButton>
            <CoreButton tone="danger" size="lg" full-width @click="terminateLease">Confirmer</CoreButton>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
