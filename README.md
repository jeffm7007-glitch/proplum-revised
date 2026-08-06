# 🏗️ ProPlum Network

**AI-Powered Phone Agent \& Trade Contractor Directory**

Built for trade professionals who'd rather be on the job than on hold.

\---

## 📋 Project Overview

ProPlum Network is a 200-city trade contractor referral directory powered by an AI phone agent named **Jenni**. She answers calls 24/7, qualifies leads, books appointments, and logs everything to a CRM and headless CMS.

|Component|Technology|Purpose|
|-|-|-|
|**AI Brain**|Kimi K2.5 (via OpenRouter)|Natural language processing, trade knowledge|
|**Voice Layer**|Telnyx|Phone number, call routing, SMS|
|**Webhook**|Google Cloud Run (Node.js)|Call event logging, API integrations|
|**CRM**|Pipedrive|Lead management, pipeline tracking|
|**Directory CMS**|CosmicJS|Contractor listings, city pages, knowledge base|
|**Landing Pages**|Static HTML|Sales pages, emergency/remodel showcases|

\---

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Homeowner     │────▶│   Telnyx        │────▶│   Jenni AI      │
│   (Phone/SMS)   │     │   1-727-382-8869│     │   (Kimi K2.5)   │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                              ┌─────────────────────────┼─────────────────────────┐
                              │                         │                         │
                              ▼                         ▼                         ▼
                       ┌────────────┐            ┌────────────┐            ┌────────────┐
                       │  Pipedrive │            │  CosmicJS  │            │  Google    │
                       │  (CRM)     │            │  (CMS)     │            │  Cloud     │
                       │  Leads     │            │  Directory │            │  Logs      │
                       └────────────┘            └────────────┘            └────────────┘
```

\---

## 📁 Repository Structure

```
proplum-network/
├── webhook/                    # Google Cloud Run service
│   ├── index.js               # Main Express server
│   ├── package.json           # Dependencies
│   └── Dockerfile             # Container config
│
├── telnyx/                    # Telnyx AI Agent config
│   ├── ai-agent-config.json   # Full agent configuration
│   └── system-prompt.txt      # Jenni's personality \& knowledge
│
├── cosmicjs/                  # CosmicJS schema \& data
│   ├── schema.json            # Collection definitions
│   └── seed-data/             # Initial contractor/city data
│
├── pipedrive/                 # Pipedrive integration
│   ├── setup-guide.md         # Custom fields \& pipeline setup
│   └── webhook-integration.js # Pipedrive API calls
│
├── landing-pages/             # Static HTML sales pages
│   ├── pricing.html           # 3-tier pricing ($99/$499/$999)
│   ├── emergency.html         # Emergency plumbing page
│   ├── remodel.html           # Kitchen \& bath remodel page
│   └── combined.html          # Hero carousel + city selector
│
├── docs/                      # Documentation
│   ├── api-keys.env           # Environment variables template
│   ├── test-checklist.md      # 20-point test checklist
│   └── deployment-guide.md    # Full deployment instructions
│
└── README.md                  # This file
```

\---

## 🚀 Quick Start (For Developers)

### Prerequisites

* Node.js 18+
* Google Cloud SDK (gcloud)
* Telnyx account with AI Agent enabled
* Pipedrive account
* CosmicJS bucket
* OpenRouter API key

### 1\. Clone \& Install

```bash
git clone https://github.com/your-org/proplum-network.git
cd proplum-network/webhook
npm install
```

### 2\. Configure Environment

Copy `docs/api-keys.env` to `.env` and fill in all values:

```bash
# OpenRouter (Kimi K2.5)
OPENROUTER\_API\_KEY=ddd8227f-a988-4c5d-9e69-7d673f24e624:ewxZvyEpcdfs

# Telnyx
TELNYX\_API\_KEY=KEY0YOUR\_KEY\_HERE
TELNYX\_NUMBER=+17273828869

# Pipedrive
PIPEDRIVE\_API\_KEY=YOUR\_PIPEDRIVE\_TOKEN
PIPEDRIVE\_DOMAIN=proplum

# CosmicJS
COSMIC\_BUCKET\_SLUG=proplum-network
COSMIC\_READ\_KEY=YOUR\_READ\_KEY
COSMIC\_WRITE\_KEY=YOUR\_WRITE\_KEY
```

### 3\. Deploy Webhook to Google Cloud Run

```bash
cd webhook
gcloud builds submit --tag gcr.io/YOUR\_PROJECT/proplum-webhook
gcloud run deploy proplum-webhook   --image gcr.io/YOUR\_PROJECT/proplum-webhook   --platform managed   --region us-central1   --allow-unauthenticated   --set-env-vars-file ../.env
```

### 4\. Configure Telnyx AI Agent

1. Go to [portal.telnyx.com](https://portal.telnyx.com) → AI Agents
2. Import `telnyx/ai-agent-config.json` or create manually
3. Paste `telnyx/system-prompt.txt` into the System Prompt field
4. Assign phone number **1-727-382-8869**
5. Enable SMS follow-up (60-second delay)

### 5\. Set Up Pipedrive

Follow `pipedrive/setup-guide.md` to:

* Create custom fields (Address, City, ZIP, Service Type, Urgency)
* Create "ProPlum Leads" pipeline
* Note field IDs and pipeline IDs for webhook config

### 6\. Set Up CosmicJS

1. Create bucket `proplum-network`
2. Import collections from `cosmicjs/schema.json`
3. Seed initial data (contractors, cities)

### 7\. Test

Run through `docs/test-checklist.md` (20 tests).

\---

## 📞 The Phone Number

**1-727-382-8869** — Jenni answers 24/7

When someone calls:

1. Telnyx routes to AI Agent
2. Jenni (Kimi K2.5) greets and qualifies
3. Call data logged to webhook
4. Lead created in Pipedrive
5. Record stored in CosmicJS

\---

## 💰 Pricing Tiers

|Tier|Monthly|Per-Min|Best For|
|-|-|-|-|
|**Plumber's Helper**|$99|$0.22|Solo operator, 1 city|
|**Master Plumber**|$499|$0.07|Multi-crew, 10 cities|
|**Market Dominator**|$999|$0.05\*|All 200 cities, 500 mins included|

\*Additional minutes after 500 included mins

**Competitor pricing:** $3,500–$5,000/month. We built this for the working contractor.

\---

## 🧠 Jenni's Knowledge Base

Jenni is trained on:

* **Plumbing codes \& materials** (PSI ratings, pipe types, permits)
* **Public adjuster guidance** (when to call, insurance tactics, fees)
* **General contracting** (remodel pricing, licensing, lien rights)
* **Pricing objections** (10 rebuttals for common pushback)
* **Demo mode** (handles test calls, weird questions, jokes)

Full prompt: `telnyx/system-prompt.txt`

\---

## 🛠️ Tech Stack Details

### Telnyx

* **Number:** 1-727-382-8869
* **AI Agent:** Native Telnyx voice AI
* **Voice:** Female professional, en-US
* **LLM:** Custom endpoint → OpenRouter → Kimi K2.5
* **SMS:** Auto-reply to missed calls (60s delay)

### OpenRouter / Kimi K2.5

* **Endpoint:** `https://openrouter.ai/api/v1/chat/completions`
* **Model:** `moonshotai/kimi-k2.5`
* **Context:** 256K tokens
* **Cost:** $0.60/M input, $3.00/M output
* **Fallback:** `moonshotai/kimi-k3` for >200K context

### Google Cloud Run

* **Project:** `plumber-experience-api-888646825887`
* **Region:** `us-central1`
* **Runtime:** Node.js 18 (Alpine Linux container)
* **Scaling:** Auto-scaling, 0–1000 instances
* **URL:** `https://plumber-experience-api-888646825887.us-central1.run.app`

### Pipedrive

* **Pipeline:** "ProPlum Leads"
* **Stages:** New Lead → Qualified → Appointment Set → Proposal Sent → Won → Lost
* **Custom Fields:** Address, City, ZIP, Service Type, Urgency, Insurance Status, Call Transcript

### CosmicJS

* **Bucket:** `proplum-network`
* **Collections:**

  * `leads` — Every call Jenni takes
  * `contractors` — Trade professional profiles
  * `locations` — 200 city subaccounts
  * `knowledge-catalog` — Case studies, pricing, technician notes
  * `blog-posts` — SEO content per city
  * `customer-objections` — Objection handling database

\---

## 📝 API Endpoints

### Webhook (Google Cloud Run)

|Method|Endpoint|Description|
|-|-|-|
|`GET`|`/health`|Health check|
|`POST`|`/webhook/telnyx`|Receives Telnyx call/SMS events|

### Telnyx → Webhook Payload

```json
{
  "data": {
    "event\_type": "call.initiated",
    "payload": {
      "call\_control\_id": "uuid",
      "from": "+15551234567",
      "to": "+17273828869",
      "direction": "incoming"
    }
  }
}
```

### Pipedrive API

```
POST https://{domain}.pipedrive.com/v1/persons?api\_token={token}
POST https://{domain}.pipedrive.com/v1/deals?api\_token={token}
```

### CosmicJS API

```
POST https://api.cosmicjs.com/v3/buckets/{bucket}/objects
GET  https://api.cosmicjs.com/v3/buckets/{bucket}/objects?type=contractors
```

\---

## 🧪 Testing

Run the full test checklist: `docs/test-checklist.md`

Key tests:

1. Call 1-727-382-8869 — Jenni answers
2. Ask technical question — Jenni answers with trade knowledge
3. Book fake appointment — appears in Pipedrive + CosmicJS
4. Hang up — receive SMS follow-up in 60 seconds
5. Text "HELP" — Jenni replies

\---

## 📞 Contact

**Owner:** Jeff Mann  
**Phone:** 813-491-3590  
**Email:** jeffm7007@gmail.com  
**Business Line:** 1-727-382-8869 (Jenni, 24/7)  
**Website:** proplumnetwork.com

\---

## 📄 License

Proprietary — All rights reserved by ProPlum Network.

\---

*Built with ❤️ for the working contractor.*

