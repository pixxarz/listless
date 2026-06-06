# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Single-page attendance reporting form for **โรงเรียนชานุมานวิทยาคม** (Chanuman Wittayakhom School). Teachers fill in subject info and list students with attendance below 70%, then save to Google Sheet and export a Thai government-style A4 PDF.

**No build system.** Everything is vanilla JS in one `index.html` file. There is no npm, no bundler, no transpiler.

## Running Locally

Serve `index.html` directly — any static file server works:

```bash
# Using the Claude Code preview server (already configured):
# Just open http://localhost:4124 — the preview server points to D:\attendance-report-chanu\

# Or with Python:
python -m http.server 4124 --directory "D:/attendance-report-chanu"
```

## Architecture

### index.html (single file, ~1.3MB)

All CSS, JS, and the school logo (base64-embedded) live in one file. Key JS sections:

| Function | Purpose |
|---|---|
| `collectData()` | Reads all form fields + student table rows into a plain object |
| `validate(d)` | Returns array of error strings; marks invalid fields red |
| `setSaved(v)` / `markUnsaved()` | Guards the PDF export button — must save before exporting; any form `input`/`change` event resets saved state |
| `buildDoc(d)` | Builds the official A4 HTML document injected into `#printArea` |
| `addRow()` | Dynamically creates a student table row with auto-calculated absent hours and % |

**Two-step save guard:** `dataSaved` flag starts `false`. The PDF export button is disabled until `setSaved(true)` is called after a successful save. Any subsequent edit calls `markUnsaved()` which disables the button again.

**PDF generation:** Uses `window.print()` on `#printArea` (a styled div inside `.pdf-backdrop` modal). Print CSS hides everything except `#printArea` and uses `display: table-header-group` so thead repeats on every page.

**Student table rows** are created entirely in JS via `addRow()` — no HTML template. The `ม.[level]/[room]` class input auto-advances to the room field after 1 digit.

**Logo:** School crest is base64-encoded directly into `src` attributes (2 occurrences: web banner + PDF header). To update the logo, re-encode `logo.png` to base64 and replace both `src="data:image/png;base64,..."` values.

### Code.gs (Google Apps Script backend)

Deployed as a Web App at the URL hardcoded in `index.html` (`SHEET_URL`). Receives `POST` with `Content-Type: text/plain` and `mode: 'no-cors'` from the Netlify-hosted frontend. Writes one row per student to the "รายงาน" sheet of the bound spreadsheet.

**Important:** Because the frontend uses `mode: 'no-cors'`, the fetch always resolves (never rejects) regardless of server response. The frontend shows "saved" toast on resolve, not on confirmed server success.

## Key Constants (top of `<script>` in index.html)

```js
var THRESHOLD = 70;       // attendance percentage threshold
var MIN_DOC_ROWS = 10;    // minimum blank rows in exported PDF
var PREFIX_OPTIONS = ['ด.ช.','ด.ญ.','นาย','น.ส.']; // student name prefixes
var REMARK_OPTIONS = ['-- เลือก --','ขาดเรียนนาน','อื่นๆ (กรอกเอง)'];
```

## Deployment

- **Frontend:** Netlify (static, auto-deploys from `pixxarz/listless` GitHub repo on push to `main`)
- **Backend:** Google Apps Script — after editing `Code.gs`, must re-deploy in Apps Script console (Manage Deployments → new version) to take effect. The `SHEET_URL` in `index.html` does **not** change between versions.

## CSS Architecture

All styles are `<style>` in `<head>`. Two separate visual contexts share the same file:

1. **Web form** — uses CSS custom properties (`--purple`, `--pink`, etc.), responsive grid header, purple table headers via `#studentTable thead th` (scoped to avoid leaking into PDF)
2. **PDF document** (`.doc-paper`, `.od-*`) — uses `font-family: 'TH Sarabun New'`, `table-layout: fixed` on `.od-table`, and `position: static` in print media. Global `table {}` rules must NOT set `min-width` — it must only be on `#studentTable` to avoid breaking PDF table layout.
