# Offline-first portfolio hub (React + MUI + Dexie)

This blueprint shows how to turn the site into an offline-first portfolio hub where each PWA gets its own page, single-page tools and multi-page apps can be showcased, and essays live beside them. Everything runs on GitHub Pages using a React app shell, MUI for UI, Dexie for offline storage, and a service worker for caching.

## Architecture overview
- **App shell**: A React SPA served from GitHub Pages. The shell (HTML, JS bundle, CSS, fonts, app icons) is precached by the service worker so navigation and the UI boot instantly offline. Dynamic content (apps, essays, downloads) is read from Dexie.
- **Routing model**: Use `react-router` with routes for `/` (landing hub), `/apps/:slug` (per PWA page), `/blog` and `/blog/:slug` (essays/news). Add optional `/pricing` or `/shop` for paid apps.
- **Data model (Dexie)**: Normalize content for flexibility and offline search.
  - `apps`: `{ id, slug, name, summary, hero, badges[], isPaid, downloadUrl, demoUrl, repoUrl, tags[], screenshots[] }`
  - `appPages`: `{ id, appId, section, body, ctaLabel, ctaUrl }` (rich sections per app page)
  - `releases`: `{ id, appId, version, note, fileUrl, publishedAt }` (for downloadable builds/patch notes)
  - `posts`: `{ id, slug, title, excerpt, body, publishedAt, tags[] }`
  - `media`: `{ id, fileName, blob, mime, appId?, postId? }` (optional if you want offline assets beyond the app shell)
- **Indexes**: Add multiEntry indexes for `tags` on both `apps` and `posts` for fast offline search/filtering. Add `.where('slug')` indexes for deterministic routing resolution.
- **Data loading**: On first load, fetch seed JSON (stored in `/data/*.json` in the repo) and hydrate Dexie. Subsequent visits read from Dexie first (instant) and then refresh in the background (stale-while-revalidate) to keep content fresh.

## Dexie setup (schema + seed)
```ts
// src/db.ts
import Dexie, { Table } from 'dexie';

export interface AppRecord {
  id?: number;
  slug: string;
  name: string;
  summary: string;
  hero: string;
  badges: string[];
  isPaid: boolean;
  downloadUrl?: string;
  demoUrl?: string;
  repoUrl?: string;
  tags: string[];
  screenshots: string[];
}

export interface AppPageRecord {
  id?: number;
  appId: number;
  section: 'hero' | 'problem' | 'workflow' | 'pricing' | 'faq';
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface PostRecord {
  id?: number;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  publishedAt: string;
  tags: string[];
}

class PortfolioDB extends Dexie {
  apps!: Table<AppRecord>;
  appPages!: Table<AppPageRecord>;
  posts!: Table<PostRecord>;
  releases!: Table<{ id?: number; appId: number; version: string; note: string; fileUrl: string; publishedAt: string }>;

  constructor() {
    super('portfolioHub');
    this.version(1).stores({
      apps: '++id, slug, *tags',          // slug for routing, multiEntry tags for filters
      appPages: '++id, appId, section',   // appId ties sections to the app
      posts: '++id, slug, *tags, publishedAt',
      releases: '++id, appId, version, publishedAt'
    });
  }
}

export const db = new PortfolioDB();
```

**Why this schema**
- `apps` holds one row per PWA. `slug` lets the router resolve `/apps/:slug` offline. `tags` supports offline filters/search.
- `appPages` normalizes sections so you can reorder/add content without changing the `apps` table. `appId` models the relationship to `apps`.
- `posts` keeps essays/news. Indexing `publishedAt` lets you sort quickly; `tags` enables offline search by topic.
- `releases` captures downloadable builds or changelogs per app.

**Seeding flow**
```ts
// src/seed.ts
import { db, AppRecord, AppPageRecord, PostRecord } from './db';

export async function seedIfEmpty() {
  const count = await db.apps.count();
  if (count > 0) return; // already seeded

  const apps: AppRecord[] = [
    {
      slug: 'estimate-calculator',
      name: 'Estimate Calculator',
      summary: 'Margin-safe estimates for small jobs.',
      hero: 'Build consistent quotes without spreadsheets.',
      badges: ['Free', 'Offline-first'],
      isPaid: false,
      downloadUrl: 'https://username.github.io/estimate-calculator/',
      demoUrl: 'https://username.github.io/estimate-calculator/',
      repoUrl: 'https://github.com/username/estimate-calculator',
      tags: ['calculator', 'contractor'],
      screenshots: ['/img/estimate-hero.png']
    }
  ];

  const appPages: AppPageRecord[] = [
    {
      appId: 1,
      section: 'problem',
      body: 'Stop rebuilding quotes from scratch and protect your margins with reusable line items.'
    },
    {
      appId: 1,
      section: 'workflow',
      body: 'Collect scope, select line items, auto-calc totals, export PDF with jsPDF.'
    }
  ];

  const posts: PostRecord[] = [
    {
      slug: 'offline-first-philosophy',
      title: 'Why every tool is offline-first',
      excerpt: 'No logins, no waiting on a network to quote a job.',
      body: 'Write your essay body here. Render with Markdown or rich text.',
      publishedAt: new Date().toISOString(),
      tags: ['offline', 'pwa']
    }
  ];

  await db.transaction('rw', db.apps, db.appPages, db.posts, db.releases, async () => {
    await db.apps.bulkAdd(apps);
    await db.appPages.bulkAdd(appPages);
    await db.posts.bulkAdd(posts);
  });
}
```

Call `seedIfEmpty()` once inside your root component so first-time visitors get data even offline.

## React shell with MUI routing
```tsx
// src/App.tsx
import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, useParams, Link } from 'react-router-dom';
import { CssBaseline, Container, Grid, Card, Chip, Typography, Button, Stack } from '@mui/material';
import { db } from './db';
import { seedIfEmpty } from './seed';

function useApps() {
  const [apps, setApps] = useState([]);
  useEffect(() => {
    (async () => {
      await seedIfEmpty();
      const rows = await db.apps.orderBy('name').toArray();
      setApps(rows);
    })();
  }, []);
  return apps;
}

function AppList() {
  const apps = useApps();
  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Live apps
      </Typography>
      <Grid container spacing={2}>
        {apps.map((app) => (
          <Grid item xs={12} md={4} key={app.slug}>
            <Card sx={{ p: 2, height: '100%' }}>
              <Stack spacing={1}>
                <Typography variant="h6">{app.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {app.summary}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {app.badges.map((b) => (
                    <Chip key={b} label={b} size="small" />
                  ))}
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
                  <Button component={Link} to={`/apps/${app.slug}`} variant="contained">
                    View page
                  </Button>
                  {app.demoUrl && (
                    <Button href={app.demoUrl} target="_blank" rel="noopener" variant="outlined">
                      Launch demo
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}

function AppDetail() {
  const { slug } = useParams();
  const [app, setApp] = useState<any>(null);
  const [sections, setSections] = useState([]);

  useEffect(() => {
    (async () => {
      const record = await db.apps.where('slug').equals(slug!).first();
      if (!record) return;
      setApp(record);
      const rows = await db.appPages.where('appId').equals(record.id!).toArray();
      setSections(rows);
    })();
  }, [slug]);

  if (!app) return <Container sx={{ py: 4 }}>App not found offline. Try refreshing once online.</Container>;

  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h3" gutterBottom>{app.name}</Typography>
      <Typography variant="subtitle1" gutterBottom>{app.hero}</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {app.tags.map((t: string) => (
          <Chip key={t} label={t} size="small" />
        ))}
      </Stack>
      <Stack spacing={2}>
        {sections.map((section: any) => (
          <Card key={section.id} sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              {section.section === 'problem' && 'Problem'}
              {section.section === 'workflow' && 'Workflow'}
              {section.section === 'pricing' && 'Pricing'}
              {section.section === 'faq' && 'FAQ'}
              {section.section === 'hero' && 'Overview'}
            </Typography>
            <Typography variant="body1">{section.body}</Typography>
          </Card>
        ))}
      </Stack>
    </Container>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <CssBaseline />
      <Routes>
        <Route path="/" element={<AppList />} />
        <Route path="/apps/:slug" element={<AppDetail />} />
        <Route path="*" element={<Container sx={{ py: 4 }}>Page not found</Container>} />
      </Routes>
    </BrowserRouter>
  );
}
```

**Why this structure**
- The home route lists apps from Dexie so it renders instantly offline.
- Each app page resolves by `slug` from Dexie so `/apps/:slug` works without network access.
- MUI gives a clean base; you can layer your existing branding/CSS on top.

## Service worker (workbox-style cache-first + stale-while-revalidate)
```ts
// public/service-worker.js
const CACHE_NAME = 'portfolio-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/index.js',
  '/assets/index.css',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Cache-first for app shell/static assets
  if (SHELL_ASSETS.some((asset) => request.url.includes(asset))) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Stale-while-revalidate for JSON seeds/media
  if (request.headers.get('accept')?.includes('application/json')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
        return cached || networkFetch;
      })
    );
  }
});
```
- **Caching strategy**: Cache-first for the shell (app HTML/JS/CSS/icons) so the UI boots offline; stale-while-revalidate for JSON seed content so posts/app metadata update quietly in the background.
- Register in React with `navigator.serviceWorker.register('/service-worker.js')` inside `main.tsx`.

## PDF exports with jsPDF (per app page)
```ts
// src/pdf.ts
import jsPDF from 'jspdf';
import { db } from './db';

export async function exportAppSummary(slug: string) {
  const app = await db.apps.where('slug').equals(slug).first();
  if (!app) throw new Error('App not found');
  const sections = await db.appPages.where('appId').equals(app.id!).toArray();

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(app.name, 14, 20);
  doc.setFontSize(11);
  doc.text(app.summary, 14, 30);

  let y = 40;
  sections.forEach((section) => {
    doc.text(`${section.section.toUpperCase()}: ${section.body}`, 14, y, {
      maxWidth: 180
    });
    y += 12;
  });

  doc.save(`${app.slug}-overview.pdf`);
}
```
- This pulls relational data from Dexie (apps + appPages) and exports a PDF offline.

## Content pipeline for GitHub Pages
1. Build the React app with Vite. Configure `base` to your repo name for GitHub Pages.
2. Put `data/apps.json` and `data/posts.json` in `public/` and fetch them on first load to seed Dexie.
3. Commit `manifest.webmanifest` with icons for installability.
4. Deploy `dist/` to `gh-pages` branch (via GitHub Actions).

## How this addresses your goals
- **Each PWA gets its own page**: `/apps/:slug` renders offline from Dexie, and each page can embed the live PWA (hosted on its own GitHub Pages) or link to a download.
- **One-page tools vs multi-page apps**: Use `appPages.section` to structure simple or complex walkthroughs per app. Add `releases` for downloadable builds.
- **Paid vs free**: `isPaid` flag and `pricing` sections let you switch CTA copy/flow without changing routing.
- **Essays/news**: `posts` table + `/blog` route render offline; tags enable search.
- **Offline-first**: App shell + Dexie + service worker ensures browsing, reading essays, and exporting PDFs all work without a network after first load.
