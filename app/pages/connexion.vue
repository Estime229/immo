<script setup lang="ts">
import type { SessionOutcome } from '~/utils/sessionOutcome'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { roleHomePath } from '~/utils/roleRoutes'
import { SIGNUP_ROLE_TO_API, apiRoleToSignupRole, needsOnboarding, validateSignup } from '~/utils/onboarding'

definePageMeta({ layout: 'blank' })

type AuthStep = 'email' | 'password' | 'code' | 'signup' | 'forgot'
/** Ce que représente le code à 6 chiffres affiché à l'étape 'code'. */
type CodeContext = 'login' | 'reset'
/** À l'étape 'forgot', d'où vient la preuve d'identité déjà apportée. */
type ResetMethod = 'otp' | 'recovery'

const auth = useAuthApi()

const HERO_IMAGES = ['/images/hero/hero-1.jpg', '/images/hero/hero-2.jpg', '/images/hero/hero-3.jpg']
const heroIndex = ref(0)
let heroTimer: ReturnType<typeof setInterval> | null = null

function startHeroTimer() {
  heroTimer = setInterval(() => { heroIndex.value = (heroIndex.value + 1) % HERO_IMAGES.length }, 5000)
}
function setHero(i: number) {
  heroIndex.value = i
  if (heroTimer) clearInterval(heroTimer)
  startHeroTimer()
}
onMounted(startHeroTimer)
onUnmounted(() => { if (heroTimer) clearInterval(heroTimer) })

const step = ref<AuthStep>('email')
const email = ref('')
const emailError = ref(false)
const loading = ref(false)
const authError = ref('')

function handleOutcome(outcome: SessionOutcome) {
  if (outcome.kind === 'banned') {
    authError.value = outcome.message
    return
  }
  if (outcome.kind === 'pending' || (outcome.kind !== 'banned' && outcome.isNewUser)) {
    step.value = 'signup'
    return
  }
  if ((outcome.kind === 'ok' || outcome.kind === 'restricted') && needsOnboarding(outcome.user)) {
    // Inscription commencée puis abandonnée : on la reprend, avec le rôle réel déjà présélectionné.
    role.value = apiRoleToSignupRole(outcome.user.role) ?? role.value
    firstName.value = outcome.user.first_name ?? ''
    lastName.value = outcome.user.last_name ?? ''
    step.value = 'signup'
    return
  }
  if (outcome.kind === 'ok' || outcome.kind === 'restricted') {
    // Redirige selon le rôle réel renvoyé par l'API — jamais le rôle choisi localement à l'étape signup.
    navigateTo(roleHomePath(outcome.user.role))
  }
}

function onEmailInput() {
  emailError.value = false
  authError.value = ''
}

async function goPassword() {
  if (!email.value.includes('@')) {
    emailError.value = true
    return
  }
  authError.value = ''
  loading.value = true
  try {
    const { has_password } = await auth.checkEmail(email.value)
    if (has_password) {
      step.value = 'password'
    } else {
      codeContext.value = 'login'
      await auth.requestOtp(email.value)
      step.value = 'code'
    }
  } catch (e) {
    authError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Une erreur est survenue.') : 'Une erreur est survenue.'
  } finally {
    loading.value = false
  }
}

const password = ref('')

async function submitPassword() {
  authError.value = ''
  loading.value = true
  try {
    const outcome = await auth.login(email.value, password.value)
    handleOutcome(outcome)
  } catch (e) {
    authError.value = e instanceof ApiRequestError
      ? (e.mapped.kind === 'auth' ? 'Email ou mot de passe incorrect.' : errorText(e.mapped, 'Une erreur est survenue.'))
      : 'Une erreur est survenue.'
  } finally {
    loading.value = false
  }
}

function backToEmail() {
  step.value = 'email'
  emailError.value = false
  authError.value = ''
}

async function toCodeFromPassword() {
  authError.value = ''
  loading.value = true
  try {
    codeContext.value = 'login'
    await auth.requestOtp(email.value)
    codeDigits.value = ['', '', '', '', '', '']
    step.value = 'code'
  } catch (e) {
    authError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Une erreur est survenue.') : 'Une erreur est survenue.'
  } finally {
    loading.value = false
  }
}

async function toForgotOtp() {
  authError.value = ''
  loading.value = true
  try {
    codeContext.value = 'reset'
    resetMethod.value = 'otp'
    await auth.forgotPassword(email.value)
    codeDigits.value = ['', '', '', '', '', '']
    step.value = 'code'
  } catch (e) {
    authError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Une erreur est survenue.') : 'Une erreur est survenue.'
  } finally {
    loading.value = false
  }
}

/* ---- Code à 6 chiffres ---- */
const codeContext = ref<CodeContext>('login')
const codeDigits = ref(['', '', '', '', '', ''])
const codeError = ref(false)
const codeInputs = ref<(HTMLInputElement | null)[]>([])

function setCodeInput(i: number, el: Element | null) {
  codeInputs.value[i] = el as HTMLInputElement | null
}

function onCodeInput(i: number, e: Event) {
  const val = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(-1)
  codeDigits.value[i] = val
  codeError.value = false
  if (val && i < 5) codeInputs.value[i + 1]?.focus()
}

async function verifyCode() {
  const code = codeDigits.value.join('')
  if (code.length < 6) {
    codeError.value = true
    return
  }
  authError.value = ''

  if (codeContext.value === 'reset') {
    // Le code n'est vérifié qu'au moment de POST /auth/reset-password, avec le
    // nouveau mot de passe dans la même requête — pas d'appel intermédiaire ici.
    resetMethod.value = 'otp'
    step.value = 'forgot'
    return
  }

  loading.value = true
  try {
    const outcome = await auth.verifyOtp(email.value, code)
    handleOutcome(outcome)
  } catch (e) {
    codeError.value = true
    authError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Code incorrect ou expiré.') : 'Code incorrect ou expiré.'
  } finally {
    loading.value = false
  }
}

function toRecovery() {
  codeContext.value = 'reset'
  resetMethod.value = 'recovery'
  authError.value = ''
  step.value = 'forgot'
}

/* ---- Inscription (complément de profil, après première vérification) ---- */
const onboardingApi = useOnboardingApi()
const firstName = ref('')
const lastName = ref('')
const signupError = ref('')
watch([firstName, lastName], () => { signupError.value = '' })

const ROLES = [
  { id: 'locataire', label: 'Je cherche un logement', hint: 'Réserver, payer mon loyer, suivre ma caution', icon: '⌂', tint: 'bg-green-50' },
  { id: 'bailleur', label: 'Je loue mes biens', hint: 'Publier, encaisser, gérer mes baux', icon: '⚿', tint: 'bg-clay-100' },
  { id: 'artisan', label: 'Je suis artisan', hint: "Recevoir des missions d'entretien et de réparation", icon: '⚒', tint: 'bg-info-bg' }
] as const

const role = useAuthRole()

/**
 * Nom + rôle enregistrés pour de vrai via /onboarding/draft puis /finalize
 * (voir utils/onboarding.ts) — jusqu'au Lot 44 ils restaient locaux : tout
 * compte neuf restait `tenant` sans nom, quel que soit le choix fait ici.
 */
async function createAccount() {
  signupError.value = validateSignup({ firstName: firstName.value, lastName: lastName.value }) ?? ''
  if (signupError.value) return
  loading.value = true
  try {
    await onboardingApi.saveDraft({
      first_name: firstName.value.trim(),
      last_name: lastName.value.trim(),
      role: SIGNUP_ROLE_TO_API[role.value]
    })
    await onboardingApi.finalize()
    await auth.fetchMe()
    navigateTo('/kyc')
  } catch (e) {
    signupError.value = e instanceof ApiRequestError ? errorText(e.mapped, "La création du compte a échoué. Réessayez.") : "La création du compte a échoué. Réessayez."
  } finally {
    loading.value = false
  }
}

/* ---- Mot de passe oublié / réinitialisation ---- */
const resetMethod = ref<ResetMethod>('otp')
const recoveryCode = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const resetError = ref('')

async function submitReset() {
  resetError.value = ''
  if (resetMethod.value === 'recovery' && recoveryCode.value.trim().length < 6) {
    resetError.value = 'Saisissez votre code de récupération.'
    return
  }
  if (newPassword.value.length < 8) {
    resetError.value = 'Le mot de passe doit contenir au moins 8 caractères.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    resetError.value = 'Les deux mots de passe ne correspondent pas.'
    return
  }

  loading.value = true
  try {
    await auth.resetPassword({
      email: email.value,
      new_password: newPassword.value,
      ...(resetMethod.value === 'otp' ? { code: codeDigits.value.join('') } : { recovery_code: recoveryCode.value.trim() })
    })
    const outcome = await auth.login(email.value, newPassword.value)
    handleOutcome(outcome)
  } catch (e) {
    resetError.value = e instanceof ApiRequestError ? errorText(e.mapped, 'Une erreur est survenue.') : 'Une erreur est survenue.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_480px]">
    <div class="relative hidden items-end overflow-hidden bg-[image:var(--gradient-hero)] p-11 lg:flex">
      <div
        v-for="(src, i) in HERO_IMAGES"
        :key="src"
        class="absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-out"
        :style="{ backgroundImage: `url(${src})`, opacity: i === heroIndex ? 1 : 0 }"
      />
      <div class="absolute inset-0 bg-[image:linear-gradient(180deg,rgba(18,60,41,.15)_35%,rgba(18,60,41,.82)_100%)]" />
      <NuxtLink to="/" class="absolute left-11 top-9 z-10 flex items-center gap-2.5">
        <img src="/images/logo.png" alt="Immo" class="h-8 w-8 rounded-[9px]" width="32" height="32">
        <span class="font-display text-[22px] font-extrabold tracking-[-.025em] text-white">Immo</span>
      </NuxtLink>
      <div class="relative z-10">
        <p class="m-0 max-w-[440px] font-display text-[34px] font-bold leading-[1.12] tracking-[-.03em] text-white">
          La caution du locataire ne dort jamais chez le bailleur.
        </p>
        <p class="mb-0 mt-3.5 max-w-[400px] text-[15px] text-white/[.82]">
          Elle est séquestrée par Immo et restituée sous 7 jours après l'état des lieux de sortie.
        </p>
      </div>
      <div class="absolute bottom-11 right-11 z-10 flex gap-1.5">
        <button
          v-for="(src, i) in HERO_IMAGES"
          :key="src"
          type="button"
          class="h-1.5 rounded-pill transition-[width,background-color]"
          :class="i === heroIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/45'"
          @click="setHero(i)"
        />
      </div>
    </div>

    <div class="flex flex-col justify-center overflow-y-auto bg-white px-6 py-11 sm:px-[52px]">
      <div class="animate-[im-fade_.3s_ease_both]">
        <template v-if="step === 'email'">
          <h1 class="m-0 font-display text-[29px] font-bold tracking-[-.03em]">Entrer sur Immo</h1>
          <p class="mb-6 mt-2.5 text-[14.5px] text-[var(--text-muted)]">Saisissez votre email : nous vous dirons ensuite s'il faut un mot de passe ou un code.</p>
          <label class="block">
            <span class="mb-2 block text-[12.5px] font-bold">Adresse email</span>
            <input
              v-model="email"
              type="email"
              placeholder="vous@exemple.bj"
              class="h-[50px] w-full rounded-md border bg-[var(--surface-input)] px-4 text-[15px] outline-none"
              :class="emailError ? 'border-danger-border' : 'border-[var(--border-default)]'"
              @input="onEmailInput"
              @keydown.enter="goPassword"
            >
          </label>
          <p v-if="emailError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">Adresse email invalide. Vérifiez l'orthographe ou créez un compte.</p>
          <p v-if="authError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ authError }}</p>
          <CoreButton size="lg" full-width class="mt-4.5" :disabled="loading" @click="goPassword">{{ loading ? 'Un instant…' : 'Continuer' }}</CoreButton>
          <div class="my-5.5 flex items-center gap-3.5">
            <span class="h-px flex-1 bg-sand-300" /><span class="text-[12.5px] text-[var(--text-faint)]">ou</span><span class="h-px flex-1 bg-sand-300" />
          </div>
          <button type="button" title="Nécessite la configuration Firebase du projet — non branché dans ce lot" class="flex w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-md border border-[var(--border-default)] bg-white py-[15px] text-[14.5px] font-semibold text-sand-900 opacity-60">
            <span class="h-[18px] w-[18px] rounded-pill" style="background: conic-gradient(#ea4335 0 25%, #fbbc05 0 50%, #34a853 0 75%, #4285f4 0)" />
            Continuer avec Google
          </button>
        </template>

        <template v-else-if="step === 'password'">
          <button type="button" class="mb-4.5 text-[13.5px] font-semibold text-[var(--text-muted)]" @click="backToEmail">← Changer d'email</button>
          <h1 class="m-0 font-display text-[29px] font-bold tracking-[-.03em]">Votre mot de passe</h1>
          <p class="mb-6 mt-2.5 text-[14.5px] text-[var(--text-muted)]">Compte <strong class="text-[var(--text-primary)]">{{ email }}</strong></p>
          <label class="block">
            <span class="mb-2 block text-[12.5px] font-bold">Mot de passe</span>
            <input v-model="password" type="password" placeholder="••••••••••" class="h-[50px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-4 text-[15px] outline-none" @keydown.enter="submitPassword">
          </label>
          <p v-if="authError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ authError }}</p>
          <CoreButton size="lg" full-width class="mt-4.5" :disabled="loading" @click="submitPassword">{{ loading ? 'Connexion…' : 'Se connecter' }}</CoreButton>
          <div class="mt-5 flex flex-col gap-2.5">
            <button type="button" class="text-left text-[13.5px] font-semibold text-green-700" @click="toCodeFromPassword">Recevoir plutôt un code par email</button>
            <button type="button" class="text-left text-[13.5px] font-semibold text-[var(--text-muted)]" @click="toForgotOtp">Mot de passe oublié</button>
          </div>
        </template>

        <template v-else-if="step === 'code'">
          <button type="button" class="mb-4.5 text-[13.5px] font-semibold text-[var(--text-muted)]" @click="backToEmail">← Retour</button>
          <h1 class="m-0 font-display text-[29px] font-bold tracking-[-.03em]">Votre code à 6 chiffres</h1>
          <p class="mb-6 mt-2.5 text-[14.5px] leading-[1.5] text-[var(--text-muted)]">
            Nous l'avons envoyé <strong class="text-[var(--text-primary)]">par email</strong> à {{ email || 'votre adresse' }}. Il n'arrive pas par SMS.
          </p>
          <div class="flex gap-2.5">
            <input
              v-for="(d, i) in codeDigits"
              :key="i"
              :ref="(el) => setCodeInput(i, el as Element)"
              :value="d"
              inputmode="numeric"
              maxlength="1"
              class="h-[60px] w-full rounded-md border bg-[var(--surface-input)] text-center font-mono text-[22px] font-bold outline-none"
              :class="codeError ? 'border-danger-border text-danger-fg' : d ? 'border-green-600 text-[var(--text-primary)]' : 'border-[var(--border-default)] text-[var(--text-primary)]'"
              @input="onCodeInput(i, $event)"
            >
          </div>
          <div v-if="codeError || authError" class="mt-3.5 rounded-sm border border-danger-border bg-danger-bg px-[15px] py-3.5">
            <p class="m-0 text-[13.5px] font-semibold text-danger-fg-deep">{{ authError || 'Code incomplet.' }}</p>
          </div>
          <CoreButton size="lg" full-width class="mt-4.5" :disabled="loading" @click="verifyCode">{{ loading ? 'Vérification…' : 'Vérifier' }}</CoreButton>
          <button v-if="codeContext === 'reset'" type="button" class="mt-3 text-[13.5px] font-semibold text-green-700" @click="toRecovery">J'utilise un code de récupération</button>
        </template>

        <template v-else-if="step === 'signup'">
          <h1 class="m-0 font-display text-[29px] font-bold tracking-[-.03em]">Créer votre compte</h1>
          <p class="mb-6 mt-2.5 text-[14.5px] text-[var(--text-muted)]">Email vérifié : {{ email || 'votre adresse' }}</p>
          <div class="grid grid-cols-2 gap-3">
            <FormsInput v-model="firstName" label="Prénom" placeholder="Sèdjro" />
            <FormsInput v-model="lastName" label="Nom" placeholder="Aholou" />
          </div>
          <p class="mb-2.5 mt-5.5 text-[12.5px] font-bold">Vous venez sur Immo pour…</p>
          <div class="flex flex-col gap-2.5">
            <div
              v-for="r in ROLES"
              :key="r.id"
              class="flex cursor-pointer items-center gap-3.5 rounded-md p-3.5 transition-all"
              :class="role === r.id ? 'border-2 border-green-600 bg-green-50' : 'border border-[var(--border-default)] bg-white'"
              @click="role = r.id"
            >
              <div class="grid h-10 w-10 flex-none place-items-center rounded-sm text-[17px]" :class="r.tint">{{ r.icon }}</div>
              <div class="flex-1">
                <p class="m-0 text-[14.5px] font-bold">{{ r.label }}</p>
                <p class="mb-0 mt-[3px] text-[12.5px] text-[var(--text-muted)]">{{ r.hint }}</p>
              </div>
              <span
                class="grid h-5 w-5 place-items-center rounded-pill text-[11px] text-white"
                :class="role === r.id ? 'bg-green-600' : 'border-2 border-[var(--border-default)] bg-transparent'"
              >{{ role === r.id ? '✓' : '' }}</span>
            </div>
          </div>
          <p v-if="signupError" class="mb-0 mt-3.5 rounded-sm border border-danger-border bg-danger-bg px-[15px] py-3 text-[13.5px] font-semibold text-danger-fg-deep">{{ signupError }}</p>
          <CoreButton size="lg" full-width class="mt-5" :disabled="loading" @click="createAccount">{{ loading ? 'Création du compte…' : 'Créer mon compte' }}</CoreButton>
          <p class="mb-0 mt-3.5 text-[12.5px] leading-[1.5] text-[var(--text-faint)]">
            En continuant, vous acceptez les <NuxtLink to="/legal" class="font-semibold text-green-700">conditions d'utilisation</NuxtLink>
            et la <NuxtLink to="/legal" class="font-semibold text-green-700">politique de confidentialité</NuxtLink>.
          </p>
        </template>

        <template v-else-if="step === 'forgot'">
          <button type="button" class="mb-4.5 text-[13.5px] font-semibold text-[var(--text-muted)]" @click="backToEmail">← Retour</button>
          <h1 class="m-0 font-display text-[29px] font-bold tracking-[-.03em]">Nouveau mot de passe</h1>
          <p class="mb-6 mt-2.5 text-[14.5px] text-[var(--text-muted)]">
            {{ resetMethod === 'otp' ? 'Code vérifié.' : 'Utilisez un de vos codes de récupération.' }} Choisissez un mot de passe d'au moins 8 caractères.
          </p>
          <label v-if="resetMethod === 'recovery'" class="mb-3 block">
            <span class="mb-2 block text-[12.5px] font-bold">Code de récupération</span>
            <input v-model="recoveryCode" placeholder="a1b2c3d4" class="h-[50px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-4 font-mono text-[15px] outline-none">
          </label>
          <label class="block">
            <span class="mb-2 block text-[12.5px] font-bold">Nouveau mot de passe</span>
            <input v-model="newPassword" type="password" placeholder="••••••••••" class="h-[50px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-4 text-[15px] outline-none">
          </label>
          <label class="mt-3 block">
            <span class="mb-2 block text-[12.5px] font-bold">Confirmer</span>
            <input v-model="confirmPassword" type="password" placeholder="••••••••••" class="h-[50px] w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-input)] px-4 text-[15px] outline-none" @keydown.enter="submitReset">
          </label>
          <p v-if="resetError" class="mb-0 mt-2.5 text-[13px] font-semibold text-danger-fg">{{ resetError }}</p>
          <CoreButton size="lg" full-width class="mt-4.5" :disabled="loading" @click="submitReset">{{ loading ? 'Enregistrement…' : 'Enregistrer et me connecter' }}</CoreButton>
        </template>
      </div>
    </div>
  </div>
</template>
