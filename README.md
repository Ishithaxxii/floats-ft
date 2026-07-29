# seasnap-ft

## Prerequisites

- Python 3.11+ or compatible Python 3 version
- Node.js 18+ and npm (avoid Node 22 — known compatibility issue with `react-plotly.js`; use 18 or 20 LTS)
- LibreOffice (system package, not pip) — required to convert the autofilled data requisition form to PDF. Must be reachable as `soffice` on PATH.
- Git (optional)

## Setup

1. Create and activate a Python virtual environment in the repository root:

```bash
python3 -m venv venv
source venv/bin/activate
```

2. Install backend dependencies:

```bash
pip install -r backend/requirements.txt
```

3. Install LibreOffice:

```bash
sudo apt install libreoffice
```

4. Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

5. Create `backend/.env` (see Environment Variables below).

6. Create `frontend/.env` (see Environment Variables below).

## Run

### Backend

From the repository root with the Python virtual environment active:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

From the `frontend` directory:

```bash
cd frontend
npm run dev
```

## Environment Variables

### `backend/.env`

- `SEASNAP_API_KEY` — shared secret checked on every backend request. Must exactly match `VITE_API_KEY` in `frontend/.env`.
- `SEASNAP_EEZ_GEOJSON` — path to the EEZ boundary geojson (same file the frontend uses to draw the boundary line). Backend won't enforce EEZ restriction without this pointing to a valid file.
- `SEASNAP_REQUISITION_TEMPLATE` — path to `Data_Requisition_Template.docx`, the fillable form template used for EEZ data requisitions.
- `SEASNAP_SMTP_HOST`, `SEASNAP_SMTP_PORT`, `SEASNAP_SMTP_USER`, `SEASNAP_SMTP_PASS`, `SEASNAP_TEAM_EMAIL` — optional, for emailing requisition PDFs. If unset, the app still works fully; only automatic email delivery is skipped. `SEASNAP_SMTP_PASS` should be a Gmail App Password, not your login password.

Per-instrument data/metadata folder paths (`SEASNAP_CTD_DATA_FOLDER`, etc.) are not set via `.env` — see Instrument Configuration below.

### `frontend/.env`

- `VITE_API_KEY` — must exactly match `SEASNAP_API_KEY` in `backend/.env`, or every request fails with `401`. Vite bakes this in at server start — after editing, fully stop and restart `npm run dev` (a hot-reload won't pick it up).

## Instrument Configuration

CTD/XBT/XCTD data folders, metadata folders, CSV column mappings, and output
columns are all defined in `backend/main.py` under `INSTRUMENT_CONFIG`. Each
instrument's `data_folder` and `meta_folder` fall back to
`SEASNAP_<TYPE>_DATA_FOLDER` / `SEASNAP_<TYPE>_META_FOLDER` environment
variables if set, otherwise default to hardcoded paths in that dict (e.g.
`/home/ishitha/CTD`). To point the backend at data on a different machine,
either set the corresponding env vars or edit `INSTRUMENT_CONFIG` directly.

## Notes

- In `backend/main.py`, the default instrument type for `/load-meta` and `/stations` is defined on lines 421 and 442.
  Change the `type` query parameter to one of: `ctd`, `xbt`, or `xctd`.

- By default, the backend expects data under the configured paths in `backend/main.py`.

- EEZ-restricted stations are enforced server-side: `/profile` and `/spatial-profile` return `403` for restricted stations rather than the data itself. On startup, the backend logs `[eez] Loaded N EEZ loop(s)...` — if it instead warns the file wasn't found, `SEASNAP_EEZ_GEOJSON` is misconfigured and restriction won't be enforced.

- Submitting a data requisition autofills `Data_Requisition_Template.docx` and converts it to PDF via LibreOffice. If `SEASNAP_REQUISITION_TEMPLATE` or LibreOffice isn't set up correctly, the backend logs `[requisition] Form autofill/PDF generation failed` but the request still completes.