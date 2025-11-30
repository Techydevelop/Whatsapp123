import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'

// Get subscription and sales statistics
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    // Get all users
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('subscription_status, subscription_plan, created_at, subscription_started_at')

    if (usersError) {
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      )
    }

    // Calculate statistics
    const totalUsers = users?.length || 0
    const activeSubscriptions = users?.filter(u => u.subscription_status === 'active').length || 0
    const trialUsers = users?.filter(u => u.subscription_status === 'trial').length || 0
    const expiredUsers = users?.filter(u => u.subscription_status === 'expired').length || 0

    // Plan distribution
    const planDistribution = {
      free: users?.filter(u => u.subscription_plan === 'free').length || 0,
      starter: users?.filter(u => u.subscription_plan === 'starter').length || 0,
      professional: users?.filter(u => u.subscription_plan === 'professional').length || 0,
    }

    // Monthly signups (last 12 months)
    const monthlySignups: { month: string; count: number }[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthStr = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).toISOString()
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString()
      
      const count = users?.filter(u => {
        const created = new Date(u.created_at)
        return created >= new Date(monthStart) && created <= new Date(monthEnd)
      }).length || 0
      
      monthlySignups.push({ month: monthStr, count })
    }

    // Subscription conversions (last 12 months)
    const monthlyConversions: { month: string; count: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthStr = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).toISOString()
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString()
      
      const count = users?.filter(u => {
        if (!u.subscription_started_at) return false
        const started = new Date(u.subscription_started_at)
        return started >= new Date(monthStart) && started <= new Date(monthEnd) && u.subscription_status === 'active'
      }).length || 0
      
      monthlyConversions.push({ month: monthStr, count })
    }

    return NextResponse.json({
      totalUsers,
      activeSubscriptions,
      trialUsers,
      expiredUsers,
      planDistribution,
      monthlySignups,
      monthlyConversions,
    })
  } catch (error) {
    console.error('Subscriptions stats error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

