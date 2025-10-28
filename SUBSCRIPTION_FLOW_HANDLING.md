# 📋 Subscription Flow Handling

## 🎯 Two Scenarios for User Signup

### Scenario 1: Free Signup → Trial (Already Implemented ✅)
```
User → Signup → NO PAYMENT → Trial activated
├─ subscription_status = 'trial'
├─ max_subaccounts = 1
├─ 7 days free
└─ After payment → Upgrade to paid
```

### Scenario 2: Direct Paid Signup → Skip Trial (Need to Add)
```
User → Signup + PAYMENT → Skip trial
├─ subscription_status = 'active'
├─ max_subaccounts = 3 or 10 (based on plan)
├─ No trial period
└─ Paid plan from day 1
```

---

## 💡 Solution: Handle in Signup Endpoint

### **Signup Endpoint Logic:**

```javascript
// When user signs up, check if they're paying:

async function signup(userData) {
  const { plan, paymentIntentId } = userData;

  // Create user
  const { data: newUser } = await supabase
    .from('users')
    .insert({
      name: userData.name,
      email: userData.email,
      password: hashedPassword,
      is_verified: true,
      
      // CHECK IF PAID SIGNUP
      subscription_status: plan ? 'active' : 'trial',
      subscription_plan: plan || 'free',
      max_subaccounts: getMaxSubaccounts(plan), // 1 for trial, 3 for starter, 10 for pro
      
      // Trial only if not paid
      trial_started_at: plan ? null : new Date().toISOString(),
      trial_ends_at: plan ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      trial_used: !!plan, // true if paid, false if trial
      
      // Paid subscription dates
      subscription_started_at: plan ? new Date().toISOString() : null,
      subscription_ends_at: plan ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null, // 30 days
      
      stripe_customer_id: paymentIntentId?.customer,
      stripe_subscription_id: paymentIntentId?.subscription
    })
    .select()
    .single();

  // Log event
  await supabase.from('subscription_events').insert({
    user_id: newUser.id,
    event_type: plan ? 'direct_signup' : 'trial_started',
    plan_name: plan || 'free',
    metadata: { paid: !!plan }
  });
}
```

### **Helper Function:**

```javascript
function getMaxSubaccounts(plan) {
  const limits = {
    free: 1,           // Trial
    trial: 1,          // Trial
    starter: 3,        // $19/month
    professional: 10,  // $49/month
  };
  return limits[plan] || 1;
}
```

---

## 🎬 Complete User Flow

### **Option A: Free Trial Flow (Default)**
1. User visits website
2. Click "Start Free Trial"
3. Signup form → Create account (NO PAYMENT)
4. Database: `subscription_status = 'trial'`, `max_subaccounts = 1`
5. Welcome email: "Your 7-day trial has started"
6. After trial → Upgrade prompts

### **Option B: Direct Paid Signup**
1. User visits website
2. Selects plan: "Starter $19" or "Professional $49"
3. Click "Subscribe Now"
4. Stripe Checkout → Payment
5. After payment success → Signup/Login
6. Database: `subscription_status = 'active'`, `max_subaccounts = 3/10`
7. Welcome email: "Welcome to [Plan Name]!"

---

## 🔄 Upgrade from Trial Flow

```
User on trial (1 subaccount)
↓
Clicks "Upgrade Now" 
↓
Select plan → Stripe Checkout
↓
Payment success
↓
Database update:
├─ subscription_status: 'trial' → 'active'
├─ subscription_plan: 'free' → 'starter'/'professional'
├─ max_subaccounts: 1 → 3 or 10
└─ trial_used: true
```

---

## 📝 Implementation Checklist

### Backend Changes:
- [ ] Update signup endpoint to handle `plan` parameter
- [ ] Add `getMaxSubaccounts()` helper function
- [ ] Handle Stripe webhook for subscription confirmation
- [ ] Update database based on plan selection

### Frontend Changes:
- [ ] Create pricing page with plans
- [ ] Add Stripe Checkout integration
- [ ] Pass `plan` parameter to signup
- [ ] Handle redirect after Stripe payment

### Database:
- [x] Schema already supports both flows ✅
- [x] `subscription_status` column ready
- [x] `subscription_plan` column ready
- [x] Stripe columns ready

---

## 💻 Quick Implementation

### **In your signup handler:**

```javascript
// Before creating user:
const selectedPlan = req.body.plan; // 'starter', 'professional', or null

const userData = {
  // ... basic fields
  subscription_status: selectedPlan ? 'active' : 'trial',
  subscription_plan: selectedPlan || 'free',
  max_subaccounts: selectedPlan === 'starter' ? 3 : selectedPlan === 'professional' ? 10 : 1,
  trial_used: !!selectedPlan
};

// Insert user...
```

---

## ✅ Current Status

- **Database Schema:** ✅ Ready
- **Backend Trial Check:** ✅ Done  
- **Frontend Trial Banner:** ✅ Done
- **Direct Paid Signup:** ⏳ Needs implementation
- **Upgrade Flow:** ⏳ Needs Stripe integration

---

**Recommended:**
Start with **FREE TRIAL** first (already done), then add paid signup after testing trial system.

Kya aap pehle trial ko test karein ge, ya direct paid signup bhi implement kar doon?

