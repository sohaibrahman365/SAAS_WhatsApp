# CUSTOMER ENGAGEMENT & RESPONSE TRACKING SYSTEM
## Complete System with Feedback, Analytics, and AI Messaging

**Last Updated:** March 29, 2026  
**Status:** ✅ Production-Ready

---

## 🎯 OVERVIEW

This system tracks:
1. **All campaign messages** sent (1000s of customers)
2. **Customer responses** (who replied, when, what they said)
3. **Engagement metrics** (conversion, sentiment, behavior)
4. **Customer feedback** (ratings, comments, surveys)
5. **Customer segmentation** (prioritization based on responses)
6. **AI-powered messaging** (smart templates + custom messages)

---

## 📊 COMPLETE DATABASE SCHEMA

### **1. CAMPAIGNS TABLE**
```sql
CREATE TABLE campaigns (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id),
    
    -- Campaign Info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),  -- e.g., "Fashion", "Electronics"
    
    -- Targeting
    region VARCHAR(50),     -- "ASIA", "EUROPE"
    country VARCHAR(100),   -- "Pakistan", "Saudi Arabia"
    province VARCHAR(100),  -- "Punjab", "Sindh"
    city VARCHAR(100),      -- "Lahore", "Karachi"
    
    -- Demographics
    target_age_min INT,
    target_age_max INT,
    target_genders JSON,    -- ["Male", "Female"]
    
    -- Message
    message_template TEXT,
    ai_generated BOOLEAN DEFAULT FALSE,
    
    -- Status & Metrics
    status VARCHAR(50),     -- "draft", "scheduled", "sent", "completed"
    sent_count INT DEFAULT 0,
    delivery_count INT DEFAULT 0,
    read_count INT DEFAULT 0,
    reply_count INT DEFAULT 0,
    conversion_count INT DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scheduled_for TIMESTAMP,
    sent_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    INDEX idx_product_id (product_id),
    INDEX idx_status (status),
    INDEX idx_sent_at (sent_at)
);
```

### **2. CAMPAIGN_RECIPIENTS TABLE (NEW!)**
```sql
CREATE TABLE campaign_recipients (
    id UUID PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES campaigns(id),
    customer_id UUID NOT NULL,
    
    -- Customer Info
    customer_name VARCHAR(255),
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(255),
    
    -- Demographics
    age INT,
    gender VARCHAR(50),
    location VARCHAR(255),
    
    -- Message Status
    message_sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP,
    delivered BOOLEAN DEFAULT FALSE,
    delivered_at TIMESTAMP,
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    
    -- Engagement
    replied BOOLEAN DEFAULT FALSE,
    reply_count INT DEFAULT 0,
    
    INDEX idx_campaign_id (campaign_id),
    INDEX idx_customer_id (customer_id),
    INDEX idx_replied (replied),
    INDEX idx_sent_at (sent_at)
);
```

### **3. CAMPAIGN_RESPONSES TABLE (NEW! - TRACKS ALL RESPONSES)**
```sql
CREATE TABLE campaign_responses (
    id UUID PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES campaigns(id),
    recipient_id UUID NOT NULL REFERENCES campaign_recipients(id),
    
    -- Response
    response_text TEXT NOT NULL,
    response_type VARCHAR(50),  -- "text", "image", "order", "inquiry"
    
    -- AI Analysis
    sentiment VARCHAR(20),      -- "positive", "neutral", "negative"
    sentiment_score DECIMAL(3,2), -- 0.0-1.0
    intent VARCHAR(50),         -- "interested", "not_interested", "inquiry", "order", "feedback"
    extracted_info JSON,        -- Extra data from response
    
    -- Auto-Reply Suggestion
    suggested_reply TEXT,
    ai_confidence DECIMAL(3,2),
    
    -- Timestamps
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_campaign_id (campaign_id),
    INDEX idx_recipient_id (recipient_id),
    INDEX idx_sentiment (sentiment),
    INDEX idx_intent (intent),
    INDEX idx_received_at (received_at)
);
```

### **4. CUSTOMER_ENGAGEMENT_HISTORY TABLE (NEW! - TRACKS ALL INTERACTIONS)**
```sql
CREATE TABLE customer_engagement_history (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id),
    customer_id UUID NOT NULL,
    
    -- Customer Info
    customer_phone VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255),
    
    -- Engagement Data
    total_messages_received INT DEFAULT 0,
    total_messages_replied INT DEFAULT 0,
    reply_rate DECIMAL(5,2),      -- Percentage
    
    total_campaigns_targeted INT DEFAULT 0,
    total_conversions INT DEFAULT 0,
    conversion_rate DECIMAL(5,2),
    
    last_engagement_date TIMESTAMP,
    last_engagement_type VARCHAR(50), -- "message", "order", "inquiry"
    
    -- Sentiment Tracking
    avg_sentiment_score DECIMAL(3,2),
    positive_responses INT DEFAULT 0,
    neutral_responses INT DEFAULT 0,
    negative_responses INT DEFAULT 0,
    
    -- Priority Score (For Next Campaign)
    priority_score INT DEFAULT 50,  -- 1-100
    -- High scorers: engaged, replied, converted
    -- Low scorers: ignored, negative responses
    
    -- Metadata
    first_contact_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_product_id (product_id),
    INDEX idx_customer_id (customer_id),
    INDEX idx_priority_score (priority_score),
    INDEX idx_reply_rate (reply_rate),
    INDEX idx_conversion_rate (conversion_rate)
);
```

### **5. CUSTOMER_FEEDBACK TABLE (NEW! - FEEDBACK & SURVEYS)**
```sql
CREATE TABLE customer_feedback (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id),
    customer_id UUID NOT NULL,
    
    -- Feedback Info
    feedback_type VARCHAR(50),  -- "service_quality", "product_quality", "price", "delivery"
    rating INT,                 -- 1-5 stars
    comment TEXT,
    
    -- Detailed Ratings
    service_quality_rating INT,  -- 1-5
    product_quality_rating INT,  -- 1-5
    price_rating INT,            -- 1-5 (1=too expensive, 5=great value)
    delivery_rating INT,         -- 1-5
    communication_rating INT,    -- 1-5
    
    -- Tags
    tags JSON,  -- ["friendly", "fast", "professional"] or ["slow", "rude", "expensive"]
    
    -- AI Analysis
    sentiment VARCHAR(20),      -- "positive", "neutral", "negative"
    key_themes JSON,           -- ["Fast delivery", "Good pricing"] extracted by AI
    action_items JSON,         -- Issues to address
    
    -- Metadata
    campaign_id UUID REFERENCES campaigns(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_product_id (product_id),
    INDEX idx_customer_id (customer_id),
    INDEX idx_rating (rating),
    INDEX idx_sentiment (sentiment)
);
```

### **6. CUSTOMER_PREFERENCES TABLE (NEW! - FOR TARGETED MESSAGING)**
```sql
CREATE TABLE customer_preferences (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id),
    customer_id UUID NOT NULL,
    
    -- Preference Categories
    preferred_categories JSON,      -- ["Fashion", "Electronics"]
    preferred_price_range VARCHAR(50), -- "Budget", "Mid-range", "Premium"
    preferred_brands JSON,
    
    -- Communication Preferences
    preferred_message_type VARCHAR(50), -- "promotional", "educational", "offers"
    preferred_frequency VARCHAR(50),    -- "daily", "weekly", "monthly"
    best_time_to_contact VARCHAR(50),   -- "morning", "afternoon", "evening"
    
    -- DoNotContact
    do_not_contact BOOLEAN DEFAULT FALSE,
    do_not_contact_reason VARCHAR(255),
    do_not_contact_date TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_product_id (product_id),
    INDEX idx_customer_id (customer_id)
);
```

---

## 🔄 HOW IT WORKS: END-TO-END FLOW

### **Step 1: Send Campaign (1000 customers)**
```
Action: Send campaign to 1000 customers
Database Entry:
├─ campaigns: 1 row (campaign details)
├─ campaign_recipients: 1000 rows (1 per customer)
│  ├─ customer_phone, customer_name
│  ├─ message_sent = TRUE
│  ├─ sent_at = TIMESTAMP
│  └─ replied = FALSE (initially)
└─ customer_engagement_history: Updated for each customer
```

### **Step 2: Track Responses (100 customers reply)**
```
Action: 100 customers reply with messages
Database Entry:
├─ campaign_recipients: 100 rows updated
│  ├─ replied = TRUE
│  ├─ reply_count = 1 (or more if multiple replies)
│  └─ read = TRUE
│
├─ campaign_responses: 100 rows created
│  ├─ response_text = "I'm interested"
│  ├─ sentiment = "positive"
│  ├─ intent = "interested"
│  └─ suggested_reply = AI-generated suggestion
│
└─ customer_engagement_history: Updated
   ├─ total_messages_replied = +1
   ├─ reply_rate = (100/1000) = 10%
   ├─ avg_sentiment_score = calculated
   └─ priority_score = INCREASED (showed interest!)
```

### **Step 3: Analytics & Reporting**
```
Dashboard Shows:
├─ Campaign metrics:
│  ├─ Sent: 1000 ✓
│  ├─ Replied: 100 (10% reply rate)
│  ├─ Converted: 25 (2.5% conversion)
│  └─ Sentiment: 70% positive, 20% neutral, 10% negative
│
└─ Customer segments:
   ├─ High Priority: 100 (replied + positive)
   ├─ Medium Priority: 50 (interacted, neutral)
   └─ Low Priority: 850 (no response or negative)
```

### **Step 4: Next Campaign - Smart Prioritization**
```
Next time search on same parameters:
Option 1: Prioritize High Responders
└─ Target the 100 who replied first (70% conversion)

Option 2: Prioritize Converters
└─ Send to 25 who ordered (100% conversion)

Option 3: Re-engage Medium Tier
└─ Send to 50 who were neutral (test new message)

Option 4: Try New Audience
└─ Avoid the 850 who didn't reply (low priority)
```

---

## 📱 API ENDPOINTS

### **1. Send Campaign**
```javascript
POST /api/campaigns
Body: {
    product_id: "prod_123",
    name: "March Fashion Sale",
    message_template: "Check out our new collection!",
    categories: "Fashion,Accessories",
    region: "ASIA",
    country: "Pakistan",
    province: "Punjab",
    city: "Lahore",
    target_age_min: 18,
    target_age_max: 45,
    target_genders: ["Male", "Female"],
    recipients_count: 1000
}

Response: {
    campaign_id: "camp_123",
    recipients_created: 1000,
    message_queued: true,
    estimated_delivery: "2 hours"
}
```

### **2. Track Response**
```javascript
POST /api/campaigns/:id/response
Body: {
    customer_phone: "+923001234567",
    response_text: "I'm interested! Send me more details.",
    response_type: "text"
}

Response: {
    response_id: "resp_456",
    sentiment: "positive",
    intent: "interested",
    priority_updated: true,
    new_priority_score: 85
}
```

### **3. Get Customer Engagement History**
```javascript
GET /api/customers/:phone/engagement
Response: {
    customer_phone: "+923001234567",
    total_messages_received: 5,
    total_replies: 2,
    reply_rate: 40,
    conversions: 1,
    conversion_rate: 20,
    priority_score: 85,
    avg_sentiment: "positive",
    engagement_timeline: [...]
}
```

### **4. Get Campaign Analytics**
```javascript
GET /api/campaigns/:id/analytics
Response: {
    campaign_id: "camp_123",
    sent: 1000,
    replies: 100,
    reply_rate: 10,
    conversions: 25,
    conversion_rate: 2.5,
    sentiment_breakdown: {
        positive: 70,
        neutral: 20,
        negative: 10
    },
    top_intents: ["interested", "inquiry", "order"],
    demographics: {...}
}
```

### **5. Submit Feedback**
```javascript
POST /api/feedback
Body: {
    customer_id: "cust_123",
    product_id: "prod_123",
    rating: 5,
    service_quality: 5,
    product_quality: 4,
    price_rating: 4,
    delivery_rating: 5,
    comment: "Great experience! Highly recommended.",
    tags: ["fast", "friendly", "professional"]
}

Response: {
    feedback_id: "fb_789",
    sentiment: "positive",
    recorded: true
}
```

---

## 🎯 PRIORITY SCORING ALGORITHM

```javascript
// Calculate priority score for next campaign (1-100)
function calculatePriorityScore(customer) {
    let score = 50; // Base score
    
    // Response behavior (+/-20)
    if (customer.reply_rate > 50) score += 20;  // Highly responsive
    else if (customer.reply_rate > 20) score += 10;
    else if (customer.reply_rate === 0) score -= 20; // Never replies
    
    // Conversion behavior (+/-15)
    if (customer.conversion_rate > 10) score += 15;  // High converter
    else if (customer.conversion_rate > 5) score += 8;
    else if (customer.conversion_rate === 0) score -= 10; // Never converts
    
    // Sentiment (+/-15)
    if (customer.avg_sentiment === "positive") score += 15;
    else if (customer.avg_sentiment === "neutral") score += 5;
    else if (customer.avg_sentiment === "negative") score -= 15;
    
    // Recency (+/-10)
    const days_since_last = daysAgo(customer.last_engagement_date);
    if (days_since_last < 7) score += 10;      // Very recent
    else if (days_since_last < 30) score += 5;
    else if (days_since_last > 180) score -= 10; // Long inactive
    
    // Engagement consistency (+/-10)
    if (customer.total_campaigns_targeted > 10 && customer.reply_rate > 20) {
        score += 10; // Consistent engager
    }
    
    // Cap between 1-100
    return Math.max(1, Math.min(100, score));
}

// Results:
// 80-100: PRIORITY 1 (Send first, premium messaging)
// 60-79:  PRIORITY 2 (Send second, standard messaging)
// 40-59:  PRIORITY 3 (Send third, test new messaging)
// 20-39:  PRIORITY 4 (Send with caution, new approach)
// 1-19:   PRIORITY 5 (Don't send, or exclude)
```

---

## 🎨 INTERFACE COMPONENTS (To Be Created)

### **1. Customer Feedback Dashboard**
```
Features:
├─ Graphical ratings display (1-5 stars)
├─ Sentiment pie chart (positive/neutral/negative)
├─ Rating breakdown by category
├─ Word cloud of customer comments
├─ Trends over time
├─ Top complaints/praise
└─ Detailed reports with filters
```

### **2. Engagement Analytics Dashboard**
```
Features:
├─ Campaign performance metrics
├─ Reply rate trends
├─ Conversion funnel
├─ Customer priority distribution
├─ Response timeline
├─ Sentiment analysis charts
└─ Engagement by demographics
```

### **3. Targeted Messaging Interface**
```
Features:
├─ Create message templates
├─ AI-powered message suggestions
├─ Customer segmentation options
├─ Personalization placeholders
├─ Preview before sending
├─ Schedule delivery
├─ Track performance
└─ A/B testing
```

---

## 📋 CUSTOMER CATEGORIES FOR TARGETING

### **Predefined Categories**
```
1. HIGH-VALUE CUSTOMERS
   └─ Criteria: reply_rate > 50%, conversion_rate > 10%
   └─ Action: Premium offers, VIP treatment
   
2. FREQUENT BUYERS
   └─ Criteria: conversion_rate > 5%, positive sentiment
   └─ Action: Loyalty rewards, new product previews
   
3. ENGAGED BUT NOT CONVERTING
   └─ Criteria: reply_rate > 30%, conversion_rate < 5%
   └─ Action: Educational content, testimonials
   
4. PRICE-SENSITIVE
   └─ Criteria: inquire about price, price_rating < 3
   └─ Action: Discounts, value messaging
   
5. SERVICE-CONCERNED
   └─ Criteria: delivery_rating < 3 or communication_rating < 3
   └─ Action: Improve service messaging, guarantees
   
6. INACTIVE
   └─ Criteria: reply_rate = 0%, last_engagement > 90 days
   └─ Action: Win-back campaigns, special offers
   
7. BRAND AMBASSADORS
   └─ Criteria: reply_rate > 50%, positive sentiment > 80%
   └─ Action: Referral rewards, user-generated content
   
8. DO NOT CONTACT
   └─ Criteria: Explicitly opted out
   └─ Action: None (respects preference)
```

### **Custom Categories (User-Defined)**
```
Allow users to create custom segments like:
├─ "Lahore Fashionistas"
├─ "Budget Electronics Buyers"
├─ "Luxury Fashion Enthusiasts"
├─ "Fast Fashion Trending Followers"
└─ Any combination of criteria
```

---

## 🤖 AI-POWERED MESSAGE GENERATION

### **Available AI Features**

```
1. SMART TEMPLATES
   Input: Category, customer segment, goal
   Output: Multiple message options
   
   Example:
   Category: "Fashion"
   Segment: "High-Value Customers"
   Goal: "Promote new collection"
   
   Output Options:
   ├─ "Exclusive access to our spring collection..."
   ├─ "As our valued customer, first access to..."
   └─ "VIP preview: Limited edition pieces..."

2. PERSONALIZATION
   Input: Customer name, preference, history
   Output: Personalized message
   
   Example:
   "Hi {{customer_name}}, we know you love {{preferred_category}}..."

3. SENTIMENT-AWARE
   Input: Customer's past sentiment
   Output: Tone-matched message
   
   Example:
   Positive customer: Exciting, enthusiastic tone
   Neutral customer: Informative, factual tone
   Negative customer: Apologetic, solutions-focused tone

4. DYNAMIC OFFERS
   Input: Customer segment, purchase history
   Output: Personalized offer
   
   Example:
   High-spender: Premium products at same price tier
   Budget buyer: Discounted bundles
   Long-inactive: Special comeback offer

5. CALL-TO-ACTION OPTIMIZER
   Input: Customer intent from past responses
   Output: Best CTA
   
   Example:
   For "Interested": "Shop Now" or "View Details"
   For "Price-checking": "See our offers"
   For "Inquiry": "Contact our team"
```

### **AI Message Composition Flow**

```
┌─────────────────────────────────────┐
│ 1. Select Customer Segment          │
│    (High-value, Inactive, etc.)     │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│ 2. Choose Message Purpose           │
│    (Promote, Educate, Win-back)     │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│ 3. AI Generates 3 Message Options   │
│    (Different tones & approaches)   │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│ 4. Select Base Template or Edit     │
│    (Customize as needed)            │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│ 5. Add Personalization              │
│    (Names, preferences, offers)     │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│ 6. Preview & Schedule               │
│    (Review before sending)          │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│ 7. Track Performance                │
│    (Monitor response rate)          │
└─────────────────────────────────────┘
```

---

## 📊 REPORTING FEATURES

### **1. Customer Feedback Report**
```
Includes:
├─ Average ratings by category
├─ Sentiment distribution
├─ Word clouds of common themes
├─ Top 10 positive feedback
├─ Top 10 negative feedback
├─ Feedback trends over time
├─ Action items to address
└─ Export options (PDF, CSV, Excel)
```

### **2. Campaign Performance Report**
```
Includes:
├─ Send/delivery/read rates
├─ Reply rate by demographics
├─ Conversion rates
├─ Customer segments performance
├─ Message A/B test results
├─ ROI calculation
├─ Best/worst performing messages
└─ Recommendations for next campaign
```

### **3. Customer Engagement Report**
```
Includes:
├─ Customer segmentation breakdown
├─ Priority score distribution
├─ Response patterns by segment
├─ Conversion funnel
├─ Churn analysis
├─ Lifetime value calculation
├─ Engagement trends
└─ Predictive insights
```

---

## ✨ KEY FEATURES SUMMARY

```
✅ Track all 1000+ customer responses
✅ Analyze sentiment of each response
✅ Identify customer intent
✅ Calculate priority scores
✅ Segment customers automatically
✅ Create custom segments
✅ Generate AI-powered messages
✅ Personalize at scale
✅ Collect feedback & ratings
✅ Create detailed reports
✅ Visualize data graphically
✅ Export reports (PDF, CSV)
✅ Schedule messages
✅ A/B test messages
✅ Track ROI & conversions
✅ Predict customer lifetime value
```

---

**Ready for implementation! 🚀**

All database tables, APIs, and workflows defined.
Next: Build the interfaces.
