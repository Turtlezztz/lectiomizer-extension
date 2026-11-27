# Lectiomizer

A Firefox and Chrome extension that gives you a fast, modern Lectio. It doesn't
restyle Lectio's own pages. It opens its **own app** in a tab and reads your
schedule, assignments, messages, grades and absence from Lectio using your
existing Lectio login.

- **Overblik**: the current or next lesson with a countdown, today's lessons, upcoming deadlines, the latest messages and notices.
- **Skema**: a week calendar with subject colours, changed and cancelled lessons, and a live "now" line. It shows a day agenda on mobile.
- **Opgaver**: assignments grouped as upcoming, missing and handed in, with hand-in, upload and groups on the detail page.
- **Beskeder**: a mail-style inbox, conversation threads, reply and new messages.
- **Spørgeskemaer**: answer the questionnaires sent to you (single choice, multiple choice and free text), save a draft or hand it in. Results and creating your own questionnaires open in Lectio.
- **Karakterer**, **Fravær** and **Lektion** (lesson notes, homework and materials).
- **Elevfeedback**: on a lesson's Elevfeedback tab you read what the teacher and classmates wrote, and write your own answer in an editor with headings, bold/italic/strikethrough, sub/superscript, text and highlight colours, alignment, lists, indent, quotes, links, tables, images and attached files (also by paste or drag-and-drop). It shows when elevfeedback isn't open or is read-only on a module.
- **Notifications**: Lectiomizer checks Lectio in the background (hourly by default, down to every 3 minutes) and tells you about changed, cancelled, removed or restored lessons, new messages and replies, and new assignments. You get a browser notification and a badge on the toolbar icon, and the history is under the bell in the app.
- **Assistent** (optional): ask about your schedule, assignments (and their description documents), lessons, messages, grades and absence. It answers with your own ChatGPT plan (Sign in with ChatGPT) and can only read.
- **MCP server** (optional): use the same read-only Lectio tools from Claude, Cursor or any other MCP client.
- **Google Kalender** (optional): copies your Skema into a separate "Lectio" calendar in Google Calendar and keeps it updated on every check.
- `⌘K` / `Ctrl+K` search, keyboard shortcuts `1`–`6`, light, dark and system themes.

Nothing is sent anywhere except lectio.dk, Google Calendar once you connect it, OpenAI when you ask the Assistent something, and a local MCP client when you turn that on. Lectio actions (sending, uploading,
handing in) are performed by submitting Lectio's own forms.

## Develop

```bash
npm install
npm run dev:app        # the app at http://localhost:5199, backed by fixtures/ (no login needed)
node scripts/gen-fixtures.mjs   # (re)generate synthetic fixture pages
npm run dev            # WXT dev mode in Chrome (hot reload)
npm run dev:firefox    # WXT dev mode in Firefox
npm test               # vitest
npm run typecheck
```

## Build and install

```bash
npm run build           # Chrome  → .output/chrome-mv3
npm run build:firefox   # Firefox → .output/firefox-mv2
npm run zip / zip:firefox
```

- **Chrome**: `chrome://extensions` → enable Developer mode → *Load unpacked* → `.output/chrome-mv3`.
- **Firefox**: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → `.output/firefox-mv2/manifest.json`.

Click the toolbar button to open Lectiomizer, choose your school, then log in to
Lectio in the tab that opens. You come back to the app automatically.

## Notifications

Checks run in the background while the browser is open, even when the
Lectiomizer tab is closed. On Chrome the pages are parsed in an offscreen
document; on Firefox, in the background page. The first check sets a silent
baseline; after that, only differences are reported. Past lessons and
assignments that are already handed in or past their deadline don't trigger
alerts. History (the latest 100 notifications from the last 90 days) and
snapshots are stored locally, per student. If your Lectio session expires,
the bell shows a "log in" message, and checks resume after you sign in again.

## Google Kalender

Google sign-in needs an OAuth client ID that belongs to you. **Indstillinger →
Google Kalender** walks you through it and shows the redirect address to copy:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API**.
2. Under **Google Auth Platform**, configure the consent screen as **External**, keep it in **Testing**, add yourself as a test user, and add the scope `https://www.googleapis.com/auth/calendar.app.created`.
3. Create an OAuth client of type **Web application**, and add the redirect address shown in Indstillinger as an authorised redirect URI. It differs between Chrome (`https://<extension-id>.chromiumapp.org/`) and Firefox (`https://<hash>.extensions.allizom.org/`).
4. Paste the client ID into Indstillinger and press **Forbind Google Kalender**. On Firefox, allow sending website content when asked.

Alternatively, bake a client ID into the build with `WXT_GOOGLE_CLIENT_ID=… ` in `.env`.

Lectiomizer can only see and change the calendar it creates. The Google
token is kept in session storage only. **Afbryd** revokes it; the "Lectio"
calendar stays in Google and is reused if you connect again.

## Assistent

Open **Assistent** in the sidebar (or press `0`) and choose **Fortsæt med ChatGPT**. Lectiomizer asks
for permission to contact OpenAI, then opens ChatGPT's sign-in. Answers use your own ChatGPT plan; no API
key is involved. If the sign-in tab ends on an unreachable `127.0.0.1` page, paste its address into the
box under the button.

The assistant reads Lectio with purpose-built, read-only tools (see `src/lib/agent/tool-specs.js`):
`get_overview`, `get_schedule`, `list_assignments`, `get_assignment`, `get_lesson`, `list_messages`,
`read_message`, `get_grades`, `get_absence`, `read_document` and, as a fallback, `read_page`.
Conversations are kept in the browser without the contents of what was read.

## MCP server

`mcp/server.mjs` exposes the same tools to MCP clients (Claude Desktop, Claude Code, Cursor, …). The
browser keeps the Lectio session: the server listens on `127.0.0.1:47123` and the extension polls it for
tool calls, so the server never sees a password or cookie. Node 18+, no dependencies.

1. In Lectiomizer: **Indstillinger → MCP-server → Tillad MCP-klienter**. Copy the key it shows.
2. Add the server to your client, with the key in `LECTIOMIZER_TOKEN`:

   ```bash
   claude mcp add lectio -e LECTIOMIZER_TOKEN=lx_… -- node /path/to/lectiomizer/mcp/server.mjs
   ```

   ```json
   { "mcpServers": { "lectio": { "command": "node", "args": ["/path/to/lectiomizer/mcp/server.mjs"], "env": { "LECTIOMIZER_TOKEN": "lx_…" } } } }
   ```

The browser must be open with Lectiomizer installed and logged in to Lectio. The extension looks for the
server once a minute, and immediately while connected. Several clients can run their own copy at once:
the first owns the port and the others forward to it. Set `LECTIOMIZER_PORT` (and the same port in
Indstillinger) if 47123 is taken.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works.
