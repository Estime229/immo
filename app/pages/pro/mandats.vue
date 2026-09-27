<script setup lang="ts">
import type { Mandate } from '~/types/team'
import type { UserRole } from '~/types/auth'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { agentName, MANDATE_STATUS, mandatorName, propertiesOfAgent } from '~/utils/team'

definePageMeta({ layout: 'pro' })

/**
 * Mandats d'agent — branchés sur l'API au Lot 53 (avant : trois mandats
 * factices, et des boutons qui affichaient un faux succès).
 */
const route = useRoute()
const mandatesApi = useMandatesApi()
const propertiesApi = useLandlordPropertiesApi()
const authApi = useAuthApi()

const roles = ref<UserRole[]>([])
const managed = ref<Mandate[]>([])
const mine = ref<Mandate[]>([])
const properties = ref<{ id: string; name: string; agent_id?: string | null }[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')
const highlight = typeof route.query.mandate === 'string' ? route.query.mandate : null

const isMandator = computed(() => roles.value.includes('landlord') || roles.value.includes('agency'))
const isAgent = computed(() => roles.value.includes('agent'))
const tab = ref<'agents' | 'mandants'>('agents')

async function load() {
  try {
    roles.value = (await authApi.fetchRoles()).roles
    const [m, a, p] = await Promise.allSettled([
      isMandator.value ? mandatesApi.managed() : Promise.resolve([]),
      isAgent.value ? mandatesApi.mine() : Promise.resolve([]),
      isMandator.value ? propertiesApi.fetchMine({ limit: 100 }) : Promise.resolve(null)
    ])
    managed.value = m.status === 'fulfilled' ? m.value : []
    mine.value = a.status === 'fulfilled' ? a.value : []
    properties.value = p.status === 'fulfilled' && p.value ? p.value.data.map(x => ({ id: x.id, name: x.name, agent_id: (x as { agent_id?: string | null }).agent_id ?? null })) : []
    if (!isMandator.value && isAgent.value) tab.value = 'mandants'
    if (highlight && mine.value.some(x => x.id === highlight)) tab.value = 'mandants'
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

const flash = ref('')
const actionError = ref('')
const busyId = ref<string | null>(null)
async function run(id: string, action: () => Promise<unknown>, done: string, fallback: string) {
  busyId.value = id
  actionError.value = ''
  flash.value = ''
  try {
    await action()
    flash.value = done
    await load()
  } catch (e) {
    actionError.value = e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback
  } finally {
    busyId.value = null
  }
}

/* ---- Inviter un agent ---- */
const contact = ref('')
const inviteError = ref('')
async function inviteAgent() {
  const v = contact.value.trim()
  inviteError.value = ''
  if (!v) { inviteError.value = "Indiquez l'e-mail ou le téléphone de l'agent."; return }
  const payload = v.includes('@') ? { agent_email: v } : { agent_phone_number: v.replace(/\s/g, '') }
  busyId.value = 'invite'
  try {
    await mandatesApi.create(payload)
    contact.value = ''
    flash.value = "Invitation envoyée : l'agent est prévenu et peut l'accepter depuis son espace."
    await load()
  } catch (e) {
    const raw = e instanceof ApiRequestError ? errorText(e.mapped, "L'invitation n'a pas pu être envoyée.") : "L'invitation n'a pas pu être envoyée."
    inviteError.value = /rôle agent/.test(raw)
      ? "Ce compte n'a pas le rôle agent. Demandez-lui d'activer « Je suis agent » dans son espace Mandats, puis réessayez."
      : raw
  } finally {
    busyId.value = null
  }
}

/* ---- Désigner un agent sur un bien ---- */
const assignFor = ref<string | null>(null)
const assignProperty = ref('')
function assignable(agentId: string) {
  return properties.value.filter(p => p.agent_id !== agentId)
}
async function assign(m: Mandate) {
  if (!assignProperty.value) return
  const name = properties.value.find(p => p.id === assignProperty.value)?.name ?? 'le bien'
  await run(m.id, () => mandatesApi.assignAgent(assignProperty.value, m.agent_id), `${agentName(m)} est désigné comme agent de ${name}.`, "L'agent n'a pas pu être désigné.")
  assignFor.value = null
  assignProperty.value = ''
}

/** L'API laisse l'agent désigné sur les biens après la fin du mandat (#76) : on l'en retire aussi. */
const ending = ref<string | null>(null)
async function endMandate(m: Mandate) {
  await run(m.id, async () => {
    await mandatesApi.revoke(m.id)
    for (const p of propertiesOfAgent(properties.value, m.agent_id)) await mandatesApi.assignAgent(p.id, null)
  }, m.status === 'pending' ? 'Invitation annulée.' : `Mandat terminé : ${agentName(m)} n'est plus désigné sur vos biens.`, "Le mandat n'a pas pu être terminé.")
  ending.value = null
}

/* ---- Côté agent ---- */
async function becomeAgent() {
  await run('role', () => authApi.addRole('agent'), 'Rôle agent activé : les propriétaires et agences peuvent désormais vous mandater avec votre e-mail.', "Le rôle agent n'a pas pu être activé.")
}

function since(m: Mandate) {
  return new Date(m.status === 'pending' ? m.created_at : m.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
const managedSorted = computed(() => [...managed.value].sort((a, b) => ['pending', 'active', 'revoked'].indexOf(a.status) - ['pending', 'active', 'revoked'].indexOf(b.status)))
const mineSorted = computed(() => [...mine.value].sort((a, b) => ['pending', 'active', 'revoked'].indexOf(a.status) - ['pending', 'active', 'revoked'].indexOf(b.status)))
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div v-if="state === 'loading'" class="flex flex-col gap-3.5">
      <DataSkeletonCard v-for="i in 2" :key="i" :height="110" :lines="1" />
    </div>
    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos mandats pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <p v-if="flash" class="mb-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>
      <p v-if="actionError" class="mb-3.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>

      <div v-if="isMandator && isAgent" class="mb-5 flex w-fit gap-[5px] rounded-pill bg-sand-200 p-1">
        <button type="button" class="rounded-pill px-5 py-2.5 text-[13px] font-bold" :class="tab === 'agents' ? 'bg-white text-green-900 shadow-card' : 'text-[var(--text-secondary)]'" @click="tab = 'agents'">Mes agents</button>
        <button type="button" class="rounded-pill px-5 py-2.5 text-[13px] font-bold" :class="tab === 'mandants' ? 'bg-white text-green-900 shadow-card' : 'text-[var(--text-secondary)]'" @click="tab = 'mandants'">Mes mandants</button>
      </div>

      <!-- ===== Propriétaire / agence : mes agents ===== -->
      <template v-if="isMandator && tab === 'agents'">
        <div class="mb-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <p class="m-0 text-[15px] font-bold">Mandater un agent</p>
          <p class="mb-3 mt-1 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">L'agent doit avoir un compte Immo avec le rôle agent. Il reçoit l'invitation et l'accepte depuis son espace.</p>
          <div class="flex flex-wrap gap-2">
            <input v-model="contact" placeholder="E-mail ou téléphone de l'agent" class="h-11 min-w-[220px] flex-1 rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none" @keydown.enter="inviteAgent">
            <CoreButton :disabled="busyId === 'invite'" @click="inviteAgent">{{ busyId === 'invite' ? 'Envoi…' : 'Inviter' }}</CoreButton>
          </div>
          <p v-if="inviteError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ inviteError }}</p>
          <p class="mb-0 mt-3 rounded-md bg-[var(--surface-page)] p-3 text-[12px] leading-[1.55] text-[var(--text-muted)]">
            Désigner un agent sur un bien l'affiche comme agent de ce bien. Cela ne lui donne encore <strong>aucun accès</strong> : pour lui confier des actions (baux, logements…), invitez-le aussi dans votre <NuxtLink to="/pro/equipe" class="font-bold underline">équipe</NuxtLink>.
          </p>
        </div>

        <p v-if="!managed.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-8 text-center text-[13.5px] text-[var(--text-muted)]">Aucun agent mandaté pour l'instant.</p>
        <div v-for="m in managedSorted" :id="`mandate-${m.id}`" :key="m.id" class="mb-3.5 rounded-2xl border bg-white p-5.5" :class="m.id === highlight ? 'border-green-600' : 'border-[var(--border-subtle)]'">
          <div class="flex flex-wrap items-center gap-3.5">
            <CoreAvatar :name="agentName(m)" :size="44" />
            <div class="min-w-0 flex-1">
              <p class="m-0 text-base font-bold">{{ agentName(m) }}</p>
              <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">{{ [m.agent?.email, m.agent?.phone_number].filter(Boolean).join(' · ') }} · {{ m.status === 'pending' ? 'invité le' : 'depuis le' }} {{ since(m) }}</p>
            </div>
            <CoreBadge :tone="MANDATE_STATUS[m.status].tone">{{ MANDATE_STATUS[m.status].label }}</CoreBadge>
          </div>
          <div v-if="m.status !== 'revoked'" class="mt-4 border-t border-sand-200 pt-4">
            <template v-if="m.status === 'active'">
              <p class="mb-2 mt-0 text-xs font-black uppercase tracking-[.04em] text-[var(--text-faint)]">Désigné sur</p>
              <div v-if="propertiesOfAgent(properties, m.agent_id).length" class="flex flex-wrap gap-2">
                <span v-for="p in propertiesOfAgent(properties, m.agent_id)" :key="p.id" class="inline-flex items-center gap-2 rounded-pill border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3 py-1.5 text-[12.5px] font-semibold">
                  {{ p.name }}
                  <button type="button" class="text-[var(--text-faint)]" :aria-label="`Retirer de ${p.name}`" :disabled="busyId === m.id" @click="run(m.id, () => mandatesApi.assignAgent(p.id, null), `${agentName(m)} n'est plus agent de ${p.name}.`, 'Le changement n\'a pas pu être enregistré.')">✕</button>
                </span>
              </div>
              <p v-else class="m-0 text-[13px] text-[var(--text-faint)]">Aucun bien pour l'instant.</p>
              <div v-if="assignFor === m.id" class="mt-3 flex flex-wrap gap-2">
                <select v-model="assignProperty" class="h-10 min-w-[200px] flex-1 rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px]">
                  <option value="" disabled>Choisir un bien</option>
                  <option v-for="p in assignable(m.agent_id)" :key="p.id" :value="p.id">{{ p.name }}{{ p.agent_id ? ' (a déjà un agent)' : '' }}</option>
                </select>
                <CoreButton size="sm" :disabled="!assignProperty || busyId === m.id" @click="assign(m)">Désigner</CoreButton>
                <CoreButton size="sm" tone="secondary" @click="assignFor = null">Annuler</CoreButton>
              </div>
              <button v-else-if="assignable(m.agent_id).length" type="button" class="mt-3 rounded-sm border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold" @click="assignFor = m.id; assignProperty = ''">+ Désigner sur un bien</button>
            </template>
            <p v-else class="m-0 text-[13px] text-[var(--text-muted)]">En attente de la réponse de l'agent.</p>

            <div v-if="ending === m.id" class="mt-3 flex flex-wrap items-center gap-2.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5">
              <p class="m-0 flex-1 text-[13px] font-semibold text-warn-fg">{{ m.status === 'pending' ? 'Annuler cette invitation ?' : `Mettre fin au mandat ? ${agentName(m)} sera retiré de vos biens et prévenu.` }}</p>
              <CoreButton size="sm" tone="danger" :disabled="busyId === m.id" @click="endMandate(m)">Confirmer</CoreButton>
              <CoreButton size="sm" tone="secondary" @click="ending = null">Non</CoreButton>
            </div>
            <button v-else type="button" class="mt-3 block text-[12.5px] font-bold text-danger-fg" @click="ending = m.id">{{ m.status === 'pending' ? "Annuler l'invitation" : 'Mettre fin au mandat' }}</button>
          </div>
        </div>
      </template>

      <!-- ===== Agent : mes mandants ===== -->
      <template v-if="tab === 'mandants' || !isMandator">
        <div v-if="!isAgent" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <p class="m-0 text-[15px] font-bold">Vous êtes agent immobilier ?</p>
          <p class="mb-3 mt-1 text-[13px] leading-[1.55] text-[var(--text-muted)]">Activez le rôle agent : les propriétaires et agences pourront vous mandater avec votre e-mail, et vous retrouverez leurs invitations ici.</p>
          <CoreButton :disabled="busyId === 'role'" @click="becomeAgent">{{ busyId === 'role' ? 'Activation…' : 'Je suis agent' }}</CoreButton>
        </div>
        <template v-else>
          <p v-if="!mine.length" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-8 text-center text-[13.5px] text-[var(--text-muted)]">Aucun mandat reçu pour l'instant.</p>
          <div v-for="m in mineSorted" :id="`mandate-${m.id}`" :key="m.id" class="mb-3.5 rounded-2xl border bg-white p-5.5" :class="m.id === highlight ? 'border-green-600' : 'border-[var(--border-subtle)]'">
            <div class="flex flex-wrap items-center gap-3.5">
              <CoreAvatar :name="mandatorName(m)" :size="44" />
              <div class="min-w-0 flex-1">
                <p class="m-0 text-base font-bold">{{ mandatorName(m) }}</p>
                <p class="mb-0 mt-0.5 text-[12.5px] text-[var(--text-muted)]">{{ m.mandator_type === 'agency' ? 'Agence' : 'Propriétaire' }} · {{ m.status === 'pending' ? 'invitation du' : 'depuis le' }} {{ since(m) }}</p>
              </div>
              <CoreBadge :tone="MANDATE_STATUS[m.status].tone">{{ MANDATE_STATUS[m.status].label }}</CoreBadge>
            </div>
            <div v-if="m.status === 'pending'" class="mt-4 flex flex-wrap gap-2.5">
              <CoreButton :disabled="busyId === m.id" @click="run(m.id, () => mandatesApi.respond(m.id, 'accept'), `Mandat accepté : ${mandatorName(m)} est prévenu.`, 'Le mandat n\'a pas pu être accepté.')">Accepter le mandat</CoreButton>
              <CoreButton tone="secondary" :disabled="busyId === m.id" @click="run(m.id, () => mandatesApi.respond(m.id, 'reject'), 'Mandat refusé : le mandant est prévenu.', 'Le refus n\'a pas pu être enregistré.')">Refuser</CoreButton>
            </div>
            <template v-else-if="m.status === 'active'">
              <p class="mb-0 mt-3 text-[12.5px] leading-[1.55] text-[var(--text-muted)]">Ce mandat ne vous donne pas encore accès aux biens : pour agir dessus, le mandant doit aussi vous inviter dans son équipe.</p>
              <div v-if="ending === m.id" class="mt-3 flex flex-wrap items-center gap-2.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5">
                <p class="m-0 flex-1 text-[13px] font-semibold text-warn-fg">Mettre fin à ce mandat ? {{ mandatorName(m) }} sera prévenu.</p>
                <CoreButton size="sm" tone="danger" :disabled="busyId === m.id" @click="run(m.id, () => mandatesApi.revoke(m.id), 'Mandat terminé.', 'Le mandat n\'a pas pu être terminé.'); ending = null">Confirmer</CoreButton>
                <CoreButton size="sm" tone="secondary" @click="ending = null">Non</CoreButton>
              </div>
              <button v-else type="button" class="mt-3 block text-[12.5px] font-bold text-danger-fg" @click="ending = m.id">Mettre fin au mandat</button>
            </template>
          </div>
        </template>
      </template>

      <p v-if="!isMandator && !isAgent" class="mt-3.5 text-[12.5px] text-[var(--text-faint)]">Les mandats relient un propriétaire ou une agence à un agent immobilier.</p>
    </template>
  </div>
</template>
