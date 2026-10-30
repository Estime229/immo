<script setup lang="ts">
import { BadgeCheck, Camera, ExternalLink, FileCheck, LoaderCircle, Store } from '@lucide/vue'
import type { NotificationChannel, NotificationPreferences, ProfileMe } from '~/types/profile'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { deriveVerificationNotice, verificationLink } from '~/utils/kycStatus'
import { validateIfu, validateRccm } from '~/utils/onboarding'
import { prepareAvatarUpload } from '~/utils/uploadFile'

definePageMeta({ layout: 'pro' })

/** Profil pro. Onglet dans l'URL (`?tab=securite`), suivi si l'on y revient par un lien. */

const currentUser = useAuthUser()
const authApi = useAuthApi()
const profileApi = useProfileApi()
const settingsApi = useSettingsApi()
const userApi = useUserApi()

type Tab = 'identite' | 'vitrine' | 'securite' | 'verification' | 'notifications'
const TABS: { value: Tab; label: string }[] = [
  { value: 'identite', label: 'Identité' },
  { value: 'vitrine', label: 'Vitrine' },
  { value: 'securite', label: 'Sécurité' },
  { value: 'verification', label: 'Vérification' },
  { value: 'notifications', label: 'Notifications' }
]
const route = useRoute()
const router = useRouter()
const tab = computed<Tab>(() => (TABS.some(t => t.value === route.query.tab) ? route.query.tab as Tab : 'identite'))
function setTab(v: string) {
  const { tab: _, ...rest } = route.query
  router.replace({ query: v === 'identite' ? rest : { ...rest, tab: v } })
}

/* ---- Identité (profil pro) ---- */
const profile = ref<ProfileMe | null>(null)
const profileState = ref<'loading' | 'success' | 'error'>('loading')
async function loadProfile() {
  profileState.value = 'loading'
  try {
    profile.value = await profileApi.fetchMe()
    profileState.value = 'success'
  } catch {
    profileState.value = 'error'
  }
}
onMounted(loadProfile)


const displayName = computed(() => {
  const u = currentUser.value
  if (!u) return 'Vous'
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email
})

/* ---- Photo de profil ---- */
const avatarUploading = ref(false)
const avatarError = ref('')
const avatarInput = ref<HTMLInputElement | null>(null)
async function onAvatarSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  avatarUploading.value = true
  avatarError.value = ''
  try {
    const ready = await prepareAvatarUpload(file)
    if (ready.error || !ready.file) { avatarError.value = ready.error || "Cette image n'a pas pu être préparée."; return }
    await userApi.uploadAvatar(ready.file)
    await authApi.fetchMe()
  } catch (err) {
    avatarError.value = err instanceof ApiRequestError ? errorText(err.mapped, "L'envoi de la photo a échoué.") : "L'envoi de la photo a échoué."
  } finally {
    avatarUploading.value = false
    if (avatarInput.value) avatarInput.value.value = ''
  }
}

const fullName = ref('')
const company = ref('')
const ifu = ref('')
const rccm = ref('')
const savingProfile = ref(false)
const profileSaveError = ref('')
const profileSaved = ref(false)
async function saveProfile() {
  profileSaved.value = false
  profileSaveError.value = validateIfu(ifu.value) ?? validateRccm(rccm.value) ?? ''
  if (profileSaveError.value) return
  savingProfile.value = true
  try {
    const payload: Record<string, unknown> = {}
    if (fullName.value.trim()) payload.full_name = fullName.value.trim()
    if (company.value.trim()) payload.company = company.value.trim()
    if (ifu.value.trim()) payload.ifu = ifu.value.trim()
    if (rccm.value.trim()) payload.rccm = rccm.value.trim()
    if (Object.keys(payload).length === 0) return
    await profileApi.update(payload)
    fullName.value = ''
    company.value = ''
    ifu.value = ''
    rccm.value = ''
    profileSaved.value = true
    await loadProfile()
  } catch (e) {
    profileSaveError.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'enregistrement a échoué.") : "L'enregistrement a échoué."
  } finally {
    savingProfile.value = false
  }
}

const KYB: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' }> = {
  pending: { label: "En cours d'examen", tone: 'info' },
  approved: { label: 'Vérifiée', tone: 'ok' },
  rejected: { label: 'Refusée', tone: 'danger' }
}

/**
 * Vérification d'identité : même étape que les bandeaux de l'espace
 * (`useVerification`, fondée sur `is_verified`) — `kyc_status` seul repasse à
 * `pending` à chaque modification du profil (#7) et ne dit pas si un dossier existe.
 */
const verification = useVerification()
onMounted(() => { void verification.refreshSubmitted() })
const KYC_STAGE: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' }> = {
  verified: { label: 'Vérifiée', tone: 'ok' },
  review: { label: "En cours d'examen", tone: 'info' },
  rejected: { label: 'Refusée', tone: 'danger' },
  todo: { label: 'À faire', tone: 'warn' }
}
const kycNotice = computed(() => deriveVerificationNotice(verification.stage.value, 'pro'))
const kycLink = verificationLink('/pro/profil?tab=verification')

/* ---- Sécurité : mot de passe ---- */
const pwStep = ref<'form' | 'done'>('form')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const pwLoading = ref(false)
const pwError = ref('')
const recoveryCodes = ref<string[] | null>(null)
async function submitPassword() {
  if (newPassword.value.length < 8) { pwError.value = 'Le mot de passe doit contenir au moins 8 caractères.'; return }
  if (newPassword.value !== confirmPassword.value) { pwError.value = 'Les mots de passe ne correspondent pas.'; return }
  pwLoading.value = true
  pwError.value = ''
  try {
    const result = await authApi.setPassword({ new_password: newPassword.value, current_password: currentUser.value?.has_password ? currentPassword.value : undefined })
    recoveryCodes.value = result.recovery_codes?.length ? result.recovery_codes : null
    pwStep.value = 'done'
    if (currentUser.value) currentUser.value.has_password = true
  } catch (e) {
    pwError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Une erreur est survenue.') : 'Une erreur est survenue.'
  } finally {
    pwLoading.value = false
  }
}

const deleteStep = ref<'idle' | 'confirm' | 'loading'>('idle')
const deleteError = ref('')
async function confirmDelete() {
  deleteStep.value = 'loading'
  deleteError.value = ''
  try {
    await userApi.deleteAccount()
    await authApi.logout()
    await navigateTo('/')
  } catch (e) {
    deleteError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La suppression a échoué.') : 'La suppression a échoué.'
    deleteStep.value = 'confirm'
  }
}

const profileRows = computed(() => profile.value
  ? [
      { label: "Nom légal (pièce d'identité)", value: profile.value.full_name_masked },
      { label: 'Raison sociale', value: profile.value.company_masked },
      { label: 'IFU', value: profile.value.ifu_masked },
      { label: 'RCCM', value: profile.value.rccm_masked }
    ]
  : [])

/* ---- Notifications ---- */
const notifPrefs = ref<NotificationPreferences | null>(null)
const notifState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
async function loadNotifPrefs() {
  notifState.value = 'loading'
  try {
    notifPrefs.value = await settingsApi.fetchNotificationPrefs()
    notifState.value = 'success'
  } catch {
    notifState.value = 'error'
  }
}
onMounted(loadNotifPrefs)
const CHANNEL_DEFS: { key: NotificationChannel; label: string; hint: string }[] = [
  { key: 'email', label: 'E-mail', hint: 'Loyers reçus, messages, mises à jour de compte' },
  { key: 'sms', label: 'SMS', hint: 'Alertes importantes uniquement' },
  { key: 'push', label: 'Notifications push', hint: 'Sur cet appareil, en temps réel' }
]
const togglingChannel = ref<NotificationChannel | null>(null)
/** Échec du basculement : dit sous la ligne concernée, l'interrupteur reste à son état réel. */
const channelError = ref<{ channel: NotificationChannel; message: string } | null>(null)
async function toggleChannel(channel: NotificationChannel) {
  if (!notifPrefs.value || togglingChannel.value) return
  const next = !notifPrefs.value[channel]
  togglingChannel.value = channel
  channelError.value = null
  try {
    await settingsApi.toggleNotificationChannel(channel, next)
    notifPrefs.value[channel] = next
  } catch (e) {
    const fallback = next ? "Ce canal n'a pas pu être activé. Réessayez." : "Ce canal n'a pas pu être désactivé. Réessayez."
    channelError.value = { channel, message: e instanceof ApiRequestError ? errorText(e.mapped, fallback) : fallback }
  } finally {
    togglingChannel.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-4.5 max-w-full overflow-x-auto [&_button]:whitespace-nowrap">
      <FormsSegmentedControl :options="TABS" :model-value="tab" size="sm" @update:model-value="setTab" />
    </div>

    <!-- ===== Identité ===== -->
    <div v-if="tab === 'identite'" class="flex max-w-[680px] flex-col gap-4.5">
      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <div class="flex items-center gap-4">
          <div class="relative flex-none">
            <CoreAvatar :name="displayName" :avatar-url="currentUser?.avatar_url" :size="64" color="var(--color-green-700)" />
            <label class="absolute -bottom-1 -right-1 grid h-7 w-7 cursor-pointer place-items-center rounded-pill border-2 border-white bg-green-600 text-white shadow-card" :class="{ 'pointer-events-none opacity-60': avatarUploading }" aria-label="Changer la photo de profil">
              <LoaderCircle v-if="avatarUploading" class="h-3.5 w-3.5 animate-spin" :stroke-width="2" />
              <Camera v-else class="h-3.5 w-3.5" :stroke-width="2" />
              <input ref="avatarInput" type="file" accept="image/*" class="hidden" :disabled="avatarUploading" @change="onAvatarSelected">
            </label>
          </div>
          <div class="min-w-0">
            <p class="m-0 font-display text-lg font-bold">{{ displayName }}</p>
            <p class="mb-0 mt-0.5 text-xs text-[var(--text-faint)]">Photo visible sur votre vitrine et dans vos conversations.</p>
            <p v-if="avatarError" class="mb-0 mt-1 text-[13px] font-semibold text-danger-fg">{{ avatarError }}</p>
          </div>
        </div>

        <h2 class="mb-1 mt-5 text-[15px] font-bold">Coordonnées</h2>
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-sand-200 py-3">
          <span class="text-[13.5px] text-[var(--text-muted)]">E-mail</span>
          <span class="text-sm font-semibold [overflow-wrap:anywhere]">{{ currentUser?.email }}</span>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-sand-200 py-3 last:border-b-0">
          <span class="text-[13.5px] text-[var(--text-muted)]">Téléphone</span>
          <span class="font-mono text-sm font-semibold">{{ currentUser?.phone_number || 'Non renseigné' }}</span>
        </div>
        <template v-if="profile">
          <div v-for="row in profileRows" :key="row.label" class="flex flex-wrap items-center justify-between gap-2 border-b border-sand-200 py-3 last:border-b-0">
            <span class="text-[13.5px] text-[var(--text-muted)]">{{ row.label }}</span>
            <CoreBadge :tone="row.value ? 'ok' : 'neutral'">{{ row.value ? 'Renseigné' : 'Non renseigné' }}</CoreBadge>
          </div>
        </template>
        <p v-else-if="profileState === 'error'" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">
          Votre identité professionnelle n'a pas pu être chargée. <button type="button" class="font-bold underline" @click="loadProfile">Réessayer</button>
        </p>
      </section>

      <LayoutAccountNameForm />

      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <h2 class="m-0 text-[15px] font-bold">Modifier mon identité pro</h2>
        <p class="mb-4 mt-1 text-[13.5px] text-[var(--text-muted)]">Ces informations sont chiffrées et ne sont jamais réaffichées en clair. Ne remplissez que ce que vous voulez changer.</p>
        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <FormsInput v-model="fullName" class="sm:col-span-2" label="Nom légal (pièce d'identité)" placeholder="ex. Koffi Dossou" />
          <FormsInput v-model="company" class="sm:col-span-2" label="Raison sociale" placeholder="ex. Agence Immo Cotonou" />
          <FormsInput v-model="ifu" label="IFU" placeholder="13 chiffres" mono />
          <FormsInput v-model="rccm" label="RCCM" placeholder="ex. RB/COT/25 A 1234" mono />
        </div>
        <p v-if="profileSaveError" class="mb-0 mt-3.5 text-[13px] font-semibold text-danger-fg">{{ profileSaveError }}</p>
        <p v-if="profileSaved" class="mb-0 mt-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">Identité pro mise à jour.</p>
        <CoreButton class="mt-4" :disabled="savingProfile" @click="saveProfile">{{ savingProfile ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
      </section>
    </div>

    <!-- ===== Vitrine ===== -->
    <section v-else-if="tab === 'vitrine'" class="flex max-w-[680px] flex-wrap items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <span class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-green-50 text-green-700"><Store class="h-5 w-5" :stroke-width="1.9" /></span>
      <div class="min-w-0 flex-[1_1_260px]">
        <h2 class="m-0 text-[15px] font-bold">Votre vitrine publique</h2>
        <p class="mb-0 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Visible par toute personne qui consulte un de vos biens publiés : votre nom, vos biens publiés et vos avis.</p>
      </div>
      <NuxtLink v-if="currentUser" :to="`/vitrine/${currentUser.id}`" target="_blank" class="inline-flex items-center gap-1.5 rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-[14px] font-bold text-white shadow-action">
        Voir ma vitrine <ExternalLink class="h-4 w-4" :stroke-width="1.9" />
      </NuxtLink>
    </section>

    <!-- ===== Sécurité ===== -->
    <div v-else-if="tab === 'securite'" class="flex max-w-[680px] flex-col gap-4.5">
      <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <template v-if="pwStep === 'form'">
          <h2 class="m-0 text-[15px] font-bold">{{ currentUser?.has_password ? 'Changer mon mot de passe' : 'Créer un mot de passe' }}</h2>
          <p class="mb-4 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">{{ currentUser?.has_password ? 'Saisissez votre mot de passe actuel, puis le nouveau.' : "Votre compte a été créé par code e-mail. Un mot de passe vous évite d'attendre un code à chaque connexion." }}</p>
          <div class="flex flex-col gap-3">
            <FormsInput v-if="currentUser?.has_password" v-model="currentPassword" type="password" label="Mot de passe actuel" />
            <FormsInput v-model="newPassword" type="password" label="Nouveau mot de passe" hint="8 caractères minimum." />
            <FormsInput v-model="confirmPassword" type="password" label="Confirmer le mot de passe" />
          </div>
          <p v-if="pwError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ pwError }}</p>
          <CoreButton class="mt-4" :disabled="pwLoading || !newPassword" @click="submitPassword">{{ pwLoading ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
        </template>
        <template v-else>
          <p class="m-0 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">Mot de passe enregistré.</p>
          <template v-if="recoveryCodes">
            <p class="mb-3 mt-3.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Conservez ces codes de récupération dans un endroit sûr : ils ne seront plus jamais affichés.</p>
            <div class="grid grid-cols-2 gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-page)] p-3.5 font-mono text-[13px] font-bold">
              <span v-for="c in recoveryCodes" :key="c">{{ c }}</span>
            </div>
          </template>
        </template>
      </section>

      <section class="rounded-2xl border border-danger-border bg-white p-5.5">
        <h2 class="m-0 text-[15px] font-bold text-danger-fg">Supprimer mon compte</h2>
        <p class="mb-3.5 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Vos biens actifs et vos baux en cours doivent d'abord être clôturés. La suppression est définitive.</p>
        <CoreInlineConfirm
          v-if="deleteStep !== 'idle'"
          tone="danger"
          message="Supprimer définitivement votre compte ? Vous serez déconnecté et ne pourrez plus y accéder."
          confirm-label="Supprimer"
          :loading="deleteStep === 'loading'"
          @confirm="confirmDelete"
          @cancel="deleteStep = 'idle'; deleteError = ''"
        />
        <CoreButton v-else size="sm" tone="secondary" @click="deleteStep = 'confirm'">Supprimer le compte</CoreButton>
        <p v-if="deleteError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ deleteError }}</p>
      </section>
    </div>

    <!-- ===== Vérification ===== -->
    <section v-else-if="tab === 'verification'" class="max-w-[680px] rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <h2 class="m-0 text-[15px] font-bold">Statut de vérification</h2>
      <p class="mb-3 mt-1 text-[13.5px] text-[var(--text-muted)]">Publier ou modifier un bien, et demander un artisan, exigent une identité vérifiée.</p>
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-sand-200 py-3">
        <span class="inline-flex items-center gap-2 text-[13.5px] text-[var(--text-secondary)]"><BadgeCheck class="h-4 w-4 text-[var(--text-faint)]" :stroke-width="1.9" />Identité (KYC)</span>
        <CoreBadge :tone="KYC_STAGE[verification.stage.value]?.tone ?? 'neutral'">{{ KYC_STAGE[verification.stage.value]?.label ?? 'Inconnu' }}</CoreBadge>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 py-3">
        <span class="inline-flex items-center gap-2 text-[13.5px] text-[var(--text-secondary)]"><FileCheck class="h-4 w-4 text-[var(--text-faint)]" :stroke-width="1.9" />Activité professionnelle (KYB)</span>
        <CoreBadge v-if="profileState === 'loading'" tone="neutral">Chargement…</CoreBadge>
        <CoreBadge v-else-if="profileState === 'error'" tone="neutral">Indisponible</CoreBadge>
        <CoreBadge v-else :tone="KYB[profile?.landlord_kyb_status ?? '']?.tone ?? 'neutral'">{{ KYB[profile?.landlord_kyb_status ?? '']?.label ?? 'Non commencée' }}</CoreBadge>
      </div>

      <div v-if="kycNotice" class="mt-3 rounded-md border p-3.5" :class="kycNotice.tone === 'danger' ? 'border-danger-border bg-danger-bg' : kycNotice.tone === 'info' ? 'border-info-border bg-info-bg' : 'border-warn-border bg-warn-bg'">
        <p class="m-0 text-[13px] leading-[1.55]" :class="kycNotice.tone === 'danger' ? 'text-danger-fg-deep' : kycNotice.tone === 'info' ? 'text-info-fg-deep' : 'text-warn-fg-deep'">{{ kycNotice.text }}</p>
        <NuxtLink
          :to="kycLink"
          class="mt-3 inline-flex items-center rounded-md px-5 py-3 text-[14px] font-bold"
          :class="verification.stage.value === 'review' ? 'border border-[var(--border-default)] bg-white text-sand-900' : 'bg-[image:var(--action-primary)] text-white shadow-action'"
        >{{ kycNotice.cta }}</NuxtLink>
      </div>
      <p v-else class="mb-0 mt-3 text-[13px] text-[var(--text-muted)]">
        Votre identité est vérifiée. <NuxtLink :to="kycLink" class="font-bold text-green-700">Voir mes documents</NuxtLink>
      </p>
    </section>

    <!-- ===== Notifications ===== -->
    <section v-else class="max-w-[680px] rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
      <h2 class="m-0 text-[15px] font-bold">Canaux de notification</h2>
      <p class="mb-2 mt-1 text-[13.5px] text-[var(--text-muted)]">Chaque réglage s'applique tout de suite.</p>
      <div v-if="notifState === 'loading' || notifState === 'idle'" class="flex flex-col gap-2.5 pt-2">
        <DataSkeletonCard v-for="i in 3" :key="i" :height="44" :lines="0" />
      </div>
      <p v-else-if="notifState === 'error'" class="m-0 py-3 text-[13px] font-semibold text-danger-fg">
        Impossible de charger vos préférences. <button type="button" class="font-bold underline" @click="loadNotifPrefs">Réessayer</button>
      </p>
      <template v-else-if="notifPrefs">
        <div v-for="c in CHANNEL_DEFS" :key="c.key" class="border-b border-sand-200 py-3.5 last:border-b-0" :class="togglingChannel === c.key ? 'opacity-60' : ''">
          <FormsToggle :model-value="notifPrefs[c.key]" :label="c.label" :hint="c.hint" @update:model-value="toggleChannel(c.key)" />
          <p v-if="channelError?.channel === c.key" class="mb-0 mt-2 text-[13px] font-semibold text-danger-fg">{{ channelError.message }}</p>
        </div>
      </template>
    </section>
  </div>
</template>
