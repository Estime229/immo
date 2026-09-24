<script setup lang="ts">
import type { InventoryDetail } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'locataire' })

const { activeLease, state: leaseState, ensureLoaded } = useTenantLeases()
const inventoriesApi = useInventoriesApi()

onMounted(ensureLoaded)

const inventories = ref<InventoryDetail[]>([])
const invState = ref<'idle' | 'loading' | 'error' | 'empty' | 'success'>('idle')

async function loadInventories() {
  const id = activeLease.value?.id
  if (!id) return
  invState.value = 'loading'
  try {
    inventories.value = await inventoriesApi.fetchByLease(id)
    invState.value = inventories.value.length ? 'success' : 'empty'
  } catch {
    invState.value = 'error'
  }
}
watch(() => activeLease.value?.id, id => { if (id) loadInventories() }, { immediate: true })

const TYPE_LABEL: Record<string, string> = { entry: "État des lieux d'entrée", exit: 'État des lieux de sortie' }
const STATUS_LABEL: Record<string, string> = { draft: "En préparation par le propriétaire", pending_signature: 'En attente de signature', signed: 'Signé' }
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'neutral'> = { draft: 'neutral', pending_signature: 'warn', signed: 'ok' }

const openId = ref<string | null>(null)
function toggle(id: string) {
  openId.value = openId.value === id ? null : id
}

/**
 * Aucune capture de signature manuscrite n'existe dans ce projet (même
 * principe que `SignLeaseModal.vue`) : `signature` doit néanmoins être une
 * chaîne non vide pour que l'API enregistre réellement la signature — un
 * corps vide renvoie 200 sans rien enregistrer (vérifié en direct, Lot 28).
 */
const SIGNATURE_PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const readyToSign = ref<Record<string, boolean>>({})
const signingId = ref<string | null>(null)
const signError = ref('')
async function sign(inv: InventoryDetail) {
  if (!readyToSign.value[inv.id]) return
  signingId.value = inv.id
  signError.value = ''
  try {
    const updated = await inventoriesApi.sign(inv.id, SIGNATURE_PLACEHOLDER)
    inventories.value = inventories.value.map(i => (i.id === updated.id ? updated : i))
  } catch (e) {
    signError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La signature a échoué.') : 'La signature a échoué.'
  } finally {
    signingId.value = null
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="leaseState === 'loading' || invState === 'loading'" class="flex flex-col gap-3">
      <DataSkeletonCard :height="120" :lines="1" />
    </div>

    <FeedbackAlertBanner v-else-if="leaseState === 'error' || invState === 'error'" tone="danger">
      Impossible de charger vos états des lieux pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="loadInventories">Réessayer</button>
    </FeedbackAlertBanner>

    <FeedbackEmptyState v-else-if="leaseState === 'empty' || !activeLease" title="Aucun bail pour l'instant" description="Votre état des lieux apparaîtra ici une fois un bail signé." />

    <FeedbackEmptyState v-else-if="invState === 'empty'" title="Aucun état des lieux pour l'instant" description="Le propriétaire n'a pas encore préparé d'état des lieux pour ce bail." />

    <template v-else>
      <p v-if="signError" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ signError }}</p>

      <div v-for="inv in inventories" :key="inv.id" class="mb-3.5 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white">
        <button type="button" class="flex w-full items-center gap-3.5 px-5.5 py-4.5 text-left" @click="toggle(inv.id)">
          <span class="text-[13px] text-[var(--text-faint)] transition-transform" :class="openId === inv.id ? 'rotate-90' : 'rotate-0'">▶</span>
          <p class="m-0 flex-1 text-base font-bold tracking-[-.015em]">{{ TYPE_LABEL[inv.type] ?? inv.type }}</p>
          <CoreBadge :tone="STATUS_TONE[inv.status]">{{ STATUS_LABEL[inv.status] ?? inv.status }}</CoreBadge>
        </button>

        <div v-if="openId === inv.id" class="px-5.5 pb-5">
          <p v-if="inv.signed_at" class="m-0 text-[13px] text-[var(--text-muted)]">Signé le {{ formatDate(inv.signed_at) }}.</p>
          <p v-if="inv.general_comment" class="mb-0 mt-2.5 text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">{{ inv.general_comment }}</p>
          <p v-if="inv.meter_readings" class="mb-0 mt-2.5 text-[12.5px] text-[var(--text-muted)]">
            <template v-if="inv.meter_readings.electricity">Électricité : {{ inv.meter_readings.electricity }}</template>
            <template v-if="inv.meter_readings.electricity && inv.meter_readings.water"> · </template>
            <template v-if="inv.meter_readings.water">Eau : {{ inv.meter_readings.water }}</template>
          </p>

          <p v-if="!inv.rooms.length" class="mb-0 mt-3.5 text-[13px] text-[var(--text-muted)]">Aucune pièce détaillée pour l'instant.</p>
          <div v-for="room in inv.rooms" :key="room.name" class="mt-3.5 border-t border-sand-200 pt-3.5">
            <p class="m-0 text-[14.5px] font-bold">{{ room.name }}</p>
            <div v-for="(item, i) in room.items" :key="i" class="mt-2.5">
              <div class="flex items-center gap-2.5">
                <p class="m-0 flex-1 text-[13.5px] font-semibold">{{ item.name || 'Objet' }}</p>
                <CoreBadge :tone="item.state === 'damaged' ? 'danger' : item.state === 'issue' ? 'warn' : 'ok'">
                  {{ { good: 'Bon état', issue: 'À surveiller', damaged: 'Endommagé' }[item.state] ?? item.state }}
                </CoreBadge>
              </div>
              <p v-if="item.comment" class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">{{ item.comment }}</p>
            </div>
          </div>

          <div v-if="inv.status === 'pending_signature' && !inv.tenant_signature" class="mt-4.5 rounded-xl border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-5">
            <p class="m-0 text-[14.5px] font-bold text-clay-700">Votre signature est nécessaire</p>
            <p class="mb-3.5 mt-2 text-[13px] leading-[1.6] text-clay-900">
              En signant, vous reconnaissez l'état constaté. C'est ce document qui servira de référence en cas de retenue sur la garantie.
            </p>
            <div
              class="mb-3.5 grid h-[90px] cursor-pointer place-items-center rounded-md border-[1.5px] border-dashed bg-white"
              :class="readyToSign[inv.id] ? 'border-green-600' : 'border-clay-300'"
              @click="readyToSign[inv.id] = true"
            >
              <span v-if="readyToSign[inv.id]" class="-rotate-[4deg] font-display text-2xl italic text-green-800">Signé</span>
              <span v-else class="text-[13px] text-[var(--text-faint)]">✎ Tracez votre signature ici</span>
            </div>
            <CoreButton tone="accent" :disabled="signingId === inv.id || !readyToSign[inv.id]" @click="sign(inv)">{{ signingId === inv.id ? 'Signature…' : "Signer l'état des lieux" }}</CoreButton>
          </div>
          <p v-else-if="inv.status === 'pending_signature' && inv.tenant_signature" class="mt-4.5 text-[13px] text-[var(--text-muted)]">Vous avez signé — en attente du propriétaire.</p>
        </div>
      </div>
    </template>
  </div>
</template>
