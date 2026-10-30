<script setup lang="ts">
import { ArrowRight, Banknote, BadgeCheck, ClipboardCheck, House, Lock, UserRound } from '@lucide/vue'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'

/**
 * Page « Louer votre bien ». Ne dit que ce que l'application fait : pas de chiffres ni de
 * témoignages inventés, pas de taux de commission (l'API n'en publie aucun — GET /settings/public
 * ne contient que la TVA et les frais de recouvrement), pas de délai de restitution de caution
 * (restitution pas encore gérée, voir locataire/wallet.vue).
 */
const STEPS = [
  { icon: BadgeCheck, title: 'Vous faites vérifier votre compte', text: "Pièce d'identité et justificatifs (titre de propriété recommandé). L'équipe Immo les examine : la publication s'ouvre une fois le compte validé." },
  { icon: House, title: 'Vous publiez', text: 'Photos, loyer, caution et conditions de chaque logement, à louer au mois ou à la nuit. Votre vitrine publique regroupe vos annonces.' },
  { icon: UserRound, title: 'Vous choisissez', text: "Demandes de visite et candidatures viennent de locataires dont l'identité a été vérifiée. Vous acceptez, proposez un autre horaire ou refusez." },
  { icon: ClipboardCheck, title: 'Vous encaissez', text: 'Bail et état des lieux signés dans l\'application. Le loyer, payé depuis le wallet du locataire, arrive sur votre solde Immo, retirable vers Mobile Money.' }
]

/** Exemple chiffré, étiqueté comme tel : caution de 2 mois (valeur par défaut d'une annonce) sur un loyer de 75 000 F. */
const ESCROW_FLOW = [
  { when: "Paiement d'entrée", amount: '150 000 F', text: "Une fois le bail signé des deux côtés, le locataire règle l'entrée : la caution est versée à Immo, pas à vous.", locked: true },
  { when: 'Pendant le bail', amount: '150 000 F', text: "Ni vous ni le locataire n'y avez accès. Le montant est visible des deux côtés.", locked: true },
  { when: 'Fin du bail', amount: null, text: "La restitution n'est pas encore gérée dans l'application. Pour une fin de bail, écrivez-nous.", locked: false }
]

/*
 * Compte déjà connecté (#9) : `/connexion` est réservée aux visiteurs (middleware guest-only) et
 * renvoyait un locataire dans son espace, sans moyen de publier. On lui propose d'ajouter le rôle
 * propriétaire (POST /user/roles, idempotent) puis d'y basculer (POST /auth/switch-role).
 */
const auth = useAuthApi()
const user = auth.user
const PRO_ROLES = ['landlord', 'agent', 'agency']
type CtaKind = 'signup' | 'space' | 'switch' | 'none'
const ctaKind = computed<CtaKind>(() => {
  const u = user.value
  if (!u) return 'signup'
  if (PRO_ROLES.includes(u.role)) return 'space'
  if (u.role === 'admin') return 'none'
  return 'switch'
})
const signupLink = { path: '/connexion', query: { role: 'bailleur' } }

const switching = ref(false)
const switchError = ref('')
async function becomeLandlord() {
  if (switching.value) return
  switching.value = true
  switchError.value = ''
  try {
    await auth.addRole('landlord')
    await auth.switchRole('landlord')
    await navigateTo('/pro')
  } catch (e) {
    switchError.value = e instanceof ApiRequestError ? errorText(e.mapped, "L'espace propriétaire n'a pas pu être ouvert. Réessayez.") : "L'espace propriétaire n'a pas pu être ouvert. Réessayez."
  } finally {
    switching.value = false
  }
}
</script>

<template>
  <div class="animate-[im-fade_.3s_ease_backwards]">
    <section class="mx-auto max-w-[1240px] px-[26px] pt-6">
      <div class="rounded-3xl bg-[image:var(--gradient-balance)] p-8 sm:p-[52px]">
        <h1 class="m-0 max-w-[660px] font-display text-[34px] font-extrabold leading-[1.06] tracking-[-.035em] text-white sm:text-[44px]">
          Louez votre bien, encaissez en Mobile Money.
        </h1>
        <p class="mb-0 mt-3.5 max-w-[560px] text-[16.5px] leading-[1.55] text-white/[.84]">
          Annonces, visites, bail et état des lieux signés en ligne, loyers suivis des deux côtés, caution séquestrée par Immo pendant le bail.
        </p>

        <div class="mt-[30px]">
          <NuxtLink v-if="ctaKind === 'signup'" :to="signupLink" class="inline-flex items-center gap-2 rounded-md bg-clay-500 px-[30px] py-4 text-[15.5px] font-bold text-white shadow-accent">
            Créer mon compte propriétaire<ArrowRight class="h-[18px] w-[18px]" :stroke-width="1.9" />
          </NuxtLink>
          <NuxtLink v-else-if="ctaKind === 'space'" to="/pro" class="inline-flex items-center gap-2 rounded-md bg-clay-500 px-[30px] py-4 text-[15.5px] font-bold text-white shadow-accent">
            Aller à mon espace propriétaire<ArrowRight class="h-[18px] w-[18px]" :stroke-width="1.9" />
          </NuxtLink>
          <template v-else-if="ctaKind === 'switch'">
            <button type="button" class="inline-flex items-center gap-2 rounded-md bg-clay-500 px-[30px] py-4 text-[15.5px] font-bold text-white shadow-accent disabled:opacity-60" :disabled="switching" @click="becomeLandlord">
              {{ switching ? 'Ouverture de l\'espace…' : 'Passer en espace propriétaire' }}<ArrowRight v-if="!switching" class="h-[18px] w-[18px]" :stroke-width="1.9" />
            </button>
            <p class="mb-0 mt-3 max-w-[520px] text-[13px] leading-[1.5] text-white/75">
              Le rôle propriétaire s'ajoute à votre compte : votre espace actuel reste disponible, vous passez de l'un à l'autre depuis le menu.
            </p>
            <p v-if="switchError" class="mb-0 mt-3 inline-block rounded-md bg-white px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ switchError }}</p>
          </template>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-[1240px] px-[26px] pt-11">
      <h2 class="mb-5 mt-0 font-display text-title-2 font-bold tracking-title-2">Comment ça marche</h2>
      <div class="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="(s, i) in STEPS" :key="s.title" class="rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5">
          <div class="flex items-center justify-between">
            <span class="grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><component :is="s.icon" class="h-5 w-5" :stroke-width="1.9" /></span>
            <span class="font-mono text-xs font-bold text-[var(--text-faint)]">0{{ i + 1 }}</span>
          </div>
          <p class="mb-0 mt-4 text-[15px] font-bold">{{ s.title }}</p>
          <p class="mb-0 mt-1.5 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">{{ s.text }}</p>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-[1240px] px-[26px] pt-11">
      <div class="rounded-2xl border border-[var(--border-escrow)] bg-[var(--surface-escrow)] p-5.5 sm:p-8">
        <h2 class="m-0 font-display text-2xl font-bold tracking-[-.025em] text-clay-700">Où va la caution</h2>
        <p class="mb-5.5 mt-2 max-w-[640px] text-[13.5px] leading-[1.55] text-clay-900">
          <span class="font-bold">Exemple</span> : loyer de <span class="font-mono">75 000 F</span>, caution de 2 mois. Sur Immo, une annonce ne peut pas demander plus de 3 mois de caution.
        </p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div v-for="e in ESCROW_FLOW" :key="e.when" class="rounded-2xl border border-[var(--border-escrow)] bg-white p-4.5">
            <p class="m-0 text-label font-bold uppercase tracking-label text-[var(--text-faint)]">{{ e.when }}</p>
            <p v-if="e.amount" class="mb-0 mt-2 inline-flex items-center gap-1.5 font-mono text-xl font-bold text-[var(--text-money-locked)]">
              <Lock class="h-4 w-4" :stroke-width="1.9" />{{ e.amount }}
            </p>
            <p v-else class="mb-0 mt-2 text-[15px] font-bold text-[var(--text-secondary)]">Restitution</p>
            <p class="mb-0 mt-1.5 text-[13px] leading-[1.5] text-[var(--text-muted)]">
              {{ e.text }}
              <NuxtLink v-if="!e.locked" :to="{ path: '/contact', query: { sujet: 'Caution ou état des lieux' } }" class="font-bold text-green-700">Nous contacter</NuxtLink>
            </p>
          </div>
        </div>
      </div>
    </section>

    <section id="tarifs" class="mx-auto max-w-[1240px] scroll-mt-[94px] px-[26px] pt-11">
      <div class="flex flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5 sm:flex-row sm:items-center">
        <span class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-green-50 text-green-700"><Banknote class="h-5 w-5" :stroke-width="1.9" /></span>
        <div class="flex-1">
          <h2 class="m-0 text-[15px] font-bold">Tarifs</h2>
          <p class="mb-0 mt-1 text-[13.5px] leading-[1.55] text-[var(--text-muted)]">Les conditions tarifaires pour les propriétaires ne sont pas encore publiées sur le site. Écrivez-nous pour les connaître avant de publier.</p>
        </div>
        <NuxtLink :to="{ path: '/contact', query: { sujet: 'Publier un bien sur Immo' } }" class="inline-flex flex-none items-center justify-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900 hover:border-green-600">
          Demander les tarifs<ArrowRight class="h-4 w-4" :stroke-width="1.9" />
        </NuxtLink>
      </div>
    </section>

    <section v-if="ctaKind !== 'none'" class="mx-auto max-w-[1240px] px-[26px] pb-4 pt-11">
      <div class="flex flex-col items-start gap-6 rounded-2xl bg-green-900 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-9">
        <div>
          <h3 class="m-0 font-display text-2xl font-bold tracking-[-.025em] text-white">Prêt à publier votre premier bien ?</h3>
          <p class="mb-0 mt-2 text-[15px] text-white/[.78]">
            {{ ctaKind === 'signup' ? 'Créez votre compte, faites-le vérifier, puis publiez.' : ctaKind === 'space' ? 'Vos biens et vos annonces se gèrent depuis votre espace propriétaire.' : 'Ajoutez l\'espace propriétaire à votre compte en un clic.' }}
          </p>
        </div>
        <NuxtLink v-if="ctaKind === 'signup'" :to="signupLink" class="whitespace-nowrap rounded-md bg-white px-7 py-[15px] text-[15px] font-bold text-green-900">Commencer</NuxtLink>
        <NuxtLink v-else-if="ctaKind === 'space'" to="/pro" class="whitespace-nowrap rounded-md bg-white px-7 py-[15px] text-[15px] font-bold text-green-900">Mon espace propriétaire</NuxtLink>
        <button v-else type="button" class="whitespace-nowrap rounded-md bg-white px-7 py-[15px] text-[15px] font-bold text-green-900 disabled:opacity-60" :disabled="switching" @click="becomeLandlord">
          {{ switching ? 'Ouverture…' : 'Passer en espace propriétaire' }}
        </button>
      </div>
    </section>
  </div>
</template>
