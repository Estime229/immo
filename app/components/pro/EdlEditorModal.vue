<script setup lang="ts">
import type { InventoryDetail, InventoryRoom, InventoryType } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import {
  awaitingMySignature, cleanRooms, editableRooms, INVENTORY_ITEM_STATES, INVENTORY_STATUS_LABEL, inventoryEditable,
  itemStateLabel, nextRoomName, pickInventory, presetRoom, ROOM_PRESETS, validateInventoryForSend
} from '~/utils/inventories'

const props = defineProps<{
  inventory: InventoryDetail | null
  leaseId?: string
  bookingId?: string
  type: InventoryType
  title: string
  /** Nom de l'autre partie, pour les messages. */
  tenantName?: string
}>()
/** `saved` à la fermeture si quelque chose a changé (le parent recharge sa liste). */
const emit = defineEmits<{ close: []; saved: [] }>()

const inventoriesApi = useInventoriesApi()
const doc = useOpenDocument()

const detail = ref<InventoryDetail | null>(props.inventory)
const loading = ref(false)
const errorMessage = ref('')
const changed = ref(false)
const body = ref<HTMLElement | null>(null)

const rooms = ref<InventoryRoom[]>(editableRooms(props.inventory?.rooms))
const generalComment = ref(props.inventory?.general_comment ?? '')
const meterElectricity = ref(props.inventory?.meter_readings?.electricity ?? '')
const meterWater = ref(props.inventory?.meter_readings?.water ?? '')
const newRoomName = ref('')

function syncFrom(inv: InventoryDetail) {
  detail.value = inv
  rooms.value = editableRooms(inv.rooms)
  generalComment.value = inv.general_comment ?? ''
  meterElectricity.value = inv.meter_readings?.electricity ?? ''
  meterWater.value = inv.meter_readings?.water ?? ''
}

onMounted(async () => {
  if (detail.value) return
  loading.value = true
  try {
    // L'API crée un doublon dès que l'existant n'est plus un brouillon (#58) : on relit avant de créer.
    const existing = pickInventory(props.leaseId ? await inventoriesApi.fetchByLease(props.leaseId) : await inventoriesApi.fetchByBooking(props.bookingId!), props.type)
    if (existing) {
      syncFrom(existing)
      return
    }
    syncFrom(await inventoriesApi.create({ lease_id: props.leaseId, booking_id: props.bookingId, type: props.type }))
    changed.value = true
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'état des lieux n'a pas pu être créé.") : "L'état des lieux n'a pas pu être créé."
  } finally {
    loading.value = false
  }
})

/** Modifiable tant que personne n'a signé : l'API laisse réécrire après une signature (faille #57), le front non. */
const editable = computed(() => inventoryEditable(detail.value, false))
const mustSign = computed(() => awaitingMySignature(detail.value, false))
const otherName = computed(() => props.tenantName || 'le locataire')

function addPreset(p: { name: string; items: string[] }) {
  rooms.value.push(presetRoom(p, rooms.value.map(r => r.name)))
}
function addRoom() {
  const name = newRoomName.value.trim()
  if (!name) return
  rooms.value.push({ name: nextRoomName(name, rooms.value.map(r => r.name)), items: [] })
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
    const meters = { electricity: meterElectricity.value.trim() || undefined, water: meterWater.value.trim() || undefined }
    syncFrom(await inventoriesApi.update(detail.value.id, {
      rooms: cleanRooms(rooms.value),
      general_comment: generalComment.value.trim() || undefined,
      meter_readings: meters.electricity || meters.water ? meters : undefined
    }))
    changed.value = true
    return true
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'enregistrement a échoué.") : "L'enregistrement a échoué."
    return false
  } finally {
    loading.value = false
  }
}

const confirmSend = ref(false)
function askSend() {
  errorMessage.value = validateInventoryForSend(rooms.value) ?? ''
  if (!errorMessage.value) confirmSend.value = true
}
async function sendForSignature() {
  confirmSend.value = false
  if (!(await save()) || !detail.value) return
  loading.value = true
  try {
    detail.value = await inventoriesApi.send(detail.value.id)
    changed.value = true
    // La zone de signature apparaît en haut : on y remonte (on était en bas, sur les pièces).
    await nextTick()
    body.value?.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'envoi a échoué.") : "L'envoi a échoué."
  } finally {
    loading.value = false
  }
}

/* ---- Signature (tracé réel, imprimé sur le PDF) ---- */
const signature = ref('')
const pad = ref<{ rememberIfAsked: () => Promise<void> } | null>(null)
async function submitSignature() {
  if (!detail.value || !signature.value) return
  // Contenu encore modifiable : on enregistre d'abord, pour signer ce qui est affiché.
  if (editable.value && !(await save())) return
  loading.value = true
  errorMessage.value = ''
  try {
    detail.value = await inventoriesApi.sign(detail.value!.id, signature.value)
    changed.value = true
    await pad.value?.rememberIfAsked()
  } catch (e) {
    errorMessage.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La signature a échoué.') : 'La signature a échoué.'
  } finally {
    loading.value = false
  }
}

async function openPdf() {
  if (!detail.value) return
  const url = `/pdf/inventories/${detail.value.id}`
  errorMessage.value = (await doc.open('pdf', url, url)) ?? ''
}

function close() {
  if (changed.value) emit('saved')
  emit('close')
}

const statusLine = computed(() => {
  const d = detail.value
  if (!d) return ''
  if (d.status === 'signed') return `Signé par les deux parties${d.signed_at ? ` le ${new Date(d.signed_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.`
  if (d.status === 'pending_signature') {
    if (d.landlord_signature && !d.tenant_signature) return `Vous avez signé — en attente de la signature de ${otherName.value}.`
    if (d.tenant_signature && !d.landlord_signature) return `${otherName.value.charAt(0).toUpperCase()}${otherName.value.slice(1)} a signé — à vous.`
    return `Envoyé à ${otherName.value}. Signez à votre tour, par exemple ensemble lors de la remise des clés.`
  }
  return ''
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-3 backdrop-blur-[3px] sm:p-6" @click="close">
      <div class="flex max-h-[90vh] w-[640px] max-w-full animate-[im-rise_.28s_var(--ease-standard)_both] flex-col overflow-hidden rounded-2xl bg-[var(--surface-page)] shadow-panel" @click.stop>
        <div class="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-6 py-[18px]">
          <div class="min-w-0">
            <h3 class="m-0 truncate font-display text-lg font-bold tracking-[-.02em]">{{ title }}</h3>
            <p v-if="detail" class="mb-0 mt-1 text-[12.5px] text-[var(--text-muted)]">{{ INVENTORY_STATUS_LABEL[detail.status] ?? detail.status }}</p>
          </div>
          <button type="button" class="grid h-9 w-9 flex-none place-items-center rounded-pill bg-sand-200 text-base text-sand-800" aria-label="Fermer" @click="close">✕</button>
        </div>

        <div ref="body" class="overflow-y-auto p-6">
          <p v-if="!detail && loading" class="m-0 text-sm text-[var(--text-muted)]">Création en cours…</p>
          <p v-if="errorMessage" class="mb-3.5 mt-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
          <template v-if="detail">
            <div v-if="statusLine" class="mb-4 rounded-md border p-4" :class="detail.status === 'signed' ? 'border-ok-border bg-ok-bg' : 'border-warn-border bg-warn-bg'">
              <p class="m-0 text-[13.5px] font-semibold" :class="detail.status === 'signed' ? 'text-green-900' : 'text-warn-fg'">{{ statusLine }}</p>
            </div>

            <div v-if="mustSign" class="mb-5 rounded-xl border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-4.5">
              <p class="m-0 text-[14px] font-bold text-clay-700">Votre signature</p>
              <p class="mb-3 mt-1.5 text-[12.5px] leading-[1.55] text-clay-900">Relisez le contenu ci-dessous : une fois signé, il ne peut plus être modifié.</p>
              <FormsSignaturePad ref="pad" v-model="signature" />
            </div>

            <p v-if="editable && detail.status === 'draft'" class="mb-4 mt-0 text-[13px] leading-[1.55] text-[var(--text-muted)]">
              Parcourez le logement pièce par pièce. Ajoutez les pièces en un clic, puis ajustez l'état de chaque élément. Enregistrez à tout moment ; envoyez à {{ otherName }} quand c'est terminé.
            </p>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">Relevé du compteur d'électricité</span>
                <input v-model="meterElectricity" :disabled="!editable" inputmode="decimal" placeholder="ex. 04521" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13.5px] outline-none disabled:bg-sand-100">
              </label>
              <label class="block">
                <span class="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">Relevé du compteur d'eau</span>
                <input v-model="meterWater" :disabled="!editable" inputmode="decimal" placeholder="ex. 0318" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13.5px] outline-none disabled:bg-sand-100">
              </label>
            </div>
            <label class="mt-3.5 block">
              <span class="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">Commentaire général</span>
              <textarea v-model="generalComment" :disabled="!editable" rows="2" maxlength="2000" class="w-full resize-y rounded-md border border-[var(--border-default)] bg-white p-3 text-sm outline-none disabled:bg-sand-100" />
            </label>

            <div v-for="(room, ri) in rooms" :key="ri" class="mt-4 rounded-lg border border-[var(--border-subtle)] bg-white p-4">
              <div class="flex items-center justify-between gap-2.5">
                <input v-if="editable" v-model="room.name" class="h-9 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 text-[14.5px] font-bold outline-none hover:border-[var(--border-default)] focus:border-[var(--border-default)]" aria-label="Nom de la pièce">
                <p v-else class="m-0 text-[14.5px] font-bold">{{ room.name }}</p>
                <button v-if="editable" type="button" class="flex-none text-xs font-bold text-danger-fg" @click="removeRoom(ri)">Retirer</button>
              </div>
              <div v-for="(item, ii) in room.items" :key="ii" class="mt-3 border-t border-sand-200 pt-3">
                <div v-if="editable" class="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_1fr_1.4fr_auto]">
                  <input v-model="item.name" placeholder="Élément (ex. Murs)" class="h-9 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] outline-none">
                  <select v-model="item.state" class="h-9 w-full rounded-sm border border-[var(--border-default)] bg-white px-2 text-[13px]">
                    <option v-for="s in INVENTORY_ITEM_STATES" :key="s.code" :value="s.code">{{ s.label }}</option>
                  </select>
                  <input v-model="item.comment" placeholder="Remarque (facultatif)" class="h-9 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] outline-none">
                  <button type="button" class="h-9 whitespace-nowrap rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-xs font-bold" aria-label="Retirer l'élément" @click="removeItem(room, ii)">✕</button>
                </div>
                <div v-else class="flex items-start gap-2.5">
                  <div class="min-w-0 flex-1">
                    <p class="m-0 text-[13.5px] font-semibold">{{ item.name || 'Élément' }}</p>
                    <p v-if="item.comment" class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)] [overflow-wrap:anywhere]">{{ item.comment }}</p>
                  </div>
                  <span class="flex-none text-[12.5px] font-bold text-[var(--text-secondary)]">{{ itemStateLabel(item.state) }}</span>
                </div>
              </div>
              <p v-if="!room.items.length" class="mb-0 mt-2 text-[12.5px] text-[var(--text-faint)]">Aucun élément constaté.</p>
              <button v-if="editable" type="button" class="mt-3 text-[12.5px] font-bold text-green-700" @click="addItem(room)">+ Ajouter un élément</button>
            </div>

            <template v-if="editable">
              <p class="mb-2 mt-5 text-[12px] font-bold text-[var(--text-muted)]">Ajouter une pièce</p>
              <div class="flex flex-wrap gap-2">
                <button v-for="p in ROOM_PRESETS" :key="p.name" type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold hover:border-green-600" @click="addPreset(p)">+ {{ p.name }}</button>
              </div>
              <div class="mt-2.5 flex gap-2">
                <input v-model="newRoomName" placeholder="Autre pièce (ex. Bureau)" class="h-10 min-w-0 flex-1 rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13.5px] outline-none" @keydown.enter="addRoom">
                <button type="button" class="whitespace-nowrap rounded-sm border border-[var(--border-default)] bg-white px-4 text-[12.5px] font-bold" @click="addRoom">Ajouter</button>
              </div>
            </template>
            <p v-else-if="!rooms.length" class="mt-4 text-[13px] text-[var(--text-muted)]">Aucune pièce.</p>
          </template>
        </div>

        <div v-if="detail" class="border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-6 py-[16px]">
          <div v-if="confirmSend" class="mb-3 rounded-md border border-warn-border bg-warn-bg p-3.5 text-[13px] text-warn-fg">
            <p class="m-0 font-bold">Envoyer à {{ otherName }} pour signature ?</p>
            <p class="mb-0 mt-1">Vous pourrez encore corriger tant que personne n'a signé. Après la première signature, le contenu est figé.</p>
            <div class="mt-2.5 flex gap-2">
              <CoreButton tone="secondary" @click="confirmSend = false">Pas encore</CoreButton>
              <CoreButton :disabled="loading" @click="sendForSignature">Envoyer</CoreButton>
            </div>
          </div>
          <div v-else class="flex flex-wrap items-center gap-2.5">
            <button v-if="detail.status !== 'draft'" type="button" class="text-[13px] font-bold text-green-700 underline disabled:opacity-60" :disabled="doc.loadingKey.value === 'pdf'" @click="openPdf">
              {{ doc.loadingKey.value === 'pdf' ? 'PDF…' : 'PDF' }}
            </button>
            <button v-else type="button" class="text-sm font-bold text-[var(--text-muted)]" @click="close">Fermer</button>
            <div class="flex-1" />
            <template v-if="editable">
              <CoreButton tone="secondary" :disabled="loading" @click="save">{{ loading ? '…' : 'Enregistrer' }}</CoreButton>
              <CoreButton v-if="detail.status === 'draft'" :disabled="loading" @click="askSend">Envoyer pour signature</CoreButton>
            </template>
            <CoreButton v-if="mustSign" tone="accent" :disabled="loading || !signature" @click="submitSignature">{{ loading ? '…' : 'Signer' }}</CoreButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
