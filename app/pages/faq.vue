<script setup lang="ts">
import { ArrowRight, ChevronDown, MessageCircleQuestionMark, Search, SearchX } from '@lucide/vue'

/**
 * Réponses réécrites d'après le comportement réel de l'application (Lot refonte) : avant, plusieurs
 * promettaient ce qui n'existe pas (frais de service compris, demande annulée sous 48 h, visite
 * demandée par la messagerie, caution restituée sous 7 jours, taux de 5 % / 8 %, agent qui visite
 * le bien). Les documents demandés suivent `ROLE_DOCS` (utils/kycWizard.ts).
 */
interface FaqItem { question: string; answer: string }
const FAQ: Record<string, FaqItem[]> = {
  Locataires: [
    { question: 'Comment réserver un logement à la nuit ?', answer: "Choisissez vos dates sur la fiche du logement : le total s'affiche avant tout paiement, remise des longs séjours comprise quand le propriétaire en propose une. La réservation est ensuite tenue 15 minutes, le temps de la payer depuis votre tirelire (rechargeable par Mobile Money)." },
    { question: "Puis-je visiter avant de m'engager ?", answer: "Oui, pour un logement loué au mois : sur sa fiche, touchez « Demander une visite » et proposez une date. Le propriétaire confirme, propose un autre horaire ou refuse ; vous suivez la demande dans « Mes visites ». Il faut pour cela un compte vérifié." },
    { question: 'Comment candidater à un logement ?', answer: "Depuis la fiche d'un logement loué au mois, envoyez une candidature avec la date d'emménagement souhaitée. Aucun montant n'est demandé à ce stade. Si le propriétaire la retient, un bail est préparé à partir du loyer et de la caution de l'annonce ; sinon, elle passe en « Non retenue », sans frais. Il faut un compte vérifié." },
    { question: 'Le propriétaire ne répond pas, que faire ?', answer: "Une demande de visite ou une candidature reste en attente tant que le propriétaire n'a pas répondu : elle n'expire pas d'elle-même. Vous pouvez annuler une visite depuis « Mes visites » ou retirer une candidature depuis « Mes candidatures », puis vous tourner vers un autre logement." },
    { question: 'Comment sont vérifiés les propriétaires ?', answer: "Chaque propriétaire dépose une pièce d'identité et des justificatifs (titre de propriété recommandé, certificat RCCM pour une entreprise), examinés par l'équipe Immo. Tant que son compte n'est pas validé, il ne peut ni publier ni modifier un bien." }
  ],
  'Propriétaires': [
    { question: "Combien coûte la publication d'une annonce ?", answer: "Les conditions tarifaires pour les propriétaires ne sont pas encore publiées sur le site. Écrivez-nous depuis la page Contact pour les connaître avant de publier." },
    { question: 'Comment suis-je payé ?', answer: "Le locataire paie le loyer depuis la tirelire de son wallet Immo, lui-même ou automatiquement à chaque échéance s'il a activé le prélèvement automatique. Le montant arrive sur votre solde Immo, d'où vous pouvez le retirer vers votre numéro Mobile Money." },
    { question: "Que se passe-t-il en cas d'impayé ?", answer: "Si le locataire a alimenté son avance sur loyer, elle couvre automatiquement une échéance manquée. Sinon, l'échéance non réglée passe en impayé après un délai de grâce, et vous la voyez dans le suivi de vos baux." },
    { question: 'Puis-je confier mes biens à une agence ?', answer: "Oui. Avec un mandat, vous accordez à un agent ou à une agence des droits précis sur des biens précis. Vous gardez la visibilité sur vos loyers et pouvez mettre fin au mandat depuis votre espace." }
  ],
  'Paiements et caution': [
    { question: "Qu'est-ce que la caution séquestrée ?", answer: "La caution est versée à Immo au paiement d'entrée du bail, pas au propriétaire : ni lui ni vous ne pouvez y toucher pendant toute la durée du bail, et son montant est visible des deux côtés. Sa restitution en fin de bail n'est pas encore gérée dans l'application : pour toute question, écrivez-nous." },
    { question: 'La caution peut-elle dépasser trois mois de loyer ?', answer: "Pour un bail au mois, la Loi 2022-30 plafonne la caution à trois mois de loyer. Sur Immo, une annonce ne peut pas demander davantage ; un bail ne peut dépasser ce plafond qu'avec l'accord explicite des deux parties." },
    { question: 'À quoi sert la tirelire ?', answer: "La tirelire est la part de votre wallet réservée au logement. C'est elle, et non votre solde disponible, qui paie un loyer ou une réservation : un paiement est refusé si la tirelire ne suffit pas, même avec un solde disponible. Une recharge Mobile Money crédite les deux." },
    { question: 'Une question sur ma caution ou un état des lieux ?', answer: "La restitution de la caution et les éventuelles retenues ne sont pas encore gérées dans l'application. Écrivez-nous depuis la page Contact avec le sujet « Caution ou état des lieux », en indiquant la référence du bail." }
  ],
  'Sécurité et vérification': [
    { question: 'Quels documents dois-je fournir pour être vérifié ?', answer: "Une pièce d'identité (carte d'identité ou CIP, passeport, permis de conduire ou carte de séjour) et au moins un justificatif. Locataire : bulletins de salaire (recommandés), attestation d'employeur, justificatif de domicile ou pièce d'un garant. Propriétaire : titre de propriété (recommandé), certificat RCCM ou justificatif de domicile. Artisan : attestation d'assurance (recommandée), certifications ou justificatif de domicile." },
    { question: 'Je ne suis pas salarié, comment justifier mes revenus ?', answer: "Les bulletins de salaire sont recommandés, pas obligatoires : un seul justificatif suffit pour envoyer votre dossier. Sans bulletin, déposez une attestation d'employeur, un justificatif de domicile, ou la pièce d'identité d'une personne qui se porte garante." },
    { question: 'Le code de connexion arrive-t-il par SMS ?', answer: "Non, le code à usage unique arrive par email. Si vous ne le trouvez pas, vérifiez vos indésirables, puis demandez un nouveau code depuis l'écran de connexion." },
    { question: 'Mon compte est suspendu, que faire ?', answer: "Une suspension n'est pas une session expirée : vos données restent intactes. Écrivez-nous depuis la page Contact pour connaître le motif et régulariser votre situation." }
  ]
}

const CATEGORIES = Object.keys(FAQ)
const CATEGORY_OPTIONS = CATEGORIES.map(c => ({ value: c, label: c }))

/* Catégorie et recherche dans l'URL (`?cat=`, `?q=`) : un lien partagé ou le retour arrière gardent la vue. */
const route = useRoute()
const router = useRouter()
function fromQuery() {
  const c = String(route.query.cat ?? '')
  return { category: CATEGORIES.includes(c) ? c : CATEGORIES[0]!, q: String(route.query.q ?? '') }
}
const category = ref(fromQuery().category)
const query = ref(fromQuery().q)
const openQuestion = ref<string | null>(null)

watch(() => [route.query.cat, route.query.q], () => {
  const next = fromQuery()
  category.value = next.category
  if (next.q !== query.value) query.value = next.q
})
watch(category, c => {
  openQuestion.value = null
  router.replace({ query: { ...route.query, cat: c === CATEGORIES[0] ? undefined : c } })
})
let qTimer: ReturnType<typeof setTimeout> | undefined
watch(query, q => {
  clearTimeout(qTimer)
  qTimer = setTimeout(() => router.replace({ query: { ...route.query, q: q.trim() || undefined } }), 300)
})

/** Une recherche porte sur toutes les catégories : la bonne réponse peut être rangée ailleurs. */
const searching = computed(() => !!query.value.trim())
const items = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return FAQ[category.value]!.map(item => ({ ...item, category: category.value }))
  return CATEGORIES.flatMap(c => FAQ[c]!.map(item => ({ ...item, category: c })))
    .filter(item => `${item.question} ${item.answer}`.toLowerCase().includes(q))
})

function toggle(question: string) {
  openQuestion.value = openQuestion.value === question ? null : question
}
</script>

<template>
  <div class="mx-auto max-w-[900px] animate-[im-fade_.3s_ease_backwards] px-[26px] pb-[70px] pt-[26px]">
    <h1 class="m-0 font-display text-[30px] font-bold tracking-[-.03em]">Questions fréquentes</h1>
    <p class="mb-0 mt-2 text-[13.5px] text-[var(--text-muted)]">Louer, publier, payer, se faire vérifier : ce que l'application fait aujourd'hui.</p>

    <label class="relative mt-5.5 block">
      <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" :stroke-width="1.9" />
      <input
        v-model="query"
        type="search"
        placeholder="Rechercher une question…"
        aria-label="Rechercher une question"
        class="h-[42px] w-full rounded-pill border border-[var(--border-default)] bg-white pl-10 pr-4 text-[13px] font-semibold outline-none focus:border-green-600"
      >
    </label>

    <div v-if="!searching" class="-mx-[26px] mt-4 overflow-x-auto px-[26px] [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <FormsSegmentedControl v-model="category" :options="CATEGORY_OPTIONS" size="sm" />
    </div>
    <p v-else class="mb-0 mt-4 text-xs text-[var(--text-faint)]">
      {{ items.length }} résultat{{ items.length > 1 ? 's' : '' }} dans toutes les catégories
    </p>

    <div v-if="items.length" class="mt-5.5 rounded-2xl border border-[var(--border-subtle)] bg-white px-5.5 py-1">
      <div v-for="item in items" :key="item.question" class="border-b border-sand-200 last:border-b-0">
        <button
          type="button"
          class="flex w-full items-center gap-3.5 py-4 text-left"
          :aria-expanded="openQuestion === item.question"
          @click="toggle(item.question)"
        >
          <span class="min-w-0 flex-1">
            <span v-if="searching" class="mb-1 block text-xs text-[var(--text-faint)]">{{ item.category }}</span>
            <span class="block text-[15px] font-bold tracking-[-.01em]">{{ item.question }}</span>
          </span>
          <ChevronDown
            class="h-[18px] w-[18px] flex-none text-[var(--text-faint)] transition-transform duration-[var(--duration-base)]"
            :class="openQuestion === item.question ? 'rotate-180' : 'rotate-0'"
            :stroke-width="1.9"
          />
        </button>
        <p v-if="openQuestion === item.question" class="mb-0 max-w-[680px] pb-4.5 text-[14px] leading-[1.65] text-[var(--text-secondary)]">{{ item.answer }}</p>
      </div>
    </div>
    <div v-else class="mt-5.5 rounded-2xl border border-dashed border-[var(--border-default)] bg-white px-5 py-10 text-center">
      <span class="mx-auto grid h-[46px] w-[46px] place-items-center rounded-pill bg-green-50 text-green-700"><SearchX class="h-5 w-5" :stroke-width="1.9" /></span>
      <p class="mb-0 mt-3 text-[15px] font-bold">Aucune question ne correspond à « {{ query.trim() }} »</p>
      <p class="mb-0 mt-1.5 text-[13.5px] text-[var(--text-muted)]">Essayez un autre mot, ou posez-nous directement la question.</p>
      <button type="button" class="mt-3.5 text-[13px] font-bold text-green-700" @click="query = ''">Effacer la recherche</button>
    </div>

    <div class="mt-5.5 flex flex-col items-start gap-4 rounded-2xl border border-green-100 bg-green-50 p-5.5 sm:flex-row sm:items-center">
      <span class="grid h-[46px] w-[46px] flex-none place-items-center rounded-pill bg-white text-green-700"><MessageCircleQuestionMark class="h-5 w-5" :stroke-width="1.9" /></span>
      <div class="flex-1">
        <p class="m-0 text-[15px] font-bold text-green-900">Votre question n'est pas là ?</p>
        <p class="mb-0 mt-1 text-[13.5px] text-green-800">Écrivez-nous : la réponse arrive à l'adresse email que vous indiquez.</p>
      </div>
      <NuxtLink to="/contact" class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[image:var(--action-primary)] px-5 py-3 text-[14px] font-bold text-white shadow-action">
        Nous contacter<ArrowRight class="h-4 w-4" :stroke-width="1.9" />
      </NuxtLink>
    </div>
  </div>
</template>
