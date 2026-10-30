<script setup lang="ts">
import { BookOpen, Camera, Car, Check, ChevronRight, CircleAlert, CircleCheck, Eye, FileText, Globe, IdCard, Lock, Plus, Trash, Upload } from '@lucide/vue'
import type { UserRole } from '~/composables/useAuthRole'
import type { KycDocumentType } from '~/types/kyc'
import { KYC_DOCUMENT_TYPE_LABELS } from '~/types/kyc'
import type { ProfileMe } from '~/types/profile'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { apiRoleToSignupRole, RCCM_FORMAT_HINT, safeRedirect } from '~/utils/onboarding'
import { UPLOAD_ACCEPT_ATTR, UPLOAD_HINT, checkUploadFile, prepareUpload } from '~/utils/uploadFile'
import { mergeIdSides } from '~/utils/idCardImage'
import { verificationStage } from '~/utils/kycStatus'
import { asStep, blockReason, checklist, coordErrors, ID_TYPES, idTypeOf, missingSides, nextStep, prevStep, progressIndex, PROGRESS_SEGMENTS, ROLE_DOCS, SIDE_LABEL, type IdSide, type IdTypeKey, type KycStep } from '~/utils/kycWizard'

/**
 * Vérification du compte, en étapes (refonte dans l'esprit d'Airbnb) : une
 * question par écran, une barre de progression, « Retour » et « Suivant » en
 * bas. Avant : trois onglets sans ordre ni bouton « Suivant », et un menu
 * déroulant de types de documents incompris. L'étape est dans l'URL
 * (`?etape=`) : le bouton précédent du navigateur et le rechargement
 * fonctionnent.
 */
definePageMeta({ layout: 'blank' })

const route = useRoute()
const router = useRouter()
const localRole = useAuthRole()
const auth = useAuthApi()
const kyc = useKycApi()
const profileApi = useProfileApi()

/** Rôle réel (/auth/me) d'abord : `useAuthRole()` repart à « locataire » à chaque rechargement (Lot 44). */
const role = computed<UserRole>(() => apiRoleToSignupRole(auth.user.value?.role) ?? localRole.value)
const isBusiness = computed(() => ['landlord', 'agent', 'agency'].includes(auth.user.value?.role ?? ''))

/* ---- Étape courante ---- */
const step = computed<KycStep>(() => asStep(route.query.etape))
function go(s: KycStep) {
  router.push({ query: { ...route.query, etape: s === 'intro' ? undefined : s } })
  if (import.meta.client) window.scrollTo({ top: 0 })
}

/* ---- Ce qui est déjà déposé ---- */
const savedProfile = ref<ProfileMe | null>(null)
async function loadSavedProfile() {
  try {
    savedProfile.value = await profileApi.fetchMe()
  } catch {
    savedProfile.value = null
  }
}

const idCardPreview = useProtectedFile()
const idCardState = ref<'loading' | 'missing' | 'present'>('loading')
async function loadIdCard() {
  const userId = auth.user.value?.id
  if (!userId) return
  idCardState.value = 'loading'
  await idCardPreview.load(kyc.idCardDownloadUrl(userId))
  idCardState.value = idCardPreview.objectUrl.value ? 'present' : 'missing'
}
const idCardOnFile = computed(() => idCardState.value === 'present')

const docs = ref<Awaited<ReturnType<typeof kyc.listMine>>>([])
const docsState = ref<'loading' | 'ready' | 'error'>('loading')
async function loadDocs() {
  docsState.value = 'loading'
  try {
    docs.value = await kyc.listMine()
    docsState.value = 'ready'
  } catch {
    docsState.value = 'error'
  }
}
onMounted(() => Promise.all([loadSavedProfile(), loadIdCard(), loadDocs()]))
watch(() => auth.user.value?.id, id => { if (id && idCardState.value === 'loading') loadIdCard() })

/**
 * Même étape que les bandeaux des espaces (`verificationStage`) : « vérifié »
 * suit `is_verified`, comme l'API — `kyc_status` repasse à `pending` à chaque
 * modification du profil sans retirer les droits (BACKEND-ISSUES #7).
 */
const pageStage = computed(() => verificationStage(auth.user.value, idCardOnFile.value && docs.value.length > 0))
const isVerified = computed(() => pageStage.value === 'verified')
const isRejected = computed(() => pageStage.value === 'rejected')
const inReview = computed(() => pageStage.value === 'review')
const progressItems = computed(() => checklist({ idCardOnFile: idCardOnFile.value, docCount: docs.value.length, nameSaved: !!savedProfile.value?.full_name_masked }))

/* ---- Étape « pièce » : le type de pièce (gardé pour la session) ---- */
const idType = ref<IdTypeKey | null>(null)
onMounted(() => {
  try {
    const saved = sessionStorage.getItem('kycIdType')
    if (saved && idTypeOf(saved)) idType.value = saved as IdTypeKey
  } catch {
    // Stockage indisponible (navigation privée) : on redemande simplement.
  }
})
watch(idType, v => {
  try {
    if (v) sessionStorage.setItem('kycIdType', v)
  } catch {
    // idem
  }
})
const idTypeOption = computed(() => idTypeOf(idType.value))
/** Icônes lucide par type de pièce (le référentiel `ID_TYPES` porte des emoji, non affichés). */
const ID_ICONS: Record<IdTypeKey, typeof IdCard> = { cni: IdCard, passeport: BookOpen, permis: Car, sejour: Globe }

/* ---- Étape « photos » : recto / verso, assemblés en une image à l'envoi ---- */
const keepExisting = ref(true)
const sides = reactive<Partial<Record<IdSide, { file: File; url: string | null } | null>>>({})
const touchDevice = ref(false)
onMounted(() => { touchDevice.value = window.matchMedia('(pointer: coarse)').matches })
const missing = computed(() => (idTypeOption.value ? missingSides(idTypeOption.value, Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, v ? { type: v.file.type } : null]))) : []))
const photoError = ref('')
function setSide(side: IdSide, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  photoError.value = ''
  const accepted = file.type.startsWith('image/') || file.type === 'application/pdf'
  if (!accepted || (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type))) {
    photoError.value = 'Format non accepté : prenez une photo, ou envoyez un fichier JPG, PNG, WebP ou PDF.'
    return
  }
  const previous = sides[side]
  if (previous?.url) URL.revokeObjectURL(previous.url)
  sides[side] = { file, url: file.type === 'application/pdf' ? null : URL.createObjectURL(file) }
}
function clearSide(side: IdSide) {
  const previous = sides[side]
  if (previous?.url) URL.revokeObjectURL(previous.url)
  sides[side] = null
}
onUnmounted(() => { for (const s of Object.values(sides)) if (s?.url) URL.revokeObjectURL(s.url) })

const idUploading = ref(false)
async function sendIdCard(): Promise<boolean> {
  const t = idTypeOption.value
  if (!t) return false
  photoError.value = ''
  idUploading.value = true
  try {
    const first = sides[t.sides[0]!]!.file
    let file: File
    if (t.sides.length === 1 || first.type === 'application/pdf') {
      const ready = await prepareUpload(first)
      if (ready.error !== null) { photoError.value = ready.error; return false }
      file = ready.file
    } else {
      const second = sides[t.sides[1]!]!.file
      if (second.type === 'application/pdf') { photoError.value = 'Pour le verso, envoyez une photo (JPG, PNG ou WebP) — ou déposez un seul PDF contenant les deux faces à la place du recto.'; return false }
      try {
        file = await mergeIdSides(first, second)
      } catch {
        photoError.value = 'Les deux photos n\'ont pas pu être assemblées. Réessayez avec des photos moins lourdes.'
        return false
      }
      const tooBig = checkUploadFile(file)
      if (tooBig) { photoError.value = tooBig; return false }
    }
    await kyc.uploadIdCard(file)
    await loadIdCard()
    return true
  } catch (e) {
    photoError.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'envoi de la pièce a échoué.") : "L'envoi de la pièce a échoué."
    return false
  } finally {
    idUploading.value = false
  }
}

/* ---- Étape « justificatifs » : un bouton « Ajouter » par type ---- */
const roleDocs = computed(() => ROLE_DOCS[role.value])
const otherDocs = computed(() => docs.value.filter(d => !roleDocs.value.some(r => r.type === d.document_type)))
function docsOf(type: KycDocumentType) {
  return docs.value.filter(d => d.document_type === type)
}
const uploadingType = ref<KycDocumentType | null>(null)
const docError = ref('')
async function addDoc(type: KycDocumentType, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  docError.value = ''
  uploadingType.value = type
  try {
    const ready = await prepareUpload(file)
    if (ready.error !== null) { docError.value = ready.error; return }
    await kyc.upload(ready.file, type)
    await loadDocs()
  } catch (err) {
    docError.value = err instanceof ApiRequestError ? errorText(err.mapped, "L'envoi du document a échoué.") : "L'envoi du document a échoué."
  } finally {
    uploadingType.value = null
  }
}
/* Suppression en deux temps (#11) : la confirmation s'ouvre sous le document, une seule à la fois. */
const confirmingDocId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const docInfo = ref('')
async function deleteDoc(id: string) {
  deletingId.value = id
  docError.value = ''
  docInfo.value = ''
  try {
    await kyc.remove(id)
    docs.value = docs.value.filter(d => d.id !== id)
    confirmingDocId.value = null
    docInfo.value = docs.value.length
      ? 'Document supprimé de votre dossier.'
      : 'Document supprimé. Votre dossier n\'a plus aucun justificatif : ajoutez-en au moins un pour qu\'il puisse être examiné.'
  } catch (err) {
    docError.value = err instanceof ApiRequestError ? errorText(err.mapped, 'La suppression a échoué.') : 'La suppression a échoué.'
  } finally {
    deletingId.value = null
  }
}
watch(step, () => { confirmingDocId.value = null; docInfo.value = '' })
const preview = useProtectedFile()
const previewingId = ref<string | null>(null)
async function previewDoc(id: string) {
  previewingId.value = id
  await preview.load(kyc.downloadUrl(id))
  if (preview.objectUrl.value) window.open(preview.objectUrl.value, '_blank')
  previewingId.value = null
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ---- Étape « coordonnées » ---- */
const form = reactive({ fullName: '', company: '', ifu: '', rccm: '' })
const triedCoord = ref(false)
const coordSaving = ref(false)
const coordError = ref('')
const fieldErrors = computed(() => coordErrors(form, { business: isBusiness.value, nameSaved: !!savedProfile.value?.full_name_masked }))
const shownErrors = computed(() => (triedCoord.value ? fieldErrors.value : {}))
watch(() => [auth.user.value, savedProfile.value] as const, ([u, p]) => {
  if (!form.fullName && p && !p.full_name_masked && u) form.fullName = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
}, { immediate: true })
async function saveCoord(): Promise<boolean> {
  triedCoord.value = true
  if (Object.keys(fieldErrors.value).length) return false
  const payload: Record<string, unknown> = {}
  if (form.fullName.trim()) payload.full_name = form.fullName.trim()
  if (isBusiness.value) {
    if (form.company.trim()) payload.company = form.company.trim()
    if (form.ifu.trim()) payload.ifu = form.ifu.trim()
    if (form.rccm.trim()) payload.rccm = form.rccm.trim()
  }
  if (!Object.keys(payload).length) return true
  coordSaving.value = true
  coordError.value = ''
  try {
    await profileApi.update(payload)
    Object.assign(form, { fullName: '', company: '', ifu: '', rccm: '' })
    triedCoord.value = false
    await loadSavedProfile()
    return true
  } catch (e) {
    coordError.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'enregistrement a échoué.") : "L'enregistrement a échoué."
    return false
  } finally {
    coordSaving.value = false
  }
}

/* ---- Bouton principal et barre du bas ---- */
const wizardState = computed(() => ({
  idType: idType.value,
  idCardOnFile: idCardOnFile.value,
  keepExistingCard: keepExisting.value,
  missingSides: missing.value,
  docCount: docs.value.length,
  coordValid: !triedCoord.value || Object.keys(fieldErrors.value).length === 0
}))
const reason = computed(() => blockReason(step.value, wizardState.value))
const busy = computed(() => idUploading.value || coordSaving.value || !!uploadingType.value)
const primaryLabel = computed(() => {
  if (step.value === 'photos' && idUploading.value) return 'Envoi de la pièce…'
  if (step.value === 'coordonnees' && coordSaving.value) return 'Enregistrement…'
  if (step.value === 'recap') return 'Envoyer pour vérification'
  return 'Suivant'
})
async function primary() {
  if (reason.value || busy.value) return
  if (step.value === 'photos' && !(keepExisting.value && idCardOnFile.value)) {
    if (!(await sendIdCard())) return
    keepExisting.value = true
  }
  if (step.value === 'coordonnees' && !(await saveCoord())) return
  if (step.value === 'recap') {
    await auth.fetchMe().catch(() => null)
    go('envoye')
    return
  }
  go(nextStep(step.value))
}
function back() {
  go(prevStep(step.value))
}

const SPACE_ROUTE: Record<UserRole, string> = { locataire: '/locataire', bailleur: '/pro', artisan: '/artisan' }
/** Retour à la page d'origine de l'inscription s'il y en a une (Lot 56), sinon l'espace du rôle. */
const backTo = safeRedirect(route.query.redirect)
async function saveAndQuit() {
  if (step.value === 'coordonnees' && (form.fullName || form.company || form.ifu || form.rccm) && !(await saveCoord())) return
  navigateTo(backTo ?? SPACE_ROUTE[role.value])
}

/* ---- Textes par profil ---- */
const WHY: Record<UserRole, string> = {
  // Retraits : non bloqués par l'API (retrait d'un compte non vérifié → contrôle du solde, constaté le 2026-09-28).
  locataire: 'Sans vérification, vous pouvez parcourir les annonces et réserver un séjour, mais pas demander de visite ni candidater à un logement.',
  bailleur: 'Sans vérification, vous ne pouvez ni publier ou modifier un bien, ni demander un artisan. Les locataires voient le badge « Vérifié » sur vos annonces.',
  artisan: 'Sans vérification, vos certifications n\'apparaissent pas sur votre vitrine, et les clients ne voient pas le badge « Vérifié ».'
}
const DOCS_SUBTITLE: Record<UserRole, string> = {
  locataire: 'Ils rassurent les propriétaires sur votre capacité à payer le loyer.',
  bailleur: 'Ils prouvent que vous pouvez louer les biens que vous publiez.',
  artisan: 'Ils prouvent que vous exercez en règle et rassurent vos clients.'
}
/*
 * Aucun délai d'examen promis : rien dans l'API ne le garantit. Ce qui s'ouvre à la validation suit
 * les blocages réels de l'API (`VerifiedUserGuard`, voir utils/kycStatus.ts).
 */
const DONE_TEXT: Record<UserRole, string> = {
  locataire: 'L\'équipe Immo examine votre dossier. La demande de visite et la candidature à un logement s\'ouvriront dès sa validation ; en attendant, vous pouvez parcourir les annonces et réserver un séjour.',
  bailleur: 'L\'équipe Immo examine votre dossier. Dès sa validation, vous pourrez publier et modifier vos biens, et demander un artisan.',
  artisan: 'L\'équipe Immo examine votre dossier. Une fois validées, vos certifications s\'afficheront sur votre vitrine avec le badge « Vérifié ».'
}
const DONE_CTA: Record<UserRole, string> = { locataire: 'Aller à mon espace locataire', bailleur: 'Aller à mon espace pro', artisan: 'Aller à mon espace artisan' }
const NEXT_STEPS: Record<UserRole, string[]> = {
  locataire: ['Examen de votre dossier par l\'équipe Immo', 'Dès la validation : demandez une visite ou déposez une candidature', 'Signez votre bail et payez depuis votre wallet'],
  bailleur: ['Examen de votre dossier par l\'équipe Immo', 'Dès la validation : publiez votre premier bien et ses logements', 'Recevez et acceptez des demandes de location'],
  artisan: ['Examen de votre dossier par l\'équipe Immo', 'Complétez votre vitrine et vos zones d\'intervention', 'Répondez aux demandes et faites vos premières offres']
}
const introTitle = computed(() => (isVerified.value ? 'Votre compte est vérifié' : isRejected.value ? 'Votre vérification doit être reprise' : inReview.value ? 'Vérification en cours' : 'Vérifiez votre compte'))
const introText = computed(() => {
  if (isVerified.value) return 'L\'équipe Immo a validé votre identité. Vous pouvez mettre à jour vos documents à tout moment, par exemple pour ajouter un titre de propriété.'
  if (isRejected.value) return 'Un ou plusieurs documents ont été refusés, souvent parce qu\'ils étaient illisibles. Reprenez les étapes et déposez des photos nettes.'
  if (inReview.value) return 'Votre dossier est complet et en cours d\'examen par l\'équipe Immo. Vous pouvez encore le compléter.'
  return 'Trois étapes, environ 5 minutes. Préparez votre pièce d\'identité et un ou deux justificatifs.'
})
const introCta = computed(() => (isVerified.value ? 'Mettre à jour mes documents' : isRejected.value ? 'Reprendre la vérification' : progressItems.value.some(i => i.done) ? 'Continuer' : 'Commencer'))
function startWizard() {
  go(isVerified.value ? 'documents' : 'piece')
}

const showFooter = computed(() => step.value !== 'intro' && step.value !== 'envoye')

/** Mêmes classes que `FormsInput` : ces champs gardent `inputmode` et `maxlength`. */
const FIELD_CLASS = 'h-[46px] w-full rounded-md border bg-[var(--surface-input)] px-[15px] text-[14.5px] text-[var(--text-primary)] outline-none focus:border-green-600'
const segment = computed(() => progressIndex(step.value))
</script>

<template>
  <div class="flex min-h-screen flex-col bg-white">
    <header class="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[var(--border-subtle)] bg-white px-5 sm:px-10">
      <NuxtLink to="/" class="flex items-center gap-2.5" aria-label="Accueil Immo">
        <img src="/images/logo.png" alt="" class="h-8 w-8 rounded-[9px]" width="32" height="32">
        <span class="hidden font-display text-[20px] font-extrabold tracking-[-.025em] text-green-900 sm:inline">Immo</span>
      </NuxtLink>
      <button
        v-if="step !== 'envoye'"
        type="button"
        class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-2 text-[13.5px] font-bold hover:bg-[var(--surface-page)]"
        :disabled="busy"
        :title="step === 'intro' ? WHY[role] : undefined"
        @click="saveAndQuit"
      >
        {{ step === 'intro' ? 'Plus tard' : 'Enregistrer et quitter' }}
      </button>
    </header>

    <main class="flex-1 px-5 pb-[150px] pt-8 sm:px-8 sm:pt-12" data-testid="kyc-step" :data-step="step">
      <div class="mx-auto max-w-[620px] animate-[im-fade_.25s_ease_backwards]">
        <!-- ===== Introduction ===== -->
        <template v-if="step === 'intro'">
          <p class="m-0 text-[13px] font-bold uppercase tracking-[.06em] text-green-700">Vérification du compte</p>
          <h1 class="mb-0 mt-2.5 font-display text-[32px] font-bold leading-[1.1] tracking-[-.03em] sm:text-[38px]">{{ introTitle }}</h1>
          <p class="mb-0 mt-3.5 text-[16px] leading-[1.55] text-[var(--text-secondary)]">{{ introText }}</p>
          <p v-if="!isVerified" class="mb-0 mt-2.5 text-[14px] leading-[1.55] text-[var(--text-muted)]">{{ WHY[role] }}</p>

          <div class="mt-7 overflow-hidden rounded-2xl border border-[var(--border-subtle)]">
            <button
              v-for="(item, i) in progressItems"
              :key="item.key"
              type="button"
              class="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--surface-page)]"
              :class="i > 0 ? 'border-t border-[var(--border-subtle)]' : ''"
              @click="go(item.key === 'photos' ? 'piece' : item.key)"
            >
              <span class="grid h-9 w-9 flex-none place-items-center rounded-pill font-mono text-[14px] font-bold" :class="item.done ? 'bg-green-600 text-white' : 'border-2 border-[var(--border-default)] text-[var(--text-faint)]'"><Check v-if="item.done" class="h-4 w-4" :stroke-width="2.6" /><template v-else>{{ i + 1 }}</template></span>
              <span class="flex-1">
                <span class="block text-[15px] font-bold">{{ item.label }}</span>
                <span class="block text-[13px] text-[var(--text-muted)]">{{ item.detail }}</span>
              </span>
              <ChevronRight class="h-[18px] w-[18px] flex-none text-[var(--text-faint)]" :stroke-width="1.9" />
            </button>
          </div>

          <p class="mb-0 mt-5 flex items-start gap-2.5 text-[13px] leading-[1.55] text-[var(--text-muted)]">
            <Lock class="mt-0.5 h-4 w-4 flex-none text-green-700" aria-hidden="true" :stroke-width="1.9" />
            <span>Seule l'équipe de vérification d'Immo a accès à vos documents : ils ne sont jamais montrés aux propriétaires, aux locataires ni aux artisans.</span>
          </p>
          <CoreButton size="lg" class="mt-8 w-full sm:w-auto" @click="startWizard">{{ introCta }}</CoreButton>
        </template>

        <!-- ===== Type de pièce ===== -->
        <template v-else-if="step === 'piece'">
          <h1 class="m-0 font-display text-[28px] font-bold leading-[1.15] tracking-[-.03em] sm:text-[32px]">Quelle pièce d'identité allez-vous utiliser ?</h1>
          <p class="mb-0 mt-3 text-[15px] text-[var(--text-muted)]">Elle doit être à votre nom et en cours de validité.</p>
          <div class="mt-7 flex flex-col gap-3" role="radiogroup" aria-label="Type de pièce d'identité">
            <button
              v-for="t in ID_TYPES"
              :key="t.key"
              type="button"
              role="radio"
              :aria-checked="idType === t.key"
              class="flex items-center gap-4 rounded-2xl px-5 py-4 text-left transition-all"
              :class="idType === t.key ? 'border-2 border-green-600 bg-green-50' : 'border border-[var(--border-default)] bg-white hover:border-green-600'"
              @click="idType = t.key"
            >
              <span class="grid h-11 w-11 flex-none place-items-center rounded-pill bg-green-50 text-green-700" aria-hidden="true"><component :is="ID_ICONS[t.key]" class="h-5 w-5" :stroke-width="1.9" /></span>
              <span class="flex-1">
                <span class="block text-[15px] font-bold">{{ t.label }}</span>
                <span class="block text-[13px] text-[var(--text-muted)]">{{ t.hint }}</span>
              </span>
              <span class="grid h-5 w-5 flex-none place-items-center rounded-pill text-white" :class="idType === t.key ? 'bg-green-600' : 'border-2 border-[var(--border-default)]'">
                <Check v-if="idType === t.key" class="h-3 w-3" :stroke-width="3" />
              </span>
            </button>
          </div>
          <p v-if="idCardOnFile" class="mb-0 mt-4 rounded-md bg-[var(--surface-page)] px-4 py-3 text-[13px] text-[var(--text-secondary)]">Une pièce est déjà déposée : vous pourrez la garder à l'étape suivante.</p>
        </template>

        <!-- ===== Photos de la pièce ===== -->
        <template v-else-if="step === 'photos'">
          <h1 class="m-0 font-display text-[28px] font-bold leading-[1.15] tracking-[-.03em] sm:text-[32px]">
            {{ idTypeOption ? idTypeOption.photoTitle : 'Photographiez votre pièce d\'identité' }}
          </h1>

          <template v-if="idCardOnFile && keepExisting">
            <p class="mb-0 mt-3 text-[15px] text-[var(--text-muted)]">Vous avez déjà déposé une pièce. Gardez-la si elle est lisible, ou envoyez-en une nouvelle.</p>
            <div class="mt-6 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-page)]">
              <img :src="idCardPreview.objectUrl.value ?? undefined" alt="Pièce d'identité déposée" class="max-h-[320px] w-full object-contain">
            </div>
            <div class="mt-4 flex flex-wrap gap-3">
              <span class="inline-flex items-center gap-1.5 rounded-pill bg-ok-bg px-4 py-2 text-[13.5px] font-bold text-ok-fg"><Check class="h-4 w-4" :stroke-width="2.4" />Cette pièce sera gardée</span>
              <button type="button" class="rounded-pill border border-[var(--border-default)] px-4 py-2 text-[13.5px] font-bold" @click="keepExisting = false">En envoyer une nouvelle</button>
            </div>
          </template>

          <template v-else-if="idTypeOption">
            <p class="mb-0 mt-3 text-[15px] text-[var(--text-muted)]">
              {{ idTypeOption.sides.length > 1 ? 'Deux photos : le recto puis le verso. Elles seront envoyées ensemble.' : 'Une photo de la page où figurent votre photo et votre nom.' }}
            </p>
            <div class="mt-6 grid grid-cols-1 gap-4" :class="idTypeOption.sides.length > 1 ? 'sm:grid-cols-2' : ''">
              <div v-for="side in idTypeOption.sides" :key="side" class="rounded-2xl border-[1.5px] p-4" :class="sides[side] ? 'border-green-600' : 'border-dashed border-[var(--border-default)]'" :data-side="side">
                <p class="m-0 text-[15px] font-bold">{{ SIDE_LABEL[side].title }}</p>
                <p class="mb-3 mt-0.5 text-[12.5px] text-[var(--text-muted)]">{{ SIDE_LABEL[side].hint }}</p>
                <template v-if="sides[side]">
                  <img v-if="sides[side]?.url" :src="sides[side]?.url ?? undefined" :alt="SIDE_LABEL[side].title" class="h-[150px] w-full rounded-lg bg-[var(--surface-page)] object-contain">
                  <div v-else class="grid h-[150px] place-items-center rounded-lg bg-[var(--surface-page)] text-center text-[13px] text-[var(--text-secondary)]">
                    <span class="flex flex-col items-center gap-1.5 px-3"><FileText class="h-6 w-6 text-[var(--text-faint)]" :stroke-width="1.9" /><span class="max-w-full truncate">{{ sides[side]?.file.name }}</span><span class="text-[12px] text-[var(--text-faint)]">Un PDF compte pour le document entier.</span></span>
                  </div>
                  <button type="button" class="mt-3 w-full rounded-md border border-[var(--border-default)] bg-white py-2.5 text-[13px] font-bold" @click="clearSide(side)">Reprendre</button>
                </template>
                <template v-else>
                  <div class="grid h-[150px] place-items-center rounded-lg bg-[var(--surface-page)] text-[var(--text-faint)]" aria-hidden="true"><Camera class="h-8 w-8" :stroke-width="1.6" /></div>
                  <label v-if="touchDevice" class="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border-[1.5px] border-green-600 bg-green-50 py-2.5 text-[13px] font-bold text-green-800">
                    <Camera class="h-4 w-4" :stroke-width="1.9" />Prendre une photo
                    <input type="file" accept="image/*" capture="environment" class="hidden" :aria-label="`Prendre une photo : ${SIDE_LABEL[side].title}`" @change="setSide(side, $event)">
                  </label>
                  <label class="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--border-default)] bg-white py-2.5 text-[13px] font-bold">
                    <Upload class="h-4 w-4" :stroke-width="1.9" />{{ touchDevice ? 'Choisir un fichier' : 'Importer une photo ou un PDF' }}
                    <input type="file" :accept="UPLOAD_ACCEPT_ATTR" class="hidden" :aria-label="`Importer : ${SIDE_LABEL[side].title}`" @change="setSide(side, $event)">
                  </label>
                </template>
              </div>
            </div>
            <div class="mt-5 rounded-2xl bg-[var(--surface-page)] p-4 text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">
              <p class="m-0 font-bold text-[var(--text-primary)]">Pour une vérification rapide</p>
              <ul class="mb-0 mt-1.5 list-none p-0">
                <li class="flex items-center gap-2"><Check class="h-3.5 w-3.5 flex-none text-ok-fg" :stroke-width="2.4" />Les quatre coins de la pièce sont visibles</li>
                <li class="flex items-center gap-2"><Check class="h-3.5 w-3.5 flex-none text-ok-fg" :stroke-width="2.4" />Le texte est net et lisible, sans flou</li>
                <li class="flex items-center gap-2"><Check class="h-3.5 w-3.5 flex-none text-ok-fg" :stroke-width="2.4" />Pas de reflet de flash ni de doigt sur la pièce</li>
              </ul>
              <p class="mb-0 mt-2 text-[12px] text-[var(--text-faint)]">{{ UPLOAD_HINT }} — les photos lourdes sont réduites automatiquement.</p>
            </div>
            <button v-if="idCardOnFile" type="button" class="mt-4 text-[13.5px] font-bold underline" @click="keepExisting = true">Garder plutôt la pièce déjà déposée</button>
          </template>

          <p v-else class="mt-4 text-[15px] text-[var(--text-muted)]">Choisissez d'abord le type de pièce. <button type="button" class="font-bold underline" @click="go('piece')">Choisir</button></p>
          <p v-if="photoError" class="mb-0 mt-4 rounded-md border border-danger-border bg-danger-bg px-4 py-3 text-[13.5px] font-semibold text-danger-fg">{{ photoError }}</p>
        </template>

        <!-- ===== Justificatifs ===== -->
        <template v-else-if="step === 'documents'">
          <h1 class="m-0 font-display text-[28px] font-bold leading-[1.15] tracking-[-.03em] sm:text-[32px]">Ajoutez vos justificatifs</h1>
          <p class="mb-0 mt-3 text-[15px] text-[var(--text-muted)]">{{ DOCS_SUBTITLE[role] }} Au moins un document ; celui marqué « Recommandé » accélère la validation.</p>
          <FeedbackAlertBanner v-if="docsState === 'error'" tone="danger" class="mt-4">
            Impossible de charger vos documents.
            <button type="button" class="ml-2 font-bold underline" @click="loadDocs">Réessayer</button>
          </FeedbackAlertBanner>
          <div class="mt-6 flex flex-col gap-3.5">
            <div v-for="d in roleDocs" :key="d.type" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5" :data-doc-type="d.type">
              <div class="flex flex-wrap items-center gap-2">
                <p class="m-0 text-[15px] font-bold">{{ d.label }}</p>
                <CoreBadge v-if="d.recommended" tone="ok">Recommandé</CoreBadge>
                <span v-if="docsOf(d.type).length" class="ml-auto inline-flex items-center gap-1 text-xs font-bold text-ok-fg"><Check class="h-3.5 w-3.5" :stroke-width="2.4" />{{ docsOf(d.type).length }} déposé{{ docsOf(d.type).length > 1 ? 's' : '' }}</span>
              </div>
              <p class="mb-0 mt-1 text-[13.5px] leading-[1.5] text-[var(--text-muted)]">{{ d.description }}</p>
              <div v-for="doc in docsOf(d.type)" :key="doc.id" class="mt-3">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-[var(--surface-page)] px-3.5 py-2.5">
                  <FileText class="h-4 w-4 flex-none text-[var(--text-faint)]" aria-hidden="true" :stroke-width="1.9" />
                  <span class="min-w-0 flex-1 text-[13px] text-[var(--text-secondary)]">Déposé le <span class="font-mono">{{ formatDate(doc.created_at) }}</span></span>
                  <button type="button" class="inline-flex items-center gap-1 text-[13px] font-bold text-green-700 disabled:opacity-50" :disabled="previewingId === doc.id" @click="previewDoc(doc.id)"><Eye class="h-4 w-4" :stroke-width="1.9" />{{ previewingId === doc.id ? 'Ouverture…' : 'Voir' }}</button>
                  <button v-if="confirmingDocId !== doc.id" type="button" class="inline-flex items-center gap-1 text-[13px] font-bold text-danger-fg disabled:opacity-50" :disabled="deletingId === doc.id" @click="confirmingDocId = doc.id"><Trash class="h-4 w-4" :stroke-width="1.9" />Supprimer</button>
                </div>
                <CoreInlineConfirm
                  v-if="confirmingDocId === doc.id"
                  class="mt-2"
                  tone="danger"
                  :message="`Supprimer ce document (${d.label.toLowerCase()}) ? Il ne comptera plus dans votre dossier ; il faudra le déposer à nouveau.`"
                  confirm-label="Supprimer"
                  :loading="deletingId === doc.id"
                  @confirm="deleteDoc(doc.id)"
                  @cancel="confirmingDocId = null"
                />
              </div>
              <label class="mt-3.5 inline-flex cursor-pointer items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold transition-colors hover:border-green-600" :class="uploadingType === d.type ? 'pointer-events-none opacity-60' : ''">
                <Plus v-if="uploadingType !== d.type" class="h-4 w-4" :stroke-width="2" />{{ uploadingType === d.type ? 'Envoi…' : docsOf(d.type).length ? 'Ajouter un autre' : 'Ajouter' }}
                <input type="file" :accept="UPLOAD_ACCEPT_ATTR" class="hidden" :disabled="!!uploadingType" :aria-label="`Ajouter : ${d.label}`" @change="addDoc(d.type, $event)">
              </label>
            </div>
            <div v-if="otherDocs.length" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
              <p class="m-0 text-[15px] font-bold">Autres documents déposés</p>
              <div v-for="doc in otherDocs" :key="doc.id" class="mt-3">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-[var(--surface-page)] px-3.5 py-2.5">
                  <FileText class="h-4 w-4 flex-none text-[var(--text-faint)]" aria-hidden="true" :stroke-width="1.9" />
                  <span class="min-w-0 flex-1 text-[13px] text-[var(--text-secondary)]">{{ KYC_DOCUMENT_TYPE_LABELS[doc.document_type] }} · <span class="font-mono">{{ formatDate(doc.created_at) }}</span></span>
                  <button type="button" class="inline-flex items-center gap-1 text-[13px] font-bold text-green-700 disabled:opacity-50" :disabled="previewingId === doc.id" @click="previewDoc(doc.id)"><Eye class="h-4 w-4" :stroke-width="1.9" />{{ previewingId === doc.id ? 'Ouverture…' : 'Voir' }}</button>
                  <button v-if="confirmingDocId !== doc.id" type="button" class="inline-flex items-center gap-1 text-[13px] font-bold text-danger-fg disabled:opacity-50" :disabled="deletingId === doc.id" @click="confirmingDocId = doc.id"><Trash class="h-4 w-4" :stroke-width="1.9" />Supprimer</button>
                </div>
                <CoreInlineConfirm
                  v-if="confirmingDocId === doc.id"
                  class="mt-2"
                  tone="danger"
                  message="Supprimer ce document ? Il ne comptera plus dans votre dossier ; il faudra le déposer à nouveau."
                  confirm-label="Supprimer"
                  :loading="deletingId === doc.id"
                  @confirm="deleteDoc(doc.id)"
                  @cancel="confirmingDocId = null"
                />
              </div>
            </div>
          </div>
          <p class="mb-0 mt-3 text-[12.5px] text-[var(--text-faint)]">{{ UPLOAD_HINT }}</p>
          <p v-if="docError" class="mb-0 mt-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ docError }}</p>
          <p v-else-if="docInfo" class="mb-0 mt-3 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ docInfo }}</p>
        </template>

        <!-- ===== Coordonnées ===== -->
        <template v-else-if="step === 'coordonnees'">
          <h1 class="m-0 font-display text-[28px] font-bold leading-[1.15] tracking-[-.03em] sm:text-[32px]">{{ isBusiness ? 'Vos coordonnées et votre activité' : 'Vos coordonnées' }}</h1>
          <p class="mb-0 mt-3 text-[15px] text-[var(--text-muted)]">{{ isBusiness ? 'L\'IFU et le RCCM servent à vérifier votre activité. Une fois enregistrés, ils ne sont plus jamais réaffichés en clair.' : 'Votre nom tel qu\'il figure sur votre pièce d\'identité.' }}</p>
          <div class="mt-6 flex flex-col gap-4">
            <label class="block">
              <span class="mb-[7px] flex items-center justify-between gap-2 text-[12.5px] font-bold">Nom légal complet<span v-if="savedProfile?.full_name_masked" class="inline-flex items-center gap-1 text-xs font-semibold text-ok-fg"><Check class="h-3.5 w-3.5" :stroke-width="2.4" />Enregistré</span></span>
              <input v-model="form.fullName" autocomplete="name" :placeholder="savedProfile?.full_name_masked ? 'Déjà enregistré — saisir pour remplacer' : 'Ex. Sèdjro Aholou'" :class="[FIELD_CLASS, shownErrors.fullName ? 'border-danger-border' : 'border-[var(--border-default)]']">
              <span v-if="shownErrors.fullName" class="mt-[7px] block text-[12.5px] font-semibold text-danger-fg">{{ shownErrors.fullName }}</span>
              <span v-else class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">Tel qu'il figure sur votre pièce d'identité.</span>
            </label>
            <template v-if="isBusiness">
              <label class="block">
                <span class="mb-[7px] flex items-center justify-between gap-2 text-[12.5px] font-bold">Raison sociale<span v-if="savedProfile?.company_masked" class="inline-flex items-center gap-1 text-xs font-semibold text-ok-fg"><Check class="h-3.5 w-3.5" :stroke-width="2.4" />Enregistrée</span></span>
                <input v-model="form.company" autocomplete="organization" :placeholder="savedProfile?.company_masked ? 'Déjà enregistrée — saisir pour remplacer' : 'Facultatif'" :class="[FIELD_CLASS, 'border-[var(--border-default)]']">
                <span class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">Si vous louez au nom d'une entreprise ou d'une agence.</span>
              </label>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label class="block">
                  <span class="mb-[7px] flex items-center justify-between gap-2 text-[12.5px] font-bold">IFU<span v-if="savedProfile?.ifu_masked" class="inline-flex items-center gap-1 text-xs font-semibold text-ok-fg"><Check class="h-3.5 w-3.5" :stroke-width="2.4" />Enregistré</span></span>
                  <input v-model="form.ifu" inputmode="numeric" maxlength="13" :placeholder="savedProfile?.ifu_masked ? 'Déjà enregistré' : '13 chiffres'" :class="[FIELD_CLASS, 'font-mono', shownErrors.ifu ? 'border-danger-border' : 'border-[var(--border-default)]']">
                  <span v-if="shownErrors.ifu" class="mt-[7px] block text-[12.5px] font-semibold text-danger-fg">{{ shownErrors.ifu }}</span>
                </label>
                <label class="block">
                  <span class="mb-[7px] flex items-center justify-between gap-2 text-[12.5px] font-bold">RCCM<span v-if="savedProfile?.rccm_masked" class="inline-flex items-center gap-1 text-xs font-semibold text-ok-fg"><Check class="h-3.5 w-3.5" :stroke-width="2.4" />Enregistré</span></span>
                  <input v-model="form.rccm" :placeholder="savedProfile?.rccm_masked ? 'Déjà enregistré' : 'RB/COT/25 A 1234'" :class="[FIELD_CLASS, 'font-mono', shownErrors.rccm ? 'border-danger-border' : 'border-[var(--border-default)]']">
                  <span v-if="shownErrors.rccm" class="mt-[7px] block text-[12.5px] font-semibold text-danger-fg">{{ shownErrors.rccm }}</span>
                  <span v-else class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">{{ RCCM_FORMAT_HINT }}</span>
                </label>
              </div>
            </template>
          </div>
          <p class="mb-0 mt-4 text-[12.5px] text-[var(--text-faint)]">Votre numéro Mobile Money vous sera demandé au moment d'un retrait, pas ici.</p>
          <p v-if="coordError" class="mb-0 mt-3 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ coordError }}</p>
        </template>

        <!-- ===== Récapitulatif ===== -->
        <template v-else-if="step === 'recap'">
          <h1 class="m-0 font-display text-[28px] font-bold leading-[1.15] tracking-[-.03em] sm:text-[32px]">Vérifiez avant d'envoyer</h1>
          <p class="mb-0 mt-3 text-[15px] text-[var(--text-muted)]">L'équipe Immo examinera ces éléments. Le résultat s'affichera sur cette page et dans votre espace.</p>
          <div class="mt-6 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white">
            <div class="flex items-start gap-4 px-5 py-4">
              <img v-if="idCardOnFile" :src="idCardPreview.objectUrl.value ?? undefined" alt="" class="h-14 w-20 flex-none rounded-md bg-[var(--surface-page)] object-cover">
              <span v-else class="grid h-14 w-20 flex-none place-items-center rounded-md bg-danger-bg text-danger-fg"><CircleAlert class="h-5 w-5" :stroke-width="1.9" /></span>
              <div class="flex-1">
                <p class="m-0 text-[15px] font-bold">Pièce d'identité</p>
                <p class="mb-0 mt-0.5 text-[13px]" :class="idCardOnFile ? 'text-[var(--text-muted)]' : 'font-semibold text-danger-fg'">{{ idCardOnFile ? (idTypeOption ? idTypeOption.label : 'Déposée') : 'Manquante' }}</p>
              </div>
              <button type="button" class="text-[13.5px] font-bold underline" @click="go('piece')">Modifier</button>
            </div>
            <div class="flex items-start gap-4 border-t border-[var(--border-subtle)] px-5 py-4">
              <div class="flex-1">
                <p class="m-0 text-[15px] font-bold">Justificatifs</p>
                <p v-if="!docs.length" class="mb-0 mt-0.5 text-[13px] font-semibold text-danger-fg">Aucun document</p>
                <p v-for="d in roleDocs.filter(r => docsOf(r.type).length)" :key="d.type" class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">{{ d.label }} · {{ docsOf(d.type).length }}</p>
                <p v-if="otherDocs.length" class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">Autres · {{ otherDocs.length }}</p>
              </div>
              <button type="button" class="text-[13.5px] font-bold underline" @click="go('documents')">Modifier</button>
            </div>
            <div class="flex items-start gap-4 border-t border-[var(--border-subtle)] px-5 py-4">
              <div class="flex-1">
                <p class="m-0 text-[15px] font-bold">Coordonnées</p>
                <p class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">{{ savedProfile?.full_name_masked ? `Nom : ${savedProfile.full_name_masked}` : 'Nom non renseigné' }}</p>
                <p v-if="isBusiness && savedProfile?.ifu_masked" class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">IFU : {{ savedProfile.ifu_masked }}</p>
                <p v-if="isBusiness && savedProfile?.rccm_masked" class="mb-0 mt-0.5 text-[13px] text-[var(--text-muted)]">RCCM : {{ savedProfile.rccm_masked }}</p>
              </div>
              <button type="button" class="text-[13.5px] font-bold underline" @click="go('coordonnees')">Modifier</button>
            </div>
          </div>
          <p v-if="!idCardOnFile || !docs.length" class="mb-0 mt-4 rounded-md border border-warn-border bg-warn-bg px-3.5 py-2.5 text-[13px] font-semibold text-warn-fg">Il manque encore des éléments : l'équipe ne pourra pas valider un dossier incomplet.</p>
        </template>

        <!-- ===== Envoyé ===== -->
        <template v-else>
          <div class="text-center">
            <div class="mx-auto grid h-20 w-20 animate-[im-pop_.5s_ease] place-items-center rounded-pill bg-ok-bg text-ok-fg"><CircleCheck class="h-10 w-10" :stroke-width="1.7" /></div>
            <h1 class="mb-0 mt-6 font-display text-[32px] font-bold tracking-[-.03em]">Dossier envoyé</h1>
            <p class="mx-auto mb-0 mt-3 max-w-[480px] text-[15.5px] leading-[1.6] text-[var(--text-secondary)]">{{ DONE_TEXT[role] }}</p>
          </div>
          <div class="mt-8 rounded-2xl border border-[var(--border-subtle)] bg-white px-5.5 py-2">
            <p class="mb-1 mt-3 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Prochaines étapes</p>
            <div v-for="(s, i) in NEXT_STEPS[role]" :key="s" class="flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0">
              <span class="grid h-7 w-7 flex-none place-items-center rounded-pill font-mono text-[12px] font-bold" :class="i === 0 ? 'bg-green-600 text-white' : 'bg-sand-200 text-[var(--text-muted)]'">{{ i + 1 }}</span>
              <span class="text-sm" :class="i === 0 ? 'font-bold' : 'text-[var(--text-secondary)]'">{{ s }}</span>
            </div>
          </div>
          <div class="mt-7 flex flex-col gap-3 sm:flex-row">
            <NuxtLink :to="backTo ?? SPACE_ROUTE[role]" class="flex-1 rounded-md bg-[image:var(--action-primary)] py-3.5 text-center text-[15px] font-bold text-white shadow-action">{{ backTo ? 'Revenir où j\'en étais' : DONE_CTA[role] }}</NuxtLink>
            <NuxtLink to="/recherche" class="flex-1 rounded-md border border-[var(--border-default)] bg-white py-3.5 text-center text-[15px] font-bold">Parcourir les annonces</NuxtLink>
          </div>
        </template>
      </div>
    </main>

    <footer v-if="showFooter" class="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-white" data-testid="kyc-footer">
      <div class="grid grid-cols-4 gap-1.5" role="progressbar" :aria-valuenow="segment + 1" aria-valuemin="1" :aria-valuemax="PROGRESS_SEGMENTS.length" :aria-label="`Étape ${segment + 1} sur ${PROGRESS_SEGMENTS.length} : ${PROGRESS_SEGMENTS[segment]}`">
        <span v-for="(label, i) in PROGRESS_SEGMENTS" :key="label" class="h-1.5 transition-colors duration-300" :class="i <= segment ? 'bg-green-600' : 'bg-sand-200'" />
      </div>
      <div class="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-5 py-3.5 sm:px-10">
        <CoreButton tone="ghost" :disabled="busy" @click="back">Retour</CoreButton>
        <div class="flex min-w-0 items-center gap-4">
          <p v-if="reason" class="m-0 hidden truncate text-[13px] text-[var(--text-muted)] sm:block">{{ reason }}</p>
          <CoreButton :disabled="!!reason || busy" data-testid="kyc-next" @click="primary">{{ primaryLabel }}</CoreButton>
        </div>
      </div>
      <p v-if="reason" class="m-0 px-5 pb-3 text-center text-[12.5px] text-[var(--text-muted)] sm:hidden">{{ reason }}</p>
    </footer>
  </div>
</template>
