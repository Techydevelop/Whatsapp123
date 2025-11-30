import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'

// Get all customers with their details
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, created_at, is_verified, subscription_status, subscription_plan, trial_started_at, trial_ends_at, subscription_started_at, subscription_ends_at, max_subaccounts, total_subaccounts')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching customers:', error)
      return NextResponse.json(
        { error: 'Failed to fetch customers' },
        { status: 500 }
      )
    }

    // Get subaccounts for each user
    const customersWithSubaccounts = await Promise.all(
      (users || []).map(async (user) => {
        const { data: subaccounts } = await supabaseAdmin
          .from('ghl_accounts')
          .select('id, location_id, company_id, user_type, created_at')
          .eq('user_id', user.id)
        
        return {
          ...user,
          current_subaccounts: subaccounts?.length || 0,
          subaccounts: subaccounts || []
        }
      })
    )

    return NextResponse.json({ customers: customersWithSubaccounts })
  } catch (error) {
    console.error('Customers endpoint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

