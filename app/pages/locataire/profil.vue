<script setup lang="ts">
import type { NotificationChannel, NotificationPreferences, ProfileMe } from '~/types/profile'
import { ApiRequestError } from '~/utils/authenticatedFetcher'

definePageMeta({ layout: 'locataire' })

const currentUser = useAuthUser()
const authApi = useAuthApi()
const profileApi = useProfileApi()
const settingsApi = useSettingsApi()
const userApi = useUserApi()

const tab = ref<'infos' | 'securite' | 'notifs'>('infos')
const TABS = [
  { key: 'infos' as const, label: 'Informations' },
  { key: 'securite' as const, label: 'Sécurité' },
  { key: 'notifs' as const, label: 'Notifications' }
]

const displayName = computed(() => {
  const u = currentUser.value
  if (!u) return ''
  const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
  return name || u.email
})

function maskedStatus(v: string | null) {
  return v ? 'Renseigné' : 'Non renseigné'
}

/* ---- Profil (informations éditables) ---- */
const profile = ref<ProfileMe | null>(null)
const profileState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
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

const fullName = ref('')
const profession = ref('')
const emergencyContact = ref('')
const zones = ref<string[]>([])
const zoneInput = ref('')
const budgetMin = ref('')
const budgetMax = ref('')

watch(profile, p => {
  zones.value = p?.preferred_zones ? [...p.preferred_zones] : []
  budgetMin.value = p?.budget_min ?? ''
  budgetMax.value = p?.budget_max ?? ''
})

function addZone() {
  const z = zoneInput.value.trim()
  if (z && !zones.value.includes(z)) zones.value = [...zones.value, z]
  zoneInput.value = ''
}
function removeZone(z: string) {
  zones.value = zones.value.filter(x => x !== z)
}

const savingProfile = ref(false)
const profileSaveError = ref('')
const profileSaved = ref(false)
async function saveProfile() {
  savingProfile.value = true
  profileSaveError.value = ''
  profileSaved.value = false
  try {
    const payload: Record<string, unknown> = { preferred_zones: zones.value }
    if (fullName.value.trim()) payload.full_name = fullName.value.trim()
    if (profession.value.trim()) payload.profession = profession.value.trim()
    if (emergencyContact.value.trim()) payload.emergency_contact = emergencyContact.value.trim()
    if (budgetMin.value) payload.budget_min = budgetMin.value
    if (budgetMax.value) payload.budget_max = budgetMax.value
    await profileApi.update(payload)
    fullName.value = ''
    profession.value = ''
    emergencyContact.value = ''
    profileSaved.value = true
    await loadProfile()
  } catch (e) {
    profileSaveError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? "L'enregistrement a échoué.") : "L'enregistrement a échoué."
  } finally {
    savingProfile.value = false
  }
}

const idCopied = ref(false)
async function copyId() {
  try {
    await navigator.clipboard.writeText(currentUser.value?.email ?? '')
    idCopied.value = true
    setTimeout(() => { idCopied.value = false }, 2000)
  } catch {
    idCopied.value = false
  }
}

/* ---- Sécurité : mot de passe ---- */
const pwStep = ref<'form' | 'done'>('form')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const pwLoading = ref(false)
const pwError = ref('')
const recoveryCodes = ref<string[] | null>(null)

async function submitPassword() {
  if (newPassword.value.length < 8) {
    pwError.value = 'Le mot de passe doit contenir au moins 8 caractères.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    pwError.value = 'Les mots de passe ne correspondent pas.'
    return
  }
  pwLoading.value = true
  pwError.value = ''
  try {
    const result = await authApi.setPassword({
      new_password: newPassword.value,
      current_password: currentUser.value?.has_password ? currentPassword.value : undefined
    })
    recoveryCodes.value = result.recovery_codes?.length ? result.recovery_codes : null
    pwStep.value = 'done'
    if (currentUser.value) currentUser.value.has_password = true
  } catch (e) {
    pwError.value = e instanceof ApiRequestError ? (e.mapped.bannerMessage ?? 'Une erreur est survenue.') : 'Une erreur est survenue.'
  } finally {
    pwLoading.value = false
  }
}

/* ---- Sécurité : suppression de compte ---- */
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

/* ---- Notifications : préférences par canal ---- */
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
  { key: 'email', label: 'E-mail', hint: 'Loyers, messages, mises à jour de compte' },
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
    // état inchangé, pas de correction optimiste à annuler ici
  } finally {
    togglingChannel.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_both]">
    <div class="mb-5 flex flex-wrap items-center gap-1.5">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="rounded-pill border px-4 py-2.5 text-[13px] font-bold transition-all"
        :class="tab === t.key ? 'border-green-900 bg-green-900 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
        @click="tab = t.key"
      >{{ t.label }}</button>
      <NuxtLink to="/kyc" class="rounded-pill border border-[var(--border-default)] bg-white px-4 py-2.5 text-[13px] font-bold text-[var(--text-secondary)]">Vérification</NuxtLink>
    </div>

    <template v-if="tab === 'infos'">
      <div class="grid grid-cols-1 gap-4.5 lg:grid-cols-2">
        <div class="rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
          <div class="flex items-center gap-4">
            <CoreAvatar :name="displayName" :size="72" color="var(--color-green-700)" />
            <div>
              <p class="m-0 font-display text-xl font-bold tracking-[-.02em]">{{ displayName }}</p>
              <p class="mb-0 mt-1 text-[13px] text-[var(--text-muted)]">Locataire</p>
            </div>
          </div>
          <div class="mt-5">
            <div class="flex items-center justify-between border-b border-sand-200 py-3.5">
              <span class="text-[13.5px] text-[var(--text-faint)]">Téléphone</span>
              <span class="text-sm font-semibold">{{ currentUser?.phone_number || 'Non renseigné' }}</span>
            </div>
            <div class="flex items-center justify-between border-b border-sand-200 py-3.5">
              <span class="text-[13.5px] text-[var(--text-faint)]">E-mail</span>
              <span class="text-sm font-semibold">{{ currentUser?.email }}</span>
            </div>
            <div v-if="profile" class="flex items-center justify-between border-b border-sand-200 py-3.5">
              <span class="text-[13.5px] text-[var(--text-faint)]">Nom complet</span>
              <span class="text-sm font-semibold">{{ maskedStatus(profile.full_name_masked) }}</span>
            </div>
            <div v-if="profile" class="flex items-center justify-between py-3.5">
              <span class="text-[13.5px] text-[var(--text-faint)]">Profession</span>
              <span class="text-sm font-semibold">{{ maskedStatus(profile.profession_masked) }}</span>
            </div>
          </div>
        </div>
        <div class="self-start rounded-2xl border border-green-100 bg-green-50 p-6">
          <p class="m-0 text-[13px] font-black uppercase tracking-[.05em] text-green-700">Mon identifiant locataire</p>
          <p class="mb-0 mt-3 text-sm leading-[1.55] text-green-800">Communiquez cette adresse à un propriétaire pour qu'il crée votre bail — plus jamais d'identifiant technique à recopier.</p>
          <div class="mt-3.5 flex items-center gap-2.5 rounded-md border border-green-100 bg-white px-4 py-3.5">
            <span class="flex-1 truncate font-mono text-sm font-bold">{{ currentUser?.email }}</span>
            <button type="button" class="flex-none rounded-sm bg-green-600 px-3.5 py-2 text-[12.5px] font-bold text-white" @click="copyId">{{ idCopied ? 'Copié ✓' : 'Copier' }}</button>
          </div>
        </div>
      </div>

      <div class="mt-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-6">
        <p class="m-0 text-base font-bold">Modifier mon profil</p>
        <p class="mb-4 mt-1 text-[13px] text-[var(--text-muted)]">Ces informations sont chiffrées côté serveur — elles ne sont jamais réaffichées en clair, seulement leur présence.</p>

        <div v-if="profileState === 'loading'" class="text-[13px] text-[var(--text-muted)]">Chargement…</div>
        <template v-else>
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">Nom complet</label>
              <input v-model="fullName" placeholder="Ex. Sèdjro Aholou" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
            </div>
            <div>
              <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">Profession</label>
              <input v-model="profession" placeholder="Ex. Commerçante" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
            </div>
            <div class="sm:col-span-2">
              <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">Contact d'urgence</label>
              <input v-model="emergencyContact" placeholder="Ex. +229 97 xx xx xx" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
            </div>
            <div>
              <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">Budget min (FCFA)</label>
              <input v-model="budgetMin" inputmode="numeric" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
            </div>
            <div>
              <label class="mb-1.5 block text-[12.5px] font-bold text-[var(--text-muted)]">Budget max (FCFA)</label>
              <input v-model="budgetMax" inputmode="numeric" class="h-11 w-full rounded-sm border border-[var(--border-default)] bg-white px-3.5 text-[13.5px] outline-none">
            </div>
          </div>

          <label class="mb-1.5 mt-3.5 block text-[12.5px] font-bold text-[var(--text-muted)]">Zones préférées</label>
          <div class="flex flex-wrap gap-2">
            <span v-for="z in zones" :key="z" class="flex items-center gap-1.5 rounded-pill border border-green-100 bg-green-50 px-3 py-1.5 text-[12.5px] font-bold text-green-800">
              {{ z }}
              <button type="button" class="text-green-700" @click="removeZone(z)">✕</button>
            </span>
            <input v-model="zoneInput" placeholder="Ajouter une zone…" class="h-9 w-[160px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[12.5px] outline-none" @keydown.enter.prevent="addZone">
          </div>

          <p v-if="profileSaveError" class="mb-0 mt-3.5 text-[13px] font-semibold text-danger-fg">{{ profileSaveError }}</p>
          <p v-if="profileSaved" class="mb-0 mt-3.5 text-[13px] font-semibold text-ok-fg">Profil mis à jour.</p>
          <CoreButton class="mt-4" :disabled="savingProfile" @click="saveProfile">{{ savingProfile ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
        </template>
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
          <p class="mb-3.5 mt-1.5 text-[13.5px] leading-[1.55] text-danger-fg-deep">Votre bail actif et votre caution séquestrée doivent d'abord être clôturés. La suppression est définitive.</p>
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
              <span
                class="block h-[21px] w-[21px] rounded-pill bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)] transition-transform"
                :style="{ transform: notifPrefs[c.key] ? 'translateX(19px)' : 'translateX(0)' }"
              />
            </span>
          </label>
        </template>
      </div>
    </template>
  </div>
</template>
