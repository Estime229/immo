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
  { icon: BadgeCheck, title: 'Vous faites vérifier votre compte', text: "Pièce d'identité et justificatifs (titre de propriété recommandé). L'équipe Bayo les examine : la publication s'ouvre une fois le compte validé." },
  { icon: House, title: 'Vous publiez', text: 'Photos, loyer, caution et conditions de chaque logement, à louer au mois ou à la nuit. Votre vitrine publique regroupe vos annonces.' },
  { icon: UserRound, title: 'Vous choisissez', text: "Demandes de visite et candidatures viennent de locataires dont l'identité a été vérifiée. Vous acceptez, proposez un autre horaire ou refusez." },
  { icon: ClipboardCheck, title: 'Vous encaissez', text: 'Bail et état des lieux signés dans l\'application. Le loyer, payé depuis le wallet du locataire, arrive sur votre solde Bayo, retirable vers Mobile Money.' }
]

/*
 * Avis de propriétaires — EXEMPLES INVENTÉS, en attendant de vrais avis : affichés en
 * développement seulement. De faux avis ou une fausse note visibles en production
 * tromperaient les visiteurs. Remplacer par de vrais témoignages (avec accord) avant
 * de retirer la condition `import.meta.dev`.
 */
const showSampleReviews = import.meta.dev
const SAMPLE_REVIEWS = [
  { name: 'Rodrigue A.', place: 'Cotonou', quote: "Le loyer arrive sur mon solde Bayo et je le retire vers Mobile Money depuis l'application. Je ne passe plus chez le locataire en fin de mois." },
  { name: 'Fifamè D.', place: 'Abomey-Calavi', quote: "L'état des lieux signé avec photos m'a évité une dispute à la sortie : tout était déjà écrit, et signé des deux côtés." },
  { name: 'Ismaël K.', place: 'Parakou', quote: 'Mes studios à la nuit se réservent en ligne. Je vois les dates prises sans passer dix coups de fil.' },
  { name: 'Mariam S.', place: 'Ouidah', quote: "La caution est chez Bayo : le locataire est rassuré, et je n'ai plus à justifier où elle se trouve." },
  { name: 'Agence Les Cocotiers', place: 'Porto-Novo', quote: "Les candidats ont déjà fait vérifier leur identité. On choisit plus vite, et sans mauvaise surprise." }
]
const SAMPLE_REVIEW_STATS = { landlords: 120, rating: '4,8' }
/** Couleur d'initiales par avis : celle déduite du nom tombait presque toujours sur la même. */
const REVIEW_COLORS = ['var(--color-clay-500)', 'var(--color-green-700)', 'var(--color-info-fg)', '#8a2440', 'var(--color-sand-800)']

/** Exemple chiffré, étiqueté comme tel : caution de 2 mois (valeur par défaut d'une annonce) sur un loyer de 75 000 F. */
const ESCROW_FLOW = [
  { when: "Paiement d'entrée", amount: '150 000 F', text: "Une fois le bail signé des deux côtés, le locataire règle l'entrée : la caution est versée à Bayo, pas à vous.", locked: true },
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
    <!-- Héros : bandeau centré, aplat orange (sans dégradé), formes décoratives crème -->
    <section class="mx-auto max-w-[1240px] px-[26px] pt-6">
      <div class="relative overflow-hidden rounded-3xl bg-clay-500 px-6 py-14 text-center sm:px-12 sm:py-20">
        <span class="absolute left-10 top-10 hidden h-[88px] w-[88px] -rotate-6 place-items-center rounded-[26px] bg-white text-clay-500 shadow-raised sm:grid" aria-hidden="true">
          <SearchCategoryIcon code="maison" class="h-14 w-14" />
        </span>
        <!-- Le « B » de Bayo sous son toit (mêmes tracés que bayo-watermark.svg), en crème, coupé par le coin -->
        <svg class="pointer-events-none absolute -bottom-14 -right-10 h-[140px] w-[140px] text-sand-50 sm:-bottom-20 sm:right-4 sm:h-[360px] sm:w-[360px]" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M29 49 L60 22 L91 49" stroke-width="8" />
          <path d="M46 57 V101 M46 57 H62 a10.5 10.5 0 0 1 0 21 H46 M46 78 H65 a11.5 11.5 0 0 1 0 23 H46" stroke-width="12" />
        </svg>

        <div class="relative mx-auto max-w-[720px]">
          <span class="inline-block rounded-pill bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-clay-700">Propriétaires, on vous attend !</span>
          <h1 class="mb-0 mt-5 font-display text-[34px] font-extrabold leading-[1.08] tracking-[-.035em] text-white sm:text-[48px]">
            Louez votre bien, encaissez en Mobile Money.
          </h1>

          <div class="mt-8 flex flex-col items-center">
            <NuxtLink v-if="ctaKind === 'signup'" :to="signupLink" class="inline-flex items-center gap-2 rounded-pill bg-[var(--text-primary)] px-8 py-4 text-[15.5px] font-bold text-white transition-transform hover:scale-[1.03]">
              Créer mon compte propriétaire<ArrowRight class="h-[18px] w-[18px]" :stroke-width="1.9" />
            </NuxtLink>
            <NuxtLink v-else-if="ctaKind === 'space'" to="/pro" class="inline-flex items-center gap-2 rounded-pill bg-[var(--text-primary)] px-8 py-4 text-[15.5px] font-bold text-white transition-transform hover:scale-[1.03]">
              Aller à mon espace propriétaire<ArrowRight class="h-[18px] w-[18px]" :stroke-width="1.9" />
            </NuxtLink>
            <template v-else-if="ctaKind === 'switch'">
              <button type="button" class="inline-flex items-center gap-2 rounded-pill bg-[var(--text-primary)] px-8 py-4 text-[15.5px] font-bold text-white transition-transform hover:scale-[1.03] disabled:opacity-60" :disabled="switching" @click="becomeLandlord">
                {{ switching ? 'Ouverture de l\'espace…' : 'Passer en espace propriétaire' }}<ArrowRight v-if="!switching" class="h-[18px] w-[18px]" :stroke-width="1.9" />
              </button>
              <p class="mb-0 mt-4 max-w-[480px] rounded-xl bg-white/90 px-4 py-2.5 text-[13px] leading-[1.5] text-[var(--text-secondary)]">
                Le rôle propriétaire s'ajoute à votre compte : votre espace actuel reste disponible, vous passez de l'un à l'autre depuis le menu.
              </p>
              <p v-if="switchError" class="mb-0 mt-3 inline-block rounded-md border border-danger-border bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger-fg">{{ switchError }}</p>
            </template>
          </div>
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
          <span class="font-bold">Exemple</span> : loyer de <span class="font-mono">75 000 F</span>, caution de 2 mois. Sur Bayo, une annonce ne peut pas demander plus de 3 mois de caution.
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
        <NuxtLink :to="{ path: '/contact', query: { sujet: 'Publier un bien sur Bayo' } }" class="inline-flex flex-none items-center justify-center gap-1.5 rounded-pill border border-[var(--border-default)] bg-white px-4 py-[9px] text-[13px] font-bold text-sand-900 hover:border-green-600">
          Demander les tarifs<ArrowRight class="h-4 w-4" :stroke-width="1.9" />
        </NuxtLink>
      </div>
    </section>

    <!-- Avis de propriétaires : cartes qui défilent en continu (pause au survol, figées si l'utilisateur réduit les animations) -->
    <section v-if="showSampleReviews" class="pt-14" aria-labelledby="avis-titre">
      <h2 id="avis-titre" class="mx-auto mb-0 mt-0 max-w-[1240px] px-[26px] text-center font-display text-[30px] font-extrabold tracking-[-.03em] sm:text-[38px]">Ils louent déjà avec Bayo</h2>
      <div class="mt-8 overflow-hidden motion-reduce:overflow-x-auto">
        <div class="flex w-max animate-[im-marquee_55s_linear_infinite] py-2 hover:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:px-[26px]">
          <div
            v-for="(r, i) in [...SAMPLE_REVIEWS, ...SAMPLE_REVIEWS]"
            :key="i"
            class="flex-none pr-5"
            :class="i >= SAMPLE_REVIEWS.length ? 'motion-reduce:hidden' : ''"
            :aria-hidden="i >= SAMPLE_REVIEWS.length ? 'true' : undefined"
          >
            <figure class="m-0 flex h-full w-[300px] flex-col justify-between rounded-2xl bg-white p-6 shadow-card sm:w-[340px]">
              <blockquote class="m-0 text-[15px] leading-[1.65] text-[var(--text-secondary)]">{{ r.quote }}</blockquote>
              <figcaption class="mt-6 flex items-center gap-3">
                <CoreAvatar :name="r.name" :size="36" :color="REVIEW_COLORS[i % SAMPLE_REVIEWS.length % REVIEW_COLORS.length]" />
                <span class="text-[14px] font-bold text-[var(--text-primary)]">{{ r.name }}, {{ r.place }}</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
      <div class="mt-7 flex items-center justify-center gap-4 px-[26px]">
        <div class="flex -space-x-2.5">
          <CoreAvatar v-for="(r, i) in SAMPLE_REVIEWS.slice(0, 4)" :key="r.name" :name="r.name" :size="40" :color="REVIEW_COLORS[i]" class="ring-2 ring-[var(--surface-page)]" />
        </div>
        <div>
          <p class="m-0 text-[15px] font-bold text-[var(--text-primary)]">{{ SAMPLE_REVIEW_STATS.landlords }} propriétaires actifs</p>
          <p class="mb-0 mt-0.5 text-[13.5px] text-[var(--text-muted)]">{{ SAMPLE_REVIEW_STATS.rating }} / 5 de satisfaction</p>
        </div>
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
