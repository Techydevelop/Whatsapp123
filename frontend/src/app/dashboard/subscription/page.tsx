'use client'

import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { API_ENDPOINTS } from '@/lib/config'

interface SubscriptionData {
  subscription_status: string
  subscription_plan: string
  max_subaccounts: number
  trial_ends_at?: string
  stripe_subscription_id?: string
}

export default function SubscriptionPage() {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)

  useEffect(() => {
    const fetchSubscription = async () => {
      if (!user?.id) return

      try {
        const { data, error } = await supabase
          .from('users')
          .select('subscription_status, subscription_plan, max_subaccounts, trial_ends_at, stripe_subscription_id')
          .eq('id', user.id)
          .single()

        if (!error && data) {
          setSubscription(data)
        }
      } catch (error) {
        console.error('Error fetching subscription:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSubscription()
  }, [user])

  const plans = [
    { name: 'Free Trial', price: 0, subaccounts: 1, features: ['7 days free', '1 subaccount', 'Unlimited WhatsApp Messages'], planKey: null },
    { name: 'Starter', price: 19, subaccounts: 3, features: ['3 subaccounts', 'Unlimited WhatsApp Messages', 'Priority support'], planKey: 'starter' as const },
    { name: 'Professional', price: 49, subaccounts: 10, features: ['10 subaccounts', 'Unlimited WhatsApp Messages', 'API access', 'Advanced analytics'], planKey: 'professional' as const },
  ]

  const handleUpgrade = async (plan: 'starter' | 'professional') => {
    console.log('🔵 Upgrade button clicked for plan:', plan)
    
    if (!user?.id) {
      console.error('❌ No user found')
      alert('Please login to upgrade')
      return
    }

    console.log('✅ User found:', user.id, user.email)
    setUpgrading(plan)

    try {
      const checkoutUrl = API_ENDPOINTS.createCheckout
      console.log('📡 Calling checkout endpoint:', checkoutUrl)
      console.log('📦 Request body:', { plan, userEmail: user.email })

      // Add user ID header for authentication (cross-domain cookie support)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add X-User-ID header for backend authentication
      if (user?.id) {
        headers['X-User-ID'] = user.id;
        console.log('🔑 Adding X-User-ID header:', user.id);
      }

      const response = await fetch(checkoutUrl, {
        method: 'POST',
        headers,
        credentials: 'include', // Include cookies if available
        body: JSON.stringify({
          plan,
          userEmail: user.email
        })
      })

      console.log('📥 Response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('❌ API Error:', errorData)
        throw new Error(errorData.error || 'Failed to create checkout session')
      }

      const data = await response.json()
      console.log('✅ Checkout session created:', data)

      const { url } = data

      if (url) {
        console.log('🔗 Redirecting to Stripe:', url)
        window.location.href = url
      } else {
        console.error('❌ No checkout URL in response:', data)
        throw new Error('No checkout URL received')
      }
    } catch (error) {
      console.error('❌ Error creating checkout:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to start checkout. Please try again.'
      alert(`Error: ${errorMessage}\n\nPlease check:\n1. Backend is running\n2. Environment variables are set\n3. Check browser console for details`)
      setUpgrading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Subscription & Plans</h1>
        <p className="text-gray-600 mt-2">Manage your subscription and upgrade your plan</p>
      </div>

      {/* Current Plan */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Plan</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {subscription?.subscription_plan === 'free' || subscription?.subscription_status === 'trial' ? 'Free Trial' : 
               subscription?.subscription_plan === 'starter' ? 'Starter Plan' :
               subscription?.subscription_plan === 'professional' ? 'Professional Plan' : 'Free'}
            </p>
            <p className="text-gray-600 mt-1">
              {subscription?.max_subaccounts} subaccount{subscription?.max_subaccounts !== 1 ? 's' : ''} allowed
            </p>
            {subscription?.subscription_status === 'trial' && subscription?.trial_ends_at && (
              <p className="text-sm text-orange-600 mt-2">
                Trial ends on {new Date(subscription.trial_ends_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-green-100 text-green-800">
              {subscription?.subscription_status === 'active' ? 'Active' : 'Trial'}
            </div>
          </div>
        </div>
      </div>

      {/* Available Plans */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div key={plan.name} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
              </div>
              <div className="mb-4">
                <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                <span className="text-gray-600">/month</span>
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <svg className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              <button 
                onClick={() => {
                  if (plan.planKey && plan.name !== 'Free Trial') {
                    handleUpgrade(plan.planKey as 'starter' | 'professional')
                  }
                }}
                disabled={
                  subscription?.subscription_plan === plan.name.toLowerCase() || 
                  plan.name === 'Free Trial' ||
                  upgrading === plan.planKey
                }
                className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {upgrading === plan.planKey 
                  ? 'Loading...' 
                  : subscription?.subscription_plan === plan.name.toLowerCase() 
                    ? 'Current Plan' 
                    : plan.name === 'Free Trial'
                      ? 'Current Plan'
                      : 'Upgrade'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

