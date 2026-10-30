<script setup lang="ts">
import { ArrowLeft, Check, Hammer, House, KeyRound } from '@lucide/vue'
import type { SessionOutcome } from '~/utils/sessionOutcome'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'
import { roleHomePath } from '~/utils/roleRoutes'
import { SIGNUP_ROLE_TO_API, apiRoleToSignupRole, needsOnboarding, safeRedirect, validateSignup } from '~/utils/onboarding'

// `guest-only` (Lot 56) : un compte déjà connecté ne revoit pas le formulaire.
definePageMeta({ layout: 'blank', middleware: 'guest-only' })

type AuthStep = 'email' | 'password' | 'code' | 'signup' | 'forgot'
/** Ce que représente le code à 6 chiffres affiché à l'étape 'code'. */
type CodeContext = 'login' | 'reset'
/** À l'étape 'forgot', d'où vient la preuve d'identité déjà apportée. */
type ResetMethod = 'otp' | 'recovery'

const route = useRoute()
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

onUnmounted(() => {
  if (heroTimer) clearInterval(heroTimer)
  if (resendTimer) clearInterval(resendTimer)
})

/** Mêmes classes que `FormsInput` : les champs natifs gardent `autocomplete` (gestionnaires de mots de passe). */
const INPUT_CLASS = 'h-[46px] w-full rounded-md border bg-[var(--surface-input)] px-[15px] text-[14.5px] text-[var(--text-primary)] outline-none focus:border-green-600'
const LABEL_CLASS = 'mb-[7px] block text-[12.5px] font-bold'

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
  if (outcome.kind === 'pending' || outcome.isNewUser) {
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
    navigateTo(safeRedirect(route.query.redirect) ?? roleHomePath(outcome.user.role))
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

/**
 * Saisie du code : une case par chiffre, mais un collage (ou le remplissage automatique du
 * téléphone, qui met les 6 chiffres dans la première case) se répartit sur les cases suivantes.
 * Le 6e chiffre envoie le code sans attendre « Vérifier ».
 */
function fillDigits(from: number, digits: string) {
  const chars = digits.replace(/\D/g, '').slice(0, 6 - from).split('')
  chars.forEach((d, k) => { codeDigits.value[from + k] = d })
  codeError.value = false
  authError.value = ''
  const next = Math.min(from + chars.length, 5)
  codeInputs.value[next]?.focus()
  if (codeDigits.value.every(d => d)) verifyCode()
}

function onCodeInput(i: number, e: Event) {
  const input = e.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '')
  if (digits.length > 1) {
    input.value = codeDigits.value[i] ?? ''
    fillDigits(i, digits)
    return
  }
  codeDigits.value[i] = digits
  input.value = digits
  codeError.value = false
  authError.value = ''
  if (!digits) return
  if (i < 5) codeInputs.value[i + 1]?.focus()
  if (codeDigits.value.every(d => d)) verifyCode()
}

function onCodePaste(i: number, e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text') ?? ''
  if (!/\d/.test(text)) return
  e.preventDefault()
  fillDigits(/^\D*\d{6}/.test(text) ? 0 : i, text)
}

/** Retour arrière dans une case vide : on recule d'une case et on l'efface ; flèches pour se déplacer. */
function onCodeKeydown(i: number, e: KeyboardEvent) {
  if (e.key === 'Backspace' && !codeDigits.value[i] && i > 0) {
    e.preventDefault()
    codeDigits.value[i - 1] = ''
    codeInputs.value[i - 1]?.focus()
  } else if (e.key === 'ArrowLeft' && i > 0) {
    e.preventDefault()
    codeInputs.value[i - 1]?.focus()
  } else if (e.key === 'ArrowRight' && i < 5) {
    e.preventDefault()
    codeInputs.value[i + 1]?.focus()
  } else if (e.key === 'Enter') {
    verifyCode()
  }
}

/* ---- Renvoyer le code (compte à rebours, et délai imposé par l'API s'il y en a un) ---- */
const RESEND_DELAY = 30
const resendIn = ref(0)
const resending = ref(false)
const resendInfo = ref('')
let resendTimer: ReturnType<typeof setInterval> | null = null

function startResendCountdown(seconds = RESEND_DELAY) {
  if (resendTimer) clearInterval(resendTimer)
  resendIn.value = seconds
  resendTimer = setInterval(() => {
    resendIn.value -= 1
    if (resendIn.value <= 0 && resendTimer) {
      clearInterval(resendTimer)
      resendTimer = null
    }
  }, 1000)
}

// Chaque arrivée sur l'étape « code » suit un envoi réussi : le compte à rebours part, la 1re case prend le focus.
watch(step, s => {
  if (s !== 'code') return
  resendInfo.value = ''
  startResendCountdown()
  nextTick(() => codeInputs.value[0]?.focus())
})

async function resendCode() {
  if (resendIn.value > 0 || resending.value) return
  resending.value = true
  authError.value = ''
  codeError.value = false
  resendInfo.value = ''
  try {
    if (codeContext.value === 'reset') await auth.forgotPassword(email.value)
    else await auth.requestOtp(email.value)
    codeDigits.value = ['', '', '', '', '', '']
    resendInfo.value = `Nouveau code envoyé à ${email.value}. Le précédent n'est plus valable.`
    startResendCountdown()
    nextTick(() => codeInputs.value[0]?.focus())
  } catch (e) {
    if (e instanceof ApiRequestError && e.mapped.kind === 'rate_limited') startResendCountdown(e.mapped.retryAfterSeconds ?? RESEND_DELAY * 2)
    authError.value = e instanceof ApiRequestError ? errorText(e.mapped, "Le code n'a pas pu être renvoyé.") : "Le code n'a pas pu être renvoyé."
  } finally {
    resending.value = false
  }
}

async function verifyCode() {
  if (loading.value) return
  const code = codeDigits.value.join('')
  if (code.length < 6) {
    codeError.value = true
    return
  }
  authError.value = ''
  resendInfo.value = ''

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
  { id: 'locataire', label: 'Je cherche un logement', hint: 'Réserver, payer mon loyer, suivre ma caution', icon: House, tint: 'bg-green-50 text-green-700' },
  { id: 'bailleur', label: 'Je loue mes biens', hint: 'Publier, encaisser, gérer mes baux', icon: KeyRound, tint: 'bg-clay-100 text-clay-700' },
  { id: 'artisan', label: 'Je suis artisan', hint: "Recevoir des missions d'entretien et de réparation", icon: Hammer, tint: 'bg-info-bg text-info-fg' }
] as const

const role = useAuthRole()
/** `?role=bailleur` (bouton de /louer) ou `?role=artisan` : le parcours d'inscription démarre sur le bon profil. */
const wantedRole = String(route.query.role ?? '')
if (wantedRole === 'bailleur' || wantedRole === 'locataire' || wantedRole === 'artisan') role.value = wantedRole

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
    // La session ouverte par le code garde le rôle de départ (« tenant ») même après finalize et
    // même après un rafraîchissement : un artisan ou un propriétaire tout neuf recevait des 403 sur
    // son propre espace (constaté en live, Lot 54). Basculer sur le rôle choisi émet un jeton juste.
    try {
      await auth.switchRole(SIGNUP_ROLE_TO_API[role.value])
    } catch {
      await auth.fetchMe()
    }
    // La page d'origine (fiche d'un logement, invitation…) suit jusqu'au bout de la vérification d'identité.
    const back = safeRedirect(route.query.redirect)
    navigateTo(back ? { path: '/kyc', query: { redirect: back } } : '/kyc')
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
          Elle est versée à Immo, pas au bailleur, et reste séquestrée pendant tout le bail.
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
      <!-- Mobile : le panneau photo est masqué, la marque (et le retour à l'accueil) passe en tête du formulaire. -->
      <NuxtLink to="/" class="mb-9 flex w-fit items-center gap-2.5 lg:hidden" aria-label="Accueil Immo">
        <img src="/images/logo.png" alt="" class="h-8 w-8 rounded-[9px]" width="32" height="32">
        <span class="font-display text-[22px] font-extrabold tracking-[-.025em] text-green-900">Immo</span>
      </NuxtLink>
      <div class="animate-[im-fade_.3s_ease_backwards]">
        <template v-if="step === 'email'">
          <h1 class="m-0 font-display text-[29px] font-bold tracking-[-.03em]">Entrer sur Immo</h1>
          <p class="mb-6 mt-2.5 text-[14.5px] text-[var(--text-muted)]">Saisissez votre email : nous vous dirons ensuite s'il faut un mot de passe ou un code.</p>
          <label class="block">
            <span :class="LABEL_CLASS">Adresse email</span>
            <input
              v-model="email"
              type="email"
              autocomplete="email"
              inputmode="email"
              placeholder="vous@exemple.bj"
              :class="[INPUT_CLASS, emailError ? 'border-danger-border' : 'border-[var(--border-default)]']"
              @input="onEmailInput"
              @keydown.enter="goPassword"
            >
          </label>
          <p v-if="emailError" class="mb-0 mt-[7px] text-[12.5px] font-semibold text-danger-fg">Adresse email invalide. Vérifiez l'orthographe ou créez un compte.</p>
          <p v-if="authError" class="mb-0 mt-[7px] text-[12.5px] font-semibold text-danger-fg">{{ authError }}</p>
          <CoreButton size="lg" full-width class="mt-4.5" :disabled="loading" @click="goPassword">{{ loading ? 'Un instant…' : 'Continuer' }}</CoreButton>
          <p class="mb-0 mt-4 text-xs leading-[1.5] text-[var(--text-faint)]">Pas encore de compte ? Saisissez votre email : un code vous permettra d'en créer un.</p>
        </template>

        <template v-else-if="step === 'password'">
<button type="button" class="mb-4.5 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700" @click="backToEmail"><ArrowLeft class="h-4 w-4" :stroke-width="1.9" />Changer d'email</button>
          <h1 class="m-0 font-display text-[29px] font-bold tracking-[-.03em]">Votre mot de passe</h1>
          <p class="mb-6 mt-2.5 text-[14.5px] text-[var(--text-muted)]">Compte <strong class="text-[var(--text-primary)]">{{ email }}</strong></p>
          <label class="block">
            <span :class="LABEL_CLASS">Mot de passe</span>
            <input v-model="password" type="password" autocomplete="current-password" placeholder="••••••••••" :class="[INPUT_CLASS, 'border-[var(--border-default)]']" @keydown.enter="submitPassword">
          </label>
          <p v-if="authError" class="mb-0 mt-[7px] text-[12.5px] font-semibold text-danger-fg">{{ authError }}</p>
          <CoreButton size="lg" full-width class="mt-4.5" :disabled="loading" @click="submitPassword">{{ loading ? 'Connexion…' : 'Se connecter' }}</CoreButton>
          <div class="mt-5 flex flex-col gap-2.5">
            <button type="button" class="text-left text-[13.5px] font-semibold text-green-700" @click="toCodeFromPassword">Recevoir plutôt un code par email</button>
            <button type="button" class="text-left text-[13.5px] font-semibold text-[var(--text-muted)]" @click="toForgotOtp">Mot de passe oublié</button>
          </div>
        </template>

        <template v-else-if="step === 'code'">
          <button type="button" class="mb-4.5 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700" @click="backToEmail"><ArrowLeft class="h-4 w-4" :stroke-width="1.9" />Retour</button>
          <h1 class="m-0 font-display text-[29px] font-bold tracking-[-.03em]">Votre code à 6 chiffres</h1>
          <p class="mb-6 mt-2.5 text-[14.5px] leading-[1.5] text-[var(--text-muted)]">
            Nous l'avons envoyé <strong class="text-[var(--text-primary)]">par email</strong> à {{ email || 'votre adresse' }}. Il n'arrive pas par SMS.
          </p>
          <div class="flex gap-2 sm:gap-2.5" role="group" aria-label="Code à 6 chiffres">
            <input
              v-for="(d, i) in codeDigits"
              :key="i"
              :ref="(el) => setCodeInput(i, el as Element)"
              :value="d"
              inputmode="numeric"
              pattern="[0-9]*"
              :autocomplete="i === 0 ? 'one-time-code' : 'off'"
              :aria-label="`Chiffre ${i + 1} sur 6`"
              class="h-14 w-full min-w-0 rounded-md border bg-[var(--surface-input)] text-center font-mono text-[22px] font-bold outline-none focus:border-green-600 sm:h-[60px]"
              :class="codeError ? 'border-danger-border text-danger-fg' : d ? 'border-green-600 text-[var(--text-primary)]' : 'border-[var(--border-default)] text-[var(--text-primary)]'"
              @input="onCodeInput(i, $event)"
              @paste="onCodePaste(i, $event)"
              @keydown="onCodeKeydown(i, $event)"
              @focus="($event.target as HTMLInputElement).select()"
            >
          </div>
          <p v-if="codeError || authError" class="mb-0 mt-[7px] text-[12.5px] font-semibold text-danger-fg">{{ authError || 'Code incomplet : saisissez les 6 chiffres.' }}</p>
          <p v-else-if="resendInfo" class="mb-0 mt-3.5 rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900">{{ resendInfo }}</p>
          <CoreButton size="lg" full-width class="mt-4.5" :disabled="loading" @click="verifyCode">{{ loading ? 'Vérification…' : 'Vérifier' }}</CoreButton>
          <div class="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p v-if="resendIn > 0" class="m-0 text-[13px] text-[var(--text-muted)]">Renvoyer le code dans <span class="font-mono font-bold">{{ resendIn }} s</span></p>
            <button v-else type="button" class="text-[13px] font-bold text-green-700 disabled:opacity-50" :disabled="resending" @click="resendCode">{{ resending ? 'Envoi…' : 'Renvoyer le code' }}</button>
            <button v-if="codeContext === 'reset'" type="button" class="text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700" @click="toRecovery">J'utilise un code de récupération</button>
          </div>
          <p class="mb-0 mt-3 text-xs text-[var(--text-faint)]">Rien reçu ? Vérifiez vos indésirables avant de demander un nouveau code.</p>
        </template>

        <template v-else-if="step === 'signup'">
          <h1 class="m-0 font-display text-[29px] font-bold tracking-[-.03em]">Créer votre compte</h1>
          <p class="mb-6 mt-2.5 text-[14.5px] text-[var(--text-muted)]">Email vérifié : {{ email || 'votre adresse' }}</p>
          <div class="grid grid-cols-2 gap-3">
            <FormsInput v-model="firstName" label="Prénom" placeholder="Sèdjro" />
            <FormsInput v-model="lastName" label="Nom" placeholder="Aholou" />
          </div>
          <p class="mb-2.5 mt-5.5 text-[12.5px] font-bold">Vous venez sur Immo pour…</p>
          <div class="flex flex-col gap-2.5" role="radiogroup" aria-label="Votre profil">
            <button
              v-for="r in ROLES"
              :key="r.id"
              type="button"
              role="radio"
              :aria-checked="role === r.id"
              class="flex w-full cursor-pointer items-center gap-3.5 rounded-md p-3.5 text-left transition-all"
              :class="role === r.id ? 'border-2 border-green-600 bg-green-50' : 'border border-[var(--border-default)] bg-white'"
              @click="role = r.id"
            >
              <div class="grid h-10 w-10 flex-none place-items-center rounded-sm" :class="r.tint"><component :is="r.icon" class="h-[18px] w-[18px]" :stroke-width="1.9" /></div>
              <div class="flex-1">
                <p class="m-0 text-[14.5px] font-bold">{{ r.label }}</p>
                <p class="mb-0 mt-[3px] text-[12.5px] text-[var(--text-muted)]">{{ r.hint }}</p>
              </div>
              <span
                class="grid h-5 w-5 flex-none place-items-center rounded-pill text-white"
                :class="role === r.id ? 'bg-green-600' : 'border-2 border-[var(--border-default)] bg-transparent'"
              ><Check v-if="role === r.id" class="h-3 w-3" :stroke-width="3" /></span>
            </button>
          </div>
          <p v-if="signupError" class="mb-0 mt-3.5 text-[12.5px] font-semibold text-danger-fg">{{ signupError }}</p>
          <CoreButton size="lg" full-width class="mt-5" :disabled="loading" @click="createAccount">{{ loading ? 'Création du compte…' : 'Créer mon compte' }}</CoreButton>
          <p class="mb-0 mt-3.5 text-[12.5px] leading-[1.5] text-[var(--text-faint)]">
            En continuant, vous acceptez les <NuxtLink :to="{ path: '/legal', query: { doc: 'conditions' } }" class="font-semibold text-green-700">conditions d'utilisation</NuxtLink>
            et la <NuxtLink :to="{ path: '/legal', query: { doc: 'confidentialite' } }" class="font-semibold text-green-700">politique de confidentialité</NuxtLink>.
          </p>
        </template>

        <template v-else-if="step === 'forgot'">
          <button type="button" class="mb-4.5 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700" @click="backToEmail"><ArrowLeft class="h-4 w-4" :stroke-width="1.9" />Retour</button>
          <h1 class="m-0 font-display text-[29px] font-bold tracking-[-.03em]">Nouveau mot de passe</h1>
          <p class="mb-6 mt-2.5 text-[14.5px] text-[var(--text-muted)]">
            {{ resetMethod === 'otp' ? 'Code vérifié.' : 'Utilisez un de vos codes de récupération.' }} Choisissez un mot de passe d'au moins 8 caractères.
          </p>
          <label v-if="resetMethod === 'recovery'" class="mb-3 block">
            <span :class="LABEL_CLASS">Code de récupération</span>
            <input v-model="recoveryCode" placeholder="a1b2c3d4" autocomplete="off" :class="[INPUT_CLASS, 'border-[var(--border-default)] font-mono']">
          </label>
          <label class="block">
            <span :class="LABEL_CLASS">Nouveau mot de passe</span>
            <input v-model="newPassword" type="password" autocomplete="new-password" placeholder="••••••••••" :class="[INPUT_CLASS, 'border-[var(--border-default)]']">
            <span class="mt-[7px] block text-[12.5px] text-[var(--text-faint)]">8 caractères au moins.</span>
          </label>
          <label class="mt-3 block">
            <span :class="LABEL_CLASS">Confirmer le mot de passe</span>
            <input v-model="confirmPassword" type="password" autocomplete="new-password" placeholder="••••••••••" :class="[INPUT_CLASS, 'border-[var(--border-default)]']" @keydown.enter="submitReset">
          </label>
          <p v-if="resetError" class="mb-0 mt-[7px] text-[12.5px] font-semibold text-danger-fg">{{ resetError }}</p>
          <CoreButton size="lg" full-width class="mt-4.5" :disabled="loading" @click="submitReset">{{ loading ? 'Enregistrement…' : 'Enregistrer et me connecter' }}</CoreButton>
        </template>
      </div>
    </div>
  </div>
</template>
