# TaskFlow

A React Native / Expo operations dashboard for field collection teams. Runs on the web (PWA) and can be deployed as a native iOS/Android app. Connects to a Google Sheets backend via Google Apps Script.

---

## Features

- **Live tab** — real-time leaderboard, ticker feed, and upload stats pulled from Google Sheets
- **Collect tab** — daily log entry, hours input, carryover tracking, and EOD review flow
- **Stats tab** — personal performance metrics, task recommendations, and admin plan view
- **Tools tab** — admin panel (password-gated), rig assignment system, force-refresh, display settings

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (via [nvm](https://github.com/nvm-sh/nvm) recommended)
- A Google Sheet with the required tabs (see [Scripts & Deployment](#scripts--deployment) below)
- A deployed Google Apps Script web app URL

### Install

```bash
git clone https://github.com/ShootJackal/live-taskflow-priv.git
cd live-taskflow-priv
npm install
```

### Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and set at least one of:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_GOOGLE_SCRIPT_URL` | Monolith GAS endpoint (legacy / fallback) |
| `EXPO_PUBLIC_GAS_CORE_URL` | Split-deployment core endpoint |
| `EXPO_PUBLIC_GAS_ANALYTICS_URL` | Split-deployment analytics endpoint |
| `EXPO_PUBLIC_ADMIN_PASSWORD` | Password to unlock the admin panel in Tools tab |

> Without a valid GAS URL the app loads and shows placeholder/mock data.

### Run locally

```bash
# Web browser (recommended for development)
npm run start-web

# Expo dev server (iOS/Android via Expo Go)
npm run start
```

---

## Scripts & Deployment

### Google Apps Script

The `scripts/` directory contains the Apps Script source files:

| File | Purpose |
|---|---|
| `scripts/appscript.gs` | Monolith (single-script) deployment |
| `scripts/appscript-core.gs` | Split deployment — core read/write actions |
| `scripts/appscript-analytics.gs` | Split deployment — analytics/leaderboard actions |

See [`scripts/DEPLOY_APPSCRIPT.md`](scripts/DEPLOY_APPSCRIPT.md) and [`scripts/DEPLOY_SPLIT_APPSCRIPTS.md`](scripts/DEPLOY_SPLIT_APPSCRIPTS.md) for step-by-step deployment instructions.

### Required Google Sheet tabs

The Apps Script expects these exact tab names in your Google Sheet:

- `Collectors`
- `TASK_LIST`
- `CA_PLUS` (preferred) or `CA_TAGGED` (fallback)
- `CA_INDEX`
- `Task Actuals | Redashpull` or `Collector Actuals | RedashPull`
- `Collector Task Assignments Log`
- `RS_Task_Req`
- `_AppCache`
- `Collector Rig History Log`

### Deploy to Vercel (web)

1. Push the repo to GitHub.
2. Import the project at [vercel.com](https://vercel.com).
3. Vercel reads `vercel.json` automatically — build command is `npm run vercel-build`, output is `dist`.
4. Set all required environment variables in the Vercel project settings.
5. Deploy.

The web build is a **Progressive Web App (PWA)**. Users can install it to their home screen from Safari (iOS) or Chrome (Android).

### Native builds (iOS / Android)

```bash
npm install -g eas-cli
eas build:configure

# iOS
eas build --platform ios
eas submit --platform ios

# Android
eas build --platform android
eas submit --platform android
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [React Native](https://reactnative.dev/) + [Expo SDK 54](https://expo.dev/) |
| Routing | [Expo Router](https://expo.github.io/router/) |
| State | [TanStack Query v5](https://tanstack.com/query) |
| Language | TypeScript |
| Icons | [Lucide React Native](https://lucide.dev/) |
| Backend | Google Apps Script (GAS) via web app URL |
| Hosting | [Vercel](https://vercel.com/) |

---

## Project structure

```
├── app/                    # Screens (Expo Router file-based routing)
│   ├── (tabs)/
│   │   ├── _layout.tsx     # Tab bar configuration
│   │   ├── index.tsx       # Collect tab
│   │   ├── live/           # Live leaderboard tab
│   │   ├── stats/          # Stats & recommendations tab
│   │   └── tools/          # Admin tools tab
│   ├── _layout.tsx         # Root layout (providers, fonts)
│   └── +not-found.tsx      # 404 fallback
├── api/                    # Vercel serverless functions (GAS proxy, warm-up cron)
├── assets/                 # Images, icons
├── components/             # Shared UI components
├── constants/              # Color tokens, app-wide constants
├── hooks/                  # Custom React hooks
├── providers/              # Context providers (theme, locale, collection data)
├── scripts/                # Apps Script source + deployment guides
├── services/               # API layer (GAS client, data fetching)
├── types/                  # Shared TypeScript types
└── utils/                  # Utility functions
```

---

## Troubleshooting

**App shows no data / placeholder data**
- Confirm your GAS URL ends with `/exec` and is reachable in a browser.
- Check Vercel environment variables are set for the Production environment.

**"Sheet not found" error from GAS**
- Verify all required sheet tab names match exactly (case-sensitive, spaces matter).

**Build fails after `npm install`**
- Clear the cache: `npx expo start --clear`
- Delete and reinstall: `rm -rf node_modules && npm install`

**Lint / type-check**
```bash
npm run lint
npx tsc --noEmit
```
> There are 2 known pre-existing TypeScript errors in `app/(tabs)/tools/index.tsx` that are safe to ignore.
