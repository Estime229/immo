<script setup lang="ts">
import { FileText, Plus, X } from '@lucide/vue'
import type { InventoryDetail, InventoryRoom, InventoryType } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import {
  awaitingMySignature, cleanRooms, compareItem, editableRooms, entryStates, exitDegradations, hasUnresolvedPhotos, INVENTORY_ITEM_STATES,
  INVENTORY_STATUS_LABEL, inventoryChanged, inventoryEditable, itemStateLabel, meterConsumption, nextRoomName, pickInventory, presetRoom,
  ROOM_PRESETS, roomsFromEntry, validateInventoryForSend
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
const photos = useInventoryPhotos()

const detail = ref<InventoryDetail | null>(props.inventory)
const loading = ref(false)
const errorMessage = ref('')
const changed = ref(false)
/** Haut du contenu : on y remonte après l'envoi, là où apparaît la zone de signature. */
const top = ref<HTMLElement | null>(null)

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
  savedSnapshot.value = snapshot()
}

/*
 * Saisie non enregistrée (pièces, photos, remarques, relevés, signature tracée) :
 * la fenêtre ne se ferme plus sur un clic à côté, et la croix demande confirmation.
 */
function snapshot() {
  return JSON.stringify([rooms.value, generalComment.value, meterElectricity.value, meterWater.value])
}
const savedSnapshot = ref(snapshot())

/** État des lieux d'entrée du même bail/séjour : point de départ et référence d'une sortie (Lot 52). */
const entryRef = ref<InventoryDetail | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    const all = props.leaseId ? await inventoriesApi.fetchByLease(props.leaseId) : await inventoriesApi.fetchByBooking(props.bookingId!)
    if (props.type === 'exit') entryRef.value = pickInventory(all, 'entry')
    if (detail.value) return
    // L'API crée un doublon dès que l'existant n'est plus un brouillon (#61) : on relit avant de créer.
    const existing = pickInventory(all, props.type)
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

/* ---- Sortie comparée à l'entrée ---- */
const entryMap = computed(() => (props.type === 'exit' && entryRef.value ? entryStates(entryRef.value.rooms) : null))
function comparison(room: InventoryRoom, item: InventoryRoom['items'][number]) {
  return entryMap.value ? compareItem(entryMap.value, room.name, item.name, item.state) : null
}
const degradations = computed(() => (entryRef.value ? exitDegradations(rooms.value, entryRef.value.rooms) : []))
const consumption = computed(() => (entryRef.value ? meterConsumption(entryRef.value.meter_readings, { electricity: meterElectricity.value, water: meterWater.value }) : null))
function startFromEntry() {
  if (entryRef.value) rooms.value = roomsFromEntry(entryRef.value.rooms)
}

/* ---- Photos ---- */
const photoProgress = ref('')
function removeExisting(item: InventoryRoom['items'][number], pi: number) {
  item._existing = (item._existing ?? []).filter(x => x !== pi)
}
function removeUrl(item: InventoryRoom['items'][number], url: string) {
  item.photos = (item.photos ?? []).filter(x => x !== url)
}

async function save(): Promise<boolean> {
  if (!detail.value) return false
  loading.value = true
  errorMessage.value = ''
  try {
    // L'API efface toute photo absente du PATCH et ne renvoie jamais leurs URLs (#71) : on les récupère d'abord.
    if (hasUnresolvedPhotos(rooms.value)) {
      const lost = await photos.resolveExisting(detail.value.id, rooms.value, (d, t) => { photoProgress.value = `Conservation des photos… ${d}/${t}` })
      photoProgress.value = lost ? `${lost} photo${lost > 1 ? 's' : ''} déjà enregistrée${lost > 1 ? 's' : ''} n'${lost > 1 ? 'ont' : 'a'} pas pu être récupérée${lost > 1 ? 's' : ''}.` : ''
    }
    const meters = { electricity: meterElectricity.value.trim() || undefined, water: meterWater.value.trim() || undefined }
    // Les pièces locales restent la référence (elles portent les URLs des photos) : seul le reste est relu.
    detail.value = await inventoriesApi.update(detail.value.id, {
      rooms: cleanRooms(rooms.value),
      general_comment: generalComment.value.trim() || undefined,
      meter_readings: meters.electricity || meters.water ? meters : undefined
    })
    changed.value = true
    savedSnapshot.value = snapshot()
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
    top.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
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
    // Contenu figé : on vérifie qu'il n'a pas changé depuis l'ouverture (l'autre partie peut encore l'écrire côté API, #56).
    if (!editable.value) {
      const fresh = await inventoriesApi.fetchOne(detail.value.id)
      if (inventoryChanged(detail.value, fresh)) {
        syncFrom(fresh)
        errorMessage.value = "Cet état des lieux vient d'être modifié : relisez-le, puis signez."
        return
      }
    }
    detail.value = await inventoriesApi.sign(detail.value!.id, signature.value)
    changed.value = true
    signature.value = ''
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

const dirty = computed(() => (editable.value && snapshot() !== savedSnapshot.value) || (mustSign.value && !!signature.value))
const confirmClose = ref(false)
function close(force = false) {
  if (dirty.value && !force) {
    confirmClose.value = true
    return
  }
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
  <CoreModal :open="true" :title="title" width="640px" :dirty="dirty" @close="close()">
    <div ref="top" />
    <p v-if="detail" class="mb-3.5 mt-0 text-xs text-[var(--text-faint)]">{{ INVENTORY_STATUS_LABEL[detail.status] ?? 'Statut inconnu' }}</p>
    <p v-if="!detail && loading" class="m-0 text-[13.5px] text-[var(--text-muted)]">Création en cours…</p>
    <p v-if="errorMessage" class="mb-3.5 mt-0 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ errorMessage }}</p>
    <p v-if="photoProgress" class="mb-3.5 mt-0 text-[12.5px] font-semibold text-[var(--text-muted)]">{{ photoProgress }}</p>
    <template v-if="detail">
      <div v-if="statusLine" class="mb-4 rounded-md border p-4" :class="detail.status === 'signed' ? 'border-ok-border bg-ok-bg' : 'border-warn-border bg-warn-bg'">
        <p class="m-0 text-[13.5px] font-semibold" :class="detail.status === 'signed' ? 'text-green-900' : 'text-warn-fg'">{{ statusLine }}</p>
      </div>

      <div v-if="mustSign" class="mb-5 rounded-xl border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-4.5">
        <p class="m-0 text-sm font-bold text-clay-700">Votre signature</p>
        <p class="mb-3 mt-1.5 text-[12.5px] leading-[1.55] text-clay-900">Relisez le contenu ci-dessous : une fois signé, il ne peut plus être modifié.</p>
        <FormsSignaturePad ref="pad" v-model="signature" />
      </div>

      <p v-if="editable && detail.status === 'draft'" class="mb-4 mt-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
        Parcourez le logement pièce par pièce. Ajoutez les pièces en un clic, puis ajustez l'état de chaque élément. Enregistrez à tout moment ; envoyez à {{ otherName }} quand c'est terminé.
      </p>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="mb-[7px] block text-[12.5px] font-bold">Relevé du compteur d'électricité</span>
          <input v-model="meterElectricity" :disabled="!editable" inputmode="decimal" placeholder="ex. 04521" class="h-11 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-[13.5px] outline-none disabled:bg-sand-100">
        </label>
        <label class="block">
          <span class="mb-[7px] block text-[12.5px] font-bold">Relevé du compteur d'eau</span>
          <input v-model="meterWater" :disabled="!editable" inputmode="decimal" placeholder="ex. 0318" class="h-11 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 font-mono text-[13.5px] outline-none disabled:bg-sand-100">
        </label>
      </div>
      <label class="mt-3.5 block">
        <span class="mb-[7px] block text-[12.5px] font-bold">Commentaire général</span>
        <textarea v-model="generalComment" :disabled="!editable" rows="2" maxlength="2000" class="w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] p-3 text-sm outline-none disabled:bg-sand-100" />
      </label>

      <!-- Sortie : comparée à l'entrée (Lot 52) -->
      <div v-if="type === 'exit' && entryRef" class="mt-4 rounded-md border p-4" :class="degradations.length ? 'border-danger-border bg-danger-bg' : 'border-[var(--border-subtle)] bg-white'">
        <p class="m-0 text-[13.5px] font-bold" :class="degradations.length ? 'text-danger-fg' : ''">
          {{ degradations.length ? `${degradations.length} élément${degradations.length > 1 ? 's' : ''} dégradé${degradations.length > 1 ? 's' : ''} depuis l'entrée` : "Aucun élément dégradé depuis l'entrée" }}
        </p>
        <ul v-if="degradations.length" class="mb-0 mt-1.5 list-disc pl-5 text-[12.5px] text-danger-fg">
          <li v-for="d in degradations" :key="`${d.room}|${d.item}`">{{ d.room }} · {{ d.item }} : {{ itemStateLabel(d.from) }}, devenu {{ itemStateLabel(d.to).toLowerCase() }}</li>
        </ul>
        <p v-if="consumption && (consumption.electricity !== null || consumption.water !== null)" class="mb-0 mt-1.5 text-[12.5px] text-[var(--text-muted)]">
          Consommation depuis l'entrée :<template v-if="consumption.electricity !== null"> électricité <span class="font-mono">{{ consumption.electricity }}</span></template><template v-if="consumption.electricity !== null && consumption.water !== null"> ·</template><template v-if="consumption.water !== null"> eau <span class="font-mono">{{ consumption.water }}</span></template>
        </p>
      </div>
      <p v-else-if="type === 'exit' && !loading" class="mb-0 mt-4 text-[12.5px] text-[var(--text-muted)]">Aucun état des lieux d'entrée : la sortie ne pourra pas lui être comparée.</p>
      <button v-if="editable && type === 'exit' && !rooms.length && entryRef?.rooms.length" type="button" class="mt-3 w-full rounded-md border border-dashed border-green-600 bg-green-50 px-4 py-3 text-[13px] font-bold text-green-800" @click="startFromEntry">
        Reprendre les {{ entryRef.rooms.length }} pièces de l'état des lieux d'entrée
      </button>

      <div v-for="(room, ri) in rooms" :key="ri" class="mt-4 rounded-lg border border-[var(--border-subtle)] bg-white p-4">
        <div class="flex items-center justify-between gap-2.5">
          <input v-if="editable" v-model="room.name" class="h-9 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 text-[14.5px] font-bold outline-none hover:border-[var(--border-default)] focus:border-[var(--border-default)]" aria-label="Nom de la pièce">
          <p v-else class="m-0 text-[14.5px] font-bold">{{ room.name }}</p>
          <button v-if="editable" type="button" class="flex-none rounded-pill px-3 py-2 text-xs font-bold text-danger-fg hover:bg-danger-bg" @click="removeRoom(ri)">Retirer la pièce</button>
        </div>
        <div v-for="(item, ii) in room.items" :key="ii" class="mt-3 border-t border-sand-200 pt-3">
          <div v-if="editable" class="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1.2fr_1fr_1.4fr_auto]">
            <input v-model="item.name" placeholder="Élément (ex. Murs)" class="col-span-1 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] outline-none">
            <button type="button" class="grid h-10 w-10 place-items-center rounded-sm border border-[var(--border-default)] bg-white text-[var(--text-secondary)] sm:order-last" aria-label="Retirer l'élément" @click="removeItem(room, ii)"><X class="h-4 w-4" :stroke-width="1.9" /></button>
            <select v-model="item.state" class="col-span-2 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2 text-[13px] sm:col-span-1">
              <option v-for="st in INVENTORY_ITEM_STATES" :key="st.code" :value="st.code">{{ st.label }}</option>
            </select>
            <input v-model="item.comment" placeholder="Remarque (facultatif)" class="col-span-2 h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] outline-none sm:col-span-1">
          </div>
          <div v-else class="flex items-start gap-2.5">
            <div class="min-w-0 flex-1">
              <p class="m-0 text-[13.5px] font-semibold">{{ item.name || 'Élément' }}</p>
              <p v-if="item.comment" class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)] [overflow-wrap:anywhere]">{{ item.comment }}</p>
            </div>
            <span class="flex-none text-[12.5px] font-bold text-[var(--text-secondary)]">{{ itemStateLabel(item.state) }}</span>
          </div>
          <p v-if="comparison(room, item)?.entryState" class="mb-0 mt-1 text-[11.5px]" :class="comparison(room, item)?.degraded ? 'font-bold text-danger-fg' : 'text-[var(--text-faint)]'">
            À l'entrée : {{ itemStateLabel(comparison(room, item)?.entryState ?? '') }}{{ comparison(room, item)?.degraded ? ' (dégradé depuis)' : '' }}
          </p>
          <EdlPhotoStrip
            :api="photos"
            :inventory-id="detail.id"
            :origin="item._origin ?? null"
            :existing="item._existing ?? []"
            :urls="item.photos ?? []"
            :editable="editable"
            @added="item.photos = [...(item.photos ?? []), $event]"
            @remove-existing="removeExisting(item, $event)"
            @remove-url="removeUrl(item, $event)"
          />
        </div>
        <p v-if="!room.items.length" class="mb-0 mt-2 text-[12.5px] text-[var(--text-faint)]">Aucun élément constaté.</p>
        <button v-if="editable" type="button" class="mt-3 inline-flex items-center gap-1 text-[12.5px] font-bold text-green-700" @click="addItem(room)"><Plus class="h-3.5 w-3.5" :stroke-width="1.9" />Ajouter un élément</button>
      </div>

      <template v-if="editable">
        <p class="mb-2 mt-5 text-[12.5px] font-bold">Ajouter une pièce</p>
        <div class="flex flex-wrap gap-2">
          <button v-for="p in ROOM_PRESETS" :key="p.name" type="button" class="inline-flex items-center gap-1 rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold hover:border-green-600" @click="addPreset(p)"><Plus class="h-3.5 w-3.5" :stroke-width="1.9" />{{ p.name }}</button>
        </div>
        <div class="mt-2.5 flex gap-2">
          <input v-model="newRoomName" placeholder="Autre pièce (ex. Bureau)" class="h-10 min-w-0 flex-1 rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13.5px] outline-none" @keydown.enter="addRoom">
          <CoreButton size="sm" tone="secondary" @click="addRoom">Ajouter</CoreButton>
        </div>
      </template>
      <p v-else-if="!rooms.length" class="mt-4 text-[13.5px] text-[var(--text-muted)]">Aucune pièce.</p>
    </template>

    <template v-if="detail" #footer>
      <CoreInlineConfirm
        v-if="confirmClose"
        tone="warning"
        message="Fermer sans enregistrer ? Les pièces, photos, remarques et relevés ajoutés depuis le dernier enregistrement seront perdus."
        confirm-label="Fermer sans enregistrer"
        cancel-label="Rester"
        @confirm="close(true)"
        @cancel="confirmClose = false"
      />
      <CoreInlineConfirm
        v-else-if="confirmSend"
        tone="neutral"
        :message="`Envoyer à ${otherName} pour signature ? Vous pourrez encore corriger tant que personne n'a signé ; après la première signature, le contenu est figé.`"
        confirm-label="Envoyer"
        cancel-label="Pas encore"
        :loading="loading"
        @confirm="sendForSignature"
        @cancel="confirmSend = false"
      />
      <div v-else class="flex flex-wrap items-center gap-2.5">
        <button v-if="detail.status !== 'draft'" type="button" class="inline-flex items-center gap-1.5 text-[13px] font-bold text-green-700 disabled:opacity-60" :disabled="doc.loadingKey.value === 'pdf'" @click="openPdf">
          <FileText class="h-4 w-4" :stroke-width="1.9" />{{ doc.loadingKey.value === 'pdf' ? 'Génération…' : 'PDF' }}
        </button>
        <div class="flex-1" />
        <template v-if="editable">
          <CoreButton tone="secondary" :disabled="loading" @click="save">{{ loading ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
          <CoreButton v-if="detail.status === 'draft'" :disabled="loading" @click="askSend">Envoyer pour signature</CoreButton>
        </template>
        <CoreButton v-if="mustSign" tone="accent" :disabled="loading || !signature" @click="submitSignature">{{ loading ? 'Signature…' : 'Signer' }}</CoreButton>
      </div>
    </template>
  </CoreModal>
</template>
