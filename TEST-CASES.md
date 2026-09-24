# Cas de test — Plateforme Immo

Document de référence pour tester manuellement la plateforme en conditions réelles (backend live, pas de mock). Chaque cas est vérifiable contre `https://immo-b89b.onrender.com/v1/api` (ou le proxy `/api/proxy/*` du front). Complète `INTEGRATION-TESTS.md`, qui documente ce qui a déjà été vérifié pendant l'intégration — ce fichier-ci sert à *rejouer* ces vérifications, pas à les redécouvrir.

**Légende priorité** : 🔴 Critique (bloque un parcours entier) · 🟠 Haute (fonctionnalité clé) · 🟡 Moyenne · ⚪ Basse (cas limite).

---

## 0. Avant de commencer

### Comptes de test connus

| Compte | Email | Rôle | Notes |
|---|---|---|---|
| Locataire habituel | `s.aholou@mail.bj` | tenant, KYC vérifié | Réutilisé depuis le début de l'intégration — a un historique (demandes, signalements, messages) |
| Locataire | `test-rights-1784884061@example.com` | tenant, KYC vérifié | A déjà une pièce d'identité déposée |
| Locataire | `tenant-visit-test-1790021098@example.com` | tenant | « Visit Tester » |
| Propriétaire | `pro-landlord-test-1789930234@example.com` | landlord, KYC vérifié | Propriétaire de « Unité Test E2E » et « Test Reject E2E Lot23 » |
| Admin | `admin@immo.bj` | admin, niveau 7 | Connexion par mot de passe (`POST /auth/login`), pas OTP |

**Code OTP maître** : `000000` fonctionne pour tout compte lors de la vérification (`/auth/verify-otp`). Ne jamais l'utiliser en rafale — `/auth/verify-otp` est **limité en débit par IP**, pas par compte : plusieurs testeurs (ou sessions automatisées) sur le même réseau se gênent mutuellement. Espacer les tentatives.

**Numéros Mobile Money du bac à sable** (les seuls qui produisent un vrai résultat prévisible) :

| Opérateur | Numéro | Résultat |
|---|---|---|
| MTN | 66000001 | Succès |
| MTN | 66000000 | Échec |
| MTN | 66000002 | Erreur |
| MTN | 66000003 | Timeout |
| Moov | 66100001 | Succès |
| Moov | 66100000 | Échec |
| Moov | 66100002 | Erreur |
| Moov | 66100003 | Timeout |
| Free Money | 66200001 | Succès |

Tout autre numéro produit un comportement non défini côté bac à sable — ne pas s'en servir pour un test de régression.

### Limites connues à ne PAS reporter comme bug

- **`pro/equipe.vue` et `pro/mandats.vue`** : `POST /team/invite` renvoie une **vraie erreur 500 serveur**, confirmée à plusieurs reprises (I2). Rien à corriger côté front — c'est un bug backend en attente.
- **`artisan/planning.vue`** : le blocage de disponibilité est purement local (aucun endpoint API n'existe pour ça). Attendu.
- **Un avis client sur un artisan** ne peut être laissé que sur une intervention **`closed`** (`closed_at` non nul), qui ne survient qu'après l'expiration du délai de garantie (~7 jours après `complete()`). Tenter de noter avant cette échéance renvoie un **400** attendu, pas un bug.
- **Modes de paiement `widget`/`ussd_push`/`mock`** : seule la passerelle FedaPay en mode `redirect` (et `GSM_MTN`/`GSM_MOOV` en direct) est disponible sur cette instance. Les autres modes ne sont pas testables ici.

---

## 1. Authentification & onboarding (I1)

| ID | Titre | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|
| AUTH-01 | Connexion par OTP, nouveau compte | Email jamais utilisé | 1. `/connexion` → saisir un email neuf 2. Code OTP `000000` | Compte créé (`is_new_user: true`), redirection vers l'écran de complétion de profil ou le tableau de bord locataire par défaut | 🔴 |
| AUTH-02 | Connexion par OTP, compte existant | Compte déjà créé | 1. `/connexion` → email existant 2. Code `000000` | Connexion réussie, redirection vers l'espace correspondant au rôle actif | 🔴 |
| AUTH-03 | Code OTP invalide | — | 1. Saisir un code faux (ex. `111111`) | Message d'erreur clair, pas de connexion, pas de plantage | 🟠 |
| AUTH-04 | Connexion par mot de passe (admin) | Compte avec mot de passe défini | 1. `/connexion` → email + mot de passe | Connexion réussie sans passer par l'OTP | 🟠 |
| AUTH-05 | Déconnexion | Connecté | 1. Menu compte → Déconnexion | Jetons effacés, redirection vers l'accueil, tentative de revisite d'une page protégée renvoie vers `/connexion` | 🔴 |
| AUTH-06 | Mot de passe oublié | Compte avec mot de passe | 1. « Mot de passe oublié » 2. Email 3. Code reçu 4. Nouveau mot de passe | Mot de passe changé, connexion possible avec le nouveau | 🟡 |
| AUTH-07 | Session persistante après rechargement | Connecté | 1. Recharger la page (F5) | Toujours connecté, pas de flash de déconnexion | 🟠 |
| AUTH-08 | Session expirée / jeton invalide | Connecté depuis longtemps ou cookies altérés | 1. Naviguer entre deux pages protégées | Rafraîchissement silencieux du jeton, ou redirection propre vers `/connexion` si le rafraîchissement échoue — jamais un écran blanc ou une erreur brute | 🟠 |
| AUTH-09 | Compte suspendu/banni | Compte admin marqué suspendu (nécessite une action admin préalable) | 1. Tenter de se connecter | Message « compte suspendu », pas de session ouverte | ⚪ |
| AUTH-10 | Ajout d'un rôle secondaire | Connecté en tenant | 1. Depuis un point d'entrée pertinent, ajouter le rôle `artisan` ou `landlord` 2. Basculer dessus | Nouveau rôle actif, nouvel espace accessible, jetons renouvelés avec le bon rôle actif | 🟡 |
| AUTH-11 | **Deux comptes différents dans deux onglets** | Deux comptes réels distincts | 1. Onglet A : connecté compte X 2. Onglet B (navigation privée séparée) : connecté compte Y | Chaque onglet affiche **son propre** nom/identité — vérifier explicitement qu'aucun onglet n'affiche le nom de l'autre compte (régression du bug « Bonjour Sèdjro », Lot 36/37) | 🔴 |

---

## 2. KYC — vérification d'identité

| ID | Titre | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|
| KYC-01 | Dépôt d'un document KYC | Connecté, aucun document déposé | 1. `/kyc` → onglet Documents → déposer un fichier | Document envoyé, apparaît dans la liste, statut `pending` | 🟠 |
| KYC-02 | Dépôt de la pièce d'identité | Connecté | 1. `/kyc` → onglet Identité → déposer une photo | Upload réussi, aperçu réel affiché, bouton passe à « Reprendre la photo » | 🟠 |
| KYC-03 | Remplacement de la pièce d'identité | Une pièce déjà déposée | 1. Cliquer « Reprendre la photo » → nouveau fichier | L'ancienne pièce est remplacée (un seul fichier stocké, jamais deux) | 🟡 |
| KYC-04 | Bandeau de statut KYC | Compte avec KYC `pending`/`in_review`/`verified` | 1. Observer le bandeau sur `/kyc` et le tableau de bord | Le bandeau reflète le vrai statut renvoyé par `/auth/me` | 🟡 |
| KYC-05 | Action bloquée sans KYC vérifié | Compte non vérifié | 1. Tenter de demander une visite, ou (côté propriétaire) créer un bien | Erreur 403 explicite (« vérification d'identité requise »), pas un plantage | 🟠 |

---

## 3. Espace Public (non connecté)

| ID | Titre | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|
| PUB-01 | Recherche sans filtre | — | 1. `/recherche` | Liste des logements réels publiés, compteur correct (« N logements disponibles ») | 🔴 |
| PUB-02 | Recherche avec filtres combinés | — | 1. Ville + budget max + chambres min | Résultats filtrés cohérents ; `Aucun logement pour ces critères` si vide | 🟠 |
| PUB-03 | Recherche en langage naturel | — | 1. Onglet « Décrire ma recherche » → « 2 chambres à Cotonou sous 100 000 » | Critères extraits correctement (ville, chambres, budget), résultats filtrés en conséquence | 🟡 |
| PUB-04 | Vue carte | Résultats avec coordonnées GPS | 1. Basculer en vue Carte | Pins positionnés, clic sur un pin ouvre la fiche | 🟡 |
| PUB-05 | Fiche logement | Un logement réel existant | 1. Cliquer sur une carte de résultat | Fiche complète : photos, prix, quartier, caractéristiques, propriétaire vérifié, avis (ou « aucun avis ») | 🔴 |
| PUB-06 | Vitrine propriétaire | Propriétaire avec au moins un bien publiquement listé | 1. Depuis une fiche logement → « Voir sa vitrine » | Profil + liste de ses biens **publiquement listés uniquement** (au niveau du bien, pas seulement de l'unité) | 🟠 |
| PUB-07 | Favoris sans connexion | Non connecté | 1. Cliquer ♥ sur une carte | Redirection vers `/connexion` (pas de plantage, pas d'appel API silencieusement raté) | 🟠 |
| PUB-08 | Page `/favoris` sans connexion | Non connecté | 1. Naviguer directement sur `/favoris` | Message d'erreur propre (pas de crash), invite à se connecter | 🟡 |
| PUB-09 | Formulaire de contact | — | 1. `/contact` → remplir et envoyer | Confirmation d'envoi | ⚪ |
| PUB-10 | Pages statiques | — | 1. `/faq`, `/legal`, `/louer` | Contenu affiché, aucune erreur console | ⚪ |
| PUB-11 | Recherche → puis connexion → favoris persistés | Non connecté puis connexion | 1. Mettre un bien en favori (redirigé vers connexion) 2. Se connecter 3. Retourner sur le bien | Le favori est bien pris en compte après connexion | 🟡 |

---

## 4. Espace Locataire

### 4.1 Tableau de bord

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| LOC-01 | Tableau de bord, compte sans bail | Se connecter avec un compte locataire sans bail actif | États vides honnêtes partout (« Aucun bail pour l'instant », pas de fausses données) | 🟠 |
| LOC-02 | Tableau de bord, compte avec bail actif | Se connecter avec un compte ayant un bail actif | Résumé du bail, loyer, wallet, activité récente réels et cohérents entre eux | 🔴 |
| LOC-03 | Identité affichée dans la barre latérale | Se connecter avec **plusieurs comptes différents**, l'un après l'autre | Le nom affiché (« Bonjour X », avatar, sidebar) correspond **à chaque fois** au compte réellement connecté — jamais un nom d'un autre compte | 🔴 |

### 4.2 Bail

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| LOC-04 | Consultation du bail actif | `/locataire/bail` avec un bail actif | Loyer réel (`signed_rent`), dates, statut, document téléchargeable | 🔴 |
| LOC-05 | Signature d'un bail en attente | Bail au statut « à signer » | Signer depuis l'UI | Statut passe à signé, action confirmée par l'API | 🔴 |
| LOC-06 | Paiement d'entrée de bail | Bail nécessitant un paiement initial | Payer (wallet ou Mobile Money) | Paiement confirmé, statut du bail avancé | 🔴 |
| LOC-07 | Préavis de départ | Bail actif | Déposer un préavis | Préavis enregistré, date de fin prévisionnelle affichée | 🟡 |
| LOC-08 | Changement de logement (plusieurs baux) | Compte avec ≥2 baux | Sélecteur de bail dans l'en-tête | Bascule correctement entre les logements, données rafraîchies | 🟡 |
| LOC-09 | Bail sans date de fin | Bail à durée indéterminée | Consulter `/locataire/bail` | Aucune date de fin fictive affichée (le champ peut être `null`, l'UI doit le gérer) | 🟡 |

### 4.3 Wallet

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| LOC-10 | Recharge Mobile Money réussie | `/locataire/wallet` → Alimenter, MTN `66000001` | Solde crédité après vérification | 🔴 |
| LOC-11 | Recharge Mobile Money échouée | Alimenter, MTN `66000000` | Message d'échec clair, solde inchangé | 🟠 |
| LOC-12 | Paiement de loyer depuis la tirelire | Solde tirelire suffisant, facture en attente | Payer le loyer | `balance_savings` débité, facture soldée | 🔴 |
| LOC-13 | Paiement de loyer, solde insuffisant | Solde tirelire insuffisant | Tenter de payer | Erreur explicite, pas de débit partiel | 🟠 |
| LOC-14 | Historique des transactions | Compte avec des transactions réelles | Consulter l'historique | Montants, dates, types cohérents avec l'API | 🟡 |

### 4.4 État des lieux (EDL)

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| LOC-15 | Consultation d'un EDL | `/locataire/edl` avec un EDL existant | Pièces, éléments, photos (comptage seulement, pas d'upload de photo par élément) | 🟠 |
| LOC-16 | Signature d'un EDL | EDL non signé côté locataire | Signer | Signature enregistrée (vérifier qu'elle est bien **non vide** — un envoi vide ne fait rien côté API) | 🔴 |
| LOC-17 | EDL déjà signé | EDL signé des deux côtés | Consulter | Lecture seule, aucune action de signature proposée | 🟡 |

### 4.5 Visites, réservations, demandes de logement

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| LOC-18 | Demande de visite | Compte **KYC vérifié**, logement disponible | Demander une visite | Visite créée, statut `en attente` | 🟠 |
| LOC-19 | Demande de visite sans KYC | Compte **non vérifié** | Tenter de demander une visite | 403 explicite (« vérification requise »), message clair, pas de plantage | 🟠 |
| LOC-20 | Annulation d'une visite | Visite en attente | Annuler | Visite retirée/marquée annulée | 🟡 |
| LOC-21 | Réservation courte durée | Unité à tarif journalier actif | Créer une réservation, payer | Réservation confirmée, wallet débité | 🔴 |
| LOC-22 | Extension d'une réservation | Réservation active | Demander une extension | Nouvelle date, montant additionnel calculé correctement | 🟡 |
| LOC-23 | Annulation d'une réservation payée | Réservation confirmée | Annuler | Remboursement partiel selon `booking_retention_percentage`, pas un remboursement total automatique | 🟡 |
| LOC-24 | Demande de logement (candidature) | Logement disponible | Envoyer une demande | Demande créée, visible côté propriétaire | 🟠 |

### 4.6 Signalements, messages, favoris, profil

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| LOC-25 | Créer un signalement avec pièce jointe | Bail actif | `/locataire/signalements` → nouveau signalement + photo | Signalement créé, pièce jointe visible, visible côté propriétaire | 🟠 |
| LOC-26 | Suivi d'un signalement | Signalement existant | Consulter son statut | Statut réel (pas figé), historique cohérent | 🟡 |
| LOC-27 | Envoyer un message | Conversation existante ou à créer | Écrire et envoyer | Message reçu côté destinataire en quasi temps réel (ou au rechargement) | 🟠 |
| LOC-28 | Notifications | Une action génère une notification (nouveau message, signalement mis à jour…) | Observer la cloche | Compteur exact, tri chronologique correct | 🟡 |
| LOC-29 | Ajouter/retirer un favori depuis l'espace connecté | `/locataire/favoris` | Retirer un favori | Disparaît de la liste, cohérent avec l'espace public | 🟡 |
| LOC-30 | Modifier son profil | `/locataire/profil` | Changer nom/téléphone/préférences | Sauvegarde confirmée, persiste après rechargement | 🟡 |
| LOC-31 | Définir/changer un mot de passe | `/locataire/profil` | Définir un nouveau mot de passe | Connexion par mot de passe possible ensuite (voir AUTH-04) | 🟡 |
| LOC-32 | Suppression de compte | **Ne pas exécuter sur un compte de test partagé** — isoler sur un compte jetable dédié uniquement | `DELETE /user/delete` | Compte supprimé, irréversible | ⚪ |

---

## 5. Espace Pro (propriétaire / agent / agence)

### 5.1 Biens et unités

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| PRO-01 | Création d'un bien (compte KYC vérifié) | `/pro/biens/ajouter`, 5 étapes | Bien créé à l'étape 1 (`POST /property`), unité ajoutée à la fin | Bien et unité réels visibles dans « Mes biens » et (si publié) dans la recherche publique | 🔴 |
| PRO-02 | Création d'un bien, compte non vérifié KYC | Compte propriétaire non vérifié | Tenter l'étape 1 | 403 `KYC_REQUIRED` explicite | 🟠 |
| PRO-03 | Édition d'une unité — saisie normale | Ouvrir `UniteModal` en édition, attendre le chargement complet | Modifier un champ, enregistrer | `PATCH` réussi, valeur bien répercutée à la relecture | 🔴 |
| PRO-04 | Édition d'une unité — saisie très rapide juste après ouverture | Ouvrir `UniteModal`, taper immédiatement (< 1s) dans un champ avant que le formulaire semble chargé | Enregistrer | **Régression à surveiller** (corrigée Lot 39) : la saisie doit être conservée, pas écrasée silencieusement par les valeurs serveur | 🟠 |
| PRO-05 | Validation des champs numériques | `UniteModal` ou `pro/biens/ajouter` | Taper un nombre à 5 chiffres dans Chambres/Salles de bain | Saisie bloquée à 2 chiffres (`maxlength`), pas de valeur aberrante possible | 🟡 |
| PRO-06 | Suppression d'un bien/unité | Bien de test sans donnée critique | Supprimer | Confirmation demandée, suppression effective | ⚪ |
| PRO-07 | Fiche « Mes biens » | Bien existant | `/pro/biens/fiche` | Détails réels, unité(s), statut(s) | 🟡 |

### 5.2 Baux, tarifs, disponibilité

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| PRO-08 | Création d'un bail | `/pro/baux/nouveau`, locataire choisi parmi les conversations existantes | Créer et envoyer le bail | Bail réel créé, statut « envoyé », visible côté locataire | 🔴 |
| PRO-09 | Annulation d'un bail non payé | Bail créé, pas encore signé/payé | Annuler | Bail retiré/annulé proprement | 🟡 |
| PRO-10 | Résiliation d'un bail actif | Bail actif | Résilier | Statut mis à jour, date de fin cohérente | 🟡 |
| PRO-11 | Tarification d'une unité | `/pro/tarifs` | Ajouter/modifier un tarif (mensuel, journalier…) | Tarif réel enregistré, visible côté recherche publique si applicable | 🟠 |
| PRO-12 | Calendrier de disponibilité | `/pro/tarifs` | Bloquer manuellement une plage | Blocage réel, bloque effectivement une réservation sur cette période | 🟡 |
| PRO-13 | Liste d'attente | Unité avec inscriptions | Consulter | Entrées réelles affichées | ⚪ |

### 5.3 Réservations, documents, signalements, demandes

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| PRO-14 | Réservations reçues | `/pro/reservations` | Consulter/gérer une réservation | Statuts réels, actions (accepter/refuser si applicable) fonctionnelles | 🟠 |
| PRO-15 | Codes promo | `/pro/reservations` → gestion promo | Créer un code promo | Code créé et utilisable côté recherche/réservation | 🟡 |
| PRO-16 | Modifier un code promo existant | Code promo existant | Modifier | **Attention** : l'API exige l'`id` dupliqué dans le corps de la requête (non documenté au Swagger) — vérifier que ça fonctionne bien depuis l'UI | 🟡 |
| PRO-17 | Documents agrégés | `/pro/documents` | Consulter | Baux, états des lieux, factures artisan, reçus de séjour réels, tous téléchargeables | 🟠 |
| PRO-18 | Signalements reçus | `/pro/signalements` | Assigner un signalement à un artisan (texte libre) | Assignation enregistrée | 🟡 |
| PRO-19 | Demandes de logement reçues | `/pro/demandes` | Accepter/refuser une demande | Statut mis à jour, visible côté locataire | 🟡 |
| PRO-20 | Visites programmées | `/pro/visites` | Consulter | Visites réelles, pas de nom manquant en cas de demandeur incomplet | 🟡 |

### 5.4 Artisans (côté propriétaire), équipe, wallet, profil

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| PRO-21 | Demande d'intervention artisan | `/pro/artisans` | Créer une demande ciblée ou ouverte | Demande créée, visible côté artisan concerné | 🟠 |
| PRO-22 | Accepter une offre artisan | Offre reçue sur une demande | Accepter depuis l'UI | Statut « acceptée », bouton « Payer l'intervention » apparaît | 🟠 |
| PRO-23 | Payer une intervention artisan | Offre acceptée, wallet suffisant | Payer | Wallet débité, immédiat + retenue de garantie calculés (`immediateAmount`/`retainedAmount`) | 🔴 |
| PRO-24 | Payer, solde insuffisant | Offre acceptée, wallet à 0 | Payer | Erreur explicite, pas de débit | 🟠 |
| PRO-25 | Invitation partenariat artisan | Artisan trouvé via l'annuaire | Envoyer une invitation | Invitation créée, visible côté artisan | 🟡 |
| PRO-26 | **Inviter un membre d'équipe (I2)** | Contexte agence | `/pro/equipe` → inviter | **Erreur 500 attendue** (bug serveur confirmé, non réparable côté front) — vérifier juste que l'erreur s'affiche proprement, ne pas la traiter comme un nouveau bug | 🟡 |
| PRO-27 | Mandats (I2) | `/pro/mandats` | Consulter | Même blocage que PRO-26 si l'écran dépend du contexte d'équipe | ⚪ |
| PRO-28 | Wallet propriétaire | `/pro/wallet` | Recharger (MTN `66000001`), retirer | Solde crédité, demande de retrait enregistrée | 🟠 |
| PRO-29 | Profil pro | `/pro/profil` | Modifier informations, mot de passe | Sauvegarde confirmée | 🟡 |
| PRO-30 | Bascule de contexte (perso ↔ agence) | Compte avec accès agence | Basculer le contexte de travail | Données affichées changent bien de portée (biens perso vs agence) | 🟡 |

---

## 6. Espace Artisan

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| ART-01 | Devenir artisan (auto-attribution de rôle) | Compte existant (tenant par défaut) | S'attribuer le rôle artisan puis basculer dessus | Rôle ajouté, bascule réussie, espace artisan accessible | 🟡 |
| ART-02 | Configurer son profil artisan | Premier accès à `/artisan/profil` | Renseigner métier, bio, expérience | Profil créé/mis à jour, visible dans l'annuaire si applicable | 🟠 |
| ART-03 | Ajouter une photo au portfolio | Profil artisan existant | Uploader une photo | Photo ajoutée, visible sur le profil | 🟡 |
| ART-04 | Postuler à un poste ouvert | Poste ouvert existant, métier correspondant | `/artisan/missions` → postuler | Candidature créée | 🟠 |
| ART-05 | Proposer une offre | Demande reçue ou candidature | Soumettre prix, garantie, retenue | Offre créée, visible côté propriétaire | 🟠 |
| ART-06 | Marquer une intervention terminée | Intervention payée | `complete()` depuis l'UI | Statut « terminée », garantie/date de libération affichées | 🔴 |
| ART-07 | Consulter son solde wallet | `/artisan/facturation`, compte avec au moins une mission payée | Consulter | Solde réel (`GET /wallet/me`), pas un chiffre par défaut | 🔴 |
| ART-08 | Consulter le détail d'une mission payée | Mission payée existante | Consulter la ligne « Paiements par mission » | Métier, date, retenue de garantie réels | 🟠 |
| ART-09 | Télécharger une facture d'intervention | Mission payée | Cliquer « Facture » | PDF réel généré et ouvert (peut prendre jusqu'à ~20s, repli HTML sinon) | 🟡 |
| ART-10 | Demander un retrait | Solde disponible ≥ 500 FCFA | `/artisan/facturation` → Retirer | Demande réelle envoyée (`POST /wallet/withdraw`), apparaît en « attente » | 🟠 |
| ART-11 | Demander un retrait, solde insuffisant | Solde à 0 | Tenter un retrait | Bouton désactivé / message clair, jamais envoyé à l'API | 🟡 |
| ART-12 | Consulter ses avis | Artisan avec au moins un avis réel (nécessite qu'une intervention soit passée `closed`) | `/artisan/historique` | Note moyenne, nombre d'avis, répartition par étoile, liste réelle — **cas rarement atteignable**, voir limites connues | ⚪ |
| ART-13 | Consulter ses avis, aucun avis | Artisan neuf | `/artisan/historique` | État vide honnête (« Aucun avis pour l'instant »), aucune note fictive | 🟠 |
| ART-14 | Planning | `/artisan/planning` | Consulter | **Toujours en maquette** (assumé, pas un bug) — ne pas reporter comme régression tant qu'aucun endpoint n'existe | ⚪ |
| ART-15 | Partenariats agence | `/artisan/partenaires` | Accepter/refuser une invitation reçue | Statut mis à jour des deux côtés | 🟡 |

---

## 7. Paiements (transverse)

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| PAY-01 | Paiement FedaPay redirect, succès | Tout flux de paiement proposant FedaPay | Compléter avec un scénario succès du bac à sable | Paiement vérifié, wallet/facture crédité | 🔴 |
| PAY-02 | Paiement Mobile Money direct, chaque code sandbox | N'importe quel flux de recharge | Tester les 9 numéros du tableau §0 un par un | Chaque numéro produit exactement le résultat annoncé (succès/échec/erreur/timeout) | 🟠 |
| PAY-03 | Retour de paiement (`/payment/return`) | Paiement FedaPay en cours | Revenir sur la plateforme après paiement | Vérification automatique si l'URL de retour pointe vers l'environnement testé ; sinon, la vérification doit pouvoir être relancée manuellement sans perte de la transaction | 🟡 |
| PAY-04 | Double clic sur « Payer » | N'importe quel paiement | Cliquer deux fois rapidement | Un seul débit, pas de double transaction | 🟠 |

---

## 8. Cas transverses et robustesse

| ID | Titre | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|
| SYS-01 | Perte de connexion réseau en cours d'action | Couper le réseau pendant une requête | Observer | Message d'erreur clair, pas d'état incohérent, action rejouable | 🟡 |
| SYS-02 | Démarrage à froid du backend (Render) | Première requête après une période d'inactivité | Observer le premier chargement | Squelette de chargement affiché plutôt qu'un écran vide, pas de faux « 0 résultat » avant la vraie réponse | 🟠 |
| SYS-03 | Deux onglets, deux rôles différents, même compte | Compte avec plusieurs rôles | Onglet A en `tenant`, onglet B basculé en `landlord` | Chaque onglet reste cohérent avec son propre rôle actif jusqu'à rechargement | 🟡 |
| SYS-04 | Navigation directe vers une page protégée sans connexion | Non connecté | Saisir l'URL d'une page `/locataire/*`, `/pro/*` ou `/artisan/*` | Redirection propre vers `/connexion`, jamais un plantage ou une page à moitié rendue | 🔴 |
| SYS-05 | Rôle incorrect pour une page | Connecté en tenant | Naviguer vers une page `/pro/*` | Redirection ou message d'accès refusé, jamais les données d'un autre rôle affichées | 🟠 |
| SYS-06 | Notifications en temps réel | Deux comptes liés par une action (message, signalement…) | Déclencher l'action depuis un compte, observer l'autre | Cloche/compteur mis à jour sans rechargement forcé (ou au prochain rechargement, selon le mécanisme réel) | 🟡 |
| SYS-07 | Champs multilingues (`description`) | Bien avec description | Consulter une fiche | Le bon texte s'affiche (jamais `[object Object]` — la description est un objet `{fr, en, ...}`, pas une chaîne brute) | 🟡 |

---

## Comment reporter un résultat

Pour chaque cas exécuté, noter : **ID**, **date**, **compte utilisé**, **Réussi / Échoué / Bloqué**, et si échoué — capture d'écran + réponse réseau exacte (statut + corps) de l'appel API concerné. Un « échec » sans la réponse API réelle est difficile à distinguer d'un problème de démarrage à froid du backend (voir SYS-02) ou d'une limite déjà connue (voir §0).
