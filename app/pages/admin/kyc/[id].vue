<script setup lang="ts">
/**
 * Dossier KYC : la pièce d'identité en grand et les informations à comparer à gauche, la décision
 * à droite. Après « Valider » ou « Refuser », la page ouvre le dossier en attente suivant ; quand
 * la file est vide, elle revient à la file.
 */
import { ArrowRight, ExternalLink, FileText, IdCard, ImageOff, Maximize2 } from '@lucide/vue'
import { fetchSubmittedKycQueue, nextKycDossier, useKycDocuments, userRolesLabel, type KybProfileType, type KybStatus, type KycStatus, type UserDetailResponse } from '~/composables/useUsers'
import { KYC_DOCUMENT_TYPE_LABELS, type KycDocument } from '~/types/kyc'

definePageMeta({ layout: 'admin', middleware: 'require-admin', requiredPermission: 'manage:kyc' })

const route = useRoute()
const id = String(route.params.id)
const { fetchUserDetail, fetchUsers, reviewKyc, reviewKyb, fetchIdCardBlob } = useUsers()
const { fetchUserDocuments, fetchDocumentBlob } = useKycDocuments()
const { refresh: refreshCounts } = useAdminCounts()
const { hasPermission } = useAdminAuth()

/** Bandeau de la décision précédente, transmis au dossier suivant (la page est remontée à chaque id). */
const carriedFlash = useState('admin-kyc-flash', () => '')
const flash = ref(carriedFlash.value)
carriedFlash.value = ''

/* ---------- Dossier ---------- */
const detail = ref<UserDetailResponse | null>(null)
const state = ref<'loading' | 'ready' | 'error' | 'missing'>('loading')

async function load() {
  state.value = 'loading'
  try {
    detail.value = await fetchUserDetail(id)
    state.value = 'ready'
    if (detail.value.user.has_id_card) loadIdCard()
  } catch (e) {
    const status = (e as { status?: number | null }).status
    state.value = status === 404 || status === 400 ? 'missing' : 'error'
  }
}

/** Relecture sans repasser par le squelette (après une décision). */
async function reload() {
  try {
    detail.value = await fetchUserDetail(id)
  } catch { /* on garde la version affichée */ }
}

const user = computed(() => detail.value?.user ?? null)
const kycStatus = computed<KycStatus>(() => user.value?.profile?.kyc_status ?? 'pending')
const name = computed(() => user.value ? personName(user.value.first_name, user.value.last_name) : '')
const displayName = computed(() => name.value || user.value?.email || '')

const STATUS_BADGE: Record<KycStatus, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'À vérifier', tone: 'warning' },
  verified: { label: 'Vérifié', tone: 'success' },
  rejected: { label: 'Refusé', tone: 'danger' }
}

function formatDay(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}

const facts = computed(() => {
  const u = user.value
  if (!u) return []
  return [
    { label: 'Téléphone', value: u.phone_number, mono: true },
    { label: 'E-mail', value: u.email, mono: false },
    { label: 'Rôles', value: userRolesLabel(u), mono: false },
    { label: 'Profil', value: u.is_profile_complete == null ? '' : u.is_profile_complete ? 'Complet' : 'Incomplet', mono: false },
    { label: 'Inscrit le', value: formatDay(u.created_at), mono: false },
    { label: 'Dossier soumis le', value: formatDay(u.profile?.kyc_submitted_at), mono: false }
  ]
})
/** Motif d'un refus antérieur, quand le compte a redéposé une pièce. */
const previousRejection = computed(() => kycStatus.value === 'pending' ? user.value?.profile?.kyc_rejection_reason ?? '' : '')
const backTo = computed(() => kycStatus.value === 'pending' ? '/admin/kyc' : `/admin/kyc?status=${kycStatus.value}`)

/* ---------- Pièce d'identité (blob protégé) ---------- */
const cardState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const cardUrl = ref<string | null>(null)
const cardIsImage = ref(true)
const cardBroken = ref(false)
const cardImg = ref<HTMLImageElement | null>(null)

async function loadIdCard() {
  cardState.value = 'loading'
  cardBroken.value = false
  try {
    const blob = await fetchIdCardBlob(id)
    if (cardUrl.value) URL.revokeObjectURL(cardUrl.value)
    cardUrl.value = URL.createObjectURL(blob)
    cardIsImage.value = blob.type.startsWith('image/')
    cardState.value = 'ready'
  } catch {
    cardState.value = 'error'
  }
}

/** Plein écran natif ; à défaut (iPhone), un nouvel onglet. */
function openCardFullscreen() {
  const el = cardImg.value
  if (el?.requestFullscreen) el.requestFullscreen().catch(openCardInTab)
  else openCardInTab()
}
function openCardInTab() {
  if (cardUrl.value) window.open(cardUrl.value, '_blank')
}

/* ---------- Justificatifs (bulletins, RCCM…) ---------- */
const docs = ref<KycDocument[]>([])
const docsState = ref<'loading' | 'ready' | 'error' | 'hidden'>('loading')
const docUrls = new Map<string, string>()
const openingDoc = ref<string | null>(null)
const docError = ref('')

async function loadDocs() {
  try {
    docs.value = await fetchUserDocuments(id)
    docsState.value = 'ready'
  } catch (e) {
    // Sans la permission `view:users`, l'API répond 403 : la section disparaît simplement.
    docsState.value = (e as { status?: number | null }).status === 403 ? 'hidden' : 'error'
  }
}

/** L'onglet est ouvert tout de suite (sinon le navigateur bloque la fenêtre), puis rempli. */
async function openDoc(doc: KycDocument) {
  docError.value = ''
  const cached = docUrls.get(doc.id)
  if (cached) {
    window.open(cached, '_blank')
    return
  }
  const tab = window.open('', '_blank')
  openingDoc.value = doc.id
  try {
    const url = URL.createObjectURL(await fetchDocumentBlob(doc.id))
    docUrls.set(doc.id, url)
    if (tab) tab.location.href = url
    else window.open(url, '_blank')
  } catch {
    tab?.close()
    docError.value = 'Ce justificatif n\'a pas pu être ouvert. Réessayez.'
  } finally {
    openingDoc.value = null
  }
}

onBeforeUnmount(() => {
  if (cardUrl.value) URL.revokeObjectURL(cardUrl.value)
  docUrls.forEach(url => URL.revokeObjectURL(url))
})

/* ---------- File d'attente (dossiers réellement déposés, comme la liste) ---------- */
const queue = ref<{ ids: string[]; total: number } | null>(null)
/** File transmise par la liste ou par le dossier précédent : évite de relire jusqu'à 10 pages. */
const carriedQueue = useState<string[] | null>('admin-kyc-queue', () => null)

async function loadQueue() {
  const res = await fetchSubmittedKycQueue(fetchUsers)
  const ids = res.dossiers.map(u => u.id)
  queue.value = { ids, total: ids.length }
  return queue.value
}

const position = computed(() => queue.value ? queue.value.ids.indexOf(id) : -1)
/** « Suivant » sans décider : le dossier d'après dans la file, en boucle. */
const skipTo = computed(() => {
  const ids = queue.value?.ids ?? []
  if (!ids.some(x => x !== id)) return null
  return position.value >= 0 ? ids[(position.value + 1) % ids.length] : ids.find(x => x !== id)
})

onMounted(() => {
  load()
  loadDocs()
  if (carriedQueue.value) {
    queue.value = { ids: carriedQueue.value, total: carriedQueue.value.length }
    carriedQueue.value = null
  } else {
    loadQueue().catch(() => { /* sans file, pas de « Dossier n sur N » */ })
  }
})

/* ---------- Décision KYC ---------- */
type Confirming = 'approve' | 'reject' | 'kyb-reject' | null
const confirming = ref<Confirming>(null)
const busy = ref<'kyc' | 'kyb' | null>(null)
const reason = ref('')
const actionError = ref('')
const queueLost = ref(false)

function openConfirm(kind: Confirming) {
  confirming.value = kind
  actionError.value = ''
  kybError.value = ''
}

const rejectReasons = computed(() => [
  ...(user.value?.has_id_card ? [] : ['Aucune pièce d\'identité déposée']),
  'Pièce illisible ou floue',
  'Pièce expirée',
  'Nom différent de celui du profil',
  'Type de document non accepté',
  'Recto ou verso manquant'
])

/** Une puce complète le motif sans effacer ce qui est déjà écrit. */
function withReason(current: string, text: string) {
  const trimmed = current.trim()
  if (trimmed.includes(text)) return current
  return trimmed ? `${trimmed.replace(/[.;,\s]+$/, '')}. ${text}` : text
}

async function decide(action: 'approve' | 'reject') {
  const u = user.value
  const motive = reason.value.trim()
  if (!u || (action === 'reject' && !motive)) return
  busy.value = 'kyc'
  actionError.value = ''
  const previousIndex = position.value
  try {
    await reviewKyc(u.id, action, action === 'reject' ? motive : undefined)
  } catch (e) {
    actionError.value = (e instanceof Error && e.message) || 'La décision n\'a pas été enregistrée. Réessayez.'
    busy.value = null
    return
  }
  refreshCounts()
  confirming.value = null
  reason.value = ''
  const done = action === 'approve'
    ? `Identité de ${displayName.value} validée : le dossier passe en « Vérifié ».`
    : `Dossier de ${displayName.value} refusé. Motif enregistré : « ${motive} ».`

  // L'entreprise de ce compte attend aussi une décision : on reste sur la fiche.
  if (kybAwaiting.value) {
    flash.value = `${done} Il reste la vérification de l'entreprise, plus bas.`
    await Promise.allSettled([reload(), loadQueue()])
    busy.value = null
    return
  }

  let next: string | null = null
  try {
    next = nextKycDossier((await loadQueue()).ids, u.id, previousIndex)
  } catch {
    queueLost.value = true
  }
  if (next) {
    carriedFlash.value = done
    carriedQueue.value = queue.value?.ids ?? null
    await navigateTo(`/admin/kyc/${next}`)
    return
  }
  if (!queueLost.value) {
    carriedFlash.value = `${done} File à jour : plus aucun dossier en attente.`
    await navigateTo('/admin/kyc')
    return
  }
  // File illisible : on reste sur le dossier traité, mis à jour.
  flash.value = done
  await reload()
  busy.value = null
}

/* ---------- Entreprise (KYB) ---------- */
const KYB_PROFILE_LABEL: Record<KybProfileType, string> = { landlord: 'propriétaire', agency: 'agence' }
const KYB_BADGE: Record<KybStatus, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'À vérifier', tone: 'warning' },
  approved: { label: 'Approuvée', tone: 'success' },
  rejected: { label: 'Refusée', tone: 'danger' }
}
const KYB_REASONS = ['IFU invalide ou introuvable', 'RCCM invalide ou illisible', 'Raison sociale différente des justificatifs', 'Justificatif RCCM manquant']

const kyb = computed(() => user.value?.kyb ?? null)
const kybHasData = computed(() => !!(kyb.value && (kyb.value.company || kyb.value.ifu || kyb.value.rccm)))
const canReviewKyb = computed(() => hasPermission('manage:kyb') && kybHasData.value && kyb.value?.status !== 'approved')
const kybAwaiting = computed(() => canReviewKyb.value && (kyb.value?.status ?? 'pending') === 'pending')
const kybReason = ref('')
const kybError = ref('')
const kybFlash = ref('')

async function decideKyb(action: 'approve' | 'reject') {
  const u = user.value
  const k = kyb.value
  const motive = kybReason.value.trim()
  if (!u || !k || (action === 'reject' && !motive)) return
  busy.value = 'kyb'
  kybError.value = ''
  kybFlash.value = ''
  try {
    await reviewKyb(u.id, k.profile_type, action, action === 'reject' ? motive : undefined)
    confirming.value = null
    kybReason.value = ''
    kybFlash.value = action === 'approve'
      ? `Entreprise${k.company ? ` « ${k.company} »` : ''} approuvée.`
      : `Vérification de l'entreprise refusée. Motif enregistré : « ${motive} ».`
    await reload()
  } catch (e) {
    kybError.value = (e instanceof Error && e.message) || 'La décision n\'a pas été enregistrée. Réessayez.'
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <NuxtLink :to="backTo" class="inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700">← Vérifications KYC</NuxtLink>
      <div v-if="state === 'ready' && queue && (position >= 0 || skipTo)" class="flex items-center gap-2.5">
        <span class="text-[13px] font-bold text-[var(--text-secondary)]">
          <template v-if="position >= 0">Dossier <span class="font-mono">{{ position + 1 }}</span> sur <span class="font-mono">{{ queue.total }}</span></template>
          <template v-else><span class="font-mono">{{ queue.total }}</span> en attente</template>
        </span>
        <NuxtLink v-if="skipTo" :to="`/admin/kyc/${skipTo}`" @click="carriedQueue = queue?.ids ?? null" class="inline-flex h-9 items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 text-[13px] font-bold text-sand-900 hover:bg-sand-50">
          Suivant <ArrowRight class="h-4 w-4" :stroke-width="1.9" />
        </NuxtLink>
      </div>
    </div>

    <p v-if="flash" class="mb-4 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">
      {{ flash }}
      <NuxtLink v-if="queueLost" to="/admin/kyc" class="ml-1 font-bold underline">Retour à la file</NuxtLink>
    </p>

    <div v-if="state === 'loading'" class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="flex flex-col gap-4.5">
        <DataSkeletonCard :height="380" :lines="0" />
        <DataSkeletonCard :height="180" :lines="0" />
      </div>
      <DataSkeletonCard :height="240" :lines="0" />
    </div>

    <FeedbackAlertBanner v-else-if="state === 'error'" tone="danger">
      Impossible de charger ce dossier pour le moment.
      <button type="button" class="ml-2 font-bold underline" @click="load">Réessayer</button>
    </FeedbackAlertBanner>

    <p v-else-if="state === 'missing' || !user" class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">
      Ce dossier est introuvable : le compte a peut-être été supprimé.
      <NuxtLink to="/admin/kyc" class="ml-1 font-bold text-green-700">Retour à la file</NuxtLink>
    </p>

    <div v-else class="grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="flex min-w-0 flex-col gap-4.5">
        <!-- Pièce d'identité -->
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="mb-3.5 flex items-baseline justify-between gap-3">
            <h2 class="m-0 text-[15px] font-bold">Pièce d'identité</h2>
            <a v-if="cardUrl" :href="cardUrl" target="_blank" class="inline-flex items-center gap-1 text-[12.5px] font-bold text-green-700">
              Nouvel onglet <ExternalLink class="h-3.5 w-3.5" :stroke-width="1.9" />
            </a>
          </div>

          <div v-if="!user.has_id_card" class="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-[var(--border-default)] px-4 py-12 text-center text-[13.5px] text-[var(--text-muted)]">
            <IdCard class="h-7 w-7 text-[var(--text-faint)]" :stroke-width="1.9" />
            Aucune pièce d'identité déposée sur ce compte.
          </div>
          <DataSkeletonCard v-else-if="cardState === 'loading' || cardState === 'idle'" :height="380" :lines="0" />
          <div v-else-if="cardState === 'error'" class="flex flex-col items-center gap-2.5 rounded-xl border border-danger-border bg-danger-bg px-4 py-10 text-center text-[13.5px] font-semibold text-danger-fg">
            <ImageOff class="h-6 w-6" :stroke-width="1.9" />
            La pièce n'a pas pu être chargée.
            <button type="button" class="font-bold underline" @click="loadIdCard">Réessayer</button>
          </div>
          <button
            v-else-if="cardIsImage && !cardBroken"
            type="button"
            class="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl bg-sand-100"
            aria-label="Afficher la pièce d'identité en plein écran"
            @click="openCardFullscreen"
          >
            <img ref="cardImg" :src="cardUrl ?? undefined" alt="Pièce d'identité" class="mx-auto block max-h-[70vh] w-auto max-w-full object-contain" @error="cardBroken = true">
            <span class="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-pill bg-white/90 px-3 py-1.5 text-xs font-bold text-sand-900 shadow-card">
              <Maximize2 class="h-3.5 w-3.5" :stroke-width="1.9" /> Plein écran
            </span>
          </button>
          <a v-else :href="cardUrl ?? undefined" target="_blank" class="flex items-center gap-3 rounded-xl border border-[var(--border-default)] px-4 py-4 text-sm font-bold text-sand-900 hover:bg-sand-50">
            <FileText class="h-5 w-5 flex-none text-green-700" :stroke-width="1.9" />
            {{ cardIsImage ? 'Image impossible à afficher ici : l\'ouvrir dans un nouvel onglet' : 'Pièce au format PDF : l\'ouvrir dans un nouvel onglet' }}
          </a>
        </section>

        <!-- Informations à comparer -->
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <h2 class="m-0 text-[15px] font-bold">Informations à comparer</h2>
          <p class="mb-4 mt-1 text-[12.5px] text-[var(--text-muted)]">Saisies par l'utilisateur sur son profil : elles doivent correspondre à la pièce.</p>
          <div class="flex items-center gap-3.5 border-b border-sand-200 pb-4">
            <CoreAvatar :name="displayName" :size="56" :avatar-url="user.avatar_url" />
            <div class="min-w-0">
              <p class="m-0 text-base font-bold" :class="name ? '' : 'font-normal text-[var(--text-faint)]'">{{ name || 'Nom non renseigné' }}</p>
              <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">{{ user.avatar_url ? 'Photo de profil, à comparer avec celle de la pièce' : 'Pas de photo de profil' }}</p>
            </div>
          </div>
          <dl class="m-0 mt-4 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
            <div v-for="f in facts" :key="f.label" class="min-w-0">
              <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ f.label }}</dt>
              <dd class="m-0 mt-1 truncate text-sm" :class="[f.value ? 'font-bold' : 'text-[var(--text-faint)]', f.mono && f.value ? 'font-mono' : '']">{{ f.value || 'Non renseigné' }}</dd>
            </div>
          </dl>
          <p v-if="previousRejection" class="mb-0 mt-4 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-fg-deep [overflow-wrap:anywhere]">
            <strong>Refus précédent :</strong> « {{ previousRejection }} »
          </p>
        </section>

        <!-- Justificatifs -->
        <section v-if="(docsState === 'ready' && docs.length) || docsState === 'error'" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <h2 class="m-0 mb-1 text-[15px] font-bold">Justificatifs déposés</h2>
          <p v-if="docsState === 'error'" class="m-0 mt-2 text-[13px] text-[var(--text-muted)]">
            Les justificatifs n'ont pas pu être chargés.
            <button type="button" class="ml-1 font-bold underline" @click="docsState = 'loading'; loadDocs()">Réessayer</button>
          </p>
          <div v-for="d in docs" :key="d.id" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
            <div class="grid h-9 w-9 flex-none place-items-center rounded-md bg-sand-200 text-[var(--text-secondary)]"><FileText class="h-4 w-4" :stroke-width="1.9" /></div>
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold">{{ KYC_DOCUMENT_TYPE_LABELS[d.document_type] ?? d.document_type }}</p>
              <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Déposé le {{ formatDay(d.created_at) }}</p>
            </div>
            <AdminButton size="sm" variant="secondary" :loading="openingDoc === d.id" @click="openDoc(d)">Ouvrir</AdminButton>
          </div>
          <p v-if="docError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ docError }}</p>
        </section>

        <!-- Entreprise (KYB) -->
        <section v-if="kyb" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            <h2 class="m-0 text-[15px] font-bold">Entreprise ({{ KYB_PROFILE_LABEL[kyb.profile_type] }})</h2>
            <AdminBadge v-if="kybHasData" :tone="KYB_BADGE[kyb.status ?? 'pending'].tone">{{ KYB_BADGE[kyb.status ?? 'pending'].label }}</AdminBadge>
          </div>
          <dl v-if="kybHasData" class="m-0 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-3">
            <div class="min-w-0">
              <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Raison sociale</dt>
              <dd class="m-0 mt-1 text-sm" :class="kyb.company ? 'font-bold' : 'text-[var(--text-faint)]'">{{ kyb.company || 'Non renseignée' }}</dd>
            </div>
            <div class="min-w-0">
              <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">IFU</dt>
              <dd class="m-0 mt-1 truncate text-sm" :class="kyb.ifu ? 'font-mono font-bold' : 'text-[var(--text-faint)]'">{{ kyb.ifu || 'Non renseigné' }}</dd>
            </div>
            <div class="min-w-0">
              <dt class="text-label font-bold uppercase tracking-label text-[var(--text-faint)]">RCCM</dt>
              <dd class="m-0 mt-1 truncate text-sm" :class="kyb.rccm ? 'font-mono font-bold' : 'text-[var(--text-faint)]'">{{ kyb.rccm || 'Non renseigné' }}</dd>
            </div>
          </dl>
          <p v-else class="m-0 text-[13px] text-[var(--text-muted)]">Aucune information d'entreprise déposée pour l'instant.</p>

          <p v-if="kyb.reviewed_at" class="mb-0 mt-3.5 text-xs text-[var(--text-faint)]">Revue le {{ formatDay(kyb.reviewed_at) }}</p>
          <p v-if="kyb.rejection_reason" class="mb-0 mt-2.5 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-fg-deep [overflow-wrap:anywhere]">
            <strong>{{ kyb.status === 'rejected' ? 'Motif du refus' : 'Refus précédent' }} :</strong> « {{ kyb.rejection_reason }} »
          </p>
          <p v-if="kybFlash" class="mb-0 mt-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ kybFlash }}</p>

          <div v-if="canReviewKyb" class="mt-4 border-t border-sand-200 pt-4">
            <AdminInlineConfirm
              v-if="confirming === 'kyb-reject'"
              tone="danger"
              message="Refuser la vérification de l'entreprise ? Le motif est enregistré sur le dossier."
              confirm-label="Refuser"
              cancel-label="Annuler"
              :loading="busy === 'kyb'"
              :disabled="!kybReason.trim()"
              @confirm="decideKyb('reject')"
              @cancel="confirming = null"
            >
              <div class="mb-2 flex flex-wrap gap-1.5">
                <button v-for="r in KYB_REASONS" :key="r" type="button" class="rounded-pill border border-danger-border bg-white px-3 py-1 text-[12px] font-semibold text-sand-900" @click="kybReason = withReason(kybReason, r)">{{ r }}</button>
              </div>
              <textarea v-model="kybReason" rows="2" maxlength="500" placeholder="Motif du refus (obligatoire)" class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none focus:border-green-600" />
            </AdminInlineConfirm>
            <div v-else class="flex flex-wrap gap-2">
              <AdminButton variant="secondary" :loading="busy === 'kyb'" :disabled="busy === 'kyc'" @click="decideKyb('approve')">Approuver l'entreprise</AdminButton>
              <AdminButton variant="ghost" :disabled="!!busy" @click="openConfirm('kyb-reject')">Refuser…</AdminButton>
            </div>
            <p v-if="kybError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ kybError }}</p>
          </div>
        </section>
      </div>

      <!-- Décision -->
      <aside class="self-start rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 lg:sticky lg:top-[94px]">
        <div class="flex items-center gap-3">
          <CoreAvatar :name="displayName" :size="44" :avatar-url="user.avatar_url" />
          <div class="min-w-0 flex-1">
            <p class="m-0 truncate text-[15px] font-bold">{{ displayName }}</p>
            <p class="mb-0 mt-0.5 truncate text-xs text-[var(--text-faint)]">{{ userRolesLabel(user) }}</p>
          </div>
        </div>
        <div class="mt-3.5 flex items-center justify-between gap-3">
          <AdminBadge :tone="STATUS_BADGE[kycStatus].tone">{{ STATUS_BADGE[kycStatus].label }}</AdminBadge>
          <NuxtLink :to="`/admin/utilisateurs/${user.id}`" class="inline-flex items-center gap-1 text-[12.5px] font-bold text-green-700">
            Fiche du compte <ArrowRight class="h-3.5 w-3.5" :stroke-width="1.9" />
          </NuxtLink>
        </div>

        <div class="mt-4 border-t border-sand-200 pt-4">
          <template v-if="kycStatus === 'pending'">
            <p class="mb-3 mt-0 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">La pièce doit être lisible, en cours de validité et au nom inscrit sur le profil.</p>

            <AdminInlineConfirm
              v-if="confirming === 'reject'"
              tone="danger"
              message="Refuser ce dossier ? Le compte reste non vérifié ; le motif est enregistré sur le dossier et dans le journal d'audit."
              confirm-label="Refuser le dossier"
              cancel-label="Annuler"
              :loading="busy === 'kyc'"
              :disabled="!reason.trim()"
              @confirm="decide('reject')"
              @cancel="confirming = null"
            >
              <div class="mb-2 flex flex-wrap gap-1.5">
                <button v-for="r in rejectReasons" :key="r" type="button" class="rounded-pill border border-danger-border bg-white px-3 py-1 text-[12px] font-semibold text-sand-900" @click="reason = withReason(reason, r)">{{ r }}</button>
              </div>
              <textarea v-model="reason" rows="3" maxlength="500" placeholder="Motif du refus (obligatoire)" class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none focus:border-green-600" />
            </AdminInlineConfirm>
            <AdminInlineConfirm
              v-else-if="confirming === 'approve'"
              message="Aucune pièce d'identité n'a été déposée. Valider quand même ? Le dossier passera en « Vérifié » sans document."
              confirm-label="Valider quand même"
              cancel-label="Annuler"
              :loading="busy === 'kyc'"
              @confirm="decide('approve')"
              @cancel="confirming = null"
            />
            <div v-else class="flex flex-col gap-2">
              <AdminButton full-width :loading="busy === 'kyc'" :disabled="busy === 'kyb'" @click="user.has_id_card ? decide('approve') : openConfirm('approve')">Valider l'identité</AdminButton>
              <AdminButton full-width variant="secondary" :disabled="!!busy" @click="openConfirm('reject')">Refuser…</AdminButton>
            </div>

            <p v-if="actionError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ actionError }}</p>
            <p class="mb-0 mt-3 text-xs leading-[1.5] text-[var(--text-faint)]">
              {{ kybAwaiting ? 'L\'entreprise de ce compte est aussi à vérifier : la page restera ici après votre décision.' : 'Après votre décision, le dossier en attente suivant s\'ouvre.' }}
            </p>
          </template>

          <p v-else-if="kycStatus === 'verified'" class="m-0 text-[13.5px] text-[var(--text-secondary)]">
            Identité validée<template v-if="user.profile?.kyc_reviewed_at"> le {{ formatDay(user.profile.kyc_reviewed_at) }}</template>.
          </p>

          <template v-else>
            <p class="m-0 text-[13.5px] text-[var(--text-secondary)]">Dossier refusé<template v-if="user.profile?.kyc_reviewed_at"> le {{ formatDay(user.profile.kyc_reviewed_at) }}</template>.</p>
            <p v-if="user.profile?.kyc_rejection_reason" class="mb-0 mt-2.5 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-fg-deep [overflow-wrap:anywhere]">
              <strong>Motif :</strong> « {{ user.profile.kyc_rejection_reason }} »
            </p>
          </template>
        </div>
      </aside>
    </div>
  </div>
</template>
