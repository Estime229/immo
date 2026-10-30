<script setup lang="ts">
import { Briefcase, Building2, Plus, UserCheck, UserPlus, Users, X } from '@lucide/vue'
import type { Mandate, Membership, MyTeam } from '~/types/team'
import type { UserRole } from '~/types/auth'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { agentName, inTeam, MANDATE_STATUS, mandatorName, mandatorTeam, propertiesOfAgent } from '~/utils/team'

definePageMeta({ layout: 'pro' })

/**
 * Mandats d'agent. Un mandat ne donne aucun accès aux biens (#76) : l'accès
 * passe par l'équipe. Chaque mandat actif propose donc l'étape suivante
 * (inviter l'agent dans l'équipe, ou côté agent, retrouver ses équipes).
 * Vue dans l'URL (`?vue=mandants`), mandat mis en avant par `?mandate=`.
 */
const route = useRoute()
const router = useRouter()
const mandatesApi = useMandatesApi()
const propertiesApi = useLandlordPropertiesApi()
const authApi = useAuthApi()
const teamApi = useTeamApi()

const roles = ref<UserRole[]>([])
const managed = ref<Mandate[]>([])
const mine = ref<Mandate[]>([])
const properties = ref<{ id: string; name: string; agent_id?: string | null }[]>([])
const myTeam = ref<MyTeam | null>(null)
const memberships = ref<Membership[]>([])
const state = ref<'loading' | 'error' | 'ready'>('loading')
const highlight = computed(() => (typeof route.query.mandate === 'string' ? route.query.mandate : null))

const isMandator = computed(() => roles.value.includes('landlord') || roles.value.includes('agency'))
const isAgent = computed(() => roles.value.includes('agent'))

const VIEWS = [{ value: 'agents', label: 'Mes agents' }, { value: 'mandants', label: 'Mes mandants' }]
const tab = computed<'agents' | 'mandants'>(() => {
  if (!isMandator.value) return 'mandants'
  if (!isAgent.value) return 'agents'
  if (route.query.vue === 'mandants') return 'mandants'
  if (highlight.value && mine.value.some(x => x.id === highlight.value)) return 'mandants'
  return 'agents'
})
function setTab(v: string) {
  const { vue: _, mandate: __, ...rest } = route.query
  router.replace({ query: v === 'mandants' ? { ...rest, vue: 'mandants' } : rest })
  flash.value = ''
  confirming.value = null
}

async function load() {
  try {
    roles.value = (await authApi.fetchRoles()).roles
    const [m, a, p, t, ms] = await Promise.allSettled([
      isMandator.value ? mandatesApi.managed() : Promise.resolve([]),
      isAgent.value ? mandatesApi.mine() : Promise.resolve([]),
      isMandator.value ? propertiesApi.fetchMine({ limit: 100 }) : Promise.resolve(null),
      isMandator.value ? teamApi.fetchMyTeam() : Promise.resolve(null),
      isAgent.value ? teamApi.fetchMemberships() : Promise.resolve([])
    ])
    if ((isMandator.value && m.status === 'rejected') || (isAgent.value && a.status === 'rejected')) throw new Error('mandats')
    managed.value = m.status === 'fulfilled' ? m.value : []
    mine.value = a.status === 'fulfilled' ? a.value : []
    properties.value = p.status === 'fulfilled' && p.value ? p.value.data.map(x => ({ id: x.id, name: x.name, agent_id: (x as { agent_id?: string | null }).agent_id ?? null })) : []
    myTeam.value = t.status === 'fulfilled' ? t.value : null
    memberships.value = ms.status === 'fulfilled' ? ms.value : []
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}
onMounted(load)

/** Lien profond suivi même quand on est déjà sur la page (clic de notification). */
watch(highlight, id => {
  if (id) nextTick(() => document.getElementById(`mandate-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
})
watch(state, s => {
  if (s === 'ready' && highlight.value) nextTick(() => document.getElementById(`mandate-${highlight.value}`)?.scrollIntoView({ block: 'center' }))
})

const flash = ref('')
const rowError = ref<{ id: string; message: string } | null>(null)
const busyId = ref<string | null>(null)
/** Un seul panneau de confirmation ouvert à la fois. */
const confirming = ref<{ id: string; kind: 'end' | 'reject' } | null>(null)

async function run(id: string, action: () => Promise<unknown>, done: string, fallback: string) {
  busyId.value = id
  rowError.value = null
  flash.value = ''
  try {
    await action()
    flash.value = done
    confirming.value = null
    await load()
    return true
  } catch (e) {
    rowError.value = { id, message: e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback }
    return false
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
  flash.value = ''
  try {
    await mandatesApi.create(payload)
    contact.value = ''
    flash.value = "Invitation envoyée : l'agent est prévenu et peut l'accepter depuis son espace Mandats."
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
  if (await run(m.id, () => mandatesApi.assignAgent(assignProperty.value, m.agent_id), `${agentName(m)} est désigné comme agent de ${name}.`, "L'agent n'a pas pu être désigné.")) {
    assignFor.value = null
    assignProperty.value = ''
  }
}

/** L'API laisse l'agent désigné sur les biens après la fin du mandat (#76) : on l'en retire aussi. */
function endMandate(m: Mandate) {
  return run(m.id, async () => {
    await mandatesApi.revoke(m.id)
    for (const p of propertiesOfAgent(properties.value, m.agent_id)) await mandatesApi.assignAgent(p.id, null)
  }, m.status === 'pending' ? `Invitation de ${agentName(m)} annulée.` : `Mandat terminé : ${agentName(m)} n'est plus désigné sur vos biens et en est prévenu.`, "Le mandat n'a pas pu être terminé.")
}
function endMessage(m: Mandate) {
  if (m.status === 'pending') return `Annuler l'invitation de ${agentName(m)} ? Il ne pourra plus l'accepter.`
  const n = propertiesOfAgent(properties.value, m.agent_id).length
  return `Mettre fin au mandat de ${agentName(m)} ?${n ? ` Il sera retiré de ${n} bien${n > 1 ? 's' : ''}.` : ''} Il en est prévenu.${inTeam(myTeam.value, m.agent?.email) === 'active' ? ' Son accès d\'équipe, lui, reste à retirer depuis la page Équipe.' : ''}`
}

/** Étape suivante d'un mandat actif : l'équipe, seule à donner un accès. */
function teamLink(m: Mandate) {
  return m.agent?.email ? `/pro/equipe?invite=${encodeURIComponent(m.agent.email)}` : '/pro/equipe'
}

/* ---- Côté agent ---- */
function becomeAgent() {
  return run('role', () => authApi.addRole('agent'), 'Rôle agent activé : les propriétaires et agences peuvent désormais vous mandater avec votre e-mail.', "Le rôle agent n'a pas pu être activé.")
}

function since(m: Mandate) {
  return new Date(m.status === 'pending' ? m.created_at : m.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
const ORDER = ['pending', 'active', 'revoked']
const managedSorted = computed(() => [...managed.value].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)))
const mineSorted = computed(() => [...mine.value].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)))
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div v-if="state === 'loading'" class="flex flex-col gap-4.5">
      <DataSkeletonCard :height="130" :lines="1" />
      <DataSkeletonCard v-for="i in 2" :key="i" :height="110" :lines="1" />
    </div>
    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger vos mandats pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <div v-if="isMandator && isAgent" class="mb-4.5 max-w-full overflow-x-auto [&_button]:whitespace-nowrap">
        <FormsSegmentedControl :options="VIEWS" :model-value="tab" size="sm" @update:model-value="setTab" />
      </div>

      <p v-if="flash" class="mb-4.5 mt-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash }}</p>

      <!-- ===== Propriétaire / agence : mes agents ===== -->
      <template v-if="isMandator && tab === 'agents'">
        <section class="mb-5.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <h2 class="m-0 text-[15px] font-bold">Mandater un agent</h2>
          <p class="mb-3.5 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">L'agent doit avoir un compte Immo avec le rôle agent. Il reçoit l'invitation et l'accepte depuis son espace.</p>
          <div class="flex flex-wrap items-start gap-2.5">
            <div class="min-w-0 flex-[1_1_240px]">
              <FormsInput v-model="contact" label="E-mail ou téléphone de l'agent" placeholder="agent@exemple.bj ou 0197000000" :invalid="!!inviteError" :hint="inviteError || undefined" @keydown.enter="inviteAgent" />
            </div>
            <CoreButton class="sm:mt-[26px]" :disabled="busyId === 'invite'" @click="inviteAgent">
              <span class="inline-flex items-center gap-1.5"><UserPlus class="h-4 w-4" :stroke-width="1.9" />{{ busyId === 'invite' ? 'Envoi…' : 'Inviter' }}</span>
            </CoreButton>
          </div>
          <p class="mb-0 mt-3.5 rounded-md bg-[var(--surface-page)] p-3 text-[13px] leading-[1.55] text-[var(--text-muted)]">
            Désigner un agent sur un bien l'affiche comme agent de ce bien, sans lui donner <strong>aucun accès</strong>. Pour lui confier des actions (baux, logements…), invitez-le aussi dans votre <NuxtLink to="/pro/equipe" class="font-bold text-green-700">équipe</NuxtLink>.
          </p>
        </section>

        <div v-if="!managed.length" class="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
          <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Briefcase class="h-5 w-5" :stroke-width="1.9" /></span>
          <p class="mb-0 mt-3 max-w-[380px] text-[13.5px] text-[var(--text-muted)]">Aucun agent mandaté pour l'instant. Saisissez l'e-mail ou le téléphone d'un agent ci-dessus pour l'inviter.</p>
        </div>

        <div class="flex flex-col gap-4.5">
          <section v-for="m in managedSorted" :id="`mandate-${m.id}`" :key="m.id" class="rounded-2xl border bg-white p-5.5" :class="m.id === highlight ? 'border-green-600 ring-2 ring-green-100' : 'border-[var(--border-subtle)]'">
            <div class="flex flex-wrap items-center gap-3.5">
              <CoreAvatar :name="agentName(m)" :avatar-url="m.agent?.avatar_url" :size="44" />
              <div class="min-w-0 flex-[1_1_200px]">
                <p class="m-0 text-sm font-bold">{{ agentName(m) }}</p>
                <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)] [overflow-wrap:anywhere]">
                  {{ [m.agent?.email, m.agent?.phone_number].filter(Boolean).join(' · ') }}<template v-if="m.agent?.email || m.agent?.phone_number"> · </template>{{ m.status === 'pending' ? 'invité le' : m.status === 'active' ? 'depuis le' : 'le' }} <span class="font-mono">{{ since(m) }}</span>
                </p>
              </div>
              <CoreBadge :tone="MANDATE_STATUS[m.status].tone">{{ MANDATE_STATUS[m.status].label }}</CoreBadge>
            </div>

            <div v-if="m.status !== 'revoked'" class="mt-4 border-t border-sand-200 pt-4">
              <template v-if="m.status === 'active'">
                <p class="mb-2 mt-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Désigné sur</p>
                <div v-if="propertiesOfAgent(properties, m.agent_id).length" class="flex flex-wrap gap-2">
                  <span v-for="p in propertiesOfAgent(properties, m.agent_id)" :key="p.id" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-subtle)] bg-[var(--surface-page)] py-1 pl-3 pr-1.5 text-[12.5px] font-semibold">
                    <Building2 class="h-3.5 w-3.5 text-[var(--text-faint)]" :stroke-width="1.9" />
                    {{ p.name }}
                    <button type="button" class="grid h-6 w-6 place-items-center rounded-pill text-[var(--text-faint)] hover:bg-sand-200" :aria-label="`Retirer ${agentName(m)} de ${p.name}`" :disabled="busyId === m.id" @click="run(m.id, () => mandatesApi.assignAgent(p.id, null), `${agentName(m)} n'est plus agent de ${p.name}.`, 'Le changement n\'a pas pu être enregistré.')"><X class="h-3.5 w-3.5" :stroke-width="2" /></button>
                  </span>
                </div>
                <p v-else class="m-0 text-[13px] text-[var(--text-muted)]">Désigné sur aucun bien pour l'instant.</p>

                <div v-if="assignFor === m.id" class="mt-3 flex flex-wrap gap-2">
                  <select v-model="assignProperty" aria-label="Bien" class="h-[42px] min-w-0 flex-[1_1_200px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold">
                    <option value="" disabled>Choisir un bien</option>
                    <option v-for="p in assignable(m.agent_id)" :key="p.id" :value="p.id">{{ p.name }}{{ p.agent_id ? ' (a déjà un agent)' : '' }}</option>
                  </select>
                  <CoreButton size="sm" :disabled="!assignProperty || busyId === m.id" @click="assign(m)">Désigner</CoreButton>
                  <CoreButton size="sm" tone="secondary" @click="assignFor = null">Annuler</CoreButton>
                </div>

                <!-- Étape suivante : l'accès passe par l'équipe -->
                <div class="mt-3.5 flex flex-wrap items-center gap-2">
                  <CoreButton v-if="assignFor !== m.id && assignable(m.agent_id).length" size="sm" tone="secondary" @click="assignFor = m.id; assignProperty = ''">
                    <span class="inline-flex items-center gap-1.5"><Plus class="h-4 w-4" :stroke-width="1.9" />Désigner sur un bien</span>
                  </CoreButton>
                  <span v-if="inTeam(myTeam, m.agent?.email) === 'active'" class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ok-fg">
                    <UserCheck class="h-4 w-4" :stroke-width="1.9" />Membre de votre équipe ·
                    <NuxtLink to="/pro/equipe" class="font-bold text-green-700">gérer ses accès</NuxtLink>
                  </span>
                  <span v-else-if="inTeam(myTeam, m.agent?.email) === 'pending'" class="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
                    <Users class="h-4 w-4" :stroke-width="1.9" />Invité dans votre équipe ·
                    <NuxtLink to="/pro/equipe" class="font-bold text-green-700">voir l'invitation</NuxtLink>
                  </span>
                  <NuxtLink v-else :to="teamLink(m)" class="inline-flex items-center gap-1.5 rounded-pill border border-green-600 bg-white px-4 py-[9px] text-[13px] font-bold text-green-700">
                    <UserPlus class="h-4 w-4" :stroke-width="1.9" />Inviter aussi dans mon équipe
                  </NuxtLink>
                </div>
              </template>
              <p v-else class="m-0 text-[13.5px] text-[var(--text-muted)]">En attente de la réponse de l'agent.</p>

              <CoreInlineConfirm
                v-if="confirming?.id === m.id && confirming.kind === 'end'"
                class="mt-3.5"
                tone="danger"
                :message="endMessage(m)"
                :confirm-label="m.status === 'pending' ? 'Annuler l\'invitation' : 'Mettre fin'"
                :loading="busyId === m.id"
                @confirm="endMandate(m)"
                @cancel="confirming = null"
              />
              <CoreButton v-else size="sm" tone="ghost" class="mt-2.5" @click="confirming = { id: m.id, kind: 'end' }; rowError = null">{{ m.status === 'pending' ? "Annuler l'invitation" : 'Mettre fin au mandat' }}</CoreButton>
            </div>
            <p v-if="rowError?.id === m.id" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ rowError.message }}</p>
          </section>
        </div>
      </template>

      <!-- ===== Agent : mes mandants ===== -->
      <template v-if="tab === 'mandants'">
        <section v-if="!isAgent" class="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <span class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-green-50 text-green-700"><Briefcase class="h-5 w-5" :stroke-width="1.9" /></span>
          <div class="min-w-0 flex-[1_1_260px]">
            <h2 class="m-0 text-[15px] font-bold">Vous êtes agent immobilier ?</h2>
            <p class="mb-0 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Activez le rôle agent : les propriétaires et agences pourront vous mandater avec votre e-mail, et vous retrouverez leurs invitations ici.</p>
            <p v-if="rowError?.id === 'role'" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ rowError.message }}</p>
          </div>
          <CoreButton :disabled="busyId === 'role'" @click="becomeAgent">{{ busyId === 'role' ? 'Activation…' : 'Je suis agent' }}</CoreButton>
        </section>

        <template v-else>
          <div v-if="!mine.length" class="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center">
            <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><Briefcase class="h-5 w-5" :stroke-width="1.9" /></span>
            <p class="mb-0 mt-3 max-w-[400px] text-[13.5px] text-[var(--text-muted)]">Aucun mandat reçu pour l'instant. Donnez votre e-mail aux propriétaires ou agences avec qui vous travaillez : leurs invitations arriveront ici.</p>
          </div>
          <div class="flex flex-col gap-4.5">
            <section v-for="m in mineSorted" :id="`mandate-${m.id}`" :key="m.id" class="rounded-2xl border bg-white p-5.5" :class="m.id === highlight ? 'border-green-600 ring-2 ring-green-100' : 'border-[var(--border-subtle)]'">
              <div class="flex flex-wrap items-center gap-3.5">
                <CoreAvatar :name="mandatorName(m)" :avatar-url="(m.agency ?? m.landlord)?.avatar_url" :size="44" />
                <div class="min-w-0 flex-[1_1_200px]">
                  <p class="m-0 text-sm font-bold">{{ mandatorName(m) }}</p>
                  <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ m.mandator_type === 'agency' ? 'Agence' : 'Propriétaire' }} · {{ m.status === 'pending' ? 'invitation du' : m.status === 'active' ? 'depuis le' : 'le' }} <span class="font-mono">{{ since(m) }}</span></p>
                </div>
                <CoreBadge :tone="MANDATE_STATUS[m.status].tone">{{ MANDATE_STATUS[m.status].label }}</CoreBadge>
              </div>

              <template v-if="m.status === 'pending'">
                <CoreInlineConfirm
                  v-if="confirming?.id === m.id && confirming.kind === 'reject'"
                  class="mt-4"
                  tone="danger"
                  :message="`Refuser le mandat de ${mandatorName(m)} ? Il en est prévenu ; il faudra une nouvelle invitation pour travailler ensemble.`"
                  confirm-label="Refuser"
                  :loading="busyId === m.id"
                  @confirm="run(m.id, () => mandatesApi.respond(m.id, 'reject'), `Mandat refusé : ${mandatorName(m)} est prévenu.`, 'Le refus n\'a pas pu être enregistré.')"
                  @cancel="confirming = null"
                />
                <div v-else class="mt-4 flex flex-wrap gap-2.5 border-t border-sand-200 pt-4">
                  <CoreButton size="sm" :disabled="busyId === m.id" @click="run(m.id, () => mandatesApi.respond(m.id, 'accept'), `Mandat accepté : ${mandatorName(m)} est prévenu.`, 'Le mandat n\'a pas pu être accepté.')">Accepter le mandat</CoreButton>
                  <CoreButton size="sm" tone="secondary" :disabled="busyId === m.id" @click="confirming = { id: m.id, kind: 'reject' }; rowError = null">Refuser</CoreButton>
                </div>
              </template>

              <div v-else-if="m.status === 'active'" class="mt-4 border-t border-sand-200 pt-4">
                <p v-if="mandatorTeam(memberships, m)" class="m-0 flex flex-wrap items-center gap-1.5 text-[13.5px] text-[var(--text-secondary)]">
                  <UserCheck class="h-4 w-4 text-ok-fg" :stroke-width="1.9" />
                  Vous êtes aussi membre de son équipe « {{ mandatorTeam(memberships, m)?.team.name }} ».
                  <NuxtLink to="/pro/equipe" class="font-bold text-green-700">Voir vos accès</NuxtLink>
                </p>
                <p v-else class="m-0 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">
                  Ce mandat ne vous donne pas accès à ses biens : pour agir dessus, {{ mandatorName(m) }} doit aussi vous inviter dans son équipe. Vous recevrez un lien d'invitation ; une fois accepté, l'équipe apparaît dans
                  <NuxtLink to="/pro/equipe" class="font-bold text-green-700">Équipe</NuxtLink>.
                </p>
                <CoreInlineConfirm
                  v-if="confirming?.id === m.id && confirming.kind === 'end'"
                  class="mt-3.5"
                  tone="danger"
                  :message="`Mettre fin à ce mandat ? ${mandatorName(m)} en est prévenu.`"
                  confirm-label="Mettre fin"
                  :loading="busyId === m.id"
                  @confirm="run(m.id, () => mandatesApi.revoke(m.id), `Mandat avec ${mandatorName(m)} terminé.`, 'Le mandat n\'a pas pu être terminé.')"
                  @cancel="confirming = null"
                />
                <CoreButton v-else size="sm" tone="ghost" class="mt-2.5" @click="confirming = { id: m.id, kind: 'end' }; rowError = null">Mettre fin au mandat</CoreButton>
              </div>
              <p v-if="rowError?.id === m.id" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ rowError.message }}</p>
            </section>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
