# seasnap-ft

## Prerequisites

- Python 3.11+ or compatible Python 3 version
- Node.js 18+ and npm
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

3. Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

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

## Notes

- The backend uses environment variables for optional data paths:
  - `SEASNAP_CTD_DATA_FOLDER`
  - `SEASNAP_CTD_META_FOLDER`
  - `SEASNAP_XBT_DATA_FOLDER`
  - `SEASNAP_XBT_META_FOLDER`
  - `SEASNAP_XCTD_DATA_FOLDER`
  - `SEASNAP_XCTD_META_FOLDER`
  - `SEASNAP_CTD_CACHE_DB`

- In `backend/main.py`, the default instrument type for `/load-meta` and `/stations` is defined on lines 421 and 442.
  Change the `type` query parameter to one of: `ctd`, `xbt`, or `xctd`.

- By default, the backend expects data under the configured paths in `backend/main.py`.
