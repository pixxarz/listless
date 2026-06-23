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
| `Code.gs` | Google Apps Script backend (lives in Apps Script console; copy kept in repo) |
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
| `collectData()` | Reads form fields + table rows into a plain object |
| `validate(d)` | Returns error strings, marks invalid fields red; blocks seat-number duplicates and students at/above 70% |
| `markSeatDups()` | Real-time duplicate-seat highlighting while typing |
| save guard | `dataSaved` flag; the 2-step flow is **review modal → confirm popup → POST**; any edit re-locks via `markUnsaved()` |
| `buildDoc(d)` + `fitNames()` | Builds the official A4 document into `#printArea`; `fitNames()` shrinks long names via canvas measure |

- **Submit:** JSONP/`no-cors` POST to `SHEET_URL` with a `submissionId` (re-saving from the same open page overwrites; a new page appends). A 15s timeout + a follow-up `action=verify` GET (counts rows by `submissionId`) confirm the write actually landed, since `no-cors` fetch always resolves.
- **Logo:** base64-embedded in `src` (2 places: web banner + PDF header). Re-encode `logo.png` and replace both `data:image/png;base64,...`.

### report.html — dashboard

- **Password gate:** JSONP `doGet(?key=...)`; server validates before returning data.
- **`allRows`** holds every Sheet row (one per student). Grouping helpers rebuild higher-level views:
  - `buildStudentGroups` (per student, with subjects sub-rows + overall % from total present/total periods), `buildReportGroups` (per submission timestamp), `buildTeacherGroups`, `buildSubjectGroups`.
- **KPI cards** open detail modals via `openCardModal(type)`; the student card (`renderStudentTable`) has its own filter bar + expandable rows.
- **Multi-level sort + column pinning** (all tables): state is `{pins:[{key,dir}], active:{key,dir}|null}`. `sortChain` flattens pins+active; `applyMultiSort` sorts down the chain (num/date/Thai-string). `onSortClick` / `onPinClick` mutate state; `sortHeadHTML` renders the 📌 pin + order superscript; `bindSortHeads` wires events; `paintPinned` tints the whole pinned column amber (scoped to the outer table, skips nested sub-tables).
- **Two PDFs share `#printArea` + `window.print()`:**
  - `openPdfForReport(ts)` → `buildDoc()` — single teacher/subject form (groups rows by timestamp).
  - `openStudentListPdf('all'|'filtered')` → `buildStudentListDoc()` — "บัญชีรายชื่อ" across all subjects, grouped by grade level, no signature block. `buildStuFilterDesc()` writes the scope sentence.
- **Realtime:** polling re-fetches and toasts when new submissions appear.

### Code.gs — Google Apps Script backend

Web App bound to a spreadsheet with a **"รายงาน"** sheet (22 columns: 21 data fields + `submission_id`).

| Entry | Purpose |
|---|---|
| `doGet` | `action=verify` → count rows by `sid` (no password, no data). Else check `key` against `REPORT_PASSWORD` (Script Property) / `DEFAULT_REPORT_PASSWORD`, then return all rows. Replies as **JSONP** (avoids CORS). |
| `doPost` | `saveToSheet(JSON body)` |
| `saveToSheet` | `LockService` (serializes concurrent writers); `removeRowsBySubmissionId` then batch-write = **same submissionId overwrites, new one appends**; aborts if `students` is empty (never deletes old data with nothing to write back). |

`readSheet` reads by a **fixed column order** (not Sheet headers) so a stale header row can't break mapping. Dates → ISO strings.

## Data Flow

```
index.html  --POST no-cors JSON-->  Code.gs doPost --> saveToSheet --> "รายงาน" sheet
index.html  --GET verify (JSONP)-->  Code.gs doGet  --> countBySubmissionId   (confirm save)
report.html --GET key=pass (JSONP)-> Code.gs doGet  --> readSheet --> allRows  (dashboard)
```

## Key Constants

- `index.html`: `THRESHOLD = 70`, `MIN_DOC_ROWS = 10`, `PREFIX_OPTIONS`, `REMARK_OPTIONS`
- `report.html`: `SHEET_URL`, `THRESHOLD = 70`, `MIN_DOC_ROWS = 10`, `COL` (Sheet column-name map)
- `Code.gs`: `DEFAULT_REPORT_PASSWORD` (override with Script Property `REPORT_PASSWORD`)

## Fonts (self-hosted)

`fonts/THSarabunNew*.woff2` (regular/bold/italic/bolditalic) declared via `@font-face` (family `'TH Sarabun New'`) at the top of `css/index.css` and `css/report.css`. The font URL is `../fonts/...` because the CSS now lives in `css/` (this was rewritten during the CSS/JS split — keep it if you move files). This makes the official document render identically on machines without the font installed (the original cross-device bug). `.doc-paper` keeps `font-family:'TH Sarabun New',...` — `@font-face` makes the browser use the web font over any local copy. Converted from `.ttf` with Python `fontTools` (`f.flavor='woff2'`).

## Deployment

- **Frontend:** Netlify — auto-deploys from `pixxarz/listless` (`origin`) on push to `main`. A personal backup repo `sirawitphaopha/listless70` (`mine`, private) holds the same history.
- **Backend:** edit `Code.gs` in Apps Script → **Manage deployments → New version** (the `SHEET_URL` does not change between versions). Repo copy is reference only — deploying it is the friend's job.
- **`_headers`** is read by Netlify automatically: HTML `max-age=0, must-revalidate` (teachers always get the latest), `fonts/*` `max-age=1yr, immutable`.

## Conventions & Gotchas

- **Timezone:** Sheet datetimes are UTC; always `+7*3600*1000` before formatting Thai dates (`fmtDate`/`thaiDate`/`fmtTime` all do this — a recurring bug source).
- **`no-cors`:** submit fetch always resolves; never trust it for success — use the `verify` round-trip.
- **`window.print()` only** — there is intentionally no client PDF library (pdfmake/html2pdf were removed). Single button "🖨 พิมพ์ / บันทึก PDF".
- **Print color:** `@media print` sets `print-color-adjust:exact` on `.doc-paper *` so header/grade band colors survive printing.
- **Mobile table:** `.table-wrap` gets `overflow-x:auto` only under `@media (max-width:720px)` — doing it globally would turn `overflow-y` to `auto` and break the sticky form header on desktop.
- **`buildDoc`/`fitNames`/`thaiDate` are NOT shared** — `js/index.js` and `js/report.js` each keep their own copy and they genuinely differ: `index` embeds the logo as base64 + uses form-shaped data; `report` uses `logo.png` + grouped data + the +7 timezone fix. They were checked during the split and deliberately left separate — do not try to merge them into a shared file.
- **No version numbering** — do not bump or invent versions.
- **UI text contains no `?` character** (project convention) and uses Thai with English in parentheses for technical terms.
