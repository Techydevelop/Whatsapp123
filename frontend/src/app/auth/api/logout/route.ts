import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST() {
  const response = NextResponse.json({ success: true })
  
  // Clear auth cookie
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0, // Expire immediately
  })

  return response
}

