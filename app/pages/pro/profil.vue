<script setup lang="ts">
import type { NotificationChannel, NotificationPreferences, ProfileMe } from '~/types/profile'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'pro' })

const currentUser = useAuthUser()
const authApi = useAuthApi()
const profileApi = useProfileApi()
const settingsApi = useSettingsApi()
const userApi = useUserApi()

const tab = ref<'identite' | 'vitrine' | 'securite' | 'verification' | 'prefs' | 'notifications'>('identite')
const TABS = [
  { key: 'identite' as const, label: 'Identité' },
  { key: 'vitrine' as const, label: 'Vitrine' },
  { key: 'securite' as const, label: 'Sécurité' },
  { key: 'verification' as const, label: 'Vérification' },
  { key: 'prefs' as const, label: 'Préférences' },
  { key: 'notifications' as const, label: 'Notifications' }
]

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

function maskedStatus(v: string | null) {
  return v ? 'Renseigné' : 'Non renseigné'
}

const fullName = ref('')
const company = ref('')
const ifu = ref('')
const rccm = ref('')
const savingProfile = ref(false)
const profileSaveError = ref('')
const profileSaved = ref(false)
async function saveProfile() {
  savingProfile.value = true
  profileSaveError.value = ''
  profileSaved.value = false
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
    profileSaveError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'enregistrement a échoué.") : "L'enregistrement a échoué."
  } finally {
    savingProfile.value = false
  }
}

const KYB_LABEL: Record<string, string> = { pending: 'En cours de vérification', approved: 'Vérifiée', rejected: 'Rejetée' }

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
    pwError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Une erreur est survenue.') : 'Une erreur est survenue.'
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
    deleteError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'La suppression a échoué.') : 'La suppression a échoué.'
    deleteStep.value = 'confirm'
  }
}

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
async function toggleChannel(channel: NotificationChannel) {
  if (!notifPrefs.value || togglingChannel.value) return
  const next = !notifPrefs.value[channel]
  togglingChannel.value = channel
  try {
    await settingsApi.toggleNotificationChannel(channel, next)
    notifPrefs.value[channel] = next
  } catch {
    // état inchangé
  } finally {
    togglingChannel.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex flex-wrap gap-1.5">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="rounded-pill border px-4 py-2.5 text-[13px] font-bold transition-all"
        :class="tab === t.key ? 'border-green-900 bg-green-900 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
        @click="tab = t.key"
      >{{ t.label }}</button>
    </div>

    <template v-if="tab === 'identite'">
      <div class="max-w-[640px] rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
        <p class="mb-4 mt-0 text-[15px] font-bold">Identité</p>
        <div class="flex justify-between border-b border-sand-200 py-3.5">
          <span class="text-[13.5px] text-[var(--text-faint)]">E-mail</span>
          <span class="text-sm font-semibold">{{ currentUser?.email }}</span>
        </div>
        <div class="flex justify-between border-b border-sand-200 py-3.5">
          <span class="text-[13.5px] text-[var(--text-faint)]">Téléphone</span>
          <span class="text-sm font-semibold">{{ currentUser?.phone_number || 'Non renseigné' }}</span>
        </div>
        <template v-if="profile">
          <div class="flex justify-between border-b border-sand-200 py-3.5">
            <span class="text-[13.5px] text-[var(--text-faint)]">Nom complet</span>
            <span class="text-sm font-semibold">{{ maskedStatus(profile.full_name_masked) }}</span>
          </div>
          <div class="flex justify-between border-b border-sand-200 py-3.5">
            <span class="text-[13.5px] text-[var(--text-faint)]">Raison sociale</span>
            <span class="text-sm font-semibold">{{ maskedStatus(profile.company_masked) }}</span>
          </div>
          <div class="flex justify-between border-b border-sand-200 py-3.5">
            <span class="text-[13.5px] text-[var(--text-faint)]">IFU</span>
            <span class="text-sm font-semibold">{{ maskedStatus(profile.ifu_masked) }}</span>
          </div>
          <div class="flex justify-between py-3.5">
            <span class="text-[13.5px] text-[var(--text-faint)]">RCCM</span>
            <span class="text-sm font-semibold">{{ maskedStatus(profile.rccm_masked) }}</span>
          </div>
        </template>
      </div>

      <div class="mt-4.5 max-w-[640px] rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
        <p class="m-0 text-base font-bold">Modifier mon identité pro</p>
        <p class="mb-4 mt-1 text-[13px] text-[var(--text-muted)]">Ces informations sont chiffrées côté serveur — jamais réaffichées en clair.</p>
        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">Nom complet</label>
            <input v-model="fullName" placeholder="Ex. Koffi Dossou" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
          </div>
          <div class="sm:col-span-2">
            <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">Raison sociale</label>
            <input v-model="company" placeholder="Ex. Agence Immo Cotonou" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
          </div>
          <div>
            <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">IFU</label>
            <input v-model="ifu" placeholder="13 chiffres" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
          </div>
          <div>
            <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">RCCM</label>
            <input v-model="rccm" placeholder="Ex. RB/COT/24 B 6789" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
          </div>
        </div>
        <p v-if="profileSaveError" class="mb-0 mt-3.5 text-[13px] font-semibold text-danger-fg">{{ profileSaveError }}</p>
        <p v-if="profileSaved" class="mb-0 mt-3.5 text-[13px] font-semibold text-ok-fg">Profil mis à jour.</p>
        <CoreButton class="mt-4" :disabled="savingProfile" @click="saveProfile">{{ savingProfile ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
      </div>
    </template>

    <template v-else-if="tab === 'vitrine'">
      <div class="max-w-[640px] rounded-2xl border border-[var(--border-subtle)] bg-white p-6 text-center">
        <p class="mb-2 mt-0 text-[15px] font-bold">Votre vitrine publique</p>
        <p class="mx-auto mb-4 mt-0 max-w-[440px] text-[13.5px] leading-[1.6] text-[var(--text-muted)]">
          Visible par toute personne consultant un de vos biens listés publiquement — nom, biens publiés, avis.
        </p>
        <NuxtLink v-if="currentUser" :to="`/vitrine/${currentUser.id}`" target="_blank" class="inline-block rounded-md bg-[image:var(--action-primary)] px-6 py-3 text-[13.5px] font-bold text-white shadow-action">Voir ma vitrine</NuxtLink>
      </div>
    </template>

    <template v-else-if="tab === 'securite'">
      <div class="flex max-w-[640px] flex-col gap-3.5">
        <div class="rounded-xl border border-[var(--border-subtle)] bg-white p-5.5">
          <template v-if="pwStep === 'form'">
            <p class="m-0 text-[15px] font-bold">{{ currentUser?.has_password ? 'Changer mon mot de passe' : 'Créer un mot de passe' }}</p>
            <p class="mb-3.5 mt-1.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">{{ currentUser?.has_password ? 'Modifiez votre mot de passe actuel.' : "Votre compte a été créé par code email. Définissez un mot de passe pour ne plus dépendre d'un aller-retour à chaque connexion." }}</p>
            <div class="flex flex-col gap-2.5">
              <input v-if="currentUser?.has_password" v-model="currentPassword" type="password" placeholder="Mot de passe actuel" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
              <input v-model="newPassword" type="password" placeholder="Nouveau mot de passe (8 caractères min.)" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
              <input v-model="confirmPassword" type="password" placeholder="Confirmer le mot de passe" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
            </div>
            <p v-if="pwError" class="mb-0 mt-3 text-[13px] font-semibold text-danger-fg">{{ pwError }}</p>
            <CoreButton class="mt-3.5" :disabled="pwLoading || !newPassword" @click="submitPassword">{{ pwLoading ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
          </template>
          <template v-else>
            <p class="m-0 text-[15px] font-bold text-ok-fg">Mot de passe enregistré</p>
            <template v-if="recoveryCodes">
              <p class="mb-3 mt-1.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Conservez ces codes de récupération dans un endroit sûr — ils ne seront plus jamais affichés.</p>
              <div class="grid grid-cols-2 gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-page)] p-3.5 font-mono text-[13px] font-bold">
                <span v-for="c in recoveryCodes" :key="c">{{ c }}</span>
              </div>
            </template>
            <p v-else class="mb-0 mt-1.5 text-[13.5px] text-[var(--text-muted)]">Votre mot de passe a bien été mis à jour.</p>
          </template>
        </div>

        <div class="rounded-xl border border-danger-border bg-danger-bg p-5.5">
          <p class="m-0 text-[15px] font-bold text-danger-fg">Supprimer mon compte</p>
          <p class="mb-3.5 mt-1.5 text-[13.5px] leading-[1.55] text-danger-fg-deep">Vos biens actifs et vos baux en cours doivent d'abord être clôturés. La suppression est définitive.</p>
          <p v-if="deleteError" class="mb-3 mt-0 text-[13px] font-semibold text-danger-fg">{{ deleteError }}</p>
          <button v-if="deleteStep === 'idle'" type="button" class="rounded-md border border-danger-border bg-white px-4.5 py-2.5 text-[13px] font-bold text-danger-fg" @click="deleteStep = 'confirm'">Supprimer le compte</button>
          <div v-else class="flex items-center gap-2.5">
            <span class="text-[13px] font-bold text-danger-fg-deep">Confirmer la suppression définitive ?</span>
            <button type="button" class="rounded-md bg-danger-fg px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60" :disabled="deleteStep === 'loading'" @click="confirmDelete">{{ deleteStep === 'loading' ? '…' : 'Oui, supprimer' }}</button>
            <button type="button" class="rounded-md border border-danger-border bg-white px-4 py-2.5 text-[13px] font-bold text-danger-fg" @click="deleteStep = 'idle'">Annuler</button>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="tab === 'verification'">
      <div class="max-w-[640px] rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
        <p class="mb-1 mt-0 text-[15px] font-bold">Statut de vérification</p>
        <p class="mb-4 mt-0 text-[13px] text-[var(--text-muted)]">Publier un bien exige un compte vérifié.</p>
        <div class="flex items-center justify-between border-b border-sand-200 py-3.5">
          <span class="text-[13.5px] text-[var(--text-faint)]">Identité (KYC)</span>
          <CoreBadge :tone="profile?.kyc_status === 'verified' ? 'ok' : 'warn'">{{ profile?.kyc_status === 'verified' ? 'Vérifiée' : (profile?.kyc_status ?? 'inconnu') }}</CoreBadge>
        </div>
        <div class="flex items-center justify-between py-3.5">
          <span class="text-[13.5px] text-[var(--text-faint)]">Activité professionnelle (KYB)</span>
          <CoreBadge :tone="profile?.landlord_kyb_status === 'approved' ? 'ok' : 'warn'">{{ profile?.landlord_kyb_status ? (KYB_LABEL[profile.landlord_kyb_status] ?? profile.landlord_kyb_status) : 'Non commencée' }}</CoreBadge>
        </div>
        <NuxtLink to="/kyc" class="mt-4 inline-block rounded-md bg-[image:var(--action-primary)] px-5.5 py-3 text-[13.5px] font-bold text-white shadow-action">Déposer mes documents</NuxtLink>
      </div>
    </template>

    <template v-else-if="tab === 'prefs'">
      <div class="max-w-[640px] rounded-xl border border-dashed border-[var(--border-default)] bg-white p-10 text-center text-sm text-[var(--text-muted)]">
        Il n'existe pas de préférences globales par compte côté API pour l'instant — la relance, le prélèvement automatique, la retenue de garantie et l'exigence d'état des lieux se règlent bail par bail ou logement par logement, pas ici.
      </div>
    </template>

    <template v-else>
      <div class="max-w-[640px] rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
        <p v-if="notifState === 'loading'" class="m-0 text-[13px] text-[var(--text-muted)]">Chargement…</p>
        <p v-else-if="notifState === 'error'" class="m-0 text-[13px] text-danger-fg">Impossible de charger vos préférences.</p>
        <template v-else-if="notifPrefs">
          <label v-for="c in CHANNEL_DEFS" :key="c.key" class="flex cursor-pointer items-center justify-between gap-4 border-b border-sand-200 py-3.5 last:border-b-0" @click.prevent="toggleChannel(c.key)">
            <div>
              <p class="m-0 text-[14.5px] font-semibold">{{ c.label }}</p>
              <p class="mb-0 mt-1 text-xs text-[var(--text-faint)]">{{ c.hint }}</p>
            </div>
            <span
              class="block h-[27px] w-[46px] flex-none rounded-pill p-[3px] transition-colors"
              :class="[notifPrefs[c.key] ? 'bg-green-600' : 'bg-[var(--border-default)]', togglingChannel === c.key ? 'opacity-60' : '']"
            >
              <span class="block h-[21px] w-[21px] rounded-pill bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)] transition-transform" :style="{ transform: notifPrefs[c.key] ? 'translateX(19px)' : 'translateX(0)' }" />
            </span>
          </label>
        </template>
      </div>
    </template>
  </div>
</template>
