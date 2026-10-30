<script setup lang="ts">
/**
 * Fiche d'un compte : qui c'est (profil, activité, vérification), puis ce qu'on peut y faire
 * (statut, rôle et accès admin) dans un panneau qui reste visible à droite sur grand écran.
 * La pièce d'identité ne s'affiche plus ici : elle se consulte dans le dossier KYC (lien).
 */
import { ArrowUpRight, Mail, Phone, ShieldCheck } from '@lucide/vue'
import {
  ADMIN_ROLE_LABELS,
  TRANSACTION_STATUS,
  USER_STATUS,
  hasKycFile,
  paymentMethodLabel,
  userKycBadge,
  userRolesLabel,
  type AdminUpdatableRole,
  type UserDetailResponse,
  type UserStatus,
  type UserTransaction
} from '~/composables/useUsers'
import type { RbacRole } from '~/composables/useRbac'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'view:users' })

const route = useRoute()
const { fetchUserDetail, fetchUserTransactions, changeStatus, updateAdminLevel, assignRbacRole } = useUsers()
const { fetchRoles } = useRbac()
const { auth, hasPermission } = useAdminAuth()
const { levels } = useAdminLevels()
const me = useAuthUser()

const userId = computed(() => String(route.params.id))

/* ---------- Chargement ---------- */
const detail = ref<UserDetailResponse | null>(null)
const state = ref<'loading' | 'ready' | 'notfound' | 'error'>('loading')

/** Après une action, on recharge sans repasser par le squelette ; un échec garde la fiche affichée. */
async function load() {
  if (!detail.value) state.value = 'loading'
  try {
    detail.value = await fetchUserDetail(userId.value)
    state.value = 'ready'
  } catch (e: any) {
    if (detail.value) return
    state.value = e?.status === 404 || e?.status === 400 ? 'notfound' : 'error'
  }
}

const TX_PAGE_SIZE = 5
const transactions = ref<UserTransaction[]>([])
const txTotal = ref(0)
const txPage = ref(1)
const txState = ref<'loading' | 'ready' | 'error'>('loading')
const txLoadingMore = ref(false)
const txMoreError = ref(false)

async function loadTransactions(more = false) {
  const next = more ? txPage.value + 1 : 1
  if (more) txLoadingMore.value = true
  else txState.value = 'loading'
  txMoreError.value = false
  try {
    const res = await fetchUserTransactions(userId.value, next, TX_PAGE_SIZE)
    transactions.value = more ? [...transactions.value, ...res.data] : res.data
    txTotal.value = res.total
    txPage.value = next
    txState.value = 'ready'
  } catch {
    if (more) txMoreError.value = true
    else txState.value = 'error'
  } finally {
    txLoadingMore.value = false
  }
}

function loadAll() {
  load()
  loadTransactions()
}
onMounted(loadAll)
/** Lien d'une fiche vers une autre (demandeur d'une suppression…) : même composant, autre compte. */
watch(userId, () => {
  detail.value = null
  panel.value = null
  flash.value = null
  actionError.value = null
  loadAll()
})

/** Retour vers la liste telle qu'on l'a quittée (recherche, filtres, page). */
const backTo = ref('/admin/utilisateurs')
onMounted(() => {
  const back = window.history.state?.back
  if (typeof back === 'string' && /^\/admin\/utilisateurs(\?|$)/.test(back)) backTo.value = back
})

/* ---------- Données affichées ---------- */
const user = computed(() => detail.value?.user ?? null)
const stats = computed(() => detail.value?.stats ?? null)
const name = computed(() => (user.value ? personName(user.value.first_name, user.value.last_name) || user.value.email || 'Compte sans nom' : ''))
const statusBadge = computed(() => (user.value ? USER_STATUS[user.value.status] ?? { label: user.value.status, tone: 'neutral' as const } : null))
const kycBadge = computed(() => (user.value ? userKycBadge(user.value) : null))
const isSelf = computed(() => !!user.value && me.value?.id === user.value.id)
const isAdminAccount = computed(() => user.value?.role === 'admin')
const adminLevelDef = computed(() => (user.value?.admin_level != null ? levels.value.find(l => l.level === user.value?.admin_level) : undefined))

const kybHasData = computed(() => !!(user.value?.kyb && (user.value.kyb.company || user.value.kyb.ifu || user.value.kyb.rccm)))
/** Le dossier KYC (pièce d'identité, justificatifs, KYB) se traite sur sa propre page. */
const kycLink = computed(() => (user.value && hasPermission('manage:kyc') && (hasKycFile(user.value) || kybHasData.value) ? `/admin/kyc/${user.value.id}` : null))

const LANG: Record<string, string> = { fr: 'Français', en: 'Anglais' }

function formatDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const since = computed(() => {
  if (!user.value) return ''
  const a = formatAnciennete(user.value.created_at)
  return a === "aujourd'hui" ? a : `il y a ${a}`
})

const profileRows = computed(() => {
  const u = user.value
  if (!u) return []
  return [
    { label: 'Email', value: u.email || 'Non renseigné', href: u.email ? `mailto:${u.email}` : '', mono: false },
    { label: 'Téléphone', value: u.phone_number || 'Non renseigné', href: u.phone_number ? `tel:${u.phone_number}` : '', mono: !!u.phone_number },
    { label: 'Rôles', value: userRolesLabel(u), href: '', mono: false },
    { label: 'Langue', value: u.preferred_lang ? LANG[u.preferred_lang] ?? u.preferred_lang : '', href: '', mono: false },
    { label: 'Profil', value: u.is_profile_complete == null ? '' : u.is_profile_complete ? 'Complet' : 'Incomplet', href: '', mono: false },
    { label: 'Inscription', value: `${formatDate(u.created_at)} · ${since.value}`, href: '', mono: false },
    { label: 'Dernière modification', value: formatDate(u.updated_at), href: '', mono: false },
    { label: 'Identifiant', value: u.id, href: '', mono: true }
  ].filter(r => r.value)
})

/** Chiffres d'activité : seulement ceux que l'API renvoie et qui ont un sens pour ce compte. */
const tiles = computed(() => {
  const s = stats.value
  const u = user.value
  if (!s || !u) return []
  const roles = [u.role, ...(u.roles ?? [])]
  const out: Array<{ value: string; label: string }> = []
  if (s.propertiesAsOwnerCount || roles.includes('landlord') || roles.includes('agency')) {
    out.push({ value: String(s.propertiesAsOwnerCount), label: `Bien${s.propertiesAsOwnerCount > 1 ? 's' : ''} en propriété · ${s.roomsAsOwnerCount} logement${s.roomsAsOwnerCount > 1 ? 's' : ''}` })
  }
  if (s.propertiesAsAgentCount || roles.includes('agent')) {
    out.push({ value: String(s.propertiesAsAgentCount), label: `Bien${s.propertiesAsAgentCount > 1 ? 's' : ''} suivi${s.propertiesAsAgentCount > 1 ? 's' : ''} comme agent` })
  }
  if (s.walletBalanceTotal != null) {
    const savings = Number(s.walletBalanceSavings || 0)
    out.push({ value: formatPrix(Number(s.walletBalanceTotal)), label: savings > 0 ? `Solde du wallet, dont ${formatPrix(savings)} en tirelire` : 'Solde du wallet' })
  }
  out.push({ value: String(s.transactionsCount), label: s.lastTransactionAt ? `Transaction${s.transactionsCount > 1 ? 's' : ''} · dernière le ${formatDate(s.lastTransactionAt)}` : 'Transaction' + (s.transactionsCount > 1 ? 's' : '') })
  return out
})

const kycSummary = computed(() => {
  const p = user.value?.profile
  if (!p) return ''
  if (p.kyc_status === 'verified') return p.kyc_reviewed_at ? `Identité vérifiée le ${formatDate(p.kyc_reviewed_at)}.` : 'Identité vérifiée.'
  if (p.kyc_status === 'rejected') return `Dossier refusé${p.kyc_reviewed_at ? ` le ${formatDate(p.kyc_reviewed_at)}` : ''}.`
  if (p.kyc_submitted_at) return `Dossier déposé le ${formatDate(p.kyc_submitted_at)}, en attente de vérification.`
  return user.value?.has_id_card ? "Pièce d'identité déposée, en attente de vérification." : 'Aucun dossier déposé pour le moment.'
})

const KYB_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  pending: { label: 'En attente', tone: 'warning' },
  approved: { label: 'Approuvé', tone: 'success' },
  rejected: { label: 'Refusé', tone: 'danger' }
}

function txStatus(status: string) {
  return TRANSACTION_STATUS[status] ?? { label: status, tone: 'neutral' as const }
}

/* ---------- Actions : un seul panneau ouvert à la fois ---------- */
type Panel = UserStatus | 'level' | 'rbac'
const panel = ref<Panel | null>(null)
const busy = ref(false)
const actionError = ref<{ area: 'status' | 'access'; message: string } | null>(null)
const flash = ref<{ area: 'status' | 'access'; text: string } | null>(null)

function openPanel(p: Panel) {
  panel.value = p
  actionError.value = null
  flash.value = null
}
function closePanel() {
  panel.value = null
  actionError.value = null
}

async function run(area: 'status' | 'access', action: () => Promise<unknown>, success: string) {
  busy.value = true
  actionError.value = null
  flash.value = null
  try {
    await action()
    panel.value = null
    flash.value = { area, text: success }
    await load()
  } catch (e: any) {
    actionError.value = { area, message: e?.message || "L'action n'a pas abouti. Réessayez." }
  } finally {
    busy.value = false
  }
}

/* ---- Statut ---- */
const STATUS_HELP: Record<UserStatus, string> = {
  active: 'Le compte fonctionne normalement.',
  restricted: 'Compte marqué restreint : la personne peut toujours se connecter. Un compte inactif depuis 6 mois passe aussi en restreint automatiquement.',
  banned: 'La personne ne peut plus se connecter tant que le compte n\'est pas réactivé.'
}

const STATUS_ACTIONS: Record<UserStatus, Array<{ to: UserStatus; label: string; variant: 'primary' | 'secondary' | 'danger' }>> = {
  active: [
    { to: 'restricted', label: 'Restreindre le compte', variant: 'secondary' },
    { to: 'banned', label: 'Bannir le compte', variant: 'danger' }
  ],
  restricted: [
    { to: 'active', label: 'Réactiver le compte', variant: 'primary' },
    { to: 'banned', label: 'Bannir le compte', variant: 'danger' }
  ],
  banned: [
    { to: 'active', label: 'Réactiver le compte', variant: 'primary' },
    { to: 'restricted', label: 'Passer en restreint', variant: 'secondary' }
  ]
}

/** Ce que fait l'API (relu côté backend) : statut changé, sessions coupées si banni, notification à la personne, motif au journal d'audit. */
const STATUS_CONFIRM: Record<UserStatus, { message: string; label: string; tone: 'warning' | 'danger'; done: string; reasons: string[] }> = {
  restricted: {
    message: 'Restreindre ce compte ? Il passe en « restreint » et la personne est prévenue par notification ; elle peut toujours se connecter.',
    label: 'Restreindre',
    tone: 'warning',
    done: 'Compte restreint. La personne est prévenue par notification et le motif est inscrit au journal d\'audit.',
    reasons: ['Annonces non conformes', "Signalements répétés d'autres utilisateurs", 'Informations de profil douteuses', 'Impayés ou litige en cours']
  },
  banned: {
    message: 'Bannir ce compte ? La personne est déconnectée tout de suite, ne peut plus se connecter et est prévenue par notification.',
    label: 'Bannir',
    tone: 'danger',
    done: 'Compte banni : la personne est déconnectée et prévenue par notification. Le motif est inscrit au journal d\'audit.',
    reasons: ["Fraude ou tentative d'escroquerie", "Usurpation d'identité", 'Harcèlement ou propos abusifs', 'Annonces frauduleuses répétées']
  },
  active: {
    message: 'Réactiver ce compte ? Il retrouve un fonctionnement normal et la personne est prévenue par notification.',
    label: 'Réactiver',
    tone: 'warning',
    done: 'Compte réactivé. La personne est prévenue par notification et le motif est inscrit au journal d\'audit.',
    reasons: ['Situation régularisée', 'Recours accepté après examen', 'Mesure appliquée par erreur', 'Compte inactif réactivé à sa demande']
  }
}

const reason = ref('')
const reasonInput = ref<HTMLTextAreaElement | null>(null)
const statusPanel = computed(() => (panel.value === 'active' || panel.value === 'restricted' || panel.value === 'banned' ? panel.value : null))
/** Passer de banni à restreint lève le bannissement : la phrase le dit. */
const statusMessage = computed(() => {
  const to = statusPanel.value
  if (!to) return ''
  if (to === 'restricted' && user.value?.status === 'banned') {
    return 'Lever le bannissement et garder le compte restreint ? La personne pourra de nouveau se connecter et est prévenue par notification.'
  }
  return STATUS_CONFIRM[to].message
})

function openStatus(to: UserStatus) {
  reason.value = ''
  openPanel(to)
}
function pickReason(r: string) {
  reason.value = r
  nextTick(() => reasonInput.value?.focus())
}
function submitStatus() {
  const to = statusPanel.value
  if (!user.value || !to || !reason.value.trim()) return
  const id = user.value.id
  run('status', () => changeStatus(id, to, reason.value.trim()), STATUS_CONFIRM[to].done)
}

/* ---- Rôle et niveau admin ---- */
const UPDATABLE_ROLES: AdminUpdatableRole[] = ['tenant', 'landlord', 'agent', 'admin']
/** Un admin ne donne qu'un niveau strictement inférieur au sien ; le niveau 7 est réservé au seeder. */
const levelOptions = computed(() => {
  const mine = auth.value.adminLevel
  if (mine == null) return []
  return levels.value.filter(l => !l.seederOnly && l.level < mine).sort((a, b) => b.level - a.level)
})
const levelForm = reactive({ role: 'tenant' as AdminUpdatableRole, adminLevel: '' as number | '' })

function openLevel() {
  const u = user.value
  if (!u) return
  levelForm.role = UPDATABLE_ROLES.includes(u.role as AdminUpdatableRole) ? (u.role as AdminUpdatableRole) : 'tenant'
  levelForm.adminLevel = u.admin_level ?? ''
  openPanel('level')
}

/** L'API remplace tous les rôles du compte par celui choisi : on dit lesquels disparaissent. */
const lostRoles = computed(() => {
  const u = user.value
  if (!u) return []
  return [...new Set([u.role, ...(u.roles ?? [])])].filter(r => r !== levelForm.role).map(r => ADMIN_ROLE_LABELS[r] ?? r)
})
const levelChanged = computed(() => {
  const u = user.value
  if (!u) return false
  if (levelForm.role !== u.role || lostRoles.value.length) return true
  return levelForm.role === 'admin' && Number(levelForm.adminLevel) !== (u.admin_level ?? null)
})
const levelValid = computed(() => levelForm.role !== 'admin' || !!levelForm.adminLevel)

const levelMessage = computed(() => {
  const u = user.value
  if (!u) return ''
  const level = levelOptions.value.find(l => l.level === Number(levelForm.adminLevel))
  let msg = levelForm.role === 'admin'
    ? `${u.role === 'admin' ? 'Passer ce compte' : "Donner l'accès à l'espace admin à ce compte"}${levelForm.adminLevel ? ` au niveau ${levelForm.adminLevel}${level ? ` (${level.name})` : ''}` : ''} ?`
    : `Passer ce compte en ${ADMIN_ROLE_LABELS[levelForm.role].toLowerCase()} ?`
  if (lostRoles.value.length) msg += ` Il n'aura plus que ce rôle : ${lostRoles.value.join(', ')} ${lostRoles.value.length > 1 ? 'sont retirés' : 'est retiré'}.`
  if (u.role === 'admin' && levelForm.role !== 'admin') msg += " Il perd l'accès à l'espace admin."
  return msg
})

function submitLevel() {
  const u = user.value
  if (!u || !levelValid.value || !levelChanged.value) return
  const role = levelForm.role
  const adminLevel = role === 'admin' ? Number(levelForm.adminLevel) : null
  const done = role === 'admin'
    ? `Accès admin enregistré : niveau ${adminLevel}.`
    : `Rôle enregistré : ${ADMIN_ROLE_LABELS[role]}.`
  run('access', () => updateAdminLevel(u.id, { role, admin_level: adminLevel }), done)
}

/* ---- Rôle RBAC ---- */
const rbacRoles = ref<RbacRole[]>([])
const rbacState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const rbacForm = reactive({ roleId: '', reason: '' })
const rbacRoleName = computed(() => rbacRoles.value.find(r => r.id === rbacForm.roleId)?.name ?? '')

async function openRbac() {
  rbacForm.roleId = ''
  rbacForm.reason = ''
  openPanel('rbac')
  if (rbacState.value === 'ready' || rbacState.value === 'loading') return
  rbacState.value = 'loading'
  try {
    rbacRoles.value = await fetchRoles()
    rbacState.value = 'ready'
  } catch {
    rbacState.value = 'error'
  }
}

function submitRbac() {
  const u = user.value
  if (!u || !rbacForm.roleId || !rbacForm.reason.trim()) return
  const roleName = rbacRoleName.value
  run('access', () => assignRbacRole(u.id, rbacForm.roleId, rbacForm.reason.trim()), `Rôle RBAC « ${roleName} » assigné. Le motif est inscrit au journal d'audit.`)
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <NuxtLink :to="backTo" class="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700">← Utilisateurs</NuxtLink>

    <div v-if="state === 'loading'" class="flex flex-col gap-4.5">
      <DataSkeletonCard :height="112" :lines="0" />
      <div class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="flex flex-col gap-4.5">
          <DataSkeletonCard :height="96" :lines="0" />
          <DataSkeletonCard :height="260" :lines="0" />
        </div>
        <DataSkeletonCard :height="220" :lines="0" />
      </div>
    </div>

    <p v-else-if="state === 'notfound'" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Ce compte est introuvable : le lien est peut-être incomplet, ou le compte n'existe plus.
    </p>

    <FeedbackAlertBanner v-else-if="state === 'error' || !user" tone="danger">
      Impossible de charger ce compte pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="loadAll">Réessayer</button>
    </FeedbackAlertBanner>

    <template v-else>
      <!-- En-tête -->
      <section class="mb-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="flex flex-wrap items-center gap-4">
          <CoreAvatar :name="name" :size="64" :avatar-url="user.avatar_url" />
          <div class="min-w-0 flex-1">
            <h2 class="m-0 font-display text-[21px] font-bold tracking-[-.02em] [overflow-wrap:anywhere]">{{ name }}</h2>
            <p class="mb-0 mt-0.5 text-[13.5px] text-[var(--text-muted)]">{{ userRolesLabel(user) }} · inscrit {{ since === "aujourd'hui" ? since : `le ${formatDate(user.created_at)}` }}</p>
            <div class="mt-2.5 flex flex-wrap gap-1.5">
              <AdminBadge v-if="statusBadge" :tone="statusBadge.tone">{{ statusBadge.label }}</AdminBadge>
              <AdminBadge v-if="kycBadge" :tone="kycBadge.tone">{{ kycBadge.label }}</AdminBadge>
              <AdminBadge v-if="isAdminAccount" tone="primary">Administrateur<template v-if="user.admin_level != null"> · niveau {{ user.admin_level }}</template></AdminBadge>
              <AdminBadge v-if="user.is_profile_complete === false" tone="neutral">Profil incomplet</AdminBadge>
              <AdminBadge v-if="isSelf" tone="info">Votre compte</AdminBadge>
            </div>
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <!-- Contenu -->
        <div class="flex min-w-0 flex-col gap-4.5">
          <div v-if="tiles.length" class="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div v-for="t in tiles" :key="t.label" class="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
              <p class="m-0 truncate font-mono text-xl font-bold tracking-[-.02em] text-green-900">{{ t.value }}</p>
              <p class="mb-0 mt-1.5 text-[11.5px] leading-[1.3] text-[var(--text-muted)]">{{ t.label }}</p>
            </div>
          </div>

          <!-- Profil -->
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Profil</h2>
            <dl class="mb-0 mt-2">
              <div v-for="r in profileRows" :key="r.label" class="flex flex-col gap-0.5 border-b border-sand-200 py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
                <dt class="flex-none text-[12.5px] text-[var(--text-muted)] sm:w-[170px]">{{ r.label }}</dt>
                <dd class="m-0 min-w-0 text-[13.5px] font-semibold [overflow-wrap:anywhere]" :class="r.mono ? 'font-mono text-[12.5px]' : ''">
                  <a v-if="r.href" :href="r.href" class="text-green-700 hover:underline">{{ r.value }}</a>
                  <template v-else>{{ r.value }}</template>
                </dd>
              </div>
            </dl>
          </section>

          <!-- Vérification d'identité -->
          <section v-if="(user.profile && !isAdminAccount) || user.kyb" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <div class="mb-3 flex items-baseline justify-between gap-3">
              <h2 class="m-0 text-[15px] font-bold">Vérification d'identité</h2>
              <NuxtLink v-if="kycLink" :to="kycLink" class="text-[12.5px] font-bold text-green-700">Ouvrir le dossier KYC</NuxtLink>
            </div>
            <div v-if="user.profile && !isAdminAccount" class="flex flex-wrap items-center gap-2.5">
              <AdminBadge v-if="kycBadge" :tone="kycBadge.tone">{{ kycBadge.label }}</AdminBadge>
              <p class="m-0 text-[13.5px] text-[var(--text-secondary)]">{{ kycSummary }}</p>
            </div>
            <p v-if="user.profile?.kyc_status === 'rejected' && user.profile.kyc_rejection_reason" class="mb-0 mt-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-fg-deep [overflow-wrap:anywhere]">
              <strong>Motif du refus :</strong> {{ user.profile.kyc_rejection_reason }}
            </p>

            <div v-if="user.kyb" class="mt-4 border-t border-sand-200 pt-4">
              <div class="flex flex-wrap items-center gap-2.5">
                <p class="m-0 text-sm font-bold">Entreprise ({{ user.kyb.profile_type === 'agency' ? 'agence' : 'propriétaire' }})</p>
                <AdminBadge v-if="user.kyb.status" :tone="KYB_STATUS[user.kyb.status]?.tone ?? 'neutral'">{{ KYB_STATUS[user.kyb.status]?.label ?? user.kyb.status }}</AdminBadge>
              </div>
              <p v-if="kybHasData" class="mb-0 mt-1 text-[13px] text-[var(--text-muted)] [overflow-wrap:anywhere]">
                {{ user.kyb.company || 'Raison sociale non renseignée' }}<template v-if="user.kyb.ifu"> · IFU <span class="font-mono">{{ user.kyb.ifu }}</span></template><template v-if="user.kyb.rccm"> · RCCM <span class="font-mono">{{ user.kyb.rccm }}</span></template>
              </p>
              <p v-else class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">Aucune information d'entreprise déposée.</p>
              <p v-if="user.kyb.status === 'rejected' && user.kyb.rejection_reason" class="mb-0 mt-2 text-[13px] text-danger-fg [overflow-wrap:anywhere]">Motif du refus : {{ user.kyb.rejection_reason }}</p>
            </div>
          </section>

          <!-- Transactions -->
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <div class="mb-2 flex items-baseline justify-between gap-3">
              <h2 class="m-0 text-[15px] font-bold">Transactions</h2>
              <span v-if="txState === 'ready' && txTotal" class="text-xs text-[var(--text-faint)]"><span class="font-mono">{{ transactions.length }}</span> sur <span class="font-mono">{{ txTotal }}</span></span>
            </div>
            <div v-if="txState === 'loading'" class="flex flex-col gap-2.5 py-1">
              <DataSkeletonCard v-for="i in 3" :key="i" :height="44" :lines="0" />
            </div>
            <p v-else-if="txState === 'error'" class="m-0 py-2 text-[13px] font-semibold text-danger-fg">
              Impossible de charger les transactions.
              <button type="button" class="ml-1 font-bold underline" @click="loadTransactions()">Réessayer</button>
            </p>
            <p v-else-if="!transactions.length" class="m-0 py-3 text-[13px] text-[var(--text-muted)]">Aucune transaction sur ce compte.</p>
            <template v-else>
              <div v-for="t in transactions" :key="t.id" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-sm font-bold">{{ transactionTypeLabel(t.type) }}</p>
                  <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">
                    <span class="font-mono">{{ formatDateTime(t.created_at) }}</span><template v-if="t.payment_method"> · {{ paymentMethodLabel(t.payment_method) }}</template>
                  </p>
                </div>
                <div class="flex flex-none flex-col items-end gap-1">
                  <span class="font-mono text-sm font-bold">{{ formatPrix(Number(t.amount)) }}</span>
                  <AdminBadge :tone="txStatus(t.status).tone">{{ txStatus(t.status).label }}</AdminBadge>
                </div>
              </div>
              <div v-if="transactions.length < txTotal" class="pt-3">
                <AdminButton size="sm" variant="secondary" :loading="txLoadingMore" @click="loadTransactions(true)">Afficher plus</AdminButton>
                <span v-if="txMoreError" class="ml-2 text-[13px] font-semibold text-danger-fg">Le chargement a échoué.</span>
              </div>
            </template>
          </section>

          <!-- Rôle et accès administrateur -->
          <section v-if="hasPermission('manage:rbac')" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <h2 class="m-0 text-[15px] font-bold">Rôle et accès administrateur</h2>
            <p class="mb-0 mt-1 text-[13.5px] text-[var(--text-secondary)]">
              <template v-if="isAdminAccount">
                Administrateur<template v-if="user.admin_level != null"> de niveau <span class="font-mono font-bold">{{ user.admin_level }}</span><template v-if="adminLevelDef"> · {{ adminLevelDef.name }}</template></template>.
              </template>
              <template v-else>Rôle principal : {{ ADMIN_ROLE_LABELS[user.role] ?? user.role }}. Ce compte n'a pas accès à l'espace admin.</template>
            </p>

            <p v-if="flash?.area === 'access'" class="mb-0 mt-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash.text }}</p>

            <p v-if="isSelf" class="mb-0 mt-3 text-[13px] text-[var(--text-muted)]">Vous ne pouvez pas modifier votre propre rôle ni votre niveau.</p>

            <div v-else class="mt-4 border-t border-sand-200 pt-4">
              <AdminInlineConfirm
                v-if="panel === 'level'"
                tone="warning"
                :message="levelMessage"
                confirm-label="Enregistrer"
                cancel-label="Annuler"
                :loading="busy"
                :disabled="!levelValid || !levelChanged"
                @confirm="submitLevel"
                @cancel="closePanel"
              >
                <div class="flex flex-wrap gap-2">
                  <select v-model="levelForm.role" aria-label="Rôle" class="h-10 min-w-[160px] flex-1 cursor-pointer rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] outline-none">
                    <option v-for="r in UPDATABLE_ROLES" :key="r" :value="r">{{ ADMIN_ROLE_LABELS[r] }}</option>
                  </select>
                  <select v-if="levelForm.role === 'admin'" v-model="levelForm.adminLevel" aria-label="Niveau d'accès" class="h-10 min-w-[180px] flex-1 cursor-pointer rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] outline-none">
                    <option value="" disabled>Choisir un niveau</option>
                    <option v-for="l in levelOptions" :key="l.level" :value="l.level">Niveau {{ l.level }} · {{ l.name }}</option>
                  </select>
                </div>
              </AdminInlineConfirm>

              <AdminInlineConfirm
                v-else-if="panel === 'rbac'"
                tone="warning"
                :message="rbacRoleName ? `Assigner le rôle RBAC « ${rbacRoleName} » ? Il remplace le rôle RBAC actuel du compte, s'il en a un.` : 'Choisissez le rôle RBAC à assigner et indiquez le motif.'"
                confirm-label="Assigner"
                cancel-label="Annuler"
                :loading="busy"
                :disabled="!rbacForm.roleId || !rbacForm.reason.trim()"
                @confirm="submitRbac"
                @cancel="closePanel"
              >
                <p v-if="rbacState === 'loading'" class="m-0 text-[13px] text-[var(--text-muted)]">Chargement des rôles…</p>
                <p v-else-if="rbacState === 'error'" class="m-0 text-[13px] font-semibold text-danger-fg">Impossible de charger les rôles RBAC.</p>
                <p v-else-if="!rbacRoles.length" class="m-0 text-[13px] text-[var(--text-muted)]">Aucun rôle RBAC défini. Créez-en un dans <NuxtLink to="/admin/rbac" class="font-bold underline">Rôles &amp; accès</NuxtLink>.</p>
                <template v-else>
                  <select v-model="rbacForm.roleId" aria-label="Rôle RBAC" class="h-10 w-full cursor-pointer rounded-sm border border-[var(--border-default)] bg-white px-2.5 text-[13px] outline-none">
                    <option value="" disabled>Choisir un rôle</option>
                    <option v-for="r in rbacRoles" :key="r.id" :value="r.id">{{ r.name }}</option>
                  </select>
                  <textarea v-model="rbacForm.reason" rows="2" maxlength="300" placeholder="Motif (inscrit au journal d'audit)" class="mt-2 w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none" />
                </template>
              </AdminInlineConfirm>

              <div v-else class="flex flex-wrap gap-2">
                <AdminButton size="sm" variant="secondary" @click="openLevel">{{ isAdminAccount ? 'Modifier le rôle ou le niveau' : 'Modifier le rôle' }}</AdminButton>
                <AdminButton v-if="isAdminAccount" size="sm" variant="secondary" @click="openRbac">Assigner un rôle RBAC</AdminButton>
              </div>

              <p v-if="actionError?.area === 'access'" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
            </div>
          </section>
        </div>

        <!-- Panneau d'actions -->
        <aside class="flex flex-col gap-4.5 self-start lg:sticky lg:top-[94px]">
          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
            <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Statut du compte</p>
            <div class="mt-2.5 flex items-center gap-2">
              <AdminBadge v-if="statusBadge" :tone="statusBadge.tone">{{ statusBadge.label }}</AdminBadge>
            </div>
            <p class="mb-0 mt-2 text-[13px] leading-[1.55] text-[var(--text-muted)]">{{ STATUS_HELP[user.status] }}</p>

            <p v-if="flash?.area === 'status'" class="mb-0 mt-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ flash.text }}</p>

            <p v-if="isSelf" class="mb-0 mt-4 border-t border-sand-200 pt-4 text-[13px] text-[var(--text-muted)]">C'est votre compte : son statut ne se change pas d'ici.</p>
            <p v-else-if="!hasPermission('manage:users')" class="mb-0 mt-4 border-t border-sand-200 pt-4 text-[13px] text-[var(--text-muted)]">Votre niveau d'accès ne permet pas de changer le statut des comptes.</p>

            <div v-else class="mt-4 border-t border-sand-200 pt-4">
              <AdminInlineConfirm
                v-if="statusPanel"
                :tone="STATUS_CONFIRM[statusPanel].tone"
                :message="statusMessage"
                :confirm-label="STATUS_CONFIRM[statusPanel].label"
                cancel-label="Annuler"
                :loading="busy"
                :disabled="!reason.trim()"
                @confirm="submitStatus"
                @cancel="closePanel"
              >
                <div class="mb-2 flex flex-wrap gap-1.5">
                  <button
                    v-for="r in STATUS_CONFIRM[statusPanel].reasons"
                    :key="r"
                    type="button"
                    class="rounded-pill border bg-white px-3 py-1 text-[12px] font-semibold"
                    :class="reason === r ? 'border-green-600 text-green-800' : 'border-[var(--border-default)] text-[var(--text-secondary)]'"
                    @click="pickReason(r)"
                  >{{ r }}</button>
                </div>
                <textarea
                  ref="reasonInput"
                  v-model="reason"
                  rows="3"
                  maxlength="500"
                  placeholder="Motif obligatoire (envoyé avec la notification et inscrit au journal d'audit)"
                  class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none"
                />
              </AdminInlineConfirm>

              <div v-else class="flex flex-col gap-2">
                <AdminButton
                  v-for="a in STATUS_ACTIONS[user.status] ?? []"
                  :key="a.to"
                  :variant="a.variant"
                  full-width
                  @click="openStatus(a.to)"
                >{{ a.label }}</AdminButton>
              </div>

              <p v-if="actionError?.area === 'status'" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError.message }}</p>
            </div>
          </section>

          <section class="rounded-2xl border border-[var(--border-subtle)] bg-white px-5 py-4.5">
            <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Raccourcis</p>
            <div class="mt-1">
              <NuxtLink v-if="kycLink" :to="kycLink" class="flex items-center gap-2.5 border-b border-sand-200 py-3 text-[13.5px] font-bold last:border-b-0 hover:text-green-700">
                <ShieldCheck class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
                <span class="flex-1">Dossier KYC</span>
                <ArrowUpRight class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
              </NuxtLink>
              <a v-if="user.email" :href="`mailto:${user.email}`" class="flex items-center gap-2.5 border-b border-sand-200 py-3 text-[13.5px] font-bold last:border-b-0 hover:text-green-700">
                <Mail class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
                <span class="min-w-0 flex-1 truncate">Écrire à {{ user.email }}</span>
              </a>
              <a v-if="user.phone_number" :href="`tel:${user.phone_number}`" class="flex items-center gap-2.5 border-b border-sand-200 py-3 text-[13.5px] font-bold last:border-b-0 hover:text-green-700">
                <Phone class="h-4 w-4 flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
                <span class="flex-1">Appeler le <span class="font-mono">{{ user.phone_number }}</span></span>
              </a>
              <p v-if="!kycLink && !user.email && !user.phone_number" class="m-0 py-3 text-[13px] text-[var(--text-muted)]">Aucun moyen de contact renseigné.</p>
            </div>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>
