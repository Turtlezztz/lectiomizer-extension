# Lectiomizer 2 – architecture

Lectiomizer is a browser extension (Firefox + Chrome, built with **WXT**) that
opens **its own app page** (`app.html`) in a tab. It never modifies lectio.dk.
The app fetches Lectio pages with the user's existing Lectio session, parses
them into data, and renders its own UI.

```
src/
  entrypoints/
    app/            the app page (index.html + main.tsx)
    background.ts   toolbar button → open/focus app tab; closes login tab after sign-in;
                    alarm-driven Lectio checks, system notifications, badge, Google sync
    offscreen/      Chrome only: DOMParser host for background reads (service workers have no DOM)
  app/              shell: App.tsx (routes), Shell.tsx (sidebar), CommandPalette, Onboarding
  features/<name>/  one folder per page (HomePage, SchedulePage, …) – default-exported page component
  components/ui/    design-system primitives (Button, Card, Badge, Avatar, Input, Segmented, Skeleton, states, page)
  components/RichText.tsx   sanitised Lectio HTML (lesson notes, messages)
  lib/lectio/
    client.ts       fetch + parse + login detection + ASP.NET postbacks (getPage, postback, activate, postbackTarget)
    query.ts        TanStack Query hooks: useLectioPage(path, reader), useLectioAction(loaded, reader)
    paths.ts        PATHS, pageUrl(), appRoute(lectioHref) → in-app route
    readers/*.js    pure parsers: (Document) => data. Throw ReaderError on unexpected markup.
  lib/sync/
    read.ts         readLectio(): account context + coming weeks + message/assignment feeds (needs a DOM)
    check.ts        runCheck(): lock, read, compare, store history, notify, then Google sync (background only)
    changes.js      pure diffing of schedule snapshots and feeds → notices (ported from v1)
    events.js, google.js, calendar.ts   Google Calendar event mapping, API client, connect/sync
    store.ts        storage keys/types: `sync` prefs, `scheduleHistory`, `calendarStatus`
    hooks.ts        app-side hooks (usePrefs, useNotices, …) + send() to the background
    notice.ts       notice title/body/diff text shared by app + system notifications
  lib/format.ts     Danish date helpers (relativeDay, untilText, urgency, fmtTime…)
  lib/subjects.ts   subjectColor(hold) – stable colour per subject
  styles/app.css    Tailwind v4 theme tokens (light + .dark)
```

## Data flow

```tsx
const { data, isPending, error, refetch } = useLectioPage(PATHS.assignments, readAssignments);
// data = { doc, data: <reader output>, url }
```

* Readers get a `Document` produced by `DOMParser`; `doc.URL` is the real Lectio
  URL and a `<base>` is set, so `a.href` resolves to absolute Lectio URLs.
* Reader output may contain DOM elements from that document (e.g. `source`,
  `open`, `actions.*`). Those are **handles for actions**, not for rendering:
  pass them to `useLectioAction(...).mutate({ element })` which re-submits
  Lectio's form (postback) and replaces the cached page with Lectio's response.
* For text inputs on Lectio forms use `mutate({ element: button, fields: { [input.name]: value } })`.
  File uploads: `files: [[inputName, file]]`.
* Links: convert Lectio hrefs to in-app routes with `appRoute(href)`; if null,
  open the original Lectio page in a new tab (`target="_blank"`).
* `NotLoggedInError` from any fetch sends the user to the login gate.

## Design language

Calm, dense-but-airy, Linear/Things-like. Warm neutral surfaces, coral accent
(nod to Lectio red), Inter, 14px base, 12–16px radii, hairline borders, very
soft shadows. Use tokens only (`bg-surface`, `text-fg-muted`, `border-border`,
`bg-accent-soft text-accent-soft-fg`, …) so dark mode works automatically – no
raw Tailwind colours except via `subjectColor()`.

* Page layout: `<Page><PageHeader title description actions/> …</Page>`.
* Cards: `<Card><CardHeader title icon action/><CardBody/></Card>`.
* Always handle: loading (`Skeleton`/`SkeletonRows`), error (`ErrorState` with
  `onRetry={refetch}` and `href` to the Lectio page), empty (`EmptyState`).
* UI text is Danish.
* Numbers: `tabular-nums`. Times: `fmtTime`. Relative days: `relativeDay`.

## Dev loop

* `npm run dev:app` → http://localhost:5199 – the app outside the extension,
  backed by `fixtures/` (gitignored). `node scripts/gen-fixtures.mjs` writes
  synthetic pages (school id 123). Real pages can be captured by POSTing HTML
  to `/__capture?url=<lectio url>`.
* `npm test` (vitest), `npm run typecheck`, `npm run build` / `build:firefox`.
* Load the extension: Chrome → `chrome://extensions` → Load unpacked →
  `.output/chrome-mv3`; Firefox → `about:debugging` → Load Temporary Add-on →
  `.output/firefox-mv2|mv3/manifest.json`.

The old content-script implementation lives in `legacy/` for reference
(its `src/views/*.jsx` show which reader fields matter).
