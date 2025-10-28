# 🎯 WhatsApp SaaS - 7 Day Trial System Plan

## 📋 Table of Contents
1. [Overview](#overview)
2. [Pricing Structure](#pricing-structure)
3. [User Flow](#user-flow)
4. [Anti-Abuse Mechanism](#anti-abuse-mechanism)
5. [Email Notifications](#email-notifications)
6. [Database Schema](#database-schema)
7. [Agent Instructions](#agent-instructions)
8. [Implementation Checklist](#implementation-checklist)

---

## 📝 Overview

### Core Concept
```
Customer Signs Up → Gets 7 Days Trial (NO CARD NEEDED)
├─ Can add: 1 subaccount only
├─ Multiple sessions within that 1 subaccount (unlimited)
├─ Try to add 2nd subaccount → Popup: "Please Upgrade"
└─ Location linked to email permanently (anti-abuse)
```

### Key Features
- ✅ **7 days free trial** - No credit card required
- ✅ **1 subaccount limit** during trial
- ✅ **Unlimited WhatsApp sessions** within that 1 subaccount
- ✅ **Location anti-abuse** - Track which locations are used
- ✅ **Automatic email reminders** - 3 days left, 1 day left
- ✅ **Upgrade prompts** - When user hits limits
- ✅ **Trial expiry notification** - Email on day 8

---

## 💰 Pricing Structure

| Plan | Price | Subaccounts | Trial Period | Ideal For |
|------|-------|-------------|--------------|-----------|
| **Free Trial** | $0 | 1 | 7 days | Testing |
| **Starter** | $19/month | 3 | - | Small businesses |
| **Professional** | $49/month | 10 | - | Growing agencies |

### Plan Features

#### Free Trial
- ✅ 1 GoHighLevel location
- ✅ Unlimited WhatsApp sessions
- ✅ 7 days full access
- ✅ No credit card required
- ❌ Cannot add more subaccounts

#### Starter Plan ($19/month)
- ✅ 3 GoHighLevel locations
- ✅ Unlimited WhatsApp sessions per location
- ✅ Priority email support
- ✅ Access to all integrations

#### Professional Plan ($49/month)
- ✅ 10 GoHighLevel locations
- ✅ Unlimited WhatsApp sessions per location
- ✅ Priority support + phone support
- ✅ API access
- ✅ Advanced analytics

---

## 🔄 User Flow

### 1. Signup Flow

#### Step-by-Step:
```
1. User visits website → Clicks "Sign Up"
2. Fills form:
   ├─ Name: "John Doe"
   ├─ Email: "john@example.com"
   ├─ Password: "secure_password"
   └─ [Sign Up] button
3. Backend creates account:
   ├─ subscription_status = 'trial'
   ├─ trial_started_at = NOW()
   ├─ trial_ends_at = NOW() + 7 days
   ├─ max_subaccounts = 1
   └─ total_subaccounts = 0
4. Welcome email sent
5. Redirect to dashboard
```

#### Screen Flow:
```
┌─────────────────────────────┐
│    Sign Up Page              │
│                              │
│  Name: [________]           │
│  Email: [________]          │
│  Password: [________]       │
│                              │
│  [Sign Up Free]             │
│                              │
│  Already have account?       │
│  [Login]                    │
└─────────────────────────────┘
       ↓
┌─────────────────────────────┐
│    Dashboard                │
│                              │
│  🆓 Free Trial - 7 days    │
│                              │
│  [Add Subaccount] button    │
└─────────────────────────────┘
```

---

### 2. Adding First Subaccount (Allowed)

```
User clicks "Add Subaccount"
  ↓
OAuth flow starts
  ↓
User selects GoHighLevel location
  ↓
System checks:
  ├─ Is this location already used? 
  │  └─ NO → Allow & Save to used_locations
  └─ Current subaccount count < max_subaccounts?
     └─ YES → Allow
  ↓
Subaccount added successfully ✅
```

### 3. Trying to Add 2nd Subaccount (Blocked)

```
User clicks "Add Subaccount" (already has 1)
  ↓
System checks trial limit:
  ├─ trial_status === 'trial' ✓
  ├─ total_subaccounts === 1 ✓
  └─ max_subaccounts === 1 ✓
  ↓
❌ SHOW UPGRADE MODAL:

┌─────────────────────────────────┐
│  ⚠️ Plan Limit Reached           │
│                                  │
│  Your free trial allows only    │
│  1 subaccount.                  │
│                                  │
│  Upgrade to add more:            │
│                                  │
│  ┌──────────────────┐          │
│  │  Starter Plan    │          │
│  │  $19/month       │          │
│  │  3 subaccounts   │          │
│  └──────────────────┘          │
│                                  │
│  ┌──────────────────┐          │
│  │ Professional     │          │
│  │ $49/month        │          │
│  │ 10 subaccounts   │          │
│  └──────────────────┘          │
│                                  │
│  [Upgrade Now]  [Cancel]        │
└─────────────────────────────────┘
```

### 4. Location Anti-Abuse Flow

#### Scenario: User tries to use already-used location

```
User A: trial_user@email.com
  ├─ Adds location_id = "GHL-12345" ✅
  ├─ Record saved: used_locations { location_id: "GHL-12345", email: "trial_user@email.com" }
  └─ Deletes subaccount from dashboard
     ├─ ghl_accounts: DELETED
     └─ used_locations: is_active = false (KEPT!)

User B: another@email.com (tries same location)
  ├─ Attempts to add location_id = "GHL-12345"
  └─ System checks: SELECT * FROM used_locations WHERE location_id = 'GHL-12345'
     └─ Found: { email: "trial_user@email.com", is_active: false }
     
❌ ERROR MODAL:

┌────────────────────────────────────────────┐
│  ⚠️ Location Already Linked                │
│                                             │
│  This GoHighLevel location (GHL-12345)     │
│  is already linked with another account:   │
│                                             │
│  📧 trial_user@email.com                  │
│                                             │
│  Please upgrade your plan to use multiple   │
│  locations or contact support.             │
│                                             │
│  [Upgrade Now]  [Contact Support]         │
└────────────────────────────────────────────┘
```

---

### 5. Trial Expiry Flow

```
Day 8 - Trial Expired
  ↓
System updates:
  ├─ subscription_status = 'expired'
  └─ Blocks message sending
  ↓
Email sent to user:
  ├─ Subject: "Your trial has ended"
  └─ Message: "Upgrade to continue"
  ↓
Dashboard shows:
  ├─ Expired banner
  └─ Upgrade CTA
```

---

## 🛡️ Anti-Abuse Mechanism

### How It Works

#### 1. Location Tracking
```sql
CREATE TABLE used_locations (
  id UUID PRIMARY KEY,
  location_id VARCHAR(255) UNIQUE,  -- GHL location ID
  user_id UUID,
  email VARCHAR(255),               -- Original owner's email
  is_active BOOLEAN,                -- false if subaccount deleted
  first_used_at TIMESTAMP,
  last_active_at TIMESTAMP
);
```

**Key Rule**: `used_locations` table is **PERMANENT**.
- Even if `ghl_accounts` record is deleted
- `used_locations` record stays
- Prevents location reuse by different emails

#### 2. User Signup Tracking
```sql
CREATE TABLE trial_signups (
  id UUID PRIMARY KEY,
  email VARCHAR(255),
  ip_address VARCHAR(255),
  user_agent TEXT,
  created_at TIMESTAMP
);
```

**Limits**:
- Max 3 trials per IP in 30 days
- Blocks disposable email domains
- Tracks device fingerprinting

#### 3. Subaccount Limit Enforcement

**Frontend Check** (Before OAuth):
```typescript
// Check if user can add more subaccounts
const { data: user } = await supabase
  .from('users')
  .select('total_subaccounts, max_subaccounts, subscription_status')
  .eq('id', currentUser.id)
  .single();

if (user.total_subaccounts >= user.max_subaccounts) {
  showUpgradeModal();
  return false; // Block OAuth from starting
}
```

**Backend Check** (During OAuth callback):
```javascript
// After OAuth callback, before saving to database
const { data: user } = await supabaseAdmin
  .from('users')
  .select('total_subaccounts, max_subaccounts')
  .eq('id', userId)
  .single();

if (user.total_subaccounts >= user.max_subaccounts) {
  return res.status(403).json({
    error: 'Subaccount limit reached',
    requiresUpgrade: true
  });
}

// Check if location already used by different user
const { data: existingLocation } = await supabaseAdmin
  .from('used_locations')
  .select('*')
  .eq('location_id', locationId)
  .maybeSingle();

if (existingLocation && existingLocation.user_id !== userId) {
  return res.status(403).json({
    error: `Location linked with ${existingLocation.email}`,
    requiresUpgrade: true
  });
}

// Allow if checks pass
await createGHLAccount(userId, locationId);
```

---

## 📧 Email Notifications

### 1. Welcome Email (Day 1)
```
Subject: Welcome! Your 7-day trial is active

Hi [Name],

Welcome to WhatsApp Integration! Your free trial has started.

📅 Trial Period: 7 days
⏰ Ends: [Date]
📊 Plan: Free (1 subaccount)
✅ You can add unlimited WhatsApp sessions

[Get Started →]
[View Dashboard]

Need help? Reply to this email.

Best regards,
Team
```

### 2. Reminder Email (Day 5 - 3 days left)
```
Subject: 3 days left in your free trial

Hi [Name],

Your trial ends in 3 days on [Date].

Don't lose access! Upgrade now:

💼 Starter Plan - $19/month
   • 3 subaccounts
   • Unlimited sessions
   • Priority support

🏢 Professional Plan - $49/month  
   • 10 subaccounts
   • API access
   • Advanced features

[Upgrade Now →]

Best regards,
Team
```

### 3. Final Reminder (Day 7 - 1 day left)
```
Subject: ⏰ Only 1 day left!

Hi [Name],

Your trial ends TOMORROW on [Date].

Upgrade now to keep your account active:

🔥 Save $10 with Annual Billing
💳 No commitments, cancel anytime
📞 24/7 support included

[Upgrade Now →]

Best regards,
Team
```

### 4. Trial Expired (Day 8)
```
Subject: Your trial has ended

Hi [Name],

Your 7-day free trial has ended.

Upgrade now to continue using WhatsApp Integration:

[View Plans →]

What you'll get:
✅ Keep your current subaccount
✅ Add more locations
✅ Continue all conversations
✅ Priority support

[Upgrade Now →]

Best regards,
Team
```

### 5. Upgrade Confirmation
```
Subject: 🎉 Welcome to [Plan Name]!

Hi [Name],

Your upgrade was successful!

📊 New Plan: [Plan Name]
💰 Amount: $[price]/month
📅 Next billing: [Date]
✅ You can now add [X] subaccounts

[Go to Dashboard →]

Need help? We're here for you.

Best regards,
Team
```

---

## 🗄️ Database Schema

### Users Table (Additions)
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS:
  subscription_status VARCHAR(50) DEFAULT 'trial';
  subscription_plan VARCHAR(50) DEFAULT 'free';
  trial_started_at TIMESTAMP;
  trial_ends_at TIMESTAMP;
  trial_used BOOLEAN DEFAULT FALSE;
  max_subaccounts INTEGER DEFAULT 1;
  total_subaccounts INTEGER DEFAULT 0;
  signup_ip VARCHAR(255);
  signup_user_agent TEXT;
  stripe_customer_id VARCHAR(255);
  stripe_subscription_id VARCHAR(255);
```

### New Tables (from trial-subscription-schema.sql)

#### 1. used_locations
```sql
CREATE TABLE used_locations (
  id UUID PRIMARY KEY,
  location_id VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id),
  email VARCHAR(255) NOT NULL,
  ghl_account_id UUID,
  is_active BOOLEAN DEFAULT TRUE,
  first_used_at TIMESTAMP,
  last_active_at TIMESTAMP,
  deletion_history JSONB
);
```

**Purpose**: Track which GHL locations are linked to which emails (anti-abuse)

#### 2. subscription_events
```sql
CREATE TABLE subscription_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(50), -- 'trial_started', 'trial_expired', 'upgrade', 'reminder_sent', 'location_blocked'
  plan_name VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP
);
```

**Purpose**: Track all subscription-related events for analytics

#### 3. usage_logs
```sql
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(50), -- 'message_sent', 'message_received', 'subaccount_added'
  location_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP
);
```

**Purpose**: Track user usage for monitoring and upgrades

#### 4. payments
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  amount DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50), -- 'succeeded', 'failed', 'pending'
  plan VARCHAR(50),
  stripe_payment_intent_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255),
  created_at TIMESTAMP
);
```

**Purpose**: Track payment history

---

## 🤖 Agent Instructions

### For Website Customer Support Agent

#### When Customer Signs Up:

**What happens automatically:**
1. ✅ Customer gets 7 days free trial
2. ✅ Customer receives welcome email
3. ✅ Customer can add 1 subaccount
4. ✅ Customer can add unlimited WhatsApp sessions within that 1 subaccount

**Your role as agent:**
- No action needed on signup
- Be ready to answer questions

#### When Customer Tries to Add 2nd Subaccount:

**Customer sees:**
```
⚠️ Plan Limit Reached

Your free trial allows only 1 subaccount.
Upgrade to add more:

[Starter - $19/month - 3 subaccounts]
[Professional - $49/month - 10 subaccounts]

[Upgrade Now] [Cancel]
```

**What customer asks:**
- "Why can't I add another subaccount?"
- "Can you increase my limit?"

**Your response:**
```
Hi [Customer Name],

You're currently on our free trial plan, which includes 1 GoHighLevel location for testing purposes.

To add more locations, you'll need to upgrade:
• Starter Plan ($19/month) - 3 locations
• Professional Plan ($49/month) - 10 locations

Would you like to upgrade? I can help you with the process!

[Send upgrade link]
```

#### When Customer Sees "Location Already Linked" Error:

**Customer sees:**
```
⚠️ Location Already Linked

This GoHighLevel location (GHL-12345) is already linked 
with another account (user@example.com).

Please upgrade your plan to use multiple locations or 
contact support.
```

**What customer asks:**
- "Why am I seeing this error?"
- "Can I use this location?"
- "Someone else has my location!"

**Your response:**
```
Hi [Customer Name],

This error means the GoHighLevel location you're trying to add is already connected to another account in our system.

This happens when:
1. Someone else already connected this location
2. You previously connected it from a different account
3. The location was transferred to another owner

**Solutions:**
1. **If it's YOUR location**: Use your original account that has this location connected
2. **If it's someone else's**: They need to remove this location from their account first
3. **To use multiple locations**: Upgrade your plan

Would you like me to check which account has this location? Just send me the location ID.

[Send upgrade link if they want multiple locations]
```

#### When Customer's Trial Expires:

**Customer sees:**
```
🔒 Trial Expired

Your free trial has ended. Upgrade to continue using the platform.

[Upgrade Now]
```

**What customer asks:**
- "Why can't I send messages?"
- "Can I extend my trial?"
- "I didn't get to test everything"

**Your response:**
```
Hi [Customer Name],

Your 7-day free trial has expired. I can help you upgrade to continue using WhatsApp Integration.

**Options:**
1. **Starter Plan** ($19/month) - 3 locations, unlimited sessions
2. **Professional Plan** ($49/month) - 10 locations, advanced features

**Special Offers (if applicable):**
- First month 50% off
- Annual billing - 2 months free

Would you like to upgrade? I can set it up for you right now!

[Send upgrade link]
```

#### When Customer Wants to Upgrade:

**Customer clicks "Upgrade Now"**

**Your role:**
1. Send them to upgrade page
2. Walk them through plan selection
3. Help with payment processing
4. Confirm upgrade completion
5. Celebrate their upgrade! 🎉

**Response:**
```
Hi [Customer Name],

Great choice! Here's how to upgrade:

1. Click this link: [Upgrade Link]
2. Select your plan (Starter $19 or Professional $49)
3. Enter payment details
4. Start using your new features immediately!

After upgrade:
✅ Your current subaccount stays active
✅ You can add [X] more locations
✅ Access to all features
✅ Priority support

Any questions? I'm here to help!

[Send upgrade link]
```

#### Common Customer Questions & Answers:

**Q: "Do I need a credit card for the trial?"**
A: "No! The 7-day trial is completely free with no credit card required."

**Q: "Can I extend my trial?"**
A: "Unfortunately, we don't extend trials, but I can offer you a 50% discount on your first month if you upgrade today!"

**Q: "What happens when my trial ends?"**
A: "You'll receive email notifications and in-app reminders. After 7 days, your account will be paused until you upgrade."

**Q: "Can I add more than 1 subaccount on trial?"**
A: "The free trial includes 1 subaccount to test the platform. You can add up to 3 on the Starter plan ($19/month) or 10 on the Professional plan ($49/month)."

**Q: "Why can't I use my location?"**
A: "Each location can only be linked to one account at a time. If you're seeing an error, another account might already be using it. I can help you troubleshoot!"

---

## ✅ Implementation Checklist

### Phase 1: Database Setup
- [ ] Run `trial-subscription-schema.sql` in Supabase
- [ ] Verify tables created: `used_locations`, `subscription_events`, `usage_logs`, `payments`
- [ ] Add columns to `users` table
- [ ] Create indexes for performance
- [ ] Test database queries

### Phase 2: Backend Implementation
- [ ] Create `/api/auth/signup` endpoint with trial initialization
- [ ] Add IP and user agent tracking on signup
- [ ] Implement subaccount limit check before OAuth
- [ ] Add location anti-abuse check in OAuth callback
- [ ] Create `/api/upgrade` endpoint with Stripe integration
- [ ] Add subaccount deletion handler (mark inactive in used_locations)
- [ ] Create cron job for trial expiry checks
- [ ] Set up email service (SendGrid/AWS SES)
- [ ] Create email templates

### Phase 3: Frontend Implementation
- [ ] Create signup page with email/password
- [ ] Update dashboard to show trial status banner
- [ ] Show days remaining countdown
- [ ] Show current subaccount count / max limit
- [ ] Create upgrade modal component
- [ ] Add error messages for limit reached
- [ ] Show location conflict error message
- [ ] Add success notification on upgrade
- [ ] Create pricing page
- [ ] Add Stripe payment form

### Phase 4: Email System
- [ ] Set up email service credentials
- [ ] Create welcome email template
- [ ] Create 3-day reminder template
- [ ] Create 1-day reminder template
- [ ] Create trial expired template
- [ ] Create upgrade confirmation template
- [ ] Schedule daily trial expiry check
- [ ] Schedule reminder emails

### Phase 5: Testing
- [ ] Test signup flow with trial
- [ ] Test adding first subaccount
- [ ] Test attempting to add 2nd subaccount (should block)
- [ ] Test location anti-abuse (same location, different user)
- [ ] Test trial expiry after 7 days
- [ ] Test email notifications
- [ ] Test upgrade flow
- [ ] Test upgrade confirmation
- [ ] Load testing with multiple users

---

## 🚀 Quick Start Guide

### For Developers:

1. **Run database migration:**
   ```bash
   # In Supabase SQL Editor
   # Copy and paste contents of trial-subscription-schema.sql
   # Execute
   ```

2. **Environment Variables:**
   ```env
   # Backend .env
   SUPABASE_URL=your_url
   SUPABASE_SERVICE_ROLE_KEY=your_key
   STRIPE_SECRET_KEY=sk_test_xxx
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   
   # Email service
   SENDGRID_API_KEY=SG.xxx
   # OR
   AWS_SES_REGION=us-east-1
   AWS_SES_ACCESS_KEY=xxx
   AWS_SES_SECRET_KEY=xxx
   ```

3. **Implement backend endpoints:**
   - `/api/auth/signup` - Create user with trial
   - `/api/upgrade` - Handle Stripe payment
   - `/oauth/callback` - Check limits before saving

4. **Implement frontend components:**
   - Trial banner
   - Upgrade modal
   - Error messages
   - Success notifications

5. **Set up email cron:**
   - Daily check for expiring trials
   - Send reminder emails
   - Send expiry emails

---

## 📊 Monitoring

### Key Metrics to Track:
- Trial signups per day
- Trial to paid conversion rate
- Average days to upgrade
- Plan distribution (Starter vs Professional)
- Location conflict rate
- Trial expiry rate
- Upgrade success rate

### Dashboard Queries:
```sql
-- Daily trial signups
SELECT COUNT(*) FROM users 
WHERE trial_started_at >= CURRENT_DATE;

-- Conversion rate
SELECT 
  (COUNT(*) FILTER (WHERE subscription_status = 'active'))::float / 
  COUNT(*) * 100 as conversion_rate
FROM users 
WHERE subscription_status IN ('trial', 'active');

-- Average days to upgrade
SELECT AVG(EXTRACT(DAY FROM (subscription_started_at - trial_started_at)))
FROM users
WHERE subscription_status = 'active';
```

---

## 🎯 Success Criteria

### Launch Goals:
- ✅ 100 trial signups in first week
- ✅ 20% conversion rate (trial to paid)
- ✅ 50% upgrade to Starter plan
- ✅ 30% upgrade to Professional plan
- ✅ Less than 5% location abuse attempts
- ✅ 90% email delivery rate

### After 3 Months:
- 500+ active paid subscribers
- Average revenue per user: $35
- Monthly recurring revenue: $17,500+
- 80% customer satisfaction

---

## 🆘 Support

### Technical Issues:
- Database migration problems → Check Supabase logs
- Email not sending → Verify SMTP credentials
- Stripe payment failing → Check Stripe dashboard
- Location conflicts → Check `used_locations` table

### Customer Support:
- Common questions → See [Agent Instructions](#agent-instructions)
- Billing issues → Check Stripe dashboard
- Account problems → Check Supabase database

---

**Last Updated:** December 2024  
**Version:** 1.0  
**Status:** Ready for Implementation

