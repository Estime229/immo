<script setup lang="ts">
import type { UserRole } from '~/composables/useAuthRole'
import type { KycDocumentType } from '~/types/kyc'
import { KYC_DOCUMENT_TYPE_LABELS } from '~/types/kyc'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

const role = useAuthRole()
const auth = useAuthApi()
const kyc = useKycApi()
const profileApi = useProfileApi()

/** `useAuthRole()` est un choix local jamais persisté côté API (I1) — pour savoir si ce compte est réellement propriétaire/agence, on lit le vrai rôle renvoyé par /auth/me. */
const isLandlordOrAgency = computed(() => {
  const r = auth.user.value?.role
  return r === 'landlord' || r === 'agent' || r === 'agency'
})

/**
 * Nom complet + (propriétaire/agence) raison sociale/IFU/RCCM — mêmes champs
 * que `locataire/profil.vue`/`pro/profil.vue`, réutilisés ici pour que la
 * vérification les demande directement au lieu de compter sur l'utilisateur
 * pour les retrouver séparément sur une autre page.
 */
const fullName = ref('')
const company = ref('')
const ifu = ref('')
const rccm = ref('')
const savingCoordonnees = ref(false)
const coordonneesError = ref('')
const coordonneesSaved = ref(false)
async function saveCoordonnees() {
  const payload: Record<string, unknown> = {}
  if (fullName.value.trim()) payload.full_name = fullName.value.trim()
  if (isLandlordOrAgency.value) {
    if (company.value.trim()) payload.company = company.value.trim()
    if (ifu.value.trim()) payload.ifu = ifu.value.trim()
    if (rccm.value.trim()) payload.rccm = rccm.value.trim()
  }
  if (Object.keys(payload).length === 0) return true
  savingCoordonnees.value = true
  coordonneesError.value = ''
  try {
    await profileApi.update(payload)
    fullName.value = ''
    company.value = ''
    ifu.value = ''
    rccm.value = ''
    coordonneesSaved.value = true
    return true
  } catch (e) {
    coordonneesError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'enregistrement a échoué.") : "L'enregistrement a échoué."
    return false
  } finally {
    savingCoordonnees.value = false
  }
}

const kycTab = ref<'identite' | 'documents' | 'coordonnees'>('identite')
const KYC_TABS = [
  { key: 'identite', label: 'Identité' },
  { key: 'documents', label: 'Documents' },
  { key: 'coordonnees', label: 'Coordonnées' }
] as const

const ROLE_LABEL: Record<UserRole, string> = {
  locataire: 'profil locataire',
  bailleur: 'profil bailleur',
  artisan: 'profil artisan'
}

/**
 * Pièce d'identité — endpoint distinct de /kyc/documents, un seul fichier
 * (pas de recto/verso séparés côté API, contrairement à la maquette d'origine).
 * Voir useKycApi.uploadIdCard()/idCardDownloadUrl().
 */
const idCardPreview = useProtectedFile()
const idCardState = ref<'loading' | 'missing' | 'present'>('loading')
async function loadIdCard() {
  const userId = auth.user.value?.id
  if (!userId) return
  idCardState.value = 'loading'
  await idCardPreview.load(kyc.idCardDownloadUrl(userId))
  idCardState.value = idCardPreview.objectUrl.value ? 'present' : 'missing'
}
onMounted(loadIdCard)

const idCardUploading = ref(false)
const idCardError = ref('')
async function onIdCardSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  idCardError.value = ''
  idCardUploading.value = true
  try {
    await kyc.uploadIdCard(file)
    await loadIdCard()
  } catch (err) {
    idCardError.value = err instanceof ApiRequestError ? (err.mapped.bannerMessage ?? "Le téléversement a échoué.") : "Le téléversement a échoué."
  } finally {
    idCardUploading.value = false
    input.value = ''
  }
}

/** kyc_status circule à deux endroits selon l'endpoint (voir I3) : ici on ne lit que celui de /auth/me. */
const kycStatusBanner = computed(() => deriveKycStatusBanner(auth.user.value?.profile?.kyc_status))
const BANNER_TONE = {
  ok: 'border-ok-border bg-ok-bg text-green-900',
  warn: 'border-warn-border bg-warn-bg text-warn-fg',
  danger: 'border-danger-border bg-danger-bg text-danger-fg',
  neutral: 'border-[var(--border-subtle)] bg-[var(--surface-page)] text-[var(--text-muted)]'
} as const

const DOCS_INTRO: Record<UserRole, string> = {
  locataire: "Vous pouvez déposer plusieurs documents du même type, par exemple trois bulletins de salaire. Si vous n'êtes pas salarié, l'attestation d'employeur suffit.",
  bailleur: 'En tant que bailleur, joignez un titre de propriété par bien mis en location et votre RCCM si vous publiez en tant qu\'entreprise.',
  artisan: "En tant qu'artisan, joignez votre attestation d'assurance à jour et vos certifications professionnelles."
}

/** Types pertinents par rôle, pour filtrer la liste déroulante de dépôt — l'API elle-même ne segmente pas par rôle. */
const ROLE_DOCUMENT_TYPES: Record<UserRole, KycDocumentType[]> = {
  locataire: ['proof_of_address', 'payslip', 'employment_certificate', 'guarantor_id'],
  bailleur: ['title_deed', 'rccm_certificate', 'proof_of_address'],
  artisan: ['artisan_insurance', 'artisan_certification', 'proof_of_address']
}

const uploadType = ref<KycDocumentType>(ROLE_DOCUMENT_TYPES[role.value][0]!)
watch(role, (r: UserRole) => { uploadType.value = ROLE_DOCUMENT_TYPES[r][0]! })

/* ---- Liste réelle des documents déposés (GET /kyc/documents/mine) ---- */
const docs = ref<Awaited<ReturnType<typeof kyc.listMine>>>([])
const docsLoading = ref(false)
const docsErrored = ref(false)
const docsState = computed(() => deriveFetchState({ loading: docsLoading.value, errored: docsErrored.value, itemCount: docs.value.length }))

async function loadDocs() {
  docsLoading.value = true
  docsErrored.value = false
  try {
    docs.value = await kyc.listMine()
  } catch {
    docsErrored.value = true
  } finally {
    docsLoading.value = false
  }
}
onMounted(loadDocs)

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ---- Dépôt (POST /kyc/documents, multipart/form-data) ---- */
const uploading = ref(false)
const uploadError = ref('')

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadError.value = ''
  uploading.value = true
  try {
    await kyc.upload(file, uploadType.value)
    await loadDocs()
  } catch (err) {
    uploadError.value = err instanceof ApiRequestError ? (err.mapped.bannerMessage ?? 'Le téléversement a échoué.') : 'Le téléversement a échoué.'
  } finally {
    uploading.value = false
    input.value = ''
  }
}

/* ---- Suppression (DELETE /kyc/documents/:id) ---- */
const deletingId = ref<string | null>(null)
async function deleteDoc(id: string) {
  deletingId.value = id
  try {
    await kyc.remove(id)
    docs.value = docs.value.filter(d => d.id !== id)
  } catch (err) {
    uploadError.value = err instanceof ApiRequestError ? (err.mapped.bannerMessage ?? 'La suppression a échoué.') : 'La suppression a échoué.'
  } finally {
    deletingId.value = null
  }
}

/* ---- Aperçu (GET /kyc/documents/:id/download, en blob via le composable de fichier protégé) ---- */
const preview = useProtectedFile()
const previewingId = ref<string | null>(null)
async function previewDoc(id: string) {
  previewingId.value = id
  await preview.load(kyc.downloadUrl(id))
  if (preview.objectUrl.value) {
    window.open(preview.objectUrl.value, '_blank')
  }
  previewingId.value = null
}

const doneOpen = ref(false)
async function finishKyc() {
  const ok = await saveCoordonnees()
  if (ok) doneOpen.value = true
}
const SPACE_ROUTE: Record<UserRole, string> = {
  locataire: '/locataire',
  bailleur: '/pro',
  artisan: '/artisan'
}
const DONE_TEXT: Record<UserRole, string> = {
  locataire: 'Vos justificatifs sont en cours de vérification — généralement sous 24 h. En attendant, vous pouvez déjà parcourir les annonces et préparer vos favoris.',
  bailleur: 'Vos titres de propriété sont en cours de vérification. Dès validation, vous pourrez publier vos biens et recevoir des demandes de location.',
  artisan: "Votre assurance et vos certifications sont en cours de vérification. Une fois validées, elles s'afficheront sur votre vitrine et vous pourrez répondre aux demandes."
}
const DONE_CTA: Record<UserRole, string> = {
  locataire: 'Aller à mon espace locataire',
  bailleur: 'Aller à mon espace pro',
  artisan: 'Aller à mon espace artisan'
}
const NEXT_STEPS: Record<UserRole, string[]> = {
  locataire: ['Vérification de vos documents (sous 24 h)', 'Envoyez une demande ou réservez un logement', 'Signez votre bail et payez en Mobile Money'],
  bailleur: ['Validation de vos titres de propriété', 'Publiez votre premier bien et ses unités', 'Recevez et acceptez des demandes de location'],
  artisan: ['Validation de votre assurance et certifications', 'Complétez votre vitrine et vos zones d\'intervention', 'Répondez aux demandes et faites vos premières offres']
}
function goSpace() {
  doneOpen.value = false
  navigateTo(SPACE_ROUTE[role.value])
}
</script>

<template>
  <div class="mx-auto max-w-[1000px] px-[26px] pb-[70px] pt-[26px]">
    <h1 class="m-0 font-display text-[30px] font-bold tracking-[-.03em]">Vérifier votre compte</h1>
    <div class="mt-3 inline-flex items-center gap-2 rounded-pill border border-green-100 bg-green-50 px-3.5 py-[7px]">
      <span class="h-[7px] w-[7px] rounded-pill bg-green-600" />
      <span class="text-[12.5px] font-bold text-green-800">Parcours adapté à votre {{ ROLE_LABEL[role] }}</span>
    </div>
    <p class="mb-0 mt-2.5 max-w-[640px] text-[15px] text-[var(--text-muted)]">
      Tant que la vérification n'est pas complète, vous pouvez consulter les annonces mais pas réserver, publier un bien ni retirer d'argent.
    </p>

    <div class="mt-[22px] flex items-center gap-3.5 rounded-xl border px-5 py-4" :class="BANNER_TONE[kycStatusBanner.tone]">
      <span class="text-base">{{ kycStatusBanner.icon }}</span>
      <p class="m-0 text-[14.5px] font-semibold">{{ kycStatusBanner.text }}</p>
    </div>

    <div class="my-[18px] flex w-fit gap-[5px] rounded-pill bg-sand-200 p-1">
      <button
        v-for="tab in KYC_TABS"
        :key="tab.key"
        type="button"
        class="rounded-pill px-5 py-2.5 text-[13.5px] font-bold transition-all"
        :class="kycTab === tab.key ? 'bg-white text-green-900 shadow-card' : 'bg-transparent text-[var(--text-secondary)]'"
        @click="kycTab = tab.key"
      >{{ tab.label }}</button>
    </div>

    <template v-if="kycTab === 'identite'">
      <div class="max-w-[420px] rounded-xl border border-[var(--border-subtle)] bg-white p-5">
        <p class="mb-3 mt-0 text-[13.5px] font-bold">Pièce d'identité (CNI, passeport…)</p>

        <div v-if="idCardState === 'loading'" class="flex h-[170px] items-center justify-center rounded-md bg-[var(--surface-page)] text-[13px] text-[var(--text-muted)]">Chargement…</div>
        <img v-else-if="idCardState === 'present'" :src="idCardPreview.objectUrl.value ?? undefined" class="h-[170px] w-full rounded-md border border-[var(--border-subtle)] object-contain bg-[var(--surface-page)]">
        <div v-else class="grid h-[170px] place-items-center rounded-md border-2 border-dashed border-[var(--border-default)] bg-[var(--surface-page)] text-center">
          <p class="m-0 px-4 text-[13px] text-[var(--text-muted)]">Aucune pièce déposée pour l'instant.</p>
        </div>

        <label class="mt-3.5 flex w-full cursor-pointer items-center justify-center rounded-sm border border-[var(--border-default)] bg-white py-[11px] text-[13.5px] font-bold" :class="idCardUploading ? 'cursor-not-allowed opacity-60' : ''">
          {{ idCardUploading ? 'Envoi en cours…' : (idCardState === 'present' ? 'Reprendre la photo' : 'Déposer une photo') }}
          <input type="file" accept="image/*,application/pdf" class="hidden" :disabled="idCardUploading" @change="onIdCardSelected">
        </label>
        <p v-if="idCardError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ idCardError }}</p>
      </div>
    </template>

    <template v-else-if="kycTab === 'documents'">
      <div class="rounded-xl border border-[var(--border-subtle)] bg-white p-6">
        <p class="m-0 text-base font-bold">Justificatifs — {{ ROLE_LABEL[role] }}</p>
        <p class="mb-5 mt-1.5 max-w-[600px] text-[13.5px] text-[var(--text-muted)]">{{ DOCS_INTRO[role] }}</p>

        <div v-if="docsState === 'loading'" class="flex flex-col gap-2.5">
          <DataSkeletonCard v-for="i in 2" :key="i" :height="60" :lines="1" />
        </div>

        <FeedbackAlertBanner v-else-if="docsState === 'error'" tone="danger" class="mb-2">
          Impossible de charger vos documents pour le moment.
          <button type="button" class="ml-2 font-bold underline" @click="loadDocs">Réessayer</button>
        </FeedbackAlertBanner>

        <p v-else-if="docsState === 'empty'" class="rounded-md border border-dashed border-[var(--border-default)] bg-[var(--surface-page)] px-4 py-6 text-center text-[13.5px] text-[var(--text-muted)]">
          Aucun document déposé pour l'instant.
        </p>

        <div v-else class="flex flex-col gap-2.5">
          <div v-for="d in docs" :key="d.id" class="flex items-center gap-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3.5">
            <div class="grid h-[42px] w-9 flex-none place-items-center rounded-xs border border-[var(--border-default)] bg-white text-[9px] font-black text-danger-fg">DOC</div>
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate text-sm font-bold">{{ KYC_DOCUMENT_TYPE_LABELS[d.document_type] }}</p>
              <p class="mb-0 mt-[3px] text-[12.5px] text-[var(--text-faint)]">Déposé le {{ formatDate(d.created_at) }}</p>
            </div>
            <button type="button" class="rounded-pill border border-[var(--border-default)] bg-white px-3.5 py-2 text-[12.5px] font-bold disabled:opacity-50" :disabled="previewingId === d.id" @click="previewDoc(d.id)">
              {{ previewingId === d.id ? 'Ouverture…' : 'Aperçu' }}
            </button>
            <button type="button" class="text-[15px] text-[var(--text-faint)] disabled:opacity-50" :disabled="deletingId === d.id" @click="deleteDoc(d.id)">✕</button>
          </div>
        </div>

        <div class="mt-4 flex items-center gap-3">
          <select v-model="uploadType" class="h-[46px] rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-[13px] text-[13.5px] text-sand-900">
            <option v-for="t in ROLE_DOCUMENT_TYPES[role]" :key="t" :value="t">{{ KYC_DOCUMENT_TYPE_LABELS[t] }}</option>
          </select>
          <label
            class="flex h-[46px] flex-1 items-center justify-center rounded-md border-[1.5px] border-dashed text-[13.5px] font-semibold transition-colors"
            :class="uploading ? 'cursor-not-allowed border-[var(--border-default)] text-[var(--text-faint)]' : 'cursor-pointer border-[var(--border-default)] text-[var(--text-muted)] hover:border-green-600'"
          >
            {{ uploading ? 'Envoi en cours…' : 'Déposer un fichier · PDF ou photo, 8 Mo max' }}
            <input type="file" accept="application/pdf,image/*" class="hidden" :disabled="uploading" @change="onFileSelected">
          </label>
        </div>
        <p v-if="uploadError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ uploadError }}</p>
      </div>
    </template>

    <template v-else>
      <div class="max-w-[560px] rounded-xl border border-[var(--border-subtle)] bg-white p-6">
        <p class="m-0 text-base font-bold">Coordonnées</p>
        <p class="mb-5 mt-1.5 text-[13.5px] text-[var(--text-muted)]">
          {{ isLandlordOrAgency ? "Ces informations sont demandées pour la vérification d'activité (KYB) — elles ne sont jamais réaffichées en clair une fois enregistrées." : "Votre nom complet, utilisé sur vos échanges avec les propriétaires et sur vos documents." }}
        </p>

        <label class="mb-3.5 block">
          <span class="mb-2 block text-[12.5px] font-bold">Nom complet</span>
          <input v-model="fullName" placeholder="Ex. Koffi Dossou" class="h-[50px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-4 text-[15px] outline-none">
        </label>

        <template v-if="isLandlordOrAgency">
          <label class="mb-3.5 block">
            <span class="mb-2 block text-[12.5px] font-bold">Raison sociale</span>
            <input v-model="company" placeholder="Ex. Agence Immo Cotonou" class="h-[50px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-4 text-[15px] outline-none">
          </label>
          <div class="mb-1 grid grid-cols-2 gap-3">
            <label class="block">
              <span class="mb-2 block text-[12.5px] font-bold">IFU</span>
              <input v-model="ifu" placeholder="13 chiffres" class="h-[50px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-4 text-[15px] outline-none">
            </label>
            <label class="block">
              <span class="mb-2 block text-[12.5px] font-bold">RCCM</span>
              <input v-model="rccm" placeholder="Ex. RB/COT/24 B 6789" class="h-[50px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-4 text-[15px] outline-none">
            </label>
          </div>
        </template>

        <p class="mb-0 mt-3.5 text-[12.5px] text-[var(--text-faint)]">Votre numéro Mobile Money est demandé directement au moment d'un retrait, pas ici.</p>
        <p v-if="coordonneesError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ coordonneesError }}</p>
        <p v-if="coordonneesSaved" class="mb-0 mt-2.5 text-[13px] font-semibold text-ok-fg">Enregistré.</p>
        <CoreButton size="lg" full-width class="mt-4.5" :disabled="savingCoordonnees" @click="finishKyc">{{ savingCoordonnees ? 'Enregistrement…' : 'Enregistrer et terminer la vérification' }}</CoreButton>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="doneOpen" class="fixed inset-0 z-[95] grid animate-[im-veil_.25s_ease_both] place-items-center bg-black/[.55] p-6 backdrop-blur-[4px]">
        <div class="w-[460px] max-w-[calc(100vw-3rem)] animate-[im-rise_.3s_var(--ease-standard)_both] rounded-2xl bg-[var(--surface-page)] p-[30px] text-center shadow-panel">
          <div class="mx-auto grid h-16 w-16 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-green-600 text-[30px] text-white">✓</div>
          <p class="mb-0 mt-5 font-display text-[22px] font-bold tracking-[-.02em]">Vérification envoyée</p>
          <p class="mb-0 mt-2.5 text-sm leading-[1.6] text-[var(--text-muted)]">{{ DONE_TEXT[role] }}</p>
          <div class="my-5 rounded-md border border-[var(--border-subtle)] bg-white p-4 text-left">
            <p class="mb-2.5 mt-0 text-[11.5px] font-black uppercase tracking-[.05em] text-[var(--text-faint)]">Prochaines étapes</p>
            <div v-for="(step, i) in NEXT_STEPS[role]" :key="step" class="flex items-center gap-2.5 py-[7px]">
              <span
                class="grid h-[22px] w-[22px] flex-none place-items-center rounded-pill text-[11px] font-black"
                :class="i === 0 ? 'bg-green-600 text-white' : 'bg-sand-300 text-[var(--text-muted)]'"
              >{{ i + 1 }}</span>
              <span class="text-[13.5px] text-[var(--text-secondary)]">{{ step }}</span>
            </div>
          </div>
          <CoreButton size="lg" full-width @click="goSpace">{{ DONE_CTA[role] }}</CoreButton>
          <button type="button" class="mt-2.5 w-full text-[13.5px] font-bold text-[var(--text-muted)]" @click="doneOpen = false">Explorer d'abord les annonces</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
