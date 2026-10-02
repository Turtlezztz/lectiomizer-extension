# Lectio student interface

Mode: Operate. Approved design: Compact, selected through the Impeccable decision page on 2026-10-02. Approved comp: `.impeccable/mocks/decision/dense.png` (sidecar approved true). The user's selected screenshot and Build this action approve its layout; implement that directly.

## Direction contract
White workspace, utility-red sidebar selection and section accents, crisp humanist sans, compact table-led information. A fixed 216px left navigation carries all discovered student destinations; a 76px toolbar offers contextual heading and search. The weekly timetable dominates schedule pages; existing dashboard blocks organize the home page into a broad central column and a narrow task column. Tables use fine neutral rules, generous cell padding and strong headers. Original forms, scripts, hidden fields, identities and source actions remain owned by Lectio. Sidebar action feedback is the signature interaction: instant location highlight and a brief 140ms color transition; the mobile rail enters in 180ms, reduced motion makes swaps immediate. No external data service. Unknown routes keep their native content with shared styles.

## Comp inventory
| Region | Medium | Fidelity commitments |
| --- | --- | --- |
| Sidebar | React + lucide SVG | White surface, red wordmark and selected row, 216px width, consistent icons |
| Toolbar | React/CSS | 28px heading, navigation search at right, thin divider |
| Timetable | Original semantic table + CSS | Five days, aligned time geometry, muted lesson fills, visible event state |
| Deadlines | Original dashboard DOM + CSS | Right column on wide homepage, well-aligned dates |
| Messages | Original DOM + CSS | Ruled rows, readable sender/subject/date |
| Data tables | Original semantic DOM + CSS | 14px minimum, white surfaces, fine rules |
| Forms | Original inputs + CSS | Visible labels, native validation and events |
| Icon | Authored precise SVG | Book form, utility red |

Sampled flat palette (approved image): Sampled page #fefefe, sidebar #ffffff, active fill #bc262b, lesson #f2f3f3. Semantic ink #171c25 and dividers #dedfe2 are implementation tokens, not pixel samples. Use semantic foregrounds with >=4.5:1 text contrast. No raster imagery is needed by this UI. Generated comp is reference material only and is not shipped in the extension.

## Validation scope
All 13 primary student pages inspected structurally in the user session. Secondary routes use the shared shell and retain native subnavigation. Test fixtures contain invented demonstration data only. Desktop and mobile preview captures, adapter tests, bundle checks and Firefox web-ext lint required. Real Firefox login/postbacks must be tested by the user after loading the temporary extension; do not imply synthetic preview covers every authenticated action.

## Recovered direction provenance
Original roll: `87765d5f`, scope direction, mode operate, assigned grounded candidate 6. Full original output recovered from this chat's tool history in `.impeccable/seed-record.txt`. User selected challenger 1 (`japanese-high-density-web`) through the Compact card, decision key `098b1051`; this choice supersedes the assigned Campus direction. No new roll or choice was made. Original QUALITY BAR board and hero are saved in `.impeccable/references/quality-board.webp` and `quality-hero.webp` with their source URLs in the seed record. Those references govern craft; the user-approved dense.png governs this product's composition. Contract persistence was repaired at finish: its five blocks now live in src/content.jsx and are emitted as the body's first comment. The same contract's FORM identifies the actual recovered seed, assignment and user choice.

The hero reproduction capture is a late checkpoint, not evidence that the initial build checkpoint happened on time. Native schedule pages preserve Lectio's full-width timetable; the homepage uses broad daily content and a narrow deadlines column. Screenshots use invented content and do not assert exact literal reproduction of the generated illustrative lesson records.
