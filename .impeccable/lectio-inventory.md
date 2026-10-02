# Lectio integration inventory

Inspected in a user-provided student session on 2026-10-02. No session cookies, credentials, messages, grades or student records are saved in this repository.

| Surface | Observed implementation | Integration approach |
| --- | --- | --- |
| Forside | `.ls-dashboard`, island blocks, three layout columns | Reorder existing blocks into a clear daily workspace; retain source nodes |
| Skema | `.s2skema`, absolutely positioned `.s2brik` links, relative em geometry | Keep time placement, context menus, week selector and event links; style cells and lessons |
| Opgaver | `.ls-table-layout2.lf-grid`, filters and native checkboxes | Redesign table, filters and status colors; keep postbacks |
| Lektier | `.ls-table-layout5.lf-grid` | Shared reading/table system |
| Beskeder | `.ls-lectiofilepicker-container`, thread grid, folder tree | Two-pane inbox styling, original selection and actions |
| Dokumenter | File-picker container, search and document grid | Shared two-pane browser styling, original uploads and download links |
| Fravær | Tables, secondary Oversigt / Fraværsårsager navigation | Shared table styling and visible secondary tabs |
| Karakterer | Grade, remark and protocol grids; alternate mobile tables | Shared tables, preserve values and visible grade-report tabs |
| Studieplan | `.yeartable.timevertical`, secondary study destinations | Calendar styling, secondary navigation remains visible |
| Bøger | Native loan grid | Shared table system |
| Spørgeskema | Several questionnaire grids | Shared section and table system |
| SPS | UpdatePanel and grids | Shared styling; do not parse support records |
| Profil | Native `.ls-std-table-inputlist`, profile/payment/log tabs | Shared form styling; retain all controls |
| School homepage | Public Hovedmenu, directory and FindSkema links | Sidebar plus clear directory layouts |
| Public site | Homepage, school-list iframe, public information links | Public typography and directory styling, no student links fabricated |

## Technical constraints
- ASP.NET forms, names, ids, hidden fields and source event handlers must survive.
- Source navigation links discovered from `[id$="mastermenu"]` and `[id$="subnavigator_generic_tr"]`.
- Secondary `.ls-subnav2` / `.ls-subnav3` stays with page content.
- Content root `#contenttable`; main wrapper `[id$="outerContentFrameDiv"]`.
- Embedded dialogs and contextual menus depend on original DOM placement and display rules.
- Unknown routes receive the shared system without discarding content.
- Compact visual approval recorded. Firefox development ZIP packaged; adapter tests and synthetic visual verification complete. Real Firefox authenticated integration testing remains for the user.
