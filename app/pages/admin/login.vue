<script setup lang="ts">
/** Connexion de l'équipe Immo — même mise en page que /connexion (visuel à gauche, formulaire à droite). */
definePageMeta({ layout: 'blank' })
useHead({ title: 'Connexion admin' })

const { login } = useAdminAuth()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  if (!email.value.trim() || !password.value) {
    error.value = 'Renseignez votre email et votre mot de passe.'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await login(email.value.trim(), password.value)
    router.push(safeRedirect(route.query.redirect) ?? '/admin')
  } catch (e: any) {
    error.value = e?.message || 'Connexion impossible. Réessayez.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="grid min-h-screen grid-cols-1 font-body lg:grid-cols-[1fr_480px]">
    <div class="relative hidden items-end overflow-hidden bg-[image:var(--gradient-hero)] p-11 lg:flex">
      <div class="absolute inset-0 bg-cover bg-center" style="background-image: url(/images/hero/hero-2.jpg)" />
      <div class="absolute inset-0 bg-[image:linear-gradient(180deg,rgba(18,60,41,.15)_35%,rgba(18,60,41,.85)_100%)]" />
      <NuxtLink to="/" class="absolute left-11 top-9 z-10 flex items-center gap-2.5">
        <img src="/images/logo.png" alt="Immo" class="h-8 w-8 rounded-[9px]" width="32" height="32">
        <span class="font-display text-[22px] font-extrabold tracking-[-.025em] text-white">Immo <span class="text-sm font-bold tracking-normal text-clay-100">Admin</span></span>
      </NuxtLink>
      <div class="relative z-10">
        <p class="m-0 max-w-[440px] font-display text-[34px] font-bold leading-[1.12] tracking-[-.03em] text-white">
          La confiance se vérifie, dossier par dossier.
        </p>
        <p class="mb-0 mt-3.5 max-w-[400px] text-[15px] text-white/[.82]">
          Espace réservé à l'équipe Immo : vérifications, litiges, retraits et réglages de la plateforme.
        </p>
      </div>
    </div>

    <div class="flex flex-col justify-center bg-white px-6 py-11 sm:px-[52px]">
      <form class="animate-[im-fade_.3s_ease_backwards]" @submit.prevent="submit">
        <NuxtLink to="/" class="mb-9 flex items-center gap-2.5 lg:hidden">
          <img src="/images/logo.png" alt="Immo" class="h-8 w-8 rounded-[9px]" width="32" height="32">
          <span class="font-display text-[22px] font-extrabold tracking-[-.025em] text-green-900">Immo <span class="text-sm font-bold tracking-normal text-clay-500">Admin</span></span>
        </NuxtLink>

        <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">Espace administrateur</p>
        <h1 class="mb-0 mt-2 font-display text-[29px] font-bold tracking-[-.03em]">Connexion</h1>
        <p class="mb-7 mt-2.5 text-[14.5px] text-[var(--text-muted)]">Avec votre compte administrateur Immo.</p>

        <div class="flex flex-col gap-4">
          <AdminInput v-model="email" label="Email" type="email" placeholder="vous@immo.bj" />
          <AdminInput v-model="password" label="Mot de passe" type="password" placeholder="••••••••••" />
        </div>

        <p v-if="error" class="mb-0 mt-4 rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg" role="alert">{{ error }}</p>

        <AdminButton type="submit" size="lg" full-width class="mt-6" :loading="loading">
          {{ loading ? 'Connexion…' : 'Se connecter' }}
        </AdminButton>

        <p class="mb-0 mt-6 text-center text-[13px] text-[var(--text-faint)]">
          Pas d'accès administrateur ? <NuxtLink to="/connexion" class="font-bold text-green-700">Espace utilisateur</NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>
