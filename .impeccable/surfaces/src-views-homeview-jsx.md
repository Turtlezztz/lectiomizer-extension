---
version: 1
slug: "src-views-homeview-jsx"
primary_target: "src/views/HomeView.jsx"
related_targets: ["src/readers/home.js"]
---

# Forside (home)

Mode: Operate. Scope: `forside.aspx`, rebuilt as a data-driven view (`src/readers/home.js`, `src/views/HomeView.jsx`) inside the approved Compact world. Audience: students opening Lectio to know what's next.

User answers (2026-10-02): today first; admin blocks compact below the daily content; avoid empty space, a greeting/hero, and anything hidden behind clicks. Surface round: seed 56ddb12a dealt "Today | Inbox" (lead), "Day timeline + task rail", "Needs you"; the user locked "Needs you". Code-led (no image generation).

Direction: next-lesson panel in the lesson's subject fill (28px subject, Nu/Næste pill, time range and time left, elapsed red line) leading one urgency-ranked "Brug for dig" list (Kræver handling, Overskredet, I dag, I morgen, Inden for en uge, Senere); messages with unread count, school notices in full, remaining dashboard blocks as compact columns. Side column: today with times, coming days, classes/groups. At ≤900px: panel, schedule, list, then the rest. Memorable moment: the elapsed line filling while a lesson runs.

Data truth: dashboard islands share one shape (header link + count, rows of info/name/time cells, `attention` on urgent times, prio classes); lesson times come from each brik's `data-tooltip`. Messages carry only an unread count, not per-row state. Unknown islands render generically.

Finish: inline substituted review → fix (3 items) → verdict ship. Captures in `.impeccable/review/home/`.

Open: questionnaires/consultations stay compact rather than ranked; revisit if the user wants unanswered questionnaires in "Brug for dig".
