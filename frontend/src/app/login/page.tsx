"use client"

import LoginForm from '@/components/auth/LoginForm'
import { useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const renderError = () => {
    if (!error) return null
    const map: Record<string, string> = {
      ghl_auth_failed: 'GoHighLevel authentication failed. Please try again.',
      missing_code: 'GHL callback missing code. Please retry the connection.',
      missing_location_id: 'No location selected. Please choose a location in GHL.',
      no_locations_found: 'No GHL locations found on this account.',
    }
    const message = map[error] || 'Authentication error. Please try again.'
    return (
      <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {message}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {renderError()}
        <LoginForm />
      </div>
    </div>
  )
}
