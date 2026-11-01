/**
 * Aides du mode guide, page par page. Chaque texte reprend ce que disent déjà les pages Guide
 * et les pages elles-mêmes : on n'explique que ce que l'application fait aujourd'hui, limites
 * comprises. Une page absente d'ici n'affiche rien.
 */
export interface GuideHint {
  title: string
  text: string
}

export const PAGE_HINTS: Record<string, GuideHint> = {
  '/pro': { title: 'Votre tableau de bord', text: '« À traiter » réunit ce qui attend une action de votre part ; chaque ligne mène à l’objet concerné. Les chiffres clés se calculent sur vos biens et vos baux réels.' },
  '/pro/tarifs': { title: 'Tarifs et disponibilité', text: 'Le tarif « À la nuit » ouvre la réservation en ligne ; les tarifs semaine et mois s’appliquent dès que le séjour est assez long (la combinaison la moins chère). Suspendre un tarif le met en pause sans le supprimer. Les dates bloquées à la main ferment la réservation sur ces jours.' },
  '/pro/baux': { title: 'Baux', text: 'Un bail se prépare (ou naît quand vous retenez un candidat), s’envoie pour signature, puis le locataire paie l’entrée : c’est ce paiement qui le rend actif. Sans paiement sous 72 heures, vous pouvez l’annuler. La caution reste en séquestre chez Bayo pendant tout le bail.' },
  '/pro/edl': { title: 'États des lieux', text: 'L’état des lieux d’entrée, signé des deux côtés, sert de référence : à la sortie, l’application reprend ses pièces et signale chaque élément dégradé.' },
  '/pro/wallet': { title: 'Wallet', text: 'Votre solde disponible reçoit vos revenus et se retire vers Mobile Money à partir de 500 FCFA. Une seule demande à la fois, validée par un administrateur Bayo avant le virement ; vous pouvez l’annuler tant qu’elle est en attente.' },
  '/pro/artisans': { title: 'Artisans', text: 'Vous payez l’intervention depuis votre solde : une partie va tout de suite à l’artisan, Bayo conserve la retenue jusqu’à la fin de la garantie. Un problème pendant la garantie ? Signalez-le, chacun propose un partage de la retenue.' },
  '/pro/signalements': { title: 'Signalements', text: 'Prenez en charge le problème signalé, faites intervenir un artisan sans ressaisir le logement (les photos lui sont transmises), puis marquez-le résolu avec une note pour le locataire.' },
  '/pro/equipe': { title: 'Équipe', text: 'Chaque membre n’agit que sur les biens que vous lui confiez, selon ses permissions. L’invitation passe par un lien, que vous pouvez renouveler ou annuler.' },
  '/pro/mandats': { title: 'Mandats', text: 'Un mandat d’agent l’affiche comme agent d’un bien sans lui ouvrir aucun accès : pour qu’il agisse, invitez-le aussi dans votre équipe.' },

  '/locataire/wallet': { title: 'Votre wallet', text: 'La tirelire est la part réservée au logement : elle seule paie un loyer, une entrée dans les lieux ou une réservation, un solde disponible ne suffit pas. Une recharge Mobile Money la crédite directement.' },
  '/locataire/bail': { title: 'Votre bail', text: 'La caution payée à l’entrée est détenue par Bayo pendant tout le bail : ni vous ni le propriétaire n’y avez accès. Sa restitution en fin de bail n’est pas encore gérée dans l’application. Donner son préavis est une déclaration d’intention : les loyers restent dus jusqu’à la fin du préavis prévu au bail.' },
  '/locataire/edl': { title: 'État des lieux', text: 'Signé des deux côtés à l’entrée, il sert de référence à la sortie. Ne signez pas un état des lieux qui ne correspond pas à ce que vous constatez.' },

  '/artisan/missions': { title: 'Missions', text: 'Candidatez sur un poste de votre métier avec votre prix, une garantie (0 à 90 jours) et la part retenue. Une fois l’offre acceptée, le demandeur paie via Bayo : ne vous déplacez pas avant. La part retenue vous est versée à la fin de la garantie, qui démarre quand vous marquez l’intervention terminée.' },
  '/artisan/facturation': { title: 'Facturation', text: 'Votre solde disponible se retire vers Mobile Money : 500 FCFA minimum, une seule demande en attente à la fois, validée par Bayo avant le virement. Chaque mission payée a sa facture.' },
  '/artisan/partenaires': { title: 'Agences partenaires', text: 'Une agence ou un propriétaire peut vous inviter comme artisan partenaire et vous réserver certaines de ses demandes. Vous acceptez ou refusez l’invitation, et pouvez y mettre fin à tout moment.' },

  '/pro/biens': { title: 'Vos biens', text: 'Une annonce est « Visible dans la recherche » dès qu’un logement est libre, « Hors recherche » si tous sont occupés, « Publication incomplète » s’il n’y en a aucun. Les filtres et la recherche se gardent dans l’adresse de la page. Ajouter un bien exige une identité vérifiée.' },
  '/pro/biens/ajouter': { title: 'Publier un bien', text: 'Le formulaire suit 5 étapes : le bien, les photos, le logement, les conditions, la publication. Il faut 5 photos minimum (JPG, PNG ou WebP). Une fois en ligne, l’annonce apparaît dans la recherche sous une minute tant que le logement est libre. La caution et l’avance sont plafonnées à 3 mois de loyer par la loi 2022-30, et la caution reste séquestrée par Bayo.' },
  '/pro/biens/fiche': { title: 'Fiche du bien', text: 'L’état du bâtiment est purement informatif : seule la présence d’un logement libre rend l’annonce visible. Un bien ou un logement occupé ou en préavis ne peut pas être supprimé : terminez d’abord le bail. Une suppression est définitive et emporte logements, photos et tarifs.' },
  '/pro/demandes': { title: 'Demandes de logement', text: 'Ces recherches publiées par des locataires se filtrent par ville et par type de location ; celles sans ville ou sans type disparaissent quand un filtre est actif. Proposer un logement libre ouvre une conversation et notifie le locataire. Un logement occupé ne peut pas être proposé.' },
  '/pro/visites': { title: 'Visites', text: 'Les visites se rangent en quatre onglets : À traiter, À venir, À clôturer, Historique. Vous pouvez confirmer le créneau demandé ou proposer un autre horaire, entre 7 h et 20 h et au moins 2 h à l’avance. « Marquer réalisée » n’est possible qu’une fois l’horaire passé.' },
  '/pro/candidatures': { title: 'Candidatures', text: 'Retenir un candidat est définitif : un bail brouillon est préparé (relisez-le puis envoyez-le) et les autres candidatures en attente sont refusées, leurs auteurs étant prévenus. Le logement n’est marqué loué qu’une fois le bail signé et le paiement d’entrée reçu. Refuser exige un motif, envoyé dans la conversation.' },
  '/pro/reservations': { title: 'Séjours réservés', text: 'Les séjours se rangent par phase : À venir, Paiement en cours, Terminées, Annulées / expirées. Le voyageur a 15 min pour payer une réservation, et rien n’est bloqué avant. Si une retenue de garantie existe, Bayo la garde jusqu’au départ du voyageur.' },
  '/pro/documents': { title: 'Vos documents', text: 'Cette liste est reconstituée à partir de vos baux (hors brouillons et baux en attente de signature), des états des lieux signés, des factures d’artisan payées et des reçus de séjour confirmés. Si une source ne répond pas, la liste est signalée comme incomplète.' },
  '/pro/messages': { title: 'Messagerie', text: 'Vous y retrouvez vos conversations avec les locataires, candidats et artisans. Vous pouvez joindre une photo ou un PDF de 10 Mo maximum. Une conversation archivée ou fermée est en lecture seule.' },
  '/pro/profil': { title: 'Votre profil', text: 'Votre nom légal, votre raison sociale, votre IFU et votre RCCM sont chiffrés et jamais réaffichés en clair : ne remplissez que ce que vous changez. La suppression du compte est définitive et suppose d’avoir clôturé vos biens actifs et vos baux en cours.' },

  '/locataire': { title: 'Votre tableau de bord', text: '« Prochaines étapes » est calculé d’après vos baux, séjours, demandes et états des lieux à signer. « Activité récente » réunit vos notifications et vos signalements.' },
  '/locataire/candidatures': { title: 'Vos candidatures', text: 'Les onglets séparent « En cours » de « Non retenues », qui regroupe les refus et les candidatures retirées. Retirer une candidature empêche le propriétaire de la retenir. Une fois retenu, le suivi du bail s’affiche sur la carte.' },
  '/locataire/demandes': { title: 'Vos demandes', text: 'Les propriétaires parcourent les demandes par ville et par type de location : sans ces deux critères, la vôtre ne leur apparaît pas. Une demande ne se modifie pas : on peut seulement la fermer, définitivement, et vos conversations restent accessibles.' },
  '/locataire/favoris': { title: 'Vos favoris', text: 'Le favori porte sur le bien entier, et la liste affiche une carte par logement : retirer le cœur sur une carte retire donc tout le bien. Juste après, vous pouvez annuler le retrait.' },
  '/locataire/messages': { title: 'Messagerie', text: 'Vous y retrouvez vos échanges avec les propriétaires et les hôtes. Pour écrire à un propriétaire, passez par une annonce, une visite ou votre bail. Vous pouvez joindre une photo ou un PDF de 10 Mo maximum. Une conversation archivée ou fermée est en lecture seule.' },
  '/locataire/profil': { title: 'Votre profil', text: 'Votre nom légal, votre profession et votre contact d’urgence sont chiffrés et jamais réaffichés en clair. La suppression du compte est définitive (vos données personnelles sont anonymisées) ; elle n’est possible qu’une fois vos baux terminés et votre solde ramené à zéro.' },
  '/locataire/reservations': { title: 'Vos séjours', text: 'Une réservation reste « À payer » pendant 15 min : passé ce délai, les dates sont libérées et rien n’a été débité. Vous pouvez prolonger un séjour payé et télécharger le reçu. Un séjour déjà payé ne s’annule pas encore depuis Bayo : écrivez à l’hôte pour convenir d’une annulation.' },
  '/locataire/signalements': { title: 'Signalements', text: 'Un signalement porte sur le logement que vous occupez : il suppose un bail actif. Le suivi passe par quatre étapes : Déclaré, Pris en charge, Résolu, Clôturé. Vous ne pouvez annuler que tant qu’il est « Déclaré ». Si le problème persiste après « Résolu », écrivez au propriétaire.' },
  '/locataire/visites': { title: 'Vos visites', text: 'Le propriétaire peut confirmer, proposer un autre horaire ou refuser. Annuler une visite le notifie. Une visite se demande entre 7 h et 20 h, au moins 2 h à l’avance ; s’il n’a pas répondu avant la date, vous pouvez la redemander depuis l’annonce.' },

  '/artisan': { title: 'Votre accueil', text: '« En cours » compte les missions qui ne sont ni sous garantie, ni clôturées, ni annulées ; « Terminées » celles terminées ou clôturées. Les « Nouvelles demandes » montrent au plus 4 postes ouverts de votre métier, hors ceux où vous avez déjà candidaté. Sans métier renseigné, aucune demande ne s’affiche.' },
  '/artisan/historique': { title: 'Vos avis', text: 'La note et le nombre d’avis viennent de votre profil, et la répartition par étoile est calculée depuis la liste réelle des avis. Un demandeur peut laisser un avis une fois la mission clôturée.' },
  '/artisan/messages': { title: 'Messagerie', text: 'Vous y retrouvez les conversations des demandes d’intervention. Vous pouvez joindre une photo ou un PDF de 10 Mo maximum. Une conversation archivée ou fermée est en lecture seule.' },
  '/artisan/planning': { title: 'À faire', text: 'La page range par urgence ce qui attend votre action : à réaliser (payées), litiges, négociations, en attente de paiement. Elle n’a pas d’agenda : les dates de passage se conviennent avec le demandeur dans la conversation de la mission. « Marquer terminée » n’est proposé que sur les missions payées.' },
  '/artisan/profil': { title: 'Votre profil', text: 'Votre métier détermine les postes ouverts qui vous sont proposés : choisissez-le pour recevoir des demandes. La présentation est limitée à 1000 caractères et les années d’expérience sont facultatives. Le portfolio rassemble des photos de vos réalisations.' }
}

/** Aide de la page courante : correspondance exacte, sinon la rubrique parente (`/pro/baux/123` → `/pro/baux`). */
export function hintForPath(path: string): GuideHint | null {
  const clean = path.replace(/\/+$/, '') || '/'
  if (PAGE_HINTS[clean]) return PAGE_HINTS[clean]
  const parent = Object.keys(PAGE_HINTS)
    .filter(k => !['/pro', '/locataire', '/artisan'].includes(k) && clean.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0]
  return parent ? PAGE_HINTS[parent]! : null
}
