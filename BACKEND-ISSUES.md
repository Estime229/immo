# Problèmes et manques constatés côté backend

Relevés par l'équipe frontend en testant la plateforme contre l'API de production (`https://immo-b89b.onrender.com/v1/api`). Chaque point a été reproduit en direct (curl ou navigateur) et, quand c'était possible, confirmé dans le code de `back-end-api-immo-app`. Le détail de chaque constat se trouve dans `INTEGRATION-TESTS.md` (numéro de lot indiqué).

Mis à jour le 26/09/2026. Statut : **ouvert** sauf mention contraire.

**Légende de gravité** — 🔴 bloquant ou faille · 🟠 données incohérentes ou fonction manquante importante · 🟡 contrat d'API ou confort.

---

## Récapitulatif

| # | Gravité | Sujet | Endpoint | Lot |
|---|---|---|---|---|
| 1 | 🔴 | Aucun email OTP envoyé en production | `POST /auth/request-otp` | 44 |
| 2 | 🔴 | Code `000000` accepté en production | `POST /auth/verify-otp` | 44 |
| 3 | 🔴 | Limite anti-spam OTP probablement commune à tous les utilisateurs | `request-otp`, `verify-otp` | 44 |
| 4 | 🔴 | Invitation d'équipe toujours en erreur 500 | `POST /team/invite` | I2, 40 |
| 5 | 🔴 | Suppression d'un bien/logement occupé acceptée | `DELETE /property/:id`, `DELETE /property/:pid/units/:uid` | 45 |
| 6 | 🟠 | Impossible de retirer une annonce de la recherche | `GET /property/search` | 45 |
| 7 | 🟠 | Deux notions de « vérifié » qui divergent | `/auth/me`, `PATCH /profile/me`, `VerifiedUserGuard` | 43, 45 |
| 8 | 🟠 | `finalize` ne valide pas IFU/RCCM, écritures partielles | `POST /onboarding/finalize` | 44 |
| 9 | 🟠 | `finalize` écrase les rôles existants | `POST /onboarding/finalize` | 44 |
| 10 | 🟠 | Équipements enregistrés mais jamais renvoyés au public | `GET /property/:id`, `GET /property/search` | 45 |
| 11 | 🟠 | Écritures réussies malgré une réponse 500 | `POST /visits`, `PATCH /visits/:id/cancel` | 40 |
| 12 | 🟠 | Premier paiement en échec si le wallet n'a jamais été lu | `POST /payment/verify-return` | 40 |
| 13 | 🟠 | Pas de filtre « à la nuit / au mois » dans la recherche | `GET /property/search` | 41, 42 |
| 14 | 🟠 | Aucun endpoint pour enregistrer le téléphone après l'OTP | `/onboarding/draft`, `/user/update` | 44 |
| 15 | 🟡 | `PATCH /promo-codes/:id` exige `id` dans le corps | `PATCH /promo-codes/:id` | IP (promo), revérifié 26/09 |
| 16 | 🟡 | Doublons IFU/RCCM renvoyés en 403 au lieu de 409 | `PATCH /profile/me` | 44 |
| 17 | 🟡 | Exemple Swagger du RCCM refusé par la validation | `PATCH /profile/me` | 44 |
| 18 | 🟡 | Upload de photo sans compte vérifié, pas de suppression unitaire | `POST /property/upload-image`, `/property/media` | 45 |
| 19 | 🟡 | Blocages de calendrier acceptés dans le passé, message de conflit inexact | `POST /units/:id/availability-blocks` | 45 |
| 20 | 🟡 | `agent_id` librement choisi à la création d'un bien | `POST /property` | 45 |
| 21 | 🟡 | Pas d'état « brouillon » pour un bien | `POST /property` | 45 |
| 22 | 🟡 | Devise « EUR » dans une notification | notifications de paiement | 40 |
| 23 | 🟡 | `instructions.fr` du mode `redirect` rédigé pour un développeur | `POST /payment/checkout` | 8 |
| 24 | 🟡 | Aucun endpoint de blocage de disponibilité pour un artisan | — | 38 |
| 25 | 🟡 | Annulation d'une réservation courte durée confirmée non gérée | bookings | 40 |
| 26 | 🟡 | Contexte d'équipe : `switch-context` ne renvoie pas une paire de jetons exploitable | `POST /auth/switch-context` | socle, I2 |
| 27 | 🟠 | Liste d'attente : les inscrits ne sont jamais prévenus | `UnitWaitlistService.notifyWaitlist` | 46 |
| 28 | 🟠 | Calendrier : ni l'id ni le motif d'un blocage ne sont relisibles | `GET /units/:id/availability` | 46 |
| 29 | 🟡 | Deux sources de vérité pour le prix (prix de base / grille tarifaire) | `units.price`, `unit_pricing` | 46 |
| 30 | 🟡 | Pas d'endpoint de devis pour une réservation | bookings | 46 |
| 31 | 🟡 | Tarif à 0 F ou décimal accepté ; message 409 avec le code brut | `POST/PATCH /units/:id/pricing` | 46 |
| 32 | 🟡 | Tarifs réservés au propriétaire, pas à l'équipe | `UnitPricingService.assertOwner` | 46 |
| 33 | 🟠 | Un logement occupé peut être proposé à une demande | `POST /housing-requests/:id/respond` | 47 |
| 34 | 🟠 | Un propriétaire ne peut pas savoir à quelles demandes il a répondu | `GET /housing-requests/open` | 47 |
| 35 | 🟠 | Les critères d'une demande ne sont pas filtrables (sauf ville et fréquence) | `GET /housing-requests/open` | 47 |
| 36 | 🟡 | Cycle de vie d'une demande trop limité (ni modification, ni réouverture, ni suite donnée à une proposition) | `housing-requests` | 47 |
| 37 | 🟡 | Budget min > max et date d'emménagement passée acceptés | `POST /housing-requests` | 47 |
| 38 | 🟡 | Identifiant non-UUID → erreur 500 | `/housing-requests/:id/*` | 47 |
| 39 | 🟡 | Aucun propriétaire n'est prévenu d'une nouvelle demande qui correspond à ses biens | notifications | 47 |

---

## 🔴 Bloquant ou faille

### 1. Aucun email OTP envoyé en production

- **Reproduire** : `POST /auth/request-otp { "email": "<nouvelle adresse>" }`.
- **Observé** (revérifié le 26/09) : `{"success":false,"available_channels":["email"],"sent_channels":[]}`. Aucun email reçu.
- **Impact** : un vrai utilisateur ne peut ni s'inscrire ni se connecter sans mot de passe.
- **Attendu** : email envoyé, `sent_channels: ["email"]`. Vérifier la configuration du fournisseur d'email (clé, quota, domaine expéditeur).

### 2. Code `000000` accepté en production

- **Reproduire** : `POST /auth/verify-otp { "email": "<n'importe quel compte>", "code": "000000" }` → jeton valide.
- **Cause** : `otp-store.service.ts`, contournement actif si `APP_ENV=local` **ou** `ALLOW_OTP_BYPASS=true`.
- **Impact** : n'importe qui peut se connecter à n'importe quel compte sans mot de passe (compte propriétaire, wallet…).
- **Attendu** : `ALLOW_OTP_BYPASS` désactivé en production dès que le point 1 est corrigé.

### 3. Limite anti-spam OTP probablement commune à tous les utilisateurs

- **Règles** : `request-otp` 3 demandes/minute/IP (`RequestOtpRateLimitGuard`), `verify-otp` 5 essais/10 min/IP.
- **Constat** : le frontend passe par un relais serveur (Vercel) et le backend ne fait confiance qu'à un seul proxy (`app.set('trust proxy', 1)`). En test, mon IP personnelle était bloquée en appel direct alors que le relais passait encore : le backend voit donc l'IP de sortie de Vercel, pas celle de l'utilisateur.
- **Impact** : en production réelle, quelques inscriptions simultanées bloqueraient tout le monde pendant une minute.
- **Attendu** : journaliser `req.ip` pour confirmer, puis faire confiance à la chaîne complète (Vercel + Render) ou limiter par email plutôt que par IP.

### 4. `POST /team/invite` renvoie toujours une 500

- Quel que soit le corps envoyé (reproduit à plusieurs reprises, dernière fois le 24/09).
- **Impact** : tout l'espace équipe/mandats des agences est inutilisable (le frontend affiche « fonctionnalité pas encore disponible »).

### 5. Suppression d'un bien ou d'un logement occupé acceptée

- **Reproduire** : passer une unité en `unit_status: "occupied"`, puis `DELETE /property/:id` → `{"deleted":true}`.
- **Cause** : `delete-property.handler.ts` et `delete-unit.handler.ts` ne vérifient que la propriété du bien, jamais l'existence d'un bail actif ou d'une réservation à venir.
- **Impact** : un bail en cours peut perdre son logement.
- **Attendu** : 409 si un bail actif, un préavis ou une réservation confirmée à venir existe. Le frontend bloque déjà, mais l'API doit être la garantie.

---

## 🟠 Données incohérentes ou fonction manquante importante

### 6. Impossible de retirer une annonce de la recherche

La recherche (`search-properties.handler.ts`) montre tout bien non suspendu ayant au moins une unité non occupée. Testé en live, **aucun de ces réglages ne retire l'annonce** :

| Réglage | Effet sur la recherche |
|---|---|
| `is_publicly_listed: false` sur l'unité | aucun (il ne concerne que la vitrine, et seulement pour les unités autonomes) |
| `status: "maintenance"` ou `"occupied"` sur le bien | aucun |
| `unit_status: "maintenance"` sur l'unité | aucun |
| `unit_status: "occupied"` sur l'unité | retirée ✔ |

- **Impact** : pour mettre une annonce en pause, le propriétaire doit mentir (« occupé ») ou supprimer le bien.
- **Attendu** : un état « en pause / brouillon » explicite, ou que la recherche respecte `is_publicly_listed` et le statut du bien.

### 7. Deux notions de « vérifié » qui divergent

- `POST /property`, `PATCH /property/:id` et la création d'unités sont gardés par `VerifiedUserGuard`, qui lit **`users.is_verified`**. Ce champ n'est mis à `true` que par `review-kyc`.
- Les écrans affichent **`profile.kyc_status`**. Or toute modification via `PATCH /profile/me` (nom légal, IFU…) repasse `kyc_status` à `pending`, sans toucher `is_verified`.
- **Constaté** : le propriétaire de test est `is_verified: true` et `kyc_status: "pending"`. Il peut publier, mais l'interface lui dit que son compte n'est pas vérifié.
- **Attendu** : une seule source de vérité. Par exemple, ne pas réinitialiser `kyc_status` pour les champs non liés à l'identité, ou exposer un statut unique.

### 8. `POST /onboarding/finalize` ne valide pas IFU/RCCM, et écrit partiellement

- **Reproduire** : `POST /onboarding/draft { "role":"landlord", "ifu":"12345" }` puis `finalize` → succès, IFU « 12345 » enregistré. `PATCH /profile/me` refuse pourtant la même valeur (13 chiffres exigés).
- Contrairement à sa documentation (« valide le format des champs KYC pour la première fois »).
- **Écriture partielle** : si l'IFU est déjà pris (403 `IFU_ALREADY_EXISTS`), nom, prénom et rôle sont déjà enregistrés (transaction committée), le KYB ne l'est pas, et le brouillon Redis n'est pas supprimé.
- **Donnée de test à nettoyer** : un compte `qa-badifu-*@yopmail.com` porte l'IFU invalide « 12345 ».
- **Contournement frontend** : IFU/RCCM envoyés uniquement via `PATCH /profile/me`.

### 9. `finalize` écrase les rôles existants

`finalize-onboarding.handler.ts` fait `user.roles = [draft.role]` : un compte qui avait déjà plusieurs rôles les perd tous sauf celui choisi. Attendu : ajouter le rôle à `roles[]` plutôt que remplacer.

### 10. Équipements enregistrés mais jamais renvoyés au public

- `PATCH …/units/:id { "features": ["clim","wifi"] }` enregistre bien (`resolved_features`).
- `GET /property/owner/me` les renvoie, mais **pas `GET /property/:id` ni `GET /property/search`**.
- **Impact** : les locataires ne voient jamais la clim, le wifi, le groupe électrogène…
- **Attendu** : inclure `resolved_features` (code + libellés) dans la fiche publique et la recherche.

### 11. Écritures réussies malgré une réponse 500

`POST /visits` et `PATCH /visits/:id/cancel` renvoient parfois une 500 alors que l'écriture a bien eu lieu. L'utilisateur réessaie et tombe sur l'anti-doublon. Attendu : la réponse doit refléter le succès réel.

### 12. Premier paiement d'un compte neuf en échec

`POST /payment/verify-return` renvoie 400 « Wallet introuvable » si `GET /wallet/me` n'a jamais été appelé : c'est cette lecture qui crée le wallet. Attendu : créer le wallet à l'inscription, ou à la volée dans `verify-return`.

### 13. Pas de filtre « à la nuit / au mois » dans la recherche

La recherche ne sait pas filtrer par fréquence de tarif (`billing_frequency`) ni par `min_duration_days`. Le frontend classe donc lui-même en lisant `GET /units/:id/pricing` pour chaque unité, jusqu'à 300 unités, ce qui coûte ~5 s sur l'accueil. Attendu : un paramètre `rental_mode=nightly|monthly` (ou `billing_frequency`) côté recherche, et idéalement le prix par nuit dans le résultat.

### 14. Aucun endpoint pour enregistrer le téléphone après l'OTP

- `/onboarding/draft` retire silencieusement `phone_number`, alors que `finalize` le lit.
- `POST /user/update` ne l'accepte pas non plus.
- Seul `verify-otp` peut le fixer, au moment de la création du compte.
- Le frontend a retiré le champ Téléphone de l'inscription en attendant.

---

## 🟡 Contrat d'API ou confort

### 15. `PATCH /promo-codes/:id` exige `id` dans le corps

Revérifié le 26/09 : `PATCH /promo-codes/:id { "is_active": false }` → 400 `{ field: "id", rule: "isUuid" }`, alors que l'id est dans l'URL et que le schéma ne documente pas ce champ. Le frontend duplique l'id en contournement.

### 16. Doublons IFU/RCCM en 403

`PATCH /profile/me` renvoie `403 FORBIDDEN` avec `IFU_ALREADY_EXISTS` / `RCCM_ALREADY_EXISTS` / `CPI_ALREADY_EXISTS`. Ce n'est pas un problème de droits : attendu `409 CONFLICT`.

### 17. Exemple Swagger du RCCM refusé

L'exemple `RB/COT/2024/B/12345` (Swagger de `PATCH /profile/me`) est refusé par la propre validation (`/^RB\/[a-zA-Z]+\/\d{2}\s*[a-zA-Z]\s*\d+$/`, ex. `RB/COT/25 A 1234`).

### 18. Photos de bien

- `POST /property/upload-image` n'exige pas de compte vérifié : n'importe quel compte peut remplir le stockage.
- Il n'existe aucune route pour supprimer une photo isolée. Il faut renvoyer toute la liste via `PATCH /property/:id { images }`, ce qui recrée toutes les lignes média avec de nouveaux id.

### 19. Blocages de calendrier

- Blocage dans le passé accepté (`2025-01-01 → 2025-01-03`).
- En cas de chevauchement avec un blocage manuel, le message dit « chevauche un bail ou une réservation déjà confirmée ».

### 20. `agent_id` libre à la création d'un bien

`CreatePropertyCommand` accepte `agent_id` depuis le corps : un propriétaire peut désigner n'importe quel utilisateur comme agent de son bien, sans mandat. Attendu : ignorer ce champ ou exiger un mandat valide.

### 21. Pas d'état « brouillon »

Un bien existe dès sa première étape de création. Un assistant abandonné laisse un bien vide ; il n'est pas dans la recherche tant qu'il n'a pas d'unité, mais reste dans la liste du propriétaire.

### 22. Devise « EUR » dans une notification

Une notification de paiement affiche « 120000 EUR » au lieu de FCFA : chaîne formée côté serveur.

### 23. `instructions.fr` du mode `redirect`

`POST /payment/checkout` en mode `redirect` renvoie un texte destiné à un développeur (« Redirigez l'utilisateur vers `url`… »), alors que les autres modes renvoient un texte affichable à l'utilisateur.

### 24. Disponibilités d'un artisan

Aucun endpoint ne permet à un artisan de bloquer des jours dans son planning. L'écran correspondant est désactivé en attendant.

### 25. Annulation d'une réservation courte durée confirmée

L'API renvoie une 400 explicite : l'annulation avec remboursement partiel n'est pas développée.

### 26. Contexte d'équipe

`POST /auth/switch-context` ne renvoie pas une paire de jetons complète et exploitable (`activeRole` non conservé). Tout le mode « travailler pour une agence » est bloqué côté frontend depuis le début de l'intégration.

---

## Ajouts du Lot 46 — Tarifs et disponibilités

### 27. 🟠 Liste d'attente : les inscrits ne sont jamais prévenus

- `POST /units/:id/waitlist` promet « Le locataire sera notifié quand le logement redevient disponible ».
- `UnitWaitlistService.notifyWaitlist()` existe mais **n'est appelée nulle part** (aucune référence hors du service).
- **Rejoué** : locataire inscrit, logement passé « occupé » puis « libre » → aucune notification (`GET /notifications` vide).
- **Attendu** : appeler `notifyWaitlist` quand une unité passe à `available` (fin de bail, changement de statut, fin de blocage), et renseigner `notified_at`.

### 28. 🟠 Calendrier : ni l'id ni le motif d'un blocage ne sont relisibles

- `GET /units/:id/availability` sélectionne seulement `start_date`, `end_date`, `blocked_by`.
- Aucune autre route ne liste les blocages du propriétaire.
- **Conséquences** :
  - un blocage manuel ne peut être retiré (`DELETE …/availability-blocks/:blockId`) que si l'on a gardé l'id renvoyé à sa création ;
  - le motif (`note`, « visible uniquement par le propriétaire ») n'est affiché nulle part.
- **Contournement frontend** : les id sont mémorisés sur l'appareil qui a créé le blocage. Ailleurs, le blocage est « non retirable ici ».
- **Attendu** : renvoyer `id` et `note` pour les blocages `manual` quand l'appelant est le propriétaire, ou une route dédiée `GET /units/:id/availability-blocks`.

### 29. 🟡 Deux sources de vérité pour le prix

- `units.price` (prix de base) est utilisé par la recherche (`min_price`/`max_price`), les fiches et par défaut le bail.
- `unit_pricing` est utilisé par les réservations et, si le loyer n'est pas fourni, par le bail.
- Rien ne les relie : modifier le tarif mensuel laisse l'ancien prix dans la recherche.
- **Contournement frontend** : la page Tarifs réaligne `units.price` après chaque modification.
- **Attendu** : dériver l'un de l'autre côté serveur (par exemple prix de base = tarif mensuel actif, sinon tarif journalier).

### 30. 🟡 Pas d'endpoint de devis pour une réservation

- Le total d'un séjour n'est connu qu'en créant la réservation (`POST /bookings`), qui pose aussi une option de 15 min.
- Le frontend recopie `calculateBookingPrice` pour afficher un total avant de réserver, avec un risque de divergence si la règle change.
- **Rappel de la règle** (vérifiée en live) : 10 nuits à 10 000 avec une semaine à 50 000 = 80 000 ; 35 nuits avec un mois à 150 000 = 200 000.
- **Attendu** : `GET /units/:id/quote?check_in=…&check_out=…` renvoyant total, détail et éventuel refus (durée, dates prises).

### 31. 🟡 Tarif à 0 F ou décimal accepté

- `POST /units/:id/pricing { "price": 0 }` → 201.
- `{ "price": 1000.5 }` → 201 : le franc CFA n'a pas de subdivision.
- Le message de doublon expose le code brut : « Un tarif daily existe déjà ».
- **Attendu** : entier strictement positif ; libellé lisible dans le message.

### 32. 🟡 Tarifs réservés au propriétaire, pas à l'équipe

`UnitPricingService.assertOwner` compare uniquement `owner_id`. Un membre d'équipe autorisé (`team:units:edit`), qui peut pourtant bloquer des dates, ne peut pas gérer les tarifs.

---

## Ajouts du Lot 47 — Demandes de logement

### 33. 🟠 Un logement occupé peut être proposé à une demande

- `respond-to-housing-request.command.handler.ts` vérifie que la demande est ouverte et que l'unité appartient au répondant, **jamais son statut**.
- **Rejoué** : unité `occupied` proposée → 201, le locataire est notifié pour un logement indisponible.
- **Attendu** : 400 si l'unité est `occupied` (ou suspendue).
- Le frontend ne propose plus les logements occupés.

### 34. 🟠 Un propriétaire ne peut pas savoir à quelles demandes il a répondu

- Aucune route « mes réponses », et `GET /open` ne dit pas si l'appelant a déjà répondu.
- **Conséquences** : le propriétaire repropose, puis reçoit un 400 « déjà proposé » ; il ne retrouve pas ses propositions.
- **Contournement frontend** : mémorisation sur l'appareil, et récupération de l'état à partir du 400.
- **Attendu** : `GET /housing-requests/responses/mine` (demande, unité, conversation), ou un champ `my_response_unit_ids` dans `/open` quand l'appelant est authentifié.

### 35. 🟠 Les critères d'une demande ne sont pas filtrables (sauf ville et fréquence)

- Le Swagger de `POST /housing-requests` indique que les critères structurés « servent uniquement à filtrer GET /open côté pro ».
- Or `GET /open` ne filtre que `city_id` et `desired_billing_frequency`.
- **Non filtrables** : budget, quartier, type, chambres, ameublement, équipements.
- **Constat au passage** : sur les 7 demandes ouvertes en production, **1 seule** avait une ville et 2 une fréquence. Le formulaire locataire ne les demandait pas ; corrigé côté frontend au Lot 47.
- **Attendu** : filtres `neighborhood_id`, `max_budget` / `min_budget`, `unit_type_reference_id`, `min_bedrooms`, `desired_furnished_level` ; idéalement un filtre « compatible avec mes biens ».

### 36. 🟡 Cycle de vie d'une demande trop limité

- **Statuts** : seulement `open` / `closed`.
- **Pas d'actions pour** :
  - modifier une demande ;
  - la rouvrir ;
  - la supprimer ;
  - indiquer pourquoi elle est fermée : trouvé via Immo, trouvé ailleurs, abandon (utile pour mesurer la plateforme) ;
  - accepter ou décliner une proposition, pour que le propriétaire sache que sa proposition est écartée.
- Une demande ouverte n'expire jamais : un locataire qui a trouvé ailleurs laisse une demande fantôme dans la liste des propriétaires.
- **Attendu** : `PATCH /housing-requests/:id`, un motif de fermeture, une expiration automatique (par exemple 60 jours) et un statut par réponse (`pending` / `declined`).

### 37. 🟡 Validations manquantes à la création

- `budget_min: 90000, budget_max: 50000` → 201.
- `move_in_date: "2025-01-01"` → 201.
- Le frontend bloque désormais les deux cas ; l'API devrait aussi.

### 38. 🟡 Identifiant non-UUID → erreur 500

`POST /housing-requests/abc/respond` → **500** « Une erreur inattendue s'est produite ». Attendu : 400 ou 404, avec `ParseUUIDPipe` sur `:id` comme ailleurs dans l'API.

### 39. 🟡 Aucun propriétaire n'est prévenu d'une nouvelle demande

La place de marché repose entièrement sur des propriétaires qui viennent consulter la liste. Attendu : notifier les propriétaires dont un logement libre correspond (ville, fréquence, budget) quand une demande est publiée.

