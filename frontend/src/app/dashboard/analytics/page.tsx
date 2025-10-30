'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface PlanInfo {
  status: string
  maxSubaccounts: number
  totalSubaccounts: number
  trialEndsAt?: string
}

export default function AnalyticsPage() {
  const { user } = useAuth()
  const [plan, setPlan] = useState<PlanInfo | null>(null)
  const [counts, setCounts] = useState<{ total: number; inbound: number; outbound: number }>({ total: 0, inbound: 0, outbound: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return
      try {
        // Fetch user subscription info
        const { data: userRow } = await supabase
          .from('users')
          .select('subscription_status, max_subaccounts, total_subaccounts, trial_ends_at')
          .eq('id', user.id)
          .maybeSingle()

        if (userRow) {
          setPlan({
            status: userRow.subscription_status || 'trial',
            maxSubaccounts: userRow.max_subaccounts || 1,
            totalSubaccounts: userRow.total_subaccounts || 0,
            trialEndsAt: userRow.trial_ends_at || undefined,
          })
        }

        // Get all sessions for this user
        const { data: sessions } = await supabase
          .from('sessions')
          .select('id')
          .eq('user_id', user.id)

        const sessionIds = (sessions || []).map(s => s.id)
        if (sessionIds.length === 0) {
          setCounts({ total: 0, inbound: 0, outbound: 0 })
          return
        }

        // Count outbound
        const { count: outbound } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('session_id', sessionIds)
          .eq('direction', 'out')

        const { count: inbound } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('session_id', sessionIds)
          .eq('direction', 'in')

        setCounts({ total: (outbound || 0) + (inbound || 0), inbound: inbound || 0, outbound: outbound || 0 })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.id])

  const statusBadge = useMemo(() => {
    if (!plan) return null
    const color = plan.status === 'professional' ? 'bg-emerald-100 text-emerald-700' : plan.status === 'starter' ? 'bg-indigo-100 text-indigo-700' : 'bg-yellow-100 text-yellow-700'
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{plan.status}</span>
  }, [plan])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500">Plan usage and messaging statistics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl p-6 border border-gray-200 bg-white">
          <p className="text-sm text-gray-600 mb-1">Current Plan</p>
          <div className="flex items-center justify-between">
            <p className="text-xl font-semibold text-gray-900">{plan ? plan.status.charAt(0).toUpperCase() + plan.status.slice(1) : '—'} {statusBadge}</p>
          </div>
          {plan && (
            <p className="text-sm text-gray-500 mt-2">{plan.totalSubaccounts}/{plan.maxSubaccounts} subaccounts in use{plan.trialEndsAt ? ` · Trial ends ${new Date(plan.trialEndsAt).toLocaleDateString()}` : ''}</p>
          )}
        </div>

        <div className="rounded-2xl p-6 border border-gray-200 bg-white">
          <p className="text-sm text-gray-600 mb-1">Messages Sent</p>
          <p className="text-3xl font-bold text-indigo-600">{counts.outbound}</p>
        </div>

        <div className="rounded-2xl p-6 border border-gray-200 bg-white">
          <p className="text-sm text-gray-600 mb-1">Messages Received</p>
          <p className="text-3xl font-bold text-emerald-600">{counts.inbound}</p>
        </div>
      </div>

      <div className="rounded-2xl p-6 border border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">Total Messages</p>
          <p className="text-2xl font-bold text-gray-900">{counts.total}</p>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-gray-500">Loading analytics…</div>
      )}
    </div>
  )
}


