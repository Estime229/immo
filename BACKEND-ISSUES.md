# Problèmes et manques constatés côté backend

Relevés par l'équipe frontend en testant la plateforme contre l'API de production (`https://immo-b89b.onrender.com/v1/api`). Chaque point a été reproduit en direct (curl ou navigateur) et, quand c'était possible, confirmé dans le code de `back-end-api-immo-app`. Le détail de chaque constat se trouve dans `INTEGRATION-TESTS.md` (numéro de lot indiqué).

Mis à jour le 06/10/2026. Lot 56 (28/09/2026) puis **correctifs backend groupés** (05-06/10/2026, branche `fix/corrections-tests-front`, détail en bas de fichier). Statut : **ouvert** sauf mention contraire.

**Légende de gravité** — 🔴 bloquant ou faille · 🟠 données incohérentes ou fonction manquante importante · 🟡 contrat d'API ou confort.

---

## Récapitulatif

| # | Gravité | Sujet | Endpoint | Lot |
|---|---|---|---|---|
| 1 | 🔴 | Aucun email OTP envoyé en production — **en partie corrigé** (06/10/2026) : code aligné (`email-otp.provider` cohérent avec `EmailService`) ; en prod, aucun fournisseur email n'est encore configuré — reste une action d'infra (clé Resend/SMTP) | `POST /auth/request-otp` | 44 |
| 2 | 🔴 | Code `000000` accepté en production — **en partie corrigé** (06/10/2026) : avertissement ajouté au démarrage si le contournement est actif hors local ; aucune exception levée (choix volontaire : la prod s'en sert encore pour les tests) | `POST /auth/verify-otp` | 44 |
| 3 | 🔴 | Limite anti-spam OTP probablement commune à tous les utilisateurs | `request-otp`, `verify-otp` | 44 |
| 4 | ✅ | ~~Invitation d'équipe en 500 après écriture ; jeton perdu, personne ne peut rejoindre (cause trouvée)~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /team/invite` | I2, 40, 53 |
| 5 | ✅ | ~~Suppression d'un bien/logement occupé acceptée~~ — corrigé (06/10/2026, correctifs backend groupés) | `DELETE /property/:id`, `DELETE /property/:pid/units/:uid` | 45 |
| 6 | 🟠 | Impossible de retirer une annonce de la recherche — décision produit : non traité dans ce lot (06/10/2026) | `GET /property/search` | 45 |
| 7 | 🟠 | Deux notions de « vérifié » qui divergent — **en partie corrigé** (06/10/2026) : KYC refusé remet `is_verified=false` et invalide le cache de session ; un compte vérifié qui redépose une pièce n'est pas dégradé | `/auth/me`, `PATCH /profile/me`, `VerifiedUserGuard` | 43, 45 |
| 8 | ✅ | ~~`finalize` ne valide pas IFU/RCCM, écritures partielles~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /onboarding/finalize` | 44 |
| 9 | ✅ | ~~`finalize` écrase les rôles existants~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /onboarding/finalize` | 44 |
| 10 | ✅ | ~~Équipements enregistrés mais jamais renvoyés au public~~ — corrigé (06/10/2026, correctifs backend groupés) | `GET /property/:id`, `GET /property/search` | 45 |
| 11 | ✅ | ~~Écritures réussies malgré une réponse 500 (cause trouvée : email envoyé après l'enregistrement)~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /visits`, `PATCH /visits/:id/confirm` · `reject` · `cancel` | 40, 48 |
| 12 | ✅ | ~~Premier paiement en échec si le wallet n'a jamais été lu~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /payment/verify-return` | 40 |
| 13 | 🟠 | Pas de filtre « à la nuit / au mois » dans la recherche | `GET /property/search` | 41, 42 |
| 14 | ✅ | ~~Aucun endpoint pour enregistrer le téléphone après l'OTP~~ — corrigé (06/10/2026, correctifs backend groupés) | `/onboarding/draft`, `/user/update` | 44 |
| 15 | ✅ | ~~`PATCH /promo-codes/:id` exige `id` dans le corps~~ — corrigé (06/10/2026, correctifs backend groupés) | `PATCH /promo-codes/:id` | IP (promo), revérifié 26/09 |
| 16 | ✅ | ~~Doublons IFU/RCCM renvoyés en 403 au lieu de 409~~ — corrigé (06/10/2026, correctifs backend groupés) | `PATCH /profile/me` | 44 |
| 17 | 🟡 | Exemple Swagger du RCCM refusé par la validation | `PATCH /profile/me` | 44 |
| 18 | ✅ | ~~Upload de photo sans compte vérifié, pas de suppression unitaire~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /property/upload-image`, `/property/media` | 45 |
| 19 | ✅ | ~~Blocages de calendrier acceptés dans le passé, message de conflit inexact~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /units/:id/availability-blocks` | 45 |
| 20 | ✅ | ~~`agent_id` librement choisi à la création d'un bien~~ — corrigé (revérifié Lot 53) | `POST /property` | 45, 53 |
| 21 | 🟡 | Pas d'état « brouillon » pour un bien | `POST /property` | 45 |
| 22 | ✅ | ~~Devise « EUR » dans une notification~~ — corrigé (06/10/2026, correctifs backend groupés) | notifications de paiement | 40 |
| 23 | ✅ | ~~`instructions.fr` du mode `redirect` rédigé pour un développeur~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /payment/checkout` | 8 |
| 24 | 🟡 | Ni disponibilités d'artisan, ni date d'intervention — décision produit : non traité dans ce lot (06/10/2026) | — | 38, 54 |
| 25 | 🟡 | Annulation d'une réservation courte durée confirmée non gérée | bookings | 40 |
| 26 | ✅ | ~~Contexte d'équipe : `switch-context` ne renvoie pas une paire de jetons exploitable~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /auth/switch-context` | socle, I2 |
| 27 | ✅ | ~~Liste d'attente : les inscrits ne sont jamais prévenus~~ — corrigé (06/10/2026, correctifs backend groupés) | `UnitWaitlistService.notifyWaitlist` | 46 |
| 28 | ✅ | ~~Calendrier : ni l'id ni le motif d'un blocage ne sont relisibles~~ — corrigé (06/10/2026, correctifs backend groupés) | `GET /units/:id/availability` | 46 |
| 29 | 🟡 | Deux sources de vérité pour le prix (prix de base / grille tarifaire) | `units.price`, `unit_pricing` | 46 |
| 30 | 🟡 | Pas d'endpoint de devis pour une réservation | bookings | 46 |
| 31 | ✅ | ~~Tarif à 0 F ou décimal accepté ; message 409 avec le code brut~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST/PATCH /units/:id/pricing` | 46 |
| 32 | ✅ | ~~Tarifs réservés au propriétaire, pas à l'équipe~~ — corrigé (06/10/2026, correctifs backend groupés) | `UnitPricingService.assertOwner` | 46 |
| 33 | ✅ | ~~Un logement occupé peut être proposé à une demande~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /housing-requests/:id/respond` | 47 |
| 34 | ✅ | ~~Un propriétaire ne peut pas savoir à quelles demandes il a répondu~~ — corrigé (06/10/2026, correctifs backend groupés) | `GET /housing-requests/open` | 47 |
| 35 | ✅ | ~~Les critères d'une demande ne sont pas filtrables (sauf ville et fréquence)~~ — corrigé (06/10/2026, correctifs backend groupés) | `GET /housing-requests/open` | 47 |
| 36 | 🟡 | Cycle de vie d'une demande trop limité (ni modification, ni réouverture, ni suite donnée à une proposition) | `housing-requests` | 47 |
| 37 | ✅ | ~~Budget min > max et date d'emménagement passée acceptés~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /housing-requests` | 47 |
| 38 | ✅ | ~~Identifiant non-UUID → erreur 500~~ — corrigé (06/10/2026, correctifs backend groupés) | `/housing-requests/:id/*` | 47 |
| 39 | ✅ | ~~Aucun propriétaire n'est prévenu d'une nouvelle demande qui correspond à ses biens~~ — corrigé (06/10/2026, correctifs backend groupés) | notifications | 47 |
| 40 | ✅ | ~~Confirmation d'une visite à une date passée acceptée~~ — corrigé (06/10/2026, correctifs backend groupés) | `PATCH /visits/:id/confirm` | 48 |
| 41 | ✅ | ~~Une visite peut être marquée « réalisée » avant d'avoir eu lieu ; les demandes n'expirent jamais~~ — corrigé (06/10/2026, correctifs backend groupés) | `PATCH /visits/:id/complete` | 48 |
| 42 | ✅ | ~~Logement sans bien parent : personne ne peut traiter la visite~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /visits` | 48 |
| 43 | ✅ | ~~Aucune validation du corps de `POST /visits`~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /visits` | 48 |
| 44 | ✅ | ~~Un propriétaire peut demander à visiter son propre logement ; statut du logement ignoré~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /visits` | 48 |
| 45 | 🟡 | Incohérences diverses du module visites — **en partie corrigé** (06/10/2026) : points a/b/c corrigés (accents, jointure propriétaire en liste, REJECTED non ré-annulable) ; d/e restent des décisions produit | `visit` | 48 |
| 46 | ✅ | ~~Supprimer un bien laisse ses visites et réservations orphelines (`unit: null`)~~ — corrigé (06/10/2026, correctifs backend groupés) | `DELETE /property/:id` | 48 |
| 47 | 🟠 | Réserver un séjour n'exige pas d'identité vérifiée (une visite, si) — décision produit : non traité dans ce lot (06/10/2026) | `POST /bookings` | 49 |
| 48 | ✅ | ~~Un hôte peut réserver et se payer son propre logement~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /bookings`, `POST /bookings/:id/pay` | 49 |
| 49 | 🟠 | Recharge Mobile Money directe impossible pour un compte sans téléphone (en partie corrigé : `phoneNumber` accepté, Lot 55) | `POST /payment/checkout` (GSM_*) | 49, 55 |
| 50 | ✅ | ~~Portefeuille incohérent : tirelire supérieure au solde total (cause trouvée, voir #82)~~ — corrigé (06/10/2026, correctifs backend groupés) | `GET /wallet/me` | 49, 55 |
| 51 | ✅ | ~~Séjour minimum appliqué au seul segment de prolongation~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /bookings/:id/extend` | 49 |
| 52 | 🟡 | Trois statuts seulement : séjour terminé et hold expiré indiscernables — décision produit : non traité dans ce lot (06/10/2026) | `bookings` | 49 |
| 53 | ✅ | ~~Message « Solde insuffisant » brut~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /bookings/:id/pay` | 49 |
| 54 | 🔴 | Un locataire peut signer un bail brouillon jamais envoyé | `PATCH /leases/:id/sign` | 50 |
| 55 | 🔴 | Re-signer un bail actif le fait repasser « signé » : plus facturé, plus résiliable | `PATCH /leases/:id/sign` | 50 |
| 56 | ✅ | ~~État des lieux réécrit après la signature de l'autre partie~~ — corrigé (06/10/2026, correctifs backend groupés) | `PATCH /inventories/:id` | 50 |
| 57 | 🟠 | Aucune restitution de la caution (ni de l'avance, ni du prépayé) — décision produit : non traité dans ce lot (06/10/2026) | `terminate`, `cancel-unpaid` | 50 |
| 58 | ✅ | ~~Un brouillon de bail bloque le calendrier et ne peut être ni supprimé ni annulé~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /leases`, `PATCH /leases/:id`, `cancel-unpaid` | 50 |
| 59 | 🟠 | La fin de bail n'est jamais automatique ; la date de départ du préavis n'est pas renvoyée | facturation, `give-notice` | 50 |
| 60 | 🟠 | Le locataire ne peut pas résilier (garde de rôle), contrairement à la documentation — **en partie corrigé** (06/10/2026) : doc Swagger corrigée (résiliation réservée au propriétaire, confirmé conforme au code) | `PATCH /leases/:id/terminate` | 50 |
| 61 | ✅ | ~~Doublons d'état des lieux ; un brouillon vide suffit à libérer la retenue d'un séjour~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /inventories`, retenue des réservations | 50 |
| 62 | ✅ | ~~Création de bail : date invalide → 500, fin avant début, logement d'un autre bien acceptés~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /leases` | 50 |
| 63 | ✅ | ~~États des lieux : aucune validation, messages en anglais, PDF d'un séjour incomplet~~ — corrigé (06/10/2026, correctifs backend groupés) | `/inventories`, `GET /pdf/inventories/:id` | 50 |
| 64 | ✅ | ~~`auto-debit` sans `enabled` enregistre `null`~~ — corrigé (06/10/2026, correctifs backend groupés) | `PATCH /leases/:id/auto-debit` | 50 |
| 65 | 🟡 | Pas de `GET /leases/:id` ; `/leases/my` mêle les deux rôles | `GET /leases/my` | 50 |
| 66 | ✅ | ~~Candidatures : ni le propriétaire (nouvelle candidature) ni le candidat refusé ne sont prévenus~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /rental/requests`, `…/reject` | 51 |
| 67 | ✅ | ~~Retenir un candidat crée un second bail sur un logement déjà engagé ; logement « loué » dès l'acceptation, sans retour possible~~ — corrigé (06/10/2026, correctifs backend groupés) | `PATCH /rental/requests/:id/accept` | 51 |
| 68 | ✅ | ~~Bail préparé à l'acceptation : prépayé ignoré, notification trompeuse, id du bail non renvoyé~~ — corrigé (06/10/2026, correctifs backend groupés) | `PATCH /rental/requests/:id/accept` | 51 |
| 69 | ✅ | ~~Le candidat ne peut pas retirer sa candidature ; refus sans motif ; statuts indiscernables~~ — corrigé (06/10/2026, correctifs backend groupés) | `/rental/requests` | 51 |
| 70 | ✅ | ~~Candidature : date invalide → 500, date passée acceptée, message trop long sans détail ; équipe exclue~~ — corrigé (06/10/2026, correctifs backend groupés) | `/rental/requests` | 51 |
| 71 | ✅ | ~~Photos d'état des lieux effacées à chaque modification~~ — corrigé (06/10/2026, correctifs backend groupés) | `GET` / `PATCH /inventories/:id` | 52 |
| 72 | 🟠 | Le PDF de l'état des lieux n'a ni photos ni comparaison avec l'entrée ; la sortie n'alimente rien | `GET /pdf/inventories/:id` | 52 |
| 73 | ✅ | ~~État des lieux accepté sur une réservation annulée ; URL de photo relative → 500~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /inventories`, relais photo | 52 |
| 74 | ✅ | ~~Un utilisateur déjà inscrit, invité dans une équipe, ne peut jamais accepter~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /team/invite` (branche `in_app`) | 53 |
| 75 | ✅ | ~~Invitations et membres : ni annulation, ni relance, ni départ volontaire~~ — corrigé (06/10/2026, correctifs backend groupés) | `/team` | 53 |
| 76 | 🟠 | Un mandat ne donne aucun accès ; sa fin laisse l'agent désigné sur les biens | `/agent-mandates`, `PATCH /property/:id` | 53 |
| 77 | 🟡 | Équipe et mandats : permissions non appliquées, identités manquantes, refus indiscernable — décision produit : non traité dans ce lot (06/10/2026) | `/team`, `/agent-mandates` | 53 |
| 78 | ✅ | ~~Après l'inscription, la session garde le rôle « tenant » (même rafraîchie) : 403 sur son propre espace~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /onboarding/finalize`, `POST /auth/refresh` | 54 |
| 79 | ✅ | ~~`retained_amount` jamais remis à zéro une fois la retenue versée ou partagée~~ — corrigé (06/10/2026, correctifs backend groupés) | `artisan-requests` | 54 |
| 80 | ✅ | ~~Offres d'artisan : prix 0 et retenue sans garantie acceptés ; « Données invalides » sans détail~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /artisan-requests/:id/offers`, `…/dispute` | 54 |
| 81 | 🟡 | Interventions : ni lien avec le signalement d'origine, ni contact du demandeur pour l'artisan | `artisan-requests` | 54 |
| 82 | ✅ | ~~Solde négatif : un paiement de logement ne vérifie que la tirelire, qui peut dépasser le total~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /bookings/:id/pay`, `/wallet/pay-rent`, `/leases/:id/entry-payment`, `PATCH /artisan-requests/:id/pay` | 55 |
| 83 | ✅ | ~~Retrait en attente non réservé : le montant reste dépensable, `pending_amount` l'ignore~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /wallet/withdraw`, `GET /wallet/stats` | 55 |
| 84 | ✅ | ~~Retrait : numéro et montant non validés (« abc » accepté, montant texte → 500), méthode en minuscules, aucune annulation~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /wallet/withdraw` | 55 |
| 85 | ✅ | ~~Statistiques du wallet fausses : revenus = recharges seulement, dépenses toujours à 0~~ — corrigé (06/10/2026, correctifs backend groupés) | `GET /wallet/stats` | 55 |
| 86 | ✅ | ~~Mobile Money direct : statut introuvable (404), seul `verify-return` crédite ; `gatewayType` attendu en minuscules~~ — corrigé (06/10/2026, correctifs backend groupés) | `/payment/transactions/:id/status`, `/payment/verify-return` | 55 |
| 87 | ✅ | ~~N'importe quel compte peut signaler un problème sur n'importe quel logement ; l'historique public compte aussi les annulés~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /signals`, `GET /signals/units/:unitId/history` | 55 |
| 88 | ✅ | ~~Signalements : l'auteur écrit la note de résolution et l'assignation, le propriétaire annule, transitions non documentées~~ — corrigé (06/10/2026, correctifs backend groupés) | `PATCH /signals/:id` | 55 |
| 89 | ✅ | ~~Un compte propriétaire qui loue aussi ne voit pas ses propres signalements~~ — corrigé (06/10/2026, correctifs backend groupés) | `GET /signals` | 55 |
| 90 | ✅ | ~~Pièces jointes de signalement : multipart ignoré (201 sans effet), corps non documenté, URL libres acceptées~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /signals/:id/attachments`, `POST /signals` | 55 |
| 91 | ✅ | ~~Messagerie : message `system` envoyable par un utilisateur, pagination documentée à l'envers, messages en anglais, « Message de Quelqu'un »~~ — corrigé (06/10/2026, correctifs backend groupés) | `/messaging` | 55 |
| 92 | ✅ | ~~Une nouvelle conversation à chaque appel pour le même logement et le même destinataire~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /messaging/conversations` | 55 |
| 93 | ✅ | ~~Formulaire de contact inutilisable : 500 à chaque envoi (après ~6 s)~~ — corrigé (06/10/2026, correctifs backend groupés) | `POST /contact` | 56 |
| 94 | 🟠 | Vitrine vide alors que la recherche montre les annonces du même propriétaire ; vitrine publique ouverte aux comptes locataires — **en partie corrigé** (06/10/2026) : vitrine masquée aux comptes locataires (404) ; la vitrine « vide » pour un propriétaire reste liée à #6 (décision produit, non traité) | `GET /public/owners/:userId`, `GET /property/search` | 56 |
| 95 | ✅ | ~~Un logement loué (bail actif) reste « disponible » dans la recherche et la fiche publique~~ — corrigé (06/10/2026, correctifs backend groupés) | `unit_status`, `GET /property/search`, `GET /public/units/:id` | 56 |
| 96 | ✅ | ~~Identifiant mal formé → 500 au lieu de 400/404~~ — corrigé (06/10/2026, correctifs backend groupés) : ParseUUIDPipe posé sur `property`, `review`, et par cohérence sur tous les `:id` de `leases`/`lease-buffers`/`lease-pdf` | `GET /property/:id`, `GET /reviews/property/:id(/stats)` | 56 |
| 97 | 🟡 | `ai-search` et `semantic-search` renvoient exactement la recherche textuelle — décision produit : non traité dans ce lot (06/10/2026) | `GET /property/ai-search`, `/semantic-search` | 56 |
| 98 | ✅ | ~~Statistiques avancées du propriétaire en 500, y compris pour un propriétaire avec des biens~~ — corrigé (06/10/2026, correctifs backend groupés) | `GET /property/landlord/stats/advanced` | 56 |
| 99 | 🟡 | Rôles incomplets et appels refusés : un propriétaire qui loue n'a pas le rôle `tenant` ; `agent-mandates/mine` en 403 pour tout non-agent — **en partie corrigé** (06/10/2026) : `GET /agent-mandates/mine` ouvert aux non-agents (renvoie `[]`) ; le manque du rôle `tenant` pour un propriétaire qui loue (`GET /auth/roles`) n'a pas été retesté | `GET /auth/roles`, `GET /agent-mandates/mine` | 56 |
| 100 | 🟡 | Adresse exacte et GPS publics, alors que l'offre propriétaire promet l'adresse masquée jusqu'à la visite — décision produit : non traité dans ce lot (06/10/2026) | `GET /property/:id`, `GET /public/properties/:id` | 56 |
| 101 | 🔴 | ~~Élévation de privilèges à l'inscription : `role` du brouillon d'onboarding acceptait n'importe quelle valeur (ex. `admin`), et `finalize` était rejouable~~ — **corrigé** (06/10/2026, découvert et corrigé durant ce lot, jamais exposé en prod) | `POST /onboarding/draft`, `POST /onboarding/finalize` | — |

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

### 4. `POST /team/invite` renvoie toujours une 500 — cause trouvée (Lot 53)

- **Rejoué le 28/09** : la réponse est 500, mais **tout est écrit**.
  - L'équipe est créée (avec `team_name`).
  - L'invitation passe « pending » : pour une adresse sans compte, une `TeamInvitation` ; pour un compte existant, un `TeamMember` « pending ».
- **Cause** : `InviteMemberHandler` attend l'envoi de l'e-mail (`await this.emailService.send`) **après** avoir enregistré. L'envoi échoue en production (aucun e-mail ne part, #1), l'exception remonte en 500. C'est la même cause que #11 (visites).
- **Conséquence** : le **jeton** d'invitation n'existe que dans la réponse de succès. Il est donc perdu, et aucune route ne permet de le relire (`GET /team/my` ne le renvoie pas). Personne ne peut accepter une invitation envoyée à une nouvelle adresse.
- **Attendu** : envoyer l'e-mail sans l'attendre, ou l'isoler dans un `try`. Renvoyer le jeton (ou le lien) au propriétaire, pour qu'il puisse le transmettre lui-même (WhatsApp, SMS). Prévoir aussi une route pour le relire.
- Le frontend relit l'équipe après le 500 et affiche « Invitation enregistrée, mais pas transmise ». S'il reçoit un jour un 201 avec jeton, il affiche le lien à copier. La page `/invite/:token`, cible de l'e-mail, existe désormais.

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

### 11. 🔴 Écritures réussies malgré une réponse 500 — cause trouvée (Lot 48)

- **Routes concernées** : `POST /visits`, `PATCH /visits/:id/confirm`, `…/reject` et `…/cancel` répondent **systématiquement 500** en production, alors que l'action est enregistrée.
- **Rejoué le 27/09** : création, confirmation, refus et annulation par le locataire et par le propriétaire, avec relecture de l'état à chaque fois.
- **Cause** (`visit.service.ts`) : chaque méthode enregistre la visite, notifie, puis fait `await this.emailService.send(...)` **sans `catch`**. L'envoi d'email échouant en production (voir #1), l'exception remonte après l'enregistrement. Seule `reschedule` a un `.catch(() => {})` sur l'email, et c'est la seule qui répond 200.
- **Impact** : l'utilisateur voit une erreur, réessaie, et tombe sur « Vous avez deja une visite en attente ». Le frontend relit désormais l'état réel après un 500, mais c'est un contournement.
- **Attendu** : ne jamais faire échouer la requête sur un email. Ajouter `.catch` et journaliser, ou mieux, passer l'envoi en file d'attente après la transaction. Probablement le même motif dans d'autres modules qui envoient des emails.

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

### 20. ✅ `agent_id` libre à la création d'un bien — corrigé

~~`CreatePropertyCommand` accepte `agent_id` depuis le corps.~~ **Revérifié le 28/09 (Lot 53)** : création et modification exigent désormais un mandat actif. Sans mandat, la réponse est 403 « Cet agent n'a pas de mandat actif avec ce propriétaire — invitez-le d'abord via /agent-mandates. »

### 21. Pas d'état « brouillon »

Un bien existe dès sa première étape de création. Un assistant abandonné laisse un bien vide ; il n'est pas dans la recherche tant qu'il n'a pas d'unité, mais reste dans la liste du propriétaire.

### 22. Devise « EUR » dans une notification

Une notification de paiement affiche « 120000 EUR » au lieu de FCFA : chaîne formée côté serveur.

### 23. `instructions.fr` du mode `redirect`

`POST /payment/checkout` en mode `redirect` renvoie un texte destiné à un développeur (« Redirigez l'utilisateur vers `url`… »), alors que les autres modes renvoient un texte affichable à l'utilisateur.

### 24. Disponibilités d'un artisan (revérifié Lot 54)

- Aucun endpoint ne permet à un artisan de bloquer des jours dans son planning.
- Une demande d'intervention n'a **aucune date** : ni souhaitée, ni convenue, ni réalisée avant `completed_at`.
- **Écran Planning** : il affichait encore une semaine fictive, et un bouton « Bloquer une plage » qui n'enregistrait rien. Il liste désormais les interventions à réaliser par ordre d'urgence et dit que les dates se conviennent dans la conversation.
- **Attendu** : un champ `scheduled_at` sur la demande (proposé par l'artisan, accepté par le demandeur) et des indisponibilités d'artisan.

### 25. Annulation d'une réservation courte durée confirmée

- L'API renvoie une 400 explicite : l'annulation avec remboursement partiel n'est pas développée.
- **Revérifié au Lot 49** : « …contactez le propriétaire directement ». L'hôte ne peut pas annuler non plus : il n'existe aucune route hôte.
- Un séjour payé ne peut donc être annulé par personne sur la plateforme.
- Le frontend l'explique au voyageur et propose d'écrire à l'hôte.

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

---

## Ajouts du Lot 48 — Visites

### 40. 🟠 Confirmation d'une visite à une date passée acceptée

- **Rejoué** : `PATCH /visits/:id/confirm { "confirmed_at": "2025-02-02T10:00:00Z" }` → visite `confirmed` au 2 février **2025**.
- `reschedule` refuse pourtant une date passée (« La date doit etre valide et dans le futur. »).
- **Attendu** : même contrôle sur `confirm`.

### 41. 🟠 Visite « réalisée » avant d'avoir eu lieu ; demandes jamais expirées

- `PATCH /visits/:id/complete` sur une visite confirmée **8 jours plus tard** → 200 `completed`.
- Une visite `pending` dont la date est passée reste `pending` indéfiniment. Il n'y a pas non plus de statut « candidat absent ».
- **Attendu** :
  - `complete` seulement une fois `confirmed_at` passé ;
  - expiration automatique des demandes dépassées ;
  - éventuellement un statut `no_show`.

### 42. 🟠 Logement sans bien parent : personne ne peut traiter la visite

- `create` calcule `landlord_id = unit.property?.owner_id ?? null` et ignore `unit.owner_id` des unités autonomes (sans `property_id`).
- La visite est alors créée sans propriétaire : elle n'apparaît chez personne, et personne ne peut la confirmer.
- Constaté dans le code, pas rejoué (pas d'unité autonome de test).
- **Attendu** : `unit.property?.owner_id ?? unit.owner_id`.

### 43. 🟡 Aucune validation du corps de `POST /visits`

- Le corps est typé en objet brut, sans DTO : aucune règle `class-validator` ne s'applique.
- `unit_id: "abc"` → **500**.
- Une note de 5 000 caractères est acceptée.
- 3 h du matin est accepté comme horaire de visite.
- **Attendu** : DTO avec `@IsUUID`, `@MaxLength` sur la note, et éventuellement une plage horaire.

### 44. 🟡 Un propriétaire peut demander à visiter son propre logement ; statut ignoré

- Aucune vérification de rôle ni de propriété à la création : le propriétaire de test a pu demander une visite de son propre logement.
- Le statut du logement (occupé, suspendu) n'est pas contrôlé non plus.

### 45. 🟡 Incohérences diverses du module visites

- **Messages sans accents** (« deja », « etre », « confirmee », « Acces interdit ») ; le frontend les corrige un par un.
- **Informations manquantes** : la liste `GET /visits` ne contient pas le propriétaire (seul le détail l'a), donc le locataire ne voit pas qui confirme.
- **Transition incohérente** : une visite **refusée** peut encore être « annulée » (200 → `cancelled`).
- **Métadonnées** des notifications en camelCase (`visitId`), alors que le reste de l'API est en snake_case (`housing_request_id`).
- **Délégation impossible** : seul `landlord_id` peut agir, un membre d'équipe ne peut pas gérer les visites.
- **Paramètre implicite** : sans `?role=`, `GET /visits` prend le rôle actif du compte (documenté comme « tenant par défaut »).

### 46. 🟠 Supprimer un bien laisse ses visites et réservations orphelines

- **Rejoué** : après `DELETE /property/:id`, les 13 visites du bien restent dans `GET /visits` des deux parties avec `unit: null`, y compris celles encore `pending` ou `confirmed`.
- Les réservations (`GET /bookings/mine`) du bien supprimé au Lot 46 reviennent aussi avec `unit: null`.
- Le locataire n'est ni prévenu ni libéré : une visite confirmée reste « à venir » pour un logement qui n'existe plus.
- **Côté frontend**, ces pages plantaient (`unit.name` sur `null`) ; elles sont désormais protégées (Lot 48).
- **Attendu** : à la suppression d'un bien ou d'une unité, annuler et notifier les visites en attente ou confirmées ainsi que les réservations à venir. Refuser la suppression s'il existe un bail actif (voir #5).

---

## Ajouts du Lot 49 — Réservations courte durée

### 47. 🟠 Réserver un séjour n'exige pas d'identité vérifiée

- **Rejoué** : un locataire au `kyc_status: pending` crée une réservation (201), et pourrait la payer.
- Or `POST /visits` exige une identité vérifiée (`VerifiedUserGuard`). Il est plus contraignant de visiter que de dormir sur place.
- **À trancher** côté produit. Le frontend affiche désormais la règle réelle : réserver est possible, visiter non.

### 48. 🟠 Un hôte peut réserver et se payer son propre logement

- **Rejoué** : le propriétaire du logement crée un hold sur son propre logement (201). Rien ne l'empêche de le payer : son wallet serait débité puis crédité, et le calendrier bloqué.
- **Attendu** : 403 si `tenant_id === landlord_id`, ou un vrai « blocage » passant par les disponibilités.

### 49. 🟠 Recharge Mobile Money directe impossible pour un compte sans téléphone

- `payment.service.createPayment` prend le numéro dans `user.phone_number`. Le corps de `POST /payment/checkout` n'accepte pas de numéro.
- Les comptes créés depuis l'inscription par email n'ont pas de téléphone, et aucune route ne permet d'en enregistrer un (#14).
- **Rejoué** : `checkout` GSM_MTN → `ussd_push` accepté. Puis `GET /payment/transactions/:id/status` → 404 « Transaction non trouvee », `verify-return` → `verified: false`. Rien n'est crédité.
- **Attendu** : accepter `phone_number` dans `checkout` (avec le numéro saisi à l'écran), et corriger #14.
- **Mise à jour (Lot 55)** : `checkout` accepte désormais `phoneNumber`. Avec le numéro de test `66000001`, la recharge MTN directe a bien crédité 5 000 F, puis 20 000 F. Le frontend demande le numéro à l'écran. Reste #14, et le suivi du paiement (#86).

### 50. 🟠 Portefeuille incohérent : tirelire supérieure au solde total

- **Constaté** sur un compte propriétaire de test : `balance_total: 18000`, `balance_savings: 30000`. La tirelire, qui est une partie du solde, dépasse le total.
- Au paiement d'une réservation, l'hôte est crédité sur `balance_total` seulement. La cause du dépassement reste à identifier dans l'historique des transactions de ce compte.
- **Cause trouvée (Lot 55)** : le paiement d'une intervention d'artisan débite le total sans toucher la tirelire. Ce compte a payé trois interventions (18 000, 5 000 et 9 000 F) avec des fonds venus de recharges. Conséquence grave, décrite en #82 : le solde peut devenir négatif.

### 51. 🟡 Séjour minimum appliqué au seul segment de prolongation

- Prolonger d'**1 nuit** un séjour sur un logement à 2 nuits minimum → 400 « Séjour minimum : 2 nuit(s). », alors que le séjour total fait déjà plusieurs nuits.
- Même logique pour les paliers de prix : une prolongation de 7 nuits est facturée au tarif semaine, calculé sur le segment seul.
- **Attendu** : évaluer le minimum (et idéalement les paliers) sur la durée totale de la chaîne de réservations.

### 52. 🟡 Trois statuts seulement pour une réservation

- `pending_payment`, `confirmed`, `cancelled`.
- **Séjour terminé** : il reste `confirmed` pour toujours.
- **Hold non payé** : il devient `cancelled` comme une annulation volontaire, sans motif.
- **Statut « en cours »** : il n'y en a pas.
- Le frontend déduit ces phases des dates, mais les rapports, les notifications et le back-office ne peuvent pas les distinguer.
- **Attendu** : `expired`, `completed` (ou `checked_out`), et éventuellement un motif d'annulation.

### 53. 🟡 Message « Solde insuffisant » brut

- « Solde insuffisant. Votre tirelire contient 0 XOF, le séjour coûte 30000 XOF. » : montants non formatés, code devise brut.
- Le frontend affiche désormais le manque avant le clic, mais le message serveur reste visible dans les autres cas.

---

## Ajouts du Lot 50 — Baux et états des lieux

### 54. 🔴 Un locataire peut signer un bail brouillon jamais envoyé

- `SignLeaseCommandHandler` ne refuse que les baux résiliés. Côté locataire, il passe le bail à `signed` quel que soit son statut.
- **Rejoué** : un brouillon non envoyé, signé par le locataire → 200, `status: signed`, `signed_at_landlord: null`. Le bail est « signé des deux côtés » sans que le propriétaire l'ait signé ni envoyé. Le paiement d'entrée devient possible et active le bail.
- **Attendu** : signature du locataire acceptée seulement si `status === pending_signature` (400 sinon) ; `SIGNED` seulement si `signed_at_landlord` est renseigné.

### 55. 🔴 Re-signer un bail actif le fait repasser « signé »

- Même cause que #54.
- **Rejoué** : sur un bail `active` (entrée payée), le locataire appelle `PATCH /leases/:id/sign` → 200, `status: signed`.
- Conséquences, toutes vérifiées :
  - le bail n'est plus facturé (la facturation ne prend que les baux `active`) ;
  - la résiliation est refusée (« Seul un bail actif peut être résilié ») ;
  - l'annulation pour impayé est refusée (`entry_paid_at` est renseigné) ;
  - le préavis est refusé.
- Le bail est bloqué définitivement, et un locataire peut ainsi arrêter ses loyers.
- **À corriger en base** : le bail de test `52cc38b3-49f5-4df9-8f17-6385e556562d` (propriétaire `qa-landlord-1790282977`) est dans cet état. Le frontend l'affiche « Statut incohérent » et ne propose plus la signature que pour un bail `pending_signature`.

### 56. 🔴 État des lieux réécrit après la signature de l'autre partie

- `update()` n'interdit la modification que d'un état des lieux `signed`. Tant que les deux signatures ne sont pas posées, chaque partie peut tout réécrire, **sans effacer la signature déjà posée**.
- **Rejoué** :
  1. le propriétaire signe ;
  2. le locataire remplace « Murs : bon état » par « Murs : abîmé — réécrit par le locataire après la signature du propriétaire » (200) ;
  3. le locataire signe → `signed`.
- Le document final porte la signature du propriétaire sur un contenu qu'il n'a jamais vu. Le locataire peut aussi créer, modifier et envoyer un état des lieux.
- **Attendu** : contenu figé dès la première signature (ou signatures effacées à chaque modification). Préciser qui rédige (le propriétaire seul, a priori).
- Le frontend ne permet plus de modifier qu'un brouillon, ou un envoi que personne n'a signé, et jamais côté locataire.

### 57. 🟠 Aucune restitution de la caution

- Le paiement d'entrée débite la tirelire du locataire (caution + avance + prépayé) et place les fonds « en séquestre plateforme ». Aucun wallet n'est crédité.
- Aucune route ni tâche ne restitue ces fonds : ni la résiliation, ni l'annulation pour impayé, ni l'état des lieux de sortie.
- **Rejoué** : bail résilié, caution de 10 000 → tirelire du locataire inchangée, aucune transaction.
- L'avance et le prépayé non consommés restent également bloqués.
- **Attendu** : un circuit de restitution (retenues justifiées par l'état des lieux de sortie, délai, accord des deux parties ou arbitrage).
- Le frontend promettait « restitués sous 7 jours » : il dit désormais que la restitution n'est pas encore gérée dans l'application.

### 58. 🟠 Un brouillon de bail bloque le calendrier et ne peut être ni supprimé ni annulé

- `POST /leases` bloque le calendrier du logement dès le brouillon, sans fin si le bail n'a pas de date de fin.
- **Rejoué** : un brouillon créé par erreur → toute création de bail sur ce logement renvoie 409 « Ce logement n'est pas disponible sur la période demandée ».
- **Aucune sortie possible pour un brouillon** :
  - aucun `DELETE` ;
  - `cancel-unpaid` exige `signed` ;
  - `terminate` exige `active`.
- `PATCH /leases/:id` change `start_date`, mais ne déplace ni le blocage du calendrier ni `next_billing_date` (rejoué : début au 01/10, première facturation restée au 30/09).
- `cancel-unpaid` remet le logement `available` sans fermer son blocage de calendrier (pas d'appel à `closeBlock`, contrairement à `terminate`).
- **Attendu** :
  - bloquer le calendrier à l'envoi ou à la signature, pas au brouillon ;
  - permettre de supprimer un brouillon ;
  - répercuter les dates modifiées ;
  - fermer le blocage à l'annulation.

### 59. 🟠 La fin de bail n'est jamais automatique

- **Facturation** : `LeaseBillingService` facture tout bail `active` dont `next_billing_date` est passée. Il ignore `end_date` et la date de départ d'un préavis.
- **Clôture** : aucune tâche ne clôt le bail à l'une ou l'autre date. Le locataire parti continue d'être facturé jusqu'à ce que le propriétaire résilie.
- **Réponse de `give-notice`** : `renewal_intent_date` est la **date du préavis**, pas celle du départ. Le départ (`+ notice_period` mois) ne figure que dans les métadonnées de la notification du propriétaire (`availableFrom`).
- **Après résiliation** : `renewal_intent` reste `leave`.
- **Attendu** :
  - arrêter la facturation à la date de départ ou de fin ;
  - clôturer le bail (ou le proposer au propriétaire) ;
  - renvoyer `planned_departure_date`.

### 60. 🟠 Le locataire ne peut pas résilier

- `PATCH /leases/:id/terminate` porte `@Roles(ADMIN, LANDLORD, AGENT)`. Le code du handler et la documentation Swagger prévoient pourtant le locataire.
- **Rejoué** : le locataire du bail → 403 « Accès réservé ».
- La résiliation ne vérifie pas non plus l'état des lieux de sortie et ne traite pas la caution (#57).
- **À trancher** : si le locataire ne doit passer que par le préavis, corriger la documentation. Sinon, ouvrir la route.

### 61. 🟠 Doublons d'état des lieux ; retenue libérée par un brouillon vide

- `POST /inventories` ne renvoie l'existant que s'il est **brouillon**.
- **Rejoué** : un état des lieux d'entrée signé, puis `POST` du même type → un **second** « entrée » en brouillon. Le bail en a alors deux.
- La libération de la retenue d'un séjour (`booking-retention-cron`) vérifie seulement qu'**un** état des lieux existe pour la réservation. Un brouillon vide, créé en un appel, suffit à débloquer l'argent de l'hôte.
- **Attendu** :
  - un seul état des lieux par type (renvoyer l'existant quel que soit son statut) ;
  - exiger un état des lieux **signé** pour libérer la retenue.

### 62. 🟡 Création de bail : validations manquantes

- **Date invalide** : `startDate: "abc"` → 500.
- **Dates incohérentes acceptées** : fin avant début, début dans le passé. Pour un début passé, les échéances passées seront facturées une par une, une par nuit de facturation.
- **Logement d'un autre bien** : un logement qui n'appartient pas au bien indiqué est accepté (`unitId` d'un autre bien du même propriétaire).
- **Locataire** :
  - son rôle n'est pas vérifié ;
  - un propriétaire peut créer un bail avec lui-même comme locataire.
- **Montants** : loyer à 0 accepté.
- **Préavis** : `noticePeriod` n'est pas accepté à la création, seulement en modification du brouillon.
- Le frontend contrôle désormais tout cela avant l'envoi.

### 63. 🟡 États des lieux : aucune validation, messages en anglais

- **Aucune validation** : les DTO sont des interfaces TypeScript, non des classes `class-validator`, donc rien n'est contrôlé.
  - `type: "foo"` → 201 ;
  - `state` libre (`"n'importe quoi"` enregistré).
  - Le PDF n'affiche que `new/good/fair/damaged/missing`. L'ancien état « issue » du frontend sortait sans libellé.
- **Signature vide** : `PATCH /inventories/:id/sign` sans `signature` → 200 sans effet (déjà vu au Lot 28).
- **Messages en anglais** : « At least one room required », « Not authorized », « Cannot modify a signed inventory », « Inventory must be pending signature ».
- **PDF d'un séjour** : `GET /pdf/inventories/:id` lit le bien et le logement **via le bail seulement** ; pour une réservation, ils sortent « — ».

### 64. 🟡 `auto-debit` sans `enabled` enregistre `null`

- `PATCH /leases/:id/auto-debit` avec un corps vide → 200, `auto_debit_enabled: null`.
- La route accepte aussi un bail non actif. **Attendu** : booléen obligatoire.

### 65. 🟡 Pas de `GET /leases/:id` ; `/leases/my` mêle les deux rôles

- La fiche d'un bail doit relire toute la liste. `/leases/my` renvoie indistinctement les baux où l'on est locataire et ceux où l'on est propriétaire, sans indicateur. Le frontend filtre par `tenant_id` / `landlord_id`.
- Un membre d'équipe autorisé sur un bien (`team:leases:*`) ne voit pas ses baux dans `/leases/my`.
- Le locataire voit les brouillons de son propriétaire avant leur envoi.

---

## Ajouts du Lot 51 — Candidatures

### 66. 🟠 Candidatures : personne n'est prévenu

- **Rejoué** : une candidature créée → aucune notification pour le propriétaire. Seule une conversation est ouverte, avec le message s'il y en a un.
- **Rejoué** : une candidature refusée explicitement (`reject`) → aucune notification pour le candidat. Sa conversation est archivée en silence.
- Seules l'acceptation et le refus automatique des autres candidats notifient.
- **Attendu** : notifier le propriétaire à chaque candidature (`metadata.requestId`) et le candidat à chaque refus.
- En attendant, le frontend :
  - affiche un compteur de candidatures en attente dans le menu du propriétaire ;
  - envoie un message au candidat dans la conversation avant chaque refus.

### 67. 🟠 Retenir un candidat crée un second bail sur un logement déjà engagé

- `AcceptRentalRequestHandler` ne vérifie que `unit_status === available`. Or un brouillon de bail créé par `POST /leases` ne change pas ce statut (il bloque seulement le calendrier, #58).
- **Rejoué** : un brouillon de bail existant sur le logement, puis acceptation d'une candidature → 200. Il y a alors **deux brouillons qui se chevauchent** sur le même logement.
- **À l'acceptation, le logement passe « occupé »**, alors qu'aucun bail n'est ni signé ni payé.
  - **Aucun retour possible** : un brouillon ne peut être ni supprimé ni annulé (#58). Si le candidat ne signe jamais, le logement reste « occupé » et bloqué dans le calendrier, et n'accepte plus de candidature (400 « pas disponible »).
- **Attendu** :
  - vérifier le calendrier (`isRangeAvailable`) comme `POST /leases` ;
  - passer le logement « occupé » à l'activation du bail, pas à l'acceptation ;
  - permettre d'annuler une acceptation tant que rien n'est signé.
- Le frontend bloque « Retenir ce candidat » quand un bail est en cours ou en préparation sur le logement, sauf si c'est un préavis dont le départ tombe avant l'emménagement.

### 68. 🟡 Bail préparé à l'acceptation : écarts avec `POST /leases`

- **Prépayé** : `prepaye_months` du logement est ignoré (`prepaid_target: 0`). `POST /leases` le reprend.
- **Loyer** : c'est le prix affiché (`unit.price`) qui est repris, jamais la grille tarifaire.
- **Date de début** : la date souhaitée par le candidat, **même passée** (#70), sinon le jour de l'acceptation.
- **Notification au candidat** : « un bail a été préparé, **en attente de signature** ». Faux : c'est un brouillon, que le locataire ne peut pas signer tant que le propriétaire ne l'a pas envoyé (et qu'il ne doit pas signer, #54).
- **Réponse** : elle renvoie la candidature, pas l'id du bail créé. Le frontend doit le retrouver dans `/leases/my`.
- **Autres candidats** : leur notification porte `requestId` = la candidature **retenue**, pas la leur.

### 69. 🟡 Cycle de vie trop limité

- Le candidat ne peut pas retirer sa candidature : il n'existe pas de route, et la candidature reste « en attente » jusqu'à la réponse du propriétaire.
- Le refus ne prend pas de motif.
- Trois statuts seulement : un candidat écarté parce qu'un autre a été retenu est `rejected`, exactement comme un refus explicite.
- **Attendu** : `withdrawn` (retrait par le candidat), un `reason` au refus, et la distinction « non retenu » / « refusé ».

### 70. 🟡 Validation de la candidature

- `desired_move_in_at: "abc"` → **500** (colonne `date`, champ validé seulement comme chaîne).
- Une date passée est acceptée, et devient la date de début du bail à l'acceptation.
- Un message de 2001 caractères → 400 « Données invalides », sans indiquer le champ.
- `unit_id` non UUID → 400 « Données invalides ».
- Les messages de `create` sont en anglais pour un logement introuvable (« Unit not found »).
- Accepter et refuser sont réservés au propriétaire : un membre d'équipe autorisé sur le bien ne peut pas traiter les candidatures.

---

## Ajouts du Lot 52 — États des lieux (photos, sortie)

### 71. 🟠 Photos d'état des lieux effacées à chaque modification

- `POST /files` puis `rooms[].items[].photos` fonctionnent. Rejoué : une photo envoyée est stockée, puis consultable par le locataire et le propriétaire via le relais par index (un tiers reçoit 403).
- Mais `GET /inventories/:id` ne renvoie jamais les URLs, seulement `photo_count`, et `PATCH` remplace `rooms` en entier.
- **Rejoué** : relire l'état des lieux puis renvoyer ses pièces telles quelles (avec un commentaire modifié) → `photo_count` passe de 1 à 0. Toute modification efface les photos.
- Le frontend contourne le problème, au prix d'un doublon de chaque photo à chaque session d'édition : avant d'enregistrer, il récupère les photos existantes par le relais, puis les renvoie par `POST /files`.
- **Attendu** : accepter des identifiants de fichiers (`POST /files` renvoie un `id`), ou fusionner les photos existantes quand un élément n'en fournit pas.

### 72. 🟠 Le PDF de l'état des lieux n'a ni photos ni comparaison ; la sortie n'alimente rien

- Le gabarit `etat-des-lieux.hbs` n'imprime aucune photo : la pièce justificative principale d'un litige sur la caution est absente du document signé.
- **Sortie** : le PDF ne la compare pas à l'entrée. Le frontend affiche désormais les dégradations et la consommation des compteurs.
- **Caution** : l'état des lieux de sortie ne déclenche rien (voir #57) : ni retenue proposée, ni restitution.
- **Séjour court** : le PDF d'un état des lieux de séjour affiche « — » pour le bien et le logement (déjà signalé en #63).

### 73. 🟡 Cas limites acceptés

- **Réservation annulée** : `POST /inventories` sur une réservation `cancelled` → 201.
- **Bail résilié** : un état des lieux de sortie sur un bail résilié est accepté. C'est souhaitable, la sortie se fait souvent après.
- **URL relative** : une photo enregistrée avec une URL relative (`/uploads/…`, format documenté par `POST /files` pour le stockage local) → le relais répond 500.
- **Identifiant invalide** : un identifiant non UUID → « Validation failed (uuid is expected) » (message traduit côté front).

---

## Ajouts — Carte et position des biens

### 74. 🟡 Impossible d'effacer la position GPS d'un bien ; aucune validation des coordonnées

- **Effacement** : `PATCH /property/:id` avec `{ "gps_latitude": null, "gps_longitude": null }` → 500 (« Une erreur inattendue s'est produite »), et la position reste en place (rejoué le 2026-09-28 sur « QA Lease Test Property 3 »). Un propriétaire peut déplacer son bien, jamais retirer sa position. Le frontend ne propose donc « Retirer » qu'avant le premier enregistrement.
- **Validation** : aucune borne sur les coordonnées. « Studio LAPERTA » (Parakou) est enregistré en `1.0012444, 2.0949334`, en plein golfe de Guinée. Le frontend écarte les points hors du Bénin et affiche la zone de la ville à la place.
- **Swagger** : le corps documenté de `PATCH /property/:id` ne liste que `name`, `status` et `description`, alors que les coordonnées (et le reste des champs de création) sont bien acceptés.
- **Attendu** : accepter `null` pour effacer ; refuser (400) une latitude/longitude hors de [-90, 90] / [-180, 180], idéalement hors du pays du bien ; documenter le corps complet du `PATCH`.

---

## Ajouts du Lot 53 — Équipe et mandats

### 74. 🔴 Un utilisateur déjà inscrit, invité dans une équipe, ne peut jamais accepter

- **Création** : pour une adresse qui a déjà un compte, `POST /team/invite` crée un `TeamMember` au statut `pending`. Il n'y a ni jeton ni `TeamInvitation`.
- **E-mail** : il pointe vers `${frontendUrl}/teams`, une page qui n'existe pas.
- **Aucune route pour accepter** :
  - `POST /team/invitation/:token/accept` ne traite que les `TeamInvitation` par jeton ; le code le reconnaît en commentaire (« Peut-être une invitation in-app… »).
  - `GET /team/memberships` ne liste que les membres `active`.
- **Rejoué** : invité, le locataire de test n'a reçu aucune notification. Ses appartenances restent vides, et son adhésion reste `pending` indéfiniment.
- **Attendu** :
  - une route `POST /team/members/:id/accept` (et `…/decline`) ;
  - une liste de mes invitations en attente ;
  - une notification in-app avec `memberId`.

### 75. 🟠 Invitations et membres : ni annulation, ni relance, ni départ

- **Invitation par e-mail** : on ne peut ni l'annuler ni la renvoyer. Elle reste `pending` jusqu'à son expiration (7 jours).
- **Membre** : il ne peut pas quitter une équipe de lui-même. `DELETE /team/members/:id` est réservé au propriétaire (403 « Seul le propriétaire de l'équipe peut révoquer un membre »).
- **Retirer un membre deux fois** : la réponse est 200 à chaque fois, et le membre est de nouveau notifié.
- **Membre jamais actif** : lui retirer l'accès envoie « Votre accès à cette équipe a été révoqué — vous ne pouvez plus accéder à ses biens ».
- **Validation** : un e-mail invalide renvoie « Données invalides », sans préciser le champ. Le frontend contrôle désormais avant l'envoi.

### 76. 🟠 Un mandat ne donne aucun accès

- **Cycle de vie** : il fonctionne et notifie les deux parties à chaque étape (rejoué : invitation, acceptation, fin).
- **Mais aucune route n'utilise ni le mandat ni `property.agent_id`** :
  - les permissions passent uniquement par l'équipe (`hasPropertyAccess`) ;
  - rejoué : l'agent désigné sur un bien (200) voit **0 bien** dans `GET /property/owner/me`, et `0 bail`.
- **Fin du mandat** : l'agent reste désigné sur les biens (`agent_id` inchangé, rejoué).
- **Refus** : l'agent qui refuse fait passer le mandat à `revoked`, comme une fin de mandat.
- **Attendu** : décider ce qu'un mandat autorise (idéalement, lier mandat et équipe) ; retirer `agent_id` des biens à la fin du mandat ; distinguer `rejected`.
- En attendant, le frontend le dit clairement aux deux parties et retire lui-même l'agent des biens à la fin du mandat.

### 77. 🟡 Équipe et mandats : écarts divers

- **Permissions non appliquées** : `GET /team/permissions` publie 16 permissions. Seules 5 sont réellement vérifiées :
  - `team:leases:create`, `team:leases:sign` ;
  - `team:units:edit`, `team:properties:edit` ;
  - `team:requests:handle`.

  Les autres, comme « voir les paiements » ou « répondre aux messages », ne débloquent rien.
- **`TeamAccessGuard`** : écrit mais jamais branché sur une route.
- **Contexte d'équipe** : `active_team_id` du JWT (`switch-context`, #26) n'est lu par aucun module.
- **Membre d'équipe** : il n'a aucune liste des baux ou des logements de l'équipe. `/leases/my` ne les contient pas (#65) ; seule `/team/memberships` donne les noms des biens.
- **Identité du mandant** : `GET /agent-mandates/mine` ne renvoie ni l'e-mail ni le téléphone du propriétaire. S'il n'a pas renseigné son nom, l'agent ne sait pas qui l'invite.
- **Devenir agent** : l'application n'avait aucun moyen de s'inscrire comme agent. Le frontend ajoute « Je suis agent » (`POST /user/roles`).
- **Route `GET /property/my`** : l'identifiant non UUID est interprété comme `:id` → 500 (même famille que #38).

---

## Ajouts du Lot 54 — Artisans

### 78. 🔴 Après l'inscription, la session garde le rôle « tenant »

- **Rejoué** avec deux comptes artisans créés par code OTP puis `POST /onboarding/draft` et `POST /onboarding/finalize`.
  - `GET /auth/me` : `role: artisan`.
  - `GET /auth/roles` : `roles: ['tenant'], active_role: 'tenant'`.
  - `GET /artisans/me` : **403 « Accès réservé »**.
- **Après `POST /auth/refresh`** : c'est inchangé, toujours `tenant` et 403.
- **Seul `POST /auth/switch-role`** vers le rôle choisi émet un jeton correct. Il reste correct après les rafraîchissements suivants.
- **Cause probable** : la session créée à la vérification du code (compte neuf = `tenant`) conserve son rôle actif. `finalize` met à jour l'utilisateur en base, mais pas la session.
- **Impact** : tout artisan (et, par le même chemin, tout propriétaire) qui s'inscrit sur le site reçoit des 403 sur son espace jusqu'à ce qu'il se reconnecte.
- **Attendu** : que `finalize` renvoie une paire de jetons à jour, ou mette à jour le rôle actif de la session.
- Le frontend appelle désormais `switch-role` juste après `finalize`.

### 79. 🟠 `retained_amount` jamais remis à zéro

- Une fois la part retenue versée à l'artisan (fin de garantie) ou partagée après un litige, la demande reste avec `retained_amount` à sa valeur d'origine.
- **Rejoué** : litige réglé à 3 000 / 1 000 sur 4 000 retenus → demande `closed`, `retained_amount: "4000.00"`.
- **Effet** : la facturation de l'artisan additionnait ces montants comme « retenues en cours ». Le frontend ne compte désormais que les demandes pas encore clôturées.
- **Attendu** : remettre le champ à 0, ou ajouter `retention_released_at` / `retention_split` pour garder l'historique.

### 80. 🟡 Offres d'artisan : validations manquantes

- **Prix** : un prix de 0 est accepté (201).
- **Retenue sans garantie** : une retenue avec 0 jour de garantie est acceptée. À la fin des travaux, la garantie expire aussitôt, et le demandeur n'a aucune fenêtre pour signaler un problème.
- **Messages** : une retenue de 120 %, une description vide ou un motif de litige vide renvoient « Données invalides », sans le champ concerné.
- **Accepté comme prévu** : le demandeur peut contre-proposer (l'offre précédente passe `superseded`). Mais jusqu'ici l'écran ne le permettait pas, et affichait les offres remplacées comme « Refusée ».

### 81. 🟡 Interventions : liens et contacts manquants

- **Lien avec le signalement** : une demande d'intervention ne garde pas le signalement d'origine (pas de `signal_id`). Le frontend pré-remplit la demande depuis le signalement, puis passe celui-ci « En examen » avec l'artisan assigné. Mais le lien n'est pas conservé côté serveur.
- **Contact du demandeur** : l'artisan ne reçoit que son nom, souvent vide (`first_name`/`last_name` nuls sur le compte de test), sans téléphone ni e-mail. Il doit passer par la conversation de la demande, et l'espace artisan n'avait **aucune page de messagerie** (ajoutée côté front).
- **Demande par un locataire** : un locataire qui a un bail actif peut créer une demande d'intervention sur son logement (règle de l'API), mais aucun écran ne le propose. C'est une décision produit : qui paie, qui choisit l'artisan ?

## Ajouts du Lot 55 — Wallet, signalements, messagerie

### 82. 🔴 Solde négatif : un paiement de logement ne vérifie que la tirelire

- **Deux règles qui ne tiennent pas ensemble** :
  - Loyer, paiement d'entrée et réservation vérifient la tirelire (`balance_savings`) et débitent les deux soldes.
  - L'intervention d'artisan vérifie et débite le total (`balance_total`) seulement.
  - La tirelire peut donc dépasser le total (#50).
- **Rejoué en direct** sur un compte à 7 000 F de total et 30 000 F de tirelire (écart créé par trois paiements d'intervention) :
  - `POST /bookings/:id/pay` d'une réservation à 16 000 F → 201.
  - Le payeur passe à **−9 000 F** de total (14 000 F de tirelire), l'hôte est crédité de 16 000 F.
  - De l'argent a été versé sans exister.
- **Attendu** :
  - Chaque débit vérifie le solde qui sera réellement débité : `min(tirelire, total)` pour un paiement de logement.
  - Toute écriture qui touche le total garde `balance_savings ≤ balance_total`.
  - Une contrainte `CHECK (balance_total >= 0)` en base.
  - Corriger les comptes déjà incohérents (celui du test est à −9 000 F).
- **Côté frontend** :
  - Les écrans de paiement ne comptent plus que `min(tirelire, total)` comme disponible et bloquent le paiement au-delà.
  - Un encart explique les soldes incohérents ou négatifs.
  - Mais un appel direct à l'API passe toujours.

### 83. 🟠 Retrait en attente non réservé

- `POST /wallet/withdraw` crée la demande sans rien bloquer.
- Le montant reste dans `balance_total` et peut être dépensé avant l'approbation par un administrateur. Celle-ci débite alors un solde qui ne le couvre plus.
- `GET /wallet/stats` renvoie `pending_amount: 0` alors qu'un retrait de 1 000 F est en attente sur le même compte.
- **Attendu** : réserver le montant à la demande (solde « bloqué », ou débit immédiat et recrédit au rejet), et le compter dans `pending_amount`.
- Le frontend affiche « dont X F en cours de retrait » et prévient que le montant ne doit pas être dépensé.

### 84. 🟠 Retrait : validations manquantes, pas d'annulation

- **Numéro** : `phone_number: "abc"` est accepté (201) et la demande reste en attente pour un virement impossible.
- **Montant** : `amount: "abc"` → 500 « Une erreur inattendue ».
- **Méthode** : la méthode est enregistrée et renvoyée en minuscules (`mtn_momo`) alors que l'énumération déclarée est en majuscules (`MTN_MOMO`).
- **Annulation** : aucune route ne permet d'annuler sa demande. Un numéro erroné bloque tout nouveau retrait (une seule demande en attente à la fois) jusqu'à l'intervention d'un administrateur.
- **Attendu** :
  - valider le numéro (format béninois) et le type du montant ;
  - renvoyer l'énumération telle que déclarée ;
  - ajouter `PATCH /wallet/withdrawals/:id/cancel` tant que la demande est en attente.
- Le frontend valide désormais le numéro et le normalise (`+229…`).

### 85. 🟠 Statistiques du wallet fausses

- **Propriétaire** : `total_income` 75 000 F (ses deux recharges) et `total_expenses` 0. Or l'historique contient 107 000 F de réservations encaissées et 111 000 F de débits (entrées de bail, réservations, interventions).
- **Artisan** : 47 000 F reçus, `total_income` 0.
- Les statistiques semblent ne compter que le type `saving`.
- **Attendu** : revenus et dépenses calculés sur tous les types, par signe du montant.
- Non affiché par le frontend tant que ce n'est pas corrigé.

### 86. 🟠 Mobile Money direct : paiement introuvable, seul `verify-return` crédite

- **Constaté** : après `checkout` en `ussd_push`, `GET /payment/transactions/:id/status` répond 404 « Transaction non trouvee » sur le `transactionId` renvoyé, avant comme après le paiement.
- C'est `POST /payment/verify-return` qui confirme **et crédite** le wallet. Mais `instructions.fr` le dit (« appelez /payment/verify-return ») alors que le Swagger présente la route de statut comme le suivi normal.
- L'ancien écran interrogeait la route de statut : il finissait toujours en « paiement non confirmé », sans créditer.
- **Format** : `verify-return` n'accepte `gatewayType` qu'en minuscules (`gsm_mtn`), alors que `GET /payment/gateways` renvoie `type: "GSM_MTN"`.
- **Attendu** :
  - une route de statut qui fonctionne avec l'id renvoyé par `checkout` (FedaPay a le même défaut, relevé dès l’IL4) ;
  - ou documenter `verify-return` comme la route de suivi ;
  - et accepter les deux casses.
- Le frontend interroge maintenant `verify-return` (idempotent grâce à `alreadyCredited`), y compris au retour de FedaPay.
- Le bac à sable vérifie immédiatement n'importe quel numéro : le parcours réel (attente de validation sur le téléphone) reste à tester avec un vrai compte MTN.

### 87. 🔴 N'importe quel compte peut signaler un problème sur n'importe quel logement

- **Rejoué** : un locataire sans aucun bail et un propriétaire tiers ont chacun créé un signalement sur le logement d'un autre propriétaire (201). Le propriétaire les reçoit, avec notification.
- Un bail en brouillon, un bail signé mais pas actif, et un `lease_id` qui ne correspond pas au logement sont aussi acceptés.
- **Historique public** : `GET /signals/units/:unitId/history` compte ces signalements, y compris les **annulés** (12 au total pour 5 résolus sur le logement de test).
  - N'importe qui peut donc gonfler l'historique d'incidents d'un logement ou harceler un propriétaire.
- **Attendu** :
  - n'accepter un signalement que du locataire d'un bail actif sur ce logement (ou du propriétaire lui-même), avec un `lease_id` cohérent ;
  - exclure les annulés de l'historique.
- Le frontend ne propose plus que les baux actifs.

### 88. 🟠 Signalements : droits et transitions

- **Auteur (locataire)** :
  - Il peut modifier `assigned_to` et `resolution_notes` (200). Il peut donc écrire lui-même la « note de résolution » du propriétaire.
  - Il ne peut changer le statut que pour annuler, et seulement tant que le signalement est ouvert. Sinon la réponse est 403 « Seul le propriétaire peut modifier le statut ».
- **Propriétaire** :
  - Il peut annuler un signalement ouvert. L'annulation devrait être réservée à l'auteur ; le propriétaire dispose de « clore ».
- **Transitions relevées en live** :
  - open → in_review, closed, cancelled
  - in_review → open, resolved
  - resolved → open, closed
  - Refusées : open → resolved, **in_review → closed** (on ne peut pas clore sans suite un signalement déjà pris en charge), in_review → cancelled.
  - Le Swagger ne décrit que « 400 si transition invalide ».
- **Attendu** :
  - réserver `resolution_notes` et `assigned_to` au propriétaire ;
  - documenter la matrice ;
  - autoriser in_review → closed.
- Le frontend ne propose que les transitions acceptées.

### 89. 🟠 Un compte propriétaire qui loue aussi ne voit pas ses propres signalements

- `GET /signals` ne renvoie à un compte de rôle propriétaire que les signalements reçus sur ses biens.
- Un propriétaire qui est aussi locataire ailleurs (cas courant, et c'est le cas du compte de test) crée son signalement (201), puis ne le retrouve plus dans son espace locataire.
- **Attendu** : un paramètre `?as=author|landlord`, ou les deux côtés dans la réponse avec un champ qui les distingue.

### 90. 🟡 Pièces jointes de signalement

- **Multipart** : `POST /signals/:id/attachments` en multipart (champ `file`, `files`, `photo`…) répond 201 **sans rien ajouter**.
  - Seul un corps JSON `{ "attachments": [url] }` fonctionne. Le Swagger ne décrit aucun corps.
- **URL libres** : `POST /signals` et `POST /signals/:id/attachments` acceptent aussi des URL qui ne viennent pas de `POST /files`.
  - Attendu : n'accepter que des fichiers déposés via `POST /files`, par identifiant.
  - À revoir avec la réserve de sécurité déjà transmise sur le relais des photos d'état des lieux.
- **Droits** : le propriétaire peut ajouter des pièces à un signalement qu'il a reçu. C'est à confirmer comme règle produit.

### 91. 🟡 Messagerie : écarts divers

- **Messages `system`** : un utilisateur peut envoyer un message de type `system` (201). L'écran l'affiche comme un message de la plateforme, ce qui permet d'en imiter un. Attendu : type réservé au serveur.
- **Pagination** : la doc dit « oldest first ». En réalité, la page 1 contient les messages **les plus récents** (triés du plus ancien au plus récent dans la page) et la page 2 les précédents. C'est le bon comportement, mais la doc est trompeuse.
- **Messages en anglais** :
  - « Not a participant » / « Not a participant of this conversation » (403) ;
  - « Cannot create conversation with yourself » (400).
  - Traduits côté frontend.
- **Notifications** : « Message de Quelqu'un » quand l'expéditeur n'a pas de nom. Leur `metadata.url` pointe vers `/portal/messaging/:id`, qui n'existe pas dans l'application.
- **Réactions** : une seule par personne (en poser une autre remplace la précédente). Cela convient, mais n'est pas documenté.
- **Temps réel** : la passerelle WebSocket n'est pas utilisable derrière le relais du frontend. L'écran rafraîchit toutes les 7 s la conversation ouverte, toutes les 20 s la liste et toutes les 60 s le compteur. Un flux SSE ou un endpoint « depuis tel message » allégerait ce sondage.

### 92. 🟠 Une nouvelle conversation à chaque appel pour le même logement et le même destinataire

- `POST /messaging/conversations` ne renvoie la conversation existante que pour une même demande de logement (`rental_request_id`).
- Pour un logement et un destinataire donnés, chaque appel en crée une nouvelle. Sur le compte de test, deux conversations actives avec le même propriétaire sur le même logement.
- Chaque bouton « Écrire au propriétaire / au locataire » (visite, réservation, bail, file d'attente, signalement) en créait donc une de plus.
- **Attendu** : dédupliquer sur (logement, participants) quand la conversation est active.
- Le frontend réutilise maintenant la conversation active existante avant d'en créer une.

## Ajouts du Lot 56 — Espace public et liens avec les espaces

### 93. 🔴 Formulaire de contact inutilisable : 500 à chaque envoi

- **Rejoué** : `POST /contact` avec un corps valide (`name`, `email`, `subject`, `message`), anonyme ou connecté, avec ou sans sujet → **500** « Une erreur inattendue » après 5 à 7 s, à chaque essai (4 essais, marqués « [Test QA Lot 56] »).
- Les validations fonctionnent : corps vide ou e-mail invalide → 400 avec violations.
- La lenteur fait penser à un envoi d'e-mail qui échoue après l'enregistrement, comme #11. Sans accès administrateur, impossible de vérifier si les messages sont enregistrés (`GET /contact`).
- **Avant ce lot**, le frontend affichait « Message envoyé » (avec une référence inventée) sans appeler l'API. Il envoie maintenant pour de vrai : l'échec est affiché et le texte saisi est gardé.
- **Attendu** : 201, e-mail d'accusé de réception en tâche de fond (ou pas du tout), et `GET /contact` à vérifier côté administration.

### 94. 🟠 Vitrine vide alors que la recherche montre les annonces

- `GET /property/search` liste les logements quel que soit `is_publicly_listed` (#6) : 51 des 66 logements renvoyés ne sont pas « publiés ».
- `GET /public/owners/:userId`, lui, ne garde que les logements publiés. Sur les propriétaires présents dans la recherche, **seuls 2 ont une vitrine non vide**. La fiche d'un logement renvoie pourtant vers « Voir sa vitrine », qui affiche alors « Aucune annonce disponible ».
- **Vitrine d'un locataire** : `GET /public/owners/:id` répond aussi pour un compte locataire (nom, « vérifié », date d'inscription), qui n'a rien à montrer au public.
- **Attendu** : une seule règle de visibilité pour la recherche, la fiche et la vitrine ; 404 sur la vitrine d'un compte qui n'est ni propriétaire ni agence.

### 95. 🟠 Un logement loué reste « disponible »

- Le logement « Appart 4 » a un bail **actif** (entrée payée) depuis le Lot 55. Pourtant :
  - `unit_status` vaut toujours `available` dans `GET /property/search` et `GET /public/units/:id` ;
  - seules les disponibilités le bloquent, et à partir de la date de début seulement (`blocked_by: "lease"`).
- Le logement reste proposé comme libre dans la recherche publique, et sa fiche propose toujours de candidater : le bouton dépend de `unit_status`. L'acceptation d'une candidature par l'API sur ce logement n'a pas été rejouée.
- **Attendu** : `unit_status: occupied` à l'activation du bail (ou dès la signature), et retour à `available` à la fin du bail.

### 96. 🟡 Identifiant mal formé → 500

- `GET /property/pas-un-uuid`, `GET /reviews/property/pas-un-uuid` et `…/stats` → **500**.
- `GET /property/<uuid inexistant>` → 404 « Property not found », correct.
- **Attendu** : `ParseUUIDPipe` (400) ou 404, comme sur les autres modules.

### 97. 🟡 `ai-search` et `semantic-search` = recherche textuelle

- Pour « Cotonou », « appartement », « studio » ou un nom de bien, les trois routes renvoient exactement les mêmes totaux.
- Une phrase en langage naturel (« studio meublé Cotonou moins de 50000 », « studio calme proche université ») renvoie 0 résultat, alors que des studios meublés à Cotonou existent.
- Le frontend ne les utilise pas. **Attendu** : les brancher réellement, ou les retirer du Swagger.

### 98. 🟡 Statistiques avancées du propriétaire en 500

- `GET /property/landlord/stats/advanced` → 500, y compris pour un propriétaire qui a plusieurs biens et des baux actifs. Le Lot IP1 ne l'avait vu que sur un compte sans bien.
- Le tableau de bord pro se replie sur `/property/landlord/stats` : pas de comparaison, pas de top des biens, pas de note moyenne.

### 99. 🟡 Rôles incomplets, appels refusés

- **Rôle `tenant` absent** : un compte propriétaire qui loue un logement (baux signés en tant que locataire) a `roles: ["landlord"]` dans `GET /auth/roles`. Le rôle `tenant` n'est jamais ajouté.
  - Le frontend garde donc l'espace locataire ouvert à tous les comptes. Il réserve les espaces pro et artisan aux rôles concernés, avec bascule automatique quand le rôle existe sans être actif (#78).
- **Compteur de mandats** : `GET /agent-mandates/mine` répond 403 à tout compte qui n'est pas agent. L'espace pro l'appelle pour afficher le compteur de mandats. Attendu : `[]`.

### 100. 🟡 Adresse exacte publique, contrairement à la promesse faite aux propriétaires

- La page « Louer votre bien » promet : « l'adresse exacte reste masquée jusqu'à l'acceptation d'une visite ».
- Or `GET /property/:id` et `GET /public/properties/:id` renvoient, sans authentification, `address`, `gps_latitude` et `gps_longitude`.
- **Attendu** (décision produit) :
  - soit une adresse et un GPS approximatifs (quartier, point décalé) tant qu'aucune visite n'est acceptée ;
  - soit retirer la promesse de la page.


---

## Correctifs backend groupés (05-06/10/2026)

Suite à ce relevé, les corrections ont été implémentées directement dans `back-end-api-immo-app`, réparties en six lots par domaine (A wallet/paiement, B signalements/messagerie/contact/demandes, C baux/états des lieux/candidatures, D biens/recherche/public, E visites/réservations/artisans, F auth/onboarding/équipe), chacun sur sa propre branche puis fusionné sans conflit dans `fix/corrections-tests-front`.

**Résultat de l'intégration** (06/10/2026) :
- `npx tsc --noEmit` : 0 erreur.
- `npx jest --silent` (suite complète) : **258 suites / 2248 tests**, tous verts (référence de départ : 235 suites / 1904 tests).
- Script d'intégration maison contre l'API reconstruite localement (migrations incluses) : **46/46** vérifications passées, couvrant la faille d'élévation de privilèges, les 403/409/400 attendus, les montants wallet, et les corrections de contrat listées ci-dessous.

**Nouvelle faille découverte et corrigée dans ce lot** (jamais exposée en prod, voir ligne #101 du tableau) : le rôle choisi dans le brouillon d'onboarding (`POST /onboarding/draft { role }`) n'était pas validé — un appel direct avec `role: "admin"` puis `finalize` donnait un compte administrateur. Corrigé par une liste blanche de rôles + un `finalize` non rejouable.

### Changements de contrat d'API à connaître côté frontend

- `POST /onboarding/finalize` renvoie désormais aussi `token`, `refresh_token`, `active_role` (additif) ; peut répondre 409 si le profil est déjà complet.
- `POST /auth/switch-context` renvoie aussi `refresh_token` (additif) ; `switch-role` conserve `active_team_id`.
- `POST /team/invite` renvoie un champ `email_sent` (additif) ; un utilisateur déjà inscrit reçoit désormais un vrai lien `/invite/<token>` qu'il peut accepter.
- Nouvelles routes : `DELETE /team/invitations/:id`, `POST /team/memberships/:id/leave`, `DELETE /leases/:id` (brouillon), `PATCH /rental/requests/:id/withdraw`, `PATCH /wallet/withdrawals/:id/cancel`, `GET /units/:id/availability-blocks`, `GET /housing-requests/responses/mine`, `DELETE /property/:id/media/:mediaId`.
- `GET /agent-mandates/mine` : ne renvoie plus 403 à un non-agent (renvoie `[]`).
- Un logement **ne passe plus `OCCUPIED` à l'acceptation d'une candidature** : c'est désormais le paiement d'entrée du bail (activation) qui le fait. Un éventuel affichage frontend qui dépendait de l'ancien moment doit être revérifié.
- Un retrait Mobile Money est débité **à la demande**, plus à l'approbation (l'approbation ne fait que confirmer).
- `GET /payment/transactions/:id/status` accepte aussi un `gateway_ref` en plus de l'id, et se limite au wallet de l'appelant (un ancien appel inter-comptes recevra 404).
- Plusieurs routes acceptent désormais des 400/403/409 nouveaux là où elles répondaient 200/201/500 à tort (détail dans le tableau récapitulatif ci-dessus, colonne Sujet).

### Migrations SQL à appliquer manuellement en production (Render)

Dans cet ordre, avant le déploiement du code (ou juste après, elles sont idempotentes) :
1. `database/migrations/010_wallet_integrity_and_unit_occupied.sql` — répare les wallets déjà incohérents, pose 2 contraintes CHECK `NOT VALID` sur `wallets`, backfill `unit_status=occupied` pour les baux déjà actifs.
2. `database/migrations/012_artisan_request_retention_released_at.sql` — ajoute `artisan_requests.retention_released_at`.
3. `database/migrations/013_team_invitation_member_link.sql` — ajoute `team_invitations.member_id` (FK).

### Configuration à revoir (hors code)

- **#1** : aucun fournisseur d'email n'est configuré en production (Resend/SMTP) — le code est corrigé mais reste inactif sans ces clés.
- **#2** : `ALLOW_OTP_BYPASS` est toujours actif en production (un avertissement s'affiche désormais au démarrage) — à désactiver volontairement quand les tests OTP ne seront plus nécessaires, sachant que cela retire le contournement de test.

### Restant ouvert (ni corrigé, ni décision produit documentée)

`#59` (fin de bail non automatique), `#65` (pas de `GET /leases/:id`), `#72` (PDF d'état des lieux sans photos/comparaison), `#76` (mandat sans accès réel), `#81` (intervention sans lien au signalement d'origine), et la première moitié de `#99` (rôle `tenant` absent pour un propriétaire qui loue, non retestée).
