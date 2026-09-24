<script setup lang="ts">
import type { HousingRequestOpenItem } from '~/types/tenant'
import type { PropertySearchResult } from '~/types/property'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'pro' })

const housingRequestsApi = useHousingRequestsApi()
const landlordPropertiesApi = useLandlordPropertiesApi()

const block = useFetchBlock(() => housingRequestsApi.fetchOpen({ limit: 30 }).then(r => r.data))
onMounted(block.load)

/**
 * `GET /housing-requests/open` ne renvoie que la vitrine publique — répondre
 * exige de proposer une de ses propres unités, donc on charge aussi les biens
 * du propriétaire pour construire le sélecteur. Pas de fictive « Demandes
 * reçues » : aucune route d'application directe à un bien précis n'existe
 * côté API (recherche exhaustive du Swagger, confirmée absente) — seule la
 * place de marché ci-dessous est réelle.
 */
const myUnits = ref<{ id: string; label: string }[]>([])
onMounted(async () => {
  try {
    const page = await landlordPropertiesApi.fetchMine({ limit: 100 })
    myUnits.value = (page.data as PropertySearchResult[]).flatMap(p =>
      (p.units ?? []).map(u => ({ id: u.id, label: `${u.name} — ${p.name}` }))
    )
  } catch {
    myUnits.value = []
  }
})

/** `requester_display_name` est `null` en pratique quand le locataire n'a pas de prénom renseigné — vérifié en direct sur la vitrine réelle. */
function requesterName(r: HousingRequestOpenItem) {
  return r.requester_display_name ?? 'Locataire'
}

function amountLabel(r: HousingRequestOpenItem) {
  if (r.budget_min && r.budget_max) return `${Number(r.budget_min).toLocaleString('fr-FR')} – ${Number(r.budget_max).toLocaleString('fr-FR')} F`
  if (r.budget_max) return `≤ ${Number(r.budget_max).toLocaleString('fr-FR')} F`
  if (r.budget_min) return `≥ ${Number(r.budget_min).toLocaleString('fr-FR')} F`
  return 'Budget non précisé'
}

const openFormId = ref<string | null>(null)
const selectedUnitId = ref('')
const respondMessage = ref('')
const busyId = ref<string | null>(null)
const respondError = ref('')
const answered = ref<Set<string>>(new Set())

function openForm(r: HousingRequestOpenItem) {
  openFormId.value = r.id
  selectedUnitId.value = ''
  respondMessage.value = ''
  respondError.value = ''
}

async function submitRespond(r: HousingRequestOpenItem) {
  if (!selectedUnitId.value) return
  busyId.value = r.id
  respondError.value = ''
  try {
    await housingRequestsApi.respond(r.id, selectedUnitId.value, respondMessage.value || undefined)
    answered.value = new Set([...answered.value, r.id])
    openFormId.value = null
  } catch (e) {
    respondError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "La réponse n'a pas pu être envoyée.") : "La réponse n'a pas pu être envoyée."
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <p class="mb-4 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
      Recherches publiées par des locataires. Proposez une de vos unités disponibles pour ouvrir une conversation avec eux.
    </p>

    <div v-if="block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 3" :key="i" :height="120" :lines="2" />
    </div>

    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger les demandes publiques pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="block.state.value === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Aucune demande publique ouverte pour l'instant.
    </p>

    <template v-else>
      <div v-for="r in block.items.value" :key="r.id" class="mb-3.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5">
        <div class="flex items-start gap-3.5">
          <CoreAvatar :name="requesterName(r)" :size="48" color="var(--color-info-fg)" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <p class="m-0 text-[15.5px] font-bold">{{ requesterName(r) }}</p>
              <CoreBadge tone="ok">Recherche ouverte</CoreBadge>
            </div>
            <p class="mb-0 mt-1.5 text-[13px] text-[var(--text-muted)]">{{ amountLabel(r) }}</p>
            <p class="mb-0 mt-2.5 text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">« {{ r.description }} »</p>
          </div>
        </div>

        <div class="mt-4 border-t border-sand-200 pt-4">
          <p v-if="answered.has(r.id)" class="m-0 text-[13px] font-semibold text-green-700">✓ Unité proposée — une conversation a été ouverte.</p>

          <template v-else-if="openFormId === r.id">
            <p v-if="respondError" class="mb-2.5 text-[13px] font-semibold text-danger-fg">{{ respondError }}</p>
            <p v-if="!myUnits.length" class="m-0 text-[13px] text-[var(--text-muted)]">Vous n'avez aucune unité à proposer pour le moment.</p>
            <template v-else>
              <select v-model="selectedUnitId" class="h-10 w-full max-w-md rounded-sm border border-[var(--border-default)] bg-white px-3 text-[13px] outline-none">
                <option value="" disabled>Choisir une de vos unités</option>
                <option v-for="u in myUnits" :key="u.id" :value="u.id">{{ u.label }}</option>
              </select>
              <textarea v-model="respondMessage" rows="2" maxlength="1000" placeholder="Message d'accompagnement (optionnel)" class="mt-2.5 w-full max-w-md resize-none rounded-sm border border-[var(--border-default)] bg-white px-3 py-2 text-[13px] outline-none" />
              <div class="mt-2.5 flex gap-2">
                <button type="button" class="rounded-sm bg-[image:var(--action-primary)] px-4 py-2.5 text-[12.5px] font-bold text-white" :disabled="!selectedUnitId || busyId === r.id" @click="submitRespond(r)">{{ busyId === r.id ? 'Envoi…' : 'Envoyer la proposition' }}</button>
                <button type="button" class="rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[12.5px] font-bold" @click="openFormId = null">Annuler</button>
              </div>
            </template>
          </template>

          <button v-else type="button" class="rounded-sm bg-[image:var(--action-primary)] px-4 py-2.5 text-[12.5px] font-bold text-white" @click="openForm(r)">Proposer un de mes biens</button>
        </div>
      </div>
    </template>
  </div>
</template>
