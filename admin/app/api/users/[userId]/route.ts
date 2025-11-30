import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'

// Update admin user role
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

    // Only superadmin can update roles
    if (authResult.user.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Superadmin access required' },
        { status: 403 }
      )
    }

    const { userId } = params
    const { role, is_active } = await request.json()

    const updateData: any = {}
    if (role) updateData.role = role
    if (is_active !== undefined) updateData.is_active = is_active
    updateData.updated_at = new Date().toISOString()

    const { data: user, error } = await supabaseAdmin
      .from('admin_users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single()

    if (error || !user) {
      return NextResponse.json(
        { error: 'User not found or update failed' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      user: { ...user, password: undefined }
    })
  } catch (error) {
    console.error('Update admin user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Delete admin user
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

    // Only superadmin can delete admins
    if (authResult.user.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Superadmin access required' },
        { status: 403 }
      )
    }

    const { userId } = params

    // Don't allow deleting yourself
    if (userId === authResult.user.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    // Deactivate admin user (don't delete, just deactivate)
    const { error } = await supabaseAdmin
      .from('admin_users')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to remove admin access' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Admin access removed successfully'
    })
  } catch (error) {
    console.error('Delete admin error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

