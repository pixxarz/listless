# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Attendance reporting system for **โรงเรียนชานุมานวิทยาคม** (Chanuman Wittayakhom School). Teachers report students whose attendance is below 70% (`THRESHOLD`). Two front-end pages backed by a Google Apps Script + Google Sheet:

- **`index.html`** — data-entry form. Teacher fills subject + student rows, reviews, saves to the Sheet, and prints a Thai government-style A4 PDF.
- **`report.html`** — password-protected dashboard. Reads all submissions back, shows KPI cards + drill-down cards + a sortable/filterable master table, and prints two kinds of PDF.

**No build system.** Vanilla JS/CSS — no npm, bundler, or transpiler. Each page's CSS and JS are split into `css/` and `js/`, loaded via `<link>` / `<script src>`.

## Files

| File | Role |
|---|---|
| `index.html` | Teacher data-entry form markup |
| `report.html` | Dashboard markup |
| `css/index.css`, `css/report.css` | Per-page styles (incl. `@font-face` + PDF document styles) |
| `js/index.js`, `js/report.js` | Per-page scripts (all logic) |
| `js/fixes.js` | Data-fix engine + review UI (loaded **before** `report.js`; exposes `window.FIXES`) |
| `Code.gs` | Google Apps Script backend (lives in Apps Script console; copy kept in repo) |
| `docs/spec-code-gs-fixes.md` | How fix decisions are stored in the Sheet (`แก้ข้อมูล` sheet, wire format, deploy + test steps) |
| `fonts/*.woff2` | TH Sarabun New, 4 styles, self-hosted web font |
| `_headers` | Netlify cache rules (HTML no-cache, fonts immutable) |
| `logo.png` | School crest (used by `report.html`; `index.html` embeds it as base64) |

## Running Locally

Static files — any server works. Preview server is preconfigured (`.claude/launch.json`, name `attendance`, port 4124):

```bash
# open http://localhost:4124/index.html  or  /report.html
python -m http.server 4124 --directory "D:/attendance-report-chanu"
```

## Architecture

Each page = `*.html` (markup) + `css/*.css` (styles, incl. `@font-face` and the PDF document styles) + `js/*.js` (all logic). The two pages do **not** share CSS/JS files — see the `buildDoc` gotcha below.

### index.html — data-entry form

| Function | Purpose |
|---|---|
| `addRow()` | Builds a student table row entirely in JS (no HTML template); auto-calcs absent hrs + %; class `ม.[level]/[room]` input auto-advances after 1 digit |
| Thai date picker | `buildDateSelectors()` fills day/month/year selects (`#dateDay/#dateMonth/#dateYear`, years = current BE +1 → −3); `fillDayOptions()` rebuilds days per month and clamps an out-of-range day (31 Jan → Feb = 28/29); `syncDateValue()` writes **CE** `YYYY-MM-DD` into hidden `#dateInput`; `setDateToday()` (also on the "วันนี้" button and after `resetForm()`) reads `new Date()`, which is always CE regardless of the machine's calendar. See the BE/CE gotcha below — this replaced `<input type="date">` on purpose |
| Draft autosave | `saveDraftSoon()` (debounced 400 ms on any form input/change/add-row/delete-row) → `saveDraft()` stores `collectData()` + `savedAt` in `localStorage['chanu_attendance_draft_v1']`, but only when `draftHasContent()`. `askRestoreDraft()` runs after the intro popup closes and offers restore/discard; `restoreDraft()` refills every field, rebuilds rows via `addRow()` + `fillRowFromDraft()` (re-fires `input`/`change` so absent/% and the remark textarea behave as if typed), and sets `formDirty=true`. Cleared on verified save, on `doNewForm()`, and on discard. All `localStorage` access is wrapped in try/catch (private mode / quota) |
| `collectData()` | Reads form fields + table rows into a plain object |
| `validate(d)` | Returns error strings, marks invalid fields red; blocks seat-number duplicates and students at/above 70% |
| `markSeatDups()` | Real-time duplicate-seat highlighting while typing |
| save guard | `dataSaved` flag; the 2-step flow is **review modal → confirm popup → POST**; any edit re-locks via `markUnsaved()` |
| `buildDoc(d)` + `fitNames()` | Builds the official A4 document into `#printArea`; `fitNames()` shrinks long names via canvas measure |

- **Submit:** JSONP/`no-cors` POST to `SHEET_URL` with a `submissionId` (re-saving from the same open page overwrites; a new page appends). A 15s timeout + a follow-up `action=verify` GET (counts rows by `submissionId`) confirm the write actually landed, since `no-cors` fetch always resolves.
- **Logo:** base64-embedded in `src` (2 places: web banner + PDF header). Re-encode `logo.png` and replace both `data:image/png;base64,...`.

### report.html — dashboard

- **Password gate:** JSONP `doGet(?key=...)`; server validates before returning data.
- 🚨 **Every call retries — do not remove it.** `jsonp()` wraps `once()` and retries up to 6 times (backoff 1s, 2s, 4s, capped at 4s) on `network`/`timeout` only; auth failures fire once. Timeout per attempt is 45s (the sheet grew and `doGet` reads two sheets per call; 20s was no longer enough). Real-world failure: `ERR_NAME_NOT_RESOLVED` then `ERR_NETWORK_CHANGED` on the first two attempts, the third succeeding — Edge and Safari resolve DNS through their own resolver, so they stumble where Chrome does not. Without retry that reads as "permanently broken on Edge/Safari, fine on Chrome", which is exactly the bug this fixed. On timeout the callback is **replaced with a no-op instead of deleted**, so a late response is swallowed quietly rather than throwing `callback is not defined`. `js/fixes.js` has its own `jsonpGet()` with the same retry — **any new transport added anywhere must carry it too**.
- 🚨 **Do not try to proxy Apps Script. It was tried twice and both failed.** A Netlify `_redirects` 200-proxy reaches Google but gets `400 Bad Request` every time; so does a server-side `fetch`. Apps Script answers real browsers only. Calls therefore go straight to `script.google.com` and the retry loop is the mitigation — do not reintroduce `/gs`, a Netlify Function, or any other intermediary.
- ⚠️ **Opening the Apps Script URL directly in a browser is not a valid test** of whether the backend works. Direct navigation is handled differently from a page-initiated JSONP load; it can show "ไม่พบเพจ" while the site itself works fine. Diagnose from the failing machine's console, not from pasting the URL.
- **`normalizeRows()`** runs on every fetch (login + realtime poll) before anything else touches the data. One gate, so table/sort/filter/PDF/CSV are all fixed at once. Two passes per row:
  - `beToCE()` — a leading year ≥ 2400 in `วันที่กรอก`/`timestamp` is BE, convert to CE (see the BE/CE gotcha below).
  - `checkDateAgainstServer()` — `timestamp` is stamped server-side by Apps Script, so it is always trustworthy (verified: correct in all 174 rows while `วันที่กรอก` was wrong in 34). If `วันที่กรอก` is more than `DATE_MAX_DIFF_DAYS` (365) away from it, the teacher's date is wrong for some other reason (machine clock off by years, wrong year picked). Overwrite it with the server date, keep the original in `_dateRaw`, flag `_dateFixed`. 365 is deliberate: teachers legitimately backdate by weeks — a form covering 15 Jun–7 Jul is filed in Aug — so anything under a year must not be touched. `dateFixMark()` renders the ⚠ (`.date-fixed`, hover title shows the original) in both the main table and the report-list popup; `buildReportGroups()` carries the flag up as `dateFixed`/`dateRaw`.
- **`allRows`** holds every Sheet row (one per student). Grouping helpers rebuild higher-level views:
  - `buildStudentGroups` (per student, with subjects sub-rows + overall % from total present/total periods), `buildReportGroups` (per submission timestamp), `buildTeacherGroups`, `buildSubjectGroups`.
- **KPI cards** open detail modals via `openCardModal(type)`; the student card (`renderStudentTable`) has its own filter bar + expandable rows. It uses **virtual scrolling** — `renderWindow()` renders only the ~visible rows plus top/bottom spacer `<tr>`s (height = off-screen rows × measured `ROW_H`), recomputed on scroll via rAF; expanded-row sub-table heights are cached in `subH`. Sub-tables are also **lazy** (built only when a row is expanded). Both shrink the popup DOM (137+ students × nested per-subject tables would be thousands of nodes). The other card renders (`renderReportTable`/`renderTeacherTable`/`renderSubjectCardTable`) still build all rows at once — only the student card was hot enough to virtualize.
- **Data fixes (`js/fixes.js`)** — teachers type the same person/room/subject differently, so counts split. The engine proposes, a human always decides, and decisions overlay the data at display time (`FIXES.apply()` runs inside `normalizeRows`, so cards/charts/table/CSV all move together). `restore()` runs first on every apply, making it idempotent and making undo instant.
  - **A confirmed fix is written into the `รายงาน` sheet for real** (v1.4.0). The sheet is what the school actually works from downstream, so a display-only overlay was not enough. 🚨 The write **only ever changes cell values** — `applyMainEdits` in `Code.gs` contains no `deleteRow`/`insertRow` and no whole-sheet `setValues`; row count, row order and every untouched column stay exactly as they were. Three guards per cell: the column must be in the `MAIN_EDITABLE` whitelist (6 text columns — never `timestamp`, `submission_id`, or any number), the row must be ≥2 and inside the real range, and **the cell's current value must still equal the `from` the browser sent**. That last one is what makes it safe to fire against a sheet that may have moved under us. The overlay stays on top of all this, because it is what catches the *next* form a teacher fills in with the same typo.
  - **Originals go to a separate `ค่าเดิม` sheet, never into `รายงาน`.** Adding a 23rd column to `รายงาน` would break what the teachers do with it downstream — that was an explicit product decision, not an implementation detail. `undoMainEdits` replays that sheet backwards to restore, skipping any cell a human has since hand-edited, and stamps `สถานะ = ย้อนแล้ว` rather than deleting the log.
  - **`diffHTML()` highlights the differing characters between two options** (v1.4.1) and is the card's whole reason for working. The real cases differ by one character — `พิมพะวงศ์` vs `พิมพะวงศ` is one ไม้ทัณฑฆาต — and a teacher cannot see that unaided, so they were picking blind. It aligns the two strings by LCS, marks what this option has that the other lacks, and drops a `.fx-df-gap` tick where the other option has something this one is *missing* (without it the shorter option looks clean, as if nothing were wrong). Thai vowels/tone marks can't stand alone, so a differing mark drags its base consonant into the highlight — otherwise it renders detached and unreadable. Never write option text with plain `esc()` again.
  - **Every button that touches data goes through `confirmBox` first** — it names the value, the rows and the cell count before anything is written. Decided items live in their own **แก้ไปแล้ว** tab (not appended to the bottom of the pending list, which is where they used to get lost).
  - **Decisions live in the Sheet** (`แก้ข้อมูล` sheet, via `action=fixes` / `action=savefix`), so every machine sees the same fixes. `report.js` calls `FIXES.connect({url,key,fixes})` on login *before* the first `normalizeRows`, and passes `data.fixes` into `normalizeRows(rows, fixes)` on every poll. Three layers inside the store, because the write leg is `no-cors` and cannot read its own response: `serverList` (what is in the Sheet) + `queue` (pressed but not yet confirmed, mirrored to `localStorage`) = `decisions` (what the screen shows, so a press is instant). After POSTing, it re-reads `action=fixes` and compares **id + signature** before clearing the queue, retrying twice (1.5 s, 3 s) — same send-then-verify shape as the entry form's `action=verify`, and for the same reason. Failures surface as a red bar with a retry button; they are never silently swallowed. `flush()` iterates the live queue, not a snapshot, because one press in manual mode can enqueue both a name and a room fix.
  - If `doGet` comes back with **no `fixes` field at all**, the deployed Apps Script is an older version — the panel says so outright and keeps decisions queued locally instead of pretending they saved. Editing `Code.gs` in the repo (or pressing Run in the editor) changes nothing until **Manage deployments → New version**.
  - Matching: strip prefixes stuck into the name field (`นางสาวฉัตรชนก บัวศรี` vs `ฉัตรชนก บัวศรี`) → fold same-sounding Thai letters (ณ/น, ด/ต, ศ/ษ/ส, tone marks) → edit distance ≤2, but only within the same grade level **and** with a matching surname **and** a near-identical first name (this triple guard is what stops siblings like `ธนภัทร`/`ศศิธร กุระจินดา` from being proposed).
  - Rooms: a student reported by several teachers gives a majority vote; the minority entry is the typo. `detectTicketRoomIssues()` escalates when one submission has ≥2 such students — that teacher mis-keyed the whole form.
  - Teachers are compared as prefix+name combined, because the report counts them that way — `นางสุมาลี` vs `นายสุมาลี` is the real duplicate, and `apply()` splits the chosen value back into the two Sheet columns.
  - 🚨 Subjects key off the **code**, and a mismatch is only proposed when a code fails `CODE_OK` (Thai letter + 5 digits). Never propose by name or by edit distance: digits 2-3 of a Thai course code encode the grade, so `อ23101` (M.3) and `อ33101` (M.6) are legitimately different subjects that share the name `ภาษาอังกฤษ 5`. Merging those corrupts the data.
  - Manual mode also flags entries the pair-matcher structurally cannot see, because they have nothing to pair with: a prefix stuck in the name field, a missing surname, digits/odd characters in a name, a malformed room (`ม2/3`), a malformed subject code. These are marked `suspect` (amber), detector hits are `pending` (red), already-decided are `decided` (green), and the list sorts pending → suspect → normal → decided. The **เฉพาะที่ต้องดู** toggle filters to the first two.
  - Both sticky bars live inside `.rm-scroll`: `.fx-modes` pins at `top:0`, the second bar at `top:var(--fxtop)` which `syncStickyTop()` measures from the real height via ResizeObserver — the mode bar wraps to two lines on narrow screens, so a hardcoded offset drifts (it did, by 10px, before this).
  - The summary chips in the detector tab are filter buttons (`autoFilter`); without them you scroll past every name card to reach the subject cards.
  - Two tabs: **ระบบตรวจพบ** (detector output) and **แก้เอง** (manual). The manual tab is not optional polish — the detector cannot see a name misspelt beyond edit distance 2 (`อิซเบลล่า เมคเคนซี` vs `อิสเบลลา แมคเคนซี่`), nor a wrong room reported on a single form with nothing to vote against it. Manual mode lists every student/teacher/subject with a search box: tick 2+ to merge, tick 1 to correct that entry's name and/or room outright. Manual decisions share the same store and appear in the decided list, so they can be undone the same way. A single-selection edit only writes the fields that actually changed.
  - Decision list is rendered from the stored decisions, not from detector output — once data is fixed the detector no longer sees the problem, so the "already decided" cards would vanish and undo would be impossible.
- **Multi-level sort + column pinning** (all tables): state is `{pins:[{key,dir}], active:{key,dir}|null}`. `sortChain` flattens pins+active; `applyMultiSort` sorts down the chain (num/date/Thai-string). `onSortClick` / `onPinClick` mutate state; `sortHeadHTML` renders the 📌 pin + order superscript; `bindSortHeads` wires events; `paintPinned` tints the whole pinned column amber (scoped to the outer table, skips nested sub-tables).
- **Two PDFs share `#printArea` + `window.print()`:**
  - `openPdfForReport(ts)` → `buildDoc()` — single teacher/subject form (groups rows by timestamp).
  - `openStudentListPdf('all'|'filtered')` → `buildStudentListDoc()` — "บัญชีรายชื่อ" across all subjects, grouped by grade level, no signature block. `buildStuFilterDesc()` writes the scope sentence.
- **Realtime:** polling re-fetches and toasts when new submissions appear.

### Code.gs — Google Apps Script backend

Web App bound to a spreadsheet with a **"รายงาน"** sheet (22 columns: 21 data fields + `submission_id`).

| Entry | Purpose |
|---|---|
| `doGet` | `action=verify` → count rows by `sid` (no password, no data). Else check `key` against `REPORT_PASSWORD` (Script Property) / `DEFAULT_REPORT_PASSWORD`, then `action=fixes` → `readFixes()`, or return `{rows, fixes}` together (one round-trip for the dashboard). Replies as **JSONP** (avoids CORS). |
| `doPost` | `action=savefix` → `saveFix(data.fix)`; `action=applymain` / `undomain` → edit the `รายงาน` sheet (all password-checked); else `saveToSheet(JSON body)` |
| `saveFix` / `readFixes` | Read-write the `แก้ข้อมูล` sheet (8 cols). Same-`id` write overwrites; `remove:true` deletes. `LockService` serializes writers. |
| `applyMainEdits` / `undoMainEdits` | Cell-level edits to `รายงาน` + the `ค่าเดิม` backup sheet (9 cols). Whitelist + row-range + value-match guards; **never** deletes or adds rows. Same `LockService` as `saveToSheet`. |
| `saveToSheet` | `LockService` (serializes concurrent writers); `removeRowsBySubmissionId` then batch-write = **same submissionId overwrites, new one appends**; aborts if `students` is empty (never deletes old data with nothing to write back). |

`readSheet` reads by a **fixed column order** (not Sheet headers) so a stale header row can't break mapping. Dates → ISO strings.

## Data Flow

```
index.html  --POST no-cors JSON-->  Code.gs doPost --> saveToSheet --> "รายงาน" sheet
index.html  --GET verify (JSONP)-->  Code.gs doGet  --> countBySubmissionId   (confirm save)
report.html --GET key=pass (JSONP)-> Code.gs doGet  --> readSheet + readFixes --> allRows + FIXES  (dashboard)
report.html --POST savefix ------->  Code.gs doPost --> saveFix   --> "แก้ข้อมูล" sheet
report.html --GET action=fixes ---> Code.gs doGet  --> readFixes                 (confirm the fix landed)
report.html --POST applymain ----->  Code.gs doPost --> applyMainEdits --> cells in "รายงาน" + "ค่าเดิม" backup
report.html --POST undomain ------>  Code.gs doPost --> undoMainEdits  --> restore from "ค่าเดิม"
report.html --GET key=pass (JSONP)-> Code.gs doGet  --> readSheet                (confirm the cells changed)
```

## Key Constants

- `index.html`: `THRESHOLD = 70`, `MIN_DOC_ROWS = 10`, `PREFIX_OPTIONS`, `REMARK_OPTIONS`, `DRAFT_KEY = 'chanu_attendance_draft_v1'`
- `report.html`: `SHEET_URL`, `THRESHOLD = 70`, `MIN_DOC_ROWS = 10`, `COL` (Sheet column-name map)
- `js/fixes.js`: `QUEUE_KEY = 'chanu_data_fixes_queue_v1'` (unsent decisions), `OLD_KEY = 'chanu_data_fixes_v1'` (v1.2.0's local-only store — migrated into the queue on first load, then removed)
- `Code.gs`: `FIX_SHEET = 'แก้ข้อมูล'`, `FIX_HEADERS`, `BACKUP_SHEET = 'ค่าเดิม'`, `BACKUP_HEADERS`, `MAIN_EDITABLE` (the only 6 columns of `รายงาน` a fix may ever write to)
- `Code.gs`: `DEFAULT_REPORT_PASSWORD` (override with Script Property `REPORT_PASSWORD`)

## Fonts (self-hosted)

`fonts/THSarabunNew*.woff2` (regular/bold/italic/bolditalic) declared via `@font-face` (family `'TH Sarabun New'`) at the top of `css/index.css` and `css/report.css`. The font URL is `../fonts/...` because the CSS now lives in `css/` (this was rewritten during the CSS/JS split — keep it if you move files). This makes the official document render identically on machines without the font installed (the original cross-device bug). `.doc-paper` keeps `font-family:'TH Sarabun New',...` — `@font-face` makes the browser use the web font over any local copy. Converted from `.ttf` with Python `fontTools` (`f.flavor='woff2'`).

## Deployment

- **Frontend:** Netlify — auto-deploys from `pixxarz/listless` (`origin`) on push to `main`. A personal backup repo `sirawitphaopha/listless70` (`mine`, private) holds the same history.
- **Backend:** edit `Code.gs` in Apps Script → **Manage deployments → New version** (the `SHEET_URL` does not change between versions). Repo copy is reference only — deploying it is the friend's job.
- **`_headers`** is read by Netlify automatically: HTML `max-age=0, must-revalidate` (teachers always get the latest), `fonts/*` `max-age=1yr, immutable`.

## Conventions & Gotchas

- **Timezone:** Sheet datetimes are UTC; always `+7*3600*1000` before formatting Thai dates (`fmtDate`/`thaiDate`/`fmtTime` all do this — a recurring bug source).
- **`no-cors`:** submit fetch always resolves; never trust it for success — use the `verify` round-trip. Both write paths do this: the entry form via `action=verify`, the fix panel via re-reading `action=fixes`.
- **Never widen `MAIN_EDITABLE`, and never let a fix delete a row.** The `รายงาน` sheet is the school's working document, not a cache — a lost row is lost evidence. If a future feature needs to change a different column, add it to the whitelist deliberately and extend `test-mainsheet.js` in the same commit; the suite asserts row count, row order, header row, and the untouched columns of an edited row.
- **`_row` is the whole reason the write is safe.** `readSheet` attaches the real sheet row number to every row so the browser can name the exact cell; it is sent back paired with the value it expects to find there. Drop either half and the write becomes a guess.
- **`savefix` payload nests the record under `fix`** — the envelope and the record both have a field called `action` (`savefix` outside, `merge`/`ignore` inside). Reading the record straight off the envelope writes the literal string `savefix` into the sheet's `การกระทำ` column for every row. Subject values are objects (`{name, code}`) and go through `fixValueOut_`/`fixValueIn_` as JSON text — writing them raw stores `[object Object]`.
- **`window.print()` only** — there is intentionally no client PDF library (pdfmake/html2pdf were removed). Single button "🖨 พิมพ์ / บันทึก PDF".
- **Print color:** `@media print` sets `print-color-adjust:exact` on `.doc-paper *` so header/grade band colors survive printing.
- **Mobile table:** `.table-wrap` gets `overflow-x:auto` only under `@media (max-width:720px)` — doing it globally would turn `overflow-y` to `auto` and break the sticky form header on desktop.
- **`buildDoc`/`fitNames`/`thaiDate` are NOT shared** — `js/index.js` and `js/report.js` each keep their own copy and they genuinely differ: `index` embeds the logo as base64 + uses form-shaped data; `report` uses `logo.png` + grouped data + the +7 timezone fix. They were checked during the split and deliberately left separate — do not try to merge them into a shared file.
- **BE vs CE years (the 3112 bug):** the Sheet stores `วันที่กรอก` as **CE** and every display path adds 543. Some teachers' machines are set to the Buddhist calendar, and `<input type="date">` there emitted **BE** (`2569-08-08`), which then got +543 → **3112** on screen, in the sort order, in the printed A4 document, and in the CSV. 34 of 174 rows in the Sheet are still stored that way (4 teachers, 5 submissions) — the Sheet was left untouched. Defence is three-deep: (1) `index.html` no longer uses `<input type="date">` at all — the Thai day/month/year selects always write CE; (2) `beToCE()` in `js/index.js` still guards `collectData()`; (3) `normalizeRows()` in `js/report.js` fixes anything already stored. **Never re-introduce a native date input here**, and keep the "year ≥ 2400 means BE" rule if you touch either helper.
- **Version label** — shown in two places, kept in sync by hand: `index.html` footer (`.doc-version`) and `report.html` (`.ver-badge`, fixed bottom-left, above the password gate so it can be read without logging in, hidden in `@media print`). It exists so the school can confirm Netlify actually deployed — update the version **and the release date** in both files whenever you push a user-visible change. (Earlier versions of this project had no version numbering; that rule no longer applies.)
- **UI text contains no `?` character** (project convention) and uses Thai with English in parentheses for technical terms.
- **Popup paint-freeze on some machines (environmental, NOT a code bug):** a few Chromium setups — seen on an AMD-GPU + Windows 11 laptop with stale drivers — freeze ~20s when opening a large popup. Telltales: only Chrome/Edge (Firefox/Opera fine), main thread stays responsive (JS/longtask measured tiny), freeze disappears with DevTools open, not reproducible on a clean machine / the deployed site on another PC, and it persists through every code-level mitigation (D3D11/D3D9/WARP backends, disabling HW accel, incognito, virtual scroll). It is a browser/GPU-driver compositor issue. The virtual-scroll + lazy sub-tables above are kept as a DOM-size mitigation, but **do not keep chasing this freeze in the code** — point the user to update Windows/GPU drivers or use Firefox.
