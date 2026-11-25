# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Variables d'environnement

Toutes facultatives : sans elles, l'application prend les valeurs de `runtimeConfig` dans `nuxt.config.ts`.

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `NUXT_API_BASE` | API de développement | URL de l'API appelée par le proxy serveur (`server/api/proxy`). |
| `NUXT_PUBLIC_APP_STORE_URL` / `NUXT_PUBLIC_PLAY_STORE_URL` | vides | Liens de la bannière « Téléchargez l'application » ; vides, elle affiche « Bientôt ». |
| `NUXT_PUBLIC_PRO_ADVANCED` | `false` | Interrupteur V1 de l'espace pro. À `false`, les rubriques Équipe, Mandats et Artisans sont masquées du menu (barre latérale et menu mobile) ; leurs pages restent accessibles par URL (notifications, invitations). Mettre `true` pour les réafficher. |

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
