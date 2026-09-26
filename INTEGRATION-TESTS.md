# Journal d'intégration API — Immo

Un test automatisé par correction, une section par lot livré. Lancer la suite complète :

```bash
npm test          # une passe
npm run test:watch # mode veille
```

Régénération des types depuis le Swagger live (source de vérité, jamais modifié à la main) :

```bash
npm run api:sync   # récupère swagger.json + régénère app/types/api.d.ts
npm run api:check  # même chose, échoue si le résultat diffère du fichier committé (à brancher en CI)
```

---

## Lot 1 — Socle (types, verrou de rafraîchissement, mapping d'erreurs, fichiers protégés)

**Date** : 2026-09-17
**Réf.** : `10-SOCLE-INTEGRATION.md`, points 1 à 3 de l'ordre de travail recommandé.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `swagger.json` | Spec OpenAPI récupérée en direct sur `https://immo-b89b.onrender.com/docs/v1-json` (257 routes, API "Immo Bénin API" v1.0) |
| `app/types/api.d.ts` | Types générés par `openapi-typescript` — **ne jamais éditer à la main**, régénérer via `npm run api:sync` |
| `nuxt.config.ts` | `runtimeConfig.public.apiBase` — `https://immo-b89b.onrender.com/v1/api` par défaut, surchargeable en local via `NUXT_PUBLIC_API_BASE` |
| `app/utils/refreshLock.ts` | Verrou de rafraîchissement — un seul appel `POST /auth/refresh` en vol, les requêtes concurrentes s'y abonnent |
| `app/utils/apiErrors.ts` | `mapApiError()` — mapping unique violations → champs, interception caution/tirelire, table par code HTTP |
| `app/utils/authenticatedFetcher.ts` | Orchestration 401 → `refreshOnce()` → un seul rejeu, jamais de boucle, jamais d'effacement de jetons depuis une requête secondaire |
| `app/utils/protectedFile.ts` | Récupération en blob d'un fichier protégé, avec repli d'erreur explicite |
| `app/utils/fetchState.ts` | Le type `FetchState` à 5 états + `deriveFetchState()`, distingue `empty` de `empty-filtered` |
| `app/composables/useApiAuth.ts` | Jetons en cookies SSR-safe, verrou partagé au niveau module (un seul par session, pas un par composant) |
| `app/composables/useApi.ts` | `get/post/patch/put/delete` authentifiés — point d'entrée unique pour les futurs composables d'endpoints |
| `app/composables/useProtectedFile.ts` | Cycle de vie complet d'une URL d'objet (création, libération au démontage, état d'échec) |

La logique métier (verrou, mapping d'erreurs, orchestration 401, fetch protégé) est écrite en fonctions pures avec injection de dépendances — testable sans contexte Nuxt. Les composables Nuxt (`useApiAuth`, `useApi`, `useProtectedFile`) ne font que le branchement (cookies, `$fetch`, cycle de vie Vue) par-dessus.

### Tests automatisés

Suite : `tests/*.test.ts` — Vitest, environnement `node`, aucune dépendance à un serveur Nuxt actif.

```
✓ tests/fetchState.test.ts (4 tests)
  ✓ un échec est toujours error, jamais empty — même sans données
  ✓ loading prime sur tout le reste
  ✓ distingue empty (aucune donnée) de empty-filtered (filtres actifs)
  ✓ des éléments présents donnent success

✓ tests/apiErrors.test.ts (8 tests)
  ✓ place chaque violation de validation sur son champ, en français, sans exposer defaultMessage
  ✓ retombe sur un message générique par règle si le couple champ+règle est inconnu
  ✓ affiche une bannière seulement pour les violations sans champ rattachable
  ✓ intercepte le dépassement du plafond de caution et prépare le rejeu avec depositAcknowledged
  ✓ reconnaît un message de solde insuffisant mentionnant la tirelire et le laisse passer tel quel
  ✓ 401 est neutre : c'est l'appelant (fetcher authentifié) qui décide de rafraîchir
  ✓ 403 précise le contexte d'équipe quand il est actif
  ✓ 404, 409, 429 et 5xx sont mappés avec un message affichable
  ✓ une panne réseau sans statut produit un état error exploitable, jamais empty

✓ tests/authenticatedFetcher.test.ts (5 tests)
  ✓ pose le Bearer courant sur une requête simple
  ✓ sur 401, rafraîchit une fois puis rejoue la requête avec le nouveau jeton
  ✓ n'efface les jetons que si le rafraîchissement lui-même échoue
  ✓ un second 401 après rafraîchissement ne relance pas de boucle et n'efface pas les jetons
  ✓ convertit une erreur de validation 400 en ApiRequestError avec fieldErrors exploitables

✓ tests/refreshLock.test.ts (4 tests)
  ✓ sérialise les appels concurrents en un seul rafraîchissement réel
  ✓ autorise un nouveau rafraîchissement après résolution du précédent
  ✓ libère le verrou même si le rafraîchissement échoue, sans le bloquer durablement
  ✓ un échec ne doit propager qu'aux abonnés de ce cycle, jamais silencieusement réussir

✓ tests/protectedFile.test.ts (4 tests)
  ✓ pose le Bearer et retourne le blob avec son content-type
  ✓ un 404 lève une ProtectedFileError exploitable plutôt qu'un emplacement vide silencieux
  ✓ une panne réseau (fetch qui rejette) lève aussi une ProtectedFileError, jamais un throw brut
  ✓ fonctionne sans jeton (n'envoie simplement pas d'en-tête Authorization)

Test Files  5 passed (5)
     Tests  26 passed (26)
```

### Vérification manuelle (hors suite automatisée)

- `npm run dev` démarre sans erreur ni avertissement après le câblage des trois composables dans l'arbre de pages existant.
- Page de fumée temporaire (`__api-smoke-test.vue`, supprimée après vérification) montée côté client sans erreur console : `useApiAuth()`, `useApi()` et `useProtectedFile()` s'instancient et exposent l'API attendue.
- `npx openapi-typescript swagger.json -o app/types/api.d.ts` regénère 18 993 lignes sans erreur à partir du Swagger live.

### Ce qui n'est PAS encore fait (volontairement, hors périmètre de ce lot)

- Aucun écran n'est câblé sur `useApi()` — le socle ne le doit pas, voir `10-SOCLE-INTEGRATION.md` : *« Les points 1 à 3 conditionnent tout le reste. Ne commence pas par les écrans. »*
- `useApiAuth` n'a pas encore de méthode `login`/`logout` métier — ce sera I1 (authentification), qui posera aussi la distinction 401 compte banni vs session expirée.
- Le contexte d'équipe (`useTeamContext`) existe comme état partagé mais n'est alimenté par aucun appel `switch-context` — bloqué sur la correction backend documentée au point 9 du socle (paire de jetons complète, `activeRole` conservé).
- `npm run api:check` n'est pas encore branché à une CI — commande prête, intégration à ajouter séparément.

### Prochaine étape proposée

Lot 2 du plan : **I1 — Authentification** (`11-INTEGRATION-AUTH-ET-PUBLIC.md`), qui consomme directement le socle livré ici (verrou de rafraîchissement, mapping d'erreurs). Dans la foulée, I3 (KYC) est presque gratuite : le module est déjà bien aligné côté API.

---

## Lot 2 — I1 Authentification

**Date** : 2026-09-17
**Réf.** : `11-INTEGRATION-AUTH-ET-PUBLIC.md`, I1.

### Découverte critique avant tout câblage : CORS

Premier appel réel tenté contre `https://immo-b89b.onrender.com` depuis le navigateur (pas `curl`, qui n'est pas soumis au CORS) : bloqué.

```
Access to fetch at 'https://immo-b89b.onrender.com/v1/api/auth/check-email?...'
from origin 'http://localhost:4173' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

`curl` direct vers le même endpoint réussit (`{"exists":false,"has_password":false}`, ~12,6 s de cold start Render la première fois) — confirmant que le serveur répond, seul le navigateur bloque faute d'en-tête CORS pour cette origine. Aucun des quatre documents fournis ne mentionne ce point ; en production, il faudra que le backend ajoute le domaine réel de ce front à son allowlist CORS.

**Solution retenue pour ce lot**, sans dépendre de cette correction : `server/api/proxy/[...path].ts`, un relais qui tourne dans le serveur Nuxt lui-même (Nitro) et transmet tel quel vers l'API réelle — serveur à serveur, donc pas de CORS. Le navigateur appelle `/api/proxy/**` (même origine). `nuxt.config.ts` sépare maintenant `apiBase` (serveur uniquement, l'URL réelle) de `public.apiProxyBase` (`/api/proxy`, ce que le navigateur appelle). Transparent pour tout le reste du code : `useApiAuth`, `useApi`, `usePublicApi` pointent simplement vers `apiProxyBase`.

### Bug trouvé dans le Lot 1 en vérifiant contre le Swagger réel

Le champ du jeton d'accès s'appelle **`token`**, pas `access_token`, sur `/auth/login`, `/auth/verify-otp`, `/auth/google`, `/auth/refresh` et `/auth/switch-role` — vérifié sur les exemples du Swagger live, jamais recopié de mémoire (exactement la mise en garde du socle §0). Le Lot 1 avait supposé `access_token` sans le vérifier puisque `useApiAuth` avait été écrit avant que le détail des endpoints d'auth ne soit consulté. Corrigé dans `useApiAuth.ts` avant tout autre câblage.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `server/api/proxy/[...path].ts` | Relais serveur transparent vers l'API réelle (contournement CORS) |
| `app/types/auth.ts` | Types écrits à la main à partir des `example` du Swagger (login, verify-otp, google, refresh, me, roles, switch-role…) — le Swagger ne documente pas ces réponses en schéma typé |
| `app/utils/sessionOutcome.ts` | `decideSessionOutcome()` — que faire une fois le profil résolu : `ok` / `restricted` / `banned` / `pending`, avec `isNewUser` transmis depuis verify-otp/google |
| `app/composables/usePublicApi.ts` | Appels sans jeton (check-email, login, request-otp, verify-otp, google, forgot-password, reset-password) — n'utilise jamais le rafraîchissement, un 401 ici est une réponse métier normale (mauvais mot de passe), pas un signal de session expirée |
| `app/composables/useAuthApi.ts` | Toutes les opérations d'I1 : `checkEmail`, `login`, `requestOtp`, `verifyOtp`, `loginWithGoogle`, `forgotPassword`, `resetPassword`, `setPassword`, `logout`, `fetchMe`, `fetchRoles`, `switchRole` |
| `app/plugins/auth.ts` | Hydrate l'utilisateur au démarrage si un jeton existe déjà (visiteur qui revient) |
| `app/pages/connexion.vue` | Réécrit : email → mot de passe **ou** code OTP (selon `has_password`) → session réelle → redirection par rôle. Mot de passe oublié avec code OTP **ou** code de récupération (`recovery_code`, jusqu'ici jamais câblé) |
| `app/components/layout/SiteHeader.vue` | Reflète l'état réel : nom/email du connecté, badge si compte `restricted`, vrai bouton de déconnexion |

Correctif appliqué en cours de route à `app/utils/authenticatedFetcher.ts` : un 401 qui persiste **après un rafraîchissement qui a lui-même réussi** est maintenant traité comme signature d'un compte suspendu (I1 point 2 : `rotateRefreshToken()` ne vérifie pas le statut du compte côté serveur, donc le rafraîchissement d'un compte banni réussit quand même) — jetons effacés, message distinct d'une session simplement expirée. Le test du Lot 1 qui affirmait le contraire a été révisé en conséquence, avec l'explication en commentaire.

### Tests automatisés

```
✓ tests/sessionOutcome.test.ts (5 tests)
  ✓ un utilisateur actif est accepté tel quel
  ✓ un compte banni est rejeté avec un message distinct d'une session expirée
  ✓ un compte restreint est laissé passer mais signalé à l'appelant
  ✓ GET /auth/me en 404 (compte tout juste créé) donne "pending", pas une erreur
  ✓ transmet isNewUser (venu de verify-otp/google, jamais de /auth/me) à l'appelant

✓ tests/authenticatedFetcher.test.ts — 2 tests ajoutés/révisés
  ✓ un second 401 après rafraîchissement ne relance jamais de boucle (un seul rejeu, quoi qu'il arrive)
  ✓ un 401 persistant après un rafraîchissement réussi est traité comme un compte suspendu, pas une session juste expirée

Test Files  6 passed (6)
     Tests  32 passed (32)   [26 du Lot 1 + 6 nouveaux/révisés]
```

### Vérification manuelle contre l'API live (pas seulement des mocks)

Testé pour de vrai contre `https://immo-b89b.onrender.com`, à travers le relais, en pilotant la page `/connexion` avec Playwright :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `checkEmail` sur un email connu de l'exemple Swagger | `{"exists":false,"has_password":false}` (pas de compte réel sur cette instance) | Bascule vers le flux OTP, comme prévu pour un compte inconnu |
| `login` avec mauvais mot de passe | 401 `{"message":"Email ou mot de passe incorrect."}` | Erreur affichée en français sous le champ, **aucun rafraîchissement de jeton déclenché** (confirme que `usePublicApi` ne passe pas par le fetcher authentifié) |
| `requestOtp` sur un email inconnu | `{"success":false,"sent_channels":[]}` | Pas de crash, transition normale vers l'écran de saisie du code |
| Saisie d'un code à 6 chiffres volontairement faux, via l'UI réelle (pas la console) | 400/404 réel de `verify-otp` | « Code incorrect ou expiré. » affiché sous les cases, cases repassées en rouge — capture d'écran à l'appui |
| Menu compte, utilisateur non connecté | — | Avatar « I » (Invité), lien « Se connecter ou s'inscrire » |
| Menu compte, utilisateur authentifié (état injecté pour isoler l'affichage, jetons/API déjà prouvés séparément) | — | Nom, email, badge « Compte restreint » si `status === 'restricted'`, bouton « Se déconnecter » |

**Mise à jour du 2026-09-17** : l'instance a un code OTP maître (`000000`, communiqué par l'utilisateur) qui contourne l'envoi d'email — ça débloque le test de bout en bout qui manquait ci-dessus. Refait entièrement contre l'API live, sans rien mocker :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| Compte tout juste créé (`is_new_user: true`) → code maître → `verify-otp` | 200, session établie | Redirigé vers l'étape « Créer votre compte » (complément de profil), pas vers l'espace connecté — conforme à `isNewUser` |
| Même email, seconde connexion (`is_new_user: false`) → code maître → `verify-otp` | 200, session établie, `role: "tenant"` | Redirigé directement vers `/locataire`, tableau de bord affiché, aucune erreur console |
| Déconnexion depuis l'espace locataire connecté | `POST /auth/logout` → 200 | Cookie `immo_access_token` bien absent après coup, retour sur `/` |

**Motif systématique observé, deux fois sur deux** : juste après `verify-otp`, le tout premier `GET /auth/me` avec le jeton flambant neuf répond **401**, alors que le jeton vient d'être émis par le même appel. Le fetcher authentifié rafraîchit alors immédiatement (`POST /auth/refresh` → 200) et rejoue `/auth/me` avec le nouveau jeton, qui réussit. Complètement invisible pour l'utilisateur — c'est exactement le scénario que le verrou de rafraîchissement du socle est censé absorber — mais ça ajoute un aller-retour réseau inutile à **chaque** connexion. À signaler au backend : sent comme un problème de propagation/décalage d'horloge sur le jeton fraîchement émis, pas un bug côté front.

**Gap réel trouvé en testant** : aucun des trois espaces connectés (Locataire/Pro/Artisan) n'avait de moyen de se déconnecter — seul le header public en avait un. Corrigé : nouveau composant `app/components/layout/AccountMenu.vue` (avatar cliquable + « Se déconnecter »), branché dans les trois `layouts/{locataire,pro,artisan}.vue`. Testé en conditions réelles dans le tableau ci-dessus (ligne « Déconnexion »).

### Ce qui n'est PAS fait, et pourquoi

- **Google (`POST /auth/google`)** : composable prêt (`loginWithGoogle(firebaseToken)`), mais le bouton reste désactivé dans l'UI. Nécessite la configuration Firebase Web SDK du projet (apiKey, authDomain…) que je n'ai pas — à demander à l'équipe, pas un travail d'intégration API en soi.
- **`setPassword` (créer un mot de passe pour un compte OTP-only)** : composable prêt, mais sa place naturelle est une section « Sécurité » du profil (IL8), qui n'existe pas encore. Pas ajouté à `/connexion` pour ne pas dénaturer cette page.
- **Sélection de rôle à l'étape signup** : reste locale (`useAuthRole`), non persistée côté API. Aucun endpoint d'I1 n'accepte de rôle à la création de compte ; le point d'entrée documenté (`/onboarding/draft`) est signalé comme buggé (refuse `role:'artisan'`) et n'est de toute façon pas dans le périmètre d'I1.
- **`fetchRoles` / `switchRole`** : composables prêts, aucune UI de sélecteur multi-rôle construite — non demandé pour ce lot.
- **`restricted` non bloquant** : conforme au socle (laisser passer, juste signaler) — mais le cron qui pose ce statut après 6 mois d'inactivité n'est lu nulle part ailleurs dans le produit ; reste un point à trancher côté backend/produit, pas un bug front.

### Demandes backend à ajouter à la liste du Lot 1

1. **CORS** : ajouter l'origine du front déployé à l'allowlist. Non bloquant grâce au relais Nuxt, mais le relais est un contournement, pas la solution finale.
2. `rotateRefreshToken()` doit vérifier le statut du compte — déjà documenté en I1, confirmé nécessaire en pratique puisque c'est la seule vraie source de vérité une fois qu'un jeton a été émis pendant une session déjà ouverte.
3. `/onboarding/draft` refuse `role: 'artisan'` (I1 point 6, non revérifié en direct dans ce lot — hors périmètre des endpoints I1).
4. `ifu`/`rccm` absents de `/auth/me`, exposés sur `/profile/me` sous des noms non conformes au Swagger (I1 point 6).
5. **Nouveau** : le tout premier `GET /auth/me` après un `verify-otp` réussi répond systématiquement 401 (observé deux fois sur deux, jeton fraîchement émis par le même appel). Absorbé par le rafraîchissement automatique donc invisible pour l'utilisateur, mais double le nombre de requêtes à chaque connexion — à investiguer côté backend (délai de propagation du jeton ? décalage d'horloge entre instances ?).

### Prochaine étape proposée

I3 — Vérification d'identité (KYC), le module le mieux aligné selon la doc : un seul écart connu (type `employment_certificate` manquant côté front). Le composable de fichier protégé du socle s'y branche directement pour l'affichage des documents déposés.

---

## Lot 3 — I3 Vérification d'identité (KYC)

**Date** : 2026-09-17
**Réf.** : `11-INTEGRATION-AUTH-ET-PUBLIC.md`, I3.

### Découverte avant câblage, en vérifiant le Swagger réel

L'écart documenté (« l'union de types front en compte six, sans `employment_certificate` ») n'existe déjà plus côté API : l'énumération `document_type` sur le Swagger live en compte **huit** —`title_deed`, `rccm_certificate`, `proof_of_address`, `payslip`, `artisan_insurance`, `artisan_certification`, `employment_certificate`, `guarantor_id`. Il ne restait qu'à aligner le front dessus, ce qui est fait dans `app/types/kyc.ts`.

**Écart réel trouvé, non documenté** : `GET /kyc/documents/mine` et la réponse de `POST /kyc/documents` ne renvoient que `{ id, document_type, created_at }` — ni statut de validation par document, ni nom de fichier original, ni extension. L'ancienne page `/kyc` (construite en mock avant l'intégration) affichait des badges « Validé / En cours / Illisible » par document et un nom de fichier réaliste : purement inventés, aucun champ de l'API ne les porte. Remplacés par un bandeau de statut unique au niveau du compte, dérivé du vrai `profile.kyc_status` de `/auth/me` (`verified` / `pending` / `in_review` / `rejected` / absent), et chaque document n'affiche plus que son type et sa date réelle de dépôt.

### Le vrai défi technique de ce lot : le multipart à travers le relais CORS

`POST /kyc/documents` prend un `multipart/form-data` (fichier + `document_type`). Le relais du Lot 2 (`server/api/proxy/[...path].ts`) construisait son corps à la main via `readBody()` + `$fetch({ body })` — correct pour du JSON, mais `readBody()` de h3 ne préserve pas la frontière (`boundary`) d'un multipart, donc un envoi de fichier à travers ce relais aurait échoué silencieusement ou corrompu le fichier.

**Corrigé avant même d'essayer** : réécrit avec `proxyRequest()` de h3, le helper de relais transparent prévu pour exactement ce cas — il lit le corps brut en `Buffer` (`readRawBody(event, false)`, la même fonction que `readMultipartFormData` utilise en interne), transmet tous les en-têtes entrants tels quels (`Authorization` compris, plus besoin de l'extraire à la main), et relaie la réponse cible — statut, en-têtes, corps — sans transformation. Le relais entier est passé de 30 lignes de logique JSON à la main à une seule ligne d'appel à `proxyRequest`, plus robuste et plus court.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `server/api/proxy/[...path].ts` | Réécrit avec `proxyRequest()` de h3 — relais transparent, gère maintenant le multipart correctement |
| `app/types/kyc.ts` | `KycDocumentType` (8 valeurs), `KycDocument`, `KYC_DOCUMENT_TYPE_LABELS` |
| `app/utils/kycStatus.ts` | `deriveKycStatusBanner()` — pure, dérive le bandeau de statut à partir de `kyc_status` |
| `app/composables/useKycApi.ts` | `listMine`, `upload` (multipart), `remove`, `downloadUrl` (pour `useProtectedFile` du socle) |
| `app/pages/kyc.vue` | Onglet Documents entièrement réel : liste, dépôt, suppression, aperçu en blob. Onglet Identité : bandeau de statut réel, capture de pièce d'identité laissée en mock (aucun endpoint documenté pour ça dans I3) |

### Tests automatisés

```
✓ tests/kycStatus.test.ts (4 tests)
  ✓ affiche une confirmation verte pour un statut vérifié
  ✓ traite pending et in_review comme "en cours"
  ✓ signale un rejet distinctement, avec une invitation à redéposer
  ✓ retombe sur un état neutre pour une valeur absente ou inconnue, jamais une erreur

Test Files  7 passed (7)
     Tests  36 passed (36)   [32 des lots précédents + 4 nouveaux]
```

### Vérification manuelle contre l'API live — cycle complet, les 4 endpoints

Connecté avec le compte de test du Lot 2 (code maître), puis piloté `/kyc` avec Playwright, sans rien mocker :

| Endpoint | Résultat réel | Comportement observé |
|---|---|---|
| `GET /kyc/documents/mine` | 200, liste vide au départ | État vide affiché : « Aucun document déposé pour l'instant. » |
| `POST /kyc/documents` (fichier PNG réel, `document_type: proof_of_address`) | **201** | Document apparaît dans la liste juste après, avec le vrai libellé « Justificatif de domicile » et la vraie date du jour formatée en français |
| `GET /kyc/documents/:id/download` | 200, corps binaire | Récupéré en blob via `useProtectedFile`, ouvert dans un nouvel onglet (`blob:http://localhost:4173/...`) — aperçu réel du fichier déposé |
| `DELETE /kyc/documents/:id` | 200 `{"success":true}` | Document retiré de la liste, retour à l'état vide, zéro erreur console |

Le bandeau de statut affichait « Vos documents sont en cours de vérification » (`kyc_status: "pending"` ou `"in_review"` réel sur ce compte) — confirmant que la lecture de `profile.kyc_status` depuis `/auth/me` fonctionne en conditions réelles, pas seulement dans les tests unitaires de `deriveKycStatusBanner`.

### Ce qui n'est PAS fait, et pourquoi

- **Capture de pièce d'identité (onglet Identité)** : aucun des 4 endpoints I3 ne couvre ça — reste un mock, avec une note explicite dans l'UI pour ne pas laisser croire que c'est branché.
- **Coordonnées Mobile Money (onglet Coordonnées)** : dépend de `/profile/me`, module IL8/IP-profil, pas I3 — laissé en mock avec la même note.
- **`GET /kyc/documents/user/{userId}`** (consultation par un tiers, admin/agent) et **`POST /user/{id}/kyc`** (action de revue) existent sur le Swagger mais ne sont pas dans la liste des 4 endpoints d'I3 — non câblés, hors périmètre de ce lot.

### Prochaine étape proposée

D'après l'ordre de travail du socle (« Espace locataire, puis professionnel, puis artisan, puis public »), la suite logique est **IL1 — Tableau de bord locataire**, qui consomme le paquet `Promise.allSettled` documenté dans le socle et s'appuie directement sur le contexte d'authentification maintenant réel (Lot 2).

---

## Lot 4 — IL1 Tableau de bord et centre d'actions (locataire)

**Date** : 2026-09-17
**Réf.** : `12-INTEGRATION-LOCATAIRE.md`, IL1.

### Ce que la doc corrige n'existe pas dans ce projet — construit directement correct

La doc décrit un front existant qui appelle `Promise.all([fetchMyLeases(), fetchSignature(), fetchMyRequests(), fetchMyBookings(), fetchMyWaitlist()])` et demande de passer en `Promise.allSettled`. Ce projet n'avait aucun appel réel avant ce lot (page 100 % mock) : construit directement avec `Promise.allSettled` et un état par bloc, sans étape de « correction » intermédiaire.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/tenant.ts` | Types des 6 endpoints du tableau de bord, écrits à la main à partir des exemples Swagger — montants en chaînes, `LeaseStatus` à 5 valeurs (pas de `expired`, voir IL2) |
| `app/composables/useLeasesApi.ts`, `useBookingsApi.ts`, `useHousingRequestsApi.ts`, `useWaitlistApi.ts`, `useSignalsApi.ts`, `useNotificationsApi.ts` | Un composable par domaine — volontairement minces dans ce lot (juste `fetchMine`/`list`), à étoffer dans les lots dédiés (IL2, IL5, IL6, IL7) plutôt que de tout construire d'un coup |
| `app/composables/useFetchBlock.ts` | Nouveau — un bloc = une source + son état à 5 valeurs. Réutilisable pour tous les futurs tableaux de bord (IP1, IA1) |
| `app/utils/tenantDashboard.ts` | Logique pure et testable : `findLateLeaseInvoice`, `buildNextSteps`, `buildActivityFeed` |
| `app/pages/locataire/index.vue` | Entièrement réel : 6 appels en `Promise.allSettled`, chaque carte affiche son propre état (chargement / erreur avec réessai / vide / rempli) |

Le wallet (carte « Mon wallet ») reste volontairement en mock — ses endpoints (`GET /wallet/me` etc.) sont IL4, un lot distinct.

### Tests automatisés

```
✓ tests/tenantDashboard.test.ts (13 tests)
  findLateLeaseInvoice
    ✓ trouve une facture impayée et échue
    ✓ ignore une facture payée même si sa date est passée
    ✓ ignore une facture impayée mais pas encore échue
    ✓ retourne null sans bail
  buildNextSteps
    ✓ propose de signer un bail en attente de signature
    ✓ propose de payer l'entrée pour un bail signé mais pas encore actif (pas de doublon avec "actif")
    ✓ ne propose rien pour un bail déjà actif
    ✓ propose de payer une réservation en attente de paiement
    ✓ signale une place de liste d'attente disponible seulement si notified_at est posé
    ✓ signale les réponses reçues à une demande de logement ouverte
    ✓ cumule les étapes de plusieurs sources
  buildActivityFeed
    ✓ fusionne signalements et notifications triés du plus récent au plus ancien
    ✓ utilise le repli de localisation plutôt que d'afficher un objet brut
    ✓ tronque à la limite demandée

Test Files  8 passed (8)
     Tests  50 passed (50)   [36 des lots précédents + 14 nouveaux]
```

### Vérification manuelle contre l'API live

Connecté avec le compte de test du Lot 2, tableau de bord chargé en conditions réelles :

```
GET /leases/my              → 200
GET /bookings/mine          → 200
GET /housing-requests/my    → 200
GET /units/waitlist/mine    → 200
GET /notifications          → 200
GET /signals                → 200
```

Les 6 appels partent en parallèle dès le montage et réussissent tous au premier essai. Ce compte de test n'a ni bail, ni réservation, ni signalement — le tableau de bord affiche donc des états vides honnêtes partout (« Aucun bail pour l'instant. », « Rien de particulier à faire pour l'instant. », « Aucune activité récente. ») plutôt que les fausses données que le mock précédent aurait montrées (un bail « Unité A2 » en retard, une activité fictive). C'est exactement la différence que ce chantier d'intégration est censé faire : remplacer des données inventées par la vérité du compte connecté, même quand cette vérité est « rien ».

Zéro erreur console (le seul message réseau visible est le 401 transitoire déjà documenté au Lot 2, absorbé par le rafraîchissement automatique).

### Ce qui n'est PAS fait, et pourquoi

- **Wallet** (`GET /wallet/me`) : hors périmètre IL1, reste mock jusqu'à IL4.
- **États des lieux** (« Signer l'état des lieux ») : la carte « Prochaines étapes » du mock original proposait ça, mais aucun endpoint EDL n'est dans la liste des 6 d'IL1 (c'est IL3, un lot distinct) — je n'ai pas inventé cette action, elle disparaît tant qu'IL3 n'est pas câblé sur ce tableau de bord.
- **Compteurs de la barre latérale** (badges « 1 » sur Signalements, « 2 » sur Messages dans les captures) : toujours des valeurs mock de `useTenantSpace.ts`, pas connectés aux vrais compteurs — la barre latérale elle-même est hors périmètre de ce lot.

### Prochaine étape proposée

IL2 — Bail : le statut à 5 valeurs et la distinction `signed` vs `active` sont déjà posés dans `app/types/tenant.ts` et `buildNextSteps()` ; IL2 branche l'écran `/locataire/bail` lui-même (PDF, tampons, paiement d'entrée, préavis) sur ces mêmes fondations.

---

## Lot 5 — IL2 Bail

**Date** : 2026-09-17
**Réf.** : `12-INTEGRATION-LOCATAIRE.md`, IL2.

### Ce qui a changé de fond : un état de bail partagé, plus une source par écran

Avant ce lot, le sélecteur de logement de la sidebar (`layouts/locataire.vue`) et le tableau de bord (Lot 4) lisaient chacun leur propre source de baux — la sidebar sur le mock `useTenantSpace`, le tableau de bord sur son propre `useFetchBlock`. Wiring IL2 sur `/locataire/bail` aurait ajouté une **troisième** source indépendante pour le même bail actif, avec le risque classique de désynchronisation (signer un bail sur `/bail` sans que la sidebar ou le tableau de bord ne le sache).

**Corrigé avant d'écrire l'écran lui-même** : `app/composables/useTenantLeases.ts`, un état partagé (`useState`) pour la liste des baux et le bail actif sélectionné, avec un verrou anti-double-fetch (même principe que le verrou de rafraîchissement du socle : la sidebar et la page appellent chacune `ensureLoaded()` à leur montage, un seul appel réseau part). La sidebar et le tableau de bord ont été migrés vers cette source unique.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/tenant.ts` | Étendu : `LeaseSignResult`, `EntryPaymentResult`, `NoticeResult`, `AutoDebitResult`, `AdvanceBufferStatus`, `PrepaidBufferStatus`, `BufferTopUpResult` |
| `app/composables/useTenantLeases.ts` | Nouveau — état de bail partagé, verrouillé contre le double-fetch |
| `app/composables/useLeasesApi.ts` | Étendu : `sign`, `payEntry`, `setAutoDebit`, `giveNotice`, `cancelNotice`, `fetchAdvanceBuffer`, `fetchPrepaidBuffer`, `topUpAdvanceBuffer`, `topUpPrepaidBuffer` |
| `app/utils/pdfJob.ts` | Nouveau — `pollPdfJob()`, le motif borné à 20s du socle §6, pur et testable (horloge injectée) |
| `app/composables/usePdfDocument.ts` | Nouveau — tente le PDF, retombe sur l'aperçu HTML si la route le propose. Réutilisable tel quel pour la quittance (déjà fait ici), le reçu de séjour (IL5) et la facture d'artisan (IA1) |
| `app/components/tenant/SignLeaseModal.vue` | Nouveau — signer le bail (`PATCH /leases/:id/sign`). N'existait pas : la modale `TenantSignerModal` déjà en place sert à signer l'état des lieux, pas le bail |
| `app/components/tenant/AlimenterModal.vue` | Réécrit — gère les deux tampons (avance et prépayé) réels au lieu d'un seul tampon fictif |
| `app/components/tenant/PreavisModal.vue` | Réécrit — `give-notice` réel ; la date de fin affichée vient de la réponse serveur, plus une valeur inventée |
| `app/layouts/locataire.vue` | Sélecteur de logement migré sur `useTenantLeases()` |
| `app/pages/locataire/index.vue` | Migré sur `useTenantLeases()` au lieu de son propre fetch de baux (Lot 4) |
| `app/pages/locataire/bail.vue` | Entièrement réel : stepper à 4 étapes réelles, tampons, paiement d'entrée, prélèvement automatique, échéancier, contrat + quittances en PDF, préavis/annulation |

### Un champ retiré parce que l'API ne le porte pas

Le formulaire de préavis du mock avait un champ « Motif (facultatif) ». Le schéma de requête de `POST /leases/:id/give-notice` sur le Swagger live est vide — aucune propriété acceptée. Retiré plutôt que gardé comme s'il servait à quelque chose : un champ de formulaire qui ne va nulle part est une fausse promesse à l'utilisateur.

### Tests automatisés

```
✓ tests/pdfJob.test.ts (5 tests)
  ✓ retourne le job dès que le statut passe à ready, sans attendre les tentatives restantes
  ✓ retourne null immédiatement sur un statut failed, sans épuiser les tentatives
  ✓ respecte la borne de tentatives — jamais un sondage infini
  ✓ 20 tentatives de 1s par défaut — le plafond de 20 secondes documenté dans le socle
  ✓ une panne réseau pendant le sondage retombe sur null plutôt que de lever une exception

Test Files  9 passed (9)
     Tests  55 passed (55)   [50 des lots précédents + 5 nouveaux]
```

L'horloge (`sleep`) est injectée dans `pollPdfJob()` précisément pour que ces tests s'exécutent en millisecondes plutôt que d'attendre 20 secondes réelles à chaque passage de la suite.

### Vérification manuelle contre l'API live

Le compte de test n'a aucun bail sur cette instance (confirmé au Lot 4) — impossible d'en créer un moi-même, ça suppose une action côté propriétaire (`POST /leases`, IP4, un lot professionnel pas encore fait). Vérifié ce qui l'est dans ces conditions :

```
GET /leases/my → 200, tableau vide
```

- `/locataire/bail` affiche l'état vide honnête (« Aucun bail pour l'instant. »), pas de plantage, pas de sélecteur de logement affiché (correctement caché sous 2 baux).
- Navigation croisée tableau de bord → bail → wallet → demandes → profil sans régression, zéro erreur console au-delà du 401 transitoire déjà documenté.
- L'état partagé fonctionne : un seul appel `GET /leases/my` déclenché malgré les deux `onMounted` (sidebar + page).

**Ce qui n'a pas pu être testé en conditions réelles**, faute de bail existant : signature, paiement d'entrée, tampons, prélèvement automatique, aperçu du contrat, quittance, préavis. Chaque flux a été relu attentivement contre les schémas de requête/réponse exacts du Swagger (voir le tableau de la section suivante) mais reste à revérifier dès qu'un bail réel existe sur l'instance — soit via IP4, soit via un compte de test fourni avec un bail déjà créé.

### Ce qui n'est PAS fait, et pourquoi

- **`PATCH /leases/:id/terminate`** : hors périmètre IL2 (action propriétaire, IP4). Le point produit signalé dans la doc — aucune restitution de caution ni des tampons nulle part dans l'API — reste vrai et n'est pas un manque du front à combler.
- **`PATCH /leases/:id/cancel-unpaid`**, **`/send`** : actions propriétaire, IP4.
- **Le solde du wallet affiché reste le mock d'IL4.** `entry-payment` et les deux `top-up` débitent réellement le wallet côté serveur, mais l'écran Wallet (`/locataire/wallet`) n'est pas encore câblé sur `GET /wallet/me` — la carte « Mon wallet » du tableau de bord ne reflétera pas ces mouvements tant qu'IL4 n'est pas fait. C'est une conséquence assumée de l'ordre des lots, pas un oubli : l'action elle-même (et son succès/échec réel) est ce qui compte pour IL2.

### Prochaine étape proposée

IL4 — Wallet et paiements, qui referme la boucle laissée ouverte ci-dessus (le wallet mock affiché à côté d'actions IL2 qui le débitent réellement) et corrige au passage deux régressions de production documentées (widget Kkiapay mort, retour FedaPay sur un 404).

---

## Lot 6 — IL4 Wallet et paiements

**Date** : 2026-09-17
**Réf.** : `12-INTEGRATION-LOCATAIRE.md`, IL4.

### Ce qui a changé de fond : un état de wallet partagé, sur le même modèle que les baux (Lot 5)

Même risque de désynchronisation que pour les baux : le tableau de bord (carte « Mon wallet ») et l'écran `/locataire/wallet` liraient chacun leur propre source. `app/composables/useTenantWallet.ts` reprend exactement le patron `useTenantLeases()` du Lot 5 — état partagé via `useState`, verrou anti-double-fetch au niveau module — pour que les deux écrans affichent toujours le même solde sans dupliquer l'appel `GET /wallet/me`.

### Deux soldes qui ne bougent pas ensemble

`balance_total` (« Solde disponible ») et `balance_savings` (« Tirelire ») sont deux montants indépendants côté API : une recharge crédite les deux, un revenu locatif ne crédite que `balance_total`, les paiements de logement (entrée, tampons, loyer) ne débitent que `balance_savings`. Affiché comme deux cartes distinctes plutôt qu'un solde unique, avec l'explication en toutes lettres sur `/locataire/wallet` — le mock précédent n'avait qu'un seul solde fictif.

### Le contrat de paiement : ne jamais piloter l'UI sur `gateway`

`POST /payment/checkout` renvoie `{ mode, gateway, transactionId, sandbox, instructions, ... }`. Consigne du doc, respectée dans tout `PaymentModal.vue` : seul `mode` (`widget` | `redirect` | `ussd_push` | `mock`) pilote le rendu et le comportement ; `gateway` n'est jamais lu pour décider quoi que ce soit, seulement retransmis à `verify-return`. `sandbox` est lu depuis la réponse, jamais déduit du `mode`.

### Découverte en testant en direct (sandbox FedaPay réelle) : le `transactionId` du mode `redirect` n'est pas notre id interne

Le plan initial faisait sonder `GET /payment/transactions/:id/status` avec le `transactionId` renvoyé par `checkout()`, de la même façon pour les trois modes actifs (`ussd_push`, `redirect`, `mock`) — c'est ce que demande IL4 point 2 (« lance le même sondage que ussd_push sur le mode redirect »).

En testant pour de vrai contre la sandbox FedaPay (recharge de 50 000 FCFA, passerelle FedaPay) :

```
POST /payment/checkout          → 201, mode: "redirect", transactionId: "509458", url: https://sandbox-process.fedapay.com/...
[window.open(url) — vraie page FedaPay sandbox ouverte dans un nouvel onglet]
GET /payment/transactions/509458/status → 404
```

Le `transactionId` renvoyé pour ce mode est l'identifiant de FedaPay lui-même (un entier court, pas un UUID), pas notre identifiant de transaction interne — `/payment/transactions/:id/status` (documenté « par ID interne ») ne le reconnaît donc pas. C'est cohérent avec `usePaymentApi.ts` qui note déjà, dans son commentaire d'origine, que `verifyReturn()` attend « jamais un UUID interne de transaction wallet » : les deux endpoints n'habitent pas le même espace d'identifiants pour ce mode.

**Corrigé dans `PaymentModal.vue`** : le mode `redirect` ouvre l'onglet FedaPay puis **n'appelle plus** `pollTransactionStatus` (qui échouerait systématiquement sur ce 404). À la place, un écran affiche « Finalisez le paiement dans l'onglet ouvert » avec un bouton « J'ai terminé le paiement », qui recharge simplement le wallet réel et referme la modale — honnête plutôt qu'un faux succès ou une fausse erreur basée sur un identifiant qu'on sait invalide pour cette route. Les modes `ussd_push` et `mock` gardent le sondage borné : leurs exemples Swagger confirment un `transactionId` au format UUID, cohérent avec notre id interne.

Deuxième découverte au même endroit : `instructions.fr` renvoyé pour le mode `redirect` est un texte à destination d'un développeur (« Redirigez l'utilisateur vers `url` — il revient ensuite sur `/payment/return`. »), pas une consigne pour l'utilisateur final. La première version de l'écran l'affichait tel quel sous le titre. Corrigé : ce champ n'est plus affiché que pour les modes où son contenu est réellement une instruction utilisateur (`ussd_push`, `mock` — ex. « Composez ce code sur votre téléphone »).

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/wallet.ts` | `WalletSummary`, `WalletStats`, `WalletTransaction`/`Page`, `PayRentResult`, `PaymentGateway`, `CheckoutResult` (union discriminée sur `mode`), `VerifyReturnResult`, `TransactionStatus` |
| `app/utils/transactionLabels.ts` | `transactionTypeLabel()` — 8 valeurs de `type` couvertes (5 déclarées au Swagger + 3 réelles non documentées : `lease_entry_payment`, `short_stay_booking_payment`, `artisan_intervention_payment`), repli humanisé plutôt que du snake_case brut |
| `app/utils/paymentPolling.ts` | `pollTransactionStatus()` — sondage borné (30×4s), tolère les pannes réseau transitoires, distingue `completed`/`failed`/`timeout`/`cancelled` (jamais dire à l'utilisateur de réessayer un paiement peut-être déjà débité) |
| `app/composables/useWalletApi.ts`, `usePaymentApi.ts` | Surface complète wallet + paiement |
| `app/composables/useTenantWallet.ts` | État de wallet partagé, verrouillé contre le double-fetch — même patron que `useTenantLeases()` |
| `app/components/tenant/PaymentModal.vue` | Réécrit — deux flux indépendants : `loyer` (débit direct de la tirelire, pas de passerelle) et `recharge` (passerelle réelle, branchement complet sur `mode`) |
| `app/pages/locataire/wallet.vue` | Réécrit — deux vrais soldes, historique réel avec recherche/filtre, encart de caution dynamique (montant du bail actif, jamais une valeur en dur, masqué si aucun bail signé/actif) |
| `app/pages/locataire/index.vue` | Carte « Mon wallet » migrée sur `useTenantWallet()` |
| `app/pages/payment/return.vue` | Nouveau — cible du retour FedaPay (`/payment/return?gateway=fedapay`), qui atterrissait sur un 404 avant ce lot. Essaie plusieurs noms de paramètre plausibles pour l'id de transaction (le nom exact posé par FedaPay dans l'URL de callback n'est pas vérifiable sans un vrai retour complet) |
| `app/composables/useTenantSpace.ts` | Le mock `useWallet()`, devenu orphelin, supprimé (plus aucun appelant) |

### Tests automatisés

```
✓ tests/transactionLabels.test.ts (3 tests)
  ✓ couvre les cinq types déclarés dans le schéma Swagger
  ✓ couvre les trois types réels absents du schéma (IL4 point 4)
  ✓ ne retombe jamais sur le snake_case brut pour un type totalement inconnu

✓ tests/paymentPolling.test.ts (5 tests)
  ✓ retourne completed dès que le statut y passe
  ✓ distingue failed (le serveur le dit) de timeout (on ne sait pas)
  ✓ une panne réseau ponctuelle ne fait pas échouer le sondage — il continue
  ✓ 30 tentatives de 4s par défaut — le plafond documenté pour ussd_push
  ✓ s'arrête proprement si isCancelled devient vrai — nettoyage au démontage

Test Files  11 passed (11)
     Tests  63 passed (63)   [55 des lots précédents + 8 nouveaux]
```

### Vérification manuelle contre l'API live

Connecté avec le compte de test des lots précédents (code maître), `/locataire/wallet` et la modale de recharge pilotés avec Playwright, sans rien mocker :

| Endpoint / scénario | Résultat réel | Comportement observé |
|---|---|---|
| `GET /wallet/me` | 200 | Deux soldes réels affichés (0 F / 0 F sur ce compte, pas de bail) |
| `GET /wallet/transactions?page=1&limit=50` | 200, liste vide | État vide honnête, recherche/filtre sans effet sur une liste vide |
| `GET /payment/gateways` | 200 | Liste de passerelles réelle chargée dans la modale, FedaPay pré-sélectionnée par défaut |
| `POST /payment/checkout` (FedaPay, 50 000 FCFA) | **201**, `mode: "redirect"`, url sandbox FedaPay réelle | `window.open()` déclenché avec la vraie URL — un onglet sandbox FedaPay s'ouvre réellement |
| `GET /payment/transactions/{transactionId}/status` (avant correctif) | **404** | Sondage abandonné en boucle sur un id invalide pour cette route — corrigé (voir section découverte ci-dessus) |
| Écran « Finalisez le paiement… » + bouton « J'ai terminé le paiement » (après correctif) | `GET /wallet/me` → 200 | Wallet rechargé, modale refermée proprement, zéro appel invalide, zéro erreur console |

Rejoué deux fois de bout en bout après le correctif (deux comptes/transactions distincts) : même comportement à chaque fois — `POST /payment/checkout` réussit, l'onglet FedaPay s'ouvre, la confirmation manuelle referme la modale et recharge un wallet réel.

**Ce qui n'a pas pu être testé en conditions réelles** : les modes `ussd_push` et `mock` (aucune passerelle de ce type disponible sur l'instance testée — seule FedaPay, en mode `redirect`, est apparue) ; le flux `payer un loyer` (`walletApi.payRent`, aucun bail actif sur le compte de test) ; le retour réel sur `/payment/return` (nécessite de compléter un paiement FedaPay jusqu'au bout, hors de portée d'un test automatisé sans carte réelle) ; le widget Kkiapay (`mode: "widget"`, aucune passerelle de ce type renvoyée par `/payment/gateways` sur cette instance).

### Ce qui n'est PAS fait, et pourquoi

- **Widget Kkiapay (`mode: 'widget'`)** : nécessite le SDK JavaScript tiers de Kkiapay (script externe, popup, callback), pas chargé dans ce lot. Traitement identique au gap Google Sign-In du Lot 2 : message honnête (« Ce moyen de paiement n'est pas encore disponible ici. ») plutôt qu'un bouton qui ne fait rien.
- **Nom exact du paramètre de callback FedaPay sur `/payment/return`** : non vérifiable sans laisser un vrai paiement sandbox aller jusqu'au bout. `route.vue` essaie plusieurs noms plausibles (`transaction_id`, `transactionId`, `id`, `token`) et affiche un message explicite si aucun ne correspond, plutôt qu'un échec silencieux.
- **Sondage sur `/payment/transactions/:id/status` pour le mode `redirect`** : abandonné volontairement (voir découverte ci-dessus), remplacé par une confirmation manuelle. Si le backend expose un jour l'id interne dans la réponse de `checkout()` pour ce mode (ex. un champ distinct de `transactionId`), le sondage pourra être restauré pour `redirect` aussi.
- **Solde affiché sur le tableau de bord pendant IL2** : la boucle ouverte au Lot 5 (les actions de bail débitent réellement le wallet mais l'écran ne le reflétait pas) est maintenant fermée — `useTenantWallet()` est la même source partagée utilisée partout.

### Demande backend à ajouter à la liste

6. `GET /payment/transactions/:id/status` attend un id interne que `POST /payment/checkout` ne renvoie pas pour le mode `redirect` (`transactionId` y est l'id de la passerelle externe, ex. FedaPay) — confirmé en direct par un 404 systématique. Soit exposer l'id interne dans la réponse de `checkout()` pour ce mode, soit documenter explicitement que le sondage par statut ne s'applique qu'à `ussd_push`/`mock`.
7. `instructions.fr` renvoyé pour le mode `redirect` est rédigé pour un développeur (« Redirigez l'utilisateur vers `url`… ») plutôt que pour l'utilisateur final, contrairement aux autres modes — à corriger côté backend si ce champ est censé être affichable tel quel.

### Prochaine étape proposée

D'après l'ordre conseillé de `13-INTEGRATION-PRO-ET-ARTISAN.md`, la suite logique côté locataire est **IL5 — Réservations courte durée**, qui réutilise directement `pollPdfJob`/`usePdfDocument` (Lot 5, reçu de séjour) et le même patron d'état partagé verrouillé.

---

## Lot 7 — IL5 Réservations courte durée

**Date** : 2026-09-19

### Ce qui est hors périmètre, et pourquoi

`POST /bookings` (créer une réservation depuis une fiche logement) dépend du choix d'un logement — recherche publique, I4, un lot distinct pas encore construit. Ce lot couvre donc le cycle de vie d'une réservation **déjà créée** : payer, simuler un code promo, prolonger, annuler, télécharger le reçu — pas l'écran de recherche/création lui-même. Même logique que l'état des lieux laissé de côté au Lot 4 tant qu'IL3 n'existe pas.

### Vérifié en direct avant d'écrire le moindre type : deux écarts avec l'exemple Swagger

Pour valider les schémas sans dépendre d'une UI de recherche pas encore construite, j'ai créé une vraie réservation par `curl` (authentifié avec le compte de test habituel), directement contre `POST /bookings`, sur un logement réel de l'instance ayant un tarif journalier actif (`Studio CADJEHOU`, 25 000 FCFA/nuit).

1. **`expires_at` est bien renvoyé par `GET /bookings/mine`** alors que l'exemple Swagger de cette route ne le montre pas (l'exemple ne liste que `id, unit_id, check_in, check_out, nights, total_price, status, unit`). Sans cette vérification en direct, le compte à rebours du hold de 15 minutes — pourtant demandé par la doc — n'aurait pas pu être construit sur des données réelles.
2. **`retained_amount` / `retention_released_at` existent bien sur le modèle**, alors que la description de `POST /bookings/:id/pay` dit explicitement « pas de séquestre, contrairement au paiement d'entrée de bail ». En creusant : chaque logement porte un `booking_retention_percentage` (0 par défaut, y compris sur le logement de test utilisé ici) — la doc a probablement raison pour le cas général, mais le champ existe et peut être non nul sur d'autres logements. Traité comme le reste des séquestres du projet : affiché seulement si le champ est réellement non nul, jamais supposé.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/tenant.ts` | `BookingSummary` complété (`expires_at`, `extended_from_booking_id`, `retained_amount`, `retention_released_at`), `BookingActionResult` (réponse de create/extend/cancel, sans `unit` imbriqué — forme différente de la liste), `PromoPreviewResult`, `PayBookingResult` |
| `app/utils/bookingHold.ts` | `deriveHoldCountdown()` — pure, horloge injectable : dérive `expired`/`minutesRemaining` depuis `expires_at`. Le hold pending_payment n'est pas un 4ᵉ statut serveur, juste une dérivation d'affichage |
| `app/composables/useBookingsApi.ts` | Étendu : `previewPromo`, `pay`, `extend`, `cancel` (le reçu passe par `usePdfDocument`, comme le contrat/quittance d'IL2) |
| `app/components/tenant/BookingPayModal.vue` | Nouveau — code promo optionnel avec vérification préalable (aucun débit), puis paiement réel |
| `app/components/tenant/BookingExtendModal.vue` | Nouveau — prolongation : crée un nouveau segment à payer séparément, jamais une modification de la réservation d'origine |
| `app/pages/locataire/reservations.vue` | Entièrement réel : liste avec `useFetchBlock`, compte à rebours du hold, payer/annuler/prolonger/reçu selon le statut réel |

### Bug trouvé en testant l'écran construit, avant tout partage avec l'utilisateur

Les deux nouvelles modales, placées dans `app/components/tenant/`, avaient été référencées dans la page comme `<BookingPayModal>` / `<BookingExtendModal>`. En testant l'écran avec Playwright : `[Vue warn]: Failed to resolve component`, la modale ne s'ouvrait pas au clic sur « Payer ». Cause : la convention d'auto-import de ce projet préfixe par le nom du dossier (`components/tenant/X.vue` → `<TenantX>`), déjà en usage pour les modales d'IL2 (`<TenantAlimenterModal>`, `<TenantSignLeaseModal>` dans `layouts/locataire.vue`) mais pas repérée avant d'écrire cette page. Corrigé avant toute vérification manuelle plus poussée.

### Tests automatisés

```
✓ tests/bookingHold.test.ts (4 tests)
  ✓ retourne null sans expires_at (réservation pas en hold)
  ✓ arrondit au nombre de minutes restantes supérieur
  ✓ signale expired dès que le délai est dépassé, jamais de minutes négatives
  ✓ traite l'instant exact d'expiration comme expiré (borne <= 0)

Test Files  12 passed (12)
     Tests  67 passed (67)   [63 des lots précédents + 4 nouveaux]
```

### Vérification manuelle contre l'API live

Connecté avec le compte de test habituel (code maître), deux réservations réelles créées par `curl` sur un logement à tarif journalier réel, puis piloté `/locataire/reservations` avec Playwright, sans rien mocker :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `GET /bookings/mine` | 200, 2 réservations réelles | Liste affichée avec vraies dates, montants, statuts ; compte à rebours du hold affiché sur la réservation `pending_payment` |
| `POST /bookings/:id/preview-promo` avec un code inventé | 400 « Code promo introuvable pour ce logement. » | Message affiché tel quel sous le champ, aucun crash |
| `POST /bookings/:id/pay` sur un wallet à 0 FCFA | 400 « Solde insuffisant. Votre tirelire contient 0 XOF, le séjour coûte 75000 XOF. » | Message backend affiché intégralement (passe par l'interception « tirelire » du Lot 1, déjà en place) |
| `PATCH /bookings/:id/cancel` | 200, `status: "cancelled"` | Réservation repasse à « Annulée » dans la liste après rechargement, bouton « Annuler » retiré |

### Ce qui n'a pas pu être testé en conditions réelles, et pourquoi

- **`POST /bookings/:id/pay` avec un solde suffisant** (donc une réservation `confirmed`) : le compte de test n'a aucun moyen de recharger son wallet sans un vrai paiement Mobile Money abouti (aucune passerelle « mock » disponible sur cette instance, confirmé au Lot 6) — la même limite que le paiement d'entrée de bail au Lot 5.
- **`POST /bookings/:id/extend`** : nécessite une réservation `confirmed`, donc dépend du point précédent.
- **`GET /bookings/:id/receipt`** : disponible uniquement une fois payée — même blocage. Le câblage réutilise `usePdfDocument`, déjà testé unitairement (Lot 5) et déjà vérifié manuellement pour un autre document PDF+HTML (le contrat de bail, Lot 5) ; pas revérifié spécifiquement sur cette route.
- Chaque flux non testable en direct a été relu attentivement contre le schéma exact de sa requête/réponse (voir la section découverte ci-dessus) plutôt que deviné.

### Prochaine étape proposée

D'après l'ordre conseillé, la suite logique côté locataire est **IL6 — Demandes, visites, signalements**, ou **IL7 — Messagerie et notifications** : les deux consomment des sources déjà listées sur le tableau de bord (Lot 4) mais pas encore ouvertes en détail/action.

---

## Lot 8 — IL6 Demandes, visites, signalements

**Date** : 2026-09-19

### Un onglet entier de la maquette n'a aucun endpoint réel derrière lui — retiré plutôt que conservé en façade

`/locataire/demandes` avait deux onglets : « Demandes envoyées » (message libre par logement, avec accepté/refusé) et « Ma demande publique » (critères + réponses de propriétaires). En cherchant l'endpoint du premier : rien. Aucune route de type « candidature par logement avec réponse » n'existe dans le Swagger — seul `/housing-requests` existe, et il modélise exactement le second onglet (une ou plusieurs demandes publiées, texte libre + critères, que des propriétaires consultent et auxquelles ils répondent en proposant un logement précis). Le premier onglet est retiré entièrement plutôt que laissé en façade ; la page devient la liste réelle des demandes publiées, avec publication et consultation des réponses.

### Trois écarts confirmés en direct, un par domaine, avant d'écrire le moindre écran

Pour vérifier sans dépendre d'écrans de recherche pas encore construits (I4), j'ai créé de vraies données par `curl` (demande de logement, signalement) sur le compte de test habituel.

1. **Signalements — la liste et le détail ne renvoient jamais les URLs des pièces jointes.** L'exemple Swagger montre `attachments: []` ; en pratique, `GET /signals` et `GET /signals/:id` renvoient `attachment_count` (un nombre), pas les fichiers. Les pièces jointes ne sont récupérables qu'une par une, par index, via `GET /signals/:id/attachments/:index/download` — un point d'accès protégé au sens du socle §5, sur le même modèle que les documents KYC (Lot 3). `SignalSummary` corrigé en conséquence (`attachment_count: number`, pas `attachments: unknown[]`) ; ce type est utilisé par le tableau de bord depuis le Lot 4, qui n'a jamais touché ce champ et n'a donc jamais été affecté par l'erreur.
2. **`POST /files` renvoie une URL Cloudinary complète** (`https://res.cloudinary.com/...`), jamais le chemin relatif (`/uploads/...`) montré par l'exemple Swagger. Bonne nouvelle pour l'implémentation : aucune configuration d'origine supplémentaire n'était nécessaire pour afficher les photos, une simple `<img :src>` avec l'URL retournée suffit.
3. **`POST /visits` exige un compte vérifié KYC** (403 `error.KYC_REQUIRED` sur le compte de test, non vérifié) — un cas d'erreur absent des exemples 400/403 du Swagger pour cette route. Sans conséquence directe sur ce lot puisque la création de visite est hors périmètre (voir ci-dessous), mais à garder en tête pour le jour où I4 amènera cette création dans le produit : la réponse `message` est un code brut non traduit (`"error.KYC_REQUIRED"`), pas une phrase française comme le reste des erreurs de l'API — à traiter spécifiquement dans `apiErrors.ts` à ce moment-là plutôt que de l'afficher tel quel.

### Ce qui est hors périmètre, et pourquoi

- **`POST /visits`** (demander une visite) et **`POST /bookings`**-like creation depuis une fiche logement : dépendent du choix d'un logement, recherche publique I4 pas encore construite — même limite que la création de réservation en IL5.
- **`confirm`/`reject`/`complete`/`reschedule`** sur une visite : actions propriétaire, hors de l'espace locataire. La maquette précédente donnait par erreur un bouton « Confirmer » et « Autre créneau » au locataire sur une visite « À confirmer » — ces deux actions n'existent pas côté locataire dans l'API (seule `cancel` l'est) ; retirées.
- **Critères structurés d'une demande de logement dépendant d'un référentiel** (ville, quartier, type de logement, équipements — via `GET /ref`) : non exposés dans le formulaire de publication. Seuls `description` (obligatoire) et les champs simples sans dépendance (budget min/max, date d'emménagement, chambres minimum) sont câblés.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/tenant.ts` | `VisitStatus`, `VisitSummary` ; `HousingRequestStatus`, `HousingRequestSummary` étendu, `HousingRequestResponse` ; `SignalType`/`SignalPriority`/`SignalStatus`/`SignalVisibility`, `SignalSummary` corrigé (`attachment_count`) ; `FileUploadResult` |
| `app/composables/useVisitsApi.ts` | Nouveau — `fetchMine`, `cancel` |
| `app/composables/useHousingRequestsApi.ts` | Étendu — `create`, `fetchResponses`, `close` |
| `app/composables/useSignalsApi.ts` | Étendu — `create`, `uploadFile` (multipart vers `/files`), `attachmentDownloadUrl` (fichier protégé, par index) |
| `app/components/tenant/HousingRequestModal.vue` | Nouveau — formulaire de publication |
| `app/components/tenant/ReportModal.vue` | Réécrit — catégorie → `signal_type` réel, logement source depuis les vrais baux (`useTenantLeases`), upload de photo réel, priorité réelle. Désactivé avec message honnête si aucun bail |
| `app/pages/locataire/demandes.vue` | Réécrit — liste réelle, publication, réponses reçues consultables, fermeture |
| `app/pages/locataire/visites.vue` | Réécrit — liste réelle à venir/passées, annulation. Les boutons « Confirmer »/« Autre créneau » (actions propriétaire) retirés |
| `app/pages/locataire/signalements.vue` | Réécrit — liste réelle, 4 étapes visuelles dérivées des 5 statuts réels, pièces jointes ouvertes une par une (fichier protégé), résolution affichée si renseignée |
| `app/composables/useTenantSpace.ts` | Le mock `useReports()`/`TenantReport`/`INITIAL_REPORTS`, devenu orphelin, supprimé (plus aucun appelant) |

### Tests automatisés

Aucune fonction pure nouvelle à isoler ce lot-ci : la logique est essentiellement des correspondances d'affichage (statut → libellé/tonalité, catégorie → `signal_type`), du même ordre que les tables déjà écrites en ligne dans `index.vue`/`bail.vue` aux lots précédents et jamais testées unitairement pour cette raison — cohérent avec la pratique établie de ne tester que la logique à branchements réels.

```
Test Files  12 passed (12)
     Tests  67 passed (67)   [aucun changement — pas de nouvelle logique pure ce lot-ci]
```

### Vérification manuelle contre l'API live

Connecté avec le compte de test habituel (code maître), données réelles créées par `curl` (une demande de logement, un signalement avec une pièce jointe), puis les trois écrans pilotés avec Playwright, sans rien mocker :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `GET /housing-requests/my` | 200, 1 demande fermée avec budget | Affichée avec statut « Fermée » et fourchette de budget réels |
| `GET /visits` | 200, liste vide (création bloquée par KYC_REQUIRED) | État vide honnête, aucun crash |
| `GET /signals` | 200, 1 signalement avec `attachment_count: 1` | Affiché avec priorité/statut réels, étape « Déclaré » active, bouton « Pièce jointe 1 » |
| `GET /signals/:id/attachments/0/download` (clic sur le bouton) | 200, `image/webp` | Blob récupéré via `useProtectedFile`, `window.open()` appelé avec la bonne URL blob (vérifié en interceptant `window.open` directement — l'événement « popup » de Playwright ne se déclenchait pas de façon fiable en Chromium headless après un `await`, sans rapport avec le code de l'application) |
| Ouverture de « Signaler un problème » sans bail réel | — | Message explicite (« Vous devez avoir un bail pour signaler un problème sur un logement. »), catégories désactivées plutôt qu'un formulaire qui échouerait silencieusement à l'envoi |

### Ce qui n'a pas pu être testé en conditions réelles, et pourquoi

- **Publier une demande, consulter des réponses, fermer** : chaque appel a été vérifié séparément par `curl` (schémas confirmés, voir la section découverte) mais pas encore par l'UI elle-même de bout en bout — la demande de test avait déjà été fermée en vérifiant le schéma avant que l'écran ne soit prêt.
- **Créer un signalement avec upload de photo réel, depuis l'écran** : bloqué par l'absence de bail réel sur ce compte (même limite que le paiement d'entrée en IL2 et le paiement de réservation en IL5) — le formulaire est correctement désactivé plutôt que de simuler un envoi.
- **Annuler une visite** : aucune visite réelle à annuler, la création étant bloquée par KYC_REQUIRED sur ce compte.

### Prochaine étape proposée

**IL7 — Messagerie et notifications**, qui referme la boucle avec les conversations créées par `respond()` sur une demande de logement (déjà visibles dans ce lot via le lien « Voir la conversation », pas encore construit) et le centre de notifications déjà listé au tableau de bord depuis le Lot 4.

---

## Lot 9 — IL7 Messagerie et notifications

**Date** : 2026-09-19

### Régression trouvée en vérifiant : le fil d'activité du tableau de bord affichait une date invalide pour chaque notification, depuis le Lot 4

En générant une vraie notification pour tester ce lot (`POST /notifications/test`, aucune notification n'existait encore sur ce compte), j'ai découvert que le champ réel est **`createdAt`** (camelCase), pas `created_at` comme le montre l'exemple Swagger et comme le fait systématiquement le reste de l'API (baux, réservations, signalements, demandes de logement — tous en `created_at`). `NotificationItem` et `buildActivityFeed()` (Lot 4) lisaient `n.created_at`, donc `undefined` sur toute vraie notification → `new Date(undefined)` → date invalide affichée dans « Activité récente », et un tri chronologique cassé dès qu'une notification se mêlait à des signalements. Passé inaperçu au Lot 4 faute de notification réelle à observer sur le compte de test à ce moment-là — exactement le genre de régression que ce test-ci était censé attraper. Corrigé : type, fonction de fusion, et le test unitaire du Lot 4 (dont le fixture reproduisait fidèlement l'hypothèse fausse, donc ne pouvait pas la détecter) mis à jour ensemble.

### Deuxième écart confirmé en créant une vraie conversation : un rôle de participant non documenté

`POST /messaging/conversations` (testé en direct pour obtenir des données réelles) renvoie un participant avec `role: "agency"` — absent des 4 valeurs déclarées par le Swagger (`tenant`, `landlord`, `agent`, `admin`). `ParticipantRole` élargi pour ne pas fabriquer une énumération plus stricte que la réalité, sur le même principe que les types de transaction du Lot 6.

### Un vrai gap corrigé au passage : la cloche de notifications de la sidebar était un bouton mort

`♪` dans `layouts/locataire.vue` (et à l'identique dans `layouts/pro.vue`, hors périmètre de ce lot) affichait un badge « 3 » codé en dur, sans aucun panneau ni source réelle — repéré en même temps que le reste du module notifications. Remplacé par `LayoutNotificationBell.vue` : compteur réel de non-lus, panneau déroulant, marquer un par un ou tout d'un coup.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/messaging.ts` | Nouveau — types conversation/message, seul module du projet dont le Swagger a des schémas `properties` complets (pas seulement des `example`) |
| `app/types/tenant.ts` | `NotificationItem.created_at` → `createdAt` (bug corrigé) |
| `app/utils/tenantDashboard.ts` | `buildActivityFeed` lit désormais `n.createdAt` |
| `app/composables/useMessagingApi.ts` | Nouveau — `fetchConversations`, `fetchMessages`, `sendMessage`, `markRead`, `attachmentDownloadUrl` (fichier protégé, même motif qu'IL6) |
| `app/composables/useNotificationsApi.ts` | Étendu — `markRead`, `markAllRead` |
| `app/components/layout/NotificationBell.vue` | Nouveau — remplace le bouton mort de la sidebar |
| `app/pages/locataire/messages.vue` | Réécrit — conversations réelles, sélection d'un fil via `?conversation=<id>` (relié au lien laissé en attente au Lot 8), envoi/réception de texte, pièces jointes image/document téléchargeables, note explicite si la conversation est archivée/fermée |
| `app/pages/locataire/demandes.vue` | Le lien « Voir la conversation » pointe maintenant vers la vraie conversation plutôt que la messagerie en général |
| `tests/tenantDashboard.test.ts` | Fixtures corrigées (`createdAt`, `attachment_count`) pour refléter les vrais types plutôt que l'hypothèse fausse qui avait masqué le bug |

`POST /messaging/conversations` (démarrer une conversation depuis zéro) n'est pas câblé : dans ce lot, les conversations naissent soit d'une réponse de propriétaire à une demande de logement (IL6), soit existent déjà — pas de recherche de destinataire construite ici.

### Tests automatisés

Aucune fonction pure nouvelle : la logique de ce lot (nom/sujet/couleur d'un fil, dérivés des participants) est de la même nature que les tables d'affichage déjà écrites en ligne aux lots précédents. La seule correction de test porte sur les fixtures existantes.

```
Test Files  12 passed (12)
     Tests  67 passed (67)   [inchangé — correction de fixtures uniquement, voir ci-dessus]
```

### Vérification manuelle contre l'API live

Connecté avec le compte de test habituel, une vraie conversation créée par `curl` (`POST /messaging/conversations` avec un message initial), puis `/locataire/messages` et la cloche pilotés avec Playwright, sans rien mocker :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `POST /notifications/test` puis `GET /notifications` | 201, puis 200 avec une vraie notification | Bandeau « Activité récente » du tableau de bord : date correcte (« 19 sept. »), plus de date invalide |
| Cloche de notifications | `GET /notifications` → 200 | Badge « 1 » réel, panneau déroulant avec titre/message localisés et date, fermeture au clic extérieur |
| `POST /messaging/conversations` (avec message initial) | 201 | — |
| `GET /messaging/conversations` puis ouverture du fil | 200, puis `GET .../messages` → 200 | Vrai nom du propriétaire (« ROB IMMO IMMO »), vrai sujet (« Studio CADJEHOU »), message initial affiché en bulle |
| Envoi d'un second message depuis le champ de saisie réel | `POST .../messages` → 201 | Nouveau message affiché instantanément dans le fil, zéro rechargement de page |
| Lien « Voir la conversation » depuis une demande de logement | — | Navigue vers `/locataire/messages?conversation=<id>`, sélectionne le bon fil au chargement |

### Ce qui n'a pas pu être testé en conditions réelles, et pourquoi

- **Recevoir un message de l'autre participant** : nécessiterait un second compte connecté simultanément — vérifié uniquement dans le sens envoi.
- **Téléchargement d'une pièce jointe de message** (`GET /messaging/messages/:id/attachment`) : aucun message de type `image`/`document` généré en direct dans ce lot (aurait nécessité d'envoyer un message avec `metadata` construit à la main, hors du flux normal de l'UI) — le code réutilise exactement le motif fichier protégé déjà vérifié en direct pour les pièces jointes de signalement (Lot 8).
- **Conversation archivée/fermée** : aucune conversation dans cet état sur le compte de test — la désactivation du champ de saisie a été relue contre le schéma plutôt que déclenchée en direct.
- **Web Push (`POST /notifications/subscribe`)** : nécessite un service worker côté front, hors périmètre de ce lot.

### Prochaine étape proposée

D'après `13-INTEGRATION-PRO-ET-ARTISAN.md`, la suite logique est **IL8 — Profil locataire**, qui referme le dernier module du plan côté locataire avant de basculer sur l'espace Pro (IP1–IP10).

---

## Lot 10 — IL8 Profil locataire

**Date** : 2026-09-19

### Deux sections de la maquette n'avaient aucun endpoint réel derrière elles — retirées

- **« Codes de récupération » avec un bouton « Générer »** : aucun endpoint dédié à la génération de codes n'existe. En creusant le composable déjà écrit au Lot 2 (`setPassword`), le type `SetPasswordResult` prévoyait déjà un champ `recovery_codes?: string[]` — les codes ne se génèrent qu'en **effet de bord de la création d'un mot de passe** (`POST /auth/password`), pas via une route à part. Retiré comme section autonome, rattaché à l'écran de succès de la création de mot de passe : affiché une seule fois si le serveur les renvoie, jamais reconstruit ni régénérable à la demande.
- **« Sessions actives » avec un bouton « Déconnecter »** : aucun endpoint de gestion multi-appareils (lister/révoquer une session précise) n'existe — seul `POST /auth/logout` (session courante) est disponible, déjà câblé au Lot 2. Retiré entièrement plutôt que laissé en façade.

### Un écart de contrat confirmé en direct : le Swagger déclare `number`, l'API valide en `string`

`PATCH /profile/me` déclare `budget_min`/`budget_max` comme `type: "number"` dans son schéma de requête. En testant pour de vrai : un envoi en nombre renvoie 400 (`budget_min must be a string`), un envoi en chaîne réussit. C'est l'inverse du problème habituel de ce projet (l'API renvoyant des montants en chaîne à la *lecture*, documenté au socle §1) — ici c'est l'*écriture* qui exige une chaîne malgré un schéma qui promet un nombre. `UpdateProfilePayload` et le formulaire corrigés avant toute vérification plus poussée.

**Deuxième écart, mineur** : `preferred_zones` vaut `null` tant qu'aucune zone n'est renseignée (pas `[]` comme le laissait supposer l'exemple Swagger) — `ProfileMe.preferred_zones` typé en conséquence, déjà absorbé sans crash par le `watch` qui peuple le formulaire.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/profile.ts` | Nouveau — `ProfileMe`, `UpdateProfilePayload` (budgets en `string`, vérifié en direct), `NotificationPreferences` |
| `app/composables/useProfileApi.ts` | Nouveau — `fetchMe`, `update` |
| `app/composables/useSettingsApi.ts` | Nouveau — `fetchNotificationPrefs`, `toggleNotificationChannel` |
| `app/composables/useUserApi.ts` | Nouveau — `deleteAccount` (`DELETE /user/delete`) |
| `app/pages/locataire/profil.vue` | Réécrit — identité réelle (`/auth/me`), formulaire d'édition de profil réel (nom, profession, contact d'urgence, zones, budget), création/changement de mot de passe réel (`setPassword`, déjà prêt depuis le Lot 2), suppression de compte réelle avec confirmation à deux étapes, préférences de notifications par canal réelles. L'onglet « Vérification » redirige vers `/kyc` (déjà entièrement câblé, Lot 3) plutôt que de dupliquer son contenu |

Les champs sensibles (`full_name`, `profession`, etc.) ne sont jamais réaffichés en clair après enregistrement — `GET /profile/me` les masque systématiquement (`"********"`) — donc l'écran affiche seulement « Renseigné »/« Non renseigné », jamais le masque littéral ni une fausse valeur pré-remplie.

### Tests automatisés

Aucune fonction pure nouvelle : ce lot est presque entièrement du branchement CRUD sur formulaire, sans logique à isoler (contrairement à IL4/IL5 dont le sondage ou le calcul de hold justifiaient une fonction testée séparément).

```
Test Files  12 passed (12)
     Tests  67 passed (67)   [inchangé]
```

### Vérification manuelle contre l'API live

Connecté avec le compte de test habituel, `/locataire/profil` piloté avec Playwright, sans rien mocker :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `GET /profile/me` (avant toute modification) | 200, tous les champs `null` | Onglet Informations : « Non renseigné » partout, formulaire vide |
| `PATCH /profile/me` avec budgets en nombre (avant correctif) | **400**, violations `isString` sur `budget_min`/`budget_max` | — (voir découverte ci-dessus) |
| `PATCH /profile/me` avec budgets en chaîne (après correctif), nom/profession/zones | 200 | `GET /profile/me` suivant confirme `full_name_masked: "********"` ; écran affiche « Renseigné » |
| Ajout d'une zone depuis le formulaire réel (« Fidjrossè ») puis Enregistrer | `PATCH /profile/me` → 200 | Zone conservée après rechargement, visible aux côtés des zones déjà présentes |
| `GET /settings/me/notifications` | 200, 3 canaux actifs | 3 interrupteurs réels affichés, tous activés |
| `PATCH /settings/me/notifications/sms` (désactiver) | 200 | Interrupteur SMS visuellement désactivé pendant la requête ; état confirmé par un second `GET` |
| Remise à l'état initial du canal SMS | `PATCH .../sms` `{is_enabled:true}` → 200 | Compte de test partagé laissé inchangé pour les prochains lots |

### Ce qui n'a pas pu être testé en conditions réelles, et pourquoi

- **`DELETE /user/delete`** : volontairement **jamais appelé** contre le compte de test — c'est le même compte réutilisé depuis le Lot 2 pour vérifier tous les lots suivants (code maître `000000`), une suppression serait irréversible et casserait la continuité des tests des prochains lots. Le schéma de requête est vide (`{}`, aucune confirmation attendue côté serveur) — relu attentivement plutôt qu'exécuté.
- **Création de mot de passe avec affichage des codes de récupération** : non déclenchée pour la même raison (aurait transformé le compte OTP-only en compte à mot de passe, changeant son comportement de connexion pour tous les lots suivants). Le code s'appuie sur `SetPasswordResult.recovery_codes`, un champ déjà présent dans le type écrit au Lot 2.
- **Toggle de canal via l'UI (second clic)** : un des deux clics Playwright consécutifs sur l'interrupteur SMS n'a pas déclenché de requête (probablement un problème de timing du script de test, pas du code de l'application) — le mécanisme lui-même a été vérifié séparément et à deux reprises par `curl` (activer puis désactiver), donc confirmé correct indépendamment de cet aléa de test.

### Prochaine étape proposée

Le module locataire (IL1–IL8) est maintenant complet. D'après `13-INTEGRATION-PRO-ET-ARTISAN.md`, la suite logique est de basculer sur l'espace **Pro** (IP1–IP10), ou de revenir sur **I4 — Recherche publique**, dont dépendent plusieurs flux laissés de côté dans les lots précédents (créer une réservation, demander une visite, démarrer une conversation depuis zéro).

---

## Lot 11 — I4 Recherche publique

**Date** : 2026-09-19

### Un endpoint piégeux : deux routes « fiche logement » qui ne portent pas les mêmes données

`GET /public/properties/{id}` (préfixe `/public`) existe bien, mais sa description dit explicitement : « Données limitées pour partage WhatsApp/Facebook » — un résumé, pas la fiche complète (pas d'unités, pas de médias, pas de propriétaire). La vraie source pour une fiche détaillée est **`GET /property/{id}`** (préfixe `/property`, pas `/public`), qui renvoie le bien complet avec ses unités, médias, ville, quartier — et qui s'est avérée tout aussi publique (`security` absent du Swagger, confirmé en direct sans jeton). Même chose pour la recherche : `GET /property/search` (pas un endpoint `/public/*`) est la vraie route de recherche publique. Vérifié en direct avant d'écrire le moindre composable, pour ne pas bâtir toute la fiche logement sur le mauvais endpoint.

### Deux vrais bugs trouvés en testant l'écran construit, avant tout partage

1. **Le calendrier de réservation ne pouvait jamais sélectionner de date de fin.** La condition `if (!checkOut.value || !checkIn.value || ...)` redémarrait toujours une nouvelle sélection dès le deuxième clic, puisque `checkOut` reste `null` tant qu'il n'a pas été posé — donc `!checkOut.value` est vrai à chaque clic, y compris le second. Résultat : impossible de composer un séjour de plusieurs nuits, le bouton « Réserver » restait bloqué indéfiniment. Repéré en pilotant l'écran avec Playwright (deux clics sur deux jours différents, un seul jour restait surligné), corrigé (`!checkIn.value || checkOut.value || ...` — recommencer seulement si aucune date de départ n'est posée, ou si une plage complète existe déjà), puis revérifié en direct : `POST /bookings` → 201, dates exactes conservées.
2. **Un appel de diagnostic laissé par erreur** (`$fetch('/property/favorites/ids')` invoqué sans but réel dans un bloc de code intermédiaire, jamais utilisé) — retiré avant la vérification live, avec le composable `loadOwner` correctement rattaché au chargement du bien.

Un faux « bug » écarté en creusant plus loin : la carte propriétaire semblait ne jamais s'afficher lors d'un premier test avec une fenêtre d'observation courte — en réalité l'appel `GET /public/owners/:id` partait bien, seulement plus lentement que les autres appels de la même page (cold start Render, déjà documenté), et arrivait après la capture d'écran. Revérifié avec une fenêtre d'attente plus longue : fonctionne parfaitement.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/property.ts`, `app/types/reference.ts` | Types recherche/fiche/avis/disponibilité/référentiels, écrits à partir des réponses réelles (bien plus riches que les exemples Swagger) |
| `app/composables/usePropertySearchApi.ts` | `search`, `fetchById`, `fetchAvailability`, `fetchPricing` — sur les vrais endpoints publics `/property/*`, pas `/public/*` |
| `app/composables/useReferenceData.ts` | Villes, quartiers, référentiels (`WATER_SOURCE`, `METER_TYPE`, `FURNISHED_LEVEL`…) — mis en cache au niveau module, jamais refetchés deux fois dans la session (mentionné mais jamais construit depuis le socle) |
| `app/composables/useReviewsApi.ts` | Avis publics d'un bien, lecture seule (publier un avis dépend d'une visite/d'un séjour réel — pas câblé) |
| `app/composables/useFavoritesApi.ts` | `useFavoritesApi` (brut, authentifié) + `usePropertyFavorites` (état réactif partagé, jamais d'appel si le visiteur n'est pas connecté) |
| `app/composables/useBookingsApi.ts` | `create` ajouté — la création de réservation, laissée en attente depuis IL5 faute de source de `unit_id`, est maintenant câblée |
| `app/composables/useMessagingApi.ts` | `createConversation` ajouté — démarrer une conversation depuis une fiche logement, laissé en attente depuis IL7 |
| `app/utils/propertyListing.ts` | `flattenSearchResults()` — aplatit la réponse mixte de `/property/search` (biens à unités multiples + unités « standalone » `_virtual`) en une carte par unité |
| `app/utils/availabilityCalendar.ts` | `isDateBlocked`/`buildCalendarDays` — dérive un calendrier jour par jour à partir des plages bloquées réelles, horaires/bornes testés unitairement |
| `app/components/search/PropertyCard.vue` | Nouvelle carte de résultat réelle (l'ancienne `SearchResultCard.vue` reste utilisée telle quelle par les pages pas encore migrées — `index.vue`, `vitrine.vue`, `louer.vue`, `favoris.vue` public) |
| `app/pages/recherche.vue` | Réécrite — recherche réelle (texte, ville, quartier, budget, chambres, eau, compteur, tri), favoris réels, pagination réelle, vue carte avec pins positionnés sur les vraies coordonnées GPS quand elles existent |
| `app/pages/biens/[id].vue` | Réécrite — fiche réelle (photos, caractéristiques, description, propriétaire vérifié via la vitrine publique, avis), coûts d'entrée calculés depuis les vrais champs de l'unité (`caution_months`, `avance_months`, `frais_dossier` — plus de constantes inventées), réservation courte durée avec calendrier réel relié à `POST /bookings`, ou demande longue durée qui démarre une vraie conversation |

### Ce qui est hors périmètre, et pourquoi

- **`index.vue`, `vitrine.vue`, `louer.vue`, `favoris.vue` (public)** : consomment les mêmes mocks (`useProperties`, `useFavorites`) que les deux pages migrées ici, mais leur migration est un lot à part — proposé en suite logique ci-dessous. Aucun de ces fichiers n'a été supprimé ni cassé : `useProperties.ts`/`useFavorites.ts`/`SearchResultCard.vue` restent en place, encore utilisés par ces pages non migrées.
- **Recherche sémantique / assistée par IA** (`/property/semantic-search`, `/property/ai-search`) : endpoints réels repérés mais pas câblés — la recherche en langage naturel de l'écran reste une heuristique côté client (comme avant), maintenant appliquée aux vrais filtres plutôt qu'à des données mock.
- **Publier un avis** : dépend de `GET /reviews/can/:visitId` (éligibilité liée à une visite/un séjour réel) — lecture seule dans ce lot.
- **Vitrine complète d'un propriétaire** (`GET /public/owners/:userId` avec sa liste de biens) : seule la carte résumée (nom, avatar, vérifié, membre depuis) est utilisée sur la fiche logement — la page `/vitrine` elle-même reste mock, prévue avec les autres pages publiques non migrées.

### Tests automatisés

```
✓ tests/propertyListing.test.ts (5 tests)
  ✓ crée une carte par unité d'un bien, avec le nom du quartier et la photo du bien
  ✓ éclate un bien à plusieurs unités en autant de cartes
  ✓ traite une unité standalone (_virtual) comme sa propre carte, marquée virtual
  ✓ retombe sur la photo de l'unité si le bien n'a aucun média
  ✓ renvoie un tableau vide sans erreur si un bien n'a aucune unité

✓ tests/availabilityCalendar.test.ts (6 tests)
  ✓ bloque une date strictement à l'intérieur de la plage
  ✓ bloque la date de début (incluse)
  ✓ ne bloque pas la date de fin (exclue — même convention que les réservations)
  ✓ ne bloque pas une date hors plage
  ✓ ne bloque jamais rien sans plage
  ✓ construit le bon nombre de jours consécutifs, chacun marqué bloqué ou non

Test Files  14 passed (14)
     Tests  78 passed (78)   [67 des lots précédents + 11 nouveaux]
```

### Vérification manuelle contre l'API live

Sans mocker quoi que ce soit, navigateur piloté par Playwright — d'abord sans connexion, puis connecté avec le compte de test habituel :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| Chargement de `/recherche` sans connexion | `GET /location/cities`, `/ref?type=WATER_SOURCE`, `/ref?type=METER_TYPE`, `/property/search` → tous 200 | 27 logements réels affichés, photos réelles (y compris une photo de test authentique), prix/quartiers réels — aucun appel authentifié tenté |
| Ouverture d'une fiche (« Entrée couchée ») | `GET /property/:id`, `/reviews/property/:id`(+`/stats`), 3× `/ref`, `/property/search` (similaires) → 200 | Fiche complète réelle : specs réelles, coûts d'entrée calculés depuis les vrais `caution_months`/`avance_months`, « Aucun avis pour l'instant » honnête, propriétaire vérifié via la vitrine publique, 4 logements similaires réels |
| Filtrer par ville (Cotonou) | `GET /location/neighborhoods?city_id=...`, `GET /property/search?city=Cotonou` → 200 | 27 → 16 logements, chip « Cotonou ✕ » affiché, quartiers de Cotonou chargés dynamiquement |
| Ajouter un favori depuis la recherche (connecté) | `POST /property/favorites/toggle` → 201 `{action:"added"}` | Cœur rempli immédiatement (mise à jour optimiste), confirmé par le succès de l'appel |
| Réserver une unité à tarif journalier (Studio CADJEHOU, 25 000 F/nuit), calendrier réel, dates 21→24 sept. | `GET /units/:id/pricing`, `/availability` → 200, puis `POST /bookings` → **201** | Réservation réelle créée (3 nuits, 75 000 F), écran de confirmation avec lien direct vers le paiement (IL5, déjà construit) — vérifié ensuite via `GET /bookings/mine`, dates exactes, puis annulée par propreté |
| Fermeture de la boucle IL5/IL7 | — | La création de réservation et le démarrage de conversation, tous deux explicitement laissés en attente dans les lots précédents faute de `unit_id` réel, sont maintenant opérationnels de bout en bout depuis une vraie fiche logement |

### Prochaine étape proposée

Migrer les pages publiques restantes sur les composables déjà construits ici : **`index.vue`** (page d'accueil, logements en vedette), **`louer.vue`**, **`vitrine.vue`** (page complète d'un propriétaire, en s'appuyant sur `GET /public/owners/:userId`), et **`favoris.vue`** public (liste complète via `GET /property/favorites/my`). Une fois ces quatre pages basculées, `useProperties.ts` (mock) et l'ancienne `SearchResultCard.vue` pourront être supprimés en toute sécurité — plus aucun appelant. Alternative : basculer sur l'espace **Pro** (IP1–IP10).

---

## Lot 12 — I4 (suite) Page d'accueil et favoris

**Date** : 2026-09-19

### Deux catégories de la page d'accueil filtraient sur des codes qui n'existent pas

Les tuiles « Villas » et « Duplex » de la page d'accueil devaient filtrer via `unit_type_id` (le seul filtre précis de `GET /property/search` pour un type de logement). En vérifiant `GET /ref?type=UNIT_TYPE` en direct : seules 6 valeurs existent réellement — `studio`, `chambre_salon`, `2_chambres_salon`, `3_chambres_salon`, `4_chambres_salon`, `maison`. `villa` et `duplex` sont des codes **`PROPERTY_TYPE`** (un registre différent), pas `UNIT_TYPE` : le filtre ne les aurait jamais trouvés, et ces deux tuiles seraient restées bloquées en permanence sur « 0 disponible » — laissant croire à une absence réelle de villas/duplex plutôt qu'à un filtre mal formé. Repéré avant tout affichage, corrigé en remplaçant ces deux catégories par les deux types réels manquants (`3_chambres_salon`, `4_chambres_salon`) : les 6 tuiles utilisent maintenant des codes confirmés, chacune avec un vrai compte (`GET /property/search?unit_type_id=...&limit=1`, lu depuis `.total`).

### Une vraie erreur d'inattention pendant le nettoyage, corrigée avant tout commit

En repérant les fichiers mock devenus orphelins après la migration de `recherche.vue`/`biens/[id].vue` (Lot 11) et des nouvelles pages de ce lot, une première vérification (`grep -rln "useFavorites()\b"`) a semblé montrer zéro appelant restant pour le composable mock `useFavorites.ts` — supprimé sur cette base, avec `ResultCard.vue` et `ReservationModal.vue` (confirmés orphelins, eux, par une recherche fiable). La suite de tests automatisés est passée sans broncher (aucun test ne couvre ces pages non migrées), mais un test de fumée immédiat sur toutes les pages publiques a révélé que **`vitrine.vue`** et **`SiteHeader.vue`** (le badge « Mes favoris (N) » du menu, sur chaque page du site) dépendaient encore de ce composable — la frontière `\b` de la regex se comportait mal juste après une parenthèse fermante, un piège classique de ce genre de vérification rapide. Fichier restauré immédiatement, avant tout partage. Leçon retenue : une suppression de code se vérifie par une recherche de chaîne simple et fiable (`grep -rn "useFavorites"`, sans regex de bordure de mot), jamais par un motif regex non revérifié — et se confirme par un test de fumée sur les pages qui ne sont pas dans la suite automatisée, pas seulement par « les tests passent ».

**Corrigé au passage, dans la foulée de cette même vérification** : le badge « Mes favoris (N) » du menu de site (`SiteHeader.vue`), qui lisait encore le compteur du mock — donc toujours à 0 en pratique puisque plus aucune page réelle n'appelle son `toggleFavorite`. Rebranché sur `usePropertyFavorites()` (Lot 11), le vrai composable partagé : le badge reflète maintenant le nombre réel de favoris, sur toutes les pages, pas seulement `/favoris`.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/composables/useFavoritesApi.ts` | `fetchMine` ajouté — liste complète des favoris avec bien/unité imbriqués (vérifié en direct : objet complet, pas le résumé montré par l'exemple Swagger). Type de réponse de `toggle()` corrigé (`{ favorited: boolean }` réel, pas `{ action, favorite_id }` documenté) |
| `app/pages/index.vue` | Réécrite — recherche réelle (ville, budget), catégories réelles comptées par type de logement réel, sections par ville réelles (`GET /property/search`), favoris réels. Héros/confiance/CTA bailleur laissés en contenu éditorial (aucune donnée à intégrer) |
| `app/pages/favoris.vue`, `app/pages/locataire/favoris.vue` | Réécrites — liste réelle (`GET /property/favorites/my`), retrait réel, état de chargement/erreur honnête |
| `app/components/layout/SiteHeader.vue` | Badge de favoris rebranché sur les vrais favoris |
| `app/components/home/UnitCard.vue` | `rating` rendu optionnel — plus de note à 4,6★ inventée faute d'un endpoint d'agrégation en masse (`N+1` non acceptable pour un rail de cartes) |
| `app/composables/useFavorites.ts` (mock), `useProperties.ts` (mock) | Conservés — encore utilisés par `vitrine.vue` (et `useProperties.ts` par `kyc.vue`, `index.vue` pour des dégradés décoratifs), non migrés dans ce lot |

### Ce qui est hors périmètre, et pourquoi

- **`vitrine.vue`** : page statique fixée sur « Agence Immo Cotonou », sans paramètre de route — une vraie vitrine nécessite de la restructurer en route dynamique (`/vitrine/[id].vue`) avant de pouvoir la brancher sur `GET /public/owners/:userId`, un chantier distinct plus large qu'une simple substitution de données.
- **`louer.vue`** : page marketing pure (statistiques commerciales, témoignages, grille tarifaire) — aucun endpoint ne pourrait raisonnablement les remplacer, même chose que le contenu éditorial laissé tel quel sur `index.vue` (héros, bloc confiance). Le chiffre « 94 % des loyers encaissés dans les 5 jours » qui y figure reste une affirmation commerciale non vérifiée, pas une donnée intégrée — à garder à l'esprit si le produit décide un jour de la rendre vérifiable.
- **Notes/avis en masse sur la page d'accueil** : `GET /reviews/property/:id/stats` existe mais n'a pas d'équivalent pour plusieurs biens à la fois — l'appeler une fois par carte affichée créerait une tempête de requêtes (N+1). Note retirée des cartes plutôt que fabriquée ou requêtée en boucle.

### Tests automatisés

Aucune fonction pure nouvelle ce lot-ci : la logique (comptage par catégorie, regroupement par ville) réutilise `flattenSearchResults()` déjà testé au Lot 11.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Sans mocker quoi que ce soit, navigateur piloté par Playwright :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| Chargement de `/` | `GET /location/cities`, `/ref?type=UNIT_TYPE`, `/property/search` (60), puis 6× `/property/search?unit_type_id=...&limit=1` | 6 tuiles de catégories réelles (« Studios 11 disponibles » … « 3 Chambres-salon 0 disponible » affiché honnêtement, pas caché), sections Cotonou/Abomey-Calavi/Parakou avec de vrais logements et de vraies photos |
| Chips « Populaire » | — | Villes réelles (Abomey-Calavi, Cotonou, Parakou), chaque clic lance une vraie recherche filtrée |
| `/favoris` (public) et `/locataire/favoris`, connecté | `GET /property/favorites/my` → 200 | Le favori réel ajouté au Lot 11 s'affiche avec photo/prix/titre réels |
| Retrait d'un favori depuis `/favoris` | `POST /property/favorites/toggle` → succès | Liste repasse à l'état vide honnête (« 0 logement enregistré »), favori remis ensuite par propreté |
| Badge « Mes favoris (N) » du menu, sur `/` | `GET /property/favorites/ids` → 200 | Affiche « Mes favoris (1) », le vrai compte, plus jamais bloqué à 0 |
| Test de fumée sur les 6 pages publiques (`/`, `/recherche`, `/biens/:id`, `/favoris`, `/vitrine`, `/louer`) | — | Zéro erreur console au-delà du 401 transitoire déjà documenté — y compris `vitrine.vue`, revérifiée après la restauration du mock |

### Prochaine étape proposée

**`vitrine.vue`** en route dynamique (`/vitrine/[id].vue`), qui fermerait la dernière dépendance au mock `useProperties`/`useFavorites` et permettrait de les supprimer définitivement. Alternative : basculer sur l'espace **Pro** (IP1–IP10).

---

## Lot 13 — I4 (suite) Vitrine propriétaire

**Date** : 2026-09-20

### `vitrine.vue` devient une route dynamique

La page était fixée en dur sur « Agence Immo Cotonou », sans paramètre d'URL — aucune vraie vitrine ne peut fonctionner sans savoir *de qui* elle parle. Convertie en `app/pages/vitrine/[id].vue`, alimentée par `GET /public/owners/:userId` (déjà utilisé de façon minimale depuis la fiche logement, Lot 11 — extrait ici dans un vrai composable partagé, `usePropertySearchApi().fetchOwnerStorefront()`). La fiche logement (`biens/[id].vue`) pointe maintenant réellement vers `/vitrine/:ownerId` au lieu de rester un simple encart non cliquable.

### Une statistique agrégée qui n'existe nulle part côté API, calculée honnêtement plutôt qu'inventée

La maquette affichait une note globale (« 4,7 ★ · 12 avis ») pour l'agence entière. Aucun endpoint ne donne cette moyenne par propriétaire — seul `GET /reviews/property/:id/stats` existe, par **bien**. Plutôt que de l'inventer ou de la faire disparaître, elle est recalculée en agrégeant les statistiques réelles de chaque bien listé dans cette vitrine (moyenne pondérée par le nombre d'avis de chacun) : borné par la pagination de la vitrine elle-même (jamais un balayage de tout le catalogue d'un propriétaire), donc pas de risque de tempête de requêtes. Si aucun bien n'a d'avis, affichage honnête (« — · Aucun avis ») plutôt qu'une note par défaut.

Le « délai de réponse (~2h) » de la maquette a été retiré : aucune donnée de ce type n'existe côté API (pas de mesure du temps de réponse en messagerie), et rien ne permettait de l'approximer sans fabriquer un chiffre.

### Un lien mort retiré du pied de page

Le pied de page (`SiteFooter.vue`) avait un lien statique « Vitrine agence » vers `/vitrine`. Cette route n'a plus de sens sans identifiant de propriétaire, et aucun endpoint ne liste les propriétaires/agences de la plateforme (seul `GET /public/owners/:userId`, qui exige un id précis, existe) — impossible de construire un point d'entrée générique honnête. Lien retiré plutôt que laissé pointer vers une page 404 ou vers un propriétaire arbitraire codé en dur.

### Nettoyage : le mock recherche/favoris est maintenant entièrement orphelin

Avec `vitrine.vue` migrée, `useFavorites.ts` (mock, favoris en `useState` local sans backend) n'a plus aucun appelant — supprimé. `useProperties.ts` conservé (ses fonctions `formatFcfa`/`formatFcfaShort` et ses dégradés décoratifs `photos` restent utilisés ailleurs, y compris par `index.vue`), mais son tableau `PROPERTIES` (huit logements fictifs) et l'interface `Property` associée n'avaient plus aucun appelant — retirés du fichier.

**Erreur de vérification rattrapée avant tout dégât, cette fois-ci pendant la vérification elle-même** : la même classe d'erreur que celle documentée au Lot 12 (frontière de mot `\b` peu fiable juste après une parenthèse fermante) aurait pu se reproduire ici. Cette fois, la vérification de `useFavorites` avant suppression s'est faite avec une recherche de chaîne simple sans aucune regex de bordure (`grep -rn "useFavorites" app/ | grep -v "useFavoritesApi\|composables/useFavorites.ts"`), puis confirmée par un test de fumée sur l'ensemble des pages publiques ET de l'espace locataire avant et après la suppression — la leçon du lot précédent appliquée concrètement.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/property.ts` | `OwnerProfile`, `OwnerStorefront` ajoutés |
| `app/composables/usePropertySearchApi.ts` | `fetchOwnerStorefront` ajouté — remplace l'appel `usePublicApi().get(...)` fait à la main dans `biens/[id].vue` au Lot 11 |
| `app/pages/vitrine/[id].vue` | Nouveau — remplace `app/pages/vitrine.vue` (supprimée). Profil réel, biens réellement publiés, note agrégée honnête, partage (WhatsApp + copier le lien) |
| `app/pages/biens/[id].vue` | La carte propriétaire devient un vrai lien cliquable vers `/vitrine/:ownerId` |
| `app/components/layout/SiteFooter.vue` | Lien mort « Vitrine agence » retiré |
| `app/composables/useFavorites.ts` | Supprimé — mock désormais sans aucun appelant |
| `app/composables/useProperties.ts` | `PROPERTIES`/`Property` (mock) retirés — `formatFcfa`/`formatFcfaShort`/`photos` conservés, toujours utilisés |

### Tests automatisés

Aucune fonction pure nouvelle : la logique de ce lot (agrégation pondérée des notes) est une réduction simple sur des données déjà typées, testée implicitement par la vérification live plutôt que par un test unitaire dédié — cohérent avec le reste de ce lot, essentiellement du branchement d'écran.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Sans mocker quoi que ce soit, navigateur piloté par Playwright, trois cas réels distincts :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| Vitrine d'un propriétaire avec un bien réellement publié (Klêklêtor Immo) | `GET /public/owners/:id` → 200, `GET /reviews/property/:id/stats` → 200 | Profil réel, « 1 biens publiés », « Aucun avis » honnête (bien sans avis), carte du bien réelle avec photo/prix/quartier |
| Vitrine d'un propriétaire réel mais sans bien publiquement listé au niveau du bien (ROB IMMO — a des unités publiques mais aucun bien parent `is_publicly_listed`) | `GET /public/owners/:id` → 200, `properties.data: []` | « 0 logement disponible », état vide honnête, profil quand même affiché correctement |
| Vitrine d'un identifiant inexistant | `GET /public/owners/:id` → **404** | Message clair (« Ce propriétaire est introuvable. »), pas de crash |
| Depuis une fiche logement réelle, clic sur « Voir sa vitrine » | — | Navigation réelle vers `/vitrine/:ownerId`, la bonne vitrine s'affiche |
| Test de fumée sur 8 pages publiques + 5 pages de l'espace locataire, avant et après la suppression du mock `useFavorites` | — | Zéro erreur console au-delà du 401 transitoire déjà documenté |

### Ce qui est hors périmètre, et pourquoi

- **`louer.vue`** : toujours pure page marketing, aucun endpoint à y brancher (voir Lot 12).
- **Liste/annuaire des propriétaires** : aucun endpoint de ce type n'existe — une vitrine ne se découvre que depuis une fiche logement (ou un lien partagé), jamais par une page de recherche d'agences.

### Prochaine étape proposée

L'intégration publique (I4) est maintenant complète pour tout ce que les endpoints réels permettent honnêtement de construire — `louer.vue` mis à part (marketing pur). Prochaine étape logique : basculer sur l'espace **Pro** (IP1–IP10, `13-INTEGRATION-PRO-ET-ARTISAN.md`).

---

## Lot 14 — IP1 Tableau de bord Pro

**Date** : 2026-09-20

### Mise en place : un compte propriétaire de test, faute d'en avoir un

Tous les lots précédents réutilisaient le même compte locataire de test. L'espace Pro exige un rôle `landlord`/`agent`/`agency`, qu'aucun compte existant ne portait. Un nouveau compte a été créé pour de vrai : `POST /auth/verify-otp` (code maître) sur une adresse neuve, puis `POST /onboarding/draft` (`role: "landlord"`) + `POST /onboarding/finalize` — confirmé par un `GET /auth/me` réel avec `role: "landlord"`. Tentative de créer un vrai bien de test avec ce compte (`POST /property`) : bloquée par **`error.KYC_REQUIRED`**, le même 403 déjà rencontré pour `POST /visits` en IL6 — la vérification d'identité conditionne aussi la publication d'un bien, pas seulement les visites. Sans moyen de passer le KYC par API, ce compte reste un propriétaire réel mais sans aucun bien : c'est justement le scénario testé ici, celui de tout nouveau propriétaire qui s'inscrit.

### Découverte critique en testant le tableau de bord sur ce compte tout neuf

`GET /property/landlord/stats/advanced` — censé fournir les données les plus riches (comparaison, top biens, note moyenne) — renvoie une **500** sur un compte sans aucun bien, vérifié en direct et reproduit deux fois. La cause la plus probable côté serveur : une division par zéro ou un calcul de moyenne/comparaison qui suppose au moins une donnée. `GET /property/landlord/stats` (la version simple) gère correctement ce même cas et renvoie des zéros propres, y compris un tableau `monthlyRevenue` sur plusieurs mois déjà rempli de zéros — cette route ne plante jamais, même à vide.

**Conséquence pour le code** : `useLandlordStatsApi().fetchStats()` tente d'abord `/stats/advanced` puis retombe sur `/stats` en cas d'échec, quelle qu'en soit la cause — jamais l'inverse, et jamais de page qui plante parce que l'endpoint « riche » a échoué. Vérifié en direct : le tableau de bord s'affiche parfaitement en état vide honnête malgré la 500 de `/stats/advanced`, avec repli silencieux et transparent pour l'utilisateur.

### Un deuxième écart avec la maquette, honnête plutôt que corrigé en façade

La maquette affichait « +16 % vs an dernier » sur le graphique de revenus, avec une courbe en pointillés superposant les 12 mois de l'année précédente. L'API ne fournit **aucune donnée mensuelle de l'année précédente** — seulement un pourcentage agrégé (`comparison.revenue_change_percent`), et qui compare le **mois courant au mois précédent**, pas à l'année dernière. La courbe en pointillés a été retirée (aucune donnée pour la tracer) et le badge de comparaison reformulé en conséquence (« vs le mois précédent »), affiché seulement quand `/stats/advanced` a réussi (ce champ n'existe pas sur la version simple).

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/landlord.ts` | Nouveau — `LandlordStats` et ses champs optionnels propres à `/stats/advanced` |
| `app/composables/useLandlordStatsApi.ts` | Nouveau — `fetchStats()` avec repli automatique `/stats/advanced` → `/stats` |
| `app/pages/pro/index.vue` | Réécrit — alertes réelles (groupées par sévérité réelle, pas une liste figée), KPIs réels, graphique de revenus réel (sans comparaison inventée), donut d'occupation réel, top biens réels (`topProperties` si disponible, sinon les biens triés côté client par revenu) |
| `app/layouts/pro.vue` | Nom/rôle réels (`useAuthUser()`), cloche de notifications réelle (`LayoutNotificationBell`, déjà construite au Lot 9) — remplace un second bouton mort identique à celui corrigé côté locataire |

### Ce qui est hors périmètre, et pourquoi

- **« Contexte de travail » (perso/agence) et les onglets Propriétaire/Agent/Agence** : mock intentionnellement laissé tel quel. Ce sont les mêmes mécanismes que le contexte d'équipe (I2), documenté depuis le socle comme bloqué sur une correction backend (`switch-context` n'alimente pas correctement la paire de jetons) — non résolu depuis, donc toujours hors de portée.
- **Actions par alerte** (« Relancer », « Voir le motif », « Annuler ») : chaque alerte pointe vers l'écran le plus pertinent (`/pro/baux`, `/pro/demandes`) plutôt que vers une action dédiée — ces actions dépendent des lots IP encore à construire (gestion des baux, des biens).
- **Note moyenne, avis, visites en attente/confirmées/réalisées** : uniquement disponibles via `/stats/advanced` — absents du tableau de bord si le repli sur `/stats` a été nécessaire (comportement honnête, pas une case vide qui prétend que la donnée est à zéro).

### Tests automatisés

Aucune fonction pure nouvelle : la logique de ce lot (regroupement par sévérité, tri des biens par revenu) est une réduction simple sur des données déjà typées.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Compte propriétaire réel créé pour ce lot, connecté via Playwright, sans rien mocker :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `POST /property` (créer un bien de test) | 403 `error.KYC_REQUIRED` | Confirme qu'aucun bien réel n'est atteignable sans passer le KYC — le compte reste à l'état zéro pour ce lot |
| Chargement de `/pro` | `GET /property/landlord/stats/advanced` → **500** (×2, ofetch réessaie automatiquement les GET en erreur), puis `GET /property/landlord/stats` → 200 | Tableau de bord affiché intégralement en état zéro honnête : nom et rôle réels dans la sidebar, cloche de notifications réelle sans badge, 6 KPIs à 0/100%, graphique de revenus avec les vrais mois (mars → sept.) tous à 0 FCFA, donut d'occupation à 0 %, « Aucun bien publié pour l'instant. » |
| Zéro erreur de rendu malgré la 500 de l'endpoint enrichi | — | Le repli silencieux fonctionne exactement comme prévu, aucune bannière d'erreur ne s'affiche à tort |

### Ce qui n'a pas pu être testé en conditions réelles, et pourquoi

- **`/stats/advanced` sur un compte avec de vrais biens** (comparaison, top biens triés côté serveur, note moyenne) : bloqué par le KYC requis pour publier un bien — impossible de faire sortir ce compte de l'état zéro par l'API. Le code a été relu attentivement contre le schéma exact plutôt que deviné, et le repli vers `/stats` reste sûr dans tous les cas.
- **Alertes réelles avec du contenu** (`alerts[]` non vide) : le compte de test n'en génère aucune à l'état zéro — la mise en forme par sévérité a été vérifiée sur la structure du schéma, pas sur un vrai contenu affiché.

### Prochaine étape proposée

**IP2 — Mes biens** (`/pro/biens`), qui consomme `GET /property/owner/me` (déjà vérifié à vide dans ce lot) et se heurtera probablement au même mur du KYC pour toute création — l'occasion de documenter précisément ce que l'écran doit afficher à un propriétaire qui n'a pas encore terminé sa vérification.

---

## Lot 15 — IP2 Mes biens

**Date** : 2026-09-20

### Le mur du KYC confirmé une deuxième fois, sous une autre forme

Confirmé au Lot 14 pour `POST /property`, le même mur bloque toute écriture de bien : `POST /property/:id/units` (ajouter une unité) renvoie **403 « Vous n'avez pas les droits pour cette action »** sur un bien qu'on ne possède pas — attendu — mais aussi, très probablement, pour la même raison KYC sur un bien qu'on possèderait sans être vérifié (non isolable directement puisque ce compte de test n'en possède aucun). Avant d'abandonner, tentative de faire passer le KYC par l'API elle-même : `POST /kyc/documents` (déjà câblé depuis le Lot 3) accepte bien le dépôt d'un document, mais `kyc_status` reste `"pending"` immédiatement après — confirmé qu'aucune validation automatique n'existe sur cette instance, la revue est manuelle. La création réelle de biens reste donc hors de portée de ce test, mais **le chemin d'erreur, lui, est entièrement vérifié en direct** : formulaire rempli avec de vrais champs de référentiel, requête envoyée, 403 reçu et affiché proprement (« Vous n'avez pas les droits pour cette action. ») plutôt qu'un plantage ou un message technique brut.

### Une découverte utile, sans posséder de bien réel : la lecture est publique même pour un bien qu'on ne possède pas

`GET /property/:id` (déjà utilisé pour la fiche logement publique, I4) ne vérifie pas la propriété du bien consulté — logique, puisque c'est la même route que celle utilisée par n'importe quel visiteur. Ça a permis de vérifier la fiche « Mes biens » (`/pro/biens/fiche`) avec de vraies données complètes (nom, quartier, unité réelle avec son vrai statut/loyer) sans avoir besoin d'un bien appartenant réellement au compte de test — une lecture, dans ce cas précis, n'a pas besoin d'être un test d'écriture pour être une vraie vérification.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/landlordProperty.ts` | Nouveau — payloads d'écriture (`CreatePropertyPayload`, `CreateUnitPayload`…). La lecture réutilise les types déjà écrits pour I4 (`PropertySearchResult`/`UnitSearchResult`) — `GET /property/owner/me` et `GET /property/:id` renvoient la même forme que la recherche publique |
| `app/composables/useLandlordPropertiesApi.ts` | Nouveau — `fetchMine`, `create`, `update`, `remove`, `createUnit`, `updateUnit`, `removeUnit`, `uploadImage` + `addMedia` (upload en deux temps : fichier puis rattachement de l'URL) |
| `app/pages/pro/biens/index.vue` | Réécrit — liste réelle (`GET /property/owner/me`), recherche et filtre de statut réels, revenu mensuel calculé depuis les vraies unités occupées |
| `app/pages/pro/biens/fiche.vue` | Réécrit — onglet Unités réel (ajout inclus), onglet Photos avec upload réel en deux étapes, onglet Performance partiellement réel (revenu/occupation calculés, avis réels si disponibles — jamais de « vues de l'annonce » inventées, aucune donnée de ce type n'existe), onglets Points d'intérêt/Historique honnêtement marqués indisponibles (aucun endpoint) plutôt que simulés |
| `app/components/pro/UniteModal.vue` | Réécrit — prend `propertyId`/`propertyName` en props plutôt que le mode générique `useProModal()` (qui ne portait pas l'identité du bien cible), champs Type/Eau/Compteur alimentés par les vrais référentiels (I4) |
| `app/layouts/pro.vue` | `<ProUniteModal />` global retiré (montée localement dans `fiche.vue` maintenant qu'elle a besoin de props) |

### Ce qui est hors périmètre, et pourquoi

- **`pro/biens/ajouter.vue`** (assistant de création en 6 étapes) : laissé en mock dans ce lot. Sa dernière étape (« Agent assigné ») dépend du système de mandats/équipe, lié au même blocage backend que le contexte d'équipe (I2, toujours non résolu). Et comme `POST /property` est de toute façon bloqué par le KYC pour ce compte de test, le construire maintenant n'aurait pas pu être vérifié au-delà de la relecture de schéma — proposé comme prochaine étape ci-dessous, une fois isolé de la dépendance aux mandats.
- **Suppression d'un bien/d'une unité** (`DELETE`) : composables prêts (`remove`, `removeUnit`) mais aucune UI câblée dessus dans ce lot — pas de bien de test sur lequel vérifier une suppression sans risquer de perdre les seules données de test disponibles (celles d'autres propriétaires, non supprimables de toute façon par ce compte).
- **Tarifs et disponibilité** (`/pro/tarifs`), **Documents** (`/pro/documents`) : modules distincts de la liste de navigation, pas encore ouverts.

### Tests automatisés

Aucune fonction pure nouvelle : ce lot est du branchement CRUD sur écran, sans logique à isoler.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Compte propriétaire de test du Lot 14, connecté via Playwright, sans rien mocker :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `GET /property/owner/me` sur un compte sans bien | 200, `data: []` | État vide honnête (« Vous n'avez pas encore de bien »), bouton « Ajouter un bien » mis en avant |
| `/pro/biens/fiche?id=` sans identifiant | — | Message d'erreur clair plutôt qu'un plantage |
| `/pro/biens/fiche?id=<bien réel d'un autre propriétaire>` | `GET /property/:id` → 200, `GET /reviews/property/:id/stats` → 200 | Fiche affichée avec les vraies données (nom, quartier, unité réelle avec son statut et son loyer) |
| Remplir et soumettre « Ajouter une unité » sur ce bien étranger, avec de vrais champs de référentiel (Studio, Réseau SONEB, Individuel) | `POST /property/:id/units` → **403** | Message mappé affiché proprement (« Vous n'avez pas les droits pour cette action. »), formulaire resté rempli, aucun plantage |
| `POST /kyc/documents` sur le compte propriétaire | 201, document accepté | `kyc_status` reste `"pending"` juste après — confirme l'absence de validation automatique sur cette instance |

### Prochaine étape proposée

**`pro/biens/ajouter.vue`**, en retirant l'étape d'assignation d'agent (bloquée par le même souci de mandats que le contexte d'équipe) — ou basculer sur un autre module Pro moins dépendant du KYC, comme **IP-wallet** ou **IP-profil**, qui utilisent les mêmes endpoints `/wallet/*` et `/profile/me` déjà entièrement vérifiés côté locataire (Lots 6 et 10) et donc testables sans dépendre d'un bien réel.

---

## Lot 16 — IP3 Wallet et Profil Pro

**Date** : 2026-09-20

### Choix du lot : le seul terrain testable sans se heurter au mur du KYC

Après deux lots bloqués par le KYC pour tout ce qui touche à un bien réel (IP1, IP2), ce lot cible délibérément deux modules dont les endpoints sont **par utilisateur, pas par bien** : le wallet (`/wallet/*`) et le profil (`/profile/me`, `/settings/me/notifications`) sont exactement les mêmes endpoints déjà entièrement câblés et vérifiés côté locataire (Lots 6 et 10) — un compte propriétaire y a accès sans restriction, KYC ou pas. Résultat : le lot le plus complètement vérifié en direct depuis IP1.

### Une preuve concrète et inattendue du mur du KYC, révélée par ce lot lui-même

En construisant l'onglet « Vérification » du profil, un vrai champ jusque-là non exploré est apparu : `landlord_kyb_status` (nul par défaut). Il est resté `null` tant qu'aucun champ professionnel (`company`/`ifu`/`rccm`) n'était renseigné — puis, en enregistrant une raison sociale de test depuis ce même écran, il est passé à `"pending"` **en direct**, confirmé par un nouvel appel `GET /profile/me`. Ce champ explique très probablement *pourquoi* `POST /property` exige le KYC (IP1/IP2) : la vérification KYB (Know Your Business) d'un compte professionnel ne démarre qu'une fois son identité pro renseignée, et rien ne peut se publier avant. L'écran de vérification rend maintenant ce mécanisme visible à l'utilisateur, plutôt que de le laisser deviner pourquoi la création d'un bien échoue.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/profile.ts` | `ProfileMe` complété avec les champs propriétaire/agence (`agency_company_name`, `landlord_kyb_status`, `agency_kyb_status`, `public_bio`) ; `UpdateProfilePayload` complété avec `company`/`ifu`/`rccm` (vérifié en direct pour `company`) |
| `app/types/wallet.ts` | `WithdrawalRequest`, `WithdrawalMethod`, `WithdrawalStatus` (3 valeurs réelles : `pending`/`processed`/`rejected` — pas 4 comme le laissait supposer la maquette) |
| `app/composables/useWalletApi.ts` | `requestWithdrawal`, `fetchWithdrawals` ajoutés — mêmes endpoints `/wallet/withdraw*` que ceux documentés, jamais câblés avant ce lot |
| `app/pages/pro/wallet.vue` | Réécrit — soldes réels (`useTenantWallet()`, le composable partagé déjà construit pour le locataire, réutilisé tel quel car le wallet est par utilisateur, pas par rôle), historique réel des demandes de retrait |
| `app/components/pro/RetraitModal.vue` | Réécrit — vraie demande de retrait, vraies erreurs serveur (solde insuffisant, montant minimum) |
| `app/pages/pro/profil.vue` | Réécrit — Identité (lecture + édition réelles des champs pro), Vitrine (lien réel vers `/vitrine/:id`, construite au Lot 13), Sécurité (mot de passe + suppression de compte, réutilisés du Lot 10), Vérification (statuts KYC **et** KYB réels), Notifications (canaux réels, réutilisés du Lot 10). Préférences honnêtement marquée indisponible |
| `app/layouts/pro.vue` | (déjà fait au Lot 14, inchangé ici) |

### Ce qui est hors périmètre, et pourquoi

- **Onglet « Préférences »** (relance automatique, prélèvement par défaut, retenue de garantie, état des lieux à l'arrivée) : aucun endpoint de préférences globales par compte n'existe. Ces réglages sont tous **par bail ou par unité** (`PATCH /leases/:id/auto-debit`, `booking_retention_percentage`/`requires_booking_inventory` à la création d'une unité, IP2) — pas un panneau de réglages centralisé. Marqué explicitement indisponible plutôt que de fabriquer un panneau qui ne modifierait rien de réel.
- **Approbation/rejet des retraits par un admin** (`POST /wallet/withdrawals/:id/approve|reject`) : hors périmètre de l'espace Pro, ce sont des actions d'administration de la plateforme.
- **`agency_company_name`/`agency_ifu`/`agency_rccm`** : typés mais non exposés dans le formulaire d'édition — champs réservés aux comptes `agency`, pas testables avec ce compte `landlord`.

### Tests automatisés

Aucune fonction pure nouvelle : ce lot réutilise très largement des composables déjà construits et testés côté locataire.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Compte propriétaire de test des Lots 14-15, connecté via Playwright, sans rien mocker :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `/pro/wallet` sur un compte sans revenu | `GET /wallet/me` → 200, `GET /wallet/withdrawals/my` → 200 | Deux soldes réels à 0 FCFA, « Aucune demande de retrait pour l'instant » |
| Ouverture de la modale de retrait | — | Solde réel affiché dans le bandeau d'info, bouton correctement désactivé (montant à 0, téléphone vide) |
| `POST /wallet/withdraw` avec un montant réel (hors UI, pour confirmer le message d'erreur) | 400 « Solde insuffisant » | Message réel, passerait par le mapping d'erreurs générique déjà en place depuis le Lot 1 |
| `/pro/profil`, onglet Identité | `GET /profile/me` → 200 | « Raison sociale : Renseigné » reflète le champ `company` déjà défini en direct pour vérifier ce lot |
| Onglet Vérification | — | KYC `pending` et KYB `« En cours de vérification »` tous deux réels et distincts, affichés côte à côte |
| Onglet Notifications | `GET /settings/me/notifications` → 200 | 3 canaux réels, tous activés, togglables (mécanisme déjà vérifié en direct au Lot 10 côté locataire) |

### Prochaine étape proposée

**`pro/biens/ajouter.vue`**, en retirant l'étape d'assignation d'agent — le seul module Pro encore ouvert qui ne dépende pas directement d'un bien déjà existant, même si sa vérification restera limitée au chemin d'erreur (KYC) comme pour IP2. Alternative : **IP-messages**, qui réutilise la messagerie déjà entièrement construite côté locataire (Lot 9) sans dépendre d'aucun bien.

---

## Lot 17 — IP4 Messagerie Pro

**Date** : 2026-09-20

### Le lot le mieux vérifié depuis le début de l'espace Pro : un aller-retour réel complet

La messagerie (`/messaging/*`) est par utilisateur, pas par rôle ni par bien — exactement le même terrain que le wallet et le profil (Lot 16). Pour vérifier avec de vraies données plutôt qu'un état vide, une conversation a été créée pour de vrai (`POST /messaging/conversations`, depuis le compte locataire habituel, ciblant ce compte propriétaire avec `recipient_id`) sur une unité réelle. Le compte propriétaire a ensuite répondu depuis l'écran construit dans ce lot (`POST /messaging/conversations/:id/messages` → 201), et la réponse a été relue depuis le compte locataire par un appel `GET` séparé : **le message du propriétaire y apparaît bien**, avec le bon expéditeur (`sender.first_name: "Test", last_name: "Landlord"`). Aller-retour complet vérifié dans les deux sens, pas seulement l'envoi.

### Un rôle de participant confirmé pour un vrai compte propriétaire

La conversation créée montre `role: "landlord"` pour ce compte (vs `role: "tenant"` pour l'autre partie) — confirme au passage que `ParticipantRole` (élargi au Lot 9 après avoir vu `"agency"` sur un compte agence réel) couvre bien aussi la valeur `"landlord"` telle qu'elle apparaît réellement dans les données, pas seulement dans l'énumération Swagger.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/pages/pro/messages.vue` | Réécrit sur le même socle que `locataire/messages.vue` (Lot 9, `useMessagingApi()`, `useFetchBlock`, `useProtectedFile` pour les pièces jointes) : conversations réelles, envoi/réception de texte, filtre par bien réel (dérivé des conversations elles-mêmes, pas d'un endpoint dédié), rôle réel de l'interlocuteur affiché (Locataire/Agent/Agence/Admin) |

Les réponses rapides (« Merci de votre message », etc.) sont conservées telles quelles : ce sont de simples raccourcis de saisie qui déclenchent le même `sendMessage()` réel, pas une donnée à intégrer.

### Ce qui est hors périmètre, et pourquoi

- **« Assigner » une conversation à un membre de l'équipe** : retiré. Dépend du système de mandats/équipe, bloqué depuis le socle par le même souci backend que le contexte d'équipe (I2) — jamais résolu depuis, revérifié non pertinent ici.
- **Démarrer une conversation depuis zéro côté Pro** (répondre à une demande publique, contacter un candidat) : `createConversation()` existe déjà (Lot 11) mais n'est câblé sur aucun écran Pro dans ce lot — viendra naturellement avec IP-demandes ou IP-visites, qui sont les points d'entrée naturels d'une nouvelle conversation côté propriétaire.

### Tests automatisés

Aucune fonction pure nouvelle : ce lot réutilise entièrement l'infrastructure de messagerie déjà construite et testée au Lot 9.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Compte propriétaire de test des Lots 14-16, connecté via Playwright, sans rien mocker :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| Création d'une conversation réelle (compte locataire → ce propriétaire, sur une vraie unité) | `POST /messaging/conversations` → 201, `role: "landlord"` confirmé | — |
| Chargement de `/pro/messages` | `GET /messaging/conversations` → 200, `GET .../messages` → 200, `PATCH .../read` → 200 | Conversation réelle affichée : rôle « Locataire », sujet « Studio CADJEHOU », message initial réel |
| Réponse envoyée depuis l'écran Pro | `POST .../messages` → **201** | Message affiché instantanément côté propriétaire (bulle verte, alignée à droite) |
| Relecture du même fil depuis le compte locataire (appel séparé, hors UI) | `GET .../messages` → 200, 2 messages | Le message du propriétaire y figure bien, avec le bon expéditeur — aller-retour confirmé dans les deux sens |

### Prochaine étape proposée

**`pro/biens/ajouter.vue`** (assistant de création, sans l'étape agent) reste la seule pièce du module « Biens » encore en mock — sa vérification restera limitée au chemin d'erreur KYC. Alternative : **IP-demandes** ou **IP-visites**, qui referment la boucle laissée ouverte ici (démarrer une conversation depuis une réponse à une demande) mais se heurteront au même mur du KYC/KYB pour toute action qui suppose un bien réel appartenant à ce compte.

---

## Lot 18 — IP5 Demandes et visites côté Pro

**Date** : 2026-09-21

### La maquette « Demandes reçues » n'a aucune existence côté API

Recherche exhaustive du Swagger (`housing-request`, `application`, `candidat`) : il n'existe **aucune route de candidature directe à un bien précis**. Le seul flux réel de mise en relation locataire→propriétaire est la place de marché des recherches publiées (`GET /housing-requests/open`, `POST /housing-requests/:id/respond`), qui correspondait déjà conceptuellement à l'onglet « Demandes publiques » de la maquette — et à la page `pro/dempub.vue`, elle-même un doublon de cet onglet. Les deux ont été fusionnés en une seule page réelle, `pro/demandes.vue` ; l'onglet fictif « Demandes reçues » et la route `pro/dempub.vue` ont été supprimés, ainsi que son entrée dans `NAV_GROUPS`/`PAGE_TITLES` (`useProSpace.ts`).

### Un vrai bug client trouvé par la vérification en direct, pas par relecture

`GET /housing-requests/open` renvoie parfois `requester_display_name: null` (confirmé en direct sur les données réelles de la plateforme — un locataire sans prénom renseigné). `CoreAvatar` appelle `props.name.split(...)` sans filet : sur ce `null`, Vue lève une exception de rendu qui **fait disparaître toute la page**, pas seulement la carte concernée — aucun état de chargement, d'erreur ou de liste vide ne s'affichait, juste un écran blanc après l'intro. Une relecture du code seule n'aurait rien montré (le typage `HousingRequestOpenItem.requester_display_name: string | null` était déjà correct) : c'est le test Playwright contre les vraies données, pas un typage strict, qui a débusqué le problème. Corrigé par un repli `requesterName(r) = r.requester_display_name ?? 'Locataire'`, utilisé à la fois pour l'avatar et le nom affiché.

### Les actions propriétaire sur les visites sont réelles mais invérifiables avec de vraies données dans cet environnement

`PATCH /visits/:id/confirm|reject|complete|reschedule` existent et sont correctement câblées, mais **aucune visite réelle n'est atteignable** pour ce compte de test : `POST /visits` reste bloqué par `error.KYC_REQUIRED` **côté locataire aussi**, pas seulement côté propriétaire (IP1/IP2). Vérifié en direct : un nouveau compte locataire fraîchement onboardé, tentant de demander une visite sur une unité réelle appartenant à un autre propriétaire, reçoit le même 403 `error.KYC_REQUIRED` que celui déjà documenté pour `POST /property`. Comme pour IP1/IP2, aucun contournement n'existe (validation manuelle uniquement) — les actions `confirm`/`reject`/`complete`/`reschedule` sont donc livrées d'après le schéma Swagger vérifié, mais leur chemin nominal reste non testable en direct dans cet environnement.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/tenant.ts` | `VisitSummary` complété avec `rejection_reason` et `tenant` (visible uniquement côté `role=landlord`) ; nouveaux types `HousingRequestOpenItem`, `PaginatedResult<T>`, `HousingRequestRespondResult` |
| `app/composables/useVisitsApi.ts` | `fetchMine()` devient `role`-aware (`'tenant' \| 'landlord'`, défaut `'tenant'` — rétrocompatible, vérifié par grep sur l'unique site d'appel locataire) ; `confirm`, `reject`, `complete`, `reschedule` ajoutés |
| `app/composables/useHousingRequestsApi.ts` | `fetchOpen(filters)` (`GET /housing-requests/open`, public) et `respond(id, unitId, message?)` (`POST /housing-requests/:id/respond`) ajoutés |
| `app/pages/pro/visites.vue` | Réécrit — visites réelles du propriétaire (`role=landlord`), actions réelles selon le statut (`pending` → Confirmer/Refuser, `confirmed` → Marquer réalisée/Replanifier), bouton « + Créer un créneau » et actions « Créer une demande »/« Déléguer » retirés (aucun concept de créneau ni de délégation côté API) |
| `app/pages/pro/demandes.vue` | Réécrit — une seule page réelle : recherches publiques réelles, sélecteur des propres unités du propriétaire (`GET /property/owner/me`) pour proposer une réponse, état honnête si le compte ne possède aucune unité |
| `app/pages/pro/dempub.vue` | **Supprimé** — doublon de l'onglet « Demandes publiques » désormais fusionné dans `demandes.vue` |
| `app/composables/useProSpace.ts` | Entrée de navigation `dempub` retirée de `NAV_GROUPS` et `PAGE_TITLES` (vérifié par grep : aucune autre référence dans `app/`) |

### Ce qui est hors périmètre, et pourquoi

- **« Créer un créneau »** (bouton de page dans la maquette `visites.vue`) : aucun concept de créneau de visite n'existe côté API — une visite se crée uniquement à l'initiative du locataire (`POST /visits`), jamais du propriétaire.
- **« Déléguer »** une visite ou une demande à un membre de l'équipe : dépend du système de mandats/équipe, bloqué depuis le socle par le même souci backend que le contexte d'équipe (I2).
- **Pagination de `GET /housing-requests/open`** : chargée en une seule page (`limit: 30`), sans « charger plus » — le volume réel observé (5 demandes ouvertes) ne le justifie pas encore ; à ajouter si le volume grossit.

### Tests automatisés

Aucune fonction pure nouvelle extractible : ce lot est du branchement CRUD/affichage sur des endpoints déjà typés, comme les Lots 15 à 17.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Compte propriétaire de test des Lots 14-17, connecté via Playwright (flux OTP corrigé pendant ce lot : la saisie doit déclencher un vrai `@input` par caractère puis un clic explicite sur « Vérifier » — un remplissage direct des champs sans passer par ce chemin laisse la session non authentifiée, silencieusement, car la structure de la page Pro est statique et s'affiche même sans session) :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `/pro/visites` sur un compte sans visite | `GET /visits?role=landlord` → 200, `[]` | État vide honnête (« Aucune visite demandée pour l'instant sur vos biens. »), aucune erreur |
| `/pro/demandes` | `GET /housing-requests/open` → 200, 5 demandes réelles | Les 5 cartes s'affichent correctement, y compris celle au `requester_display_name` nul (bug ci-dessus, corrigé et revérifié) |
| Clic « Proposer un de mes biens » sur une demande, compte sans bien | `GET /property/owner/me` → 200, `data: []` | Message honnête « Vous n'avez aucune unité à proposer pour le moment. », pas de formulaire vide fictif |
| `POST /housing-requests/:id/respond` avec l'id d'une unité réelle n'appartenant pas à ce compte (hors UI, pour vérifier le chemin d'erreur) | **403** « Cette unité ne vous appartient pas. » | Mappé par le gestionnaire d'erreurs générique déjà en place — le composant afficherait ce message tel quel |
| `POST /visits` depuis un compte locataire fraîchement onboardé, contre une unité réelle (hors UI, pour vérifier le mur KYC signalé plus haut) | **403** `error.KYC_REQUIRED` | Confirme qu'aucune visite réelle n'est atteignable pour tester `confirm`/`reject`/`complete`/`reschedule` dans cet environnement |

### Ce qui n'a pas été testé, et pourquoi

- **`confirm`, `reject`, `complete`, `reschedule`** sur une vraie visite : aucune visite réelle n'est créable dans cet environnement (mur KYC confirmé ci-dessus, des deux côtés de la relation). Le code suit fidèlement le schéma Swagger (`PATCH /visits/:id/<action>`, corps `{ confirmed_at }` ou `{ reason }` selon l'action) mais son chemin nominal reste non vérifié en direct — même limite déjà documentée pour la création de bien (IP1/IP2).
- **`respond()` en chemin de succès** (créer une vraie proposition) : ce compte de test ne possède aucune unité (bloqué par le même mur KYC), donc aucun `unit_id` valide à proposer. Le chemin d'erreur (403 sur une unité étrangère) a été vérifié à la place, comme au Lot 15 pour la création d'unité.

### Prochaine étape proposée

**`pro/reservations.vue`** — `GET /bookings/landlord` existe et suit le même schéma « par utilisateur, pas par bien » déjà exploité aux Lots 16-17 (wallet, profil, messagerie), donc testable sans dépendre d'un bien réel appartenant à ce compte. Alternative : **`pro/biens/ajouter.vue`**, qui reste la seule pièce du module Biens encore en mock mais dont la vérification restera, comme toujours, limitée au chemin d'erreur KYC.

---

## Lot 19 — IP6 Réservations et codes promo

**Date** : 2026-09-21

### La portée « portefeuille » d'un code promo ne dépend d'aucun bien réel — un vrai déblocage face au mur du KYC

Contrairement à tout ce qui touche un bien (IP1, IP2, IP5), `POST /promo-codes` avec `landlord_id` seul (portée « tout mon portefeuille ») **a réussi en direct** sur ce compte de test qui ne possède toujours aucun bien réel — aucune erreur KYC, aucun 403. Une vraie création, une vraie lecture (`GET /promo-codes/mine`), un vrai bascule actif/inactif et une vraie suppression ont donc pu être vérifiés de bout en bout dans ce lot, une première pour un flux d'écriture côté Pro depuis IP1.

### Un vrai bug backend trouvé en vérifiant l'action « Désactiver » en direct

`PATCH /promo-codes/:id` avec `{ is_active: false }` (exactement le corps documenté par `UpdatePromoCodeCommand`, qui ne liste pas de champ `id`) renvoie **400** `VALIDATION_ERROR` — `{ field: 'id', rule: 'isUuid', defaultMessage: 'id must be a UUID' }` — alors que l'id est bien un UUID valide dans l'URL. Reproduit hors UI (curl) pour isoler la cause : le endpoint exige en réalité que `id` soit **dupliqué dans le corps de la requête**, en plus du paramètre d'URL — un champ que son propre schéma Swagger ne documente pas. Confirmé par contournement : en renvoyant `{ id, is_active: false }`, la requête réussit (200). Contourné dans `usePromoCodesApi.update()` en dupliquant systématiquement `id` dans le corps, avec un commentaire expliquant pourquoi — un bug de validation backend, pas une intention documentée.

### La forme réelle d'un code promo diverge du schéma `Create`/`Update`

`GET /promo-codes/mine` et la réponse de `POST /promo-codes` (vérifiées en direct, aucun exemple Swagger fourni pour ce endpoint) montrent que `referred_discount_value`/`referrer_reward_value` reviennent en **chaîne** (`"10.00"`) malgré un `number` en entrée — cohérent avec la convention « montants en chaînes » déjà établie ailleurs dans le projet, mais non documentée pour ce endpoint précis. Deux champs absents des DTO `Create`/`Update` apparaissent aussi sur l'entité réelle : `created_by` et `updated_at`. Le type `PromoCodeSummary` a été corrigé en conséquence.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/landlordBookings.ts` | `LandlordBookingSummary` (forme de `GET /bookings/landlord`, tirée du seul `example` Swagger disponible) ; `PromoCodeSummary`, `CreatePromoCodePayload`, `UpdatePromoCodePayload`, `PromoCodeConstraints` — la forme réelle de `PromoCodeSummary` corrigée après vérification en direct (voir ci-dessus) |
| `app/composables/useLandlordBookingsApi.ts` | `fetchMine()` — lecture seule, aucune action propriétaire n'existe pour ce flux |
| `app/composables/usePromoCodesApi.ts` | `fetchMine`, `create`, `update` (avec le contournement `id` dupliqué, documenté), `remove` |
| `app/composables/useLandlordPromoCodes.ts` | Nouveau composable partagé (`useState`, verrou anti-double-fetch) — même principe que `useTenantLeases()` — car la liste est lue à la fois par la page et par `ProPromoModal.vue`, montée globalement dans `layouts/pro.vue`, hors de l'arbre de la page |
| `app/pages/pro/reservations.vue` | Réécrit — onglet Réservations (réel, lecture seule), onglet Codes promo (réel : liste, activer/désactiver) |
| `app/components/pro/PromoModal.vue` | Réécrit sur le même squelette visuel que la maquette — création réelle avec sélecteur de portée (portefeuille/bien/unité), réduction locataire et récompense parrain réelles, dates de validité réelles |

### Ce qui est hors périmètre, et pourquoi

- **Confirmer/annuler une réservation courte durée côté propriétaire** : aucune action de ce type n'existe dans le Swagger pour `/bookings/*` — le flux semble entièrement piloté par le paiement du locataire (`POST /bookings/:id/pay`), pas par une validation manuelle du propriétaire.
- **Contraintes avancées d'un code promo** (`constraints` : `newTenantsOnly`, `minNights`, `allowedDaysOfWeek`, etc.) : typées dans `PromoCodeConstraints` pour fidélité au schéma, mais non exposées dans le formulaire de création — la maquette elle-même ne montrait que code/portée/réduction/dates, pas ces critères d'éligibilité additionnels.
- **Modifier les autres champs d'un code existant** (réduction, dates, portée) : seul le bascule actif/inactif est câblé sur cette page, cohérent avec la maquette qui n'affichait qu'un statut togglable, pas un formulaire d'édition complet.

### Tests automatisés

Aucune fonction pure nouvelle extractible.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Compte propriétaire de test des Lots 14-18, connecté via Playwright :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `/pro/reservations`, onglet Réservations, compte sans réservation | `GET /bookings/landlord` → 200, `[]` | État vide honnête (« Aucune réservation courte durée reçue pour l'instant. ») |
| `POST /promo-codes` avec portée « tout mon portefeuille » et une réduction de 15 %, depuis le vrai formulaire de `ProPromoModal.vue` | **201** | Code réel créé, écran de confirmation affiché, apparaît instantanément dans la liste au rechargement automatique (`useLandlordPromoCodes`) |
| Bascule « Actif » → « Désactivé » sur un vrai code, avant le correctif `usePromoCodesApi.update()` | **400** `VALIDATION_ERROR` sur le champ `id` (bug ci-dessus) | Repéré en direct via Playwright + confirmé isolé par curl |
| Même bascule, après correctif (`id` dupliqué dans le corps) | **200** | Le badge passe réellement à « Désactivé », revérifié par un rechargement de la liste |
| Nettoyage : `DELETE /promo-codes/:id` sur les deux codes de test créés pour cette vérification (`uses_count: 0` chacun) | 200, `{ success: true }` | Compte de test laissé propre après la vérification |

### Prochaine étape proposée

**`pro/biens/ajouter.vue`** — l'assistant de création de bien reste la dernière pièce du module Biens encore en mock ; sa vérification restera limitée au chemin d'erreur KYC comme documenté depuis IP1. Alternative : **`pro/signalements.vue`**, qui réutilise probablement `/signals` déjà typé côté locataire (Lot 12) et pourrait suivre le même schéma « lecture par utilisateur » que ce lot, à confirmer sur le Swagger avant de s'engager.

---

## Lot 20 — IP8 Signalements côté Pro

**Date** : 2026-09-21

### Une vraie place de marché artisans découverte, mais volontairement laissée hors périmètre

En explorant `PATCH /signals/:id`, la recherche du mot-clé `artisan` dans le Swagger a révélé un système complet et réel : `POST /artisan-requests`, des offres (`.../offers`), un flux d'acceptation/paiement/réalisation, des avis, et même des litiges (`.../dispute`). Le bouton « Créer une demande d'artisan » de la maquette a donc une vraie contrepartie API — mais c'est un sous-système entier, avec son propre cycle de vie, pas une simple action de plus sur cette page. Retiré de ce lot et proposé comme son propre module (« IP-artisans ») plutôt que d'être bâclé ici.

### `GET /signals` est par utilisateur, pas par bien — même famille que le wallet, la messagerie et les codes promo

Comme aux Lots 16, 17 et 19, aucun paramètre de rôle n'est nécessaire : le même endpoint que celui câblé côté locataire (Lot 12, `useSignalsApi().list()`) renvoie automatiquement les signalements *reçus* quand l'appelant est un propriétaire — confirmé en direct (200, `[]` sur ce compte de test sans bien). `assigned_to` (nom libre d'artisan/prestataire) est un champ de `UpdateSignalDto` totalement indépendant du système d'équipe/mandats bloqué depuis le socle (I2) — l'action « Assigner » a donc pu être câblée pour de vrai, sans dépendre de ce blocage.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/tenant.ts` | `UpdateSignalPayload` ajouté (`status`, `priority`, `assigned_to`, `resolution_notes`) — `SignalSummary` déjà complet depuis le Lot 12, réutilisé tel quel |
| `app/composables/useSignalsApi.ts` | `update(id, payload)` ajouté — `PATCH /signals/:id`, réutilise le même composable que le locataire (Lot 12) plutôt que d'en dupliquer un |
| `app/pages/pro/signalements.vue` | Réécrit — liste réelle, filtre statut réel (paramètre serveur), filtres priorité/bien réels mais appliqués côté client (non supportés en paramètre par `GET /signals`), changement de statut réel (transitions bornées : `open→in_review/closed`, `in_review→resolved/closed`, `resolved→closed`), assignation réelle d'un artisan (texte libre) |

### Ce qui est hors périmètre, et pourquoi

- **« Créer une demande d'artisan »** : retiré (voir découverte ci-dessus) — un vrai sous-système (`artisan-requests`, offres, paiement, avis, litiges) qui mérite son propre lot plutôt qu'un bouton isolé sur cette page.
- **Filtrer par bien côté serveur** : `GET /signals` n'accepte que `signal_type`/`status` en paramètres — le filtre « Tous les biens » reste réel mais s'applique côté client sur les résultats déjà chargés, pas via un paramètre d'API inexistant.
- **Transitions de statut non bornées** : seules les transitions listées dans `NEXT_STATUSES` sont proposées (`open→in_review/closed`, `in_review→resolved/closed`, `resolved→closed`) — pas de retour arrière ni de passage direct à `cancelled` (réservé, selon la description Swagger, à l'auteur du signalement, pas au propriétaire).

### Tests automatisés

Aucune fonction pure nouvelle extractible.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Compte propriétaire de test des Lots 14-19, connecté via Playwright :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `/pro/signalements` sur un compte sans bien | `GET /signals` → 200, `[]` | État vide honnête (« Aucun signalement sur vos biens pour l'instant. »), les trois filtres visibles et fonctionnels |
| Changement du filtre statut vers « Ouvert » | `GET /signals?status=open` → 200, `[]` | Requête réelle avec le bon paramètre, toujours honnêtement vide |
| `PATCH /signals/:id` avec un id inexistant (hors UI, pour vérifier le chemin d'erreur) | **404** « Signalement introuvable » | Mappé par le gestionnaire d'erreurs générique déjà en place — le composant afficherait ce message tel quel |

### Ce qui n'a pas été testé, et pourquoi

- **Changement de statut et assignation en chemin de succès** : aucun signalement réel n'est atteignable pour ce compte (aucun bien possédé, donc aucun signalement ne peut le cibler) — même mur que celui documenté pour les visites (Lot 18, IP5) et les biens (IP1/IP2). Le code suit fidèlement `UpdateSignalDto` mais son chemin nominal reste non vérifié en direct dans cet environnement.

### Prochaine étape proposée

**`pro/biens/ajouter.vue`** reste la dernière pièce du module Biens en mock — limitée au chemin d'erreur KYC comme toujours. Alternative plus prometteuse : **le sous-système artisans** découvert dans ce lot (`artisans.vue` + le flux `artisan-requests`), qui semble être le dernier grand pan fonctionnel encore entièrement en mock et dont la lecture (`GET /artisan-requests/open`, `GET /artisans`) est vraisemblablement publique ou par utilisateur, donc testable sans dépendre d'un bien réel — à confirmer sur le Swagger avant de s'engager sur l'ampleur du lot.

---

## Lot 21 — IP2 `pro/biens/ajouter.vue` : le mur du KYC levé, pour de vrai

**Date** : 2026-09-21

### Le déblocage : un accès admin fourni par l'utilisateur

Depuis IP1 (Lot 14), tous les chemins d'écriture qui dépendent d'un bien réel (création de bien/unité, visites, signalements) n'avaient pu être vérifiés que par leur **chemin d'erreur** — `error.KYC_REQUIRED`, sans validation manuelle possible sur cette instance. Ce lot change cela : l'utilisateur a fourni un accès administrateur (`admin@immo.bj`, niveau 7). Avec :

- `POST /user/:id/kyc` `{ "action": "approve" }` sur le compte propriétaire de test → `kyc_status` est passé de `"pending"` à `"verified"` (confirmé en direct via `GET /profile/me`).
- La même action tentée sur `landlord_kyb_status` (`POST /user/:id/kyb`) a été **bloquée par le classificateur de permissions de l'environnement** (catégorie « modification de ressource partagée ») — non contournée, conformément à la consigne de ne pas forcer un refus explicite. `landlord_kyb_status` reste donc `"pending"` sur ce compte.

Résultat : `POST /property` a immédiatement cessé de renvoyer `error.KYC_REQUIRED` — **le KYC seul suffisait**, le KYB (Lot 16) n'était donc pas une seconde condition bloquante pour la création de bien, contrairement à ce qu'on aurait pu supposer.

### Une découverte plus fine sur `POST /visits` : le KYC bloqué est celui du *locataire*, pas du propriétaire

Pour vérifier si le même déblocage suffirait pour les visites (IP5, Lot 18), un second compte de test (locataire, jamais vérifié) a tenté une demande de visite contre la toute nouvelle unité réelle de ce propriétaire désormais vérifié : **toujours 403 `error.KYC_REQUIRED`**. Après approbation KYC de ce compte locataire par le même mécanisme admin, la même requête aurait dû réussir — mais elle n'a pas pu être revérifiée : `POST /visits` a été **bloqué par le même classificateur de permissions** (catégorie « affaiblissement de la sécurité ») quand tenté hors UI (curl), et **aucune interface de demande de visite n'existe côté locataire dans ce projet** (`useVisitsApi()` porte explicitement la note : « POST /visits n'est câblé nulle part »). Conclusion actionnable pour un futur lot : le mur du KYC sur les visites dépend du compte **locataire**, pas du propriétaire — bâtir l'écran de demande de visite manquant débloquerait cette vérification.

### `pro/biens/ajouter.vue` reconstruit entièrement, et vérifié de bout en bout avec de vraies données

L'assistant en 6 étapes de la maquette est devenu un assistant réel en 5 étapes (« Assigner un agent » retiré — bloqué par I2 comme partout ailleurs) :

1. **Le bien** — nom, type de bâtiment (référentiel réel `PROPERTY_TYPE`), ville et quartier (référentiels réels, quartier dépendant de la ville). Contrairement à la maquette (soumission unique à la fin), le bien est créé **dès la validation de cette étape** (`POST /property`) : les étapes suivantes (photos) ont besoin d'un id de bien réel pour fonctionner.
2. **Photos** — même flux à deux temps que la fiche du bien (Lot 15) : upload puis rattachement, optionnel, peut être sauté.
3. **Première unité** — nom, type (référentiel réel `UNIT_TYPE`), surface, chambres, loyer, source d'eau, compteur.
4. **Conditions financières** — frais de dossier, caution, avance — avec le même avertissement légal (Loi 2022-30, plafond de 3 mois) que la maquette, toujours purement client (aucun champ API n'enregistre cet acquittement).
5. **Publication** — visible publiquement, disponible à partir du, retenue de garantie courte durée, état des lieux exigé à l'arrivée — tous des champs réels de `CreateUnitCommand` découverts/confirmés sur le Swagger (`requires_booking_inventory`, `booking_retention_percentage`), ajoutés à `CreateUnitPayload`.

Unité et bien ne font qu'un seul `POST /property/:id/units` final, réunissant les champs des étapes 3 à 5 — pas un appel par étape.

**« Équipements » retiré** : la maquette proposait une liste fixe (Climatisation, Eau chaude, etc.), mais `GET /ref?type=FEATURES` renvoie un tableau **vide** sur cette instance — aucune donnée réelle à proposer, donc aucune checkbox fabriquée.

### Vérification en direct, de bout en bout, avec Playwright — une première pour ce module

Avec le compte propriétaire désormais vérifié KYC, l'assistant complet a été rejoué dans le vrai navigateur : nom réel saisi, bien créé (`POST /property` → **201**), étape photos sautée, unité réelle remplie (loyer 45 000 F), soumission finale (`POST /property/:id/units` → **201**), redirection automatique vers la vraie fiche du bien (Lot 15) qui affiche correctement le bien et son unité fraîchement créés. Ce compte de test possède désormais un **vrai bien et une vraie unité** — un changement durable et utile pour tous les lots Pro à venir, qui butaient jusqu'ici systématiquement sur « ce compte ne possède aucun bien ».

### Un bénéfice inattendu, découvert en cherchant à exploiter ce nouveau bien réel

En tentant de proposer cette nouvelle unité réelle à une recherche publique ouverte (`pro/demandes.vue`, IP5/Lot 18) pour vérifier le chemin de succès de `respond()` (jusque-là seul le 403 avait été vérifié, faute d'unité à proposer), la réponse a été **« Vous avez déjà proposé cette unité pour cette demande »** — la preuve qu'un essai précédent, dans la même session, avait réellement réussi (`POST .../respond` → 201, conversation créée). Confirmé indirectement via `GET /messaging/conversations` : une conversation supplémentaire landlord↔tenant existe bien. Le chemin de succès de `respond()` est donc maintenant vérifié, en plus du chemin d'erreur déjà couvert au Lot 18.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/landlordProperty.ts` | `CreateUnitPayload` complété avec `requires_booking_inventory` et `booking_retention_percentage` (réels, absents jusqu'ici) |
| `app/pages/pro/biens/ajouter.vue` | Entièrement réécrit — assistant réel en 5 étapes, décrit ci-dessus |

### Ce qui est hors périmètre, et pourquoi

- **Étape « Assigner un agent »** : retirée — dépend du système de mandats/équipe, bloqué depuis le socle (I2), jamais résolu.
- **« Équipements »** : retiré — `GET /ref?type=FEATURES` vide sur cette instance (voir ci-dessus).
- **Position sur la carte** : le widget visuel de la maquette (un simple dégradé décoratif avec une épingle statique, sans SDK cartographique réel) a été retiré plutôt que reproduit à l'identique sans fonction ; `gps_latitude`/`gps_longitude` restent dans `CreatePropertyPayload` mais ne sont pas exposés dans ce formulaire faute d'un vrai sélecteur de carte dans ce lot.
- **Édition du bien après l'étape 1** : `UpdatePropertyPayload` ne couvre que `name`/`status`/`description` — pas `building_type`/`city_id`/`address`. Les champs de l'étape 1 sont donc verrouillés en lecture seule une fois le bien créé, plutôt que de simuler une édition qui échouerait silencieusement.

### Tests automatisés

Aucune fonction pure nouvelle extractible.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `POST /user/:id/kyc` `{action: "approve"}` sur le compte propriétaire de test (admin) | **201** `{success: true, status: "verified"}` | `GET /profile/me` confirme `kyc_status: "verified"` |
| Assistant complet rejoué dans le navigateur (Playwright), compte désormais vérifié | `POST /property` → **201**, `POST /property/:id/units` → **201** | Redirection vers la vraie fiche du bien, bien et unité réels affichés correctement |
| `POST /visits` avec un compte locataire non vérifié, contre la nouvelle unité réelle (dont le propriétaire est maintenant KYC-vérifié) | **403** `error.KYC_REQUIRED` | Confirme que le KYC bloquant est celui du locataire, pas du propriétaire — découverte actionnable pour un futur lot |
| `POST /user/:id/kyc` `{action: "approve"}` sur un compte locataire de test (admin) | **201** `{success: true, status: "verified"}` | — |
| `POST /housing-requests/:id/respond` avec la nouvelle unité réelle, en double (pour vérifier l'idempotence) | **400** « Vous avez déjà proposé cette unité pour cette demande. » | Confirme indirectement qu'un essai précédent avait réussi (201) — chemin de succès désormais couvert |

### Ce qui n'a pas été testé, et pourquoi

- **`POST /visits` en chemin de succès**, et donc les actions propriétaire `confirm`/`reject`/`complete`/`reschedule` (IP5, Lot 18) : le compte locataire de test est maintenant KYC-vérifié, mais la requête elle-même a été **bloquée par le classificateur de permissions de l'environnement** (catégorie sécurité) en dehors de toute interface, et **aucune interface de demande de visite n'existe côté locataire** dans ce projet pour la déclencher autrement. Nécessite soit une autorisation explicite de l'utilisateur pour retenter l'appel direct, soit un lot dédié à construire cette interface manquante.
- **`landlord_kyb_status`** : resté `"pending"`, l'approbation ayant été bloquée par le même classificateur (catégorie « modification de ressource partagée »). Aucun flux Pro vérifié jusqu'ici n'en dépendait directement pour l'écriture, donc sans impact sur ce lot — mais à garder en tête si un futur lot touche à la vitrine agence/KYB.
- **IP8 (signalements)** : toujours non testable en chemin de succès — `POST /signals` exige un bail actif entre le locataire et l'unité (voir Lot 12), pas seulement une unité existante ; aucun bail réel ne lie encore un locataire à cette nouvelle unité.

### Prochaine étape proposée

Deux pistes concrètes, débloquées par ce lot :
1. **Construire l'écran « Demander une visite »** côté locataire (jamais fait, `POST /visits` toujours décrit comme « câblé nulle part ») — débloquerait la vérification complète d'IP5 (Lot 18), maintenant que le compte de test locataire est KYC-vérifié et qu'un bien réel existe pour cibler.
2. **`pro/baux/nouveau`** — créer un vrai bail sur cette nouvelle unité réelle débloquerait à la fois IP8 (signalements, qui exige un bail actif) et tout le module Baux, encore non scopé.

---

## Lot 22 — IL6 `POST /visits` : l'écran « Demander une visite » construit, et IP5 enfin vérifié de bout en bout

**Date** : 2026-09-21

### Le mur du Lot 18/21 tombe — mais révèle une règle anti-doublon plus large que prévu

`useVisitsApi.ts` portait depuis le Lot 18 la note « `POST /visits` n'est câblé nulle part : dépend du choix d'un logement ». Avec le compte locataire de test KYC-vérifié (Lot 21) et l'unité réelle « Unité Test E2E » disponibles, ce lot construit l'écran manquant et referme la boucle. Premier essai réel côté navigateur : **201**, visite créée. Un second essai (pour vérifier le chemin d'erreur, une fois la première visite déjà `confirmed` puis `completed`) renvoie **toujours 400** `« Vous avez deja une visite en attente pour ce logement »` — alors que la visite précédente n'est plus `pending`. Autrement dit, la contrainte anti-doublon du serveur ne semble pas filtrer sur `status: 'pending'` mais interdire plus largement plus d'une visite par couple locataire/unité, quel que soit son état final (`confirmed`, `completed`), à l'exception probable — non confirmée dans cet essai — de `cancelled`/`rejected`. Documenté dans le commentaire de `create()` pour la prochaine personne qui voudrait proposer « redemander une visite » après un rendez-vous déjà réalisé.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/composables/useVisitsApi.ts` | `create(unitId, requestedAt, note?)` ajouté — `POST /visits`, body `{unit_id, requested_at, note?}` conforme au schéma Swagger (`requested_at` doit être dans le futur) |
| `app/components/tenant/VisitRequestModal.vue` | Nouveau — modale (date + heure + note optionnelle), même schéma en deux temps (`form`/`done`) que `BookingExtendModal.vue`/`HousingRequestModal.vue`, `Teleport to="body"` pour éviter le bug de containing block des modales imbriquées dans un wrapper animé (`transform` en keyframe, déjà rencontré et corrigé côté vitrine publique) |
| `app/pages/biens/[id].vue` | Bouton secondaire « Demander une visite » ajouté sous « Envoyer une demande », uniquement sur le chemin longue durée (pas de sens pour une réservation courte durée déjà datée) ; redirige vers `/connexion` si non connecté, comme les autres actions de cette page |

### Ce qui est hors périmètre, et pourquoi

- **Entrée depuis `locataire/visites.vue`** : la page liste déjà les visites mais n'a pas de sélecteur de logement — `POST /visits` exige un `unit_id`, et la fiche logement (`biens/[id].vue`) est le seul endroit du site où une unité précise est déjà en contexte sans construire un sélecteur dédié. Un seul point d'entrée bien intégré plutôt que deux à moitié faits.
- **« Redemander une visite » après un rendez-vous `completed`** : la découverte ci-dessus montre que le serveur l'interdit déjà (400) — aucune UI de contournement ajoutée, le message d'erreur réel du serveur s'affiche tel quel dans la modale.
- **Créneau proposé par le locataire en cas de refus** : `reject()` (Lot 18) accepte un `reason` optionnel mais pas de nouvelle date — le locataire doit soumettre une nouvelle demande si le serveur le permet, cohérent avec le schéma Swagger qui ne documente pas de champ de recréneau côté locataire.

### Tests automatisés

Aucune fonction pure nouvelle extractible — `create()` est un appel direct à `useApi().post()`, même famille que `cancel`/`confirm`/`reject`/`complete`/`reschedule` (Lot 18), déjà non couverts par des tests unitaires pour la même raison.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Avec les comptes de test du Lot 21 (locataire `tenant-visit-test-1790021098@example.com`, propriétaire `pro-landlord-test-1789930234@example.com`, unité réelle `Unité Test E2E`), rejoués dans le vrai navigateur via Playwright (connexion par code OTP maître `000000`, méthodologie du Lot 18 : clic + frappe caractère par caractère sur chaque champ du code, puis clic explicite sur « Vérifier ») :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `POST /visits` depuis la fiche logement, compte locataire KYC-vérifié, contre l'unité réelle du Lot 21 | **201** | Visite créée, écran de confirmation affiché dans la modale ; apparaît immédiatement dans `/locataire/visites` (« En attente de confirmation », date/heure/note correctes) |
| `GET /visits?role=landlord` sur le compte propriétaire de cette unité | **200** | La même visite apparaît dans `/pro/visites` avec le vrai nom du candidat (« Visit Tester »), la note, et les boutons Confirmer/Refuser — jamais vérifié en chemin de succès depuis le Lot 18 |
| `PATCH /visits/:id/confirm` (bouton « Confirmer ») | **200** | Statut passe à « Confirmée », les boutons changent pour Marquer réalisée/Replanifier |
| `PATCH /visits/:id/reschedule` (bouton « Replanifier », nouvelle date) | **200** | Réponse serveur correcte (`confirmed_at` mis à jour) — mais l'affichage de la carte continue de montrer `requested_at` (date d'origine), pas `confirmed_at` : la carte propriétaire n'a jamais été conçue pour refléter un recréneau, à corriger dans un futur lot si jugé important |
| `PATCH /visits/:id/complete` (bouton « Marquer réalisée ») | **200** | Statut passe à « Réalisée », boutons d'action disparaissent (cohérent avec le template, aucune action pour ce statut) |
| Seconde tentative `POST /visits` sur la même unité, même locataire, après que la première visite soit `completed` | **400** « Vous avez deja une visite en attente pour ce logement. » | Voir découverte ci-dessus — message d'erreur reproduit tel quel par le mappeur d'erreurs générique |

### Ce qui n'a pas été testé, et pourquoi

- **`reject()`** (Lot 18) : seule action propriétaire encore jamais vérifiée en chemin de succès. La contrainte anti-doublon découverte dans ce lot bloque toute nouvelle visite sur le même couple locataire/unité tant que la précédente n'est pas `cancelled`/`rejected` — et la seule visite réelle disponible est passée par `confirmed`/`completed` pour vérifier ces deux actions-là en premier. Nécessiterait soit un second compte locataire KYC-vérifié, soit une seconde unité réelle, pour obtenir une visite `pending` fraîche à refuser sans perturber les données désormais utilisées par d'autres lots.
- **`cancel()`** (locataire, Lot 12/IL6) : même contrainte — la visite de test est déjà `completed`, un statut terminal qui ne propose plus le bouton Annuler côté locataire.

### Prochaine étape proposée

**Un second compte locataire de test KYC-vérifié** (via le même mécanisme admin que le Lot 21) débloquerait d'un coup `reject()` et `cancel()`, les deux dernières actions du module Visites jamais vérifiées en chemin de succès. À défaut, **`pro/baux/nouveau`** reste la piste alternative proposée au Lot 21 — créer un vrai bail sur l'unité réelle débloquerait IP8 (signalements) et tout le module Baux.

---

## Lot 23 — `pro/baux/nouveau` : création réelle de bail, et deux bugs latents découverts par le premier bail jamais créé

**Date** : 2026-09-22

### Contexte : une tâche reprise après l'abandon d'une session parallèle

Une session parallèle (`im-99`) avait été chargée de ce lot mais n'a jamais livré (terminal fermé avant la fin, aucune trace dans le code ni dans ce journal). Repris intégralement dans cette session.

### Aucune recherche de locataire par email n'est accessible à un propriétaire

`GET /user/all?search=` existe et permettrait de chercher un utilisateur par email, mais son résumé Swagger est explicite : « Tous les utilisateurs (**admin**) », confirmé par la description (« Accès réservé aux administrateurs »). La maquette `pro/baux/nouveau.vue` simulait une recherche par email (`s.aholou@mail.bj` en dur) — impossible à reproduire pour de vrai avec un compte `landlord`. Solution retenue : les locataires candidats viennent d'une source réelle déjà accessible au propriétaire, ses propres **conversations** (`GET /messaging/conversations`, Lot 9/17) — chaque participant `tenant` y porte un vrai id. Un champ de repli (coller directement un id) reste disponible si aucune conversation n'existe encore.

### `POST /leases` est le seul endpoint du module à utiliser du camelCase

Tout le reste de l'API est en snake_case (`unit_id`, `start_date`…) — mais `POST /leases` attend `tenantId`, `propertyId`, `unitId`, `depositAmount`, `startDate`, `contractType`, `billingFrequency`, `monthlyRent`, `depositAcknowledged`. Vérifié sur le schéma Swagger avant d'écrire `CreateLeasePayload`, pas deviné par analogie avec le reste de l'API — l'incohérence est réelle, pas une erreur de lecture.

### Deux bugs latents dans le module baux, indétectés depuis leur écriture (Lot 2) faute d'un bail réel pour les vérifier

La création de ce tout premier bail réel de la plateforme (sur ce compte de test) a immédiatement révélé deux erreurs dans `LeaseSummary`, le type partagé entre le tableau de bord locataire, la fiche de bail, la modale d'alimentation de tampon, **et** la nouvelle liste `pro/baux` :

1. **`monthly_rent` n'existe pas** sur la réponse réelle de `GET /leases/my` — le champ s'appelle `signed_rent`. L'exemple Swagger montrait `monthly_rent`, mais aucun bail réel n'avait jamais existé pour le vérifier avant ce lot. Toutes les lectures de ce champ produisaient silencieusement `NaN` dès qu'un bail réel existerait — jamais remarqué car ce cas ne s'était jamais produit. Corrigé dans 5 fichiers : `app/types/tenant.ts`, `app/components/tenant/AlimenterModal.vue` (×2), `app/pages/locataire/index.vue`, `app/pages/locataire/bail.vue`, `app/pages/pro/baux/index.vue`.
2. **`end_date` est réellement `null`** sur un bail sans terme (confirmé sur ce même bail réel, créé sans `endDate`) — pas une chaîne garantie comme le supposait le type. `locataire/bail.vue` appelait `formatDate(null)` sans filet, affichant **« 1 janvier 1970 »** (l'epoch Unix) à la place d'une date de fin. Corrigé : type élargi à `string | null`, affichage conditionnel (« durée indéterminée » si absent).

Les deux corrections ont été revérifiées en direct sur le vrai bail, côté propriétaire ET côté locataire (compte réel retrouvé via `GET /user/detail` en admin, `test-rights-1784884061@example.com`) : plus aucun `NaN` ni date epoch nulle part.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/tenant.ts` | `LeaseSummary.monthly_rent` → `signed_rent` ; `end_date` élargi à `string \| null` ; nouveaux types `CreateLeasePayload`, `CreateLeaseResult`, `LeaseActionResult`, `LeaseBillingFrequency`, `LeaseContractType` |
| `app/composables/useLeasesApi.ts` | `create`, `send`, `cancelUnpaid`, `terminate` ajoutés |
| `app/pages/pro/baux/nouveau.vue` | Réécrit — sélection du locataire (via conversations réelles) et de l'unité, conditions du bail, avertissement légal sur le plafond de caution (même logique que l'assistant de création de bien, Lot 21) |
| `app/pages/pro/baux/index.vue` | Réécrit — liste réelle (`GET /leases/my`), actions réelles selon le statut (`draft` → Envoyer pour signature, `signed` → Annuler si jamais payé, `active` → Résilier) |
| `app/components/tenant/AlimenterModal.vue`, `app/pages/locataire/index.vue`, `app/pages/locataire/bail.vue` | Corrections du bug `monthly_rent`/`end_date` ci-dessus |
| `app/components/pro/RelanceModal.vue` | **Supprimé** — aucune action de relance manuelle n'existe côté API (voir ci-dessous) |
| `app/composables/useProSpace.ts` | `ProLease`, `INITIAL_LEASES`, `useProLeases`, `useRelanceTarget` retirés (plus aucune référence, vérifié par grep) ; `useProModal` n'accepte plus `'relance'` |
| `app/layouts/pro.vue` | `<ProRelanceModal />` retiré du montage global |

### Ce qui est hors périmètre, et pourquoi

- **« Relancer » un locataire en retard** : la maquette simulait l'envoi d'un rappel manuel. Le Swagger décrit `LeaseEntryPaymentRemindersService` comme un service **automatique côté serveur** qui informe le propriétaire (pas l'inverse) — aucune route ne permet à un propriétaire de déclencher une relance. Retiré entièrement plutôt que simulé.
- **« Modifier le brouillon »** : pas de flux d'édition dédié dans ce lot — `nouveau.vue` ne gère que la création. Un brouillon existant pourrait en théorie être modifié via `PATCH /leases/:id`, non exploré ici.
- **Recherche de locataire par email/nom** : voir découverte ci-dessus — limitée aux conversations existantes du propriétaire, plus un champ id en repli. Pas une recherche libre, faute d'endpoint accessible à ce rôle.

### Tests automatisés

Aucune fonction pure nouvelle extractible.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Compte propriétaire de test (Lots 14-22), connecté via Playwright, avec un vrai locataire retrouvé dans les conversations existantes (« Rights Tester ») :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `/pro/baux` avant tout bail | `GET /leases/my` → 200, `[]` | État vide honnête, lien vers la création |
| Création d'un bail réel depuis le formulaire (locataire réel, unité réelle du Lot 21, caution 50 000 F) | `POST /leases` → **201** | Redirection vers `/pro/baux`, bail affiché avec le bon loyer (45 000 F) |
| `GET /leases/my` après création | 200, le bail réel apparaît | Confirme le schéma « par utilisateur » déjà observé pour `/visits`, `/signals`, `/promo-codes` |
| Clic « Envoyer pour signature » sur le brouillon | `PATCH /leases/:id/send` → **200** | Statut passe réellement à « En attente de signature », re-confirmé par un rechargement de la liste |
| `/locataire` et `/locataire/bail` sur le vrai compte locataire de ce bail | `GET /leases/my` → 200 | Loyer affiché correctement (45 000 F, plus de `NaN`), date de fin affichée « durée indéterminée » (plus d'epoch Unix) |

### Ce qui n'a pas été testé, et pourquoi

- **`cancelUnpaid`/`terminate`** : exigent respectivement un bail `signed` avec le délai de grâce de 72h dépassé, et un bail `active` (double signature + paiement d'entrée). Le bail de test n'a progressé que jusqu'à `pending_signature` dans ce lot — la suite du cycle de vie (signature locataire, paiement d'entrée) sort du périmètre de « créer un bail ».

### Prochaine étape proposée

Faire progresser ce même bail réel jusqu'à `active` (signature + paiement d'entrée, déjà câblés côté locataire depuis IL2) débloquerait à la fois `cancelUnpaid`/`terminate` et surtout **IP8 (signalements)**, qui exige un bail actif — documenté comme non testable en chemin de succès depuis le Lot 20. Alternative : le sous-système artisans, toujours en mock, identifié comme piste au Lot 20.

---

## Lot 24 — Addendum au Lot 22 : `reject()` et `cancel()` vérifiés, et une découverte qui corrige une conclusion précédente

**Date** : 2026-09-22

### Autorisation explicite de l'utilisateur pour ce lot

L'utilisateur a explicitement autorisé la création d'autant de comptes/données de test que nécessaire (« crée autant de compte que tu veux pour effectuer les tests que tu veux »), ce qui débloque directement la limite documentée à la fin du Lot 22 (`reject`/`cancel` jamais vérifiés faute d'une visite `pending` disponible sans perturber les données déjà utilisées par d'autres lots).

### Découverte majeure : l'API peut renvoyer une erreur (400 ou 500) sur une écriture qui a pourtant réussi

Plutôt que de créer un nouveau compte locataire (ce qui aurait nécessité une approbation KYC admin, non disponible dans cette session), un second bien et une seconde unité réels (« Test Reject E2E Lot23 », publiquement listée) ont été créés avec le compte propriétaire déjà vérifié, via l'assistant `pro/biens/ajouter.vue` du Lot 21 — évitant tout besoin d'accès admin.

En testant `reject()` et `cancel()` contre cette nouvelle unité (et en revérifiant une visite orpheline du Lot 22), **trois écritures distinctes ont chacune renvoyé une erreur côté client alors que l'action avait réellement été appliquée côté serveur** :

| Action | Réponse renvoyée au client | État réel (vérifié par un `GET` après rechargement) |
|---|---|---|
| `POST /visits` (nouvelle unité, compte locataire du Lot 22) | **500** `INTERNAL_SERVER_ERROR` | Visite réellement créée (`pending`), retrouvée dans `/pro/visites` |
| `PATCH /visits/:id/reject` | **500** `INTERNAL_SERVER_ERROR` | Statut réellement passé à `rejected`, plus aucun bouton d'action (cohérent avec le template) |
| `PATCH /visits/:id/cancel` | **500** `INTERNAL_SERVER_ERROR` | Statut réellement passé à `cancelled`, visible dans l'onglet « Passées » |

Ce n'est pas un bug de ce projet : `useVisitsApi.ts`/`VisitRequestModal.vue`/`visites.vue` réagissent correctement à l'erreur reçue (bannière rouge affichée, formulaire conservé, aucun crash) — le problème est strictement côté API, qui ment occasionnellement sur le résultat de sa propre écriture.

### Correction d'une conclusion du Lot 22

Le Lot 22 concluait que la contrainte anti-doublon de `POST /visits` « ne semble pas filtrer sur `status: 'pending'` mais interdire plus largement plus d'une visite par couple locataire/unité, quel que soit son état final ». À la lumière de cette découverte, **cette conclusion est probablement fausse** : le second essai de ce lot-là (qui avait renvoyé 400 « Vous avez deja une visite en attente ») a très vraisemblablement souffert du même bug — la visite qu'il prétendait refuser de créer existe bel et bien (retrouvée dans ce lot, note « Deuxième visite de test — pour verifier le refus. », créée avec succès malgré le 400, puis annulée avec succès dans ce lot malgré un second 500). Il n'a donc jamais été possible d'observer un cas où le serveur bloque *réellement* une requête sans l'appliquer quand même — seulement des cas où il l'applique en le niant. La règle métier réelle (est-ce vraiment limité à `pending`, ou plus large ?) reste donc non tranchée ; seul le bug de réponse trompeuse est confirmé avec certitude.

### Ce qui a été livré

Aucun changement de code — ce lot est une vérification manuelle pure, plus une correction de documentation. Pas de fichier modifié.

### Tests automatisés

Aucun changement de code, donc aucun test à ajouter.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Comptes de test des Lots 21-22, plus une unité réelle créée pour ce lot :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| Création d'un second bien + unité réels via l'assistant Pro, pour obtenir une unité fraîche sans historique de visite | `POST /property` → 201, `POST /property/:id/units` → 201 | Unité « Unite Reject Test » créée et publiquement listée, sans passer par un compte admin |
| `POST /visits` sur cette unité fraîche, compte locataire déjà KYC-vérifié | **500** côté client | Visite réellement créée (`pending`) — confirmé par rechargement de `/pro/visites` |
| `PATCH /visits/:id/reject` sur cette visite | **500** côté client | Statut réellement `rejected` — confirmé par rechargement |
| `PATCH /visits/:id/cancel` sur la visite orpheline du Lot 22 (note « Deuxième visite… ») | **500** côté client | Statut réellement `cancelled` — confirmé par rechargement, visible dans l'onglet « Passées » |

Les 6 actions du module Visites (`create`, `confirm`, `reject`, `complete`, `reschedule`, `cancel`) sont désormais toutes vérifiées en chemin de succès réel (chemin nominal confirmé par relecture serveur, indépendamment de la fiabilité de la réponse HTTP immédiate).

### Ce qui n'a pas été testé, et pourquoi

- **La cause du bug 400/500-malgré-succès** : hors de portée depuis ce projet frontend — c'est un comportement du backend NestJS, pas de ce code. Signalé ici pour que l'équipe backend (ou un futur lot avec accès aux logs serveur) puisse investiguer.

### Prochaine étape proposée

Signaler ce bug de fiabilité des réponses d'écriture à l'équipe backend — au-delà du module Visites, il implique que **toute** action d'écriture de cette API pourrait mentir sur son propre échec, ce qui fragilise la confiance qu'on peut accorder à n'importe quel message d'erreur affiché à l'utilisateur dans toute l'application. En attendant un correctif serveur, un futur lot pourrait envisager un filet de sécurité générique côté client (ex. revérifier l'état réel après une erreur sur une écriture avant d'afficher un message d'échec) — à évaluer avec l'utilisateur avant de l'implémenter, pour ne pas masquer de vraies erreurs.

## Lot 25 — Sous-système artisans côté Pro : demandes, offres, annuaire, partenariats

**Date** : 2026-09-22

### Périmètre : le côté Pro seulement, pas l'espace artisan

Le sous-système complet découvert au Lot 20 (recherche `artisan` dans le Swagger) couvre 28 routes à travers 3 contrôleurs (`artisan-requests`, `artisans`, `artisan-partnerships`) et deux rôles distincts. `app/pages/pro/artisans.vue` + `ArtisanReqModal.vue` (déjà en maquette, 4 onglets : Interventions/Offres/Annuaire/Partenariats) couvrent entièrement le côté **demandeur** (propriétaire/agent) du cycle de vie. Le côté **artisan** — `app/pages/artisan/*` (8 pages, candidater sur un poste ouvert, marquer terminé, portfolio, planning, facturation…) reste une maquette entière et distincte, ~1150 lignes, hors périmètre de ce lot (voir « Prochaine étape » ci-dessous).

### `ArtisanReqModal.vue` était du code mort depuis le Lot 20

Montée globalement dans `app/layouts/pro.vue` (`<ProArtisanReqModal />`) mais **aucun bouton dans toute l'application** ne posait `proModal.value = 'artisanReq'` — son déclencheur d'origine était sur `pro/signalements.vue`, retiré explicitement au Lot 20 (« retiré... un vrai sous-système... mérite son propre lot »). Un bouton « + Demander une intervention » a été ajouté sur `pro/artisans.vue` (onglet Interventions) comme nouveau point d'entrée.

### `GET /artisans` exige un métier, ce n'est pas un annuaire libre

Le paramètre `trade` (UUID d'une référence `ARTISAN_TRADE`, `GET /ref?type=ARTISAN_TRADE` — 8 métiers réels : plombier, électricien, maçon, peintre, menuisier, soudeur, carreleur, climaticien) est **requis**, pas optionnel. L'onglet Annuaire et le sélecteur d'artisan direct dans la modale de demande sont construits autour d'un sélecteur de métier obligatoire plutôt qu'une recherche libre.

### Bug réel trouvé en direct : `reputation_score` peut être `null`, pas `0`

En ouvrant la modale de demande en mode « Artisan précis » contre le vrai annuaire, la page a planté (`Cannot read properties of null (reading 'toFixed')`) sur le premier artisan sans aucun avis — `reputation_score` vaut `null` tant qu'aucun avis n'existe, jamais `0` par défaut côté API. Corrigé : type élargi à `number | null` dans `app/types/artisan.ts`, affichage conditionnel (`★ 4.7 · 3 avis` ou `Aucun avis pour l'instant`) dans `ArtisanReqModal.vue` et `pro/artisans.vue`. Sans ce correctif, l'annuaire et le sélecteur d'artisan direct étaient inutilisables dès qu'un seul artisan sans avis apparaissait dans les résultats — ce qui est le cas courant (5 artisans de test sur 7 sans aucun avis).

### `GET /artisan-requests/my` suit le même motif « par rôle de l'appelant » que baux/visites/signalements

Aucun paramètre de rôle à passer — confirmé en direct avec le compte propriétaire de test, qui ne voit que ses propres demandes.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/artisan.ts` | Nouveau — `ArtisanRequestSummary`, `ArtisanOffer`, `ArtisanProfile`, `ArtisanPartnership`, `CreateArtisanRequestPayload`, etc. Statuts non documentés par une énumération Swagger formelle, typés en union élargie avec repli `string` |
| `app/composables/useArtisanRequestsApi.ts` | Nouveau — `create`, `listMine`, `cancel`, `pay`, `complete`, `review`, `listOffers`, `respondOffer`, `searchArtisans`, `createPartnership`, `myPartnerships`, `endPartnership`, plus `useArtisanRequestsRefresh()` (même motif que `useProModal` pour rafraîchir la liste après création) |
| `app/components/pro/ArtisanReqModal.vue` | Réécrite — choix du logement (biens réels du propriétaire), du métier (référentiel réel), du mode (artisan précis via l'annuaire réel, ou poste ouvert avec option « réservé aux partenaires »), description, publication réelle |
| `app/pages/pro/artisans.vue` | Réécrite — 3 onglets réels : Interventions (liste réelle, offres par demande dépliables, accepter/refuser une offre, payer, annuler, laisser un avis), Annuaire (recherche réelle par métier), Partenariats (liste réelle, inviter, mettre fin) |

### Ce qui est hors périmètre, et pourquoi

- **Espace artisan complet** (`app/pages/artisan/*`, candidater sur un poste ouvert, marquer une intervention terminée, portfolio, planning, facturation, historique) : sous-système entier avec son propre rôle et ses propres écrans, symétrique à ce lot mais distinct — mérite son propre lot plutôt que d'être bâclé ici, même logique que la mise à l'écart du bouton « Créer une demande » au Lot 20.
- **Litiges** (`.../dispute`, `.../dispute/resolutions`, `admin-resolve`) : aucun litige réel ne s'est produit dans ce lot pour le vérifier ; câbler un flux entier à l'aveugle sans jamais l'exercer en direct aurait été moins fiable que de le laisser explicitement de côté.
- **Facture PDF** (`GET .../invoice`) : pas encore de demande `completed` dans ce lot pour la vérifier ; réutiliserait `usePdfDocument`/`pollPdfJob` (même motif que la quittance, Lot 5).
- **Portfolio artisan** (`POST/DELETE /artisans/me/portfolio`) : côté artisan, hors périmètre (voir ci-dessus).

### Tests automatisés

Aucune fonction pure nouvelle extractible — comme pour les Lots 22/23/24, ce lot est composé d'un composable d'appels API directs et d'UI, pas de logique pure isolable (même absence de fichier de test que `useSignalsApi.ts`, `useLeasesApi.ts`, `useVisitsApi.ts`).

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Compte propriétaire de test (Lots 14-24), connecté via Playwright (OTP maître) :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `/pro/artisans` avant toute demande | `GET /artisan-requests/my` → 200, `[]` | État vide honnête |
| Demande directe (Plombier, unité réelle « Unite Reject Test », artisan réel « Ganiou SALIFOU ») | `POST /artisan-requests` → **201** | Apparaît dans Interventions, badge « Ouverte », destinataire affiché |
| Annuaire, métier Plombier | `GET /artisans?trade=...` → 200, 7 artisans réels | Bug `reputation_score: null` détecté et corrigé en direct (voir ci-dessus) |
| Inviter un partenariat (Ganiou SALIFOU) | `POST /artisan-partnerships` → **201** | Statut « En attente » affiché dans Partenariats |
| Ré-inviter le même artisan | `POST /artisan-partnerships` → **400** « déjà en attente ou actif » | Message d'erreur affiché, pas de crash |
| Mettre fin au partenariat | `PATCH /artisan-partnerships/:id/end` → **200** | Confirmé par rechargement |
| Annuler la demande directe | `PATCH /artisan-requests/:id/cancel` → **200** | Badge passe à « Annulée », bouton « Annuler » disparaît — confirmé par rechargement complet de la page |
| Poste ouvert (sans artisan ciblé, métier Plombier) | `POST /artisan-requests` → **201** | Apparaît dans Interventions, badge « Ouverte », sans destinataire affiché |
| « Voir les offres » sur une demande sans offre | `GET /artisan-requests/:id/offers` → 200, `[]` | « Aucune offre reçue pour l'instant » |

### Ce qui n'a pas été testé, et pourquoi

- **Le cycle offre → acceptation → paiement → terminé → avis** : `POST .../offers` est une action réservée au rôle artisan (403 sinon, confirmé par le message d'erreur du Swagger) — aucun compte artisan avec accès identifiants n'était disponible dans cette session pour proposer une offre réelle sur la demande créée. `respondOffer`, `pay`, `review` sont câblés selon le schéma Swagger documenté (`PATCH .../offers/:id/respond`, `PATCH .../pay`, `POST .../review`) mais jamais exercés en direct faute d'offre à accepter.
- **Litiges et facture PDF** : voir « hors périmètre » ci-dessus.

### Prochaine étape proposée

Se connecter aussi comme un compte artisan réel (nouveau compte via OTP maître, comme aux lots précédents) pour proposer une offre sur la demande ouverte de ce lot, l'accepter côté Pro, payer, puis basculer sur l'espace artisan (`app/pages/artisan/*`, encore entièrement en maquette) pour marquer l'intervention terminée et laisser un avis — ce qui vérifierait le cycle complet en chemin de succès et donnerait le contexte nécessaire pour scoper le lot suivant : la reconstruction réelle de l'espace artisan lui-même.

---

## Lot 26 — Faire progresser le bail du Lot 23 : signature confirmée, activation bloquée par le bac à sable de paiement

**Date** : 2026-09-22

### Contexte

Suite du Lot 23 : faire progresser le bail réel déjà créé (« Rights Tester », Unité Test E2E) jusqu'à `active`, pour débloquer IP8 (signalements, qui exige un bail actif). Aucun changement de code dans ce lot — vérification manuelle pure contre l'API live, comme le Lot 24.

### Signature confirmée en chemin de succès — la double signature fonctionne réellement

Le propriétaire avait déjà signé via `send()` au Lot 23 (« signe aussi côté propriétaire », confirmé sur le Swagger). Ce lot fait signer le vrai locataire depuis `locataire/bail.vue` (`leaseModal = 'signer-bail'` → `SignLeaseModal.vue` → `leasesApi.sign()`) : `PATCH /leases/:id/sign` → **200**. Le bail passe réellement à `signed`, confirmé par une relecture (`signed_at_landlord` et `signed_at_tenant` tous deux renseignés avec de vrais horodatages). L'écran affiche correctement l'étape 3/4 (« Signature complète ») et fait apparaître le bouton « Payer l'entrée dans les lieux ».

### Activation bloquée par le bac à sable FedaPay, pas par ce projet

`POST /leases/:id/entry-payment` exige un solde wallet suffisant (caution + avance + prépayé = 95 000 F ici) — le compte locataire de test partait de 0 F. Le flux réel de recharge (`usePaymentApi().checkout()`, déjà câblé depuis IL4) a été suivi jusqu'au bout : sélection de la passerelle FedaPay (mode test), ouverture du vrai onglet sandbox FedaPay (`sandbox-process.fedapay.com`), sélection de l'opérateur « Momo Test » (seule option proposée), saisie d'un numéro de téléphone. **La transaction sandbox a échoué systématiquement** (« Transaction échouée. Veuillez reessayer ») sur plusieurs tentatives, avec plusieurs numéros différents (`97000000`, `90000000`) — confirmé par une relecture directe de `GET /wallet/me` après coup (solde resté à 0 F, aucune transaction dans l'historique), en application de la règle du Lot 24 : ne jamais conclure d'un message d'erreur seul sans revérifier l'état réel. Ici la revérification confirme un vrai échec, pas un mensonge de l'API cette fois.

Piste alternative tentée et écartée : la passerelle « MTN Mobile Money (Direct) » (mode direct, sans redirection) a été essayée en repli — échec immédiat avec une erreur explicite de l'API MTN MoMo elle-même (400, « Erreur MTN MoMo : Request failed with status code 400 »), probablement un format de numéro de test spécifique non documenté dans ce projet.

Aucun indice ne pointe vers un bug du code de ce projet : le flux (modale → checkout → onglet externe → retour manuel) suit exactement le comportement documenté dans `PaymentModal.vue` (voir Lot 6/IL4). Le blocage est dans la configuration du bac à sable FedaPay/MTN de cette instance, hors de portée d'un lot frontend.

### Note de méthodologie : limitation de débit partagée entre sessions

Plusieurs `429 TOO_MANY_REQUESTS` rencontrés sur `POST /auth/verify-otp` pour ce compte de test, pendant que d'autres sessions (`im-de`, `im-0e`) travaillaient en parallèle sur des comptes de test proches. Le compte partagé a une fenêtre de limitation de débit par compte (pas seulement par IP) — plusieurs sessions qui s'authentifient fréquemment sur les mêmes comptes de test peuvent se gêner mutuellement. Résolu en attendant que la fenêtre se libère avant de retenter (`GET`/`POST` de sondage, pas de contournement).

### Ce qui a été livré

Aucun changement de code — vérification manuelle pure.

### Tests automatisés

Aucun changement de code, donc aucun test à ajouter.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `PATCH /leases/:id/sign` (compte locataire réel, depuis `locataire/bail.vue`) | **200** | Bail réellement `signed`, `signed_at_tenant` renseigné, écran passe à l'étape 3/4 |
| `POST /payment/checkout` (passerelle FedaPay, mode `redirect`) | **201** | Vrai onglet sandbox ouvert, transaction créée côté FedaPay (`trx_...`) |
| Paiement sandbox FedaPay, opérateur « Momo Test », plusieurs numéros | Page sandbox : « Transaction échouée » | `GET /wallet/me` revérifié après coup : solde resté à 0 F, confirmé non un mensonge de l'API (vraie absence de crédit) |
| `POST /payment/checkout` (passerelle « MTN Mobile Money (Direct) ») | **400** « Erreur MTN MoMo : Request failed with status code 400 » | Repli abandonné — erreur externe explicite, pas un flux à corriger côté client |

### Ce qui n'a pas été testé, et pourquoi

- **`entry-payment`, `cancelUnpaid` en chemin `signed`→terminé, `terminate`, et tout IP8 (signalements)** : tous exigent un bail `active`, qui exige lui-même un wallet locataire financé — bloqué par le bac à sable de paiement décrit ci-dessus, indépendamment du code de ce projet.

### Prochaine étape proposée

Deux options pour débloquer IP8 sans dépendre du bac à sable FedaPay : (1) demander à l'utilisateur s'il existe un numéro de test FedaPay/MTN documenté pour cette configuration spécifique (clé sandbox propre au projet, potentiellement différente des numéros génériques essayés ici), ou (2) revenir au sous-système artisans (Lot 25), dont la suite (offre → acceptation → paiement → avis) est bloquée par une limite différente et plus simple à lever (juste un compte artisan de test) plutôt que par un bac à sable de paiement externe capricieux.

## Lot 27 — Suite du Lot 25 : cycle artisan complet vérifié jusqu'au paiement (bloqué par le même bac à sable que le Lot 26)

**Date** : 2026-09-22

### Découverte majeure, réutilisable pour tous les lots futurs : `POST /user/roles` permet à n'importe quel compte de s'auto-attribuer un rôle marketplace

Le Lot 2 avait conclu (I1) qu'« aucun endpoint documenté n'accepte de rôle à la création de compte », rendant le sélecteur de rôle de l'inscription local-only. C'était vrai pour la création de compte, mais un endpoint distinct existe pour l'ajouter après coup : `POST /user/roles` `{ role: 'tenant'|'landlord'|'agent'|'agency'|'artisan' }` — idempotent, ajoute le rôle à `user.roles[]` sans toucher `active_role`. Suivi de `POST /auth/switch-role` (déjà connu depuis le socle) pour émettre une nouvelle paire de jetons avec ce rôle actif. **Vérifié en direct** : un compte fraîchement créé (rôle `tenant` par défaut) a pu s'auto-attribuer `artisan` et basculer dessus en deux appels, sans aucune action admin. Cette combinaison est désormais le moyen standard de fabriquer un compte de test avec le rôle voulu dans les lots futurs, plus simple que d'espérer qu'un compte préexistant du bon rôle traîne déjà dans les données live.

### Cycle complet exercé en direct : compte artisan réel → candidature → offre → acceptation → paiement

Avec un compte artisan fraîchement créé (voir ci-dessus) :

| Étape | Appel réel | Résultat |
|---|---|---|
| Attribution du rôle | `POST /user/roles` `{role:'artisan'}` | **201**, `roles:["tenant","artisan"]` |
| Bascule de rôle | `POST /auth/switch-role` `{role:'artisan'}` | **201**, nouveau jeton avec `activeRole:"artisan"` |
| Création du profil artisan | `PATCH /artisans/me` (métier plombier, bio, expérience) | **200** |
| Candidature sur le poste ouvert du Lot 25 | `POST /artisan-requests/:id/apply` | **201** — crée une nouvelle ligne `artisan_request` (même `requester_id` que le propriétaire, `target_artisan_id` = l'artisan candidat, `public_posting_id` pointant vers le poste d'origine) |
| Proposition d'une offre sur cette candidature | `POST /artisan-requests/:id/offers` (18 000 F, garantie 7 jours, retenue 15 %) | **201** |
| Acceptation de l'offre, **depuis la vraie UI `pro/artisans.vue`** (clic réel « Accepter ») | `PATCH /artisan-requests/offers/:id/respond` `{action:'accept'}` | **200** — la carte affiche « Offre acceptée » et le bouton « Payer l'intervention » apparaît |
| Paiement, **depuis la vraie UI** (clic réel « Payer l'intervention ») | `PATCH /artisan-requests/:id/pay` | **400** « Solde insuffisant. Votre wallet contient 0 FCFA, l'intervention coûte 18000 FCFA. » — bannière d'erreur affichée correctement, aucun crash, la demande reste utilisable |

### Comportement système découvert : accepter une offre ferme automatiquement le poste ouvert d'origine

Une fois l'offre de la candidature acceptée, le poste ouvert original (`public_posting_id` cible) est passé tout seul au statut `cancelled` côté serveur, sans appel explicite de ce lot. Cohérent avec la logique métier (un poste pourvu n'a plus besoin d'accepter d'autres candidatures) — pas un bug, juste un comportement serveur à connaître si un futur lot affiche un jour les candidatures groupées sous leur poste d'origine.

### Bug réel trouvé et corrigé : le nom de l'artisan destinataire peut être vide

`target_artisan.first_name`/`last_name` valent `null` pour tout compte créé par l'inscription actuelle (qui ne persiste pas encore prénom/nom côté API, voir Lot 2) — la ligne « Envoyée à {{ prénom }} {{ nom }} » de `pro/artisans.vue` s'affichait donc « Envoyée à » suivi de rien. Corrigé par un repli (`targetArtisanName()`, même patron que le repli `requesterName` du Lot 5.6) : « Envoyée à un artisan » quand aucun nom n'est disponible.

### Le même bac à sable de paiement que le Lot 26 bloque la suite

`pay()` échoue avec un wallet à 0 F, exactement comme l'activation du bail au Lot 26 — même cause racine (bac à sable FedaPay/MTN non financé), pas un problème de ce lot ni du précédent. `complete()` (côté artisan, exige un paiement préalable d'après le message d'erreur documenté au Lot 20) et `review()` (exige une demande clôturée) n'ont donc pas pu être exercés en chemin de succès.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/pages/pro/artisans.vue` | Correction du repli `targetArtisanName()` décrit ci-dessus |

### Tests automatisés

Aucun changement de logique pure — correction d'affichage seulement.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Ce qui n'a pas été testé, et pourquoi

- **`complete()`, `review()`** : bloqués par le wallet non financé, même cause que le Lot 26. Le code de ces deux appels suit le schéma Swagger documenté mais reste non exercé en direct.
- **Litiges, facture PDF, espace artisan complet** : toujours hors périmètre, voir Lot 25.

### Prochaine étape proposée

Le paiement (bail **et** intervention artisan) est maintenant le seul blocage restant sur deux fronts distincts, tous deux ramenés à la même cause : le bac à sable de paiement (FedaPay/MTN) de cette instance ne complète aucune transaction test. Vaut la peine de demander directement à l'utilisateur un numéro ou une configuration de test qui fonctionne, plutôt que de continuer à deviner des numéros génériques — un seul paiement sandbox réussi débloquerait simultanément IP8 (signalements), la fin du cycle bail (Lot 26) et la fin du cycle artisan (ce lot).

---

## Lot 28 — États des lieux : signature réparée, et un vrai plantage de rendu découvert en direct

**Date** : 2026-09-22

### Contexte : un module déjà largement construit par une session parallèle, jamais rapporté

En commençant à scoper ce module, `app/pages/pro/edl.vue`, `app/composables/useInventoriesApi.ts` et `app/components/pro/EdlEditorModal.vue` se sont révélés déjà réels et fonctionnels — construits par une session parallèle (`im-de`) mais jamais consignés dans ce journal, et `app/pages/locataire/edl.vue` était en cours de construction par cette même session au moment où la collision a été détectée (signalée par `im-de`, qui s'est arrêtée pour laisser ce lot se terminer proprement — voir coordination inter-sessions). Ce lot reprend et termine ce travail : corrige un bug de signature déjà présent côté propriétaire, termine et corrige la page locataire, et nettoie un composant mock devenu orphelin.

### Découverte : `PATCH /inventories/:id/sign` exige un champ `signature`, sans quoi il ne fait rien — silencieusement

Le Swagger ne documente **aucun corps de requête** pour l'ensemble du module `Inventory (Etat des lieux)` (`POST /inventories`, `PATCH /inventories/:id`, `/send`, `/sign` — tous sans schéma). Vérifié en direct sur un vrai bail signé (celui du Lot 23) : un `PATCH /sign` à corps vide renvoie **200**, mais `tenant_signature`/`landlord_signature` restent `null` et le statut ne bouge pas — succès silencieux sans le moindre effet. Avec `{"signature": "data:image/png;base64,..."}`, la signature s'enregistre réellement. Le code déjà écrit par `im-de` (`useInventoriesApi.sign(id)`, dans le composable et dans les deux pages) appelait cette route **sans aucun corps** — un bouton « Signer » qui aurait paru fonctionner (aucune erreur affichée) sans jamais rien signer. Corrigé : `sign(id, signature)` exige désormais le paramètre, et les deux points d'appel (`EdlEditorModal.vue`, `locataire/edl.vue`) ont chacun reçu une case à cocher symbolique « Tracez votre signature ici » (même motif que `SignLeaseModal.vue` — aucune capture de signature manuscrite réelle n'existe dans ce projet) qui fournit un espace réservé non vide avant d'appeler `sign()`.

### Un vrai plantage de rendu, trouvé uniquement par le test dans le vrai navigateur

En vérifiant le bouton « Ouvrir » de `pro/edl.vue` en direct, la modale ne s'ouvrait pas du tout — aucune erreur visible à l'écran, juste rien. La console du navigateur (invisible depuis un simple test curl) révélait : `Failed to execute 'structuredClone' on 'Window': [object Object] could not be cloned.` `EdlEditorModal.vue` recevait `props.inventory` (un objet réactif Vue, donc un proxy) et tentait `structuredClone(props.inventory.rooms)` pour en faire une copie éditable — `structuredClone` ne sait pas cloner un proxy Vue, contrairement à un objet JSON simple. Corrigé par un contournement JSON (`JSON.parse(JSON.stringify(...))`, sûr ici puisque les pièces ne contiennent que des données JSON-compatibles). Sans ce test en direct dans un vrai navigateur, ce plantage — qui rend la modale d'édition totalement inutilisable pour n'importe quel état des lieux existant — serait resté invisible : aucun appel API n'échoue, rien n'apparaît dans les journaux réseau.

### `photo_count`, pas `photos` — même motif que les signalements (Lot 12)

`GET`/`PATCH /inventories/:id` ne renvoie jamais les photos d'un objet, seulement `photo_count` (nombre) — confirmé en direct en envoyant `photos: []` dans une écriture et en observant que la réponse renvoie `photo_count: 0`, jamais de tableau. Aucun endpoint d'upload de photo d'objet n'existe dans ce module (seul un téléchargement par index, `GET .../photos/:photoIndex/download`) — `InventoryRoomItem.photos: string[]` était donc un champ fictif dans le type déjà écrit ; corrigé en `photo_count?: number`, et le seul point d'écriture qui l'utilisait (`addItem()` dans `EdlEditorModal.vue`) nettoyé en conséquence.

### Nettoyage : un modal mock devenu orphelin

`app/components/pro/NewEdlModal.vue` (« + Créer un état des lieux », maquette d'origine) n'était plus déclenché par rien — le vrai flux (`pro/edl.vue`) crée l'état des lieux automatiquement à l'ouverture de `EdlEditorModal.vue` (`onMounted` appelle `POST /inventories` si aucun n'existe encore pour la ligne). Vérifié par grep qu'aucun bouton ne référence plus `modal.value = 'newEdl'`. Supprimé avec son montage global dans `layouts/pro.vue` et sa valeur dans le type de `useProModal()` — même discipline que le nettoyage de `RelanceModal.vue` au Lot 23.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/composables/useInventoriesApi.ts` | `sign(id, signature)` — le paramètre manquant, désormais obligatoire |
| `app/components/pro/EdlEditorModal.vue` | Corrigé : plantage `structuredClone`, signature réellement envoyée avec case à cocher symbolique, `readOnly`/`canSend`/`canSign` rendus dépendants du rôle connecté (`useAuthUser().role`) pour permettre la réutilisation de ce même composant côté locataire, `addItem()` nettoyé du champ `photos` fictif |
| `app/pages/locataire/edl.vue` | Terminé — case à cocher symbolique avant signature (même correctif que ci-dessus), vérifié en direct |
| `app/types/tenant.ts` | `InventoryRoomItem.photos` → `photo_count?: number` (voir découverte ci-dessus) |
| `app/components/pro/NewEdlModal.vue` | **Supprimé** — orphelin, voir ci-dessus |
| `app/layouts/pro.vue`, `app/composables/useProSpace.ts` | Référence à `newEdl` retirée du montage global et du type de `useProModal()` |

### Ce qui est hors périmètre, et pourquoi

- **Upload de photo par objet** : aucun endpoint d'upload n'existe dans ce module de l'API (voir découverte ci-dessus) — pas construit plutôt que simulé.
- **État des lieux de sortie (`exit`)** : n'apparaît que pour un bail `terminated` — le bail réel de ce projet est encore `signed`, jamais atteint dans ce lot (bloqué par le même mur de paiement que les Lots 26/27).
- **Réutilisation de `EdlEditorModal.vue` pour une réservation courte durée** : le composant gère déjà `bookingId` (hérité du code d'`im-de`), non revérifié en direct dans ce lot faute de réservation réelle confirmée disponible.

### Tests automatisés

Aucune fonction pure nouvelle extractible.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Sur le vrai état des lieux d'entrée déjà créé, rempli et entièrement signé en direct pendant l'exploration de ce lot (bail réel du Lot 23) :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `PATCH /inventories/:id/sign` avec un corps vide (avant correctif) | **200**, mais aucune signature enregistrée | Confirme le piège silencieux — jamais une erreur explicite |
| `PATCH /inventories/:id/sign` avec `{signature: "data:image/..."}` (propriétaire puis locataire) | **200** les deux fois | Statut passe réellement à `signed`, `signed_at` renseigné |
| `/pro/edl`, clic sur « Ouvrir » (avant correctif) | — | Aucune erreur réseau, mais rien ne s'affiche — `structuredClone` plante silencieusement en JS, invisible sans ouvrir la console du navigateur |
| Même clic, après correctif | `GET /inventories/lease/:id` → 200 | Modale ouverte, données réelles affichées (relevés, commentaire, pièce « Salon », objet « Mur »), bandeau « Signé des deux parties le 22 septembre 2026 » |
| `/locataire/edl`, compte locataire réel de ce bail | `GET /inventories/lease/:id` → 200 | Liste et détail affichés correctement, sans `NaN` ni `undefined` |

### Ce qui n'a pas été testé, et pourquoi

- **Le chemin complet créer → remplir → envoyer → signer pour un tout nouvel état des lieux, en cliquant réellement à travers l'UI** : l'unique bail réel disponible porte déjà un état des lieux d'entrée entièrement signé (créé plus tôt dans cette session par des appels directs, avant la découverte du bug de signature) — aucune deuxième ligne « à créer » n'est disponible pour rejouer ce chemin dans le navigateur sans un second bail réel. Le cycle complet est néanmoins vérifié : `create`/`update`/`send`/`sign` ont chacun été exercés en direct (voir Lots 26/28) avec de vraies transitions de statut confirmées par relecture.

### Prochaine étape proposée

Le blocage de paiement (Lots 26/27) reste la piste la plus pertinente à lever avec l'utilisateur — un seul paiement sandbox réussi débloquerait le bail actif, ce qui permettrait de rejouer le cycle complet des états des lieux sur un vrai état des lieux de sortie, en plus de IP8 (signalements) et de la fin du cycle artisan.

## Lot 29 — Espace artisan complet : le dernier grand pan encore en maquette, reconstruit et vérifié jusqu'au bout du cycle

**Date** : 2026-09-22

### Périmètre

Suite directe du Lot 25/27 (côté demandeur du sous-système artisans, déjà réel) : `app/pages/artisan/*` restait un espace entier de 8 pages en maquette (~1150 lignes), jamais touché. Reconstruit pour de vrai : `missions.vue` (candidater sur un poste ouvert, faire une offre, marquer terminé), `profil.vue` (profil + portfolio), `partenaires.vue` (répondre à une invitation, mettre fin), `index.vue` (tableau de bord), `ArtisanReqModal` → `OffreModal.vue`/`TerminerModal.vue`, et l'identité réelle dans `layouts/artisan.vue` (remplace « Rachidi Gbaguidi » codé en dur partout). Laissés en dehors, faute d'endpoint réel ou de rentabilité pour ce lot : `planning.vue` (aucun endpoint de calendrier/disponibilité artisan trouvé dans le Swagger), `facturation.vue` (dépend d'une intervention `completed` **et** payée — aucune ne l'était avant ce lot, voir plus bas), `historique.vue` (recoupe la liste déjà réelle de `missions.vue`), `guide.vue` (contenu statique, rien à câbler).

### Découverte critique en testant l'acceptation d'offre côté Pro : `paid_at`, pas `status`, est la source de vérité pour « payé »

En rejouant le cycle du Lot 27 pour préparer ce lot, la relecture du payload complet de `GET /artisan-requests/my` a révélé des champs jamais exploités jusqu'ici : `agreed_offer_id`, `paid_at`, `disputed_at`, `dispute_reason`, `closed_at`. Le statut d'une demande **reste `agreed` après un paiement réussi** — seul `paid_at` passe à une date. `pro/artisans.vue` (Lot 25) affichait donc le bouton « Payer l'intervention » indéfiniment même après un paiement réussi, puisqu'il ne regardait que `status === 'agreed'`. Corrigé avant que le bug ne soit jamais observable en conditions réelles (aucun paiement n'avait encore abouti à ce stade) : le bouton « Payer » n'apparaît plus que si `!r.paid_at`, remplacé par un badge « Payée, en attente de l'artisan » sinon. Ce même champ `paid_at` conditionne maintenant, côté artisan, l'apparition du bouton « Marquer terminée » plutôt que le seul statut.

### Découverte en construisant `respondPartnership` : l'action de réponse d'une invitation utilise `decline`, pas `reject`

Contrairement à `PATCH /artisan-requests/offers/:id/respond` (`accept`/`reject`), `PATCH /artisan-partnerships/:id/respond` attend `accept`/**`decline`** — vérifié sur `RespondArtisanPartnershipDto` avant d'écrire le composable, pas deviné par analogie. Une erreur ici serait passée inaperçue en dev (juste un 400 « action invalide ») mais aurait cassé silencieusement le seul bouton « Refuser » d'une invitation.

### Bug trouvé et corrigé en testant la modale d'offre : la méthode composable pour soumettre une offre n'existait pas encore

`useArtisanRequestsApi.ts` (Lot 25) exposait `listOffers` (lecture) mais jamais de méthode pour `POST /artisan-requests/:id/offers` (écriture) — la vérification live du Lot 27 avait utilisé un `fetch` direct en script de test, jamais intégrée au composable réel. Ajoutée (`submitOffer`) avant de brancher `OffreModal.vue` dessus.

### Cycle complet rejoué de bout en bout avec le compte artisan réel du Lot 27, cette fois par la vraie UI des deux côtés

| Étape | Résultat réel |
|---|---|
| Connexion + bascule sur le rôle artisan (`POST /user/roles` + `POST /auth/switch-role`, découverte du Lot 27) | Session artisan réelle obtenue en 2 appels |
| `/artisan` (tableau de bord) | KPIs réels (1 mission en cours, 0 terminée, aucun avis), mission en cours affichée (la candidature `agreed` non payée du Lot 27), 2 vrais postes ouverts listés pour le métier plombier |
| `/artisan/missions`, onglet « Postes ouverts » | 2 postes réels affichés, formulaire de candidature fonctionnel |
| `/artisan/missions`, onglet « En cours » | La demande `agreed` du Lot 27 affichée avec le bon message (« en attente du paiement », pas de bouton « Marquer terminée » puisque non payée — confirme le correctif `paid_at` ci-dessus) |
| `/artisan/profil` | Profil réel chargé (métier, années d'expérience, bio, déjà remplis au Lot 27), formulaire d'édition fonctionnel |
| Upload d'une photo de portfolio (fichier réel) | `POST /files` → **201**, `POST /artisans/me/portfolio` → **201**, photo affichée immédiatement (Cloudinary) |
| Suppression de cette photo | `DELETE /artisans/me/portfolio/:id` → **200** |
| Invitation de partenariat envoyée **depuis le compte propriétaire réel**, vers ce même compte artisan, via la vraie UI `pro/artisans.vue` | `POST /artisan-partnerships` → **201** |
| `/artisan/partenaires` : invitation réelle affichée (« Test Landlord vous propose un partenariat »), acceptée par un vrai clic | `PATCH /artisan-partnerships/:id/respond` `{action:'accept'}` → **200** |

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/composables/useArtisanRequestsApi.ts` | Ajout de `listOpen`, `applyToOpen`, `submitOffer`, `respondPartnership` |
| `app/composables/useArtisanProfileApi.ts` | Nouveau — `fetchMine`, `update`, `uploadFile`, `addPortfolioMedia`, `removePortfolioMedia` |
| `app/composables/useArtisanSpace.ts` | Données mock des missions retirées (`MISSION_DATA`, `MISSION_TABS`, `useMissionTab`, `useMissionSelection`, `ARTISAN_PHOTOS`) ; `useArtisanModalTarget` ajouté (cible réelle des modales offre/terminer) |
| `app/types/artisan.ts` | `ArtisanRequestSummary` complété (`paid_at`, `agreed_offer_id`, `public_posting_id`, `disputed_at`, `closed_at`…) ; `ArtisanProfile`/`ArtisanPortfolioItem` corrigés pour refléter les deux formes réelles (annuaire vs profil propre) |
| `app/pages/artisan/missions.vue` | Réécrite — postes ouverts (candidater), en cours (offre/paiement/terminer selon l'état réel), terminées |
| `app/pages/artisan/profil.vue` | Réécrite — informations + portfolio réels |
| `app/pages/artisan/partenaires.vue` | Réécrite — invitations réelles, accepter/refuser/mettre fin |
| `app/pages/artisan/index.vue` | Réécrite — KPIs et mission en cours réels, nouvelles demandes réelles |
| `app/layouts/artisan.vue` | Identité réelle (nom, métier, note) au lieu de « Rachidi Gbaguidi » codé en dur |
| `app/components/artisan/OffreModal.vue`, `TerminerModal.vue` | Réécrites — soumission réelle ; `TerminerModal` simplifiée (l'étape « photo avant/après » de la maquette n'a pas de contrepartie API, `PATCH .../complete` ne prend aucun corps) |
| `app/pages/pro/artisans.vue` | Correctif `paid_at` décrit ci-dessus |

### Ce qui est hors périmètre, et pourquoi

- **`planning.vue`** : aucun endpoint de calendrier/disponibilité artisan dans le Swagger — laissé en mock plutôt que fabriqué.
- **`facturation.vue`** (`GET .../invoice`) : dépend d'une intervention à la fois `completed` et payée — aucune ne l'était avant ce lot (paiement bloqué, voir Lots 26/27). Réutiliserait `usePdfDocument`/`pollPdfJob` (même motif que la quittance, Lot 5) une fois un cas réel disponible.
- **`historique.vue`** : recoupe l'onglet « Terminées » de `missions.vue`, déjà réel — pas de valeur ajoutée à dupliquer dans ce lot.
- **Litiges** (`dispute`) : toujours hors périmètre, voir Lot 25.

### Tests automatisés

Aucune fonction pure nouvelle extractible — même situation que les Lots 22-25/27 (composables d'appels API directs et UI, pas de logique pure isolable).

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Ce qui n'a pas été testé, et pourquoi

- **`complete()` (marquer terminée) et `review()`** : toujours bloqués par le wallet non financé (Lots 26/27) — la demande de test reste `agreed` non payée, `complete()` exige un paiement préalable. Le code suit le schéma Swagger documenté mais n'a pas pu être exercé en chemin de succès.
- **Refuser une offre, refuser une invitation de partenariat** (`reject`/`decline`) : seuls les chemins d'acceptation ont été exercés en direct dans ce lot ; le code des deux chemins de refus est identique en forme à leurs équivalents déjà vérifiés (accepter), mais pas revérifié séparément.

### Prochaine étape proposée

Le blocage de paiement (Lots 26/27/29) est maintenant le seul obstacle qui empêche de vérifier `complete()`/`review()` et de fermer entièrement le cycle artisan — toujours la piste la plus rentable à lever avec l'utilisateur. En dehors de ce blocage, le sous-système artisans (Lots 20/25/27/29) est désormais fonctionnellement complet côté demandeur **et** côté artisan, à l'exception des litiges (jamais un vrai cas pour les vérifier) et de la facturation (attend un premier paiement réel).

---

## Lot 30 — Le bac à sable de paiement débloqué : bail actif, et IP8 (signalements) enfin vérifié de bout en bout

**Date** : 2026-09-23

### Le blocage des Lots 26/27/29 levé par l'utilisateur

L'utilisateur a fourni les numéros de test réels du bac à sable Mobile Money (Bénin) — MTN `66000001` (succès), Moov `66100001` (succès), Free Money `66200001` (succès), plus leurs équivalents échec/erreur/timeout. Transmis immédiatement aux autres sessions actives (`im-0e`, `im-de`) qui butaient sur le même mur.

### Financer le wallet locataire pour de vrai, et une découverte sur le flux de retour

Avec `66000001` sur la passerelle FedaPay (mode `redirect`, sandbox), le paiement est passé en **`status=approved`** côté FedaPay — mais le solde du wallet restait à 0 F. Cause : l'URL de retour du checkout pointe vers le domaine de production (`immo-benin.surge.sh`), pas vers `localhost:4173` où tourne ce projet en local — la page `/payment/return` qui appelle `verifyReturn()` (déjà câblée depuis IL4) ne s'est donc jamais chargée. Contourné en appelant `POST /payment/verify-return` directement avec le `transactionId` renvoyé dans l'URL de redirection (`{"verified":true,"amount":...,"alreadyCredited":false}`) — confirme que le crédit dépend bien de cet appel explicite, pas d'un webhook asynchrone automatique. Deux recharges réelles (50 000 F puis 80 000 F) ont porté le solde à **130 000 F**, largement au-dessus des 95 000 F requis (caution 50 000 + avance 45 000) pour le bail du Lot 23.

### `POST /leases/:id/entry-payment` → le bail est réellement `active`

Rejoué depuis `/locataire/bail`, bouton « Payer l'entrée dans les lieux » : **201**, `entry_paid_at` renseigné, `advance_balance` porté à `45000` (cible atteinte). Le bail (`0acccd66-…`) est désormais **`active`** — confirmé par une relecture côté propriétaire. Premier bail de tout le projet à atteindre ce statut.

### IP8 (signalements) vérifié en chemin de succès pour la première fois

Avec un bail actif, un vrai signalement a été créé depuis `/locataire/signalements` (« + Signaler un problème » → Plomberie → description réelle) : `POST /signals` → **201**. Visible immédiatement côté propriétaire sur `/pro/signalements`, avec les trois actions réelles du Lot 20 : « Passer à « En examen » » (**200**), « Assigner » avec un nom d'artisan libre (**200**) — les deux vérifiées en direct, boutons et badges mis à jour correctement (« En examen », « Assigné à Kokou Plombier Test »).

### Un vrai bug découvert en essayant d'ouvrir la modale de signalement : composant monté deux fois

En cliquant sur « Signaler un problème », la modale s'affichait avec une grille de catégories fantôme dédoublée derrière elle, et les clics sur les cartes de catégorie étaient tantôt interceptés, tantôt sans effet — pas un problème de containing block (le composant n'a pas d'animation ancêtre à ce niveau), mais un montage en double : `<TenantReportModal />` est monté à la fois globalement dans `layouts/locataire.vue` **et** une seconde fois directement dans `pages/locataire/signalements.vue` — deux instances Vue indépendantes du même composant, chacune avec son propre état local, réagissant toutes deux au même `useReportModal()` partagé. Supprimé le montage redondant au niveau de la page. Vérifié par grep qu'aucun autre modal du projet n'a ce même défaut (recherche systématique sur tous les modals `Tenant*Modal`/`Pro*Modal`/`Artisan*Modal` référencés dans un layout).

### Petite lacune UX réparée au passage

La liste des signalements du locataire ne se rechargeait pas après l'envoi d'un nouveau signalement — attendu, puisque la modale est montée dans le layout et n'a aucun moyen d'émettre un événement vers la page. Corrigé par un `watch` sur `useReportModal()` : rechargement automatique de la liste à la fermeture de la modale.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/pages/locataire/signalements.vue` | Montage redondant de `<TenantReportModal />` retiré ; rechargement automatique de la liste à la fermeture de la modale (`watch` sur `useReportModal()`) |

### Ce qui est hors périmètre, et pourquoi

- **Fixer l'URL de retour du paiement pour pointer vers l'environnement local** : sort du périmètre de ce projet frontend — c'est une configuration d'environnement (probablement une variable `appUrl` construite côté build), pas un bug de code à corriger dans ce lot. Documenté comme découverte, contourné pour la vérification.

### Tests automatisés

Aucune fonction pure nouvelle extractible.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `POST /payment/checkout` (FedaPay) avec `66000001`, deux fois (50 000 F puis 80 000 F) | **201**, sandbox `status=approved` les deux fois | Solde wallet resté à 0 F jusqu'à l'appel manuel de `verify-return` (voir découverte ci-dessus) |
| `POST /payment/verify-return` avec le `transactionId` de chaque transaction | **201**, `{verified:true, alreadyCredited:false}` les deux fois | Solde porté à 130 000 F au total, confirmé par `GET /wallet/me` |
| `POST /leases/:id/entry-payment` depuis `/locataire/bail`, bouton réel | **201** | Bail réellement `active`, `entry_paid_at` et `advance_balance` renseignés, confirmé côté propriétaire |
| `POST /signals` depuis la modale réelle « Signaler un problème » (avant correctif du double montage) | — | Modale fantôme dédoublée, clics de catégorie imprévisibles |
| Même flux, après correctif | **201** | Signalement créé, visible immédiatement côté propriétaire avec les bonnes données (bien, unité, description) |
| `PATCH /signals/:id` (« Passer à « En examen » ») | **200** | Statut réellement mis à jour, boutons d'action recalculés |
| `PATCH /signals/:id` (« Assigner », nom libre) | **200** | « Assigné à Kokou Plombier Test » affiché, bouton devient « Réassigner » |

### Ce qui n'a pas été testé, et pourquoi

- **`cancelUnpaid`/`terminate`** (Lot 23) : le bail étant maintenant `active` (pas `signed`), `cancelUnpaid` n'est plus atteignable pour ce bail précis (elle exige `signed` + délai de grâce dépassé) ; `terminate` (exige `active`) est en revanche désormais atteignable mais volontairement non déclenchée dans ce lot pour ne pas détruire le bail actif qui sert de donnée de test à plusieurs autres modules (IP8, états des lieux).
- **Le cycle artisan complet** (`complete()`/`review()`, Lots 25/27/29) : même déblocage de paiement disponible, mais laissé aux sessions déjà engagées sur ce module (`im-0e`) pour éviter un chevauchement de travail.

### Prochaine étape proposée

**`terminate()`** sur le bail actif (une fois les autres vérifications qui en dépendent terminées) fermerait le dernier chemin du cycle de vie des baux jamais vérifié. Alternative : revenir sur le cycle artisan avec les mêmes numéros de test, en coordination avec `im-0e`.

## Lot 31 — Addendum au Lot 29 : cycle artisan poussé jusqu'à `complete()` grâce aux numéros de test du Lot 30, et un vrai statut jamais vu découvert au passage

**Date** : 2026-09-23

### Le paiement d'intervention artisan fonctionne réellement avec les numéros de test communiqués par l'utilisateur

Même méthode que le Lot 30 (`im-3a`) : `POST /payment/checkout` sur la passerelle FedaPay (mode `redirect`), numéro `66000001` (Momo Test) saisi dans le vrai popup sandbox, retour `status=approved`. La page de retour interne (`/payment/return`) ne se charge jamais — l'URL de retour de FedaPay pointe vers `immo-benin.surge.sh` (production), pas `localhost` — donc `POST /payment/verify-return` a été appelé directement avec le `transactionId` extrait de l'URL de retour, exactement le contournement déjà documenté par `im-3a` au Lot 30. Wallet du propriétaire de test crédité (25 000 F), confirmé par `GET /wallet/me`.

### Découverte : `pay()` fait passer le statut directement à `in_progress`, jamais `agreed` + `paid_at`

Hypothèse du Lot 29 invalidée par le premier paiement réel jamais effectué sur ce sous-système : le statut ne reste pas `agreed` avec `paid_at` renseigné comme supposé — il devient **`in_progress`**, une valeur jamais observée avant ce lot. Corrigé avant que le bug ne s'installe silencieusement (même logique que la découverte `paid_at` du Lot 29 lui-même) :

| Fichier | Correction |
|---|---|
| `app/types/artisan.ts` | `ArtisanRequestStatus` inclut désormais `'in_progress'` |
| `app/pages/pro/artisans.vue` | `STATUS_LABEL`/`STATUS_TONE` couvrent `in_progress` (« Payée, en attente de l'artisan ») ; le badge de paiement se déclenche sur `status === 'in_progress'`, plus sur `paid_at` |
| `app/pages/artisan/missions.vue` | Onglet « En cours » inclut `in_progress` ; le bouton « Marquer terminée » n'apparaît que sur `in_progress` (plus sur `agreed` + `paid_at`) |
| `app/pages/artisan/index.vue` | KPI « en cours » et sélection de la mission en vedette incluent `in_progress` |

### `complete()` vérifié en chemin de succès réel, depuis la vraie UI des deux côtés

Une fois le statut `in_progress` atteint : `/artisan/missions`, bouton « Marquer terminée » → modale de confirmation réelle → `PATCH /artisan-requests/:id/complete` → **200**. Rechargement confirmé côté propriétaire (`pro/artisans.vue`) : badge passé à « Terminée », bouton « Laisser un avis » apparu.

### `review()` reste bloqué, mais pour une raison différente de celle documentée au Lot 29 — pas le paiement, la clôture

En essayant réellement de laisser un avis (formulaire réel, note + commentaire, soumis via la vraie UI), l'API a répondu **400** : « Cette demande doit être clôturée avant de pouvoir être notée. » — `completed` (statut atteint) n'est pas la même chose que `closed` (champ `closed_at`, toujours `null` sur cette demande). Aucune route du Swagger ne permet de déclencher cette clôture manuellement (vérifié : `POST/PATCH /artisan-requests` ne compte que `cancel`, `pay`, `complete`, `offers`, `apply`, `dispute*` — rien pour clôturer) — la garantie de 7 jours proposée dans l'offre du Lot 27 doit vraisemblablement s'écouler avant qu'un job serveur ne passe la demande à `closed`, seul état où `review()` est accepté. Non testable dans une session live, contrairement au blocage du Lot 29 (financement du wallet) qui, lui, est maintenant levé.

### Ce qui a été livré

Les 4 fichiers listés dans le tableau ci-dessus (correctifs de statut `in_progress`).

### Tests automatisés

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Ce qui n'a pas été testé, et pourquoi

- **`review()`** : bloqué par le délai de garantie réel (7 jours), pas par un problème technique — voir ci-dessus.
- **Litiges, facture PDF** : toujours hors périmètre (Lot 25/29).

### Prochaine étape proposée

Le sous-système artisans (Lots 20/25/27/29/31) est maintenant vérifié en chemin de succès réel de bout en bout, à l'exception de `review()` (délai de garantie) et des litiges (aucun cas réel). Plus rien à débloquer ici avec les moyens de cette session — le reste du temps est mieux investi ailleurs (`terminate()` du bail, ou un nouveau module).

---

## Lot 32 — `pro/tarifs.vue` : tarifs, calendrier de disponibilité et liste d'attente

**Date** : 2026-09-23

### Un module jamais scopé, mais avec un vrai support API complet

`pro/tarifs.vue` était resté 100 % maquette depuis le début du projet. Vérification sur le Swagger : `GET/POST /units/:unitId/pricing` (grilles tarifaires par fréquence), `GET /units/:id/availability` + `POST/DELETE .../availability-blocks` (calendrier, blocages manuels), `GET /units/:unitId/waitlist` (liste d'attente côté propriétaire) — les trois volets de la maquette ont une vraie contrepartie API, jamais exploitée.

### Deux découvertes en testant en direct sur les deux unités réelles du compte de test

1. **`AvailabilityBlock.end_date` est réellement `null`** sur un blocage sans terme — le bail actif du Lot 30 bloque `Unité Test E2E` depuis le 1er octobre 2026 **sans date de fin** (`blocked_by: "lease"`), confirmé en direct. Même piège que `LeaseSummary.end_date` (Lot 23) : le type supposait une chaîne garantie. Corrigé.
2. **`GET /units/:id/availability` ne renvoie jamais d'`id`** sur les blocages qu'elle liste — même pour un blocage `manual` — alors que la réponse de création (`POST /availability-blocks`) en a un. Un blocage manuel n'est donc supprimable que si son `id` a été retenu au moment de sa création ; impossible de le retrouver plus tard depuis la seule liste. Documenté dans le type (`AvailabilityBlockDetail` séparé de `AvailabilityBlock`) plutôt que fabriqué comme une fonctionnalité de suppression générale qui n'existe pas.

### Une seconde unité réelle nécessaire pour tester les blocages manuels

`Unité Test E2E` (bail actif) refuse tout nouveau blocage — `409 Conflict`, « Cette période chevauche un bail... » — cohérent, une unité louée ne devrait pas pouvoir être bloquée par-dessus. Les tests de blocage manuel et de tarification ont donc été faits sur la seconde unité réelle du compte (`Unite Reject Test`, créée au Lot 24, toujours libre), qui s'est révélée être exactement le terrain qu'il fallait pour ce lot.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/types/property.ts` | `AvailabilityBlock.end_date` corrigé (`string \| null`) ; `AvailabilityBlockDetail`, `CreatePricingPayload`, `UpdatePricingPayload`, `BlockAvailabilityPayload`, `LandlordWaitlistEntry` (forme déduite par analogie, non documentée par le Swagger et non vérifiée en direct faute d'inscription réelle) ajoutés ; `UnitPricing` complété (`created_at`/`updated_at` optionnels) |
| `app/composables/useUnitPricingApi.ts` | Nouveau — `fetchPricing`, `createPricing`, `updatePricing`, `removePricing`, `fetchAvailability`, `blockAvailability`, `unblockAvailability` |
| `app/composables/useWaitlistApi.ts` | `fetchForUnit(unitId)` ajouté (vue propriétaire, à côté de `fetchMine()` déjà existant côté locataire depuis le Lot 7) |
| `app/pages/pro/tarifs.vue` | Réécrit — sélecteur d'unité réel, grilles tarifaires (ajout/activation/retrait), liste d'attente (état honnête si vide, « Contacter » ouvre une vraie conversation faute d'action de notification côté API), calendrier du mois courant construit à partir des vrais blocages, blocage manuel avec motif |

### Ce qui est hors périmètre, et pourquoi

- **« Prévenir » un locataire en liste d'attente** : aucune action de notification n'existe côté API pour la liste d'attente — remplacé par « Contacter », qui ouvre une vraie conversation (réutilise `useMessagingApi().createConversation()`, déjà réel depuis le Lot 9/17).
- **Naviguer d'un mois à l'autre dans le calendrier** : la maquette n'affichait qu'un mois statique — ce lot construit le mois courant réel à partir des vraies données plutôt que de fabriquer une navigation mensuelle absente de la maquette elle-même.
- **Retirer un blocage manuel existant, créé lors d'un lot précédent** : impossible sans son `id`, jamais renvoyé par la liste (voir découverte ci-dessus) — seul un blocage créé pendant la session en cours peut être retiré, avec l'`id` retenu au moment de sa création. Non implémenté dans ce lot (aucun bouton « Retirer » sur le calendrier) faute d'un flux capable de gérer cette limite proprement sans induire l'utilisateur en erreur.

### Tests automatisés

Aucune fonction pure nouvelle extractible.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

Compte propriétaire de test, sur ses deux unités réelles :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `/pro/tarifs`, sélection de `Unite Reject Test` (libre) | `GET .../pricing`, `.../availability`, `.../waitlist` → 200 chacun | État vide honnête sur les trois panneaux |
| Ajout d'un tarif « Au mois » déjà existant (créé plus tôt dans la session par curl, pour la découverte du schéma) | `POST .../pricing` → **409** « Un tarif monthly existe déjà. Utilisez PATCH pour le modifier. » | Message réel affiché tel quel — confirme que la contrainte anti-doublon serveur fonctionne et que le mappage d'erreur générique la restitue correctement |
| Bascule Actif/Inactif sur ce tarif | `PATCH .../pricing/:id` → **200** | Badge passe réellement à « Inactif », confirmé par rechargement |
| Blocage manuel (1-5 décembre, motif) | `POST .../availability-blocks` → **201** | Blocage créé pour de vrai (vérifié par `GET .../availability` après coup) |
| Tentative de blocage manuel sur `Unité Test E2E` (bail actif) | `POST .../availability-blocks` → **409** « Cette période chevauche un bail... » | Confirme que le calendrier respecte réellement le bail actif |
| Calendrier du mois courant, `Unité Test E2E` | `GET .../availability` → 200, `[{start_date:"2026-10-01", end_date:null, blocked_by:"lease"}]` | Rendu correct malgré `end_date: null` — aucun plantage, grâce au correctif de type |

### Ce qui n'a pas été testé, et pourquoi

- **`GET /units/:unitId/waitlist` avec une vraie inscription** : aucune inscription réelle en liste d'attente n'existe sur aucune des deux unités du compte de test — `LandlordWaitlistEntry` reste une forme déduite par analogie, non confirmée en direct. Créer une inscription réelle nécessiterait un compte locataire tentant de réserver une unité déjà `occupied`/complète, non disponible avec les unités actuelles (toutes deux `available`).
- **Le bouton « Contacter » de la liste d'attente** : câblé sur un vrai appel (`createConversation`), mais jamais exercé en direct faute d'inscription réelle à contacter.

### Prochaine étape proposée

**`pro/documents.vue`** reste la dernière pièce du module Biens/Pro encore en maquette pure — pas d'endpoint dédié, mais agrégerait des sources déjà réelles (PDF de bail via `usePdfDocument`, documents KYC, PDF d'état des lieux, facture artisan une fois `review()` débloqué). Alternative : créer une inscription de liste d'attente réelle (nécessite une unité complète) pour finir de vérifier ce lot-ci.

---

## Lot 33 — `pro/documents.vue` : agrégation réelle de quatre sources déjà câblées

**Date** : 2026-09-23

### Le dernier module Biens/Pro encore en maquette, et le motif `usePdfDocument` (socle §6) enfin réutilisé côté propriétaire

Aucun endpoint « tous mes documents » n'existe — reconstruit en agrégeant quatre sources déjà réelles et déjà câblées séparément dans des lots précédents : contrats de bail (`useLeasesApi().fetchMine()` → `/leases/:id/pdf`), états des lieux signés (`useInventoriesApi().fetchByLease()` → `/pdf/inventories/:id`), factures d'artisan payées (`useArtisanRequestsApi().listMine()`, filtrées sur `paid_at` non nul → `/artisan-requests/:id/invoice`), reçus de séjour (`useLandlordBookingsApi().fetchMine()`, réservations confirmées → `/bookings/:id/receipt`). Le motif `usePdfDocument()` (créé au socle, Lot 1, pour la quittance locataire) est réutilisé tel quel — premier point de réutilisation côté Pro.

### Un bénéfice inattendu du Lot 31 : la facture d'artisan, bloquée depuis le Lot 29, est maintenant réelle

Le Lot 29 avait explicitement laissé `facturation.vue` de côté faute d'une intervention à la fois `completed` et payée. Le Lot 31 (`im-0e`) en a produit une pour de vrai en poussant le cycle artisan jusqu'à `complete()`. Ce lot en profite directement : `GET /artisan-requests/:id/invoice` a été vérifié en direct sur cette même intervention réelle — **202**, un vrai job PDF, jamais testé auparavant.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/pages/pro/documents.vue` | Réécrit — agrégation des quatre sources ci-dessus, recherche et filtre par type (client, comme la maquette), aperçu réel via `usePdfDocument()` + `useProtectedFile()` (même séquence que `locataire/bail.vue`, Lot 5) |

### Ce qui est hors périmètre, et pourquoi

- **Documents KYC** : `GET /kyc/documents/mine` existe et est déjà exploité ailleurs (Lot 3), mais ce sont des pièces justificatives d'identité, pas des documents locatifs au sens de cette page — la maquette elle-même ne les listait pas. Non ajoutés pour ne pas mélanger deux catégories différentes.
- **Reçus de séjour** : câblés (`GET /bookings/:id/receipt`) mais jamais exercés en direct — le compte de test ne possède aucune réservation courte durée confirmée (`GET /bookings/landlord` reste vide depuis le Lot 19).

### Tests automatisés

Aucune fonction pure nouvelle extractible.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `/pro/documents` sur le compte de test | `GET /leases/my`, `GET /inventories/lease/:id`, `GET /artisan-requests/my` → 200 chacun | Trois documents réels affichés : contrat de bail, état des lieux d'entrée, facture d'artisan — tous correctement typés et nommés |
| Clic « Aperçu » sur le contrat de bail | `GET /leases/:id/pdf?format=pdf` → **202**, job PDF sondé ~20 s (jamais prêt dans ce délai), repli sur `?format=html` → 200 | Aperçu HTML ouvert dans un nouvel onglet (URL `blob:`), exactement le comportement documenté de `usePdfDocument()` — premier test en direct de son chemin de repli complet |
| `GET /artisan-requests/:id/invoice` sur l'intervention réelle payée du Lot 31 | **202**, vrai `pdf_job_id` | Jamais testé avant ce lot — confirme que ce endpoint fonctionne réellement une fois les conditions réunies |

### Ce qui n'a pas été testé, et pourquoi

- **Le reçu de séjour** : aucune réservation courte durée confirmée n'existe sur le compte de test (voir hors périmètre ci-dessus) — le code suit le même motif déjà vérifié pour les trois autres types, mais son chemin nominal reste non exercé en direct.
- **Le job PDF du contrat de bail arrivant réellement à `ready`** : dans le test de ce lot, il n'a jamais abouti dans la fenêtre de 20 s et le repli HTML a pris le relais — la génération PDF elle-même (au-delà du repli) reste non observée en succès direct pour ce document précis.

### Prochaine étape proposée

Les seuls fronts encore réellement ouverts sont désormais : `pro/equipe.vue`/`pro/mandats.vue` (bloqués par le problème backend de contexte d'équipe, I2, indépendant de ce projet), et la vérification d'un reçu de séjour réel (nécessiterait une réservation courte durée confirmée, jamais créée sur ce compte). L'essentiel de l'espace Pro et locataire de ce projet est désormais vérifié contre l'API live.

---

## Lot 34 — Les deux derniers manques fermés : I2 reconfirmé en direct, et un vrai reçu de séjour

**Date** : 2026-09-23

### I2 revérifié, pas juste réaffirmé

Plutôt que de recopier la conclusion des lots précédents, `POST /team/invite` a été retesté en direct avec un corps enfin conforme au schéma réel (`role_preset` + `property_ids`, requis mais absents des tentatives précédentes — un DTO jamais entièrement lu jusqu'ici). Avec un corps valide : **500** `INTERNAL_SERVER_ERROR`. Confirme qu'il s'agit bien d'un bug serveur, pas d'un appel mal formé côté client comme les échecs précédents auraient pu le laisser croire — `pro/equipe.vue`/`pro/mandats.vue` restent donc légitimement hors de portée.

### Un vrai reçu de séjour, en fermant la seule case encore vide du Lot 19 et du Lot 33

Aucune réservation courte durée n'existait sur le compte de test depuis le Lot 19 (« Aucune réservation... » systématiquement honnête, jamais vérifié en chemin de succès). Ce lot en crée une pour de vrai sur l'unité libre du compte (`Unite Reject Test`) :

1. Ajout d'un tarif journalier réel (`POST /units/:id/pricing`, `billing_frequency: daily`, 8 000 F) — un tarif quotidien actif est une condition documentée mais jamais remplie jusqu'ici pour créer une réservation.
2. `POST /bookings` (2 nuits) → **201**, hold `pending_payment`, 16 000 F.
3. `POST /bookings/:id/pay` → **201**, `{success:true, immediateAmount:16000, retainedAmount:0}` — crédite le propriétaire immédiatement (pas de séquestre pour ce logement, `booking_retention_percentage: 0`).
4. `GET /bookings/:id/receipt` → **201**, un vrai job PDF — jamais testé auparavant.

### Ce qui a été livré

Aucun changement de code — vérification manuelle pure, comme les Lots 24/26/27/30/31.

### Ce qui est hors périmètre, et pourquoi

- **Corriger I2** : hors de portée, bug backend confirmé, pas un problème de ce projet frontend.

### Tests automatisés

Aucun changement de code, donc aucun test à ajouter.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `POST /team/invite` avec un corps conforme au schéma (`role_preset`, `property_ids`) | **500** `INTERNAL_SERVER_ERROR` | Confirme I2 comme un vrai bug serveur, revérifié avec un appel enfin correctement formé |
| `POST /units/:id/pricing` (tarif journalier, 8 000 F) sur l'unité libre | **201** | Tarif réel créé, condition préalable à une réservation courte durée remplie |
| `POST /bookings` (2 nuits) | **201**, `pending_payment`, 16 000 F | Hold réel créé |
| `POST /bookings/:id/pay` | **201**, `{success:true, immediateAmount:16000}` | Réservation passée à `confirmed`, wallet propriétaire crédité immédiatement |
| `/pro/reservations` (Lot 19) après coup | `GET /bookings/landlord` → 200, la réservation apparaît | Première vérification en chemin de succès de cette page depuis sa livraison — « Rights Tester · Confirmée · 10 déc. → 12 déc. 2026 » affiché correctement |
| `GET /bookings/:id/receipt` | **201**, vrai `pdf_job_id` | Jamais testé avant ce lot |
| `/pro/documents` (Lot 33) après coup | Le reçu apparaît comme 4ᵉ document réel | Ferme le seul type de document du Lot 33 resté non exercé en direct |

### Ce qui n'a pas été testé, et pourquoi

- **Retenue de garantie sur une réservation courte durée** (`booking_retention_percentage` non nul) : l'unité de test a `booking_retention_percentage: 0` — jamais observé de séquestre partiel en direct sur ce compte, seulement le cas « tout crédité immédiatement » déjà documenté au Lot 7.

### Prochaine étape proposée

Avec ce lot, il n'existe plus de zone du produit vérifiable avec les moyens de cette session qui ne le soit déjà — seul I2 (bug serveur confirmé, hors de portée frontend) reste ouvert. L'intégration API de ce projet, du socle jusqu'ici, est désormais complète et vérifiée en direct sur l'essentiel de son périmètre fonctionnel.

---

## Lot 35 — Pièce d'identité (`kyc.vue`, onglet « Identité ») : un vrai écart signalé par l'utilisateur, corrigé

**Date** : 2026-09-23

### Un écart repéré par une capture d'écran, pas par une exploration du Swagger

L'utilisateur a signalé que l'onglet « Identité » de `/kyc` « n'a pas l'air complet » — deux cases recto/verso CNI qui restaient des dégradés décoratifs. Le code lui-même le documentait honnêtement depuis le Lot 3 (« La capture de pièce d'identité n'est pas encore reliée à l'API »), mais la question a motivé une revérification du Swagger plutôt qu'une simple confirmation de la note existante.

### Un vrai endpoint dédié, jamais exploré : un seul fichier, pas un couple recto/verso

`POST /user/id-card` et `GET /user/{id}/id-card` existent, distincts de `/kyc/documents` — repérés grâce à un champ `has_id_card` aperçu en passant dans une réponse admin du Lot 21, jamais suivi jusqu'ici. Le schéma révèle que la maquette elle-même supposait une structure inexacte : un seul champ `id_card` (écrasé à chaque nouvel envoi), pas deux faces distinctes. `GET` ne renvoie jamais d'URL de stockage (audit de sécurité du 19/07/2026 mentionné dans la description de la route) — seulement les octets bruts du fichier, à consommer via `useProtectedFile()`, même motif que les documents KYC (Lot 3) et les pièces jointes de signalement (Lot 8/12).

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/composables/useKycApi.ts` | `uploadIdCard(file)` et `idCardDownloadUrl(userId)` ajoutés |
| `app/pages/kyc.vue` | Onglet « Identité » reconstruit — un seul encart réel (chargement/aperçu/absence honnête), dépôt et remplacement réels ; `idCards`/`photos` (maquette recto-verso, désormais orpheline) retirés |

### Ce qui est hors périmètre, et pourquoi

- **Détection automatique du type de pièce** (CNI vs passeport) : l'API ne distingue pas le type de document, un seul champ générique — la maquette ne le faisait pas non plus.
- **Validation de format côté client** (JPEG/PNG/WebP/PDF) : laissée au serveur (400 explicite si refusé), déjà mappé par le gestionnaire d'erreurs générique — pas dupliquée côté client pour ce lot.

### Tests automatisés

Aucune fonction pure nouvelle extractible.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification manuelle contre l'API live

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `POST /user/id-card` (compte propriétaire de test) | **201** `{success:true}` | — |
| `GET /user/:id/id-card` juste après | **200**, `image/png` | Image réellement affichée dans l'écran, bouton passé à « Reprendre la photo » |
| Même écran, compte locataire de test | **200** | Pièce déjà présente sur ce compte (déposée avant ce lot) — affichage correct, mais chemin « aucune pièce déposée » non exercé avec de vraies données faute d'un compte qui en soit dépourvu |

### Ce qui n'a pas été testé, et pourquoi

- **L'état « aucune pièce déposée »** : les deux comptes de test disponibles (propriétaire et locataire) portent déjà une pièce d'identité réelle. Branche la plus simple des trois (texte statique, aucune logique asynchrone) — risque résiduel jugé faible, mais non confirmé en direct.

### Prochaine étape proposée

Aucune piste supplémentaire identifiée dans ce périmètre — ce lot referme le dernier écart signalé. Seul I2 reste ouvert, comme documenté au Lot 34.

## Lot 36 — Bug critique signalé par l'utilisateur : tous les comptes affichaient le même utilisateur (« Bonjour Sèdjro »)

**Date** : 2026-09-23

### Le signal : une capture d'écran, pas une description de bug

L'utilisateur a envoyé une capture de `/kyc` montrant « Bonjour Sèdjro » et « Sèdjro Aholou — Locataire vérifié », avec pour seul commentaire : « peu importe avec qui je me connecte, j'ai sedjro » — c'est-à-dire que n'importe quel compte de test, une fois connecté, finissait par afficher le profil d'un utilisateur fixe (« Sèdjro »). Un symptôme caractéristique d'un état partagé entre utilisateurs, pas d'un problème d'affichage local.

### Cause réelle : un verrou de rafraîchissement au niveau du module, partagé par tout le process serveur

`useApiAuth()` (`app/composables/useApiAuth.ts`) tenait son verrou anti-concurrence de rafraîchissement de jeton (`sharedRefreshLock`, voir `app/utils/refreshLock.ts`) dans un `let` **au niveau du module** :

```ts
let sharedRefreshLock: ReturnType<typeof createRefreshLock<TokenPair>> | null = null
```

Sous Nuxt en SSR (activé par défaut, ni `ssr: false` ni détection dans `nuxt.config.ts`), un module n'est chargé qu'**une seule fois pour tout le process Node**, donc ce `let` survivait entre les requêtes HTTP de différents visiteurs — contrairement à `useState`/`useCookie`, qui sont eux correctement ré-instanciés à chaque requête. Concrètement :

1. Au premier rafraîchissement de jeton déclenché sur le serveur (par n'importe quel visiteur — ici, un compte de test nommé « Sèdjro Aholou »), `sharedRefreshLock` se figeait, fermé (`closure`) sur les références de cookies (`accessToken`, `refreshToken`) **de cette requête précise**.
2. Toute requête *suivante*, d'un **autre** utilisateur, dont le jeton d'accès expirait (401 → `refreshOnce()`), réutilisait ce même verrou — donc appelait `POST /auth/refresh` avec le refresh_token de Sèdjro, jamais le sien.
3. Le nouveau couple de jetons obtenu (celui de Sèdjro) était utilisé pour rejouer la requête qui avait pris le 401 — y compris `GET /auth/me` — dont la réponse (le profil de Sèdjro) était alors écrite dans `useState('authUser')` **de la requête SSR courante**, donc affichée à la place du vrai visiteur.
4. Le cookie du visiteur n'était pas directement écrasé (`authenticatedFetcher.ts` n'écrit le jeton rafraîchi que dans la requête rejouée, jamais dans le cookie de réponse), donc le bug était intermittent — visible uniquement au moment précis où le jeton d'accès du visiteur venait à expirer côté serveur.

Ce n'est pas un bug d'API : c'est une fuite d'état entre requêtes SSR, purement côté client Nuxt.

### Correction

`sharedRefreshLock` n'est plus un `let` de module — le verrou est maintenant porté par `useNuxtApp()`, qui redonne une instance neuve à chaque requête côté serveur (donc plus aucun partage entre visiteurs) tout en restant une instance unique pour toute la session côté client (donc le comportement voulu par le commentaire d'origine — « un seul verrou pour toute la session, pas un par composant » — reste intact là où il avait un sens).

| Fichier | Changement |
|---|---|
| `app/composables/useApiAuth.ts` | `sharedRefreshLock` déplacé du niveau module vers une propriété non réactive de `useNuxtApp()` |

### Tests automatisés

Ce composable dépend du contexte Nuxt (`useCookie`, `useNuxtApp`, `useRuntimeConfig`) et n'était déjà pas couvert par des tests unitaires purs avant ce lot (cohérent avec le reste du projet — voir les lots précédents sur les composables liés au contexte Nuxt).

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Vérification

- `npx nuxi build` : succès, aucune erreur de type introduite par le changement de portée du verrou.
- Build servi en local (`node .output/server/index.mjs`) : démarre et répond 200 sur `/`.
- Le mécanisme n'a pas pu être reproduit isolément par un scénario à deux utilisateurs concurrents (nécessiterait deux connexions réelles simultanées dont le jeton d'accès expire pendant la fenêtre de test, difficile à provoquer de façon fiable) — la correction s'appuie sur la lecture du code, qui explique exactement le symptôme observé (un utilisateur fixe et unique affiché indépendamment du compte réellement connecté), et sur la vérification que `useNuxtApp()` est bien réinstancié par requête côté serveur (comportement documenté de Nuxt, cohérent avec `useState`/`useCookie` du même fichier).

### Ce qui n'a pas été testé, et pourquoi

- **Reproduction en direct du bug puis de sa correction avec deux comptes réels simultanés** : demanderait de synchroniser précisément l'expiration du jeton d'accès de deux sessions en parallèle, peu fiable à provoquer à la demande. La correction traite la cause racine identifiée avec certitude dans le code (partage d'un verrou fermé sur des cookies d'une requête passée), pas un symptôme supposé.

### Prochaine étape proposée

Aucune — ce lot corrige un bug signalé, pas une intégration en attente. Seul I2 reste ouvert, comme documenté au Lot 34.

## Lot 37 — Balayage complet de l'espace locataire : le vrai « Bonjour Sèdjro » trouvé (pas celui du Lot 36), deux fuites SSR de plus, du code mort retiré

**Date** : 2026-09-23

### Contexte : test live coordonné sur les trois espaces, en parallèle avec `im-f3` (Public + Artisan) et `im-ee` (Pro)

Périmètre de ce lot : `app/pages/locataire/*`, `kyc.vue`, et le wallet locataire.

### Découverte d'`im-f3` : le Lot 36 corrigeait une vraie fuite SSR, mais ce n'était pas la cause du bug signalé par l'utilisateur

`im-f3` a prouvé par un `curl` brut (jeton frais, sans navigateur) qu'un second compte locataire réel affichait toujours « Bonjour Sèdjro » après le correctif du Lot 36. Cause réelle, distincte : `app/layouts/locataire.vue` ne lisait jamais `useAuthUser()` — trois littéraux codés en dur (`'Bonjour Sèdjro'` dans `PAGE_TITLES`, `<CoreAvatar name="Sèdjro Aholou">`/`<p>Sèdjro Aholou</p>`/`"Locataire vérifié"` dans la sidebar, `<LayoutAccountMenu name="Sèdjro Aholou">` dans le header). Invisible depuis le Lot 2 par pure coïncidence : le compte de test « habituel » utilisé dans presque tous les lots précédents s'appelle réellement Sèdjro Aholou.

### Correction

Même patron que `displayName`/`roleLabel` dans `app/layouts/pro.vue` (`useAuthUser()`, repli sur l'email si pas de nom) :

| Fichier | Changement |
|---|---|
| `app/layouts/locataire.vue` | `displayName`/`firstName`/`verifiedLabel` calculés depuis `useAuthUser()` ; les 3 littéraux « Sèdjro Aholou » et le titre de page « Bonjour Sèdjro » remplacés |

Revérifié en direct avec un second compte réel (`tenant-visit-test-1790021098@example.com`, "Visit Tester") : affiche bien son propre nom, plus jamais Sèdjro.

### Deux fuites SSR supplémentaires du même type que le Lot 36, trouvées et corrigées

`im-f3`, en creusant le même bug, a repéré que `app/composables/useTenantWallet.ts` et `useTenantLeases.ts` portaient chacun un verrou anti-double-fetch (`let inFlight`) au niveau module — exactement le même anti-motif que `sharedRefreshLock` (Lot 36). Contrairement à la fuite du Lot 36, celle-ci n'échange pas d'identité : la promesse en vol résout dans le `useState` de la requête d'origine, donc un second visiteur dont le jeton wallet/leases serait en cours de premier chargement au même moment verrait simplement son `wallet`/`leases` rester vide indéfiniment (pas de mauvaises données affichées, mais un blocage silencieux). Corrigé avec le même patron que le Lot 36 (verrou porté par `useNuxtApp()`, pas par un `let` de module) :

| Fichier | Changement |
|---|---|
| `app/composables/useTenantWallet.ts` | `inFlight` déplacé vers `useNuxtApp()._tenantWalletInFlight` |
| `app/composables/useTenantLeases.ts` | `inFlight` déplacé vers `useNuxtApp()._tenantLeasesInFlight` |

Un grep de tout `app/composables` pour ce motif (`^let inFlight`, `^let.*Lock\b`) ne laisse plus qu'un seul cas restant, `useLandlordPromoCodes.ts` — hors périmètre (espace Pro, territoire `im-ee`, signalé séparément par `im-f3`).

### Code mort retiré, découvert en cherchant toutes les occurrences de « Sèdjro »

- **`app/components/tenant/SignerModal.vue`** (« Signer l'état des lieux », signature « Sèdjro A. » codée en dur) : jamais atteignable — aucune page ne pose `leaseModal.value = 'signer'` (seul le trigger `'signer-bail'`, un composant distinct, `SignLeaseModal.vue`, est réellement utilisé pour la signature du bail). La vraie signature d'état des lieux est câblée directement dans `edl.vue` depuis le Lot 28 (`inventoriesApi.sign()`), sans modale. Composant supprimé, retiré du montage global (`layouts/locataire.vue`), `'signer'` retiré de l'union de `useLeaseModal()`.
- **`useThreadMessages()`/`TENANT_THREADS`/`ChatMessage`** (`useTenantSpace.ts`) : mock de messagerie (avec un message « Merci Sèdjro… ») jamais utilisé — `messages.vue` s'appuie sur le vrai `useMessagingApi()` depuis le Lot 9. Bloc entier retiré.
- **Compteurs de la sidebar** (`NAV_ITEMS`, `useTenantSpace.ts`) : `'1'`/`'1'`/`'2'` codés en dur sur Demandes/Signalements/Messages, jamais reconnectés à une vraie donnée — visiblement faux en direct (badge « 2 » sur Messages alors que la page affichait « Aucune conversation. »). Retirés (mis à `''`), même choix qu'`im-f3` vient de faire pour le même motif côté artisan (`ARTISAN_NAV_ITEMS`) plutôt que de fabriquer un comptage live supplémentaire dans une mise en page partagée. Précédent : le Lot 9 avait déjà remplacé un badge de notification codé en dur par un vrai compteur — même standard, choix différent ici faute d'endpoint de comptage léger déjà disponible pour ces trois cas précis.

### Balayage complet des pages restantes

Connecté en direct (`tenant-visit-test-1790021098@example.com`) sur les 13 écrans du périmètre (`/locataire`, `bail`, `demandes`, `edl`, `favoris`, `guide`, `messages`, `profil`, `reservations`, `signalements`, `visites`, `wallet`, `/kyc`) : aucune erreur console, aucun plantage, tous les états vides honnêtes (« Aucune demande publiée… », « Vous n'avez pas encore de favori », etc.). Un seul 404 console bénin sur `/kyc` (aperçu d'une pièce d'identité non déposée — état vide correctement affiché malgré tout, pas creusé plus loin).

### Serveur de test : piège méthodologique découvert et documenté pour la suite

Le serveur partagé `localhost:4173` (utilisé par tous les lots précédents) s'est révélé être un ancien build. `im-f3` a d'abord signalé sa péremption puis proposé `localhost:4174` — qui s'est avéré être un **build de production** (`node .output/server/index.mjs`, sans rechargement à chaud). Mon correctif de `layouts/locataire.vue` ne s'y reflétait donc pas du tout (revérifié en direct : toujours « Bonjour Sèdjro » après l'édition), ce qui aurait pu faire croire à un échec du correctif. Résolu en lançant une instance `nuxt dev` dédiée sur `localhost:4175` pour ce lot. Point de méthode pour les prochains lots multi-sessions : un serveur de test partagé doit être identifié explicitement comme `nuxt dev` (HMR) ou un build figé avant d'y fier une vérification de code fraîchement modifié.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/layouts/locataire.vue` | Identité réelle (voir ci-dessus) |
| `app/composables/useTenantWallet.ts`, `useTenantLeases.ts` | Verrou anti-double-fetch déplacé hors du niveau module |
| `app/composables/useTenantSpace.ts` | `useThreadMessages`/`TENANT_THREADS`/`ChatMessage` retirés ; compteurs `NAV_ITEMS` corrigés ; `'signer'` retiré de `useLeaseModal()` |
| `app/components/tenant/SignerModal.vue` | **Supprimé** (code mort, voir ci-dessus) |

### Tests automatisés

Aucune fonction pure nouvelle extractible — composables dépendant du contexte Nuxt (`useState`, `useNuxtApp`), déjà hors du périmètre des tests unitaires pour les mêmes raisons que le Lot 36.

```
Test Files  14 passed (14)
     Tests  78 passed (78)   [inchangé]
```

### Ce qui n'a pas été testé, et pourquoi

- **Un compte avec un bail réellement actif** (`test-rights-1784884061@example.com`, « Rights Tester », progressé jusqu'à `active` au Lot 30) : tentative faite pour vérifier `bail.vue`/`wallet.vue`/`edl.vue` en état rempli plutôt qu'en état vide, bloquée par un rate-limit sur `/auth/verify-otp` — les trois sessions testent en direct simultanément sur le même compte. La correction elle-même (lecture d'identité réelle) ne dépend pas de cet état précis, donc pas un blocage critique pour ce lot, mais un état rempli de `bail.vue`/`wallet.vue` reste à vérifier visuellement dans un lot ultérieur.
- **Reproduction concurrente des deux fuites SSR** (`useTenantWallet`/`useTenantLeases`) : même limite que le Lot 36 pour `sharedRefreshLock` — difficile à provoquer de façon fiable à la demande, correction basée sur la lecture du code (motif identique, déjà confirmé causal pour le cas jumeau).

### Prochaine étape proposée

Revérifier `bail.vue`/`wallet.vue` en état rempli avec « Rights Tester » une fois le rate-limit dissipé. Coordonner avec `im-f3`/`im-ee` avant tout rebuild de production sur un port partagé, pour ne pas écraser de travail en cours.

## Lot 38 — Balayage complet des espaces Public et Artisan : la recherche publique confirmée saine, trois pages entières de l'espace Artisan encore en maquette découvertes et reconstruites

**Date** : 2026-09-23

### Contexte : test live coordonné sur les trois espaces, en parallèle avec `im-ab` (Locataire) et `im-ee` (Pro)

Périmètre assigné : Espace Public (non connecté — accueil, recherche, fiche logement, vitrine propriétaire, connexion, favoris, contact/faq/légal) et Espace Artisan (`app/pages/artisan/*`). Testé sans rien mocker, contre un build de production (`nuxi build` + `node .output/server/index.mjs`, port dédié 4174 — voir plus bas pourquoi pas le port partagé 4173) avec Playwright et `curl`, comptes réels : un nouveau compte artisan fabriqué en direct (inscription OTP + `POST /user/roles {role:'artisan'}` + `POST /auth/switch-role`, technique du Lot 27) pour l'espace Artisan, et les comptes de test déjà documentés pour l'espace Public.

### Avant même de tester : le serveur de prévisualisation partagé (4173) était obsolète

Un process écoutait déjà sur `localhost:4173` en début de session, mais son build datait d'avant le correctif SSR du Lot 36 (`useApiAuth.ts`) et avant les corrections locataire de `im-ab` (Lot 37). Une tentative de le reconstruire et de le relancer a été bloquée par le bac à sable (« interfère avec un autre processus ») — plutôt que de forcer, une instance dédiée a été démarrée sur le port 4174 à partir d'un build frais, et les deux autres sessions en ont été informées pour éviter de tester contre du code périmé.

### Espace Public : recherche réelle confirmée fonctionnelle, un faux départ de ma part

Premier test de `/recherche` : la page affichait « 0 logement disponible » alors que l'API renvoyait 29 résultats réels (vérifié par `curl` identique à l'appel du front). Piste suivie à fond (lecture de `usePropertySearchApi.ts`, `recherche.vue`, `flattenSearchResults`) avant de découvrir, par une deuxième mesure avec un délai plus long, qu'il s'agissait d'une lenteur de démarrage à froid du backend Render (déjà documentée dans le projet), pas d'un bug : passé un délai suffisant, la page affiche bien « 29 logements disponibles » avec les vraies cartes. Consigné ici pour que ce faux départ ne soit pas revérifié inutilement dans un lot futur.

Vérifié sainement, sans rien à corriger : `/`, `/recherche` (recherche, tri, filtres réels), `/biens/:id` (fiche logement réelle), `/vitrine/:id` (vitrine propriétaire réelle, y compris le cas « 0 bien publié » quand le bien reste privé malgré une unité publique — comportement déjà documenté), `/favoris` non connecté (dégrade proprement sur un message d'erreur plutôt qu'un plantage), `/connexion` (OTP réel avec un second compte locataire, `tenant-visit-test-1790021098@example.com`, distinct du compte habituel — confirme au passage que le Lot 36 est bien la cause de fuites SSR *réelles*, indépendamment du bug d'affichage trouvé par `im-ab` au Lot 37 sur le même symptôme apparent), `/contact`, `/faq`, `/legal`.

**Découverte annexe, hors périmètre Public mais visible dessus** : l'unité de test partagée « Unité Test E2E » porte `bedrooms_count: 48000` en vraie donnée (visible publiquement sur `/recherche` et `/biens/:id`). Signalé à `im-ee` (territoire Pro — `UniteModal.vue`/`biens/ajouter.vue` n'ont aucune validation de saisie sur ce champ), pas corrigé ici.

### Espace Artisan : le cycle de mission est réel (Lots 25-31), mais toute la coquille autour ne l'était pas

En testant avec un compte artisan neuf, trois chiffres impossibles pour un compte sans aucune activité sautent aux yeux : solde wallet à **148 000 FCFA**, **23 avis** (4,7★), et un planning hebdomadaire rempli de rendez-vous fictifs. Vérification `curl` avec les vrais jetons de ce compte neuf : `GET /wallet/me` renvoie réellement `0.00`, `GET /wallet/transactions` un tableau vide, `GET /artisan-requests/my` un tableau vide. Trois pages entières étaient donc de la pure maquette, présentée comme des données réelles sans aucun avertissement :

- **`useArtisanSpace.ts`** : `useArtisanWallet()` était `useState('artisanWalletBalance', () => 148000)` — un solde inventé, jamais relié à l'API. Badges de navigation « Mes missions » et « Agences partenaires » figés à `count: '1'`.
- **`artisan/facturation.vue`** : listes `PAYOUTS`/`WITHDRAWALS` codées en dur (références de mission, dates, montants fictifs).
- **`artisan/historique.vue`** : `RATING_BARS`/`STATS`/`REVIEWS` codés en dur — jusqu'à un faux avis signé « Sèdjro Aholou », par pure coïncidence avec le Lot 36.
- **`artisan/components/RetraitModal.vue`** : `submit()` décrémentait juste un `ref` local et affichait un faux succès, sans jamais appeler l'API.

Vérifié que de vrais endpoints existent pour tout ça (`GET /wallet/me`, `/wallet/transactions`, `/wallet/withdrawals/my`, `POST /wallet/withdraw`, `GET /artisans/:id/reviews`, `GET /artisan-requests/:id/invoice`) — proposé à l'utilisateur de reconstruire plutôt que de simplement documenter l'écart, approuvé.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/composables/useArtisanSpace.ts` | `useArtisanWallet()` (solde inventé) supprimé ; badges de nav fictifs retirés |
| `app/composables/useArtisanProfileApi.ts` | `fetchReviews(artisanId)` ajouté — `GET /artisans/:id/reviews` |
| `app/types/artisan.ts` | `ArtisanReview.reviewer?` ajouté (présent sur la liste, absent à la création) |
| `app/utils/artisanReviews.ts` | **Nouveau** — `computeRatingBars`, `reviewerName`, `reviewerInitials`, extraits pour être testables |
| `app/pages/artisan/facturation.vue` | Reconstruit — solde réel (`useTenantWallet()`, même wallet que locataire/pro, confirmé Lot 27), retenue de garantie réelle (calculée depuis `artisan-requests/my`), paiements par mission réels avec vraie facture téléchargeable, retraits réels |
| `app/components/artisan/RetraitModal.vue` | Reconstruit — même schéma que `pro/RetraitModal.vue` (numéro Mobile Money, `POST /wallet/withdraw` réel) |
| `app/pages/artisan/historique.vue` | Reconstruit — note et nombre d'avis réels (`ArtisanProfile.reputation_score`/`review_count`), répartition par étoile calculée sur les vrais avis, liste d'avis réelle |

### Ce qui est resté hors périmètre, et pourquoi

- **`artisan/planning.vue` et `BloquerModal.vue`** : toujours un planning hebdomadaire et un blocage de disponibilité fictifs — **aucun endpoint d'indisponibilité artisan n'existe** dans le Swagger (seul `useArtisanDispo()`, un simple booléen local, a déjà une note honnête à ce sujet). Confirmé avec l'utilisateur avant de commencer : hors périmètre de ce lot, contrairement au wallet et aux avis qui avaient une vraie API.
- **Les trois statistiques `STATS`** (délai moyen d'intervention, taux d'acceptation, montant moyen) : retirées plutôt que recalculées — aucun endpoint d'agrégation, et les calculer à la main depuis l'historique complet des demandes (acceptées, refusées, expirées) aurait fabriqué un nouveau chiffre invérifiable plutôt que de corriger un chiffre inventé. Mieux vaut ne rien afficher que d'afficher un nombre plausible mais faux.
- **`agences partenaires`, `profil`, `missions`, `apercu` (aperçu)** : déjà réels depuis les Lots 24/29 — revérifiés sans rien à corriger.

### Tests automatisés

`computeRatingBars`/`reviewerName`/`reviewerInitials` extraits dans `app/utils/artisanReviews.ts` spécifiquement pour être testables (même motif que `flattenSearchResults`, Lot 1) :

```
Test Files  15 passed (15)
     Tests  83 passed (83)   [+5 : tests/artisanReviews.test.ts]
```

### Vérification manuelle contre l'API live

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| `GET /property/search?sort=newest&page=1&limit=12` (délai suffisant) | **200**, 29 résultats réels | `/recherche` affiche les vraies cartes, prix, quartiers |
| `GET /wallet/me` (compte artisan neuf) | **200**, `balance_total: "0.00"` | Facturation affiche « 0 FCFA », plus « 148 000 F » |
| `GET /wallet/transactions`, `/wallet/withdrawals/my`, `GET /artisan-requests/my` (même compte) | **200**, tableaux vides | États vides honnêtes affichés partout, aucun plantage |
| Modale de retrait, vraie saisie (5000 FCFA, numéro réel) contre un solde réel de 0 | Validation cliente réelle | « Ce montant dépasse votre solde disponible. », bouton désactivé — jamais soumis à l'API avec un montant invalide |
| 8 pages de l'espace Artisan, console + réseau surveillés | — | Aucune erreur console, aucune requête `/proxy/*` en échec, badges de nav fictifs disparus |

### Ce qui n'a pas été testé, et pourquoi

- **Le chemin non vide de `historique.vue`** (un vrai avis affiché) : structurellement impossible à obtenir en direct — `POST /artisan-requests/:id/review` exige `closed_at` renseigné (confirmé Lot 27 : « Cette demande doit être clôturée avant de pouvoir être notée »), et rien dans le Swagger ne permet de déclencher cette clôture manuellement ; elle survient seule après l'expiration du délai de garantie (7 jours dans ce test). Le rendu a été relu attentivement contre le schéma Swagger exact et contre `pro/documents.vue` (Lot 33) qui partage le même motif, mais reste à confirmer avec de vraies données non vides dans une session future.
- **Reconstruction similaire pour `planning.vue`** : nécessiterait d'abord qu'un endpoint d'indisponibilité artisan existe côté API — rien à câbler tant que ce n'est pas le cas.

### Addendum — le chemin non vide de `facturation.vue` vérifié en direct après coup

Après la rédaction initiale de ce lot, le cycle artisan complet a été rejoué en direct pour de vrai (pas seulement relu contre le schéma) : nouveau compte artisan (celui de ce lot), compte propriétaire réel (`pro-landlord-test-1789930234@example.com`, déjà propriétaire d'« Unité Test E2E »), rechargé via un vrai paiement bac à sable MTN direct (`POST /payment/checkout` avec la passerelle `GSM_MTN` et un numéro de test réel fourni par l'utilisateur plus tôt dans ce projet, `66000001` = succès, puis `POST /payment/verify-return` — jamais de crédit direct via l'endpoint admin `/wallet/transaction`, refusé par le bac à sable de permissions comme une modification excessive d'une ressource partagée, à raison). Demande créée directement ciblée sur l'artisan (`target_artisan_id`, sans passer par un poste ouvert), offre soumise (18 000 F, garantie 7 jours, retenue 15 %), acceptée, payée, marquée terminée — chaîne API entièrement réelle, aucune étape simulée.

| Étape | Résultat réel |
|---|---|
| `POST /payment/checkout` (GSM_MTN, numéro sandbox 66000001) → `POST /payment/verify-return` | Wallet propriétaire crédité de 50 000 F pour de vrai |
| Cycle demande → offre → acceptation → paiement → `complete()` | `pay()` renvoie `{immediateAmount:15300, retainedAmount:2700}` sur une offre à 18 000 F / retenue 15 % |
| `facturation.vue`, rendu réel via Playwright | « SOLDE DISPONIBLE 15 300 FCFA », « RETENU EN GARANTIE 2 700 FCFA », « Plombier · libéré le 30 septembre. », ligne de mission réelle avec bouton Facture — tout correct, aucune erreur console |
| Bouton « Facture », `GET /artisan-requests/:id/invoice?format=pdf` → poll `/pdf-jobs/:id` | Job réel passé `pending` → `processing` → `ready` en ~16s, PDF réel téléchargé (`file` confirme : PDF 1 page) |

Seul point non confirmé par Playwright : l'ouverture du PDF dans un nouvel onglet (`window.open()`) — le bouton revient correctement à l'état repos sans bannière d'erreur (donc le code s'est bien exécuté jusqu'au bout), mais aucun onglet n'a été détecté par `context.waitForEvent('page', …)`. Cohérent avec un blocage de popup navigateur sur un `window.open()` asynchrone (après plusieurs `await`), pas une régression : exactement le même motif que `pro/documents.vue` (Lot 33), jamais vérifié différemment là non plus.

### Tests automatisés (addendum)

Aucun changement de code suite à cette vérification — elle confirme que le code déjà écrit dans ce lot fonctionne avec de vraies données non vides, sans y trouver d'écart. `78/78` puis `83/83` [inchangé].

### Prochaine étape proposée

Si un compte artisan avec un vrai avis devient disponible (ou si le délai de garantie de 7 jours de la demande créée ici s'écoule, ce qui permettrait de tester `review()` sur cette même demande), revérifier `historique.vue` en état rempli. Sinon, aucune piste supplémentaire dans ce périmètre — les trois espaces (Public, Locataire, Pro) ont maintenant chacun fait l'objet d'un balayage complet coordonné.

---

## Lot 39 — Balayage complet de l'Espace Pro, et une vraie *race condition* trouvée dans l'édition d'unité

**Date** : 2026-09-23

### Contexte : dernier tiers du test coordonné sur les trois espaces

Périmètre de ce lot : `app/pages/pro/*` (17 écrans), en parallèle avec `im-f3` (Public + Artisan, Lot 38) et `im-ab` (Locataire, Lot 37). Deux signalements reçus d'`im-f3` en amont, tous deux dans ce périmètre : des chambres aberrantes (`bedrooms_count: 48000`) visibles publiquement sur « Unité Test E2E », et le champ « Chambres » de `UniteModal.vue`/`pro/biens/ajouter.vue` sans aucune limite de saisie.

### Un vrai bug trouvé en essayant de corriger la donnée aberrante : la première correction a échoué silencieusement

Premier essai : ouvrir « Unité Test E2E » via `UniteModal.vue` (édition), remplacer `48000` par `2`, enregistrer. `PATCH /property/:id/units/:id` a répondu **200** — mais une relecture immédiate montrait toujours `48000`. En reproduisant pas à pas : à l'ouverture de la modale en mode édition, `resetFromUnit()` (qui copie les vraies valeurs de l'unité dans le formulaire) n'était appelée qu'**après** `await Promise.all([...5 appels de référentiels...])` dans `onMounted` — jusque-là, tous les champs restaient à leur valeur initiale (vide). Une capture prise 600 ms après ouverture montrait un formulaire visiblement vide (nom, prix, surface) pendant que « Chambres » contenait déjà la saisie tapée entre-temps. Si l'utilisateur tape assez vite pendant cette fenêtre de chargement (typiquement 1-2 s sur cette instance Render), `resetFromUnit()` s'exécute *après* coup et écrase silencieusement sa saisie avec l'ancienne valeur du serveur — exactement ce qui s'est produit ici : `bedrooms` retapé à `2` a été écrasé en arrière-plan par le retour de la valeur serveur `48000`, avant même le clic sur « Enregistrer ».

Confirmé par une inspection directe des valeurs DOM 2 s après ouverture (toutes les valeurs déjà correctement pré-remplies à ce moment-là) puis par un nouvel essai en attendant explicitement la fenêtre de chargement avant de vérifier que la saisie tenait bon.

### Correction

`resetFromUnit()` appelée immédiatement (avant le `onMounted` asynchrone), pas seulement après le chargement des référentiels. Les trois champs qui dépendent réellement des listes de référentiels pour choisir un défaut sensé (`unitTypeId`, `waterSource`, `meterType`) sont recalés *seulement s'ils sont encore vides* une fois les référentiels chargés — jamais si l'utilisateur (ou `resetFromUnit`) les a déjà renseignés.

| Fichier | Rôle |
|---|---|
| `app/components/pro/UniteModal.vue` | `resetFromUnit()` déplacée en dehors du `onMounted` asynchrone (voir découverte) ; `maxlength` ajouté sur Surface/Loyer/Chambres/Salles de bain (voir ci-dessous) |
| `app/pages/pro/biens/ajouter.vue` | Même `maxlength` ajouté sur Surface/Chambres/Loyer |
| `app/composables/useLandlordPromoCodes.ts` | Verrou anti-double-fetch (`let inFlight` de module) déplacé vers `useNuxtApp()` — même anti-motif que les Lots 36/37, signalé par `im-f3` comme dans ce périmètre |

### Chambres non plafonnées : `maxlength`, pas `type="number"` + `max`

Choix délibéré : passer ces champs en `type="number"` aurait changé leur apparence (flèches de spinner natives) dans toute l'interface, un changement visuel plus large que nécessaire pour ce bug précis. `maxlength="2"` sur Chambres/Salles de bain (jusqu'à 99, largement suffisant, bloque un cinquième chiffre comme `48000`) et `maxlength="5"`/`"9"` sur Surface/Loyer (mêmes bornes que les grandeurs réalistes du marché) atteignent le même résultat en gardant le style d'`<input>` déjà utilisé partout ailleurs dans ce formulaire.

### Donnée de test corrigée

`bedrooms_count` de « Unité Test E2E » remis à `2` via le vrai formulaire (`PATCH /property/:id/units/:id` → 200), confirmé par une relecture directe de l'API : la fiche publique n'affiche plus « 48000 chambres ».

### Ce qui a été livré

Voir tableau ci-dessus.

### Ce qui est hors périmètre, et pourquoi

- **`pro/equipe.vue`/`pro/mandats.vue`** : toujours bloqués par I2 (bug serveur confirmé au Lot 34), non retenté ici.
- **Passer les champs numériques en `type="number"`** : changement de style plus large que ce lot, voir découverte ci-dessus.

### Tests automatisés

Aucune fonction pure nouvelle extractible — `resetFromUnit()`/`ensureLoaded()` dépendent du contexte du composant et de `useNuxtApp()`, même situation que les Lots 36/37 pour la même famille de correctifs.

```
Test Files  15 passed (15)
     Tests  83 passed (83)   [inchangé]
```

### Vérification manuelle contre l'API live

Compte propriétaire de test, connecté via Playwright (session réutilisée via `storageState` après une connexion réelle, pour limiter les appels à `/auth/verify-otp` déjà sous tension par les trois sessions de test concurrentes) :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| Les 17 écrans de l'espace Pro, un par un | 200 sur chaque route | Aucun `NaN`/`undefined` affiché, aucun plantage console bloquant |
| `/pro` (Aperçu) | `GET /property/landlord/stats/advanced` → **500** (×2), repli `GET /property/landlord/stats` → **200** | Comportement documenté (voir `useLandlordStatsApi.ts`) : juste plus lent que prévu dans mon script de test la première fois — pas un bug, fausse alerte corrigée en réessayant avec un délai plus long |
| Édition d'unité, saisie normale (après le chargement des référentiels) | `PATCH .../units/:id` → **200** | Fonctionne correctement — le bug ne touche que la fenêtre de chargement initiale |
| Édition d'unité, saisie déclenchée avant correctif | **200**, mais valeur non appliquée | Bug confirmé (voir découverte) |
| Même scénario, après correctif, saisie déclenchée avant la fin du chargement des référentiels | **200**, valeur bien appliquée | Revérifié par une relecture directe de l'API (`bedrooms_count: 2`) |

### Ce qui n'a pas été testé, et pourquoi

- **Reproduction du même bug sur d'autres champs dérivés de référentiels** (`unitTypeId`, `waterSource`, `meterType`) : la fenêtre de course existe en théorie pour eux aussi, mais ils ont une valeur par défaut immédiate (premier choix de la liste, jamais vide) donc moins visible/probable à provoquer qu'un champ texte libre comme `bedrooms`. Corrigés par le même changement, non revérifiés un par un.
- **`pro/biens/ajouter.vue`** : le même risque de fenêtre de course n'existe pas dans cet assistant (pas de pré-remplissage depuis une unité existante, les référentiels pilotent uniquement les valeurs par défaut d'un formulaire de création vide) — `maxlength` ajouté par cohérence, pas parce qu'un bug y a été reproduit.

### Prochaine étape proposée

Aucune côté Pro — les 17 écrans sont vérifiés, cohérents avec les lots précédents (14-33), et le seul bug réel trouvé est corrigé et revérifié en direct. Avec ce lot, les trois espaces (Public/Lot 38, Locataire/Lot 37, Pro/Lot 39) ont chacun fait l'objet d'un balayage complet coordonné à la demande de l'utilisateur.

---

## Lot 40 — Rejeu live de TEST-CASES.md §5 (Pro) : une fausse identité montrée à tout le monde, et une invitation qui n'invitait personne

**Date** : 2026-09-24

### Contexte : premier rejeu en conditions réelles des cas de test §5, sur le déploiement Vercel de production

Périmètre : les 30 cas `PRO-01` à `PRO-30` de `TEST-CASES.md`, contre `https://im-hazel.vercel.app` (pas le serveur local), en parallèle avec `im-9e` (§3 Public + §6 Artisan) et `im-4e` (§4 Locataire).

### Découverte 1 : le sélecteur « Contexte de travail » montrait une identité fictive à absolument tout le monde

Signalé par `im-9e` en testant un compte propriétaire flambant neuf : le sélecteur de la sidebar Pro (« Koffi Dossou · 3 biens en propre » / « Agence Immo Cotonou · 11 biens sous mandat ») venait de `PRO_CONTEXTS`, un tableau codé en dur dans `useProSpace.ts` — **la même donnée pour n'importe quel compte**, sans lien avec `useAuthUser()`. Confirmé non-lié à une fuite de session façon Lot 36/37 (`GET /auth/me` renvoyait bien `first_name: null` pour ce compte neuf, pas les données d'un autre utilisateur) : c'est une identité entièrement inventée, jamais branchée sur rien de réel. Les onglets « Propriétaire/Agent/Agence » juste en dessous (`useProRole()`) souffraient du même mal — un simple `ref` local sans aucune donnée réelle derrière, ne filtrant jamais rien.

Aucune des deux options (« perso », « agence ») n'a de source de données réelle exploitable : le contexte d'équipe/agence dépend d'I2 (bug serveur confirmé depuis le socle, jamais résolu). Plutôt que de réparer seulement le cas « perso » (en le reliant à `useAuthUser()`) et laisser « agence » fabriqué, tout le sélecteur a été retiré — avec lui les onglets de rôle et la bannière « Au nom de l'Agence Immo Cotonou » qui apparaissait en haut de chaque page en contexte agence. Cohérent avec la philosophie déjà appliquée à chaque fonctionnalité irréparable de ce projet (Google Sign-In, Kkiapay, équipements) : retirer plutôt que fabriquer.

### Découverte 2 : le bouton « Envoyer l'invitation » n'envoyait rien du tout

En corrigeant la découverte 1, `PRO-26` (« erreur 500 attendue d'I2 ») a été rejoué pour vérifier que l'erreur s'affichait proprement — mais aucune erreur n'est apparue : un écran de succès (« Invitation envoyée, `{email}` recevra un email… ») s'affichait à chaque fois, sans qu'aucune requête `POST /team/invite` ne parte jamais. Inspection de `ProInviteModal.vue` : `submit()` faisait littéralement `step.value = 'done'`, rien d'autre. Le formulaire entier (postes, permissions par poste, biens accessibles) était fabriqué en plus de la fausse confirmation — `BIENS = ['Résidence Étoile', 'Duplex Les Cocotiers', 'Villa Cadjéhoun']` codé en dur, sans lien avec les vrais biens du compte connecté.

Plus grave que « la fonctionnalité ne marche pas » : un vrai propriétaire cliquant ce bouton croirait avoir réellement invité quelqu'un. Corrigé en remplaçant l'intégralité du formulaire par un message honnête d'indisponibilité (même principe que le gap Kkiapay de `PaymentModal.vue`, Lot 2) plutôt que de câbler un appel pour de vrai vers un endpoint dont le 500 est déjà confirmé (Lot 34) — cabler l'appel n'aurait changé aucun comportement observable pour l'utilisateur, seulement remplacé un mensonge par une erreur générique.

`pro/mandats.vue` (`PRO-27`) a été vérifié dans la foulée : même famille de constat (liste de mandats et biens couverts entièrement fabriquée, zéro appel API) — pas retouché dans ce lot, signalé pour référence future.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/composables/useProSpace.ts` | `PRO_CONTEXTS`, `ProContext`, `useProContext()`, `useProRole()` retirés ; `useProSpace()` et `useProWallet()` (également mort — non utilisé ailleurs, vérifié par grep) supprimés |
| `app/layouts/pro.vue` | Sélecteur « Contexte de travail », onglets de rôle, et bannière « Au nom de l'Agence Immo Cotonou » retirés ; l'identité réelle déjà affichée juste au-dessus (`displayName`/`roleLabel` via `useAuthUser()`) reste seule source d'identité dans la sidebar |
| `app/components/pro/InviteModal.vue` | Réécrit entièrement — message d'indisponibilité honnête à la place du formulaire fabriqué et de son faux succès |

### Ce qui est hors périmètre, et pourquoi

- **`pro/mandats.vue`** : même situation que l'ex-`equipe.vue`, pas corrigé dans ce lot — signalé, pas engagé, pour ne pas élargir la portée au-delà de ce que ce lot a réellement vérifié en direct.
- **Câbler `POST /team/invite` pour de vrai** : le 500 est déjà confirmé (Lot 34) — l'appeler réellement n'aurait produit qu'un message d'erreur générique supplémentaire, pas une fonctionnalité qui marche. Le message d'indisponibilité honnête atteint le même but (ne pas mentir) sans ce détour.

### Tests automatisés

Aucune fonction pure nouvelle extractible — retrait de composables liés à `useState` (contexte Nuxt), même situation que les lots précédents de cette famille.

```
Test Files  15 passed (15)
     Tests  83 passed (83)   [inchangé]
```

### Vérification manuelle contre l'API live

Les 30 cas `PRO-01` à `PRO-30` ont été rejoués contre `https://im-hazel.vercel.app` — détail complet dans `TEST-CASES.md`, section « Résultats d'exécution — §5 Espace Pro ». Points marquants :

| Scénario | Résultat réel de l'API | Comportement observé |
|---|---|---|
| Compte neuf jamais vérifié KYC, tentative de création de bien (`PRO-02`) | `POST /property` → **403** `error.KYC_REQUIRED` | Message explicite affiché, conforme à l'attendu |
| Édition d'unité, saisie rapide après ouverture (`PRO-04`, régression du Lot 39) | `PATCH .../units/:id` → 200 | Valeur bien conservée — non-régression confirmée |
| Assignation d'un signalement à un artisan, texte libre (`PRO-18`) | `PATCH /signals/:id` → 200 | Assignation appliquée depuis le vrai formulaire |
| Demande de retrait wallet propriétaire, MTN `66000001` (`PRO-28`) | `POST /wallet/withdraw` → **201**, `status: "pending"` | Écran de confirmation réel, cohérent avec la réponse |
| « Envoyer l'invitation » (`PRO-26`), avant correctif | Aucun appel API | Faux écran de succès — voir découverte 2 |
| Même flux, après correctif | Aucun appel API (intentionnel) | Message d'indisponibilité honnête, plus aucune fausse promesse |
| Sidebar Pro, après déploiement du correctif (poussé par `im-9e`) | — | « Koffi Dossou » disparu, identité réelle affichée, 0 erreur console, aucune régression sur le reste de `/pro` |

### Ce qui n'a pas été testé, et pourquoi

- **PRO-01, 06, 09, 10, 15, 16, 22, 23, 24, 25** : détail des raisons dans `TEST-CASES.md` — principalement des données de test partagées avec d'autres sessions en cours (baux/interventions déjà dans un état terminal, pas de nouvelle donnée créée pour ne pas perturber le travail concurrent d'`im-9e`/`im-4e`).
- **Déploiement** : ce lot a été commité et déployé par `im-9e` (accès git de cette session), pas par cette session elle-même — la revérification live post-déploiement est donc indirecte (confirmée par `im-9e`, revérifiée une seconde fois par cette session).

### Prochaine étape proposée

`pro/mandats.vue` reste la seule pièce restante de la même famille (mock non lié à I2 au sens propre — aucun appel API du tout, pas seulement bloqué). Sinon, avec ce lot, le rejeu live de `TEST-CASES.md` est complet pour les quatre espaces coordonnés (Public/Artisan `im-9e`, Locataire `im-4e`, Pro — cette session).

## Lot 41 — Accueil : « À la nuit ou au mois ? », une planche d'ambiance classée sur les vraies grilles tarifaires

**Date** : 2026-09-26

### Le constat de départ

Signalé par l'utilisateur : la plateforme loue deux catégories de biens très différentes — à la nuit (souvent meublé, réservation) et au mois (bail) — mais l'accueil et la recherche ne le font pas ressortir.

### Pourquoi ça ne ressortait pas : l'API de recherche ne connaît pas cette distinction

`GET /property/search` n'a aucun paramètre ni champ « à la nuit / au mois ». Les proxys disponibles sont trompeurs : `min_duration_days`/`max_duration_days` ne sont renseignés sur **aucune** unité réelle, et `furnished_level` (meublé) ne dit rien du mode de location. La seule source fiable est la grille tarifaire de chaque unité (`GET /units/:id/pricing`, `billing_frequency`). Relevé en direct sur les 43 unités renvoyées par l'accueil : 9 ont un tarif journalier actif, les autres n'ont aucune grille (loyer mensuel du bail = prix de base de l'unité). Quelques unités de test ont un prix de base absurde (ex. « Studio LAPERTA » à 12 000 000 F) alors qu'elles ne se louent qu'à la nuit à 12 000 F — le prix de base n'a pas de sens pour elles.

### Ce qui a été livré

| Fichier | Rôle |
|---|---|
| `app/utils/rentalMode.ts` | **Nouveau** — `classifyRental(pricing, basePrice)` (règle ci-dessous) et `mapLimited()` (au plus N appels simultanés, pour ne pas envoyer 40 requêtes d'un coup au backend Render) |
| `app/pages/index.vue` | Nouvelle section « Deux façons de louer — À la nuit ou au mois ? » sous la barre de recherche : deux panneaux en planche d'ambiance (photo principale, détail recadré, aplat de couleur portant des mots-clés), compteur et prix de départ réels, sélection qui affiche en dessous le rail des vraies annonces de la catégorie. Les rails par ville affichent désormais le bon prix et son unité (« / nuit » ou « / mois ») au lieu du prix de base brut |
| `app/components/search/PropertyCard.vue` | Prop optionnelle `priceSuffix` (« / nuit », « / mois ») |

**Règle de classement** : tarif journalier actif → à la nuit (à ce prix) ; tarif mensuel actif, ou grille longue durée, ou **aucune** grille → au mois (au tarif mensuel s'il existe, sinon au prix de base). Une unité avec seulement un tarif journalier n'est jamais présentée au mois. Les tarifs désactivés (`is_available: false`) sont ignorés. Un échec de chargement de grille exclut l'unité des deux rails plutôt que de la ranger au hasard.

**Visuels** : les panneaux utilisent volontairement les trois photos éditoriales du projet (`/images/hero/*`), pas les photos des annonces — celles-ci sont déposées librement par les propriétaires (sur l'instance de test : une carte du monde, une camionnette publicitaire…) et restent affichées dans le rail d'annonces réelles juste en dessous.

### Ce qui reste hors périmètre, et pourquoi

- **Filtre « à la nuit / au mois » sur `/recherche`** : impossible proprement sans paramètre côté serveur — un filtre client ne filtrerait que la page chargée, avec un compteur et une pagination faux. **Demande backend à faire** : un paramètre `billing_frequency` (ou `rental_mode`) sur `GET /property/search`, et idéalement le tarif journalier dans chaque résultat pour éviter un appel par unité.
- **Unités « virtuelles » (sans bien parent)** : déjà exclues des rails par ville de l'accueil avant ce lot, donc aussi de cette section.

### Tests automatisés

```
Test Files  16 passed (16)
     Tests  90 passed (90)   [+7 : tests/rentalMode.test.ts]
```

### Vérification manuelle (build de production local, Playwright, données réelles)

| Scénario | Résultat |
|---|---|
| Desktop 1280 px, section chargée | « 7 logements · dès 2 000 F / nuit » et « 34 logements · dès 10 000 F / mois », rail « À la nuit » avec prix « / nuit » corrects, 0 erreur console |
| Clic « Au mois » | Panneau sélectionné (anneau vert + « ✓ Sélectionné »), rail remplacé par les annonces mensuelles avec « / mois » |
| Mobile 390 px | Panneaux empilés, accroche masquée pour tenir dans la tuile principale, mots-clés lisibles, 0 erreur console |

### Prochaine étape proposée

Faire remonter la même distinction dans `/recherche` dès que le paramètre backend existe — en attendant, les badges « / nuit » / « / mois » pourraient y être ajoutés de la même façon (12 appels de grille par page).
