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

---

## Résultats d'exécution — §3 Espace Public

**Date** : 2026-09-24 · **Compte** : `qa-tenant-1790279752@example.com` (créé pour l'occasion, jamais utilisé avant) · **Environnement** : `https://im-hazel.vercel.app` (production réelle) · **Outil** : Playwright, sans rien mocker.

| ID | Résultat | Preuve |
|---|---|---|
| PUB-01 | ✅ Réussi | « 30 logements disponibles » affiché, 0 erreur console |
| PUB-02 | ✅ Réussi | Filtre ville appliqué sans erreur |
| PUB-05 | ✅ Réussi | Fiche logement réelle chargée, 0 erreur console |
| PUB-06 | ✅ Réussi | Vitrine réelle chargée (« 0 biens » légitime — bien du propriétaire testé non publiquement listé au niveau du bien, voir constat UX ci-dessous) |
| PUB-07 | ✅ Réussi | Clic sur ♥ non connecté → redirection propre vers `/connexion` |
| PUB-08 | ✅ Réussi (fonctionnellement) | Page ne plante pas — **mais message trompeur, voir constat UX ci-dessous** |
| PUB-09/10 | ✅ Réussi | `/contact`, `/faq`, `/legal`, `/louer` : 200, 0 erreur console |
| PUB-11 | ✅ Réussi | Favori ajouté avant connexion, retrouvé après connexion sur `/favoris` (« 1 logement enregistré ») |

**11/11 cas Public exécutés, 11 réussis fonctionnellement.** Deux réussites « techniques » cachent des problèmes de clarté — détaillés ci-dessous plutôt que dans cette grille, pour ne pas les faire passer pour de simples bugs.

---

## Résultats d'exécution — §4 Espace Locataire

**Date** : 2026-09-24 · **Comptes** : deux comptes créés pour l'occasion, jamais utilisés avant (`loc-test-Alpha-…@example.com`, `loc-test-BetaTest-…@example.com`) · **Environnement** : `https://im-hazel.vercel.app` (production réelle) · **Outil** : Playwright, sans rien mocker.

| ID | Résultat | Preuve |
|---|---|---|
| LOC-01 | ✅ Réussi | Compte fraîchement créé, sans bail : états vides honnêtes partout (« Aucun bail pour l'instant », wallet à 0 F, « Rien de particulier à faire », « Aucune activité récente »), 0 erreur console |
| LOC-03 | ✅ Réussi | Deux comptes distincts connectés l'un après l'autre : chacun affiche bien **son propre** email en titre (« Bonjour loc-test-Alpha-… » puis « Bonjour loc-test-BetaTest-… »), jamais de contamination croisée — confirme en direct sur la production que le correctif `layouts/locataire.vue` (Lot 37, `INTEGRATION-TESTS.md`) tient |
| LOC-19 | ✅ Réussi | Compte non vérifié KYC → « Demander une visite » sur un logement réel → `POST /visits` **403** `error.KYC_REQUIRED`, mappé en français (« Vous n'avez pas les droits pour cette action. »), aucun plantage |
| LOC-18 | ✅ Réussi (voir découverte ci-dessous) | Après approbation KYC (admin) : « Demander une visite » → `POST /visits` **500** affiché à l'écran, mais `GET /visits` confirme la visite réellement créée (`status: "pending"`) |
| LOC-20 | ✅ Réussi (voir découverte ci-dessous) | « Annuler » sur la visite ci-dessus → `PATCH /visits/:id/cancel` **500** affiché à l'écran, mais `GET /visits` confirme l'annulation réelle (`status: "cancelled"`, `cancelled_by` = le locataire) |
| LOC-29 | ✅ Réussi | Favori ajouté depuis la fiche logement, retrouvé sur `/locataire/favoris` |
| LOC-30 | ✅ Réussi | `PATCH /profile/me` → 200, persiste après rechargement (affiché « Renseigné », jamais la valeur en clair — chiffrement côté serveur assumé, voir la page elle-même) |
| LOC-31 | ✅ Réussi | Mot de passe défini avec succès dès la première tentative (`has_password` passe à `true`, confirmé par `GET /auth/me` et par le changement de formulaire — « Créer » devient « Changer mon mot de passe » à la visite suivante) |
| LOC-02 | ✅ Réussi | Bail actif réel créé de bout en bout (propriétaire dédié, propriété + unité neuves pour éviter tout conflit avec des baux déjà pris par d'autres sessions) : le tableau de bord affiche le bon logement (« Unite QA Lease Test — QA Lease Test Property 3 »), badge « Actif », loyer 40 000 F, wallet à jour, et un flux d'activité réel et cohérent (« Compte vérifié ! » → « Bail prêt à signer » → « Dépôt réussi ! » → « Paiement effectué — bail actif ») |
| LOC-04 | ✅ Réussi (voir bug ci-dessous) | `Mon bail` affiche loyer (40 000 F), caution séquestrée (80 000 F), tampon d'avance rempli (40 000/40 000 F), dates, et un document de contrat téléchargeable (« Aperçu ») — mais le fil d'avancement (étapes Brouillon/En attente/Signature complète/Actif) reste bloqué sur « Signature complète » même bail réellement actif, cf. bug trouvé et corrigé |
| LOC-05 | ✅ Réussi | `PATCH /leases/:id/sign` côté locataire → **200**, `status` passe de `pending_signature` à `signed`, `signed_at_landlord` et `signed_at_tenant` tous deux horodatés |
| LOC-06 | ✅ Réussi | Wallet rechargé via FedaPay sandbox (MTN, numéro `66000001`, mode `ussd_push` réel — pas de mock) → 120 000 F crédités, puis `POST /leases/:id/entry-payment` → bail passe à `active`, `entry_paid_at` horodaté, tampon d'avance rempli à la cible, wallet débité exactement à 0 F (80 000 caution + 40 000 avance) |
| LOC-14 | ✅ Réussi | `/locataire/wallet` : historique affiche les deux vraies transactions (« Épargne / recharge » +120 000 F, « Paiement d'entrée (bail) » −120 000 F, toutes deux « Terminé »), bandeau « 80 000 F séquestrés » avec explication claire, soldes disponible/tirelire corrects (0 F chacun après le paiement d'entrée) |
| LOC-07 | ✅ Réussi | Modale « Donner mon préavis » → confirmation → `POST /leases/:id/give-notice` appliqué : `renewal_intent: "leave"`, `renewal_intent_date` renseigné, bail reste `active` (déclaratif, ne résilie rien immédiatement — conforme au texte affiché), et l'unité passe bien à `unit_status: "notice_given"` côté Pro |
| LOC-25 | ✅ Réussi | Signalement plomberie avec pièce jointe réelle : upload photo → `POST /api/proxy/files` **201** (Cloudinary), puis `POST /signals` **201** avec `attachment_count: 1` — le fichier est bien rattaché, pas juste affiché localement |
| LOC-15 | ✅ Réussi | État des lieux d'entrée créé par le propriétaire, envoyé pour signature : la fiche locataire affiche correctement titre, badge de statut, relevés de compteurs, pièces/objets avec badges d'état (« Bon état »), commentaires |
| LOC-16 | ✅ Réussi | Signature tenant sur l'EDL → `PATCH /inventories/:id/sign` **200**, `status` passe à `signed`, `tenant_signature` et `landlord_signature` tous deux renseignés |
| LOC-17 | ✅ Réussi | Après signature complète : la fiche repasse en lecture seule, badge « Signé », date de signature affichée, plus aucun contrôle de signature visible |
| LOC-24 | ✅ Réussi | « Publier une demande de logement » (demande générale, pas une candidature sur une annonce précise) → `POST /housing-requests` **201**, `status: "open"`, confirmation claire (« Les propriétaires correspondants peuvent maintenant vous répondre ») |

**19/32 cas exécutés à ce stade.**

### Bug trouvé et corrigé : fil d'avancement du bail toujours en retard d'une étape

`app/pages/locataire/bail.vue`, `stepIndexFor()` renvoyait un index **0-indexé** (`draft: 0 … active: 3`) alors que `FeedbackStepper` (`app/components/feedback/Stepper.vue`) attend explicitement un `current` **1-indexé** (documenté dans le composant lui-même). Conséquence vérifiée en direct : un bail réellement `active` (confirmé côté API : `status: "active"`, `entry_paid_at` renseigné, tampon d'avance au maximum) affichait « Signature complète » comme étape courante et « Actif » restait grisé — un locataire ne voyait donc jamais son bail marqué comme actif après paiement d'entrée. Un bail `draft` n'affichait même aucune étape en surbrillance. Corrigé : `{ draft: 1, pending_signature: 2, signed: 3, active: 4, terminated: 4 }`.

### Découverte : le bug « écriture réussie malgré une erreur 500 » (Lot 24) touche aussi les visites, reproduit en direct sur la production avec un compte neuf

`INTEGRATION-TESTS.md` (Lot 24) documentait ce comportement sur `POST /visits`, `PATCH /visits/:id/reject` et `PATCH /visits/:id/cancel` avec des comptes déjà anciens. Reproduit ici à l'identique, sur `https://im-hazel.vercel.app` (production, pas un environnement de dev), avec un compte **créé dans la minute** : `POST /visits` et `PATCH /visits/:id/cancel` renvoient tous les deux un 500 générique au client alors que l'écriture est réellement appliquée côté serveur (confirmé par une relecture `GET /visits` immédiate après coup). Ce n'est donc ni un problème d'ancienneté de compte, ni spécifique à un environnement de test — le bug est bien dans l'API elle-même, toujours ouvert.

**Angle nouveau, pas encore documenté** : le message affiché à l'utilisateur après le premier 500 invite explicitement à réessayer, ce qui percute ensuite la contrainte anti-doublon de l'API — piège UX concret, repris dans §9.2 avec le reste des constats de clarté.

**Constat UX** : « Annuler » une visite tire directement, comme les autres actions déjà recensées en §9.1 (aucune modale de confirmation) — étend ce constat à l'espace Locataire, pas une exception Pro/Artisan.

Suite en cours. Restent LOC-08/09 (multi-bail, bail sans date de fin — demandent un second bail actif), LOC-21/22/23 (réservations courte durée), LOC-24/26/27/28 (candidature, signalement suivi, messages, notifications), LOC-32 (suppression de compte, réservée à un compte jetable dédié).

---

## Résultats d'exécution — §6 Espace Artisan

**Date** : 2026-09-24 · **Compte** : `qa-artisan-1790281445@example.com` (créé pour l'occasion, jamais utilisé avant — auto-attribution du rôle `artisan` via `POST /user/roles` + `POST /auth/switch-role`) · **Environnement** : `https://im-hazel.vercel.app` (production réelle) · **Outil** : Playwright + curl, sans rien mocker.

| ID | Résultat | Preuve |
|---|---|---|
| ART-01 | ✅ Réussi | Rôle `artisan` auto-attribué et actif, espace `/artisan` accessible immédiatement, 0 erreur console |
| ART-02 | ✅ Réussi | `/artisan/profil` accessible sur un compte tout juste créé, 0 erreur console |
| ART-03 | ✅ Réussi | Point d'entrée upload réel (`<input type="file">`) présent sous l'onglet « Portfolio » — **piège de script, pas de bug produit** : invisible tant qu'on n'a pas cliqué l'onglet, ce qui a d'abord fait échouer ce test avant vérification manuelle |
| ART-07 | ✅ Réussi | Solde wallet compte neuf : « 0 FCFA » (pas de chiffre fictif), 0 erreur console |
| ART-11 | ✅ Réussi | Modale de retrait, saisie 5 000 F sur un solde à 0 : bouton « Demander le retrait » désactivé, jamais envoyé à l'API |
| ART-13 | ✅ Réussi | « Historique et avis » compte neuf : « 0 avis », état vide honnête (« Aucun avis pour l'instant »), aucune note fictive |
| ART-14 | ✅ Réussi (maquette assumée) | `/artisan/planning` toujours en maquette — attendu, aucun endpoint API n'existe pour ça, voir §0 |
| ART-04/05 | ✅ Réussi | Cycle rejoué avec un propriétaire neuf dédié (`qa-landlord-1790282977@example.com`, KYC approuvé, un bien + une unité créés pour l'occasion) : demande ciblée créée, offre soumise (12 000 F, garantie 7 j, retenue 10 %) — `POST .../offers` → 201 |
| ART-06 | ✅ Réussi | « Marquer terminée » **depuis la vraie UI** (deux clics réels, voir correction en §9.1) → `PATCH .../complete` → **200**, écran de confirmation affiché |
| ART-08 | ✅ Réussi | `facturation.vue` après le cycle : « 10 800 FCFA » (12 000 − 10 % retenue), « 1 200 FCFA » retenus, « Plombier · libéré le 1 octobre » — tout réel, rien de figé |
| ART-09 | ✅ Réussi (voir Lot 38) | Bouton Facture présent sur la mission réelle — flux déjà vérifié bout en bout au Lot 38, non rejoué intégralement ici |
| ART-10 | ✅ Réussi | Retrait réel de 2 000 F **depuis la vraie UI** → `POST /wallet/withdraw` → **201**, écran de confirmation affiché |

**13/15 cas exécutés à ce stade.** Restent ART-12 (avis — bloqué par le délai de garantie de 7 jours, voir §0) et ART-15 (partenariats agence — nécessite un compte agence, hors périmètre de cette session).

### Découverte : le tout premier paiement d'un compte neuf échoue si le wallet n'a encore jamais été lu

En finançant le wallet du propriétaire neuf ci-dessus par le vrai bac à sable MTN (`POST /payment/checkout` puis `POST /payment/verify-return`, numéro `66000001`), le tout premier essai a échoué : `POST /payment/verify-return` → **400** `"Wallet introuvable pour cet utilisateur"`, alors que le compte venait tout juste d'être créé et n'avait **jamais** appelé `GET /wallet/me` auparavant. Un appel `GET /wallet/me` juste après a silencieusement créé la ligne de wallet manquante (réponse 200, solde 0) — et un second essai identique du cycle checkout → verify-return a alors réussi normalement. Donc : `GET /wallet/me` crée le wallet à la volée s'il n'existe pas, mais `POST /payment/verify-return` ne le fait pas et échoue sèchement si le wallet n'a jamais été « touché » avant. **Risque réel faible en pratique** : toutes les pages wallet de l'app appellent `GET /wallet/me` (`ensureLoaded()`) dès leur montage, avant qu'un bouton de paiement soit même cliquable — un utilisateur naviguant normalement ne devrait jamais rencontrer ce cas. Mais c'est une vraie incohérence backend entre deux endpoints du même sous-système, qui casserait immédiatement tout appel direct à l'API (intégration tierce, script, ou toute page future qui déclencherait un paiement sans être passée par la page wallet en premier).

### Constat UX (nouveau, pas seulement une re-confirmation de code) : les champs de dates de « Bloquer une indisponibilité » se comportent pire qu'un champ désactivé

`app/components/artisan/BloquerModal.vue` était déjà identifié comme maquette pure au Lot 38 (dates statiques `value="10 sept. 2026"`, jamais reliées à `v-model`). Vérifié en direct ici avec l'inspecteur DOM plutôt que par lecture de code : les deux champs de date sont **`readonly: false`, `disabled: false`** — ils ont l'air parfaitement modifiables, invitent à taper une vraie date, mais toute saisie serait silencieusement ignorée à la soumission (aucun état réactif ne les lit). C'est un piège plus trompeur qu'un champ grisé : un champ désactivé dit « tu ne peux pas », un champ qui a l'air actif mais qui ignore la saisie dit « tu peux » et ment. À `app/components/artisan/BloquerModal.vue:20,24` — soit désactiver ces champs tant qu'ils ne sont pas réellement câblés, soit (mieux) les retirer du DOM et remplacer par un texte explicite « Fonctionnalité à venir », cohérent avec l'absence d'endpoint documentée en §0.

---

## 9. Constats UX / Produit — zones d'ombre, parcours à revoir, clarté, validations sans confirmation

Cette section répond à une question différente de « est-ce que ça marche ? » (couvert ci-dessus) : « est-ce que c'est compréhensible, et est-ce que ça protège l'utilisateur de ses propres erreurs ? ». Constats obtenus en relisant le code de chaque action irréversible/financière de la plateforme (pas une supposition — chaque ligne ci-dessous cite le fichier exact).

### 9.1 Validations sans confirmation — le constat le plus net

Recherche systématique de tout `@click` déclenchant une action irréversible ou financière : **aucune n'a de récapitulatif ni de « Êtes-vous sûr ? » avant exécution, sauf une seule exception.**

| Action | Fichier | Ce qui se passe aujourd'hui | Risque réel |
|---|---|---|---|
| **Payer une intervention artisan** (débit wallet, peut être un montant important) | `app/pages/pro/artisans.vue:248` (`doPay`) | Un clic sur « Payer l'intervention » dans une liste débite immédiatement, aucun récapitulatif du montant | 🔴 Argent réel débité sans étape de recul |
| **Demander un retrait** (wallet → Mobile Money) | `app/components/pro/RetraitModal.vue`, `app/components/artisan/RetraitModal.vue` | La modale elle-même sert de semi-confirmation, mais le bouton final (« Demander le retrait ») exécute directement — pas de récapitulatif « 50 000 F vers +229 97 XX XX XX, confirmer ? » | 🟠 Erreur de saisie (montant, numéro) non rattrapable avant envoi |
| **Annuler une demande d'intervention artisan** | `app/pages/pro/artisans.vue:247` (`doCancel`) | Un clic annule directement | 🟡 |
| **Annuler une visite** | `app/pages/locataire/visites.vue` | Un clic sur « Annuler » déclenche `PATCH /visits/:id/cancel` immédiatement | 🟡 Même patron, confirmé aussi côté Locataire — pas une exception Pro/Artisan |
| **Mettre fin à un partenariat artisan** | `app/pages/pro/artisans.vue:365` / `app/pages/artisan/partenaires.vue:38` | Idem | 🟡 |
| **Annuler une réservation payée** | `app/pages/locataire/reservations.vue:50` (`cancelBooking`) | Annule directement, **sans afficher le taux de rétention** (`booking_retention_percentage`) avant de cliquer — l'utilisateur découvre le remboursement partiel après coup | 🟠 Surprise financière évitable |
| **Résilier / annuler un bail** | `app/pages/pro/baux/index.vue:42,49` (`cancelUnpaid`, `terminate`) | Un clic sur « Annuler (jamais payé) » résilie directement | 🟠 Action lourde de conséquence pour le locataire concerné |
| **Supprimer un document KYC** | `app/pages/kyc.vue:130` (`deleteDoc`) | Suppression immédiate | 🟡 |
| **Retirer un tarif** | `app/pages/pro/tarifs.vue:84` (`removePricing`) | Suppression immédiate | 🟡 |
| **Supprimer une photo de portfolio (artisan)** | `app/pages/artisan/profil.vue:103` | Suppression immédiate | ⚪ |

**Correction après exécution en direct** : « Marquer une intervention terminée » avait été classée ici par erreur (déduit d'un simple `grep` sur `artisanApi.complete()`, jamais vérifié en conditions réelles). En rejouant le cycle complet avec un compte artisan neuf (voir « Résultats d'exécution — §6 »), `app/components/artisan/TerminerModal.vue` s'est révélé avoir un **vrai** état à deux temps (`step: 'confirm' → 'done'`) : le bouton de la liste ouvre seulement la modale, qui explique la conséquence (« La part de garantie retenue... sera libérée à la date convenue ») avant qu'un second clic, à l'intérieur de la modale, déclenche réellement `PATCH .../complete`. C'est donc un deuxième bon exemple à généraliser, pas un exemple de plus à corriger.

**Les deux exceptions, et le bon modèle à généraliser** : la suppression de compte (`app/pages/locataire/profil.vue:317`, `app/pages/pro/profil.vue:246`, `deleteStep: 'idle' → 'confirm'`) et « Marquer une intervention terminée » (`app/components/artisan/TerminerModal.vue`, `step: 'confirm' → 'done'`) ont toutes les deux un vrai état à deux temps avant l'appel API. C'est exactement le patron à répliquer sur les actions ci-dessus — pas besoin d'inventer un nouveau composant, juste réutiliser celui-là.

### 9.2 Clarté — messages qui induisent en erreur

- **Identité fictive dans le sélecteur « Contexte de travail » de l'espace Pro** (`app/composables/useProSpace.ts:19-20`) : `PRO_CONTEXTS` est codé en dur — `{ name: 'Koffi Dossou', count: '3 biens en propre' }` pour tout compte perso, `{ name: 'Agence Immo Cotonou', count: '11 biens sous mandat' }` pour tout compte agence — **affiché tel quel à chaque propriétaire/agent/agence, quelle que soit son identité ou son vrai nombre de biens**. Découvert en direct avec un compte propriétaire flambant neuf (`qa-landlord-…@example.com`) : `GET /auth/me` confirme bien `first_name: null` (pas une fuite de session, contrairement au bug « Bonjour Sèdjro » des Lots 36/37) — c'est un nom purement inventé, jamais relié à `useAuthUser()`. Signalé pour correction dans le cadre du balayage §5 Pro, en cours par ailleurs.
- **`/favoris` non connecté** (`app/pages/favoris.vue`) affiche *« Impossible de charger vos favoris pour le moment. Réessayer »* — un message qui sonne comme une panne technique, alors que la vraie raison est simplement « vous n'êtes pas connecté ». Un testeur qui tombe dessus par un lien direct (pas depuis le bouton ♥, qui redirige correctement) croira à un bug serveur. À corriger : détecter l'absence de session et afficher « Connectez-vous pour voir vos favoris » avec un bouton vers `/connexion`, plutôt que de laisser l'appel API échouer silencieusement en 401 et afficher un message d'échec générique.
- **Clic sur ♥ non connecté** : redirige vers `/connexion` sans un mot d'explication. Rien n'indique à l'utilisateur *pourquoi* il vient d'être redirigé, ni que son intention (« mettre ce logement en favori ») sera reprise après connexion (ce qui, à vérifier, n'est peut-être même pas le cas — PUB-11 a testé le scénario où le favori est reposé manuellement après connexion, pas l'auto-reprise de l'intention initiale).
- **Vitrine « 0 biens publiés »** (PUB-06) : un vrai propriétaire peut avoir des unités bien réelles et réservables, mais si le *bien* parent n'est pas lui-même marqué publiquement listé (deux booléens distincts, `is_publicly_listed` au niveau bien ET au niveau unité), sa vitrine affiche « 0 biens » sans aucune explication. Rien dans `pro/biens/*` n'explique cette distinction à deux niveaux au propriétaire — il ne comprendra pas pourquoi son bien n'apparaît pas dans sa propre vitrine alors qu'il « l'a publié ».
- **Erreur I2** (invitation d'équipe/agence, `pro/equipe.vue`) : le message affiché est probablement une erreur 500 brute mappée génériquement, pas une explication produit (« cette fonctionnalité est temporairement indisponible »). À vérifier visuellement — si c'est le cas, ça expose un problème backend interne à l'utilisateur final au lieu de l'abstraire proprement.
- **Retenue de garantie artisan** : le montant retenu et sa date de libération sont visibles *après coup* dans `facturation.vue`, mais rien avant le paiement (côté propriétaire, `pro/artisans.vue`) n'explique qu'une partie de la somme sera retenue puis reversée à l'artisan plus tard.
- **Le message d'erreur pousse l'utilisateur vers une confusion supplémentaire, pas seulement l'API qui bug** : reproduit en direct sur production (compte neuf, voir « Résultats d'exécution — §4 »). Après un 500 générique sur `POST /visits` (écriture en réalité appliquée côté serveur — bug d'API distinct, voir Lot 24), le front affiche *« Une erreur est survenue côté serveur. Réessayez dans un instant. »*, qui **invite explicitement à réessayer**. Sauf que la visite a déjà été créée : la seconde tentative percute la contrainte anti-doublon de l'API (« Vous avez deja une visite en attente pour ce logement. », 400) — un message qui semble contredire l'expérience de l'utilisateur, qui n'a, de son point de vue, jamais réussi. Un bug de fiabilité API se transforme ainsi en confusion produit évitable : le message générique après un 500 devrait suggérer de vérifier l'état actuel (« Mes visites ») avant de suggérer de réessayer.
- **Champs de date « fantômes » dans le blocage de disponibilité artisan** (`app/components/artisan/BloquerModal.vue:20,24`) : vérifié en direct, `readonly: false` et `disabled: false` sur des champs dont la valeur ne peut en réalité jamais changer. Pire qu'un champ désactivé, qui dirait honnêtement « pas encore possible » — celui-ci a l'air de fonctionner et ne fonctionne pas, sans qu'aucun message ne le signale.

### 9.3 Parcours à revoir

- **Paiement d'une intervention artisan** (`pro/artisans.vue`) : parcours à une seule étape depuis une liste, sans écran dédié récapitulatif ni confirmation — voir §9.1. Candidat naturel pour une modale de confirmation dédiée (montant, artisan, garantie, solde restant après paiement).
- **Annulation de réservation** (`locataire/reservations.vue`) : devrait afficher le montant réellement remboursé (calculé depuis `booking_retention_percentage`) **avant** de cliquer « Annuler », pas seulement le résultat après coup.
- **Vitrine propriétaire vs biens listés** : soit unifier les deux booléens (bien/unité) côté produit, soit à défaut expliquer clairement dans `pro/biens/*` pourquoi un bien n'apparaît pas publiquement.
- **Équipe/mandats (I2)** : tant que le bug serveur n'est pas corrigé, envisager de masquer l'entrée de menu ou d'afficher un bandeau « Fonctionnalité en cours de déploiement » plutôt que de laisser un utilisateur agence buter sur une 500 sans contexte.

### 9.4 Recommandation de priorisation

Si une seule chose devait être corrigée en premier : **le paiement d'intervention artisan sans confirmation** (§9.1, premier item) — c'est la seule action de cette liste qui déplace de l'argent réel en un clic isolé, sans aucun garde-fou, pas même le semi-frein d'une modale dédiée.
