# Page-specific workspaces — version 0.2

Mode: Operate. User requests complete page layouts, reordering and responsive behavior for Forside, Opgaver, Beskeder, Fravær, Karakterer, Studieplan, Dokumenter, Bøger and Aktivitetsforside. The approved Compact identity stays; the generic native content layout is replaced.

THESIS: Give each student task its own information hierarchy, preserving original records and actions.
OWN-WORLD: Existing white/red Compact shell, Source Sans 3 and fine rules; content uses open task lists and readable documents.
STORY: Find the next action, inspect a record, then act through its original Lectio control.
FIRST VIEWPORT: Context and native filters lead; the primary workspace fills the remaining width. Related secondary information sits beside it on desktop and folds below on mobile.
FORM: Page-specific expansion of the user-approved Compact direction, seed 87765d5f. No new world or random choice.

| Page | Primary path and grouping | Small-screen structure |
| --- | --- | --- |
| Forside | Today first, assignments next, then homework/messages; administrative blocks below | Same DOM order, single column |
| Opgaver | Searchable assignment records; title, subject, deadline and status lead; other fields disclosed | Labelled vertical records; all original controls available |
| Beskeder | Folder navigation beside searchable thread list; subject and newest message lead | Collapsible folder navigation, labelled threads and visible actions |
| Fravær | Missing causes first; registration history disclosed separately | Cause records stack; history expandable |
| Karakterer | Subject results first; notes, remarks and certificate data separated | Labelled results; secondary reports expandable |
| Studieplan | Select a subject or compare all; keep week/time context | Subject selector with one course at a time; comparison scrolls locally |
| Dokumenter | Folder navigation beside searchable file records; filename and date lead | Collapsible folders, full-width file records and actions |
| Bøger | Loan title and return deadline lead; administrative fields optional | Book records with clear field labels |
| Aktivitetsforside | Activity context and actions above a readable lesson document; contents beside it | Contents folds above the document; editor and controls reflow |

Implementation uses reversible native-node relocation and table-grid reflow. Native IDs, field values, row/cell indices, hidden fields and event handlers survive. Filters apply only in memory and are clearly page-local. No generated academic statistics or fabricated live data. Synthetic fixtures must reflect observed desktop/mobile duplicate columns, nested island IDs, grouped headers, native folder panes and activity editor structure.

Verify nine pages at desktop and mobile, plus a narrow 320px check and keyboard/native-control tests. Real Firefox authenticated mutations remain user testing; inspection does not submit messages, grades, absence causes or files.
