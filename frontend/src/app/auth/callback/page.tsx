'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Processing...')

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const token = searchParams.get('token')
        const type = searchParams.get('type')
        const error = searchParams.get('error')

        if (error) {
          setStatus('Authentication failed. Redirecting to login...')
          setTimeout(() => router.push('/login'), 2000)
          return
        }

        if (type === 'ghl' && token) {
          // Handle GHL OAuth callback
          setStatus('Completing GHL authentication...')
          
          // The backend has already created the user and session
          // We just need to refresh the session
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          
          if (sessionError) {
            throw sessionError
          }

          if (session) {
            setStatus('Login successful! Redirecting to dashboard...')
            setTimeout(() => router.push('/dashboard'), 1000)
          } else {
            throw new Error('No session found')
          }
        } else {
          // Handle regular Supabase auth callback
          const { data, error } = await supabase.auth.getSession()
          
          if (error) {
            throw error
          }

          if (data.session) {
            setStatus('Login successful! Redirecting to dashboard...')
            setTimeout(() => router.push('/dashboard'), 1000)
          } else {
            throw new Error('No session found')
          }
        }
      } catch (error) {
        console.error('Auth callback error:', error)
        setStatus('Authentication failed. Redirecting to login...')
        setTimeout(() => router.push('/login'), 2000)
      }
    }

    handleAuthCallback()
  }, [searchParams, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <h2 className="text-xl font-semibold text-gray-900">{status}</h2>
        <p className="text-sm text-gray-600">Please wait while we complete your authentication...</p>
      </div>
    </div>
  )
}
