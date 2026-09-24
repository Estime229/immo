<script setup lang="ts">
const FAQ: Record<string, { question: string; answer: string }[]> = {
  Locataires: [
    { question: 'Comment réserver un logement en courte durée ?', answer: 'Choisissez vos dates sur la fiche du bien : le total, frais de service et réduction de saison compris, se calcule avant tout paiement. La réservation est tenue 15 minutes après validation, le temps de confirmer le paiement Mobile Money.' },
    { question: 'Que se passe-t-il si le propriétaire refuse ma demande ?', answer: "En location longue durée, votre demande est une intention : aucun montant n'est prélevé tant que le propriétaire n'a pas accepté. S'il refuse ou ne répond pas sous 48 h, la demande est annulée sans frais." },
    { question: "Puis-je visiter avant de m'engager ?", answer: "Oui. Depuis la messagerie de l'annonce, proposez un créneau de visite. L'adresse exacte ne vous est communiquée qu'une fois la visite acceptée." },
    { question: 'Comment sont vérifiés les propriétaires ?', answer: "Chaque bailleur fournit une pièce d'identité et un titre de propriété, et un agent Immo visite le bien avant publication. Le sceau « Propriétaire vérifié » n'apparaît qu'après ces deux étapes." }
  ],
  'Propriétaires': [
    { question: "Combien coûte la publication d'une annonce ?", answer: "La publication est gratuite et sans limite d'annonces. Immo ne se rémunère qu'au moment où le loyer est effectivement encaissé : 5 % en gestion directe, 8 % en mandat d'agence." },
    { question: 'Quand suis-je payé ?', answer: "Le loyer est prélevé automatiquement le 5 de chaque mois sur la tirelire du locataire, puis versé sur votre solde Immo, d'où vous pouvez le retirer vers votre numéro Mobile Money." },
    { question: "Que se passe-t-il en cas d'impayé ?", answer: "Une relance automatique part dès l'échéance dépassée. Si le locataire a alimenté son tampon d'avance, celui-ci couvre l'échéance manquée. Vous suivez chaque relance depuis votre tableau de bord." },
    { question: 'Puis-je confier mes biens à une agence ?', answer: 'Oui. En mandat d\'agence, vous accordez à une agence vérifiée des droits précis sur des biens précis. Vous gardez la visibilité sur les loyers et pouvez retirer le mandat à tout moment.' }
  ],
  'Paiements et caution': [
    { question: "Qu'est-ce que la caution séquestrée ?", answer: "La caution est détenue par Immo, ni par vous ni par le propriétaire, pendant toute la durée du bail. Elle est restituée sous 7 jours après l'état des lieux de sortie, déduction faite des seules retenues justifiées par des écarts constatés." },
    { question: 'La caution peut-elle dépasser trois mois de loyer ?', answer: 'Non. La Loi 2022-30 plafonne la caution à trois mois de loyer hors charges. Immo refuse la publication de tout bail qui dépasserait ce plafond.' },
    { question: 'À quoi sert la tirelire ?', answer: "La tirelire est la part de votre solde réservée au logement. C'est elle, et non votre solde disponible, qui sert à payer un loyer ou une réservation : une réservation est refusée si la tirelire est vide, même avec un solde par ailleurs." },
    { question: 'Comment contester une retenue sur ma garantie ?', answer: "Depuis la réservation ou le bail concerné, ouvrez un signalement. La retenue doit être justifiée par la comparaison entre l'état des lieux d'entrée et celui de sortie, photos à l'appui ; à défaut, elle vous est intégralement restituée." }
  ],
  'Sécurité et vérification': [
    { question: 'Quels documents dois-je fournir pour être vérifié ?', answer: "Cela dépend de votre rôle. Locataire : justificatif de domicile, justificatif de revenus (bulletin de salaire ou attestation d'employeur). Bailleur : titre de propriété et RCCM. Artisan : attestation d'assurance et certification professionnelle." },
    { question: 'Je ne suis pas salarié, comment justifier mes revenus ?', answer: "L'attestation d'employeur ou une attestation sur l'honneur de revenus remplace le bulletin de salaire. Une large part des locataires n'est pas salariée : le parcours de vérification le prévoit." },
    { question: 'Le code de connexion arrive-t-il par SMS ?', answer: "Non, le code à usage unique arrive par email. Si vous ne le trouvez pas, vérifiez vos indésirables avant de demander un renvoi." },
    { question: 'Mon compte est suspendu, que faire ?', answer: "Une suspension n'est pas une session expirée : vos données restent intactes. Le motif vous est communiqué à la connexion, avec une référence de dossier et un lien direct vers le support pour régulariser." }
  ]
}

const CATEGORIES = Object.keys(FAQ)

const category = ref(CATEGORIES[0]!)
const query = ref('')
const openQuestion = ref<string | null>(null)

const items = computed(() => {
  const q = query.value.trim().toLowerCase()
  return FAQ[category.value]!.filter(item => !q || `${item.question} ${item.answer}`.toLowerCase().includes(q))
})

function toggle(question: string) {
  openQuestion.value = openQuestion.value === question ? null : question
}
</script>

<template>
  <div class="mx-auto max-w-[900px] px-[26px] pb-[70px] pt-[26px]">
    <h1 class="m-0 font-display text-[30px] font-bold tracking-[-.03em]">Questions fréquentes</h1>
    <input
      v-model="query"
      placeholder="Rechercher une question…"
      class="mt-4.5 h-[50px] w-full rounded-md border border-[var(--border-default)] bg-white px-4 text-[15px] outline-none"
    >

    <div class="my-5 flex flex-wrap gap-2">
      <button
        v-for="c in CATEGORIES"
        :key="c"
        type="button"
        class="rounded-pill border px-[18px] py-2.5 text-[13.5px] font-bold transition-all"
        :class="category === c ? 'border-green-600 bg-green-600 text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'"
        @click="category = c; openQuestion = null"
      >{{ c }}</button>
    </div>

    <div class="flex flex-col gap-2.5">
      <div v-for="item in items" :key="item.question" class="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-white">
        <button type="button" class="flex w-full items-center gap-3.5 px-[22px] py-[19px] text-left" @click="toggle(item.question)">
          <p class="m-0 flex-1 text-[15.5px] font-bold tracking-[-.01em]">{{ item.question }}</p>
          <span
            class="text-[13px] text-[var(--text-faint)] transition-transform duration-[var(--duration-base)]"
            :class="openQuestion === item.question ? 'rotate-90' : 'rotate-0'"
          >▶</span>
        </button>
        <div v-if="openQuestion === item.question" class="px-[22px] pb-5">
          <p class="m-0 max-w-[660px] text-[14.5px] leading-[1.65] text-[var(--text-secondary)]">{{ item.answer }}</p>
        </div>
      </div>
      <div v-if="!items.length" class="rounded-lg border border-dashed border-[var(--border-default)] bg-white p-10 text-center">
        <p class="m-0 text-base font-bold">Aucune question ne correspond</p>
        <p class="mb-0 mt-2 text-sm text-[var(--text-muted)]">Reformulez votre recherche ou écrivez-nous directement.</p>
      </div>
    </div>

    <div class="mt-[26px] flex flex-col items-start gap-5 rounded-xl border border-green-100 bg-green-50 p-[26px] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="m-0 text-[16.5px] font-bold text-green-900">Votre question n'est pas là ?</p>
        <p class="mb-0 mt-1.5 text-sm text-green-800">Écrivez-nous, nous répondons sous 24 h ouvrées.</p>
      </div>
      <NuxtLink to="/contact" class="whitespace-nowrap rounded-md bg-[image:var(--action-primary)] px-6 py-3.5 text-[14.5px] font-bold text-white shadow-action">Nous contacter</NuxtLink>
    </div>
  </div>
</template>
