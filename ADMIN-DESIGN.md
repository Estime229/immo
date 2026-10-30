# Espace admin — guide de design et de flows

L'espace admin (`/admin/*`) reprend le langage visuel des espaces locataire, pro et artisan. Un écran admin doit avoir l'air d'une page de `pages/pro/` : mêmes cartes, mêmes états, mêmes boutons. Les pages de référence sont **`app/pages/admin/index.vue`** (aperçu) pour l'admin, et `app/pages/pro/index.vue`, `pro/signalements.vue`, `pro/visites.vue`, `pro/mandats.vue` pour les espaces existants.

## Socle déjà en place (ne pas modifier sans raison)

- `app/layouts/admin.vue`, `components/admin/Sidebar.vue`, `components/admin/Topbar.vue` : menu, en-tête (le titre de la page vient du menu, `utils/adminNav.ts`), barre d'onglets mobile.
- `utils/adminNav.ts` : menu rangé par métier. Le titre affiché dans l'en-tête est le `label` (ou `title`) de l'entrée. **Une page ne pose pas son propre `<h1>`.**
- `composables/useAdminCounts.ts` : compteurs « à traiter » (KYC, retraits, litiges, maintenance, contact, suppressions). **Toute action qui fait sortir un élément d'une file appelle `useAdminCounts().refresh()`** pour que les pastilles du menu baissent tout de suite.
- `useApi().apiFetch` : appels admin ; l'erreur levée porte un `message` lisible et `status`.
- Jetons : `assets/css/admin.css` ne contient que des alias vers ceux de `main.css`.

## Briques visuelles

Écrire le balisage avec les idiomes d'Immo (comme `pages/pro/*`), pas avec les anciens noms admin (`text-text-tertiary`, `bg-surface`, `text-body-s`…). Ces alias existent encore pour ne rien casser, mais le code refait ne les utilise plus.

| Élément | Classes |
|---|---|
| Racine de page | `<div class="animate-[im-fade_.3s_ease_backwards]">` |
| Carte / section | `rounded-2xl border border-[var(--border-subtle)] bg-white p-5.5` (`px-5 py-4.5` pour une carte dense) |
| Titre de section | `<h2 class="m-0 text-[15px] font-bold">` ; lien d'en-tête à droite : `text-[12.5px] font-bold text-green-700` |
| Ligne de liste | `flex items-center gap-3 border-b border-sand-200 py-3 last:border-b-0` |
| Tuile chiffrée | `rounded-lg border border-[var(--border-subtle)] bg-white p-4` + valeur `font-mono text-xl font-bold tracking-[-.02em] text-green-900` + libellé `text-[11.5px] text-[var(--text-muted)]` |
| Texte principal / secondaire / méta | `text-sm font-bold` / `text-[13.5px] text-[var(--text-muted)]` / `text-xs text-[var(--text-faint)]` |
| Étiquette en capitales | `text-label font-bold uppercase tracking-label text-[var(--text-faint)]` |
| Montants, identifiants, dates compactes, références | `font-mono` |
| Lien retour (pages détail) | `<NuxtLink class="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text-muted)] hover:text-green-700">← Vérifications KYC</NuxtLink>` |
| Page détail | `grid grid-cols-1 gap-4.5 lg:grid-cols-[minmax(0,1fr)_340px]` : contenu à gauche, **panneau de décision à droite en `lg:sticky lg:top-[94px]`** |
| Onglets / bascule de vue | `FormsSegmentedControl` (pilule), jamais une rangée de liens soulignés |
| Filtres | recherche pilule + puces `AdminTag`, ou `<select>` pilule : `h-[42px] rounded-pill border border-[var(--border-default)] bg-white px-3.5 text-[13px] font-semibold` |

Composants : `CoreAvatar` (`:name`, `:size`, `:avatar-url`), `AdminBadge` (`primary|success|warning|danger|info|neutral`), `AdminButton` (`primary` une seule fois par vue, `secondary`, `ghost`, `accent`, `danger` ; `size="sm"` = pilule ; `loading`), `AdminInput`, `AdminTag`, `AdminPagination`, `AdminModal`, `AdminInlineConfirm`, `AdminSwitch`, `DataSkeletonCard`, `FeedbackAlertBanner`.

Icônes : `@lucide/vue`, 16 à 18 px, `:stroke-width="1.9"`. Pas d'emoji.

## États (obligatoires, distincts)

- **Chargement** : `DataSkeletonCard` à la silhouette du contenu attendu.
- **Erreur** : `<FeedbackAlertBanner tone="danger">Impossible de charger … <button class="ml-2 font-bold underline" @click="load">Réessayer</button></FeedbackAlertBanner>`. Une erreur ne ressemble jamais à une liste vide.
- **Vide** : `<p class="rounded-md border border-dashed border-[var(--border-default)] bg-white px-4 py-10 text-center text-[13.5px] text-[var(--text-muted)]">` avec une phrase utile (« Aucun dossier en attente : la file est à jour. »). Différencier « vide » et « aucun résultat pour ces filtres ».
- **Résultat d'une action** : bandeau de succès `rounded-md border border-ok-border bg-ok-bg px-3.5 py-2.5 text-[13px] font-semibold text-green-900` qui dit ce qui s'est passé et qui est prévenu, **seulement si c'est vrai** ; erreur d'action : `text-[13px] font-semibold text-danger-fg` sous l'action concernée.

## Confirmations

Comme dans les espaces (`pro/mandats.vue`, `pro/profil.vue`) : **la confirmation s'affiche en ligne, à l'endroit de l'action**, avec `AdminInlineConfirm` :

```vue
<AdminInlineConfirm
  v-if="confirming === 'suspend'"
  tone="danger"
  message="Suspendre ce compte ? Il ne pourra plus se connecter jusqu'à sa réactivation."
  confirm-label="Suspendre"
  :loading="busy"
  :disabled="!reason.trim()"
  @confirm="suspend"
  @cancel="confirming = null"
>
  <textarea v-model="reason" rows="2" placeholder="Motif (visible dans le journal d'audit)" class="w-full resize-none rounded-sm border border-[var(--border-default)] bg-white p-2.5 text-[13px] outline-none" />
</AdminInlineConfirm>
<button v-else …>Suspendre le compte</button>
```

- La phrase dit la conséquence concrète, pas « Êtes-vous sûr ? ».
- Un seul panneau de confirmation ouvert à la fois par écran.
- `AdminModal` est réservé aux **formulaires** (créer un compte, créditer un wallet, éditer un référentiel). Il n'existe plus de modale de confirmation.

## Flows

- **Une file se traite d'un bout à l'autre** : après une décision sur un élément d'une file (KYC, retrait, suppression, message), proposer l'élément suivant (« Valider et passer au suivant ») plutôt que renvoyer à la liste.
- **Le motif est obligatoire** pour tout refus, suspension, bannissement ou rejet, et prérempli par des motifs fréquents (puces) que l'admin peut compléter.
- **Les liens croisés sont systématiques** : un nom d'utilisateur mène à sa fiche, un bien à sa fiche, un dossier KYC au compte et inversement.
- **Les filtres vivent dans l'URL** (`?q=`, `?status=`, `?page=`) : rechargement, retour arrière et lien partagé gardent la vue. La recherche de l'en-tête ouvre `/admin/utilisateurs?q=…`.
- **Pas de donnée inventée** : pas de graphique ou de chiffre écrit en dur. Si l'API ne fournit pas une donnée, on ne l'affiche pas.
- **Noms** : `personName(first, last)` (utils/avatar.ts), jamais de « null null » ; repli sur l'email.
- **Mobile (375 px)** : aucun tableau large ; les lignes deviennent des cartes empilées, les grilles passent en une colonne, le panneau de décision passe sous le contenu.

## Piège Nuxt

Ne jamais déclarer de variable locale qui porte le nom d'un auto-import (`const ref = …`, `const [kind, ref] = …`, `computed =>`…). Nuxt cesse alors d'importer `ref()`/`computed()` pour **tout le fichier** et la page plante au chargement (« ref is not defined »). C'est arrivé deux fois pendant la refonte (wallet, rbac).

Ne jamais terminer une animation de transformation en `both`/`forwards` sur un conteneur de page (`animate-[im-fade_…_both]`) : l'état final garde un `translateY(0)`, et tout élément `fixed` à l'intérieur (barre d'action collante, voile) se place alors par rapport à la page au lieu de l'écran. Utiliser `_backwards`.

## Ce qu'on ne touche pas

Les autres espaces, `main.css`, le layout, le menu, l'en-tête, `useApi`/`useAdminAuth`, les contrats des composables admin (on peut **ajouter** une fonction, pas changer une signature utilisée ailleurs). Les composants partagés `components/admin/*` ne changent que si c'est indispensable, en le signalant.
