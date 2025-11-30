import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'

// Get billing statistics and monthly statements
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    // Get all payments
    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })

    if (paymentsError) {
      return NextResponse.json(
        { error: 'Failed to fetch payments' },
        { status: 500 }
      )
    }

    // Calculate total revenue
    const totalRevenue = payments?.filter(p => p.status === 'succeeded')
      .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) || 0

    // Monthly revenue (last 12 months)
    const monthlyRevenue: { month: string; revenue: number; count: number }[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthStr = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).toISOString()
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString()
      
      const monthPayments = payments?.filter(p => {
        const created = new Date(p.created_at)
        return created >= new Date(monthStart) && created <= new Date(monthEnd) && p.status === 'succeeded'
      }) || []
      
      const revenue = monthPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0)
      monthlyRevenue.push({ month: monthStr, revenue, count: monthPayments.length })
    }

    // Plan revenue breakdown
    const planRevenue = {
      starter: payments?.filter(p => p.plan === 'starter' && p.status === 'succeeded')
        .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) || 0,
      professional: payments?.filter(p => p.plan === 'professional' && p.status === 'succeeded')
        .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) || 0,
    }

    // Recent payments (last 30)
    const recentPayments = payments?.slice(0, 30).map(p => ({
      id: p.id,
      user_id: p.user_id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      plan: p.plan,
      created_at: p.created_at,
    })) || []

    return NextResponse.json({
      totalRevenue,
      monthlyRevenue,
      planRevenue,
      recentPayments,
      totalPayments: payments?.length || 0,
      successfulPayments: payments?.filter(p => p.status === 'succeeded').length || 0,
    })
  } catch (error) {
    console.error('Billings stats error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

