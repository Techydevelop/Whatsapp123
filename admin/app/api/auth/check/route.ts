import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  
  if ('error' in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    )
  }

  return NextResponse.json({ user: authResult.user })
}

