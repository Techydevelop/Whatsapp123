'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Check for Stripe redirect parameters
    const subscription = searchParams.get('subscription')
    const sessionId = searchParams.get('session_id')
    
    // If Stripe redirect, go directly to dashboard with parameters
    if (subscription && sessionId) {
      router.push(`/dashboard?subscription=${subscription}&session_id=${sessionId}`)
      return
    }
    
    // Check if user is logged in via cookie/localStorage
    const userData = localStorage.getItem('user')
    if (userData) {
      router.push('/dashboard')
    } else {
      router.push('/login')
    }
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}