<script setup lang="ts">
import { Handshake, MailOpen } from '@lucide/vue'
import type { ArtisanPartnership } from '~/types/artisan'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'

definePageMeta({ layout: 'artisan' })

/**
 * Partenariats avec les agences et propriétaires. Refuser une invitation et mettre fin à un
 * partenariat passent par une confirmation en ligne (avant : un clic). L'API ne prend pas de
 * motif sur ces deux actions : aucun champ « motif » qui n'irait nulle part.
 */
const artisanApi = useArtisanRequestsApi()
const block = useFetchBlock(() => artisanApi.myPartnerships())
onMounted(block.load)
onMounted(() => usePartenairesBadge().markAllSeen())

const pending = computed(() => block.items.value.filter(p => p.status === 'pending'))
const active = computed(() => block.items.value.filter(p => p.status === 'active'))
const past = computed(() => block.items.value.filter(p => p.status !== 'pending' && p.status !== 'active'))

const PAST_STATUS: Record<string, { label: string; tone: 'neutral' }> = {
  ended: { label: 'Terminé', tone: 'neutral' },
  rejected: { label: 'Refusé', tone: 'neutral' }
}

function managerName(p: ArtisanPartnership) {
  return p.manager ? [p.manager.first_name, p.manager.last_name].filter(Boolean).join(' ') || 'Un gestionnaire' : 'Un gestionnaire'
}
function managerKind(p: ArtisanPartnership) {
  return p.manager_role === 'agency' ? 'Agence' : p.manager_role === 'landlord' ? 'Propriétaire' : p.manager_role === 'agent' ? 'Agent immobilier' : 'Gestionnaire'
}
function formatLong(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const busyId = ref<string | null>(null)
const confirming = ref<{ id: string; kind: 'decline' | 'end' } | null>(null)
const errors = ref<Record<string, string>>({})
const flash = ref('')

async function run(p: ArtisanPartnership, call: () => Promise<unknown>, done: string, fallback: string) {
  busyId.value = p.id
  errors.value = {}
  flash.value = ''
  try {
    await call()
    confirming.value = null
    flash.value = done
    await block.load()
  } catch (e) {
    errors.value = { [p.id]: e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback }
  } finally {
    busyId.value = null
  }
}
function accept(p: ArtisanPartnership) {
  run(p, () => artisanApi.respondPartnership(p.id, 'accept'), `Partenariat avec ${managerName(p)} accepté.`, "L'invitation n'a pas pu être acceptée.")
}
function decline(p: ArtisanPartnership) {
  run(p, () => artisanApi.respondPartnership(p.id, 'decline'), `Invitation de ${managerName(p)} refusée.`, "Le refus n'a pas pu être enregistré.")
}
function end(p: ArtisanPartnership) {
  run(p, () => artisanApi.endPartnership(p.id), `Partenariat avec ${managerName(p)} terminé.`, "Le partenariat n'a pas pu être terminé.")
}
</script>

<template>
  <div class="flex animate-[im-fade_.3s_ease_backwards] flex-col gap-4.5">
    <p class="m-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
      Une agence ou un propriétaire peut vous inviter comme artisan partenaire, et réserver certaines de ses demandes d'intervention à ses partenaires.
    </p>

    <p v-if="flash" class="m-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>

    <div v-if="block.state.value === 'idle' || block.state.value === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="90" :lines="0" />
    </div>
    <FeedbackAlertBanner v-else-if="block.state.value === 'error'" tone="danger">
      Impossible de charger vos partenariats pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="block.load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <!-- Invitations -->
      <section v-if="pending.length" class="rounded-2xl border border-info-border bg-info-bg p-5.5">
        <h2 class="m-0 inline-flex items-center gap-2 text-[15px] font-bold text-info-fg-deep">
          <MailOpen class="h-[18px] w-[18px]" :stroke-width="1.9" aria-hidden="true" />
          {{ pending.length > 1 ? `${pending.length} invitations en attente` : 'Invitation en attente' }}
        </h2>
        <div v-for="p in pending" :key="p.id" class="border-b border-info-border py-3.5 last:border-b-0 last:pb-0">
          <div class="flex flex-wrap items-center gap-3">
            <CoreAvatar :name="managerName(p)" :size="40" />
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold text-info-fg-deep">{{ managerName(p) }}</p>
              <p class="mb-0 mt-0.5 text-xs text-info-fg-deep/80">{{ managerKind(p) }} · invitation du <span class="font-mono">{{ formatLong(p.created_at) }}</span></p>
            </div>
          </div>
          <CoreInlineConfirm
            v-if="confirming?.id === p.id && confirming.kind === 'decline'"
            class="mt-3"
            tone="danger"
            :message="`Refuser l'invitation de ${managerName(p)} ? Il devra vous inviter à nouveau si vous changez d'avis.`"
            confirm-label="Refuser"
            :loading="busyId === p.id"
            @confirm="decline(p)"
            @cancel="confirming = null"
          />
          <div v-else class="mt-3 flex flex-wrap gap-2.5">
            <CoreButton size="sm" :disabled="busyId === p.id" @click="accept(p)">{{ busyId === p.id ? 'Envoi…' : 'Accepter' }}</CoreButton>
            <CoreButton size="sm" tone="secondary" :disabled="busyId === p.id" @click="confirming = { id: p.id, kind: 'decline' }">Refuser</CoreButton>
          </div>
          <p v-if="errors[p.id]" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ errors[p.id] }}</p>
        </div>
      </section>

      <!-- Partenariats actifs -->
      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <h2 class="m-0 text-[15px] font-bold">Partenaires actifs</h2>
        <div v-if="!active.length" class="flex flex-col items-center px-4 py-7 text-center">
          <div class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Handshake class="h-5 w-5" :stroke-width="1.9" aria-hidden="true" /></div>
          <p class="mx-auto mb-0 mt-3 max-w-[400px] text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
            {{ pending.length ? 'Aucun partenariat actif : répondez à l\'invitation ci-dessus pour en démarrer un.' : 'Aucun partenariat actif. Les invitations des agences et propriétaires apparaîtront ici ; un profil complet (métier, présentation, photos) aide à être choisi.' }}
          </p>
          <CoreButton v-if="!pending.length" size="sm" tone="secondary" class="mt-4" @click="navigateTo('/artisan/profil')">Compléter mon profil</CoreButton>
        </div>
        <div v-else>
          <div v-for="p in active" :key="p.id" class="border-b border-sand-200 py-3.5 last:border-b-0 last:pb-0">
            <div class="flex flex-wrap items-center gap-3">
              <CoreAvatar :name="managerName(p)" :size="40" />
              <div class="min-w-0 flex-1 basis-[160px]">
                <p class="m-0 truncate text-sm font-bold">{{ managerName(p) }}</p>
                <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ managerKind(p) }} · partenaire depuis le <span class="font-mono">{{ formatLong(p.created_at) }}</span></p>
              </div>
              <CoreBadge tone="ok">Actif</CoreBadge>
              <CoreButton v-if="confirming?.id !== p.id" size="sm" tone="ghost" :disabled="busyId === p.id" @click="confirming = { id: p.id, kind: 'end' }">Mettre fin</CoreButton>
            </div>
            <CoreInlineConfirm
              v-if="confirming?.id === p.id && confirming.kind === 'end'"
              class="mt-3"
              tone="danger"
              :message="`Mettre fin au partenariat avec ${managerName(p)} ? Il devra vous inviter à nouveau pour le reprendre.`"
              confirm-label="Mettre fin"
              :loading="busyId === p.id"
              @confirm="end(p)"
              @cancel="confirming = null"
            />
            <p v-if="errors[p.id]" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ errors[p.id] }}</p>
          </div>
        </div>
      </section>

      <!-- Historique -->
      <section v-if="past.length" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <h2 class="m-0 text-[15px] font-bold">Partenariats passés</h2>
        <div v-for="p in past" :key="p.id" class="flex flex-wrap items-center gap-3 border-b border-sand-200 py-3 last:border-b-0 last:pb-0">
          <CoreAvatar :name="managerName(p)" :size="34" />
          <div class="min-w-0 flex-1">
            <p class="m-0 truncate text-sm font-bold">{{ managerName(p) }}</p>
            <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ managerKind(p) }}<template v-if="p.updated_at"> · le <span class="font-mono">{{ formatLong(p.updated_at) }}</span></template></p>
          </div>
          <CoreBadge :tone="PAST_STATUS[p.status]?.tone ?? 'neutral'">{{ PAST_STATUS[p.status]?.label ?? 'Terminé' }}</CoreBadge>
        </div>
      </section>
    </template>
  </div>
</template>
