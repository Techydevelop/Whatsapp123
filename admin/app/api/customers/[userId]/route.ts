import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'

// Get single customer details
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const authResult = await requireAdmin(request)
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { userId } = params

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (error || !user) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    // Get subaccounts
    const { data: subaccounts } = await supabaseAdmin
      .from('ghl_accounts')
      .select('id, location_id, company_id, user_type, created_at')
      .eq('user_id', userId)

    // Get sessions
    const { data: sessions } = await supabaseAdmin
      .from('sessions')
      .select('id, status, phone_number, created_at')
      .eq('user_id', userId)

    return NextResponse.json({
      customer: {
        ...user,
        password: undefined
      },
      subaccounts: subaccounts || [],
      sessions: sessions || []
    })
  } catch (error) {
    console.error('Customer details error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Update customer plan/subscription
export async function PUT(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const authResult = await requireAdmin(request)
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { userId } = params
    const { subscription_plan, subscription_status, max_subaccounts, subscription_ends_at, trial_ends_at } = await request.json()

    const updateData: any = {}
    if (subscription_plan) updateData.subscription_plan = subscription_plan
    if (subscription_status) updateData.subscription_status = subscription_status
    if (max_subaccounts !== undefined) updateData.max_subaccounts = max_subaccounts
    if (subscription_ends_at) updateData.subscription_ends_at = subscription_ends_at
    if (trial_ends_at) updateData.trial_ends_at = trial_ends_at

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single()

    if (error || !user) {
      return NextResponse.json(
        { error: 'Customer not found or update failed' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      customer: { ...user, password: undefined }
    })
  } catch (error) {
    console.error('Update customer error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

