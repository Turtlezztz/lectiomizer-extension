# Lectiomizer

A Firefox extension that gives Lectio a compact white-and-red interface, a React sidebar and one design system across student pages.

## Test in Firefox

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** (Danish: **Indlæs midlertidig tilføjelse…**).
3. Select `dist/manifest.json` in this project, or select `artifacts/lectiomizer-1.0.0.zip`.
4. Open your school's Lectio page and refresh it. Sign in normally if needed.

This development installation remains until Firefox restarts. Normal permanent installation requires Mozilla signing; the ZIP is an unsigned development build. Firefox 142 or newer is required.

The toolbar popup and the page's top-right settings button let you disable the redesign, change spacing and collapse the sidebar. Disabling restores the original presentation. `Ctrl+K` / `Cmd+K` opens navigation and page-link search; Lectio's original message/document search is also available through that panel.

## Included

- Sidebar: Forside, Skema, Opgaver, Beskeder, Lektier, Fravær, Karakterer, Studieplan, Dokumenter, Bøger, Spørgeskema, SPS and Profil, plus school menus/help/logout.
- Forside (rebuilt view): the running or next lesson with time left and an elapsed line, then "Brug for dig" ranking missing absence causes, assignments and homework by urgency; latest messages, school notices in full and the other dashboard blocks follow. Today's lessons with times, the coming days and classes sit in a side column (directly under the lesson panel on phones).
- Opgaver (rebuilt view): compact list grouped into Kommende, Mangler and Afleveret with deadlines, relative dates and status; search, hold filter and Lectio's own "Vis kun aktuelle"/"indeværende skoleår" toggles.
- Beskeder (rebuilt list view): folder sidebar, compact message rows with unread/attachment/flag state, Ny besked, Alle læst, bulk actions and Lectio search through the original controls. An opened thread keeps the restyled original page.
- Dokumenter: folder navigation alongside searchable records; folders collapse on phones and original compose/upload/search controls remain available.
- Fravær → Fraværsårsager (rebuilt view): absence totals, lessons missing a cause with "Angiv årsag", and the registration history with causes and comments in a disclosure. The Oversigt tab is still restyled in place.
- Karakterer (rebuilt view): exam averages first, then this year's grades per subject with written/oral progressions (1. standpunkt → årskarakter/eksamen), the diploma lines, and protocol lines grouped by term. **Lectios visning** switches to the original page for print, export and language.
- Studieplan: select a single course for a readable timeline or compare the original course matrix in a contained horizontal scroller.
- Bøger: title, course and return deadline first; loan details available on demand.
- Aktivitet (rebuilt view): lesson header, my/hold previous–next navigation, tabs, course, the lesson note, homework and materials rendered as sanitised rich text, and an "I denne lektion" outline.
- Opgaveaflevering (rebuilt view): details, deadline and status, assignment documents, the entry timeline, and a hand-in box that drives Lectio's own comment and "Vælg dokument" upload.
- Google Kalender (optional, off until you connect): your Skema is copied into a separate "Lectio" calendar in Google Calendar and kept up to date while you use Lectio. See below.
- Shared native schedule, form and secondary-navigation styles.
- Original schedule event positions, changed/cancelled states, links and context-menu hooks.
- Mobile drawer, keyboard focus management, reduced motion and print styles.
- A locally bundled React runtime, Lucide icons and Source Sans 3. No remote code or fonts.

The adapter discovers links from the current school and preserves native controls, identifiers, hidden form fields and source event handlers. Unknown pages receive the common styles. The extension does not replace Lectio's backend.

### Two kinds of page

- **Rebuilt views** (`src/readers/`, `src/views/`): a reader turns Lectio's page into plain data and a React view renders it. Lectio's original content stays in the form, hidden, so postbacks and hidden fields keep working. If a reader can't understand the page it throws, and the page falls back to Lectio's own layout with the shared styles instead of a half-styled mix. Optional sections that fail show a notice with a link to the original. Currently: Forside, Karakterer, Aktivitet, Opgaver, Opgaveaflevering, Fraværsårsager and the Beskeder list.
- **Restyled pages** (`src/pages.jsx`): everything else is still reflowed in place from Lectio's own nodes.

To rebuild another page, add a reader that throws `ReaderError` on unexpected markup, a view, and an entry in `src/views/index.jsx`. Base its test fixture on the real page's markup with invented values (see `demo/grades-fixture.mjs`).

## Google Kalender

Once connected, Lectiomizer reads the coming weeks of your Skema (this week and 1–8 weeks ahead, set in the popup) at most once an hour while you have Lectio open, plus whenever you press **Synkronisér nu**. It writes them to a calendar named **Lectio** that it creates in your Google account.

- Each lesson keeps its Lectio id, so a changed room, time or teacher updates the same event instead of adding a new one. Lessons removed from Lectio are removed from the calendar for the weeks that were read; a week that fails to load is left untouched.
- Changed lessons are green, cancelled lessons are red, start with "Aflyst:" and don't show you as busy. Cancelled lessons can be hidden in the popup.
- The description holds the teacher, the tooltip's homework/note text and a link back to the lesson in Lectio.
- Google access uses the `calendar.app.created` scope: Lectiomizer can only see and change calendars it created itself, never your other calendars. Events you add to the Lectio calendar yourself are left alone; Lectiomizer's own events there get overwritten.
- **Afbryd** signs out and revokes the token. The Lectio calendar stays in Google until you delete it; connecting again reuses it.

### One-time setup (OAuth client)

Google sign-in needs an OAuth client ID that belongs to you:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API**.
2. Under **Google Auth Platform**, configure the consent screen as **External**, leave it in **Testing** and add your own Google account as a test user. Under **Data access**, add the scope `https://www.googleapis.com/auth/calendar.app.created`.
3. Under **Clients**, create a client of type **Web application** with this authorised redirect URI:
   `https://3e9065ee2a1bb97613ed4bb8f3307b4cfcd2396d.extensions.allizom.org/`
   Firefox derives this from the add-on id `lectiomizer@local.extension`. While no client ID is set, the popup shows the exact value Firefox uses.
4. Put the client ID in `.env` in this project (it is git-ignored), then rebuild and reload the add-on:
   ```sh
   echo 'GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com' > .env
   npm run build
   ```
5. Open the popup, press **Forbind Google Kalender**, allow Firefox to send website content, and sign in with Google.

Firefox keeps the Google token in session memory only. While you stay signed in to Google in Firefox, Lectiomizer renews it silently; if that fails, the popup shows **Forbind igen**.

## Validation and limits

All 13 primary student sections were structurally inspected in an authenticated user session. Forty-five automated tests exercise navigation, original click/change handlers, hidden fields, assignment filtering, secondary-field disclosure, folder selection, grouped grade labels, study course selection, activity drafts, UpdatePanel replacement and restoration of original nodes/positions when disabled, plus the Karakterer reader (grouping, tooltips, empty years, diploma groups, protocol labels, per-section failure) and view (mounting, switching to the original, fallback and UpdatePanel re-reads), and the Aktivitet, Opgaver, Opgaveaflevering, Fravær and Beskeder readers and views (native navigation, filters, hand-in, bulk actions, sanitised lesson content and thread fallback), and the Google Kalender sync (Skema week reader, ISO weeks across New Year, event mapping, idempotent sync against a fake Calendar API, token renewal, rate-limit backoff, partial scope grants and the hourly throttle). Each reader was also run against the corresponding live page with masked output. Synthetic browser layouts were checked at 320, 390, 768, 1024 and 1280 pixels.

The Google Kalender sync has not been run against a live Lectio account or a real Google project yet. Its Skema reader is tested against a fixture built from the Forside lesson markup and Lectio's tooltip format, so the first real sync is the check that SkemaNy.aspx matches.

Visual tests use invented data in a local preview with Lectio's public native stylesheet; they do not establish that every live Firefox postback, upload, school-specific page or staff workflow works. Test your real schedule, assignment detail, messages, files, grades, absence and profile after installing. Staff/admin features and every secondary route have not been individually audited.

Firefox `web-ext lint` reports zero errors. Four warnings point to React's bundled internal `innerHTML` support. Application code renders strings as React text and does not use `innerHTML` or `dangerouslySetInnerHTML`.

## Privacy

Lectiomizer reads no cookies and sends no analytics. It runs only on HTTPS Lectio pages. It reads the current page DOM to create navigation and apply styles; the underlying site continues to perform its normal requests. Student records and credentials are not copied into this repository or package.

Until you connect Google Kalender, Lectiomizer makes no network requests of its own. Once you connect (and grant Firefox's "website content" data permission), it fetches your Skema pages from Lectio with your existing session and sends the lessons (subject, time, room, teachers, homework/note text and the lesson link) directly from your browser to Google Calendar. Nothing goes to any other server. Local storage holds appearance preferences, the calendar settings, the sync status and your Google email address; the Google access token lives in session storage and is gone when Firefox closes.

## Development

```sh
npm ci
npm run build
npm test
npm run lint:extension
npm run package
npm run dev
```

Preview: `http://127.0.0.1:4173/lectio/123/SkemaNy.aspx`. All preview data is invented. The preview source and Lectio's public native stylesheet in `demo/` are excluded from the extension package. `demo/native.css` is an unmodified reference fetched from https://www.lectio.dk/lectio/content/lectio-css.bundle.css on 2026-10-02; it remains the property of its respective owners.

For an existing installation loaded from this project’s `dist/manifest.json`, click **Reload** on Lectiomizer in `about:debugging` and refresh Lectio. If you loaded the previous ZIP, remove the temporary add-on and load the new `lectiomizer-1.0.0.zip`.

After changing the extension, rebuild and click **Reload** on Lectiomizer in `about:debugging`, then refresh Lectio. `dist/` is the loadable extension; `artifacts/` contains the packaged ZIP.
