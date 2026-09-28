<script setup lang="ts">
import type { InventoryDetail, InventoryType, LeaseContractType, LeaseSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import {
  cancelUnpaidState, depositExceedsCap, entryBreakdown, invoiceView, leasePhase, leaseStepIndex, LEASE_PHASE_LABEL,
  LEASE_PHASE_TONE, LEASE_STEPS, noticeDepartureDate, RENT_LABEL, RENT_SUFFIX, sortInvoices, validateLeaseForm
} from '~/utils/leases'
import { awaitingMySignature, INVENTORY_STATUS_LABEL, pickInventory } from '~/utils/inventories'

definePageMeta({ layout: 'pro' })

const route = useRoute()
const leaseId = computed(() => String(route.params.id))
const leasesApi = useLeasesApi()
const inventoriesApi = useInventoriesApi()
const messagingApi = useMessagingApi()
const doc = useOpenDocument()

/** Pas de `GET /leases/:id` côté API : la fiche relit `GET /leases/my`. */
const lease = ref<LeaseSummary | null>(null)
const state = ref<'loading' | 'error' | 'missing' | 'ready'>('loading')
async function load() {
  if (!lease.value) state.value = 'loading'
  try {
    const all = await leasesApi.fetchMine()
    lease.value = all.find(l => l.id === leaseId.value) ?? null
    state.value = lease.value ? 'ready' : 'missing'
    if (lease.value) loadInventories()
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const phase = computed(() => (lease.value ? leasePhase(lease.value) : null))
const entry = computed(() => (lease.value ? entryBreakdown(lease.value) : null))
const tenantName = computed(() => `${lease.value?.tenant.first_name ?? ''} ${lease.value?.tenant.last_name ?? ''}`.trim() || 'le locataire')
const departure = computed(() => (lease.value ? noticeDepartureDate(lease.value) : null))
const unpaid = computed(() => (lease.value ? cancelUnpaidState(lease.value) : null))
const invoices = computed(() => sortInvoices(lease.value?.invoices).reverse())
const paidTotal = computed(() => (lease.value?.invoices ?? []).filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0))
const rentSuffix = computed(() => RENT_SUFFIX[lease.value?.billing_frequency ?? 'monthly'])

function formatDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  const day = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return withTime ? `${day} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : day
}

const actionError = ref('')
const busy = ref(false)
async function run(action: () => Promise<unknown>, fallback: string) {
  busy.value = true
  actionError.value = ''
  try {
    await action()
    await load()
    return true
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback
    return false
  } finally {
    busy.value = false
  }
}

/* ---- Brouillon : modification ---- */
const editing = ref(false)
const form = reactive({ rent: '', deposit: '', startDate: '', endDate: '', noticePeriod: '3', contractType: 'standard' as LeaseContractType, depositAck: false })
function startEdit() {
  const l = lease.value
  if (!l) return
  Object.assign(form, {
    rent: String(Math.round(Number(l.signed_rent))),
    deposit: String(Math.round(Number(l.deposit_amount))),
    startDate: l.start_date.slice(0, 10),
    endDate: l.end_date?.slice(0, 10) ?? '',
    noticePeriod: String(l.notice_period ?? 3),
    contractType: l.contract_type as LeaseContractType,
    depositAck: false
  })
  actionError.value = ''
  editing.value = true
}
const formExceeds = computed(() => depositExceedsCap(lease.value?.billing_frequency ?? 'monthly', Number(form.rent), Number(form.deposit)))
async function saveEdit() {
  const l = lease.value
  if (!l) return
  const error = validateLeaseForm({ tenantId: l.tenant.id, unitId: l.unit?.id ?? 'x', rent: form.rent, deposit: form.deposit, startDate: form.startDate, endDate: form.endDate, noticePeriod: form.noticePeriod })
  if (error) { actionError.value = error; return }
  if (formExceeds.value && !form.depositAck) { actionError.value = "Cochez l'accord des deux parties pour une caution au-delà de 3 mois de loyer."; return }
  const ok = await run(() => leasesApi.updateDraft(l.id, {
    monthlyRent: Number(form.rent),
    depositAmount: Number(form.deposit),
    startDate: form.startDate,
    endDate: form.endDate || null,
    noticePeriod: Number(form.noticePeriod),
    contractType: form.contractType,
    depositAcknowledged: formExceeds.value ? true : undefined
  }), "Le bail n'a pas pu être modifié.")
  if (ok) editing.value = false
}

/* ---- Envoi (signe à votre place) ---- */
const confirm = ref<'' | 'send' | 'cancel' | 'terminate'>('')
async function send() {
  confirm.value = ''
  await run(() => leasesApi.send(leaseId.value), "Le bail n'a pas pu être envoyé.")
}
async function cancelUnpaid() {
  confirm.value = ''
  await run(() => leasesApi.cancelUnpaid(leaseId.value), "Le bail n'a pas pu être annulé.")
}

/* ---- Résiliation ---- */
const reason = ref('')
const reasonError = ref('')
async function terminate() {
  reasonError.value = reason.value.trim().length < 5 ? 'Indiquez le motif (il est transmis au locataire).' : ''
  if (reasonError.value) return
  confirm.value = ''
  await run(() => leasesApi.terminate(leaseId.value, reason.value.trim()), "Le bail n'a pas pu être résilié.")
}

/* ---- États des lieux ---- */
const inventories = ref<InventoryDetail[]>([])
/** Tant que la liste n'est pas lue, ouvrir l'éditeur créerait un doublon côté API (#58). */
const inventoriesLoaded = ref(false)
async function loadInventories() {
  try {
    inventories.value = await inventoriesApi.fetchByLease(leaseId.value)
  } catch {
    inventories.value = []
  } finally {
    inventoriesLoaded.value = true
  }
}
const entryInv = computed(() => pickInventory(inventories.value, 'entry'))
const exitInv = computed(() => pickInventory(inventories.value, 'exit'))
const showExit = computed(() => phase.value === 'notice' || phase.value === 'terminated' || !!exitInv.value)
const edlOpen = ref<InventoryType | null>(null)
function edlLabel(inv: InventoryDetail | null) {
  if (!inv) return 'À faire'
  if (awaitingMySignature(inv, false)) return 'À signer'
  if (inv.status === 'pending_signature') return 'Chez le locataire'
  return INVENTORY_STATUS_LABEL[inv.status] ?? inv.status
}

/* ---- Contact et documents ---- */
const contacting = ref(false)
async function contactTenant() {
  const l = lease.value
  if (!l?.unit) return
  contacting.value = true
  actionError.value = ''
  try {
    const conv = await messagingApi.openConversation(l.unit.id, l.tenant.id)
    await navigateTo(`/pro/messages?conversation=${conv.id}`)
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Impossible d'ouvrir la conversation.") : "Impossible d'ouvrir la conversation."
  } finally {
    contacting.value = false
  }
}
const docError = ref('')
async function openContract() {
  const url = `/leases/${leaseId.value}/pdf`
  docError.value = (await doc.open('contract', url, url)) ?? ''
}
async function openQuittance(id: string) {
  docError.value = (await doc.open(id, `/leases/invoice/${id}/pdf`)) ?? ''
}
</script>

<template>
  <div class="max-w-[980px] animate-[im-fade_.3s_ease_both]">
    <NuxtLink to="/pro/baux" class="mb-3.5 inline-block text-[13px] font-bold text-[var(--text-muted)]">← Tous les baux</NuxtLink>

    <div v-if="state === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard :height="120" :lines="1" />
      <DataSkeletonCard :height="200" :lines="1" />
    </div>
    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger ce bail pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>
    <FeedbackEmptyState v-else-if="state === 'missing' || !lease || !phase" title="Bail introuvable" description="Il a peut-être été supprimé, ou il ne vous concerne pas." />

    <template v-else>
      <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="m-0 font-display text-[22px] font-bold tracking-[-.02em]">{{ tenantName }}</h2>
            <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">
              {{ [lease.unit?.name ?? 'Logement supprimé', lease.property?.name].filter(Boolean).join(' — ') }} · {{ formatDate(lease.start_date) }} → {{ lease.end_date ? formatDate(lease.end_date) : 'durée indéterminée' }}
            </p>
          </div>
          <CoreBadge :tone="LEASE_PHASE_TONE[phase]">{{ LEASE_PHASE_LABEL[phase] }}</CoreBadge>
        </div>
        <div v-if="phase !== 'cancelled_unpaid'" class="mt-5 overflow-x-auto pb-1">
          <FeedbackStepper :steps="LEASE_STEPS" :current="leaseStepIndex(phase)" class="min-w-[520px]" />
        </div>

        <p v-if="actionError" class="mb-0 mt-4 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>

        <!-- Brouillon -->
        <div v-if="phase === 'draft' && !editing" class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4.5">
          <p class="m-0 text-[14px] font-bold">Brouillon — pas encore envoyé à {{ tenantName }}</p>
          <p class="mb-0 mt-1.5 text-[13px] leading-[1.55] text-[var(--text-muted)]">
            Relisez les conditions et le contrat, puis envoyez-le. Attention : le logement est déjà bloqué dans votre calendrier sur cette période, et un brouillon ne peut pas encore être supprimé.
          </p>
          <div class="mt-3.5 flex flex-wrap gap-2.5">
            <CoreButton tone="secondary" @click="startEdit">Modifier</CoreButton>
            <CoreButton :disabled="busy" @click="confirm = 'send'">Signer et envoyer</CoreButton>
          </div>
        </div>
        <div v-else-if="phase === 'draft' && editing" class="mt-4 rounded-md border border-[var(--border-default)] bg-white p-4.5">
          <p class="m-0 text-[14px] font-bold">Modifier le brouillon</p>
          <div class="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="block"><span class="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">Loyer {{ rentSuffix }}</span><input v-model="form.rent" inputmode="numeric" class="h-10 w-full rounded-sm border border-[var(--border-default)] px-3 font-mono text-[13.5px] outline-none"></label>
            <label class="block"><span class="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">Caution</span><input v-model="form.deposit" inputmode="numeric" class="h-10 w-full rounded-sm border border-[var(--border-default)] px-3 font-mono text-[13.5px] outline-none"></label>
            <label class="block"><span class="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">Début</span><input v-model="form.startDate" type="date" class="h-10 w-full rounded-sm border border-[var(--border-default)] px-3 text-[13.5px] outline-none"></label>
            <label class="block"><span class="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">Fin (facultatif)</span><input v-model="form.endDate" type="date" :min="form.startDate" class="h-10 w-full rounded-sm border border-[var(--border-default)] px-3 text-[13.5px] outline-none"></label>
            <label class="block"><span class="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">Préavis du locataire (mois)</span><input v-model="form.noticePeriod" inputmode="numeric" class="h-10 w-full rounded-sm border border-[var(--border-default)] px-3 text-[13.5px] outline-none"></label>
            <label class="block"><span class="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">Type de contrat</span>
              <select v-model="form.contractType" class="h-10 w-full rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13.5px]">
                <option value="standard">Standard</option>
                <option value="compact">Compact</option>
                <option value="detailed">Détaillé</option>
              </select>
            </label>
          </div>
          <p class="mb-0 mt-2 text-[12px] text-[var(--text-faint)]">Changer les dates ne libère pas l'ancienne période du calendrier (limite actuelle de l'API).</p>
          <label v-if="formExceeds" class="mt-3 flex cursor-pointer items-start gap-2.5 rounded-md border border-warn-border bg-warn-bg p-3 text-[13px] text-warn-fg">
            <input v-model="form.depositAck" type="checkbox" class="mt-0.5 accent-green-600">
            <span>Caution au-delà de 3 mois de loyer (plafond de la Loi 2022-30) : je confirme l'accord des deux parties.</span>
          </label>
          <div class="mt-3.5 flex gap-2.5">
            <CoreButton tone="secondary" @click="editing = false">Annuler</CoreButton>
            <CoreButton :disabled="busy" @click="saveEdit">{{ busy ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
          </div>
        </div>

        <!-- Attente de signature -->
        <div v-else-if="phase === 'awaiting_tenant'" class="mt-4 rounded-md border border-warn-border bg-warn-bg p-4.5">
          <p class="m-0 text-[14px] font-bold text-warn-fg">Vous avez signé le {{ formatDate(lease.signed_at_landlord) }}. À {{ tenantName }} de signer.</p>
          <p class="mb-0 mt-1.5 text-[13px] text-warn-fg">Il a été prévenu par notification. Vous pouvez lui écrire pour l'accompagner.</p>
          <CoreButton tone="secondary" class="mt-3" :disabled="contacting || !lease.unit" @click="contactTenant">{{ contacting ? 'Ouverture…' : 'Écrire au locataire' }}</CoreButton>
        </div>

        <!-- Signé, entrée non payée -->
        <div v-else-if="phase === 'awaiting_entry' && entry" class="mt-4 rounded-md border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-4.5">
          <p class="m-0 text-[14px] font-bold text-clay-700">Signé par les deux parties. En attente du paiement d'entrée de {{ formatFcfa(entry.total) }}.</p>
          <p class="mb-0 mt-1.5 text-[13px] leading-[1.55] text-clay-900">
            Le bail devient actif dès que {{ tenantName }} paie. La caution est conservée par Immo, l'avance et le prépayé couvrent les loyers.
          </p>
          <p v-if="unpaid && !unpaid.allowed" class="mb-0 mt-2 text-[12.5px] text-clay-900">Si l'entrée n'est toujours pas payée, vous pourrez annuler le bail dans {{ unpaid.hoursLeft }} h.</p>
          <div class="mt-3 flex flex-wrap gap-2.5">
            <CoreButton tone="secondary" :disabled="contacting || !lease.unit" @click="contactTenant">{{ contacting ? 'Ouverture…' : 'Écrire au locataire' }}</CoreButton>
            <CoreButton v-if="unpaid?.allowed" tone="danger" :disabled="busy" @click="confirm = 'cancel'">Annuler le bail</CoreButton>
          </div>
        </div>

        <!-- Actif / préavis -->
        <div v-else-if="phase === 'active' || phase === 'notice'" class="mt-4 rounded-md border p-4.5" :class="phase === 'notice' ? 'border-warn-border bg-warn-bg' : 'border-ok-border bg-ok-bg'">
          <p v-if="phase === 'notice'" class="m-0 text-[14px] font-bold text-warn-fg">Préavis donné le {{ formatDate(lease.renewal_intent_date) }} — départ prévu le {{ formatDate(departure) }}.</p>
          <p v-else class="m-0 text-[14px] font-bold text-green-900">Bail actif{{ lease.entry_paid_at ? ` depuis le ${formatDate(lease.entry_paid_at)}` : '' }}.</p>
          <p class="mb-0 mt-1.5 text-[13px] leading-[1.55]" :class="phase === 'notice' ? 'text-warn-fg' : 'text-green-900'">
            <template v-if="phase === 'notice'">Le bail ne se clôt pas seul à cette date : les loyers continuent d'être émis. Faites l'état des lieux de sortie, puis résiliez le bail.</template>
            <template v-else>Prochaine échéance le {{ formatDate(lease.next_billing_date) }}. Prélèvement automatique {{ lease.auto_debit_enabled ? 'activé' : 'non activé' }} par le locataire.</template>
          </p>
          <div class="mt-3 flex flex-wrap gap-2.5">
            <CoreButton tone="secondary" :disabled="contacting || !lease.unit" @click="contactTenant">{{ contacting ? 'Ouverture…' : 'Écrire au locataire' }}</CoreButton>
            <CoreButton tone="secondary" @click="reason = ''; reasonError = ''; confirm = 'terminate'">Résilier le bail</CoreButton>
          </div>
        </div>

        <div v-else-if="phase === 'terminated'" class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4.5 text-[13.5px] text-[var(--text-secondary)]">
          Bail terminé le {{ formatDate(lease.end_date) }}. La caution ({{ formatFcfa(Number(lease.deposit_amount)) }}) reste en séquestre Immo : sa restitution n'est pas encore gérée dans l'application.
        </div>
        <div v-else-if="phase === 'cancelled_unpaid'" class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4.5 text-[13.5px] text-[var(--text-secondary)]">
          Bail annulé : l'entrée n'a pas été payée dans les 72 heures suivant la signature.
        </div>
        <div v-else-if="phase === 'inconsistent'" class="mt-4 rounded-md border border-danger-border bg-danger-bg p-4.5 text-[13.5px] text-danger-fg">
          Statut incohérent : l'entrée est payée mais le bail n'est plus actif (il a été re-signé). Plus aucune action n'est possible depuis l'application ; contactez le support.
        </div>
      </div>

      <div class="mt-4.5 grid grid-cols-1 gap-4.5 lg:grid-cols-[1.3fr_1fr]">
        <div class="flex flex-col gap-4.5">
          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="mb-3 mt-0 text-[15px] font-bold">Conditions</p>
            <DataMoneyLine :label="RENT_LABEL[lease.billing_frequency ?? 'monthly']" :value="`${formatFcfa(Number(lease.signed_rent))} ${rentSuffix}`" />
            <DataMoneyLine label="Caution (séquestre Immo)" :value="formatFcfa(entry?.deposit ?? 0)" />
            <DataMoneyLine v-if="entry?.advance" label="Avance sur loyer" :value="formatFcfa(entry.advance)" />
            <DataMoneyLine v-if="entry?.prepaid" label="Loyers prépayés" :value="formatFcfa(entry.prepaid)" />
            <DataMoneyLine label="Paiement d'entrée" :value="lease.entry_paid_at ? `payé le ${formatDate(lease.entry_paid_at)}` : formatFcfa(entry?.total ?? 0)" total />
            <p class="mb-0 mt-3 text-[12.5px] text-[var(--text-muted)]">Préavis du locataire : {{ lease.notice_period ?? 3 }} mois · contrat {{ lease.contract_type }}</p>
          </div>

          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <div class="flex items-baseline justify-between gap-3">
              <p class="m-0 text-[15px] font-bold">Échéancier</p>
              <p v-if="paidTotal" class="m-0 text-[12.5px] text-[var(--text-muted)]">{{ formatFcfa(paidTotal) }} encaissés</p>
            </div>
            <p v-if="!invoices.length" class="mb-0 mt-2 text-[13px] text-[var(--text-muted)]">Aucune échéance émise pour l'instant.</p>
            <div v-for="inv in invoices" :key="inv.id" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
              <div class="min-w-0 flex-1">
                <p class="m-0 text-[13.5px] font-semibold">Échéance du {{ formatDate(inv.due_date) }}</p>
                <p class="mb-0 mt-0.5 font-mono text-[12.5px] text-[var(--text-muted)]">{{ formatFcfa(Number(inv.amount)) }}</p>
              </div>
              <CoreBadge :tone="invoiceView(inv).tone">{{ invoiceView(inv).label }}</CoreBadge>
              <button v-if="inv.status === 'paid'" type="button" class="whitespace-nowrap rounded-pill border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-60" :disabled="doc.loadingKey.value === inv.id" @click="openQuittance(inv.id)">
                {{ doc.loadingKey.value === inv.id ? '…' : 'Quittance' }}
              </button>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-4.5">
          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="mb-3 mt-0 text-[15px] font-bold">États des lieux</p>
            <p v-if="phase === 'draft' || phase === 'awaiting_tenant' || phase === 'cancelled_unpaid'" class="m-0 text-[13px] text-[var(--text-muted)]">Disponibles une fois le bail signé par les deux parties.</p>
            <template v-else>
              <button type="button" class="flex w-full items-center gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5 text-left disabled:opacity-60" :disabled="!inventoriesLoaded" @click="edlOpen = 'entry'">
                <span class="min-w-0 flex-1">
                  <span class="block text-[13.5px] font-bold">Entrée</span>
                  <span class="mt-0.5 block text-[12px] text-[var(--text-muted)]">{{ entryInv ? `Mis à jour le ${formatDate(entryInv.updated_at)}` : 'À faire à la remise des clés' }}</span>
                </span>
                <CoreBadge :tone="entryInv?.status === 'signed' ? 'ok' : entryInv ? 'warn' : 'neutral'">{{ edlLabel(entryInv) }}</CoreBadge>
              </button>
              <button v-if="showExit" type="button" class="mt-2.5 flex w-full items-center gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5 text-left disabled:opacity-60" :disabled="!inventoriesLoaded" @click="edlOpen = 'exit'">
                <span class="min-w-0 flex-1">
                  <span class="block text-[13.5px] font-bold">Sortie</span>
                  <span class="mt-0.5 block text-[12px] text-[var(--text-muted)]">{{ exitInv ? `Mis à jour le ${formatDate(exitInv.updated_at)}` : departure ? `À faire au départ, le ${formatDate(departure)}` : 'À faire au départ du locataire' }}</span>
                </span>
                <CoreBadge :tone="exitInv?.status === 'signed' ? 'ok' : exitInv ? 'warn' : 'neutral'">{{ edlLabel(exitInv) }}</CoreBadge>
              </button>
            </template>
          </div>

          <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="mb-3 mt-0 text-[15px] font-bold">Documents</p>
            <button type="button" class="flex w-full items-center gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5 text-left disabled:opacity-60" :disabled="doc.loadingKey.value === 'contract'" @click="openContract">
              <span class="grid h-[40px] w-[34px] flex-none place-items-center rounded-xs border border-[var(--border-default)] bg-white text-[9.5px] font-black text-danger-fg">PDF</span>
              <span class="min-w-0 flex-1 text-[13.5px] font-bold">Contrat de bail</span>
              <span class="text-[12.5px] font-bold text-green-700">{{ doc.loadingKey.value === 'contract' ? 'Génération…' : 'Ouvrir' }}</span>
            </button>
            <p v-if="docError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ docError }}</p>
          </div>
        </div>
      </div>

      <ProEdlEditorModal
        v-if="edlOpen"
        :inventory="edlOpen === 'entry' ? entryInv : exitInv"
        :lease-id="lease.id"
        :type="edlOpen"
        :title="`${edlOpen === 'entry' ? 'Entrée' : 'Sortie'} — ${lease.unit?.name ?? 'logement'}`"
        :tenant-name="tenantName"
        @close="edlOpen = null"
        @saved="loadInventories"
      />

      <Teleport to="body">
        <div v-if="confirm" class="fixed inset-0 z-[90] grid animate-[im-veil_.22s_ease_both] place-items-center bg-black/50 p-6 backdrop-blur-[3px]" @click="confirm = ''">
          <div class="w-[460px] max-w-full animate-[im-rise_.28s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-6.5" @click.stop>
            <template v-if="confirm === 'send'">
              <h3 class="m-0 font-display text-xl font-bold tracking-[-.02em]">Signer et envoyer ce bail ?</h3>
              <p class="mb-0 mt-2.5 text-sm leading-[1.6] text-[var(--text-muted)]">
                L'envoi vaut <strong>votre signature</strong>. {{ tenantName }} est prévenu et pourra signer à son tour. Le bail ne sera plus modifiable.
              </p>
              <button type="button" class="mt-3 text-[13px] font-bold text-green-700 underline" @click="openContract">Relire le contrat ↗</button>
              <div class="mt-5 flex gap-2.5">
                <CoreButton tone="secondary" size="lg" full-width @click="confirm = ''">Pas encore</CoreButton>
                <CoreButton size="lg" full-width :disabled="busy" @click="send">Signer et envoyer</CoreButton>
              </div>
            </template>
            <template v-else-if="confirm === 'cancel'">
              <h3 class="m-0 font-display text-xl font-bold tracking-[-.02em]">Annuler ce bail ?</h3>
              <p class="mb-0 mt-2.5 text-sm leading-[1.6] text-[var(--text-muted)]">L'entrée n'a pas été payée dans les 72 heures. Le bail sera clos et le logement redeviendra disponible. {{ tenantName }} sera prévenu.</p>
              <div class="mt-5 flex gap-2.5">
                <CoreButton tone="secondary" size="lg" full-width @click="confirm = ''">Garder le bail</CoreButton>
                <CoreButton tone="danger" size="lg" full-width :disabled="busy" @click="cancelUnpaid">Annuler le bail</CoreButton>
              </div>
            </template>
            <template v-else>
              <h3 class="m-0 font-display text-xl font-bold tracking-[-.02em]">Résilier ce bail ?</h3>
              <p class="mb-0 mt-2.5 text-sm leading-[1.6] text-[var(--text-muted)]">Le bail prend fin aujourd'hui et le logement redevient disponible. C'est irréversible.</p>
              <p v-if="exitInv?.status !== 'signed'" class="mb-0 mt-2.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-fg">
                L'état des lieux de sortie n'est pas signé. Sans lui, rien ne documente l'état du logement au départ.
              </p>
              <p class="mb-0 mt-2.5 text-[12.5px] text-[var(--text-muted)]">La caution reste en séquestre Immo : sa restitution n'est pas encore gérée dans l'application.</p>
              <label class="mt-3.5 block">
                <span class="mb-1.5 block text-[12.5px] font-bold">Motif, transmis à {{ tenantName }}</span>
                <textarea v-model="reason" rows="2" maxlength="300" placeholder="ex. Départ du locataire, fin du contrat…" class="w-full resize-none rounded-md border border-[var(--border-default)] bg-white p-3 text-sm outline-none" />
              </label>
              <p v-if="reasonError" class="mb-0 mt-1.5 text-[12.5px] font-semibold text-danger-fg">{{ reasonError }}</p>
              <div class="mt-5 flex gap-2.5">
                <CoreButton tone="secondary" size="lg" full-width @click="confirm = ''">Annuler</CoreButton>
                <CoreButton tone="danger" size="lg" full-width :disabled="busy" @click="terminate">Résilier</CoreButton>
              </div>
            </template>
          </div>
        </div>
      </Teleport>
    </template>
  </div>
</template>
