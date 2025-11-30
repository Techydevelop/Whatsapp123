import { NextRequest } from 'next/server'
import { supabaseAdmin } from './supabase'
import jwt from 'jsonwebtoken'

export interface AdminUser {
  id: string
  email: string
  name: string
  is_admin: boolean
  role?: string
  is_active?: boolean
}

export async function requireAdmin(request: NextRequest): Promise<{ user: AdminUser } | { error: string; status: number }> {
  try {
    // Method 1: Try to get JWT from cookie
    const token = request.cookies.get('admin_token')?.value
    
    if (token) {
      try {
        const jwtSecret = process.env.JWT_SECRET || 'your-secret-key'
        const decoded = jwt.verify(token, jwtSecret) as any
        
        if (decoded && decoded.userId && decoded.isAdmin) {
          // Verify user is still admin in database
          const { data: user, error } = await supabaseAdmin
            .from('admin_users')
            .select('id, email, name, role, is_active')
            .eq('id', decoded.userId)
            .eq('is_active', true)
            .single()
          
          if (error || !user) {
            return { error: 'Admin access revoked', status: 403 }
          }
          
          return { user: { ...user, is_admin: true } }
        }
      } catch (jwtError) {
        // Token invalid
      }
    }
    
    // Method 2: Try to get user ID from header
    const headerUserId = request.headers.get('x-user-id')
    
    if (headerUserId) {
      const { data: user, error } = await supabaseAdmin
        .from('admin_users')
        .select('id, email, name, role, is_active')
        .eq('id', headerUserId)
        .eq('is_active', true)
        .single()
      
      if (!error && user) {
        return { user: { ...user, is_admin: true } }
      }
    }
    
    return { error: 'Authentication required', status: 401 }
  } catch (error) {
    console.error('Admin auth error:', error)
    return { error: 'Authentication failed', status: 401 }
  }
}

