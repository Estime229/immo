<script setup lang="ts">
import type { InventoryDetail, InventoryRoom, InventoryType } from '~/types/tenant'
import { INVENTORY_ITEM_STATES } from '~/composables/useInventoriesApi'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const props = defineProps<{
  inventory: InventoryDetail | null
  leaseId?: string
  bookingId?: string
  type: InventoryType
  title: string
}>()
const emit = defineEmits<{ close: []; saved: [] }>()

const inventoriesApi = useInventoriesApi()
const authUser = useAuthUser()
/** Réutilisé côté locataire aussi (`locataire/edl.vue`) : la signature à vérifier dépend de qui est connecté, pas d'un rôle fixe. */
const isTenant = computed(() => authUser.value?.role === 'tenant')

const detail = ref<InventoryDetail | null>(props.inventory)
const loading = ref(false)
const errorMessage = ref('')

/** `props.inventory` vient d'un état réactif du parent (proxy Vue) — `structuredClone` échoue dessus (« could not be cloned »), confirmé en direct (Lot 28). Le contournement JSON est sûr ici : les pièces ne contiennent que des données JSON-compatibles. */
const rooms = ref<InventoryRoom[]>(props.inventory?.rooms ? JSON.parse(JSON.stringify(props.inventory.rooms)) : [])
const generalComment = ref(props.inventory?.general_comment ?? '')
const meterElectricity = ref(props.inventory?.meter_readings?.electricity ?? '')
const meterWater = ref(props.inventory?.meter_readings?.water ?? '')
const newRoomName = ref('')

/**
 * Aucune capture de signature manuscrite n'existe dans ce projet (même
 * principe que `SignLeaseModal.vue` — une case à cocher symbolique, pas un
 * canevas de dessin) : `signature` doit néanmoins être une chaîne non vide
 * pour que l'API enregistre réellement la signature (voir useInventoriesApi.ts).
 */
const SIGNATURE_PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const signed = ref(false)

onMounted(async () => {
  if (detail.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    detail.value = await inventoriesApi.create({ lease_id: props.leaseId, booking_id: props.bookingId, type: props.type })
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "La création a échoué.") : "La création a échoué."
  } finally {
    loading.value = false
  }
})

/** Un locataire ne modifie ni n'envoie un état des lieux — seule la signature lui revient (voir `canSign`). */
const readOnly = computed(() => detail.value?.status === 'signed' || isTenant.value)
const canSend = computed(() => detail.value?.status === 'draft' && !isTenant.value)
const canSign = computed(() => {
  if (detail.value?.status !== 'pending_signature') return false
  return isTenant.value ? !detail.value?.tenant_signature : !detail.value?.landlord_signature
})
const waitingLabel = computed(() => {
  const mySigned = isTenant.value ? detail.value?.tenant_signature : detail.value?.landlord_signature
  if (!mySigned) return ''
  return isTenant.value ? ' Vous avez déjà signé — en attente du propriétaire.' : ' Vous avez déjà signé — en attente du locataire.'
})

function addRoom() {
  if (!newRoomName.value.trim()) return
  rooms.value.push({ name: newRoomName.value.trim(), items: [] })
  newRoomName.value = ''
}
function removeRoom(i: number) {
  rooms.value.splice(i, 1)
}
function addItem(room: InventoryRoom) {
  room.items.push({ name: '', state: 'good', comment: '' })
}
function removeItem(room: InventoryRoom, i: number) {
  room.items.splice(i, 1)
}

async function save(): Promise<boolean> {
  if (!detail.value) return false
  loading.value = true
  errorMessage.value = ''
  try {
    detail.value = await inventoriesApi.update(detail.value.id, {
      rooms: rooms.value,
      general_comment: generalComment.value.trim() || undefined,
      meter_readings: (meterElectricity.value || meterWater.value)
        ? { electricity: meterElectricity.value || undefined, water: meterWater.value || undefined }
        : undefined
    })
    return true
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'enregistrement a échoué.") : "L'enregistrement a échoué."
    return false
  } finally {
    loading.value = false
  }
}

async function sendForSignature() {
  const ok = await save()
  if (!ok || !detail.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    detail.value = await inventoriesApi.send(detail.value.id)
    emit('saved')
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'envoi a échoué.") : "L'envoi a échoué."
  } finally {
    loading.value = false
  }
}

async function submitSignature() {
  if (!detail.value || !signed.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    detail.value = await inventoriesApi.sign(detail.value.id, SIGNATURE_PLACEHOLDER)
    emit('saved')
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La signature a échoué.') : 'La signature a échoué.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="emit('close')">
      <div class="flex max-h-[86vh] w-[600px] max-w-[calc(100vw-3rem)] animate-[im-rise_.28s_var(--ease-standard)_both] flex-col overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel" @click.stop>
        <div class="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-[18px]">
          <div>
            <h3 class="m-0 font-display text-lg font-bold tracking-[-.02em]">{{ title }}</h3>
            <p v-if="detail" class="mb-0 mt-1 text-[12.5px] text-[var(--text-muted)]">
              {{ { draft: 'Brouillon', pending_signature: 'En attente de signature', signed: 'Signé' }[detail.status] }}
            </p>
          </div>
          <button type="button" class="grid h-9 w-9 place-items-center rounded-pill bg-sand-200 text-base text-sand-800" @click="emit('close')">✕</button>
        </div>

        <div class="overflow-y-auto p-6">
          <p v-if="!detail && loading" class="m-0 text-sm text-[var(--text-muted)]">Création en cours…</p>

          <template v-else-if="detail">
            <p v-if="errorMessage" class="mb-3.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>

            <div v-if="detail.status === 'signed'" class="mb-4 rounded-md border border-ok-border bg-ok-bg p-4">
              <p class="m-0 text-[13.5px] font-bold text-green-900">Signé des deux parties{{ detail.signed_at ? ` le ${new Date(detail.signed_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : '' }}.</p>
            </div>
            <div v-else-if="detail.status === 'pending_signature'" class="mb-4 rounded-md border border-warn-border bg-warn-bg p-4">
              <p class="m-0 text-[13.5px] font-semibold text-warn-fg">En attente de signature.{{ waitingLabel }}</p>
            </div>

            <div v-if="canSign" class="mb-4">
              <div
                class="grid h-[100px] cursor-pointer place-items-center rounded-md border-[1.5px] border-dashed bg-white"
                :class="signed ? 'border-green-600' : 'border-[var(--border-default)]'"
                @click="signed = true"
              >
                <span v-if="signed" class="-rotate-[4deg] font-display text-2xl italic text-green-800">Signé</span>
                <span v-else class="text-[13px] text-[var(--text-faint)]">✎ Tracez votre signature ici</span>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <p class="mb-1.5 mt-0 text-[12px] font-bold text-[var(--text-muted)]">Relevé électricité</p>
                <input v-model="meterElectricity" :disabled="readOnly" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13.5px] outline-none disabled:bg-sand-100">
              </div>
              <div>
                <p class="mb-1.5 mt-0 text-[12px] font-bold text-[var(--text-muted)]">Relevé eau</p>
                <input v-model="meterWater" :disabled="readOnly" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13.5px] outline-none disabled:bg-sand-100">
              </div>
            </div>

            <p class="mb-1.5 mt-3.5 text-[12px] font-bold text-[var(--text-muted)]">Commentaire général</p>
            <textarea v-model="generalComment" :disabled="readOnly" rows="2" class="w-full resize-y rounded-md border border-[var(--border-default)] bg-white p-3 text-sm outline-none disabled:bg-sand-100" />

            <div v-for="(room, ri) in rooms" :key="ri" class="mt-4 rounded-lg border border-[var(--border-subtle)] bg-white p-4">
              <div class="flex items-center justify-between gap-2.5">
                <p class="m-0 text-[14.5px] font-bold">{{ room.name }}</p>
                <button v-if="!readOnly" type="button" class="text-xs font-bold text-danger-fg" @click="removeRoom(ri)">Retirer la pièce</button>
              </div>

              <div v-for="(item, ii) in room.items" :key="ii" class="mt-3 grid grid-cols-1 gap-2 border-t border-sand-200 pt-3 sm:grid-cols-[1.2fr_1fr_1.4fr_auto]">
                <input v-model="item.name" :disabled="readOnly" placeholder="Objet (ex. Peinture murs)" class="h-9 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] outline-none disabled:bg-sand-100">
                <select v-model="item.state" :disabled="readOnly" class="h-9 w-full rounded-sm border border-[var(--border-default)] bg-white px-2 text-[13px] disabled:bg-sand-100">
                  <option v-for="s in INVENTORY_ITEM_STATES" :key="s.code" :value="s.code">{{ s.label }}</option>
                </select>
                <input v-model="item.comment" :disabled="readOnly" placeholder="Commentaire" class="h-9 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] outline-none disabled:bg-sand-100">
                <button v-if="!readOnly" type="button" class="whitespace-nowrap rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-xs font-bold" @click="removeItem(room, ii)">✕</button>
              </div>
              <p v-if="!room.items.length" class="mb-0 mt-2 text-[12.5px] text-[var(--text-faint)]">Aucun objet ajouté.</p>
              <button v-if="!readOnly" type="button" class="mt-3 text-[12.5px] font-bold text-green-700" @click="addItem(room)">+ Ajouter un objet</button>
            </div>
            <p v-if="!rooms.length" class="mt-4 text-[13px] text-[var(--text-muted)]">Aucune pièce ajoutée pour l'instant.</p>

            <div v-if="!readOnly" class="mt-4 flex gap-2">
              <input v-model="newRoomName" placeholder="Nom de la pièce (ex. Cuisine)" class="h-10 flex-1 rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13.5px] outline-none" @keydown.enter="addRoom">
              <button type="button" class="whitespace-nowrap rounded-sm border border-[var(--border-default)] bg-white px-4 text-[12.5px] font-bold" @click="addRoom">+ Pièce</button>
            </div>
          </template>
        </div>

        <div v-if="detail" class="flex items-center gap-2.5 border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-6 py-[16px]">
          <button type="button" class="text-sm font-bold text-[var(--text-muted)]" @click="emit('close')">Fermer</button>
          <div class="flex-1" />
          <template v-if="!readOnly">
            <CoreButton tone="secondary" :disabled="loading" @click="save">{{ loading ? '…' : 'Enregistrer' }}</CoreButton>
            <CoreButton v-if="canSend" :disabled="loading" @click="sendForSignature">Envoyer pour signature</CoreButton>
          </template>
          <CoreButton v-if="canSign" tone="accent" :disabled="loading || !signed" @click="submitSignature">{{ loading ? '…' : 'Signer' }}</CoreButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
