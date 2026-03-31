-- ============================================================
-- GeniSearch — Mock Seed Data
-- Seeds: 001_mock_data.sql
-- ============================================================

-- ── TENANTS ─────────────────────────────────────────────────
INSERT INTO tenants (id, name, email, phone, plan, status, mrr) VALUES
('11111111-0000-0000-0000-000000000001', 'Zara Fashion PK',     'admin@zarafashion.pk',   '+923001111001', 'enterprise', 'active', 85000),
('11111111-0000-0000-0000-000000000002', 'FreshMart Grocery',   'admin@freshmart.pk',     '+923001111002', 'pro',        'active', 45000),
('11111111-0000-0000-0000-000000000003', 'AutoZone Motors',     'admin@autozone.pk',      '+923001111003', 'pro',        'active', 45000),
('11111111-0000-0000-0000-000000000004', 'MediPlus Pharma',     'admin@mediplus.pk',      '+923001111004', 'business',   'active', 25000),
('11111111-0000-0000-0000-000000000005', 'TechGadgets PK',      'admin@techgadgets.pk',   '+923001111005', 'pro',        'active', 45000),
('11111111-0000-0000-0000-000000000006', 'EduBridge Academy',   'admin@edubridge.pk',     '+923001111006', 'business',   'active', 25000)
ON CONFLICT (email) DO NOTHING;

-- ── PRODUCTS ────────────────────────────────────────────────
INSERT INTO products (id, tenant_id, name, price, description, categories, region, country, province, city, timezone, target_age_min, target_age_max, target_genders, customer_count) VALUES
('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
 'Spring Formal Collection 2026', 3500,
 'Premium formal wear for women — office & events',
 '["Fashion","Formal Wear","Women"]', 'ASIA', 'Pakistan', 'Punjab', 'Lahore', 'UTC+5',
 26, 45, '["Female"]', 1247),

('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
 'Eid Collection 2026', 4200,
 'Festive wear — lawn & embroidered suits',
 '["Fashion","Festive","Eid"]', 'ASIA', 'Pakistan', 'Punjab', 'Lahore', 'UTC+5',
 18, 55, '["Female"]', 980),

('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002',
 'Weekly Grocery Bundle', 1800,
 'Fresh vegetables, fruits & pantry essentials',
 '["Grocery","Food","Daily Essentials"]', 'ASIA', 'Pakistan', 'Sindh', 'Karachi', 'UTC+5',
 25, 55, '["Male","Female"]', 2100),

('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000003',
 'Engine Oil 20W-50 Deal', 2200,
 'Genuine engine oil — 4L pack with free filter',
 '["Automotive","Engine Oil","Maintenance"]', 'ASIA', 'Pakistan', 'Punjab', 'Lahore', 'UTC+5',
 25, 50, '["Male"]', 850),

('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000005',
 'Samsung Galaxy A55 5G', 89000,
 'Latest Samsung mid-range — 5G, 50MP camera',
 '["Electronics","Mobile","Samsung"]', 'ASIA', 'Pakistan', 'Punjab', 'Islamabad', 'UTC+5',
 18, 35, '["Male","Female"]', 1500)
ON CONFLICT DO NOTHING;

-- ── CUSTOMERS ───────────────────────────────────────────────
INSERT INTO customers (id, tenant_id, name, phone, email, age, gender, city, region, country) VALUES
('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Ayesha Malik',    '+923214567001', 'ayesha@email.com',  32, 'Female', 'Lahore',     'ASIA', 'Pakistan'),
('33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Sana Tariq',      '+923214567002', 'sana@email.com',    28, 'Female', 'Lahore',     'ASIA', 'Pakistan'),
('33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'Fatima Khan',     '+923214567003', 'fatima@email.com',  35, 'Female', 'Islamabad',  'ASIA', 'Pakistan'),
('33333333-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'Nadia Ahmed',     '+923214567004', 'nadia@email.com',   30, 'Female', 'Lahore',     'ASIA', 'Pakistan'),
('33333333-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'Hira Butt',       '+923214567005', 'hira@email.com',    27, 'Female', 'Multan',     'ASIA', 'Pakistan'),
('33333333-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000002', 'Tariq Mehmood',   '+923214567006', 'tariq@email.com',   42, 'Male',   'Karachi',    'ASIA', 'Pakistan'),
('33333333-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000002', 'Usman Raza',      '+923214567007', 'usman@email.com',   38, 'Male',   'Karachi',    'ASIA', 'Pakistan'),
('33333333-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000003', 'Ali Hassan',      '+923214567008', 'ali@email.com',     34, 'Male',   'Lahore',     'ASIA', 'Pakistan'),
('33333333-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000005', 'Bilal Sheikh',    '+923214567009', 'bilal@email.com',   24, 'Male',   'Islamabad',  'ASIA', 'Pakistan'),
('33333333-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000005', 'Kamran Iqbal',    '+923214567010', 'kamran@email.com',  29, 'Male',   'Rawalpindi', 'ASIA', 'Pakistan')
ON CONFLICT (tenant_id, phone) DO NOTHING;

-- ── CAMPAIGNS ───────────────────────────────────────────────
INSERT INTO campaigns (id, tenant_id, product_id, name, message_template, status, sent_count, delivery_count, read_count, reply_count, conversion_count, sent_at, completed_at) VALUES
('44444444-0000-0000-0000-000000000001',
 '11111111-0000-0000-0000-000000000001',
 '22222222-0000-0000-0000-000000000001',
 'Spring Sale 2026',
 'Assalam o Alaikum {{customer_name}}! Spring has arrived at Zara Fashion. Our exclusive formal collection starts from PKR 3,500. Reply YES for a special 15% discount just for you! 🌸',
 'completed', 1200, 1178, 834, 142, 38,
 NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days'),

('44444444-0000-0000-0000-000000000002',
 '11111111-0000-0000-0000-000000000001',
 '22222222-0000-0000-0000-000000000002',
 'Eid Pre-Order Launch',
 'Eid Mubarak in advance, {{customer_name}}! 🌙 Pre-order your Eid outfit now and get FREE delivery. Limited stock available — reply ORDER to reserve yours!',
 'active', 980, 961, 712, 98, 24,
 NOW() - INTERVAL '2 days', NULL),

('44444444-0000-0000-0000-000000000003',
 '11111111-0000-0000-0000-000000000002',
 '22222222-0000-0000-0000-000000000003',
 'Weekly Grocery Deal',
 'Hi {{customer_name}}! FreshMart here 🥦 Get this week''s grocery bundle for just PKR 1,800 — delivered to your door in 2 hours. Reply CART to order now!',
 'completed', 2100, 2067, 1450, 280, 95,
 NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day'),

('44444444-0000-0000-0000-000000000004',
 '11111111-0000-0000-0000-000000000003',
 '22222222-0000-0000-0000-000000000004',
 'Engine Oil Promo',
 'Salam {{customer_name}}! AutoZone Motors 🚗 Get genuine 20W-50 engine oil 4L + FREE filter for PKR 2,200 only. Offer ends Sunday. Reply OIL to grab this deal!',
 'completed', 850, 831, 520, 72, 18,
 NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days'),

('44444444-0000-0000-0000-000000000005',
 '11111111-0000-0000-0000-000000000005',
 '22222222-0000-0000-0000-000000000005',
 'Galaxy A55 Launch',
 'Hi {{customer_name}}! TechGadgets 📱 Samsung Galaxy A55 5G is NOW available — PKR 89,000 with 1-year warranty + FREE screen protector. Reply PHONE to know more!',
 'active', 1500, 1480, 1100, 187, 42,
 NOW() - INTERVAL '1 day', NULL)
ON CONFLICT DO NOTHING;

-- ── CAMPAIGN_RECIPIENTS (sample — first campaign) ────────────
INSERT INTO campaign_recipients (campaign_id, customer_id, customer_name, customer_phone, message_sent, delivered, read, replied, converted, sent_at, delivered_at, read_at) VALUES
('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001',
 'Ayesha Malik',  '+923214567001', TRUE, TRUE, TRUE,  TRUE,  TRUE,  NOW()-INTERVAL '7d', NOW()-INTERVAL '7d', NOW()-INTERVAL '6d 20h'),
('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002',
 'Sana Tariq',    '+923214567002', TRUE, TRUE, TRUE,  TRUE,  FALSE, NOW()-INTERVAL '7d', NOW()-INTERVAL '7d', NOW()-INTERVAL '6d 22h'),
('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003',
 'Fatima Khan',   '+923214567003', TRUE, TRUE, FALSE, FALSE, FALSE, NOW()-INTERVAL '7d', NOW()-INTERVAL '7d', NULL),
('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000004',
 'Nadia Ahmed',   '+923214567004', TRUE, TRUE, TRUE,  TRUE,  TRUE,  NOW()-INTERVAL '7d', NOW()-INTERVAL '7d', NOW()-INTERVAL '6d 18h'),
('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000005',
 'Hira Butt',     '+923214567005', TRUE, TRUE, TRUE,  FALSE, FALSE, NOW()-INTERVAL '7d', NOW()-INTERVAL '7d', NOW()-INTERVAL '6d 23h')
ON CONFLICT (campaign_id, customer_id) DO NOTHING;

-- ── CAMPAIGN_RESPONSES (sample) ─────────────────────────────
INSERT INTO campaign_responses (campaign_id, recipient_id, response_text, sentiment, sentiment_score, intent, key_phrases, suggested_reply, ai_analyzed, received_at)
SELECT
    '44444444-0000-0000-0000-000000000001',
    cr.id,
    resp.response_text,
    resp.sentiment,
    resp.sentiment_score,
    resp.intent,
    resp.key_phrases::JSONB,
    resp.suggested_reply,
    TRUE,
    NOW() - INTERVAL '6 days'
FROM campaign_recipients cr
JOIN (VALUES
    ('+923214567001', 'Yes please! I love the Spring collection. Can I get the 15% discount on the formal suit?',
     'positive', 0.92, 'interested', '["discount","formal suit","love"]',
     'Thank you Ayesha! Your 15% discount code is SPRING15. Visit zarafashion.pk or reply with your size to order!'),
    ('+923214567002', 'What sizes do you have? I need XL in the formal suits',
     'positive', 0.78, 'inquiry', '["sizes","XL","formal suits"]',
     'Hi Sana! We have sizes S, M, L, XL, XXL in stock. Reply with your preferred color and we will confirm availability!'),
    ('+923214567004', 'Interested! Please send me the catalogue',
     'positive', 0.85, 'interested', '["catalogue","interested"]',
     'Hi Nadia! Sending you our digital catalogue link: zarafashion.pk/spring2026 — enjoy 15% off with code SPRING15!')
) AS resp(phone, response_text, sentiment, sentiment_score, intent, key_phrases, suggested_reply)
ON cr.customer_phone = resp.phone
AND cr.campaign_id = '44444444-0000-0000-0000-000000000001';

-- ── CUSTOMER_ENGAGEMENT_HISTORY ─────────────────────────────
INSERT INTO customer_engagement_history
(tenant_id, customer_id, total_messages_received, total_messages_replied, reply_rate, total_campaigns_targeted, total_conversions, conversion_rate, avg_sentiment_score, positive_responses, priority_score, last_engagement_date, first_contact_date)
VALUES
('11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 3, 3, 100.00, 3, 2, 66.67, 0.91, 3, 92, NOW()-INTERVAL '6d', NOW()-INTERVAL '90d'),
('11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002', 3, 2, 66.67,  3, 0, 0,     0.78, 2, 74, NOW()-INTERVAL '6d', NOW()-INTERVAL '60d'),
('11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', 2, 0, 0,      2, 0, 0,     0.5,  0, 35, NOW()-INTERVAL '7d', NOW()-INTERVAL '45d'),
('11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000004', 3, 2, 66.67,  3, 1, 33.33, 0.85, 2, 80, NOW()-INTERVAL '6d', NOW()-INTERVAL '120d'),
('11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000005', 2, 0, 0,      2, 0, 0,     0.5,  0, 42, NOW()-INTERVAL '7d', NOW()-INTERVAL '30d')
ON CONFLICT (tenant_id, customer_id) DO NOTHING;
