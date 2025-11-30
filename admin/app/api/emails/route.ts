import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'

// Get all customer emails with filters
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') // 'trial', 'expired', 'subscription', 'all'

    let query = supabaseAdmin
      .from('users')
      .select('id, email, name, subscription_status, subscription_plan, trial_ends_at, subscription_ends_at')
      .order('created_at', { ascending: false })

    if (filter && filter !== 'all') {
      if (filter === 'trial') {
        query = query.eq('subscription_status', 'trial')
      } else if (filter === 'expired') {
        query = query.eq('subscription_status', 'expired')
      } else if (filter === 'subscription') {
        query = query.eq('subscription_status', 'active')
      }
    }

    const { data: users, error } = await query

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch emails' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      emails: users?.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.subscription_status,
        plan: u.subscription_plan,
        trial_ends_at: u.trial_ends_at,
        subscription_ends_at: u.subscription_ends_at,
      })) || []
    })
  } catch (error) {
    console.error('Emails endpoint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Send bulk emails
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { emails, subject, message } = await request.json()

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: 'Emails array is required' },
        { status: 400 }
      )
    }

    if (!subject || !message) {
      return NextResponse.json(
        { error: 'Subject and message are required' },
        { status: 400 }
      )
    }

    // Send emails via Resend or other service
    const results = []
    let successCount = 0
    let failCount = 0

    for (const email of emails) {
      try {
        if (process.env.RESEND_API_KEY) {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM || 'Octendr <notifications@octendr.com>',
              to: [email],
              subject: subject,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2>${subject}</h2>
                  <div style="margin: 20px 0;">
                    ${message.replace(/\n/g, '<br>')}
                  </div>
                  <p style="color: #666; font-size: 12px; margin-top: 30px;">
                    This email was sent from the Octendr Admin Panel.
                  </p>
                </div>
              `,
              text: message
            }),
          })

          if (response.ok) {
            successCount++
            results.push({ email, status: 'success' })
          } else {
            failCount++
            results.push({ email, status: 'failed', error: await response.text() })
          }
        } else {
          failCount++
          results.push({ email, status: 'failed', error: 'Email service not configured' })
        }
      } catch (error: any) {
        failCount++
        results.push({ email, status: 'failed', error: error.message })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${successCount} email(s), ${failCount} failed`,
      results,
      successCount,
      failCount
    })
  } catch (error) {
    console.error('Bulk email error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

