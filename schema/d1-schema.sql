-- ProPlum Network D1 Database Schema
-- Created: September 11, 2026
-- Purpose: Voice log sanitization, lead routing, location data

-- Voice logs from Telnyx (quarantine queue)
CREATE TABLE IF NOT EXISTS voice_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT NOT NULL UNIQUE,
    recording_url TEXT,
    transcription TEXT,
    status TEXT DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'assigned_tommy', 'assigned_hank', 'approved', 'rejected')),
    anomaly_flags TEXT, -- JSON array of detected issues
    assigned_to TEXT, -- 'tommy', 'hank', 'jeff'
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    reviewed_at INTEGER,
    reviewed_by TEXT,
    notes TEXT
);

CREATE INDEX idx_voice_logs_status ON voice_logs(status);
CREATE INDEX idx_voice_logs_assigned ON voice_logs(assigned_to);
CREATE INDEX idx_voice_logs_created ON voice_logs(created_at);

-- Leads from calculator / forms
CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT NOT NULL UNIQUE,
    source TEXT DEFAULT 'calculator', -- 'calculator', 'blackcard', 'voice', 'manual'
    name TEXT,
    phone TEXT,
    email TEXT,
    company TEXT,
    service_type TEXT,
    square_footage INTEGER,
    location TEXT,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'closed_won', 'closed_lost', 'nurture')),
    score INTEGER, -- 0-100 qualification score
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    assigned_to TEXT
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_location ON leads(location);
CREATE INDEX idx_leads_source ON leads(source);

-- Locations (for programmatic pages)
CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    state_code TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    business_name TEXT,
    business_phone TEXT, -- Hardcoded NAP
    tracking_phone TEXT, -- Telnyx DNI (client-side swapped)
    schema_json TEXT, -- LocalBusiness JSON-LD
    field_notes TEXT, -- Unique content for this location
    aeo_summary TEXT, -- 40-word diagnostic summary
    partner_links TEXT, -- JSON array of partner URLs
    page_html TEXT, -- Pre-rendered static HTML
    last_rendered_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_locations_state ON locations(state_code);
CREATE INDEX idx_locations_slug ON locations(slug);

-- Anomaly log (for triage webhook)
CREATE TABLE IF NOT EXISTS anomalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_table TEXT NOT NULL,
    source_id TEXT NOT NULL,
    anomaly_type TEXT NOT NULL, -- 'pricing', 'hallucination', 'margin', 'safety'
    description TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'resolved', 'false_positive')),
    assigned_to TEXT,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    resolved_by TEXT
);

CREATE INDEX idx_anomalies_status ON anomalies(status);
CREATE INDEX idx_anomalies_severity ON anomalies(severity);

-- Audit trail (memorialization)
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- ============================================================
-- FIELD JOB PROOF-OF-WORK SCHEMA (Added September 12, 2026)
-- ============================================================

-- 1. Service Taxonomy Reference Table
CREATE TABLE IF NOT EXISTS trade_services (
  service_id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  display_name TEXT NOT NULL,
  schema_service_type TEXT NOT NULL,
  default_price_currency TEXT DEFAULT 'USD'
);

INSERT OR IGNORE INTO trade_services (service_id, category, display_name, schema_service_type) VALUES
  ('water-heater-replacement', 'Plumbing', 'Water Heater Replacement & Repair', 'PlumbingService'),
  ('drain-cleaning', 'Plumbing', 'Drain Cleaning & Hydro Jetting', 'PlumbingService'),
  ('pipe-burst-repair', 'Plumbing', 'Burst Pipe Repair', 'PlumbingService'),
  ('sewer-line-replacement', 'Plumbing', 'Sewer Line Replacement', 'PlumbingService'),
  ('toilet-repair', 'Plumbing', 'Toilet Repair & Installation', 'PlumbingService'),
  ('ac-repair', 'HVAC', 'Air Conditioning Repair', 'HVACBusiness'),
  ('furnace-repair', 'HVAC', 'Furnace Repair & Maintenance', 'HVACBusiness'),
  ('emergency-plumbing', 'Plumbing', '24/7 Emergency Plumbing', 'PlumbingService');

-- 2. Geographic Market Nodes
CREATE TABLE IF NOT EXISTS geo_markets (
  market_id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  suburb_neighborhood TEXT,
  state_code TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  latitude REAL NOT NULL DEFAULT 0.0,
  longitude REAL NOT NULL DEFAULT 0.0,
  canonical_url_path TEXT NOT NULL UNIQUE
);

-- 3. Core Job Record Table
CREATE TABLE IF NOT EXISTS completed_jobs (
  job_id TEXT PRIMARY KEY,
  contractor_id TEXT NOT NULL,
  market_id TEXT NOT NULL REFERENCES geo_markets(market_id),
  service_id TEXT NOT NULL REFERENCES trade_services(service_id),
  completed_at DATETIME NOT NULL,
  final_cost_usd REAL NOT NULL DEFAULT 0,
  raw_technician_notes TEXT NOT NULL DEFAULT '',
  published_case_study TEXT,
  editorial_status TEXT NOT NULL DEFAULT 'pending_enrichment' CHECK (editorial_status IN ('pending_enrichment', 'pending_approval', 'published', 'rejected')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_market ON completed_jobs(market_id, editorial_status);
CREATE INDEX IF NOT EXISTS idx_jobs_service ON completed_jobs(service_id, editorial_status);
CREATE INDEX IF NOT EXISTS idx_jobs_published ON completed_jobs(editorial_status, completed_at DESC);

-- 4. Media Asset Junction
CREATE TABLE IF NOT EXISTS job_media (
  media_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES completed_jobs(job_id) ON DELETE CASCADE,
  media_role TEXT NOT NULL CHECK (media_role IN ('before', 'after', 'detail', 'permit')),
  r2_storage_key TEXT NOT NULL,
  optimized_webp_url TEXT NOT NULL DEFAULT '',
  optimized_avif_url TEXT NOT NULL DEFAULT '',
  caption TEXT,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_job ON job_media(job_id, media_role);

-- 5. Verification & Metadata Signals
CREATE TABLE IF NOT EXISTS job_audit_signals (
  audit_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES completed_jobs(job_id) ON DELETE CASCADE,
  code_compliance_notes TEXT,
  permit_number TEXT,
  verified_by_supervisor INTEGER DEFAULT 0 CHECK (verified_by_supervisor IN (0, 1)),
  homeowner_anonymized_hash TEXT,
  gps_coarse_zone TEXT,
  exif_stripped INTEGER DEFAULT 0,
  pii_masked INTEGER DEFAULT 0
);
