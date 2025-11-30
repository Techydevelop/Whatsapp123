import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'

// Add subaccount permission (increase max_subaccounts)
export async function POST(
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
    const { additional_count } = await request.json()

    if (!additional_count || additional_count < 1) {
      return NextResponse.json(
        { error: 'additional_count must be at least 1' },
        { status: 400 }
      )
    }

    // Get current user info
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('max_subaccounts')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    // Increase max_subaccounts
    const newMax = (user.max_subaccounts || 0) + additional_count

    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update({ max_subaccounts: newMax })
      .eq('id', userId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update subaccount permissions' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Added ${additional_count} subaccount permission(s)`,
      customer: { ...updatedUser, password: undefined }
    })
  } catch (error) {
    console.error('Add subaccount permission error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Remove subaccount
export async function DELETE(
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
    const { location_id } = await request.json()

    if (!location_id) {
      return NextResponse.json(
        { error: 'location_id is required' },
        { status: 400 }
      )
    }

    // Find and delete subaccount
    const { data: subaccount, error: findError } = await supabaseAdmin
      .from('ghl_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('location_id', location_id)
      .single()

    if (findError || !subaccount) {
      return NextResponse.json(
        { error: 'Subaccount not found' },
        { status: 404 }
      )
    }

    // Delete sessions first
    await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('subaccount_id', subaccount.id)

    // Delete subaccount
    const { error: deleteError } = await supabaseAdmin
      .from('ghl_accounts')
      .delete()
      .eq('id', subaccount.id)

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete subaccount' },
        { status: 500 }
      )
    }

    // Update user's total_subaccounts
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('total_subaccounts')
      .eq('id', userId)
      .single()

    if (user) {
      await supabaseAdmin
        .from('users')
        .update({ total_subaccounts: Math.max(0, (user.total_subaccounts || 0) - 1) })
        .eq('id', userId)
    }

    return NextResponse.json({
      success: true,
      message: 'Subaccount removed successfully'
    })
  } catch (error) {
    console.error('Remove subaccount error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

