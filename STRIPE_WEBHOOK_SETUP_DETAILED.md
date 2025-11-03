# 🔗 Stripe Webhook Setup - Detailed Guide (Step by Step)

## 📋 Overview

Yeh guide Stripe Dashboard mein webhook endpoint add karne ka detailed process explain karti hai.

---

## 🎯 Step-by-Step Instructions

### Step 1: Stripe Dashboard Kholo

1. Browser mein jao: **https://dashboard.stripe.com/**
2. Apne Stripe account se **login** karo
3. **Test mode** ya **Live mode** select karo (production ke liye Live mode use karo)

---

### Step 2: Webhooks Section Mein Jao

1. **Left sidebar** mein **"Developers"** par click karo
   - Agar "Developers" nahi dikh raha, to **"..." (three dots)** menu check karo

2. **"Developers"** menu expand hoga
3. **"Webhooks"** option par click karo
   - URL: `https://dashboard.stripe.com/webhooks`

---

### Step 3: Add Endpoint Button

1. Webhooks page par aao
2. **Top right corner** mein **"+ Add endpoint"** ya **"Add endpoint"** button dikhega
3. Is button par **click** karo

---

### Step 4: Endpoint URL Enter Karo

1. **"Endpoint URL"** field mein tumhara production API URL enter karo:
   ```
   https://api.octendr.com/api/webhooks/stripe
   ```
   
   **Important Notes:**
   - Agar tumhara domain different hai (e.g., `https://your-domain.com`), to woh use karo
   - URL mein `/api/webhooks/stripe` path zaroor include karo
   - `https://` (HTTPS) zaroori hai - HTTP kaam nahi karega

2. **Description** (optional):
   - Example: "Production Webhook for Subscription Updates"
   - Yeh tumhare liye reference ke liye hai

---

### Step 5: Events Select Karo

1. **"Events to send"** section mein aao
2. **"Select events"** ya **"Add events"** button par click karo
3. **Search bar** ya **list** se yeh 4 events select karo:

   **Required Events:**
   - ✅ `checkout.session.completed` ⭐ **IMPORTANT**
     - Recurring subscriptions aur One-time payments dono ke liye
     - Jab user payment complete karta hai
     - Subscription ya one-time payment activate hoti hai
   
   - ✅ `customer.subscription.updated`
     - Sirf Recurring subscriptions ke liye
     - Jab subscription update hoti hai (cancel, renew, etc.)
     - Subscription status changes ke liye
   
   - ✅ `invoice.payment_failed`
     - Sirf Recurring subscriptions ke liye
     - Jab payment fail hota hai
     - User ko notify karne ke liye
   
   - ✅ `invoice.payment_succeeded`
     - Sirf Recurring subscriptions ke liye
     - Jab payment successfully process hota hai
     - Subscription renewal ke liye
   
   - ✅ `payment_intent.succeeded` (Optional - Backup)
     - One-time payments ke liye backup handler
     - Agar checkout.session.completed miss ho jaye to use hota hai

4. Har event ke saamne **checkbox** tick karo
5. **"Add events"** ya **"Done"** button par click karo

---

### Step 6: Save Endpoint

1. **"Add endpoint"** ya **"Save"** button par click karo
2. Stripe endpoint create karega
3. Success message dikhega

---

### Step 7: Signing Secret Copy Karo

1. Endpoint create hone ke baad, **webhook details page** open hoga
2. **"Signing secret"** section mein dekho
3. **"Reveal"** ya **"Show"** button par click karo
4. **Secret key copy** karo
   - Format: `whsec_...` (starts with `whsec_`)
   - Example: `whsec_1234567890abcdef...`

**⚠️ IMPORTANT:**
- Yeh secret key **SAFELY store** karo
- **Environment variables** mein add karo
- **Never commit** to GitHub/public repos
- Production aur Test mode ke **different secrets** hote hain

---

### Step 8: Environment Variable Set Karo

1. **Render Dashboard** (Backend) mein jao
2. **Environment** tab select karo
3. **New variable** add karo:
   ```
   Key: STRIPE_WEBHOOK_SECRET
   Value: whsec_... (jo tumne copy kiya)
   ```
4. **Save** karo

---

## 📸 Visual Guide

### Stripe Dashboard Navigation:
```
Stripe Dashboard
├── Developers (Left Sidebar)
    ├── API keys
    ├── Webhooks ← YAHAN CLICK KARO
    ├── Events
    └── Logs
```

### Webhook Page Layout:
```
┌─────────────────────────────────────────┐
│  Webhooks                        [+ Add] │ ← Add Endpoint Button
├─────────────────────────────────────────┤
│                                         │
│  [Endpoint URL Field]                    │
│  https://api.octendr.com/api/...        │
│                                         │
│  [Events to send]                        │
│  ☑ checkout.session.completed           │
│  ☑ customer.subscription.updated        │
│  ☑ invoice.payment_failed               │
│  ☑ invoice.payment_succeeded            │
│                                         │
│  [Add endpoint] ← Save Button          │
└─────────────────────────────────────────┘
```

---

## ✅ Verification Steps

### Test Webhook:

1. **Stripe Dashboard** → **Webhooks** → Apna endpoint select karo
2. **"Send test webhook"** button click karo
3. Event select karo (e.g., `checkout.session.completed`)
4. **"Send test webhook"** click karo
5. Backend logs check karo - webhook receive hua ya nahi

### Production Test:

1. **Real subscription** create karo (test card se)
2. **Webhooks** page mein **"Recent events"** check karo
3. **Green checkmark** ✅ = Successfully delivered
4. **Red X** ❌ = Failed delivery

---

## 🔧 Troubleshooting

### Problem: "Endpoint URL not accessible"
**Solution:**
- Verify ki tumhara backend URL correct hai
- Check ki HTTPS enabled hai
- Firewall/security settings check karo

### Problem: "Webhook signature verification failed"
**Solution:**
- Signing secret correctly set hai ya nahi check karo
- Environment variable refresh karo
- Backend restart karo

### Problem: "Events not being received"
**Solution:**
- Events correctly selected hain ya nahi verify karo
- Backend logs check karo
- Stripe Dashboard → Webhooks → Recent events check karo

---

## 🎯 Quick Checklist

- [ ] Stripe Dashboard → Developers → Webhooks
- [ ] "+ Add endpoint" button click
- [ ] Endpoint URL enter: `https://api.octendr.com/api/webhooks/stripe`
- [ ] Events select kiye (minimum 4, recommended 5):
  - [ ] `checkout.session.completed` ⭐ (Recurring + One-time dono)
  - [ ] `customer.subscription.updated` (Recurring only)
  - [ ] `invoice.payment_failed` (Recurring only)
  - [ ] `invoice.payment_succeeded` (Recurring only)
  - [ ] `payment_intent.succeeded` (One-time backup - optional)
- [ ] "Add endpoint" save kiya
- [ ] Signing secret copy kiya (`whsec_...`)
- [ ] Environment variable set kiya: `STRIPE_WEBHOOK_SECRET`
- [ ] Test webhook send karke verify kiya

---

## 📝 Notes

1. **Production vs Test Mode:**
   - Production webhook Live mode mein banta hai
   - Test mode ke liye alag webhook banani padti hai
   - Dono ke signing secrets different hote hain

2. **Webhook URL:**
   - Must be HTTPS (not HTTP)
   - Must be publicly accessible
   - Must respond within 30 seconds

3. **Security:**
   - Signing secret ko secret rakho
   - Never expose in frontend code
   - Use environment variables only

---

**Ready to set up!** Follow these steps carefully, aur webhook setup complete ho jayega! 🚀

