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
  features/people/  Elever + Lærere (FindSkema.aspx lists) and the shared detail page (profile, "nu", week schedule)
  features/questionnaires/  Spørgeskemaer: overview + answer page (model.ts: answers ↔ Lectio form fields)
  features/rooms/   Lokaler: room list with live booked/free status from each room's week schedule
  lib/nav.ts        useBack(fallback): "Tilbage" via in-app history, else a fallback route
  lib/agent/         the Assistent and the MCP bridge
    tool-specs.js   the read-only Lectio tools as plain data (names, descriptions, JSON Schema); shared with mcp/server.mjs
    tools.ts        createLectioTools(): runs them with getPage + the readers, returns compact Markdown with ids
    html-markdown.js  Lectio HTML → Markdown (teacher content, message bodies, fallback pages)
    openai.js       Sign in with ChatGPT + Responses API helpers (pure, ported from v1)
    session.ts      background: sign-in, callback capture via tabs.onUpdated, token refresh (only here)
    agent.ts        app: Responses streaming with retries, runTurn() tool loop, history helpers
    account.ts      chat account state, permissions, saved conversations (storage)
    bridge.ts       background: long-polls the local MCP server for tool calls (when turned on)
    run-tool.ts     runs one tool for the bridge (Firefox background page / Chrome offscreen document)
  features/chat/    Assistent page; jobs.ts keeps running answers alive across route changes
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
* Assignments: Lectio only opens `ElevAflevering.aspx` with the student's
  `elevid`; routes carry it (`/assignments/:id?elevid=`) and `useAccount()`
  supplies it otherwise.
* Other people's / rooms' schedules: `WeekSchedule` with a `SkemaNy.aspx?type=…`
  base; many at once go through `useManyWeekLessons` (max 4 requests in flight).
* `NotLoggedInError` from any fetch sends the user to the login gate.
* Lectio documents (elevfeedback): Lectio remembers per session whether the tab is in
  read or edit mode. `readers/feedback.js` finds the student's own paper in both (via the
  header's context card) and returns the CKEditor `<textarea>` handle in edit mode, or the
  "Rediger" button (`editButton`) in read mode. The writing page (`/lesson/:id/feedback/write`)
  presses Rediger first when needed. Saving posts back with the editor control as event
  target and argument `save` (what Lectio's "lectiosave" command does), the HTML in the
  textarea field and `$isDirty=1`. Images/files go to `uploadEditorFile()`
  (`lcutil/editorapi.api/posteditorfile`, CKEditor's JSON upload protocol) and are
  referenced from the HTML. `features/lesson/feedback-html.ts` converts between
  Lectio's stored markup and the editor's (absolute vs site-relative URLs, CKEditor-safe tags).

* Spørgeskemaer (`readers/questionnaire.js`): Lectio has four question types – Overskrift
  (info), Åbent svar (textarea), Ét svar (radio list), Flere svar (checkboxes). Answers are
  local state; `answerFields()` turns them into form fields plus `omit` (unticked boxes the
  loaded page has ticked) and the page posts back with "Gem" (`answerbt`, a draft) or
  "Indsend" (`answercompletebt`, final). After Gem the page is re-read and the answers are
  compared, so a silent rejection shows up as an error. Results, templates and creating a
  questionnaire stay on Lectio.

## Assistent and MCP

```
app page (ChatPage) ── runTurn ──▶ api.openai.com/v1/responses   (token from background: chat:token)
        └── tools.run(name, args) ──▶ lectio.dk (getPage + readers, no Lectio tab needed)

MCP client ──stdio──▶ mcp/server.mjs (127.0.0.1:47123) ◀── long-poll ── background bridge.ts
                                                                         └─ run-tool.ts (offscreen on Chrome)
```

* The tools only read. They take ids (opgave-id, lektion-id, besked-id) that other tools return, and
  links stay on the student's own school (`resolveUrl`). Pages are shared between calls for a minute.
* In the app, links in answers are school-relative; `features/chat/Markdown.tsx` turns them into in-app
  routes via `appRoute()`. MCP results use absolute lectio.dk links.
* The bridge only runs while turned on in Indstillinger and only talks to a server with the same
  pairing token (`LECTIOMIZER_TOKEN`).

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
