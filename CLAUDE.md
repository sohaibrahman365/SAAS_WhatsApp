# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GeniSearch** — a multi-tenant SaaS platform for WhatsApp-based customer engagement and BI analytics. Businesses upload product inventory, send AI-powered WhatsApp campaigns to targeted customer segments, and analyze responses through cascading drill-down dashboards.

## Repository State

This repository is currently in a **design-first / pre-backend** stage. All files live under `files/`:

| File | Purpose |
|------|---------|
| `files/enhanced-inventory-upload-interface.html` | Product inventory upload UI with geographic/demographic targeting |
| `files/customer-engagement-dashboard.html` | Campaign analytics, feedback/sentiment, smart messaging, customer segments |
| `files/bi-dashboard-full.html` | 5-level cascading BI dashboard with drill-down navigation |
| `files/QUICK_START_GUIDE.md` | User journey walkthrough and data flow |
| `files/COMPLETE_SYSTEM_SUMMARY.md` | Full system spec including database schema, deployment checklist, business model |
| `files/CUSTOMER_ENGAGEMENT_TRACKING.md` | Database schema SQL, API endpoint specs, priority scoring algorithm |
| `files/BI_ANALYTICS_SYSTEM.md` | BI architecture, SQL views, all analytics API endpoints, drill-down flows |

No backend, `package.json`, or `.env` files exist yet. When building the backend, refer to the documentation files for the intended schemas and API contracts.

## Planned Tech Stack

- **Backend:** Node.js / Express.js
- **Database:** PostgreSQL (with Row-Level Security for multi-tenancy)
- **AI:** Anthropic Claude API — sentiment analysis and intent detection on WhatsApp replies
- **Messaging:** WhatsApp Cloud API
- **Auth:** Google OAuth 2.0
- **Automation:** n8n workflows (CRM sync, Slack alerts, Google Sheets logging)
- **Hosting:** Railway or Render (backend), Vercel/Netlify (frontend statics)

## 5-Level Cascading Architecture

The analytics system drills down hierarchically:

```
Level 1: SaaS Platform Dashboard  (all tenants, aggregate)
  └─ Level 2: Tenant Dashboard     (single business metrics)
       └─ Level 3: Product Dashboard  (single product analytics)
            └─ Level 4: Campaign Dashboard  (campaign performance)
                 └─ Level 5: Response Detail  (individual customer interaction)
```

Each level links to the next via clickable metrics, with breadcrumb navigation for back-traversal.

## Database Schema (6 Core Tables)

Defined in `files/CUSTOMER_ENGAGEMENT_TRACKING.md` and `files/COMPLETE_SYSTEM_SUMMARY.md`:

1. **campaigns** — campaign config, targeting, message template, status, sent/reply/conversion counts
2. **campaign_recipients** — one row per customer per campaign; tracks delivery, read, reply status
3. **campaign_responses** — AI-analyzed replies: sentiment (positive/neutral/negative), intent (interested/inquiry/order/feedback), key phrases, suggested auto-replies
4. **customer_engagement_history** — per-customer aggregated metrics and priority score (1–100)
5. **customer_feedback** — star ratings (overall + category), AI-extracted themes and action items
6. **customer_preferences** — preferred categories, price range, communication preferences, DoNotContact flags

## API Endpoint Contracts

Full specs in `files/CUSTOMER_ENGAGEMENT_TRACKING.md` and `files/BI_ANALYTICS_SYSTEM.md`:

- `POST /api/campaigns` — create and send campaign
- `POST /api/campaigns/:id/response` — ingest WhatsApp reply → trigger Claude analysis
- `GET /api/campaigns/:id/analytics`
- `GET /api/customers/:phone/engagement`
- `GET /api/bi/saas-platform/dashboard` — Level 1
- `GET /api/bi/tenant/:customer_id/dashboard` — Level 2
- `GET /api/bi/product/:product_id/dashboard` — Level 3
- `GET /api/bi/campaign/:campaign_id/dashboard` — Level 4
- `GET /api/bi/response/:response_id` — Level 5
- `POST /api/feedback`

## Multi-Tenant Access Control

- Roles: Super Admin → Admin → Manager → Analyst (view-only)
- PostgreSQL Row-Level Security isolates tenant data
- All API endpoints must enforce tenant scoping via authenticated user context

## Key Business Logic

- **Priority Score (1–100):** computed per customer from reply rate, sentiment history, conversion history, recency — see `files/CUSTOMER_ENGAGEMENT_TRACKING.md` for the algorithm
- **Campaign flow:** Inventory upload → target 1000 customers → send WhatsApp messages → collect ~100 replies → Claude analyzes each reply → scores update → BI dashboards reflect results
- **Message personalization placeholders:** `{{customer_name}}`, `{{discount}}`, `{{product_name}}`

## Environment Variables Needed

```
ANTHROPIC_API_KEY
WHATSAPP_API_TOKEN
WHATSAPP_PHONE_NUMBER_ID
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
DATABASE_URL
N8N_WEBHOOK_URL
```
