# GeniSearch Business Guide

Complete documentation for the GeniSearch WhatsApp SaaS Platform.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Feature Guide](#3-feature-guide)
   - [Products / Inventory](#31-products--inventory)
   - [Customers](#32-customers)
   - [Campaigns](#33-campaigns)
   - [WhatsApp Conversations](#34-whatsapp-conversations)
   - [BI Analytics Dashboard](#35-bi-analytics-dashboard)
   - [Reports](#36-reports)
   - [Settings](#37-settings)
4. [Making the App Live — Environment Variables](#4-making-the-app-live--environment-variables)
5. [Deployment Guide](#5-deployment-guide)
6. [Architecture Overview](#6-architecture-overview)
7. [API Reference](#7-api-reference)

---

## 1. Introduction

### What is GeniSearch

GeniSearch is a multi-tenant SaaS platform that enables businesses to run AI-powered marketing campaigns over WhatsApp. It combines product inventory management, customer segmentation, automated WhatsApp messaging, AI-driven sentiment analysis, and cascading business intelligence dashboards into a single platform.

The core workflow is straightforward: upload your product catalog, build a targeted customer list, compose and launch a WhatsApp campaign, then let the platform analyze every customer reply using AI and surface the results through drill-down analytics dashboards.

### Who It's For

GeniSearch is built for businesses that use WhatsApp as a primary customer communication channel — particularly common in markets across the Middle East, South Asia, Latin America, and Africa. Typical users include:

- **E-commerce businesses** promoting products to WhatsApp contact lists
- **Retail brands** running targeted promotions to segmented customer groups
- **Marketing agencies** managing WhatsApp campaigns across multiple client brands
- **Sales teams** tracking customer engagement and conversion through WhatsApp outreach

### Key Value Proposition

- **Targeted campaigns**: Define geographic and demographic targeting at the product level, then automatically match customers when launching campaigns.
- **AI-powered insights**: Every customer reply is analyzed by Claude AI for sentiment (positive/neutral/negative), intent (interested, inquiry, order, complaint), and key phrases — with a suggested follow-up reply generated automatically.
- **5-level analytics**: Drill from a platform-wide overview all the way down to an individual customer response, with metrics at every level.
- **Multi-tenant isolation**: Each business (tenant) sees only its own data. Row-Level Security in PostgreSQL enforces this at the database layer.
- **Stub mode**: The platform runs fully without external API keys. WhatsApp sends are simulated and AI analysis falls back to keyword-based heuristics, so you can develop, demo, and test without paying for API access.

---

## 2. Getting Started

### How to Register and Log In

**Registration**

Send a POST request to the `/api/auth/register` endpoint, or use the login page at `login.html`. Registration requires:

| Field | Required | Notes |
|-------|----------|-------|
| `email` | Yes | Becomes your login identifier. Automatically lowercased and trimmed. |
| `password` | Yes | Minimum 8 characters. Stored as a bcrypt hash. |
| `name` | Yes | Your display name across the platform. |
| `tenantId` | No | If provided, you are associated with that tenant as an `admin`. If omitted and your email does not match `SUPER_ADMIN_EMAIL`, you are assigned the `analyst` role. |

If your email matches the `SUPER_ADMIN_EMAIL` environment variable, you are automatically assigned the `super_admin` role regardless of whether a `tenantId` is provided.

**Login**

Provide your email and password to `/api/auth/login`. The response includes a JWT token (valid for 7 days) and your user profile. The frontend stores this token in `localStorage` and attaches it as a `Bearer` token on all subsequent API requests.

**Session**

Your session persists as long as the JWT is valid. If the token expires or becomes invalid, the frontend automatically redirects to `login.html`. Use the `/api/auth/me` endpoint to verify the current session at any time.

### Dashboard Overview

After logging in, you land on the main **Dashboard** (`index.html`). The sidebar provides navigation to all platform sections:

| Section | Page | Description |
|---------|------|-------------|
| **Dashboard** | `index.html` | Overview KPIs, recent campaigns, and quick actions |
| **Products** | `inventory.html` | Manage product catalog with targeting rules |
| **Customers** | `engagement.html` | Customer list, engagement scores, and demographics |
| **Campaigns** | `campaigns.html` | Create, launch, and monitor WhatsApp campaigns |
| **Conversations** | `conversations.html` | View WhatsApp responses and AI analysis results |
| **BI Dashboard** | `bi.html` | 5-level cascading analytics with drill-down navigation |
| **Reports** | `reports.html` | Generate and export reports across all data |
| **Settings** | `settings.html` | Profile, API configuration, and tenant management |

### User Roles

GeniSearch uses a four-tier role hierarchy. Each role inherits all permissions of the roles below it.

| Role | Scope | Capabilities |
|------|-------|-------------|
| **Super Admin** | Entire platform | Full access to all tenants. Can create tenants, view the SaaS-wide BI dashboard (Level 1), manage all users, and access all API endpoints. Not tied to any single tenant. |
| **Admin** | Single tenant | Full access within their tenant. Can create products, customers, and campaigns. Can launch campaigns, send test WhatsApp messages, trigger AI analysis, manage webhooks, and view tenant-level BI. |
| **Manager** | Single tenant | Can create and manage products, customers, and campaigns. Can launch campaigns and trigger AI analysis. Cannot send individual test WhatsApp messages or configure webhooks. |
| **Analyst** | Single tenant | View-only access. Can view products, customers, campaigns, BI dashboards, and reports within their tenant. Cannot create, modify, or delete any records. |

Role enforcement happens at two layers:

1. **Backend middleware**: The `requireRole()` middleware rejects requests from users whose role is not in the allowed list for that endpoint.
2. **Frontend UI**: Navigation elements and action buttons are conditionally shown based on the user's role stored in `localStorage`.

---

## 3. Feature Guide

### 3.1 Products / Inventory

Products represent the items or services your business wants to promote via WhatsApp campaigns. Each product carries targeting rules that determine which customers receive campaign messages.

**Adding a Product**

Navigate to **Products** in the sidebar. Click the "Add Product" button and fill in the form:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Product name displayed in campaigns and analytics. |
| `price` | No | Product price. Used for filtering and display. |
| `description` | No | Free-text description of the product. |
| `image_url` | No | URL to a product image. |
| `categories` | No | Array of category tags (e.g., `["Fashion", "Formal Wear"]`). Used for customer preference matching. |

**Geographic Targeting**

Each product can specify where its target audience is located. These fields are used when launching a campaign to filter the customer list:

| Field | Description | Example |
|-------|-------------|---------|
| `region` | Broad geographic region | `Middle East`, `South Asia` |
| `country` | Country | `Pakistan`, `UAE` |
| `province` | State or province | `Punjab`, `Dubai` |
| `city` | City | `Lahore`, `Karachi` |
| `timezone` | Timezone for send-time optimization | `Asia/Karachi` |

**Demographic Targeting**

| Field | Description | Example |
|-------|-------------|---------|
| `target_age_min` | Minimum age of target audience | `18` |
| `target_age_max` | Maximum age of target audience | `45` |
| `target_genders` | Array of target genders | `["Male", "Female"]` |
| `preferences` | Customer preference tags to match | `["Premium", "Eco-friendly"]` |
| `activity_filter` | Only include customers active within this window | `7d`, `30d`, `all` |

**How Targeting Works**

When you create a campaign linked to a product, the product's targeting fields are copied into the campaign as a snapshot. When the campaign is launched, the system queries the customer database using these filters:

1. Customers must belong to the same tenant.
2. Geographic filters (region, country, city) are applied as exact matches when set.
3. Customers flagged as `do_not_contact` in their preferences are excluded.
4. The resulting list receives the campaign's WhatsApp message.

**Product Status**

Products have a `status` field (`active` by default). Only active products appear in campaign creation dropdowns. Archive products by changing their status to remove them from active use without deleting historical campaign data.

---

### 3.2 Customers

Customers are the recipients of your WhatsApp campaigns. Each customer record is scoped to a tenant (your business).

**Adding Customers**

Navigate to **Customers** in the sidebar. Click "Add Customer" and provide:

| Field | Required | Description |
|-------|----------|-------------|
| `phone` | Yes | WhatsApp phone number in international format without the `+` sign (e.g., `923001234567`). This is the unique identifier within a tenant. |
| `name` | No | Customer's display name. Used in message personalization (`{{customer_name}}`). |
| `email` | No | Email address for additional contact or CRM integration. |
| `age` | No | Customer's age. Used for demographic targeting. |
| `gender` | No | Customer's gender. Used for demographic targeting. |
| `city` | No | City of residence. Used for geographic targeting. |
| `region` | No | Region of residence. Used for geographic targeting. |
| `country` | No | Country of residence. Used for geographic targeting. |
| `source` | No | How the customer was acquired. Defaults to `web_search`. Other values: `meta`, `tiktok`, `google`, `linkedin`. |

If a customer with the same phone number already exists within the tenant, the record is updated (upsert) rather than duplicated.

**Customer Engagement Scoring**

Every customer has a **priority score** ranging from 1 to 100, tracked in the `customer_engagement_history` table. The score is computed from:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Reply rate** | High | Percentage of campaigns where the customer replied. A customer who replies to 8 out of 10 campaigns scores higher than one who replies to 1 out of 10. |
| **Sentiment history** | Medium | Average sentiment score across all analyzed responses. Consistently positive respondents rank higher. |
| **Conversion history** | High | Percentage of campaigns where the customer converted (made a purchase, placed an order, etc.). |
| **Recency** | Medium | How recently the customer last engaged. Recent engagement boosts the score; long periods of silence lower it. |

The engagement history also tracks:

- Total messages received and replied to
- Total campaigns targeted
- Breakdown of positive, neutral, and negative responses
- Average sentiment score
- Last engagement date and type
- First contact date

**Viewing Customer Engagement**

Use the BI endpoint `GET /api/bi/customer/:phone/engagement` to retrieve a customer's full engagement profile, including their engagement history, recent responses, feedback, and preferences.

---

### 3.3 Campaigns

Campaigns are the core feature of GeniSearch. A campaign defines a targeted WhatsApp message that is sent to a filtered list of customers.

**Creating a Campaign**

Navigate to **Campaigns** in the sidebar. Click "Create Campaign" and fill in:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Campaign name for internal tracking. |
| `product_id` | No | Link the campaign to a product. Targeting fields are inherited from the product. |
| `description` | No | Internal description or notes about the campaign. |
| `category` | No | Campaign category for organization. |
| `message_template` | No | The WhatsApp message to send. Supports personalization placeholders. |
| `language` | No | Message language. Defaults to `en`. |
| `ai_generated` | No | Flag indicating whether the message was AI-generated. |
| `target_segment` | No | Customer segment to target: `all`, `high_priority`, `new`, `inactive`. Defaults to `all`. |
| `scheduled_for` | No | Timestamp for scheduled delivery. Leave empty for immediate manual launch. |

**Targeting Fields on Campaigns**

Campaigns also accept the same geographic and demographic targeting fields as products (`region`, `country`, `province`, `city`, `target_age_min`, `target_age_max`, `target_genders`). When a campaign is linked to a product, these are typically inherited from the product.

**Message Personalization**

The `message_template` supports these placeholders:

| Placeholder | Replaced With | Example |
|-------------|---------------|---------|
| `{{customer_name}}` | Customer's name (or "Valued Customer" if not set) | `Hi {{customer_name}}!` becomes `Hi Ahmad!` |
| `{{product_name}}` | Name of the linked product | `Check out our {{product_name}}` becomes `Check out our Premium Watch Collection` |
| `{{discount}}` | Discount value (set per campaign) | `Get {{discount}} off today!` becomes `Get 20% off today!` |

Example message template:

```
Hi {{customer_name}}! We have an exciting offer on {{product_name}}.
Get {{discount}} off when you order today. Reply YES to learn more!
```

**Launching a Campaign**

Once created, a campaign starts in **draft** status. To launch it:

1. Ensure the campaign has a `message_template` and is linked to a product (recommended).
2. Call `POST /api/campaigns/:id/launch` or click "Launch" in the UI.
3. The system queries all matching customers based on the campaign's targeting rules.
4. Customers with `do_not_contact = true` are excluded.
5. For each matching customer, the system:
   - Personalizes the message template with the customer's data.
   - Sends the WhatsApp message (or simulates it in stub mode).
   - Creates a `campaign_recipients` row tracking delivery status.
6. The campaign status changes from `draft` to `active`.
7. The `sent_count` is updated with the number of successfully sent messages.
8. The response includes a summary: `{ launched: true, sent: 150, failed: 3, total: 153 }`.

**Campaign Status Lifecycle**

```
draft --> scheduled --> active --> completed
                         |
                         v
                       paused
```

| Status | Description |
|--------|-------------|
| `draft` | Campaign created but not yet sent. Editable. |
| `scheduled` | Scheduled for future delivery. Can still be launched manually. |
| `active` | Messages have been sent. Waiting for and receiving replies. |
| `completed` | Campaign has finished. All replies processed. |
| `paused` | Campaign temporarily suspended. |

Update a campaign's status via `PATCH /api/campaigns/:id/status` with the desired status value.

**Monitoring Campaign Performance**

After launch, the campaign record tracks these counters in real time:

| Counter | Description |
|---------|-------------|
| `sent_count` | Number of WhatsApp messages successfully sent |
| `delivery_count` | Number of messages confirmed delivered to the recipient's device |
| `read_count` | Number of messages confirmed read (blue ticks) |
| `reply_count` | Number of customer replies received |
| `conversion_count` | Number of customers who converted (placed order, etc.) |

These counters update automatically as WhatsApp status webhooks arrive.

---

### 3.4 WhatsApp Conversations

GeniSearch integrates with the WhatsApp Cloud API to send and receive messages. The integration handles outbound campaign messages, inbound customer replies, and delivery status tracking.

**How WhatsApp Integration Works**

The system uses Meta's WhatsApp Cloud API (Graph API v19.0). The integration has three components:

1. **Outbound messages**: When a campaign is launched, the system calls the WhatsApp Cloud API to send each personalized message. The API returns a `wa_message_id` for each message, which is stored in the `campaign_recipients` table for status tracking.

2. **Webhook for incoming messages**: Meta sends all inbound messages and status updates to `POST /api/whatsapp/webhook`. The system:
   - Identifies the sender by phone number.
   - Finds the most recent active campaign the sender was targeted by.
   - Records the reply in `campaign_responses`.
   - Triggers automatic AI analysis of the reply.
   - Updates reply counters on the campaign and recipient records.

3. **Webhook verification**: During initial setup, Meta sends a verification challenge to `GET /api/whatsapp/webhook`. The system validates it against the `WHATSAPP_VERIFY_TOKEN` environment variable.

**Status Tracking**

The webhook automatically processes delivery status updates from Meta:

| Status | Action |
|--------|--------|
| `delivered` | Marks the recipient as delivered, increments `delivery_count` on the campaign. |
| `read` | Marks the recipient as read, increments `read_count` on the campaign. |

**Viewing Customer Responses**

Navigate to **Conversations** in the sidebar to view all customer responses. Each response shows:

- The customer's name and phone number
- The response text
- AI analysis results (sentiment, intent, key phrases)
- The AI-suggested follow-up reply
- The campaign the response belongs to
- Timestamp of the response

**AI Sentiment Analysis**

Every customer reply is automatically analyzed by Claude AI (Anthropic). The analysis returns:

| Field | Description | Example Values |
|-------|-------------|----------------|
| `sentiment` | Overall emotional tone | `positive`, `neutral`, `negative` |
| `sentiment_score` | Numerical sentiment on a 0-1 scale | `0.85` (positive), `0.45` (neutral), `0.15` (negative) |
| `intent` | What the customer wants | `interested`, `not_interested`, `inquiry`, `order`, `feedback`, `complaint`, `unsubscribe` |
| `key_phrases` | Important phrases extracted from the reply | `["want to buy", "what price", "send details"]` |
| `extracted_info` | Structured data from the reply | `{ "preferred_color": "blue", "quantity": 2 }` |
| `suggested_reply` | AI-generated follow-up message | `"Thank you for your interest! The price is PKR 2,500..."` |
| `confidence` | AI's confidence in the analysis (0-1) | `0.92` |

You can also manually trigger analysis:

- **Single response**: `POST /api/ai/analyze-response/:responseId` — re-analyzes a specific response.
- **Bulk analyze**: `POST /api/ai/bulk-analyze/:campaignId` — analyzes all unanalyzed responses for a campaign.
- **Free text**: `POST /api/ai/analyze` — analyze any text, optionally with campaign context.

**Sending Test Messages**

Admins and Super Admins can send individual test messages via `POST /api/whatsapp/send`:

```json
{
  "to": "923001234567",
  "message": "Hello! This is a test message from GeniSearch."
}
```

The response indicates whether the message was sent via the real API or in stub mode:

```json
{
  "stub": false,
  "wa_message_id": "wamid.abc123..."
}
```

**WhatsApp Configuration Status**

Check if WhatsApp is properly configured via `GET /api/whatsapp/status`:

```json
{
  "configured": true,
  "stub_mode": false,
  "phone_number_id": "...5678"
}
```

---

### 3.5 BI Analytics Dashboard

GeniSearch provides a 5-level cascading Business Intelligence dashboard. Each level drills deeper into the data, and every level links to the next via clickable metrics. Breadcrumb navigation allows back-traversal at any point.

```
Level 1: SaaS Platform Dashboard   (all tenants, aggregate)
  |
  +---> Level 2: Tenant Dashboard   (single business metrics)
          |
          +---> Level 3: Product Dashboard  (single product analytics)
                  |
                  +---> Level 4: Campaign Dashboard  (campaign performance)
                          |
                          +---> Level 5: Response Detail  (individual interaction)
```

**Level 1 -- SaaS Platform Dashboard** (Super Admin only)

Endpoint: `GET /api/bi/saas-platform/dashboard`

Provides a platform-wide view across all tenants:

| Metric | Description |
|--------|-------------|
| Total tenants | Number of active tenants on the platform |
| Total products | Total products across all tenants |
| Total customers | Total customers across all tenants |
| Total campaigns | Total campaigns created |
| Active campaigns | Campaigns currently in `active` status |
| Total messages sent | Sum of all messages sent across all campaigns |
| Total replies | Sum of all replies received |
| Total conversions | Sum of all conversions |
| Total MRR | Monthly recurring revenue from all active tenants |

Also includes a per-tenant summary table (with product, campaign, and customer counts), the 10 most recent campaigns, and a sentiment breakdown across all analyzed responses.

Click on any tenant row to drill into Level 2.

**Level 2 -- Tenant Dashboard**

Endpoint: `GET /api/bi/tenant/:tenantId/dashboard`

Shows metrics for a single business:

| Section | Data |
|---------|------|
| Tenant profile | Name, plan, MRR, status |
| KPIs | Product count, customer count, campaign count, messages sent, total replies, total conversions |
| Products list | All products with their status and customer counts |
| Recent campaigns | Last 10 campaigns with status and performance counters |
| Top customers | Top 10 customers by priority score, with reply rate and conversion rate |

Click on a product to drill into Level 3, or click a campaign to go directly to Level 4.

**Level 3 -- Product Dashboard**

Endpoint: `GET /api/bi/product/:productId/dashboard`

Shows analytics for a single product:

| Section | Data |
|---------|------|
| Product details | Full product record including targeting configuration |
| Campaigns | All campaigns linked to this product, with delivery and engagement counters |
| Sentiment breakdown | Distribution of positive/neutral/negative responses across all campaigns for this product |

Click on a campaign to drill into Level 4.

**Level 4 -- Campaign Dashboard**

Endpoint: `GET /api/bi/campaign/:campaignId/dashboard`

The most detailed operational view. Shows everything about a single campaign:

| Section | Data |
|---------|------|
| Campaign details | Full campaign record including product name and message template |
| Delivery funnel | `Total Recipients --> Sent --> Delivered --> Read --> Replied --> Converted` |
| Sentiment breakdown | Distribution of response sentiments for this campaign |
| Intent breakdown | Distribution of response intents (interested, inquiry, order, etc.) |
| Recipients list | Up to 50 recipients with their delivery and engagement status |
| Responses list | Up to 50 responses with text, sentiment, intent, suggested reply, and AI analysis status |

Click on a response to drill into Level 5.

**Level 5 -- Response Detail**

Endpoint: `GET /api/bi/response/:responseId`

The deepest level. Shows everything about a single customer interaction:

| Section | Data |
|---------|------|
| Response | Full text, sentiment, sentiment score, intent, key phrases, extracted info |
| AI analysis | Suggested reply, AI confidence score, analysis status |
| Customer profile | Name, phone, email, city, region, country |
| Customer engagement | Priority score, reply rate, conversion rate, average sentiment, total campaigns targeted |
| Campaign context | Campaign name, message template, product name |

**Navigating Between Levels**

- **Drill down**: Click on any row (tenant, product, campaign, or response) to navigate to the next level.
- **Drill up**: Use the breadcrumb trail at the top of each dashboard to return to any previous level.
- **Cross-navigation**: The Customer Engagement endpoint (`GET /api/bi/customer/:phone/engagement`) provides a lateral view of any customer's full history, accessible from any level.

---

### 3.6 Reports

Navigate to **Reports** in the sidebar. The reports page provides pre-built report types that aggregate data across your tenant.

**Available Report Types**

| Report Type | Description | Key Data |
|-------------|-------------|----------|
| **Platform Report** | SaaS-wide overview (Super Admin only) | Total tenants, MRR, total campaigns, total messages, total replies, conversion rate |
| **Campaign Report** | Performance of a specific campaign | Delivery funnel, response rates, sentiment distribution, intent distribution |
| **Customer Report** | Engagement profile for a customer | Priority score, reply history, sentiment trend, campaigns targeted |
| **Product Report** | Performance of campaigns linked to a product | Campaign count, total messages, response rate, sentiment breakdown |

**CSV Export**

Reports can be exported to CSV format. The export includes all data points visible in the report, formatted with headers and proper escaping for spreadsheet compatibility.

**Daily Summary Webhook**

The `POST /api/webhooks/daily-summary` endpoint generates a 24-hour summary of platform activity and sends it to the configured n8n webhook. This is intended to be triggered by a cron job or n8n schedule node. The summary includes:

- Campaigns sent in the last 24 hours
- Total replies in the last 24 hours
- Count of positive and negative responses
- New customers added in the last 24 hours

---

### 3.7 Settings

Navigate to **Settings** in the sidebar.

**Profile Management**

View and update your user profile. The `GET /api/auth/me` endpoint returns your current user information: ID, email, name, role, tenant assignment, and account creation date.

**API Configuration Status**

The Settings page shows the configuration status of all external integrations:

| Integration | Status Check Endpoint | What It Shows |
|-------------|----------------------|---------------|
| **WhatsApp Cloud API** | `GET /api/whatsapp/status` | Whether the API token is configured, stub mode status, last 4 digits of the phone number ID |
| **Claude AI** | `GET /api/ai/status` | Whether the Anthropic API key is configured, stub mode status |
| **n8n Webhooks** | `GET /api/webhooks/status` | Whether the n8n webhook URL is configured, stub mode status |
| **Database** | `GET /api/health` | Database connection status, latency, server uptime, API version |

Each integration shows either "Connected" (fully configured) or "Stub Mode" (running with simulated responses).

**Tenant Management** (Super Admin only)

Super Admins can manage tenants through the Settings page or the tenants API:

- **List all tenants**: `GET /api/tenants` returns all tenants with their plan, status, and MRR.
- **Create a tenant**: `POST /api/tenants` with `name`, `email`, `phone` (optional), and `plan` (defaults to `starter`).
- **View tenant details**: `GET /api/tenants/:id`.

Available plans: `starter`, `pro`, `business`, `enterprise`.

---

## 4. Making the App Live -- Environment Variables

GeniSearch uses environment variables for all configuration. Create a `.env` file in the `backend/` directory (for local development) or configure these in your hosting provider's dashboard (for production).

### Complete `.env` Template

```env
# ─── Database ──────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@host:5432/dbname

# ─── Authentication ────────────────────────────────────────
JWT_SECRET=your-random-secret-minimum-32-characters
SUPER_ADMIN_EMAIL=admin@yourcompany.com

# ─── WhatsApp Cloud API ───────────────────────────────────
WHATSAPP_API_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_VERIFY_TOKEN=any-random-string-you-create

# ─── AI Analysis (Anthropic Claude) ──────────────────────
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ─── n8n Automation Webhooks ──────────────────────────────
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/genisearch

# ─── Optional ──────────────────────────────────────────────
CORS_ORIGIN=*
PORT=3000
NODE_ENV=production
```

### Variable Reference

---

#### `DATABASE_URL`

**What it does**: Connection string for the PostgreSQL database. Used by the `pg` library's connection pool. In production, SSL is enabled automatically (`rejectUnauthorized: false`).

**Format**: `postgresql://username:password@hostname:port/database_name`

**Where to get it**:
- **Railway**: Add the PostgreSQL plugin to your project. Railway automatically provides `DATABASE_URL` as an environment variable. Navigate to your PostgreSQL service, click "Variables," and copy the connection string.
- **Local development**: Install PostgreSQL locally, create a database (e.g., `createdb genisearch`), and use `postgresql://postgres:yourpassword@localhost:5432/genisearch`.
- **Other providers**: Supabase, Neon, or ElephantSQL all provide connection strings in their dashboards.

**If missing**: The server will crash on startup. The database is required for all operations.

---

#### `JWT_SECRET`

**What it does**: The secret key used to sign and verify JSON Web Tokens for authentication. All login sessions depend on this value.

**Where to get it**: Generate a random string of at least 32 characters. You can use:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**If missing**: Authentication will fail. The `jwt.sign()` and `jwt.verify()` calls will throw errors, making login and all authenticated endpoints unusable.

**Important**: If you change this value in production, all existing user sessions are immediately invalidated and users must log in again.

---

#### `SUPER_ADMIN_EMAIL`

**What it does**: Determines which email address receives the `super_admin` role upon registration. When a user registers with this email, they are automatically assigned super admin privileges instead of the default `analyst` role.

**Where to get it**: Choose the email address of the person who should have full platform access.

**If missing**: No user will be auto-promoted to super admin. You would need to manually update the `role` column in the `users` database table.

---

#### `WHATSAPP_API_TOKEN`

**What it does**: The permanent access token for Meta's WhatsApp Cloud API. Used as a Bearer token in all outbound WhatsApp API calls (sending messages).

**Where to get it**:
1. Go to [Meta Developer Portal](https://developers.facebook.com/).
2. Create or select a Meta App with the WhatsApp product enabled.
3. Navigate to **WhatsApp > Getting Started**.
4. Under "Temporary access token" you can get a short-lived token for testing (expires in 24 hours).
5. For production, create a **System User** in your Meta Business Manager, grant it the WhatsApp permissions, and generate a **permanent token**.

**If missing or starts with `xxx`**: The system enters **WhatsApp stub mode**. All `sendTextMessage()` calls return a simulated response with a fake `wa_message_id` (prefixed `stub_`). Campaign launches still work — messages are logged to the console instead of sent to WhatsApp. This allows full development and testing without WhatsApp API access.

---

#### `WHATSAPP_PHONE_NUMBER_ID`

**What it does**: The Phone Number ID associated with your WhatsApp Business Account. This identifies which WhatsApp number sends the messages.

**Where to get it**:
1. In the [Meta Developer Portal](https://developers.facebook.com/), navigate to your app.
2. Go to **WhatsApp > Getting Started**.
3. The **Phone Number ID** is displayed on this page, below the test phone number.
4. You can also find it under **WhatsApp > Configuration > Phone Numbers**.

**If missing**: Outbound messages will fail because the API URL cannot be constructed (it requires the Phone Number ID in the path). If `WHATSAPP_API_TOKEN` is also missing, stub mode handles this gracefully.

---

#### `WHATSAPP_VERIFY_TOKEN`

**What it does**: A shared secret between your server and Meta, used during webhook verification. When you configure the webhook URL in the Meta Developer Portal, Meta sends a `GET` request with this token to verify ownership.

**Where to get it**: Create any random string. You define it yourself — just make sure the same string is entered in both your environment variables and the Meta Developer Portal webhook configuration.

**Example**: `genisearch_webhook_2024_secure`

**If missing**: Meta's webhook verification will fail, and you will not receive inbound messages or delivery status updates. The rest of the system still works — you just cannot receive replies via the webhook.

---

#### `ANTHROPIC_API_KEY`

**What it does**: The API key for Anthropic's Claude API. Used to analyze customer WhatsApp replies for sentiment, intent, key phrases, and to generate suggested follow-up replies. The system uses the `claude-haiku-4-5-20250401` model for fast, cost-effective analysis.

**Where to get it**:
1. Go to [console.anthropic.com](https://console.anthropic.com/).
2. Sign up or log in.
3. Navigate to **API Keys** in the sidebar.
4. Click **Create Key**, give it a name (e.g., "GeniSearch Production"), and copy the key.
5. Add billing information to your account to enable API usage.

**If missing or starts with `xxx`**: The system enters **AI stub mode**. Sentiment analysis falls back to a keyword-based heuristic:
- Positive words (yes, interested, buy, want, love, great, order, please, send, price) produce a positive sentiment.
- Negative words (no, stop, not interested, unsubscribe, remove, don't, expensive, spam) produce a negative sentiment.
- Questions produce an `inquiry` intent.
- The stub always returns a confidence score of `0.5`.

Stub mode is fully functional for development and testing. Responses are still recorded and can be re-analyzed later when the API key is added.

---

#### `N8N_WEBHOOK_URL`

**What it does**: The URL of your n8n webhook node. GeniSearch fires events to this URL for automation workflows: campaign launches, new customer replies, high-priority customer alerts, negative sentiment alerts, and daily summaries.

**Where to get it**:
1. Set up an [n8n](https://n8n.io/) instance (self-hosted or n8n Cloud).
2. Create a new workflow with a **Webhook** trigger node.
3. Set the HTTP method to `POST`.
4. Copy the webhook URL (e.g., `https://your-n8n.com/webhook/abc123`).
5. Configure downstream nodes for your desired automations (Slack notifications, Google Sheets logging, CRM updates, etc.).

**If missing or starts with `xxx`**: The system enters **webhook stub mode**. All `fireWebhook()` calls log the event payload to the console instead of making HTTP requests. No external automations are triggered, but all other platform features work normally.

**Webhook Events**:

| Event | Trigger | Payload |
|-------|---------|---------|
| `campaign.launched` | Campaign is launched | Campaign details, tenant name, product name |
| `customer.replied` | Customer sends a WhatsApp reply | Response text, sentiment, intent, customer details, campaign name |
| `customer.high_priority` | High-priority customer (score >= 80) engages | Customer details, priority score, engagement metrics |
| `sentiment.negative_alert` | Negative sentiment response detected | Response details, suggested reply, customer info |
| `daily.summary` | Triggered by cron/schedule | Campaigns sent, replies, positive/negative counts, new customers |

---

#### `CORS_ORIGIN`

**What it does**: Configures the `Access-Control-Allow-Origin` header. Controls which frontend domains can make API requests to the backend.

**Default**: `*` (allow all origins).

**When to change**: In production, restrict this to your frontend domain(s) for security:
```
CORS_ORIGIN=https://sohaibrahman365.github.io
```

**If missing**: Defaults to `*`, allowing requests from any origin.

---

#### `PORT`

**What it does**: The port the Express server listens on.

**Default**: `3000`.

**When to change**: Most hosting providers (Railway, Render, Heroku) set `PORT` automatically. You typically do not need to set this manually.

**If missing**: The server starts on port 3000.

---

#### `NODE_ENV`

**What it does**: Controls environment-specific behavior:
- `development`: Enables Morgan HTTP request logging. Database SSL is disabled.
- `production`: Disables verbose logging. Database connects with SSL. Error responses hide internal details.

**Default**: `development` (when unset).

**If missing**: The server runs in development mode with verbose logging and no SSL on database connections.

---

## 5. Deployment Guide

### Backend Deployment on Railway

[Railway](https://railway.app/) is the recommended hosting platform for the GeniSearch backend. The live backend is deployed at:

**https://saaswhatsapp.up.railway.app**

**Step-by-step setup:**

1. **Create a Railway account** at [railway.app](https://railway.app/) and create a new project.

2. **Connect your GitHub repository**:
   - In your Railway project, click "New Service" and select "GitHub Repo."
   - Authorize Railway to access your GitHub account.
   - Select the `SAAS_WhatsApp` repository.
   - Railway auto-detects the Node.js project in the `backend/` directory.

3. **Set the root directory**:
   - In the service settings, set the **Root Directory** to `backend`.
   - This ensures Railway runs `npm install` and `npm start` from the `backend/` folder.

4. **Add PostgreSQL**:
   - In your Railway project, click "New Service" and select "Database > PostgreSQL."
   - Railway provisions the database and automatically injects `DATABASE_URL` into your backend service's environment.

5. **Configure environment variables**:
   - Click on your backend service, then navigate to the "Variables" tab.
   - Add each variable from the `.env` template in Section 4.
   - `DATABASE_URL` is already set if you used Railway's PostgreSQL addon.
   - At minimum, set `JWT_SECRET` and `SUPER_ADMIN_EMAIL`.
   - For WhatsApp, AI, and webhook functionality, add the respective API keys (or leave them unset for stub mode).

6. **Run database migrations**:
   - Use Railway's one-off command feature or the Railway CLI:
     ```bash
     railway run npm run migrate
     railway run npm run seed    # optional: loads mock data
     ```
   - Or connect to the Railway PostgreSQL instance directly and run the SQL files in `backend/db/migrations/`.

7. **Deploy**:
   - Railway auto-deploys on every push to the `main` branch.
   - The first deploy triggers automatically after connecting the repo.
   - Monitor deploy logs in the Railway dashboard.

8. **Verify**:
   - Visit `https://your-app.up.railway.app/api/health`.
   - The response should show `"status": "ok"` and `"db": { "status": "ok" }`.

### Frontend Deployment on GitHub Pages

The frontend (all files in the `files/` directory) is deployed via GitHub Pages using a GitHub Actions workflow.

**Configuration** (already set up in `.github/workflows/deploy.yml`):

- Triggers on every push to the `main` branch.
- Also supports manual trigger via `workflow_dispatch`.
- Uploads the `files/` directory as a GitHub Pages artifact.
- Deploys using the `actions/deploy-pages@v4` action.

**Live URL**: https://sohaibrahman365.github.io/SAAS_WhatsApp/

**What gets deployed**:

All HTML pages, `shared.css`, `shared.js`, and documentation files in the `files/` directory. The frontend communicates with the Railway backend via the `API_BASE` constant defined in `shared.js`:

```javascript
const API_BASE = 'https://saaswhatsapp.up.railway.app/api';
```

**To update the frontend**:

1. Make changes to files in the `files/` directory.
2. Commit and push to `main`.
3. The GitHub Actions workflow automatically deploys the updated files.
4. Changes are live within 1-2 minutes.

**GitHub Pages settings**:

- The workflow requires these repository permissions: `contents: read`, `pages: write`, `id-token: write`.
- These are configured in the workflow file and do not require manual repository settings changes.

---

## 6. Architecture Overview

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Static HTML/CSS/JS | Single-page-style interfaces served from GitHub Pages |
| **Backend** | Node.js + Express.js | RESTful API server handling all business logic |
| **Database** | PostgreSQL | Persistent storage with UUID primary keys and JSONB fields |
| **Authentication** | JWT (bcrypt passwords) | Stateless auth with role-based access control |
| **AI** | Anthropic Claude API (claude-haiku-4-5-20250401) | Sentiment analysis, intent detection, and reply generation |
| **Messaging** | WhatsApp Cloud API (Meta Graph API v19.0) | Outbound WhatsApp messages and inbound webhook processing |
| **Automation** | n8n Webhooks | CRM sync, Slack alerts, Google Sheets logging |
| **Backend Hosting** | Railway | Auto-deploy on push, managed PostgreSQL addon |
| **Frontend Hosting** | GitHub Pages | Automatic deployment via GitHub Actions |

### Multi-Tenant Design

GeniSearch is a multi-tenant platform where each business (tenant) has its own isolated data space.

**Data isolation**:

- Every data table includes a `tenant_id` column (foreign key to `tenants`).
- All API queries filter by `tenant_id` based on the authenticated user's token.
- Super Admins can optionally pass `?tenantId=xxx` to query any tenant's data.
- Non-super-admin users are hard-scoped to their assigned tenant.

**Database schema** (9 core tables):

```
tenants
  |-- users (via tenant_id)
  |-- products (via tenant_id)
  |-- customers (via tenant_id)
  |     |-- customer_engagement_history (via customer_id + tenant_id)
  |     |-- customer_feedback (via customer_id + tenant_id)
  |     +-- customer_preferences (via customer_id + tenant_id)
  |
  +-- campaigns (via tenant_id, linked to product_id)
        |-- campaign_recipients (via campaign_id + customer_id)
        +-- campaign_responses (via campaign_id + recipient_id)
```

**Row-Level Security**: The current implementation enforces tenant isolation at the application layer (query filters in route handlers). The planned enhancement is to enable PostgreSQL Row-Level Security (RLS) policies for defense-in-depth, ensuring that even direct database access respects tenant boundaries.

### Stub Mode Architecture

GeniSearch is designed to work fully without any external API keys. This is achieved through a "stub mode" pattern in each external service:

```
Request arrives
      |
      v
  Is API key configured?
      |           |
     Yes          No
      |           |
      v           v
  Call real    Return simulated
  API          response + log
```

**WhatsApp stub mode** (`backend/services/whatsapp.js`):
- Triggered when `WHATSAPP_API_TOKEN` is missing or starts with `xxx`.
- `sendTextMessage()` returns `{ messages: [{ id: "stub_..." }] }`.
- Messages are logged to the console.
- Campaign launches still create recipient records with stub message IDs.

**AI stub mode** (`backend/services/ai.js`):
- Triggered when `ANTHROPIC_API_KEY` is missing or starts with `xxx`.
- `analyzeResponse()` uses keyword matching to determine sentiment and intent.
- Returns the same JSON structure as the real API: sentiment, sentiment_score, intent, key_phrases, extracted_info, suggested_reply, and confidence.
- Confidence is always `0.5` in stub mode.

**Webhook stub mode** (`backend/routes/webhooks.js`):
- Triggered when `N8N_WEBHOOK_URL` is missing or starts with `xxx`.
- `fireWebhook()` logs the event name and truncated payload to the console.
- No HTTP requests are made.

### Campaign Flow Diagram

```
1. INVENTORY SETUP
   Business uploads product catalog
   Products have geographic + demographic targeting rules
          |
          v
2. CUSTOMER DATABASE
   Customers are added with phone, location, demographics
   Each customer is scoped to a tenant
          |
          v
3. CAMPAIGN CREATION
   Select product (inherits targeting rules)
   Write message template with {{placeholders}}
   Set target segment (all / high_priority / new / inactive)
          |
          v
4. CAMPAIGN LAUNCH
   System queries customers matching campaign targeting
   Excludes do_not_contact customers
   For each customer:
     - Personalize message (replace {{customer_name}}, etc.)
     - Send via WhatsApp Cloud API (or stub)
     - Create campaign_recipient record
          |
          v
5. RESPONSE COLLECTION
   Customer replies arrive via WhatsApp webhook
   System identifies sender + campaign
   Reply recorded in campaign_responses
   Reply count incremented on campaign + recipient
          |
          v
6. AI ANALYSIS
   Each reply is automatically sent to Claude AI
   Returns: sentiment, intent, key_phrases, suggested_reply
   Results stored on the campaign_response record
   (Falls back to keyword heuristic in stub mode)
          |
          v
7. ANALYTICS & REPORTING
   BI dashboards update in real time
   Drill from Platform -> Tenant -> Product -> Campaign -> Response
   Customer engagement scores recalculated
   Priority scores updated for targeting future campaigns
          |
          v
8. AUTOMATION (via n8n webhooks)
   Campaign launch notifications  -> Slack / CRM
   New reply alerts               -> Slack / Google Sheets
   High-priority customer alerts  -> CRM escalation
   Negative sentiment alerts      -> Support team notification
   Daily summary                  -> Management dashboard
```

---

## 7. API Reference

All endpoints require authentication unless noted. Include the JWT token in the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

All responses are JSON. Error responses follow this format:

```json
{
  "error": "Description of the error"
}
```

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/health` | No | Server health check with database status and latency |

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | No | Create a new account. Body: `{ email, password, name, tenantId? }` |
| `POST` | `/api/auth/login` | No | Log in with email and password. Returns JWT token and user profile. |
| `GET` | `/api/auth/me` | Yes | Return current user profile from JWT. |
| `GET` | `/api/auth/google` | No | Google OAuth placeholder (not yet implemented). |

### Tenants

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/api/tenants` | Yes | All | Super Admin sees all tenants; others see their own tenant. |
| `POST` | `/api/tenants` | Yes | Super Admin | Create a new tenant. Body: `{ name, email, phone?, plan? }` |
| `GET` | `/api/tenants/:id` | Yes | All | Get tenant by ID. Access restricted to own tenant (or Super Admin). |

### Products

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/api/products` | Yes | All | List products for the user's tenant. Super Admin can pass `?tenantId=`. |
| `POST` | `/api/products` | Yes | Super Admin, Admin, Manager | Create a product. Body includes name, price, targeting fields. |
| `GET` | `/api/products/:id` | Yes | All | Get a single product by ID. |

### Customers

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/api/customers` | Yes | All | List customers for the user's tenant. |
| `POST` | `/api/customers` | Yes | Super Admin, Admin, Manager | Create or upsert a customer. Body: `{ phone, name?, email?, age?, gender?, city?, region?, country?, source? }` |
| `GET` | `/api/customers/:id` | Yes | All | Get a single customer by ID. |

### Campaigns

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/api/campaigns` | Yes | All | List campaigns for the user's tenant. |
| `POST` | `/api/campaigns` | Yes | Super Admin, Admin, Manager | Create a campaign. Body includes name, product_id, targeting, message_template. |
| `GET` | `/api/campaigns/:id` | Yes | All | Get a single campaign by ID. |
| `PATCH` | `/api/campaigns/:id/status` | Yes | Super Admin, Admin, Manager | Update campaign status. Body: `{ status }`. Allowed: draft, scheduled, active, completed, paused. |
| `POST` | `/api/campaigns/:id/launch` | Yes | Super Admin, Admin, Manager | Launch campaign: find matching customers, send WhatsApp messages, create recipient records. |

### WhatsApp

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/api/whatsapp/webhook` | No | -- | Meta webhook verification (challenge-response). |
| `POST` | `/api/whatsapp/webhook` | No | -- | Inbound messages and status updates from Meta. |
| `POST` | `/api/whatsapp/send` | Yes | Super Admin, Admin | Send a test message. Body: `{ to, message }` |
| `GET` | `/api/whatsapp/status` | Yes | Super Admin, Admin | Check WhatsApp API configuration status. |

### AI Analysis

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/api/ai/status` | Yes | Super Admin, Admin | Check Claude API configuration status. |
| `POST` | `/api/ai/analyze` | Yes | Super Admin, Admin, Manager | Analyze free text. Body: `{ text, campaignId? }` |
| `POST` | `/api/ai/analyze-response/:responseId` | Yes | Super Admin, Admin, Manager | Re-analyze a specific campaign response. |
| `POST` | `/api/ai/bulk-analyze/:campaignId` | Yes | Super Admin, Admin | Analyze all unanalyzed responses for a campaign. |

### BI Analytics

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/api/bi/saas-platform/dashboard` | Yes | Super Admin | Level 1: Platform-wide KPIs, tenant summary, recent campaigns, sentiment. |
| `GET` | `/api/bi/tenant/:tenantId/dashboard` | Yes | All (own tenant) | Level 2: Tenant KPIs, products, campaigns, top customers. |
| `GET` | `/api/bi/product/:productId/dashboard` | Yes | All (own tenant) | Level 3: Product campaigns and sentiment breakdown. |
| `GET` | `/api/bi/campaign/:campaignId/dashboard` | Yes | All (own tenant) | Level 4: Campaign funnel, sentiment, intent, recipients, responses. |
| `GET` | `/api/bi/response/:responseId` | Yes | All (own tenant) | Level 5: Full response detail with customer engagement profile. |
| `GET` | `/api/bi/customer/:phone/engagement` | Yes | All (own tenant) | Customer engagement profile: history, recent responses, feedback, preferences. |

### Webhooks (n8n)

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| `GET` | `/api/webhooks/status` | Yes | Super Admin, Admin | Check n8n webhook configuration status. |
| `POST` | `/api/webhooks/campaign-launched` | Yes | Super Admin, Admin, Manager | Fire `campaign.launched` event. Body: `{ campaignId }` |
| `POST` | `/api/webhooks/new-reply` | Yes | Super Admin, Admin, Manager | Fire `customer.replied` event. Body: `{ responseId }` |
| `POST` | `/api/webhooks/high-priority-alert` | Yes | Super Admin, Admin | Fire `customer.high_priority` event. Body: `{ customerId, tenantId }` |
| `POST` | `/api/webhooks/negative-sentiment-alert` | Yes | Super Admin, Admin | Fire `sentiment.negative_alert` event. Body: `{ responseId }` |
| `POST` | `/api/webhooks/daily-summary` | Yes | Super Admin | Fire `daily.summary` event with 24-hour platform metrics. |

---

*GeniSearch v1.0.0 -- WhatsApp Campaign Engine with AI Analytics*
