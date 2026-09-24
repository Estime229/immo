<script setup lang="ts">
import type { ArtisanOffer, ArtisanProfile, ArtisanRequestSummary } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'artisan' })

const artisanApi = useArtisanRequestsApi()
const profileApi = useArtisanProfileApi()
const refData = useReferenceData()
const currentUser = useAuthUser()
const modal = useArtisanModal()
const modalTarget = useArtisanModalTarget()
const refresh = useArtisanRequestsRefresh()

const profile = ref<ArtisanProfile | null>(null)
onMounted(async () => {
  try {
    profile.value = await profileApi.fetchMine()
  } catch {
    profile.value = null
  }
})

const trades = ref<RefEntry[]>([])
onMounted(async () => {
  try {
    trades.value = await refData.fetchRef('ARTISAN_TRADE')
  } catch {
    trades.value = []
  }
})
function tradeLabel(id?: string) {
  return trades.value.find(t => t.id === id)?.labels.fr ?? 'Intervention'
}

const mineBlock = useFetchBlock(() => artisanApi.listMine())
const openBlock = useFetchBlock(() => artisanApi.listOpen(profile.value?.trade_reference_id).then(r => r.data))
onMounted(mineBlock.load)
watch(refresh, mineBlock.load)
watch(profile, p => { if (p?.trade_reference_id) openBlock.load() })

const tab = ref<'ouvertes' | 'encours' | 'terminees'>('encours')
const TABS = [
  { key: 'ouvertes' as const, label: 'Postes ouverts' },
  { key: 'encours' as const, label: 'En cours' },
  { key: 'terminees' as const, label: 'Terminées' }
]

/** Un poste déjà candidaté (ou une demande directe déjà ciblée) apparaît dans « En cours », pas dans « Postes ouverts ». */
const myPostingIds = computed(() => new Set(mineBlock.items.value.map(r => r.public_posting_id).filter(Boolean)))
const openItems = computed(() => openBlock.items.value.filter(o => !myPostingIds.value.has(o.id)))
const encoursItems = computed(() => mineBlock.items.value.filter(r => r.status === 'open' || r.status === 'agreed' || r.status === 'in_progress'))
const termineesItems = computed(() => mineBlock.items.value.filter(r => r.status === 'completed' || r.status === 'cancelled'))

const listForTab = computed<ArtisanRequestSummary[]>(() => {
  if (tab.value === 'ouvertes') return openItems.value
  if (tab.value === 'encours') return encoursItems.value
  return termineesItems.value
})

const selectedId = ref<string | null>(null)
watch([tab, listForTab], () => {
  if (!listForTab.value.some(i => i.id === selectedId.value)) selectedId.value = listForTab.value[0]?.id ?? null
}, { immediate: true })
const selected = computed(() => listForTab.value.find(i => i.id === selectedId.value) ?? null)

function pickTab(key: typeof tab.value) {
  tab.value = key
}

/* ---- Mes offres sur la demande sélectionnée (pour savoir si j'ai déjà proposé un prix) ---- */
const offers = ref<ArtisanOffer[]>([])
const offersLoading = ref(false)
watch(selected, async s => {
  offers.value = []
  if (!s || tab.value === 'ouvertes') return
  offersLoading.value = true
  try {
    offers.value = await artisanApi.listOffers(s.id)
  } catch {
    offers.value = []
  } finally {
    offersLoading.value = false
  }
}, { immediate: true })
const myOffer = computed(() => offers.value.find(o => o.proposed_by === currentUser.value?.id))

/* ---- Candidature sur un poste ouvert ---- */
const applying = ref(false)
const applyMessage = ref('')
const applyError = ref('')
async function submitApply(posting: ArtisanRequestSummary) {
  applying.value = true
  applyError.value = ''
  try {
    const candidacy = await artisanApi.applyToOpen(posting.id, applyMessage.value.trim() || undefined)
    applyMessage.value = ''
    await Promise.all([mineBlock.load(), openBlock.load()])
    tab.value = 'encours'
    selectedId.value = candidacy.id
    openOfferModal(candidacy.id)
  } catch (e) {
    applyError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La candidature a échoué.') : 'La candidature a échoué.'
  } finally {
    applying.value = false
  }
}

function openOfferModal(requestId: string) {
  modalTarget.value = requestId
  modal.value = 'offre'
}
function openTerminerModal(requestId: string) {
  modalTarget.value = requestId
  modal.value = 'terminer'
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex w-fit gap-1 rounded-pill bg-sand-200 p-1">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="rounded-pill px-4.5 py-2.5 text-[13px] font-bold transition-all"
        :class="tab === t.key ? 'bg-white text-green-900 shadow-[0_1px_4px_rgba(26,23,20,.14)]' : 'bg-transparent text-[var(--text-secondary)]'"
        @click="pickTab(t.key)"
      >{{ t.label }}</button>
    </div>

    <div v-if="!profile?.trade_reference_id" class="rounded-md border border-warn-border bg-warn-bg px-4 py-3.5 text-[13.5px] text-warn-fg">
      Renseignez votre métier dans <NuxtLink to="/artisan/profil" class="font-bold underline">votre profil</NuxtLink> pour voir les postes ouverts et recevoir des demandes.
    </div>

    <div v-else-if="(tab === 'ouvertes' ? openBlock : mineBlock).state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard :height="90" :lines="1" />
      <DataSkeletonCard :height="90" :lines="1" />
    </div>

    <p v-else-if="!listForTab.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      {{ tab === 'ouvertes' ? 'Aucun poste ouvert pour votre métier pour l\'instant.' : tab === 'encours' ? 'Aucune mission en cours.' : 'Aucune mission terminée.' }}
    </p>

    <div v-else class="grid grid-cols-1 items-start gap-4.5 lg:grid-cols-[1fr_1.15fr]">
      <div class="flex flex-col gap-3">
        <div
          v-for="m in listForTab"
          :key="m.id"
          class="cursor-pointer rounded-xl border-[1.5px] bg-white p-4"
          :class="selectedId === m.id ? 'border-green-600' : 'border-[var(--border-subtle)]'"
          @click="selectedId = m.id"
        >
          <div class="flex items-center gap-2.5">
            <div class="grid h-[38px] w-[38px] flex-none place-items-center rounded-md bg-info-bg text-[15px]">⚑</div>
            <div class="flex-1">
              <p class="m-0 text-[14.5px] font-bold">{{ tradeLabel(m.trade_reference_id) }}</p>
              <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ m.unit?.name ?? 'Logement' }}</p>
            </div>
          </div>
          <div class="mt-3 flex items-center justify-between">
            <span class="text-xs text-[var(--text-faint)]">{{ new Date(m.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) }}</span>
            <CoreBadge v-if="tab !== 'ouvertes'" :tone="m.status === 'completed' ? 'ok' : m.status === 'cancelled' ? 'neutral' : (m.status === 'agreed' || m.status === 'in_progress') ? 'info' : 'warn'">
              {{ m.status === 'completed' ? 'Terminée' : m.status === 'cancelled' ? 'Annulée' : m.status === 'in_progress' ? 'Payée, en cours' : m.status === 'agreed' ? 'Offre acceptée' : 'Ouverte' }}
            </CoreBadge>
          </div>
        </div>
      </div>

      <div v-if="selected" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 lg:sticky lg:top-[94px]">
        <p class="m-0 text-[17px] font-bold tracking-[-.015em]">{{ tradeLabel(selected.trade_reference_id) }}</p>
        <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">{{ selected.unit?.name ?? 'Logement' }} · {{ selected.requester ? [selected.requester.first_name, selected.requester.last_name].filter(Boolean).join(' ') || 'Demandeur' : 'Demandeur' }}</p>
        <p class="mb-0 mt-4 text-sm leading-[1.6] text-[var(--text-secondary)]">{{ selected.description }}</p>

        <template v-if="tab === 'ouvertes'">
          <p class="mb-2 mt-4.5 text-[12.5px] font-bold">Message au demandeur (optionnel)</p>
          <textarea v-model="applyMessage" placeholder="Disponible dès demain, je peux passer voir le souci." class="min-h-[70px] w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-3.5 py-3 text-sm outline-none" />
          <p v-if="applyError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ applyError }}</p>
          <CoreButton size="lg" full-width class="mt-4" :disabled="applying" @click="submitApply(selected)">{{ applying ? 'Envoi…' : 'Candidater et proposer un prix' }}</CoreButton>
        </template>

        <template v-else-if="tab === 'encours'">
          <div v-if="offersLoading" class="mt-4 text-[13px] text-[var(--text-muted)]">Chargement…</div>
          <template v-else-if="selected.status === 'open'">
            <div v-if="myOffer" class="mt-4 rounded-md border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-4">
              <p class="m-0 text-[13.5px] font-bold text-clay-900">Votre offre : {{ formatFcfa(Number(myOffer.price)) }}, garantie {{ myOffer.warranty_days }} j</p>
              <p class="mb-0 mt-1.5 text-xs text-clay-900">{{ myOffer.status === 'pending' ? 'En attente de réponse du demandeur.' : myOffer.status === 'accepted' ? 'Acceptée — en attente du paiement.' : 'Refusée par le demandeur.' }}</p>
            </div>
            <CoreButton v-else size="lg" full-width class="mt-4" @click="openOfferModal(selected.id)">Faire une offre</CoreButton>
          </template>
          <template v-else-if="selected.status === 'agreed'">
            <div class="mt-4 rounded-md border border-info-border bg-info-bg p-4 text-[13.5px] text-info-fg-deep">Offre acceptée — en attente du paiement par le demandeur.</div>
          </template>
          <template v-else-if="selected.status === 'in_progress'">
            <CoreButton size="lg" full-width class="mt-4" @click="openTerminerModal(selected.id)">Marquer terminée</CoreButton>
          </template>
        </template>

        <template v-else>
          <div class="mt-4 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4 text-[13.5px] text-[var(--text-secondary)]">
            <template v-if="selected.status === 'completed'">
              Terminée le {{ selected.completed_at ? new Date(selected.completed_at).toLocaleDateString('fr-FR') : '—' }}.
              <template v-if="selected.warranty_expires_at"> Garantie jusqu'au {{ new Date(selected.warranty_expires_at).toLocaleDateString('fr-FR') }}.</template>
            </template>
            <template v-else>Demande annulée.</template>
          </div>
        </template>

        <div class="mt-3.5 flex items-center gap-3 rounded-md bg-[var(--surface-page)] px-3.5 py-3">
          <CoreAvatar :name="selected.requester ? [selected.requester.first_name, selected.requester.last_name].filter(Boolean).join(' ') || 'Demandeur' : 'Demandeur'" :size="34" color="var(--color-green-700)" />
          <div class="flex-1">
            <p class="m-0 text-[13px] font-bold">{{ selected.requester ? [selected.requester.first_name, selected.requester.last_name].filter(Boolean).join(' ') || 'Demandeur' : 'Demandeur' }}</p>
            <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Contact via la messagerie</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
