---
name: "Lectiomizer — Compact"
description: "A white, compact Lectio workspace with utility-red navigation and native student content."
colors:
  primary: "#bc262b"
  primary-hover: "#a21d23"
  primary-soft: "#fbebec"
  background: "#fff"
  surface: "#f6f7f7"
  ink: "#171c25"
  muted: "#5d6470"
  rule: "#dedfe2"
  field-border: "#c7cbd1"
  nav-hover: "#f4f4f5"
  row-hover: "#faf5f5"
  lesson-neutral: "#f2f3f3"
  lesson-ink: "#263039"
  subject-dot-0: "#2f6fd0"
  subject-dot-1: "#7a4fc4"
  subject-dot-2: "#d9761a"
  subject-dot-3: "#11899a"
  subject-dot-4: "#c2408f"
  subject-dot-5: "#3b4a9c"
  subject-dot-6: "#b8930f"
  subject-dot-7: "#8b5a3c"
  changed-bg: "#e2f1e4"
  changed-ink: "#1f5b2c"
  cancelled-bg: "#fbe3e5"
  cancelled-ink: "#98242a"
  switch-off: "#d5d8dc"
  focus-soft: "#f7dadd"
  selection-bg: "#f6cbd0"
  selection-ink: "#651318"
  selected-tab-rule: "#e7b9bd"
  disabled-bg: "#f3f4f5"
  disabled-ink: "#6e7581"
  scrollbar-thumb: "#bec2c9"
  scrollbar-track: "#f7f7f8"
  avatar-bg: "#eceef0"
  avatar-ink: "#343a43"
  keyboard-hint-bg: "#f2f3f4"
  table-heading-ink: "#343b47"
  timetable-info-bg: "#fbfbfc"
  timetable-rule: "#e8eaed"
  lesson-hover: "#e8ebed"
  drawer-scrim: "#171c255c"
  lesson-muted: "#3c4450"
  status-open-ink: "#2b4a72"
  status-done-bg: "#eef2ee"
  status-done-ink: "#2f5a35"
  note-bg: "#fff8e8"
typography:
  headline:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-.025em"
  section:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "19px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-.015em"
  intro:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-.025em"
  record-title:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.5
  record-body:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "15px"
    lineHeight: 1.5
  record-label:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
  grade:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "19px"
    fontWeight: 650
    lineHeight: 1.5
  grade-mobile:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "23px"
    fontWeight: 650
    lineHeight: 1.5
  reading:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "15px"
    lineHeight: 1.7
  body:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "15px"
    lineHeight: 1.45
  table:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "14px"
    lineHeight: 1.45
  control:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "14px"
  navigation:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.4
  metadata:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "12px"
  list-meta:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "13px"
    lineHeight: 1.35
  lesson-time:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "16px"
    fontWeight: 650
  subject:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
  rich-heading:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "18px"
    fontWeight: 650
  stat:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1.1
  brand:
    fontFamily: "Source Sans 3, sans-serif"
    fontSize: "26px"
    fontWeight: 720
    letterSpacing: "-.035em"
rounded:
  control: "7px"
  small-select: "6px"
  panel: "12px"
  table: "10px"
  avatar: "50%"
  pill: "999px"
spacing:
  control-y: "8px"
  control-x: "12px"
  table-cell-y: "11px"
  table-cell-x: "14px"
  panel: "18px"
  workspace: "24px"
  comfortable: "32px"
  label-gap: "5px"
  record-gap-y: "12px"
  record-gap-x: "20px"
  record-y: "20px"
  section-gap: "28px"
  mobile-record-gap: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "35px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "35px"
  button-icon:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    size: "38px"
  field:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "8px 11px"
    height: "36px"
  nav-item:
    textColor: "{colors.ink}"
    typography: "{typography.navigation}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    height: "39px"
  nav-item-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    rounded: "{rounded.control}"
  subnavigation-selected:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  panel:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.panel}"
    padding: "18px"
  data-table:
    backgroundColor: "{colors.background}"
    textColor: "{colors.ink}"
    typography: "{typography.table}"
    rounded: "{rounded.table}"
  lesson:
    backgroundColor: "{colors.lesson-neutral}"
    textColor: "{colors.lesson-ink}"
    rounded: "{rounded.control}"
    padding: "6px 8px"
  popup-switch:
    backgroundColor: "{colors.switch-off}"
    rounded: "{rounded.panel}"
    width: "34px"
    height: "20px"
  popup-open:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "11px 14px"
  record-row:
    textColor: "{colors.ink}"
    typography: "{typography.record-body}"
    padding: "20px 0"
  record-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.record-body}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  activity-actions:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
---

# Design System: Lectiomizer — Compact

## Overview

**Creative North Star: "Compact"**

Compact turns Lectio into a persistent, scannable student workspace. Bright white surfaces, utility red, Source Sans 3 and fine neutral rules give schedules, deadlines and records a consistent hierarchy. Information stays compact through aligned rows and restrained spacing, with readable text instead of the seed's proposed tiny type. The nine page workspaces extend this approved identity with task-specific reading order, open records and readable documents.

The extension frames Lectio's original content with a React navigation shell. Native form fields, uploads, links, hidden state and timetable geometry remain owned by Lectio; visual consistency must preserve those actions. Lucide outline SVGs support navigation. The approved image is a design reference, and no raster imagery ships in the interface.

**Key Characteristics:**

- White ground and a single utility-red accent.
- Humanist type, tabular numerals, labelled records and compact comparison tables.
- Persistent navigation with an icon rail and mobile drawer.
- Flat open sections, quiet context surfaces, subject dots and explicit event states.
- Native Lectio content and actions remain intact.

## Colors

The palette is a white utility surface with dark ink, cool gray rules and red action hierarchy. Frontmatter values are normative; these names describe their application.

### Primary

- **Utility Red** (`primary`): wordmark, active navigation, links, island headings and primary actions.
- **Deep Utility Red** (`primary-hover`): active-navigation hover, popup action hover and native validation errors.
- **Soft Red** (`primary-soft`): selected secondary tabs, navigation search results and gentle action hover backgrounds.

### Secondary

- **Lesson Grey** (`lesson-neutral`): the fill of an ordinary timetable lesson. In the timetable the fill states the lesson's status, never its subject.
- **Subject Dots** (`subject-dot-0` … `subject-dot-7`): a 7px dot before each timetable lesson's name. The colour is generated from the lesson's hold, so a subject keeps its dot across weeks. The palette avoids red and green so a dot never reads as a status.
- **Lesson Ink** (`lesson-ink`): ordinary lesson text over Lesson Grey.
- **Changed Green** (`changed-bg`, `changed-ink`): changed lessons, paired with italic text.
- **Cancelled Rose** (`cancelled-bg`, `cancelled-ink`): cancelled lessons, paired with italic text and strikethrough; the subject dot fades.

### Neutral

- **White Ground** (`background`): page, sidebar, toolbar, panels and fields.
- **Quiet Surface** (`surface`): table headers and control hover fills.
- **Dense Ink** (`ink`): core text and page headings.
- **Secondary Ink** (`muted`): school, dates, helpers and profile metadata.
- **Fine Rule** (`rule`): separators, panel edges and control outlines.
- **Field Edge** (`field-border`): native form fields and popup selects.
- **Navigation Hover** (`nav-hover`) and **Row Hover** (`row-hover`): scanning feedback without lifting the whole container.
- **Switch Off** (`switch-off`): unchecked popup switches.
- **Soft Focus** (`focus-soft`): pale-red toolbar-search focus outline. **Text Selection** (`selection-bg`, `selection-ink`): selected native and popup text. **Selected Tab Edge** (`selected-tab-rule`): selected native secondary-tab border.
- **Disabled Field** (`disabled-bg`, `disabled-ink`): unavailable native form fields; retain the separate disabled opacity treatment for actions.
- **Scrollbar** (`scrollbar-thumb`, `scrollbar-track`): thin native scrolling feedback.
- **Profile Neutral** (`avatar-bg`, `avatar-ink`): circular profile initials; the same background value is also the embedded school-list rule. **Keyboard Hint** (`keyboard-hint-bg`): search shortcut key fill.
- **Table Heading Ink** (`table-heading-ink`), **Timetable Info** (`timetable-info-bg`) and **Timetable Rule** (`timetable-rule`): native comparison/table headings and timetable context divisions. **Lesson Hover** (`lesson-hover`): neutral event hover fill.
- **Drawer Scrim** (`drawer-scrim`): translucent ink behind mobile navigation.

**The Utility Red Rule.** Use red for identity, selected navigation, links, section accents and meaningful action or error states; use Lesson Grey with a subject dot for ordinary timetable lessons.

## Typography

**Body Font:** Source Sans 3, falling back to sans-serif. The variable font is bundled locally with weights 200–900 and `font-display: swap`. There is no separate display or monospace voice. Lucide SVGs use outline strokes; text glyphs do not replace icons.

**Character:** Humanist, direct and readable. Weights separate headings and values while tabular numerals keep dates, timetable times and numerical columns aligned.

### Hierarchy

- **Page headline:** bold, tight single-line toolbar title. It scales to 25px at the icon-rail breakpoint and 23px on mobile, with ellipsis for long names.
- **Page introduction:** the `intro` role gives page-local context beneath the persistent title, with a 23px headline and 15px helper text at line height 1.5. It uses a maximum reading width of 72ch.
- **Native content headline:** 23px with a 1.3 line height; distinct from the persistent toolbar title.
- **Section:** 19px, weight 650, line height 1.3 for native island/workspace headings. Original island headings retain utility red; workspace headings use ink. Settings overlay titles use 18px in ink.
- **Record title:** 19px, weight 600, line height 1.5; the primary record link/name stays above its metadata. Activity context headings also use 19px at line height 1.45.
- **Record body / label:** 15px at line height 1.5 for record values, paired with 12px/500 labels at line height 1.3 and a 5px label-to-value gap.
- **Grade value:** 19px/650 on desktop; 23px/650 at 720px and below. Numerical prominence stays inside its labelled result record.
- **Reading:** 15px at line height 1.7 for lesson content, with a 76ch maximum width; message reading uses line height 1.65 and a 72ch maximum width.
- **Body:** ordinary native content and shell text. Shell line height is 1.4; the native page uses 1.45.
- **Table / control:** compact table rows, secondary tabs and form fields. Strong table headers use weight 650; native links use 550.
- **Metadata:** 12px for school term, profile helper text, dates and lesson secondary values. Search-result route labels and popup footer use 11px as ancillary information.
- **Brand:** compact red wordmark at weight 720. The popup wordmark is 24px; its ink-colored dot remains the identity punctuation.

**The Readable Density Rule.** Compactness comes from rows, rules and spacing. Keep ordinary native table and form text at 14px, shell/body and reflowed record values at 15px, record titles at 19px and labels at 12px; reserve smaller text for ancillary metadata.

## Layout

The desktop shell fixes a left rail (216px) and toolbar (76px), with native content below and to their right. The default workspace inset is 24px; native content begins 18px below its frame. The nine page workspaces are centered within a 1440px maximum width. The shared fallback retains 18px panel gaps; open workspace sections use 28px separation, and page introductions use 8px top / 28px bottom padding. Compact table cells use the frontmatter spacing tokens; the comfortable setting changes workspace spacing to 32px and ordinary table vertical padding to 15px.

Responsive behavior follows the built CSS cascade:

- At 1600px and above, workspace spacing becomes 32px and navigation rows gain a 42px minimum height.
- At 1200px and below, workspace spacing becomes 20px and generic dashboard columns can wrap.
- At 1100px and below, folder panes narrow from 220px to 180px, browser gaps from 28px to 20px, activity contents from 200px to 160px, and homepage column gaps from 32px to 24px.
- At 900px and below, navigation becomes a 72px icon rail and workspace spacing becomes 18px. The user can also select the 72px collapsed rail on larger screens. The fallback native homepage stacks here; the rebuilt homepage follows the page-workspace breakpoint below.
- At 750px and below, the toolbar school-year select hides; it remains available in the mobile sidebar when applicable.
- At 720px and below, home, folder browsers and activity reading become single-column workspaces with 24px gaps. Folder navigation collapses into a disclosure above records; activity contents initially folds above the lesson. Records use two labelled columns with full-width titles, sender and extra fields. Local search fills its own row; record gaps become 16px. Page introductions use 24px bottom padding. Native action controls and disclosure triggers have at least 44px height.
- At 640px and below, the rail stops consuming page width, the toolbar is 68px tall and workspace spacing is 14px. Navigation opens as a 246px drawer over a scrim. The search icon expands to a full field on focus. Shell icon actions are 44px targets. Native secondary tabs and form layouts wrap. Ordinary dense tables scroll horizontally; record lists reflow.

The weekly timetable retains a 980px minimum width in a horizontal scroll region. Preserve Lectio's relative-em positions, collision handling and event heights. Dense generic tables and the 900px study comparison are placed in contained scroll regions. A selected study course removes the comparison minimum width and retains week, month and student-time context; mobile initially selects the first course at 640px and below, while comparison remains available.

The rebuilt homepage (Forside) uses `minmax(0,1fr) 340px` columns with a 40px gap (`290px`/28px at 1100px). The main column leads with the next-lesson panel: the lesson's subject fill, a 28px subject (23px at 720px), an inline "Nu"/"Næste" pill, the time range at 16px/650 with time left, teacher and room, and a 4px utility-red elapsed line while the lesson runs. Below it, "Brug for dig" groups missing absence causes, assignments and homework into Kræver handling, Overskredet, I dag, I morgen, Inden for en uge and Senere; then the latest messages with the unread count, school notices in full (important ones on Soft Red), and the remaining dashboard blocks as compact columns under a 2px ink rule. The side column is a sticky quiet surface with today's lessons on a time column (the running lesson outlined in red, finished ones faded), the coming days, and class/group chips. At 900px and below the page becomes one column ordered panel, schedule, list, messages, notices, other, so today stays first. This weighting belongs to the homepage.

**The Task Hierarchy Rule.** Structure each workspace around its primary student task. Reuse the shared type, colors and record rhythm without forcing every route into the same panel grid. Detailed route composition remains in `.impeccable/page-layouts.md`.

The extension popup has a fixed 340px width with 22px padding. Its preference rows are divided by rules, followed by a full-width Lectio action. Print hides the React shell and removes shell offsets; native titles and printable timetable content remain visible.

## Elevation & Depth

Persistent content uses white ground and thin borders rather than shadows. Search results and settings are layered above the toolbar. On mobile, a translucent ink scrim separates the open drawer from inert background content.

### Shadow Vocabulary

- **Overlay:** `0 10px 32px #171c251c` for search results and settings panels.
- **Lesson hover:** `0 3px 10px #171c2514` for a hovered timetable event, together with a raised stacking order.
- **Re-enable action:** `0 5px 18px #0002` for the floating control shown when the redesign is disabled.

**The Flat Surface Rule.** Keep persistent panels and tables flat. Reserve elevation for overlays, the re-enable control and lesson hover feedback.

## Shapes

Small controls, secondary tabs, navigation selections and lesson blocks share gently curved corners. Larger content panels and overlays use the panel radius. Scrollable tables use their own slightly tighter radius. Selects and search result rows use the small-select radius. The profile avatar is circular; popup switch tracks are capsules with a circular thumb.

Edges remain fine and neutral. Changes and cancellations add distinct border or text treatments alongside color. Focus uses a 2px utility-red outline with a 3px offset; the search field adds a pale-red focus outline around its container.

## Components

### Buttons

Direct utility actions. Native primary submit controls use utility red, white text, the control radius and 8px by 12px padding, with a 35px minimum height. Secondary buttons use white, ink text and a fine-rule border. Native button hover applies brightness .96; disabled native controls lose this filter and use opacity .65. Icon actions are 38px squares with transparent borders and quiet-surface hover fills. Mobile icon controls are narrower where needed. All React shell controls explicitly avoid submitting Lectio's form.

The popup's primary link uses 11px by 14px padding, weight 600 and Deep Utility Red on hover. It carries an inline arrow SVG.

### Inputs / Fields

Keep native labels, validation and behavior. Text fields and selects are white with a Field Edge border, control corners and 8px by 11px padding, with a 36px minimum height. Textareas have a 120px minimum height, 1.55 line height and vertical resize. Disabled fields use a quiet gray fill and muted ink. Native checkboxes and radios retain their behavior and use the red accent. Validation errors use Deep Utility Red.

Toolbar search is a distinct 38px field with a fine-rule border and red focus-within treatment. Its width is constrained to the available toolbar space. Results are navigable rows; an active result uses Soft Red and Utility Red. The shortcut label is a small neutral keyboard hint. Search and settings close on Escape and outside pointer interaction.

### Navigation

The rail is a continuous white surface with a fine right rule. Rows combine 20px Lucide SVGs at stroke width 1.8 with humanist labels, 12px internal gaps, 9px by 12px padding and a 39px minimum height. Hover uses Navigation Hover. Active rows use Utility Red, white labels and weight 620, then Deep Utility Red on hover. Profile and utility actions are grouped below a divider.

Selected location feedback changes background and text over 140ms ease-out. The mobile drawer enters over 180ms with `cubic-bezier(.16,1,.3,1)`. Its open state locks page scrolling and makes native background content inert. The shell includes a skip link, accessible labels and a navigation keyboard focus loop; Escape restores the menu trigger's focus. Reduced motion removes these transitions.

### Secondary Tabs

Native secondary navigation remains visible as wrapping outlined tabs. Default tabs use muted text on white with fine rules; hover uses Quiet Surface and ink. Selection uses Soft Red, Utility Red and a rose border, without a shadow.

### Cards / Containers

The shared fallback styles native islands as white bordered panels with no shadow, utility-red section text, 16px by 18px by 12px header padding and 18px body insets. The nine workspaces remove these inherited panel borders, fills, radii and fixed heights to create open sections, with 16px below section headings. Quiet fills remain purposeful on today's schedule, folder panes, action strips and activity context. Settings and search overlays retain bordered panels and the overlay shadow.

### Data Tables

Ordinary semantic comparison tables retain a scrollable white frame, ruled rows, quiet header fills and strong left-aligned headers. Compact cell padding uses 11px vertically and 14px horizontally; mobile uses 10px by 12px. Ordinary row hover uses Row Hover, while reflowed records use Quiet Surface. Links use Utility Red with underline on hover. Avoid zebra-striping as the core hierarchy.

### Labelled Records

Assignment, message, absence, grade, document and book lists reflow original rows and cells into open records. Preserve their native table nodes, row/cell order and indices while CSS changes visual grouping. Desktop records use a 12-column grid, 12px vertical / 20px horizontal gaps and 20px vertical padding above a fine bottom rule. Titles span six columns (five beside selection); subject, deadline, status and date usually span two. Sender and extra fields span four; actions span three. Title leads, deadline carries weight 650, and grade values use the grade role.

At 720px the two-column arrangement gives titles full width and keeps selection beside the title in a 44px target with a 48px title inset. Every secondary value gains its original column label. Extra administrative fields are initially hidden through a per-list **Vis alle felter** toggle; selection, original links and actions remain available. Desktop/mobile duplicate cells are visually suppressed only when a desktop counterpart exists. Local search filters existing text, reports matching/total counts and shows a clear empty message. Its field is 44px tall and at most 480px wide on desktop. Search and disclosure state stay in memory.

**The Native Record Rule.** Relocate and reflow Lectio's existing nodes; preserve ids, input values, hidden state, original handlers and the surrounding form. Restore moved nodes through their recorded original positions when the redesign is disabled. Do not copy academic data into replacement replicas.

### Rebuilt Views

Forside, Karakterer, Aktivitet, Opgaver, Opgaveaflevering, Fraværsårsager and the Beskeder list are rendered from data instead of reflowed. A reader in `src/readers/` extracts the page into plain data and a React view in `src/views/` renders it in a `.lx-view` container at the top of `#contenttable`; Lectio's original nodes remain in the form, hidden with `.lx-view-active`. A **Lectios visning** button reveals the original page (print, export, language) and a soft-red bar returns to the view. Readers throw on unexpected markup and the page then falls back to native presentation. Optional sections that fail render a quiet notice with a link to the original.

The grades view uses the record vocabulary: a quiet-surface summary of exam averages (36px/700 values, 12px labels); one row per subject with 17px/600 subject names and per-form progressions of grade steps (12px type label, 19px/650 value, 23px at 720px); final grades marked by Lectio carry a 1.5px ink outline on white instead of colour, so no grade reads as good or bad. Diploma lines use the data-table frame; protocol lines sit in a closed disclosure grouped by term. Other rebuilt views share one vocabulary: secondary chip buttons and a red primary button, status pills (soft red for missing, quiet blue for upcoming, quiet green for delivered), 10px-padded compact rows on fine rules instead of reflowed tables, a quiet-surface sidebar for folders and outlines, and rich text (lesson content, entries) at 15px/1.7 with a 76ch measure. Teacher-authored HTML passes through an allowlist renderer: no scripts, styles, forms or attributes besides safe links and images. Actions are buttons that click Lectio's own hidden controls, so postbacks, dialogs and uploads behave as before.

The Native Record Rule applies to restyled pages; rebuilt views copy values only into their own rendering and never store them.

### Folder Navigation and Report Disclosures

Messages and documents keep the original folder pane beside the record list. The quiet folder surface has 8px padding, control corners and a 65vh scrolling cap (45vh at 720px). It is sticky beneath the toolbar at top 96px on desktop and initially open; at 720px it initially closes above the records. Its native details/summary control remains operable at either size, with an 18px inline Lucide chevron that rotates 180 degrees when open. Original file and message toolbars wrap in quiet 12px by 16px action surfaces, with 8px by 16px gaps.

Absence causes lead their workspace; registration history is a separate disclosure. Grades keep results ahead of supplementary notes, remarks and certificate data. Report summaries use 19px/600 type, 16px vertical padding, a 48px minimum height and a fine bottom rule. Open reports retain their complete native content. Folder and report disclosure controls keep visible focus and native keyboard behavior.

### Study Comparison and Lesson Reading

Study offers a 44px course selector within a 440px maximum width. **Alle hold — sammenlign** retains a contained 900px minimum-width comparison with 14px sticky headings and 15px content. Selecting one course reflows that course and week/month/student-time context into readable records. At 720px, course content occupies full width with 12px labels and 16px record padding; context precedes content.

Activity context uses a quiet rounded surface, a 19px heading, 15px metadata and a 22px outline calendar icon. One wrapping action strip consolidates the original top-level toolbars before the document, using 12px by 16px padding and 8px by 16px gaps. Native editors, save controls and links remain in the form. Desktop contents sits beside the reading column and becomes a disclosure above it at 720px. Paper surfaces lose inherited borders and fixed dimensions; media fits the available reading width.

### Timetable Lessons

Retain native clickable event geometry. Lectio places modules and lessons in em, so the timetable's vertical scale is one font size, `--lx-skema-em`: 11px when compact, 13px when comfortable; lesson text stays 13px. Lessons use a status fill (Lesson Grey, Changed Green or Cancelled Rose), a subject dot before the name, ink text, control corners and 3px by 6px padding (18px on the left for the dot). Subject names and leading values use weight 650. Week navigation and the extra actions share one row above the table; the week and day header rows use 6px vertical padding, and the table needs 720px before it scrolls horizontally. Selected events use a 2px red outline. Hover/focus can expand a lesson to reveal content while retaining its native minimum height.

### Popup Preferences

The popup repeats the same type, red action and fine-rule vocabulary. Preference rows use 15px vertical padding, 14px/600 labels and 12px helper text. Switches are 34px by 20px with 14px white thumbs inset 3px; checked state turns red and translates the thumb 14px. Both background and thumb use 140ms ease-out. Loading switches are disabled with opacity .5. Popup selects use small-select corners and 6px by 8px padding. Save errors appear as Deep Utility Red status text. A visible red focus ring and reduced-motion override apply here too.

The settings card in Lectio pages repeats these rows at 320px wide, and both surfaces share one stylesheet (`src/settings-ui.css`). Google Kalender settings sit under the calendar heading and account line in labelled groups: a 12px/600 muted label above a white box with a fine-rule border and 8px corners, 12px side padding and rules between 11px-padded rows. **Synkronisering** holds the last-sync status (13px/600, with 12px muted detail and Deep Utility Red for errors), a 36px bordered refresh button whose icon spins while syncing, and the automatic-fetch interval; **I kalenderen** holds what gets synced.

## Do's and Don'ts

### Do:

- **Do** reuse Source Sans 3, utility red and fine neutral rules across the shell, native pages and popup.
- **Do** preserve original Lectio ids, form hierarchy, events, uploads, links and timetable position geometry.
- **Do** keep selected navigation explicit and secondary native tabs visible.
- **Do** keep record titles, deadlines, statuses and native actions prominent, with secondary administrative fields disclosed on demand.
- **Do** use 15px record values, 19px titles and 12px field labels; preserve meaningful field labels when records stack.
- **Do** allow contained horizontal scrolling for comparison tables and the weekly timetable, and use a focused course for narrow study reading.
- **Do** preserve DOM reading order when moving native sections and keep page-local search state reversible.
- **Do** keep focus visible, respect reduced motion, and make disabling the redesign restore native presentation.

### Don't:

- **Don't** introduce gradients, decorative imagery or shipped raster art into this system.
- **Don't** rebuild academic data or native forms as decorative replicas; rebuilt views render real values from a reader and keep the original page one click away.
- **Don't** make persistent content panels float with shadows.
- **Don't** turn page-specific homepage weighting into a compulsory layout for every route.
- **Don't** wrap every record in a filled card or force the nine workspaces back into the fallback panel/table topology.
- **Don't** remove native controls or hide primary selection/action fields behind the extra-field toggle.

<!-- Merged from src/styles.css, src/pages.css, src/pages.jsx, src/content.jsx, src/popup.css and src/popup.jsx on 2026-10-02. The approved Compact identity is retained. Page rules follow the current source; final desktop/mobile captures were reviewed, and all eight listed material fixes were scored resolved. Fixture captures do not validate real Firefox login, postbacks or uploads; those remain user validation. Frontmatter catalogs intentional implemented values, not newly introduced CSS custom properties. No synthetic color ramps are normative. -->
