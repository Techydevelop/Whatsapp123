"use client"

import LoginForm from '@/components/auth/LoginForm'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function LoginContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const renderError = () => {
    if (!error) return null
    const map: Record<string, string> = {
      ghl_auth_failed: 'GoHighLevel authentication failed. Please try again.',
      missing_code: 'GHL callback missing code. Please retry the connection.',
      missing_location_id: 'No location selected. Please choose a location in GHL.',
      no_locations_found: 'No GHL locations found on this account.',
      invalid_token_response: 'Invalid token response from GHL. Please check your app settings.',
      invalid_company_response: 'Invalid company response from GHL. Please try again.',
      invalid_user_response: 'Invalid user response from GHL. Please try again.',
      invalid_locations_response: 'Invalid locations response from GHL. Please try again.',
      ghl_unauthorized: 'GHL authorization failed. Please check your app credentials.',
      ghl_forbidden: 'GHL access forbidden. Please check your app permissions.',
    }
    const message = map[error] || 'Authentication error. Please try again.'
    return (
      <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Authentication Error</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{message}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md w-full">
      {renderError()}
      <LoginForm />
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Suspense fallback={<div className="max-w-md w-full" />}>
        <LoginContent />
      </Suspense>
    </div>
  )
}
