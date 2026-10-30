<script setup lang="ts">
import { ArrowLeft, ClipboardCheck, DoorOpen, ExternalLink, FileText, LifeBuoy, MessageSquare, Pencil, Receipt, Send, Trash } from '@lucide/vue'
import type { InventoryDetail, InventoryType, LeaseContractType, LeaseSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import {
  cancelUnpaidState, depositExceedsCap, entryBreakdown, invoiceView, leasePhase, leaseStepIndex, LEASE_PHASE_LABEL,
  LEASE_PHASE_TONE, LEASE_STEPS, noticeDepartureDate, RENT_LABEL, RENT_SUFFIX, sortInvoices, validateLeaseForm
} from '~/utils/leases'
import { CONTRACT_TYPE_HELP, CONTRACT_TYPE_HINT, CONTRACT_TYPE_LABEL, CONTRACT_TYPES, contractTypeLabel } from '~/utils/leaseDraft'
import { awaitingMySignature, INVENTORY_STATUS_LABEL, pickInventory } from '~/utils/inventories'

definePageMeta({ layout: 'pro' })

const route = useRoute()
const leaseId = computed(() => String(route.params.id))
const leasesApi = useLeasesApi()
const inventoriesApi = useInventoriesApi()
const messagingApi = useMessagingApi()
const doc = useOpenDocument()

/** Restitution de la caution : pas encore gérée dans l'application, le support s'en charge. */
const SUPPORT_LINK = { path: '/contact', query: { sujet: 'Caution ou état des lieux' } }

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
    if (!lease.value) state.value = 'error'
  }
}
onMounted(load)
watch(leaseId, () => { lease.value = null; flash.value = ''; load() })

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
const flash = ref('')
const busy = ref(false)
async function run(action: () => Promise<unknown>, fallback: string, success: string) {
  busy.value = true
  actionError.value = ''
  flash.value = ''
  try {
    await action()
    await load()
    flash.value = success
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
const form = reactive({ rent: '', deposit: '', startDate: '', endDate: '', noticePeriod: '3', contractType: 'standard' as string, depositAck: false })
const CONTRACT_OPTIONS = CONTRACT_TYPES.map(c => ({ value: c, label: CONTRACT_TYPE_LABEL[c]! }))
function startEdit() {
  const l = lease.value
  if (!l) return
  Object.assign(form, {
    rent: String(Math.round(Number(l.signed_rent))),
    deposit: String(Math.round(Number(l.deposit_amount))),
    startDate: l.start_date.slice(0, 10),
    endDate: l.end_date?.slice(0, 10) ?? '',
    noticePeriod: String(l.notice_period ?? 3),
    contractType: l.contract_type,
    depositAck: false
  })
  actionError.value = ''
  confirm.value = ''
  editing.value = true
}
const formExceeds = computed(() => depositExceedsCap(lease.value?.billing_frequency ?? 'monthly', Number(form.rent), Number(form.deposit)))
async function saveEdit() {
  const l = lease.value
  if (!l) return
  const error = validateLeaseForm({ tenantId: l.tenant.id, unitId: l.unit?.id ?? 'x', rent: form.rent, deposit: form.deposit, startDate: form.startDate, endDate: form.endDate, noticePeriod: form.noticePeriod })
  if (error) { actionError.value = error; return }
  if (formExceeds.value && !form.depositAck) { actionError.value = "Confirmez l'accord des deux parties pour une caution au-delà de 3 mois de loyer."; return }
  const ok = await run(() => leasesApi.updateDraft(l.id, {
    monthlyRent: Number(form.rent),
    depositAmount: Number(form.deposit),
    startDate: form.startDate,
    endDate: form.endDate || null,
    noticePeriod: Number(form.noticePeriod),
    contractType: form.contractType as LeaseContractType,
    depositAcknowledged: formExceeds.value ? true : undefined
  }), "Le bail n'a pas pu être modifié.", 'Brouillon mis à jour. Relisez le contrat, puis envoyez-le.')
  if (ok) editing.value = false
}

/* ---- Actions confirmées sur place (une seule ouverte à la fois) ---- */
const confirm = ref<'' | 'send' | 'cancel' | 'terminate' | 'delete'>('')
function ask(kind: typeof confirm.value) {
  actionError.value = ''
  reason.value = ''
  confirm.value = kind
}
async function send() {
  const ok = await run(() => leasesApi.send(leaseId.value), "Le bail n'a pas pu être envoyé.", `Bail signé et envoyé : ${tenantName.value} peut maintenant le signer à son tour.`)
  if (ok) confirm.value = ''
}
async function cancelUnpaid() {
  const ok = await run(() => leasesApi.cancelUnpaid(leaseId.value), "Le bail n'a pas pu être annulé.", 'Bail annulé : le logement redevient disponible à cette période.')
  if (ok) confirm.value = ''
}

/** Supprime un brouillon jamais envoyé et libère le blocage de calendrier (#58) — retour à la liste, le bail n'existe plus. */
async function deleteDraft() {
  busy.value = true
  actionError.value = ''
  try {
    await leasesApi.remove(leaseId.value)
    await navigateTo('/pro/baux')
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le brouillon n'a pas pu être supprimé.") : "Le brouillon n'a pas pu être supprimé."
  } finally {
    busy.value = false
  }
}

/* ---- Résiliation : motif obligatoire, transmis au locataire ---- */
const reason = ref('')
async function terminate() {
  if (reason.value.trim().length < 5) return
  const ok = await run(() => leasesApi.terminate(leaseId.value, reason.value.trim()), "Le bail n'a pas pu être résilié.", `Bail résilié : le logement redevient disponible et le motif a été transmis à ${tenantName.value}.`)
  if (ok) confirm.value = ''
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
  return INVENTORY_STATUS_LABEL[inv.status] ?? 'Statut inconnu'
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

const PANEL_TONE: Record<string, string> = {
  draft: 'border-[var(--border-subtle)] bg-[var(--surface-page)]',
  awaiting_tenant: 'border-warn-border bg-warn-bg',
  awaiting_entry: 'border-[var(--border-escrow)] bg-[var(--surface-escrow)]',
  active: 'border-ok-border bg-ok-bg',
  notice: 'border-warn-border bg-warn-bg',
  terminated: 'border-[var(--border-subtle)] bg-[var(--surface-page)]',
  cancelled_unpaid: 'border-[var(--border-subtle)] bg-[var(--surface-page)]',
  inconsistent: 'border-danger-border bg-danger-bg'
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <NuxtLink to="/pro/baux" class="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700">
      <ArrowLeft class="h-4 w-4" :stroke-width="1.9" /> Tous les baux
    </NuxtLink>

    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="flex flex-col gap-4.5">
        <DataSkeletonCard :height="120" :lines="1" />
        <DataSkeletonCard :height="200" :lines="1" />
      </div>
      <DataSkeletonCard :height="220" :lines="0" />
    </div>
    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger ce bail pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>
    <ProEmptyPanel v-else-if="state === 'missing' || !lease || !phase" :icon="FileText" title="Bail introuvable" text="Il a peut-être été supprimé (un brouillon jamais envoyé), ou il ne vous concerne pas.">
      <NuxtLink to="/pro/baux" class="inline-flex items-center rounded-md border border-[var(--border-default)] bg-white px-5 py-3 text-[14px] font-bold text-sand-900">Tous les baux</NuxtLink>
    </ProEmptyPanel>

    <template v-else>
      <p v-if="flash" class="mb-4.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>

      <!-- En-tête -->
      <section class="mb-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="flex flex-wrap items-start gap-3">
          <CoreAvatar :name="tenantName" :size="46" />
          <div class="min-w-0 flex-1">
            <h2 class="m-0 font-display text-[22px] font-bold tracking-[-.02em]">{{ tenantName }}</h2>
            <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-muted)]">
              <template v-if="lease.unit && lease.property">
                <NuxtLink :to="`/pro/biens/fiche?id=${lease.property.id}`" class="font-semibold text-[var(--text-secondary)] underline decoration-[var(--border-default)] underline-offset-2 hover:text-green-700">{{ lease.unit.name }} — {{ lease.property.name }}</NuxtLink>
              </template>
              <template v-else>{{ [lease.unit?.name ?? 'Logement supprimé', lease.property?.name].filter(Boolean).join(' — ') }}</template>
            </p>
            <p class="mb-0 mt-1 text-xs text-[var(--text-faint)]">
              <span class="font-mono">{{ formatDate(lease.start_date) }}</span> au <span class="font-mono">{{ lease.end_date ? formatDate(lease.end_date) : 'durée indéterminée' }}</span>
            </p>
          </div>
          <CoreBadge :tone="LEASE_PHASE_TONE[phase]" bordered>{{ LEASE_PHASE_LABEL[phase] }}</CoreBadge>
        </div>
        <div v-if="phase !== 'cancelled_unpaid'" class="mt-5 overflow-x-auto pb-1">
          <FeedbackStepper :steps="LEASE_STEPS" :current="leaseStepIndex(phase)" class="min-w-[520px]" />
        </div>
      </section>

      <div class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <!-- Contenu -->
        <div class="flex min-w-0 flex-col gap-4.5">
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 mb-3 text-[15px] font-bold">Conditions</h2>
            <template v-if="phase === 'draft' && editing">
              <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <FormsInput v-model="form.rent" :label="`Loyer ${rentSuffix} (FCFA)`" type="number" mono />
                <FormsInput v-model="form.deposit" label="Caution (FCFA)" type="number" mono />
                <FormsInput v-model="form.startDate" label="Début" type="date" />
                <FormsInput v-model="form.endDate" label="Fin (facultatif)" type="date" hint="Vide : durée indéterminée." />
                <FormsInput v-model="form.noticePeriod" label="Préavis du locataire (mois)" type="number" mono hint="Entre 1 et 12 mois." />
                <div>
                  <FormsSelect v-model="form.contractType" label="Modèle de contrat" :options="CONTRACT_OPTIONS" class="[&_select]:w-full" />
                  <p class="mb-0 mt-[7px] text-[12.5px] text-[var(--text-faint)]">{{ CONTRACT_TYPE_HINT[form.contractType] ?? '' }}</p>
                </div>
              </div>
              <p class="mb-0 mt-3 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">{{ CONTRACT_TYPE_HELP }}</p>
              <div v-if="formExceeds" class="mt-3.5 rounded-md border border-warn-border bg-warn-bg p-3.5">
                <FormsToggle v-model="form.depositAck" label="Caution au-delà de 3 mois de loyer" hint="Plafond de la Loi 2022-30 : je confirme l'accord des deux parties." />
              </div>
              <p v-if="actionError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>
              <div class="mt-4 flex flex-wrap gap-2.5">
                <CoreButton :disabled="busy" @click="saveEdit">{{ busy ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
                <CoreButton tone="secondary" @click="editing = false; actionError = ''">Annuler</CoreButton>
              </div>
            </template>
            <template v-else>
              <DataMoneyLine :label="RENT_LABEL[lease.billing_frequency ?? 'monthly']" :value="`${formatFcfa(Number(lease.signed_rent))} ${rentSuffix}`" />
              <DataMoneyLine label="Caution (séquestre Immo)" :value="formatFcfa(entry?.deposit ?? 0)" />
              <DataMoneyLine v-if="entry?.advance" label="Avance sur loyer" :value="formatFcfa(entry.advance)" />
              <DataMoneyLine v-if="entry?.prepaid" label="Loyers prépayés" :value="formatFcfa(entry.prepaid)" />
              <DataMoneyLine label="Paiement d'entrée" :value="lease.entry_paid_at ? `payé le ${formatDate(lease.entry_paid_at)}` : formatFcfa(entry?.total ?? 0)" total />
              <dl class="m-0 mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Préavis du locataire</dt>
                  <dd class="m-0 mt-1 text-sm font-bold"><span class="font-mono">{{ lease.notice_period ?? 3 }}</span> mois</dd>
                </div>
                <div>
                  <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Modèle de contrat</dt>
                  <dd class="m-0 mt-1 text-sm font-bold">{{ contractTypeLabel(lease.contract_type) }}</dd>
                  <dd v-if="CONTRACT_TYPE_HINT[lease.contract_type]" class="m-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ CONTRACT_TYPE_HINT[lease.contract_type] }}</dd>
                </div>
              </dl>
            </template>
          </section>

          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <div class="mb-1 flex flex-wrap items-baseline justify-between gap-3">
              <h2 class="m-0 text-[15px] font-bold">Échéancier</h2>
              <p v-if="paidTotal" class="m-0 text-xs text-[var(--text-faint)]"><span class="font-mono font-bold text-[var(--text-secondary)]">{{ formatFcfa(paidTotal) }}</span> encaissés</p>
            </div>
            <p v-if="!invoices.length" class="mb-0 mt-2 text-[13.5px] text-[var(--text-muted)]">Aucune échéance émise pour l'instant : la première apparaît à l'activation du bail.</p>
            <div v-for="inv in invoices" :key="inv.id" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
              <div class="grid h-9 w-9 flex-none place-items-center rounded-md bg-sand-200 text-[var(--text-secondary)]"><Receipt class="h-4 w-4" :stroke-width="1.9" /></div>
              <div class="min-w-0 flex-1">
                <p class="m-0 text-sm font-bold">Échéance du {{ formatDate(inv.due_date) }}</p>
                <p class="mb-0 mt-0.5 font-mono text-xs text-[var(--text-faint)]">{{ formatFcfa(Number(inv.amount)) }}</p>
              </div>
              <CoreBadge :tone="invoiceView(inv).tone">{{ invoiceView(inv).label }}</CoreBadge>
              <button v-if="inv.status === 'paid'" type="button" class="whitespace-nowrap rounded-pill border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-bold text-sand-900 disabled:opacity-60" :disabled="doc.loadingKey.value === inv.id" @click="openQuittance(inv.id)">
                {{ doc.loadingKey.value === inv.id ? 'Génération…' : 'Quittance' }}
              </button>
            </div>
          </section>

          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 mb-3 text-[15px] font-bold">États des lieux</h2>
            <p v-if="phase === 'draft' || phase === 'awaiting_tenant' || phase === 'cancelled_unpaid'" class="m-0 text-[13.5px] text-[var(--text-muted)]">Disponibles une fois le bail signé par les deux parties.</p>
            <template v-else>
              <button type="button" class="flex w-full items-center gap-3 border-b border-sand-200 py-3 text-left disabled:opacity-60" :disabled="!inventoriesLoaded" @click="edlOpen = 'entry'">
                <span class="grid h-9 w-9 flex-none place-items-center rounded-md bg-sand-200 text-[var(--text-secondary)]"><ClipboardCheck class="h-4 w-4" :stroke-width="1.9" /></span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-bold">Entrée</span>
                  <span class="mt-0.5 block text-xs text-[var(--text-faint)]">{{ entryInv ? `Mis à jour le ${formatDate(entryInv.updated_at)}` : 'À faire à la remise des clés' }}</span>
                </span>
                <CoreBadge :tone="entryInv?.status === 'signed' ? 'ok' : entryInv ? 'warn' : 'neutral'">{{ edlLabel(entryInv) }}</CoreBadge>
              </button>
              <button v-if="showExit" type="button" class="flex w-full items-center gap-3 py-3 text-left disabled:opacity-60" :disabled="!inventoriesLoaded" @click="edlOpen = 'exit'">
                <span class="grid h-9 w-9 flex-none place-items-center rounded-md bg-sand-200 text-[var(--text-secondary)]"><DoorOpen class="h-4 w-4" :stroke-width="1.9" /></span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-bold">Sortie</span>
                  <span class="mt-0.5 block text-xs text-[var(--text-faint)]">{{ exitInv ? `Mis à jour le ${formatDate(exitInv.updated_at)}` : departure ? `À faire au départ, le ${formatDate(departure)}` : 'À faire au départ du locataire' }}</span>
                </span>
                <CoreBadge :tone="exitInv?.status === 'signed' ? 'ok' : exitInv ? 'warn' : 'neutral'">{{ edlLabel(exitInv) }}</CoreBadge>
              </button>
            </template>
          </section>
        </div>

        <!-- Panneau d'actions -->
        <aside class="flex flex-col gap-4.5 lg:sticky lg:top-[94px]">
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 mb-3 text-[15px] font-bold">Où en est le bail</h2>
            <div class="rounded-md border p-4" :class="PANEL_TONE[phase]">
              <!-- Brouillon -->
              <template v-if="phase === 'draft'">
                <p class="m-0 text-sm font-bold">Brouillon, pas encore envoyé à {{ tenantName }}</p>
                <p class="mb-0 mt-1.5 text-[13px] leading-[1.55] text-[var(--text-muted)]">Relisez les conditions et le contrat, puis envoyez-le. Le logement reste bloqué dans votre calendrier tant que le brouillon existe.</p>
              </template>
              <template v-else-if="phase === 'awaiting_tenant'">
                <p class="m-0 text-sm font-bold text-warn-fg">Vous avez signé le {{ formatDate(lease.signed_at_landlord) }}. À {{ tenantName }} de signer.</p>
                <p class="mb-0 mt-1.5 text-[13px] text-warn-fg">Il a été prévenu par notification. Vous pouvez lui écrire pour l'accompagner.</p>
              </template>
              <template v-else-if="phase === 'awaiting_entry' && entry">
                <p class="m-0 text-sm font-bold text-clay-700">Signé par les deux parties. En attente du paiement d'entrée de <span class="font-mono">{{ formatFcfa(entry.total) }}</span>.</p>
                <p class="mb-0 mt-1.5 text-[13px] leading-[1.55] text-clay-900">Le bail devient actif dès que {{ tenantName }} paie. La caution est conservée par Immo, l'avance et le prépayé couvrent les loyers.</p>
                <p v-if="unpaid && !unpaid.allowed" class="mb-0 mt-2 text-[12.5px] text-clay-900">Si l'entrée n'est toujours pas payée, vous pourrez annuler le bail dans <span class="font-mono">{{ unpaid.hoursLeft }}</span> h.</p>
              </template>
              <template v-else-if="phase === 'active'">
                <p class="m-0 text-sm font-bold text-green-900">Bail actif{{ lease.entry_paid_at ? ` depuis le ${formatDate(lease.entry_paid_at)}` : '' }}.</p>
                <p class="mb-0 mt-1.5 text-[13px] leading-[1.55] text-green-900">Prochaine échéance le {{ formatDate(lease.next_billing_date) }}. Prélèvement automatique {{ lease.auto_debit_enabled ? 'activé' : 'non activé' }} par le locataire.</p>
              </template>
              <template v-else-if="phase === 'notice'">
                <p class="m-0 text-sm font-bold text-warn-fg">Préavis donné le {{ formatDate(lease.renewal_intent_date) }} : départ prévu le {{ formatDate(departure) }}.</p>
                <p class="mb-0 mt-1.5 text-[13px] leading-[1.55] text-warn-fg">Le bail ne se clôt pas seul à cette date : les loyers continuent d'être émis. Faites l'état des lieux de sortie, puis résiliez le bail.</p>
              </template>
              <template v-else-if="phase === 'terminated'">
                <p class="m-0 text-sm font-bold">Bail terminé le {{ formatDate(lease.end_date) }}.</p>
                <p class="mb-0 mt-1.5 text-[13px] leading-[1.55] text-[var(--text-muted)]">La caution (<span class="font-mono">{{ formatFcfa(Number(lease.deposit_amount)) }}</span>) est en séquestre chez Immo. Sa restitution ne se fait pas encore depuis l'application : le support s'en charge avec vous, d'après l'état des lieux de sortie.</p>
              </template>
              <template v-else-if="phase === 'cancelled_unpaid'">
                <p class="m-0 text-sm font-bold">Bail annulé</p>
                <p class="mb-0 mt-1.5 text-[13px] text-[var(--text-muted)]">L'entrée n'a pas été payée dans les 72 heures suivant la signature.</p>
              </template>
              <template v-else>
                <p class="m-0 text-sm font-bold text-danger-fg">Statut incohérent</p>
                <p class="mb-0 mt-1.5 text-[13px] text-danger-fg">L'entrée est payée mais le bail n'est plus actif (il a été re-signé). Plus aucune action n'est possible depuis l'application.</p>
              </template>
            </div>

            <p v-if="actionError && !editing" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>

            <!-- Confirmations sur place -->
            <CoreInlineConfirm
              v-if="confirm === 'send'"
              class="mt-3.5"
              tone="neutral"
              :message="`Signer et envoyer ce bail ? L'envoi vaut votre signature ; ${tenantName} pourra signer à son tour. Le bail ne sera plus modifiable.`"
              confirm-label="Signer et envoyer"
              :loading="busy"
              @confirm="send"
              @cancel="confirm = ''"
            >
              <button type="button" class="inline-flex items-center gap-1 text-[12.5px] font-bold text-green-700 underline" @click="openContract">Relire le contrat <ExternalLink class="h-3.5 w-3.5" :stroke-width="1.9" /></button>
            </CoreInlineConfirm>
            <CoreInlineConfirm
              v-else-if="confirm === 'delete'"
              class="mt-3.5"
              tone="danger"
              :message="`Supprimer ce brouillon ? Le logement redevient disponible à cette période. ${tenantName} n'a rien reçu : le bail n'a jamais été envoyé.`"
              confirm-label="Supprimer"
              :loading="busy"
              @confirm="deleteDraft"
              @cancel="confirm = ''"
            />
            <CoreInlineConfirm
              v-else-if="confirm === 'cancel'"
              class="mt-3.5"
              tone="danger"
              :message="`Annuler ce bail ? L'entrée n'a pas été payée dans les 72 heures : le bail est clos et le logement redevient disponible.`"
              confirm-label="Annuler le bail"
              cancel-label="Garder"
              :loading="busy"
              @confirm="cancelUnpaid"
              @cancel="confirm = ''"
            />
            <CoreInlineConfirm
              v-else-if="confirm === 'terminate'"
              class="mt-3.5"
              tone="danger"
              message="Résilier ce bail ? Il prend fin aujourd'hui et le logement redevient disponible. C'est irréversible."
              confirm-label="Résilier"
              :loading="busy"
              :disabled="reason.trim().length < 5"
              @confirm="terminate"
              @cancel="confirm = ''"
            >
              <p v-if="exitInv?.status !== 'signed'" class="mb-2.5 mt-0 text-[12.5px] font-semibold text-danger-fg-deep">L'état des lieux de sortie n'est pas signé : sans lui, rien ne documente l'état du logement au départ.</p>
              <p class="mb-2.5 mt-0 text-[12.5px] text-danger-fg-deep">
                La caution reste en séquestre Immo ; sa restitution passe par le support.
                <NuxtLink :to="SUPPORT_LINK" class="font-bold underline">Contacter le support</NuxtLink>
              </p>
              <textarea v-model="reason" rows="2" maxlength="300" :placeholder="`Motif, transmis à ${tenantName} (5 caractères minimum)`" class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none" />
            </CoreInlineConfirm>

            <!-- Actions de la phase -->
            <div v-if="!confirm" class="mt-4 flex flex-col gap-2.5">
              <template v-if="phase === 'draft' && !editing">
                <CoreButton full-width class="inline-flex items-center justify-center gap-1.5" :disabled="busy" @click="ask('send')"><Send class="h-4 w-4" :stroke-width="1.9" />Signer et envoyer</CoreButton>
                <CoreButton tone="secondary" full-width class="inline-flex items-center justify-center gap-1.5" @click="startEdit"><Pencil class="h-4 w-4" :stroke-width="1.9" />Modifier le brouillon</CoreButton>
              </template>
              <CoreButton v-if="unpaid?.allowed && phase === 'awaiting_entry'" tone="secondary" full-width :disabled="busy" @click="ask('cancel')">Annuler le bail</CoreButton>
              <CoreButton v-if="phase === 'active' || phase === 'notice'" tone="secondary" full-width @click="ask('terminate')">Résilier le bail</CoreButton>
              <NuxtLink v-if="phase === 'terminated' || phase === 'inconsistent'" :to="SUPPORT_LINK" class="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-[14px] font-bold text-white shadow-action">
                <LifeBuoy class="h-4 w-4" :stroke-width="1.9" />Contacter le support
              </NuxtLink>
              <CoreButton v-if="lease.unit" tone="secondary" full-width class="inline-flex items-center justify-center gap-1.5" :disabled="contacting" @click="contactTenant">
                <MessageSquare class="h-4 w-4" :stroke-width="1.9" />{{ contacting ? 'Ouverture…' : `Écrire à ${tenantName}` }}
              </CoreButton>
              <button v-if="phase === 'draft' && !editing" type="button" class="inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-[13.5px] font-bold text-danger-fg hover:bg-danger-bg" :disabled="busy" @click="ask('delete')">
                <Trash class="h-4 w-4" :stroke-width="1.9" />Supprimer le brouillon
              </button>
            </div>
          </section>

          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 mb-3 text-[15px] font-bold">Documents</h2>
            <button type="button" class="flex w-full items-center gap-3 py-1 text-left disabled:opacity-60" :disabled="doc.loadingKey.value === 'contract'" @click="openContract">
              <span class="grid h-9 w-9 flex-none place-items-center rounded-md bg-sand-200 text-[var(--text-secondary)]"><FileText class="h-4 w-4" :stroke-width="1.9" /></span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold">Contrat de bail</span>
                <span class="mt-0.5 block text-xs text-[var(--text-faint)]">Modèle {{ contractTypeLabel(lease.contract_type).toLowerCase() }} · PDF</span>
              </span>
              <span class="text-[12.5px] font-bold text-green-700">{{ doc.loadingKey.value === 'contract' ? 'Génération…' : 'Ouvrir' }}</span>
            </button>
            <p v-if="docError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ docError }}</p>
          </section>
        </aside>
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
    </template>
  </div>
</template>
