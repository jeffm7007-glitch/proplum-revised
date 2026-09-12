# ProPlum Network — Component Architecture

## Component A: Field Job Ingestion Layer ✅ LIVE
**File:** `functions/api/upload-ticket.js`, `functions/api/upload.js`, `functions/api/jobs.js`, `functions/api/job-status/[id].js`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/upload-ticket` | POST | Create job stub, return upload instructions |
| `/api/upload` | POST | Accept multipart photo upload, store in R2 |
| `/api/jobs` | POST | Submit job details (cost, notes, address) |
| `/api/job-status/:id` | GET | Query job + media + audit status |

**Storage:**
- Raw photos → R2 bucket `proplum-cache` at `raw/{job_id}/{role}.jpg`
- Job data → D1 database `proplum-d1`

---

## Component B: R2 Processing Pipeline ✅ LIVE
**File:** `functions/api/process/[[job_id]].js`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/process/:job_id` | POST | Process uploaded photos, flag for review |

**What it does:**
1. Reads raw images from R2
2. Creates "clean" copy (EXIF strip placeholder)
3. Generates thumbnail variant
4. Heuristic PII/safety scan
5. Writes processed images to `processed/{job_id}/`
6. Creates audit record
7. Updates job status → `ready_for_review`

**Flags:**
- `pii_suspicious_size` — file unusually small (might be corrupted)
- `pii_oversized_file` — file unusually large (might contain embedded data)

---

## Component C: Editorial Queue (TODO)
**Purpose:** Human review interface for processed jobs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/queue` | GET | List jobs ready for review |
| `/api/publish/:job_id` | POST | Approve and publish case study |

---

## Component D: Public Gallery / SEO Pages (TODO)
**Purpose:** Generate local landing pages from approved case studies

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/gallery/:market_id` | GET | Display before/after photos for a market |
| `/case-study/:job_id` | GET | Full case study page with schema markup |

---

## Component E: Syndication (TODO)
**Purpose:** Push approved content to GBP, social, etc.
