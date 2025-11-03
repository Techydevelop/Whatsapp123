# 🚀 Stripe Production Setup Guide

## 📋 Production Checklist

Yeh guide Stripe ko production mein enable karne ke liye step-by-step instructions deti hai.

---

## 🔴 Step 1: Stripe Account Complete Karein

1. **Stripe Dashboard** par jao: https://dashboard.stripe.com/
2. **Activate your account** - Business details, tax info, bank account add karo
3. **Identity verification** complete karo (KYC requirements)
4. **Business verification** kar lo

**Important**: Jab tak account fully activated nahi hota, live payments nahi aa sakte.

---

## 🔑 Step 2: Live Mode API Keys

### Get Live Keys:

1. Stripe Dashboard → **Developers → API keys**
2. **"Activate test mode"** toggle ko **OFF** karo (Live mode activate)
3. Copy these keys:

```env
# LIVE MODE KEYS (Production)
STRIPE_SECRET_KEY=sk_live_... (Live secret key)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_... (Live publishable key)
```

⚠️ **IMPORTANT**: 
- Test keys (`sk_test_`, `pk_test_`) ko production mein **NEVER** use karo
- Live keys ko safely store karo
- GitHub/public repos mein commit mat karo

---

## 📦 Step 3: Live Mode Products Create Karein

### Product 1: Starter Plan (Live)

1. Stripe Dashboard → **Products → Add product**
2. Fill details:
   ```
   Name: WhatsApp Starter Plan
   Description: 3 subaccounts, unlimited WhatsApp Messages
   ```
3. **"Add pricing"** click karo
4. Set price:
   ```
   Price: $19.00 USD
   Billing period: Monthly
   Currency: USD
   ```
5. **"Save product"**
6. **Price ID copy karo** (will start with `price_` but different from test mode)

### Product 2: Professional Plan (Live)

1. Same process:
   ```
   Name: WhatsApp Professional Plan
   Description: 10 subaccounts, unlimited sessions, API access
   Price: $49.00 USD/month
   ```
2. **Price ID copy karo**

---

## 🔗 Step 4: Production Webhook Setup

### Webhook Endpoint (Production):

1. Stripe Dashboard → **Developers → Webhooks**
2. **"Add endpoint"** click karo
3. Enter endpoint URL:
   ```
   https://api.octendr.com/api/webhooks/stripe
   ```
   *(Agar tumhara domain different hai, woh use karo)*

4. **Events to send** select karo:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.updated`
   - ✅ `invoice.payment_failed`
   - ✅ `invoice.payment_succeeded`

5. **"Add endpoint"** click karo
6. **Signing secret copy karo** (starts with `whsec_`)

⚠️ **Note**: Production webhook secret test mode se different hoga!

---

## ⚙️ Step 5: Production Environment Variables

### Backend (Render) - Production Environment:

```env
# Stripe Production Keys
STRIPE_SECRET_KEY=sk_live_51AbC... (Live secret key)
STRIPE_STARTER_PRICE_ID=price_1AbC... (Live Starter price ID)
STRIPE_PROFESSIONAL_PRICE_ID=price_1XyZ... (Live Professional price ID)
STRIPE_WEBHOOK_SECRET=whsec_... (Production webhook secret)

# Other existing variables
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GHL_CLIENT_ID=...
GHL_CLIENT_SECRET=...
FRONTEND_URL=https://dashboard.octendr.com (or your domain)
PORT=3001
NODE_ENV=production
```

### Frontend (Vercel) - Production Environment:

```env
# Stripe Production Publishable Key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51AbC... (Live publishable key)

# Other existing variables
NEXT_PUBLIC_API_BASE_URL=https://api.octendr.com
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 🧪 Step 6: Production Testing

### Before Going Live:

1. **Small Test Transaction**:
   - Apne aap se ek chota test payment karo (real card se)
   - Verify ki webhook properly receive ho raha hai
   - Check database mein subscription properly update ho rahi hai

2. **Test Cards (Production mein kaam nahi karte)**:
   - Production mein `4242 4242 4242 4242` jaise test cards use mat karo
   - Production mein sirf real cards kaam karte hain

3. **Webhook Testing**:
   - Stripe Dashboard → Webhooks → Latest event
   - Verify ki webhook successfully delivered ho raha hai
   - Error logs check karo

---

## 🔐 Step 7: Security Checklist

### Important Security Measures:

- [ ] **Never expose secret keys** in frontend code
- [ ] **Webhook signature verification** already implemented ✅
- [ ] **HTTPS only** - Ensure your API has valid SSL certificate
- [ ] **Environment variables** properly secured (not in code)
- [ ] **Rate limiting** enabled (already in code) ✅
- [ ] **CORS** properly configured ✅

---

## 📊 Step 8: Monitoring Setup

### Stripe Dashboard Monitoring:

1. **Payments** tab - Real-time payment monitoring
2. **Webhooks** tab - Event delivery status
3. **Customers** tab - Customer management
4. **Subscriptions** tab - Active subscriptions

### Recommended Monitoring:

- Set up **email alerts** for failed payments
- Monitor **webhook delivery failures**
- Track **subscription churn rate**
- Monitor **refund requests**

---

## 💰 Step 9: Payout Setup

### Bank Account Configuration:

1. Stripe Dashboard → **Settings → Payment methods**
2. Add your **bank account** for payouts
3. Verify bank account (Stripe small deposits bhejega for verification)
4. Set **payout schedule** (daily/weekly/monthly)

**Default**: Stripe pays out **2 business days** after payment clears.

---

## 🚨 Step 10: Error Handling

### Payment Failure Handling:

Agar payment fail ho:

1. **First failure**: Stripe automatically retry karta hai
2. **Multiple failures**: Webhook `invoice.payment_failed` event trigger hota hai
3. **After 7 days**: Subscription automatically cancel ho sakti hai (configurable)

### Customer Notifications:

- Stripe automatically emails bhejta hai payment failures ke liye
- Tum apna custom email system bhi use kar sakte ho (already in code)

---

## 📋 Final Production Checklist

Before going live, verify:

- [ ] Stripe account fully activated
- [ ] Live API keys set in production environment
- [ ] Live Price IDs configured
- [ ] Production webhook endpoint configured
- [ ] Webhook signing secret set
- [ ] SSL certificate valid (HTTPS enabled)
- [ ] Test transaction successful
- [ ] Webhook delivery verified
- [ ] Database updates working
- [ ] Email notifications working
- [ ] Bank account connected for payouts
- [ ] Monitoring set up

---

## 🔄 Switching from Test to Live

### Migration Steps:

1. **Backup test data** (agar needed)
2. **Update environment variables** in production
3. **Update webhook endpoint** to production URL
4. **Test with real small transaction**
5. **Monitor closely** for first few days
6. **Keep test mode keys** for development/testing

---

## 📞 Support

### Stripe Support:

- **Dashboard Support**: Live chat available in Stripe Dashboard
- **Documentation**: https://stripe.com/docs
- **Status Page**: https://status.stripe.com/

### Common Issues:

**Issue**: Webhook not receiving events
**Solution**: Check webhook URL is correct, SSL valid, firewall allows Stripe IPs

**Issue**: Payment succeeds but subscription not updating
**Solution**: Check webhook signature verification, database connection, logs

**Issue**: Test cards working but live cards failing
**Solution**: Check if Stripe account is fully activated, bank account verified

---

## ✅ Production Ready!

Jab sab kuch setup ho jaye:

1. ✅ Real payments accept karo
2. ✅ Subscriptions automatically activate
3. ✅ Monthly recurring billing
4. ✅ Automatic payment retries
5. ✅ Professional customer experience

**Good luck with production launch! 🚀**

