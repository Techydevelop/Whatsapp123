# 💳 Stripe Integration Setup Guide

## 📋 Overview

Stripe integration for subscription plans:
- **Starter**: $19/month (3 subaccounts)
- **Professional**: $49/month (10 subaccounts)

---

## 🔧 Step 1: Create Stripe Account

1. Go to: https://dashboard.stripe.com/
2. Sign up or login
3. Complete account setup
4. Go to **Developers → API keys**

---

## 🔑 Step 2: Get API Keys

### Test Mode (Development):
```
Publishable key: pk_test_...
Secret key: sk_test_...
```

### Live Mode (Production):
```
Publishable key: pk_live_...
Secret key: sk_live_...
```

**Important**: Copy these keys, you'll need them later!

---

## 📦 Step 3: Create Products

### Product 1: Starter Plan

1. Go to: **Products → Add product**
2. Fill details:
   ```
   Name: WhatsApp Starter Plan
   Description: 3 subaccounts, unlimited WhatsApp Messages
   ```
3. Click **"Add pricing"**
4. Set price:
   ```
   Price: $19.00
   Billing period: Monthly
   Currency: USD
   ```
5. Click **"Save product"**
6. **Copy the Price ID** (starts with `price_`)

### Product 2: Professional Plan

1. Same process:
   ```
   Name: WhatsApp Professional Plan
   Description: 10 subaccounts, unlimited sessions, API access
   Price: $49.00/month
   ```
2. **Copy the Price ID**

---

## 🔗 Step 4: Webhook Setup

### In Stripe Dashboard:

1. Go to: **Developers → Webhooks**
2. Click **"Add endpoint"**
3. Enter endpoint URL:
   ```
   https://your-domain.com/api/webhooks/stripe
   ```
4. Select events to listen for:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.updated`
   - ✅ `invoice.payment_failed`
   - ✅ `invoice.payment_succeeded`
5. Click **"Add endpoint"**
6. **Copy the Signing secret** (starts with `whsec_`)

---

## ⚙️ Step 5: Environment Variables

### Frontend (.env.local):
```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... (or pk_live_...)
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PROFESSIONAL_PRICE_ID=price_...
```

### Backend (.env) - If using backend:
```env
STRIPE_SECRET_KEY=sk_test_... (or sk_live_...)
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 💻 Step 6: Install Packages

```bash
cd frontend
npm install @stripe/stripe-js stripe
```

---

## 🎨 Step 7: Frontend Integration

### Create Checkout Session API: `frontend/src/app/api/stripe/create-checkout/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
})

export async function POST(request: NextRequest) {
  try {
    const { plan, userId, userEmail } = await request.json()
    
    if (!plan || !userId) {
      return NextResponse.json({ error: 'Missing plan or userId' }, { status: 400 })
    }
    
    // Get price ID based on plan
    const priceId = plan === 'starter' 
      ? process.env.STRIPE_STARTER_PRICE_ID
      : process.env.STRIPE_PROFESSIONAL_PRICE_ID
    
    if (!priceId) {
      return NextResponse.json({ error: 'Price ID not configured' }, { status: 500 })
    }
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/dashboard?upgrade=cancelled`,
      customer_email: userEmail,
      metadata: {
        user_id: userId,
        plan_type: plan, // 'starter' or 'professional'
      },
    })
    
    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
```

### Frontend Component: Upgrade Button

```typescript
'use client'

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function UpgradeButton({ plan, userId, userEmail }: { 
  plan: 'starter' | 'professional',
  userId: string,
  userEmail: string 
}) {
  const [loading, setLoading] = useState(false)
  
  const handleUpgrade = async () => {
    setLoading(true)
    
    try {
      // Create checkout session
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, userId, userEmail })
      })
      
      const { url } = await res.json()
      
      // Redirect to Stripe Checkout
      window.location.href = url
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to start checkout')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <button 
      onClick={handleUpgrade}
      disabled={loading}
      className="bg-blue-600 text-white px-6 py-2 rounded-lg"
    >
      {loading ? 'Loading...' : `Upgrade to ${plan} - $${plan === 'starter' ? '19' : '49'}/month`}
    </button>
  )
}
```

---

## 🔔 Step 8: Webhook Handler

### Create: `frontend/src/app/api/webhooks/stripe/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabase } from '@/lib/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Handle event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      
      const userId = session.metadata?.user_id
      const planType = session.metadata?.plan_type // 'starter' or 'professional'
      
      if (!userId || !planType) {
        console.error('Missing user_id or plan_type in metadata')
        return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 })
      }
      
      // Plan configuration
      const planConfig = {
        starter: { max_subaccounts: 3, price: 19 },
        professional: { max_subaccounts: 10, price: 49 }
      }
      
      const config = planConfig[planType as keyof typeof planConfig]
      
      // Update user in database
      const { error: updateError } = await supabase
        .from('users')
        .update({
          subscription_status: 'active',
          subscription_plan: planType,
          max_subaccounts: config.max_subaccounts,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          subscription_started_at: new Date().toISOString(),
          subscription_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('id', userId)
      
      if (updateError) {
        console.error('Database update error:', updateError)
        return NextResponse.json({ error: 'Database update failed' }, { status: 500 })
      }
      
      // Get user for email
      const { data: user } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', userId)
        .single()
      
      // Send welcome email (your email service)
      if (user) {
        await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'upgradeSuccess',
            to: user.email,
            data: {
              name: user.name,
              planName: planType,
              planPrice: config.price,
              nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()
            }
          })
        })
      }
      
      // Log event
      await supabase.from('subscription_events').insert({
        user_id: userId,
        event_type: 'upgrade',
        plan_name: planType,
        metadata: { stripe_session_id: session.id }
      })
      
      break
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      
      // Find user by stripe_customer_id
      const { data: user } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('stripe_customer_id', customerId)
        .single()
      
      if (user && invoice.hosted_invoice_url) {
        // Send payment failed email
        await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'paymentFailed',
            to: user.email,
            data: {
              name: user.name,
              invoiceUrl: invoice.hosted_invoice_url,
              amount: invoice.amount_due / 100,
              dueDate: new Date(invoice.due_date! * 1000).toLocaleDateString()
            }
          })
        })
      }
      
      break
    }
    
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      
      // Update subscription end date if needed
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .single()
      
      if (user && subscription.current_period_end) {
        await supabase
          .from('users')
          .update({
            subscription_ends_at: new Date(subscription.current_period_end * 1000).toISOString()
          })
          .eq('id', user.id)
      }
      
      break
    }
  }

  return NextResponse.json({ received: true })
}

// Disable body parsing for webhook
export const runtime = 'nodejs'
```

---

## ✅ Step 9: Success Page

### Create: `frontend/src/app/upgrade/success/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function UpgradeSuccessPage() {
  const params = useSearchParams()
  const router = useRouter()
  const sessionId = params.get('session_id')
  const [status, setStatus] = useState('Verifying...')

  useEffect(() => {
    async function verifyUpgrade() {
      if (!sessionId) {
        setStatus('Invalid session')
        return
      }

      try {
        // Webhook should have already updated the database
        // But we can verify here
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          const { data: dbUser } = await supabase
            .from('users')
            .select('subscription_status, subscription_plan')
            .eq('id', user.id)
            .single()

          if (dbUser?.subscription_status === 'active') {
            setStatus('Upgrade successful!')
            setTimeout(() => router.push('/dashboard'), 2000)
          }
        }
      } catch (error) {
        console.error('Verification error:', error)
        setStatus('Verification failed')
      }
    }

    verifyUpgrade()
  }, [sessionId, router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">{status}</h1>
        <p>Redirecting to dashboard...</p>
      </div>
    </div>
  )
}
```

---

## 🧪 Step 10: Testing

### Test Mode Cards:

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Requires 3D Secure: 4000 0027 6000 3184
```

### Test Flow:

1. Click "Upgrade" button
2. Use test card: `4242 4242 4242 4242`
3. Any future expiry date
4. Any CVC
5. Complete checkout
6. Check webhook received
7. Check database updated
8. Check email sent

---

## 📋 Checklist

- [ ] Stripe account created
- [ ] API keys copied (test + live)
- [ ] Products created (Starter + Professional)
- [ ] Price IDs copied
- [ ] Webhook endpoint created
- [ ] Webhook events subscribed
- [ ] Webhook signing secret copied
- [ ] Environment variables added
- [ ] Packages installed
- [ ] Checkout API route created
- [ ] Webhook handler created
- [ ] Success page created
- [ ] Test with test cards
- [ ] Switch to live mode for production

---

## 🔐 Production Checklist

- [ ] Switch from test keys to live keys
- [ ] Update webhook URL to production domain
- [ ] Test with real card (small amount)
- [ ] Verify webhook signature
- [ ] Monitor webhook logs
- [ ] Set up webhook retry logic (Stripe auto-retries)

---

## 💡 Important Notes

1. **Never expose secret keys** in frontend code
2. **Always verify webhook signatures** in production
3. **Test webhooks locally** using Stripe CLI: `stripe listen --forward-to localhost:3001/api/webhooks/stripe`
4. **Monitor webhook logs** in Stripe dashboard
5. **Handle failed payments** gracefully (7-day grace period)

---

**Ready to integrate!** Follow steps 1-10, and your Stripe integration will be complete.

