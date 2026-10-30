<script setup lang="ts">
import { Camera, Check, Copy, Plus, ShieldCheck, X } from '@lucide/vue'
import type { NotificationChannel, NotificationPreferences, ProfileMe } from '~/types/profile'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { prepareAvatarUpload } from '~/utils/uploadFile'

definePageMeta({ layout: 'locataire' })

const route = useRoute()
const router = useRouter()
const currentUser = useAuthUser()
const authApi = useAuthApi()
const profileApi = useProfileApi()
const settingsApi = useSettingsApi()
const userApi = useUserApi()
const leasesBlock = useTenantLeases()
const wallet = useTenantWallet()

/* ---- Onglets, dans l'URL (?tab=) ---- */
type TabKey = 'infos' | 'securite' | 'notifs'
const TABS = [
  { value: 'infos', label: 'Informations' },
  { value: 'securite', label: 'Sécurité' },
  { value: 'notifs', label: 'Notifications' }
]
function tabFrom(v: unknown): TabKey {
  return v === 'securite' || v === 'notifs' ? v : 'infos'
}
const tab = ref<TabKey>(tabFrom(route.query.tab))
watch(() => route.query.tab, t => { tab.value = tabFrom(t) })
function setTab(v: string) {
  tab.value = tabFrom(v)
  if (route.query.tab !== tab.value) router.replace({ query: { ...route.query, tab: tab.value } })
}

const displayName = computed(() => {
  const u = currentUser.value
  if (!u) return ''
  const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
  return name || u.email
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
    if (ready.error || !ready.file) { avatarError.value = ready.error ?? "La photo n'a pas pu être préparée."; return }
    await userApi.uploadAvatar(ready.file)
    await authApi.fetchMe()
  } catch (err) {
    avatarError.value = err instanceof ApiRequestError ? errorText(err.mapped, "L'envoi de la photo a échoué.") : "L'envoi de la photo a échoué."
  } finally {
    avatarUploading.value = false
    if (avatarInput.value) avatarInput.value.value = ''
  }
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

/**
 * Champs chiffrés (nom légal, profession, contact d'urgence) : jamais réaffichés, seulement « renseigné ».
 * Laisser vide garde la valeur ; « Effacer » envoie une chaîne vide, que l'API enregistre comme absente
 * (`update-profile.handler.ts` : valeur vide → null).
 */
const SECRET_FIELDS = [
  { key: 'full_name' as const, label: "Nom légal (pièce d'identité)", placeholder: 'Ex. Sèdjro Aholou', masked: (p: ProfileMe) => p.full_name_masked },
  { key: 'profession' as const, label: 'Profession', placeholder: 'Ex. Commerçante', masked: (p: ProfileMe) => p.profession_masked },
  { key: 'emergency_contact' as const, label: "Contact d'urgence", placeholder: 'Ex. +229 97 00 00 00', masked: (p: ProfileMe) => p.emergency_contact_masked }
]
type SecretKey = typeof SECRET_FIELDS[number]['key']
const secretValues = ref<Record<SecretKey, string>>({ full_name: '', profession: '', emergency_contact: '' })
const secretCleared = ref<Record<SecretKey, boolean>>({ full_name: false, profession: false, emergency_contact: false })

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
  if (z && !zones.value.some(x => x.toLowerCase() === z.toLowerCase())) zones.value = [...zones.value, z]
  zoneInput.value = ''
}
function removeZone(z: string) {
  zones.value = zones.value.filter(x => x !== z)
}
function onBudgetInput(which: 'min' | 'max', e: Event) {
  const digits = (e.target as HTMLInputElement).value.replace(/\D/g, '')
  if (which === 'min') budgetMin.value = digits
  else budgetMax.value = digits
}
const budgetError = computed(() => (budgetMin.value && budgetMax.value && Number(budgetMin.value) > Number(budgetMax.value)
  ? 'Le budget minimum dépasse le budget maximum.'
  : ''))

const savingProfile = ref(false)
const profileSaveError = ref('')
const profileSaved = ref('')
async function saveProfile() {
  if (budgetError.value) return
  // Une zone tapée mais pas encore validée par Entrée n'est pas perdue.
  if (zoneInput.value.trim()) addZone()
  savingProfile.value = true
  profileSaveError.value = ''
  profileSaved.value = ''
  try {
    const payload: Record<string, unknown> = { preferred_zones: zones.value }
    for (const f of SECRET_FIELDS) {
      if (secretCleared.value[f.key]) payload[f.key] = ''
      else if (secretValues.value[f.key].trim()) payload[f.key] = secretValues.value[f.key].trim()
    }
    // Budget vidé alors qu'il était renseigné : on l'efface côté serveur plutôt que de l'ignorer.
    if (budgetMin.value || profile.value?.budget_min) payload.budget_min = budgetMin.value
    if (budgetMax.value || profile.value?.budget_max) payload.budget_max = budgetMax.value
    await profileApi.update(payload)
    secretValues.value = { full_name: '', profession: '', emergency_contact: '' }
    secretCleared.value = { full_name: false, profession: false, emergency_contact: false }
    profileSaved.value = 'Profil enregistré. Les champs chiffrés ne sont pas réaffichés : seul « Renseigné » l\'indique.'
    await loadProfile()
  } catch (e) {
    profileSaveError.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'enregistrement a échoué.") : "L'enregistrement a échoué."
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
    pwError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Une erreur est survenue.') : 'Une erreur est survenue.'
  } finally {
    pwLoading.value = false
  }
}

const codesCopied = ref(false)
async function copyCodes() {
  if (!recoveryCodes.value) return
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
    codesCopied.value = true
    setTimeout(() => { codesCopied.value = false }, 2500)
  } catch {
    codesCopied.value = false
  }
}

/* ---- Sécurité : suppression de compte ---- */
/**
 * L'API refuse (sans erreur HTTP : statut `blocked` + motif) tant qu'un bail est actif ou que le solde
 * n'est pas à zéro (`deletion-eligibility`). On le dit avant, avec les données déjà chargées.
 */
onMounted(() => {
  leasesBlock.ensureLoaded()
  wallet.ensureLoaded()
})
const deletionBlockers = computed(() => {
  const out: string[] = []
  const active = leasesBlock.leases.value.filter(l => l.status === 'active')
  if (active.length) out.push(`${active.length > 1 ? `${active.length} baux sont actifs` : 'un bail est actif'} (${active.map(l => l.unit?.name ?? 'logement').join(', ')}) : il doit être terminé`)
  if (wallet.state.value === 'success' && wallet.balanceTotal.value !== 0) out.push(`votre solde est de ${formatFcfa(wallet.balanceTotal.value)} : il doit être ramené à zéro (retrait)`)
  return out
})
const deletionCheckState = computed(() => {
  if (leasesBlock.state.value === 'error' || wallet.state.value === 'error') return 'error'
  if (['loading', 'idle'].includes(leasesBlock.state.value) || ['loading', 'idle'].includes(wallet.state.value)) return 'loading'
  return 'ready'
})
function retryDeletionCheck() {
  if (leasesBlock.state.value === 'error') leasesBlock.reload()
  if (wallet.state.value === 'error') wallet.reload()
}
const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref('')
async function confirmDelete() {
  deleting.value = true
  deleteError.value = ''
  try {
    const result = await userApi.deleteAccount() as { status: string; message: string; blocking_reason?: string | null }
    // Refus de l'API (bail actif, solde non nul…) : réponse 200 avec un motif — avant, on déconnectait quand même.
    if (result.status !== 'completed') {
      deleteError.value = result.blocking_reason ?? 'La suppression est impossible pour le moment.'
      return
    }
    await authApi.logout()
    await navigateTo('/')
  } catch (e) {
    deleteError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'La suppression a échoué.') : 'La suppression a échoué.'
  } finally {
    deleting.value = false
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
const channelError = ref<{ key: NotificationChannel; text: string } | null>(null)
async function toggleChannel(channel: NotificationChannel) {
  if (!notifPrefs.value || togglingChannel.value) return
  const next = !notifPrefs.value[channel]
  togglingChannel.value = channel
  channelError.value = null
  try {
    await settingsApi.toggleNotificationChannel(channel, next)
    notifPrefs.value[channel] = next
  } catch (e) {
    channelError.value = { key: channel, text: e instanceof ApiRequestError ? errorText(e.mapped, "Le réglage n'a pas pu être enregistré.") : "Le réglage n'a pas pu être enregistré." }
  } finally {
    togglingChannel.value = null
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <div class="mb-5.5 flex flex-wrap items-center justify-between gap-3">
      <div class="overflow-x-auto">
        <FormsSegmentedControl :model-value="tab" :options="TABS" size="sm" @update:model-value="setTab" />
      </div>
      <NuxtLink to="/kyc" class="inline-flex items-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900"><ShieldCheck class="h-4 w-4" :stroke-width="1.9" />Vérification d'identité</NuxtLink>
    </div>

    <template v-if="tab === 'infos'">
      <LayoutAccountNameForm class="mb-4.5" />
      <div class="grid grid-cols-1 gap-4.5 lg:grid-cols-2">
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="flex items-center gap-4">
            <div class="relative flex-none">
              <CoreAvatar :name="displayName" :avatar-url="currentUser?.avatar_url" :size="72" color="var(--color-green-700)" />
              <label class="absolute -bottom-1 -right-1 grid h-7 w-7 cursor-pointer place-items-center rounded-pill border-2 border-white bg-green-600 text-white shadow-card" :class="{ 'pointer-events-none opacity-60': avatarUploading }" aria-label="Changer la photo de profil">
                <span v-if="avatarUploading" class="text-[11px] font-bold">…</span>
                <Camera v-else class="h-3.5 w-3.5" :stroke-width="2" />
                <input ref="avatarInput" type="file" accept="image/*" class="hidden" :disabled="avatarUploading" @change="onAvatarSelected">
              </label>
            </div>
            <div class="min-w-0">
              <p class="m-0 truncate font-display text-xl font-bold tracking-[-.02em]">{{ displayName }}</p>
              <p class="mb-0 mt-1 text-xs text-[var(--text-faint)]">Locataire</p>
              <p v-if="avatarError" class="mb-0 mt-1 text-[12.5px] font-semibold text-danger-fg">{{ avatarError }}</p>
            </div>
          </div>
          <dl class="m-0 mt-4.5">
            <div class="flex items-center justify-between gap-3 border-b border-sand-200 py-3">
              <dt class="text-[13.5px] text-[var(--text-muted)]">Téléphone</dt>
              <dd class="m-0 font-mono text-sm font-semibold">{{ currentUser?.phone_number || 'Non renseigné' }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3 border-b border-sand-200 py-3">
              <dt class="text-[13.5px] text-[var(--text-muted)]">E-mail</dt>
              <dd class="m-0 truncate text-sm font-semibold">{{ currentUser?.email }}</dd>
            </div>
            <template v-if="profile">
              <div v-for="f in SECRET_FIELDS" :key="f.key" class="flex items-center justify-between gap-3 border-b border-sand-200 py-3 last:border-b-0">
                <dt class="text-[13.5px] text-[var(--text-muted)]">{{ f.label }}</dt>
                <dd class="m-0"><CoreBadge :tone="f.masked(profile) ? 'ok' : 'neutral'">{{ f.masked(profile) ? 'Renseigné' : 'Non renseigné' }}</CoreBadge></dd>
              </div>
            </template>
          </dl>
        </section>
        <section class="self-start rounded-2xl border border-green-100 bg-green-50 p-5.5">
          <h2 class="m-0 text-[15px] font-bold text-green-900">Mon identifiant locataire</h2>
          <p class="mb-0 mt-1.5 text-[13.5px] leading-[1.55] text-green-800">Communiquez cette adresse à un propriétaire pour qu'il crée votre bail — plus jamais d'identifiant technique à recopier.</p>
          <div class="mt-3.5 flex items-center gap-2.5 rounded-md border border-green-100 bg-white px-4 py-3">
            <span class="min-w-0 flex-1 truncate font-mono text-sm font-bold">{{ currentUser?.email }}</span>
            <CoreButton size="sm" tone="secondary" @click="copyId">
              <span class="inline-flex items-center gap-1.5"><Check v-if="idCopied" class="h-4 w-4 text-ok-fg" :stroke-width="2.2" /><Copy v-else class="h-4 w-4" :stroke-width="1.9" />{{ idCopied ? 'Copié' : 'Copier' }}</span>
            </CoreButton>
          </div>
        </section>
      </div>

      <section class="mt-4.5 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <h2 class="m-0 text-[15px] font-bold">Modifier mon profil</h2>
        <p class="mb-4.5 mt-1 text-[13.5px] text-[var(--text-muted)]">Nom légal, profession et contact d'urgence sont chiffrés côté serveur : ils ne sont jamais réaffichés en clair, seulement leur présence.</p>

        <DataSkeletonCard v-if="profileState === 'loading' || profileState === 'idle'" :height="160" :lines="0" />
        <FeedbackAlertBanner v-else-if="profileState === 'error'" tone="danger">
          Impossible de charger votre profil pour le moment.
          <button type="button" class="ml-2 font-bold underline" @click="loadProfile">Réessayer</button>
        </FeedbackAlertBanner>
        <template v-else>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div v-for="f in SECRET_FIELDS" :key="f.key" :class="f.key === 'emergency_contact' ? 'sm:col-span-2' : ''">
              <FormsInput
                v-model="secretValues[f.key]"
                :label="f.label"
                :placeholder="secretCleared[f.key] ? 'Sera effacé à l\'enregistrement' : f.placeholder"
                :hint="profile && f.masked(profile) && !secretCleared[f.key] ? 'Renseigné : laissez vide pour garder la valeur enregistrée.' : undefined"
                :mono="f.key === 'emergency_contact'"
              />
              <button
                v-if="profile && f.masked(profile)"
                type="button"
                class="mt-1 text-[12.5px] font-bold"
                :class="secretCleared[f.key] ? 'text-green-700' : 'text-[var(--text-muted)] underline'"
                @click="secretCleared[f.key] = !secretCleared[f.key]; secretValues[f.key] = ''"
              >{{ secretCleared[f.key] ? 'Ne pas effacer' : 'Effacer la valeur enregistrée' }}</button>
            </div>
            <label class="block">
              <span class="mb-[7px] block text-[12.5px] font-bold">Budget min (FCFA / mois)</span>
              <input :value="budgetMin" inputmode="numeric" placeholder="Ex. 40000" class="h-[46px] w-full rounded-md border bg-[var(--surface-input)] px-[15px] font-mono text-[14.5px] outline-none" :class="budgetError ? 'border-danger-border' : 'border-[var(--border-default)]'" @input="onBudgetInput('min', $event)">
            </label>
            <label class="block">
              <span class="mb-[7px] block text-[12.5px] font-bold">Budget max (FCFA / mois)</span>
              <input :value="budgetMax" inputmode="numeric" placeholder="Ex. 90000" class="h-[46px] w-full rounded-md border bg-[var(--surface-input)] px-[15px] font-mono text-[14.5px] outline-none" :class="budgetError ? 'border-danger-border' : 'border-[var(--border-default)]'" @input="onBudgetInput('max', $event)">
            </label>
          </div>
          <p v-if="budgetError" class="mb-0 mt-2 text-[12.5px] font-semibold text-danger-fg">{{ budgetError }}</p>
          <p v-else class="mb-0 mt-2 text-[12.5px] text-[var(--text-faint)]">Videz un budget pour l'effacer.</p>

          <p class="mb-[7px] mt-4.5 text-[12.5px] font-bold">Zones préférées</p>
          <div class="flex flex-wrap items-center gap-2">
            <FormsChip v-for="z in zones" :key="z" active removable @remove="removeZone(z)">{{ z }}</FormsChip>
            <div class="flex items-center gap-1.5">
              <input v-model="zoneInput" placeholder="Ajouter une zone…" aria-label="Ajouter une zone" class="h-[38px] w-[170px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold outline-none" @keydown.enter.prevent="addZone">
              <button type="button" aria-label="Ajouter la zone" class="grid h-[38px] w-[38px] place-items-center rounded-pill border border-[var(--border-default)] bg-white text-green-700 disabled:opacity-50" :disabled="!zoneInput.trim()" @click="addZone"><Plus class="h-4 w-4" :stroke-width="2.2" /></button>
            </div>
          </div>

          <p v-if="profileSaveError" class="mb-0 mt-4 text-[13px] font-semibold text-danger-fg">{{ profileSaveError }}</p>
          <p v-if="profileSaved" class="mb-0 mt-4 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ profileSaved }}</p>
          <CoreButton class="mt-4.5" :disabled="savingProfile || !!budgetError" @click="saveProfile">{{ savingProfile ? 'Enregistrement…' : 'Enregistrer' }}</CoreButton>
        </template>
      </section>
    </template>

    <template v-else-if="tab === 'securite'">
      <div class="flex max-w-[640px] flex-col gap-4.5">
        <section class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <template v-if="pwStep === 'form'">
            <h2 class="m-0 text-[15px] font-bold">{{ currentUser?.has_password ? 'Changer mon mot de passe' : 'Créer un mot de passe' }}</h2>
            <p class="mb-4 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">{{ currentUser?.has_password ? 'Modifiez votre mot de passe actuel.' : "Votre compte a été créé par code email. Définissez un mot de passe pour ne plus dépendre d'un aller-retour à chaque connexion." }}</p>
            <div class="flex flex-col gap-3.5">
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
              <h2 class="mb-0 mt-4 text-[15px] font-bold">Codes de récupération</h2>
              <p class="mb-3 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Conservez-les dans un endroit sûr : ils ne seront plus jamais affichés.</p>
              <div class="grid grid-cols-2 gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-page)] p-3.5 font-mono text-[13px] font-bold">
                <span v-for="c in recoveryCodes" :key="c">{{ c }}</span>
              </div>
              <CoreButton size="sm" tone="secondary" class="mt-3" @click="copyCodes">
                <span class="inline-flex items-center gap-1.5"><Check v-if="codesCopied" class="h-4 w-4 text-ok-fg" :stroke-width="2.2" /><Copy v-else class="h-4 w-4" :stroke-width="1.9" />{{ codesCopied ? 'Codes copiés' : 'Copier les codes' }}</span>
              </CoreButton>
            </template>
          </template>
        </section>

        <section class="rounded-2xl border border-danger-border bg-white p-5.5">
          <h2 class="m-0 text-[15px] font-bold text-danger-fg">Supprimer mon compte</h2>
          <p class="mb-3.5 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">La suppression est définitive : vos données personnelles sont anonymisées. Elle n'est possible qu'une fois vos baux terminés et votre solde ramené à zéro.</p>
          <p v-if="deletionCheckState === 'loading'" class="m-0 text-xs text-[var(--text-faint)]">Vérification de vos baux et de votre solde…</p>
          <p v-else-if="deletionCheckState === 'error'" class="m-0 text-[13px] font-semibold text-danger-fg">
            Impossible de vérifier vos baux et votre solde. <button type="button" class="font-bold underline" @click="retryDeletionCheck">Réessayer</button>
          </p>
          <template v-else-if="deletionBlockers.length">
            <ul class="m-0 list-disc pl-5 text-[13px] leading-[1.6] text-warn-fg-deep">
              <li v-for="b in deletionBlockers" :key="b">{{ b.charAt(0).toUpperCase() + b.slice(1) }}.</li>
            </ul>
            <CoreButton class="mt-3.5" size="sm" tone="secondary" disabled>Supprimer le compte</CoreButton>
          </template>
          <template v-else>
            <CoreInlineConfirm
              v-if="confirmingDelete"
              tone="danger"
              message="Supprimer définitivement votre compte ? Vous serez déconnecté et ne pourrez plus y accéder."
              confirm-label="Supprimer"
              cancel-label="Garder mon compte"
              :loading="deleting"
              @confirm="confirmDelete"
              @cancel="confirmingDelete = false"
            />
            <CoreButton v-else size="sm" tone="secondary" @click="confirmingDelete = true; deleteError = ''">Supprimer le compte</CoreButton>
          </template>
          <p v-if="deleteError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ deleteError }}</p>
        </section>
      </div>
    </template>

    <template v-else>
      <section class="max-w-[640px] rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
        <h2 class="m-0 text-[15px] font-bold">Canaux de notification</h2>
        <p class="mb-2 mt-1 text-[13.5px] text-[var(--text-muted)]">Chaque réglage s'applique aussitôt.</p>
        <DataSkeletonCard v-if="notifState === 'loading' || notifState === 'idle'" :height="140" :lines="0" />
        <FeedbackAlertBanner v-else-if="notifState === 'error'" tone="danger">
          Impossible de charger vos préférences.
          <button type="button" class="ml-2 font-bold underline" @click="loadNotifPrefs">Réessayer</button>
        </FeedbackAlertBanner>
        <template v-else-if="notifPrefs">
          <div v-for="c in CHANNEL_DEFS" :key="c.key" class="border-b border-sand-200 py-3.5 last:border-b-0">
            <FormsToggle
              :class="togglingChannel === c.key ? 'pointer-events-none opacity-60' : ''"
              :model-value="!!notifPrefs[c.key]"
              :label="c.label"
              :hint="c.hint"
              @update:model-value="toggleChannel(c.key)"
            />
            <p v-if="channelError?.key === c.key" class="mb-0 mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-danger-fg"><X class="h-3.5 w-3.5" :stroke-width="2.2" />{{ channelError.text }}</p>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>
