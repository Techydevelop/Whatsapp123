'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

export default function AddSubAccount() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [agencyLoading, setAgencyLoading] = useState(false)
  const router = useRouter()

  const handleConnect = async (isAgency = false) => {
    if (isAgency) {
      setAgencyLoading(true)
    } else {
    setLoading(true)
    }

    try {
      if (!user) throw new Error('Not authenticated')

      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://whatsapp123-dhn1.onrender.com'
      const userId = user.id
      
      // Use different backend endpoints for agency vs location
      const backendUrl = isAgency 
        ? `${apiBaseUrl}/auth/ghl/connect-agency?userId=${encodeURIComponent(userId)}`
        : `${apiBaseUrl}/auth/ghl/connect?userId=${encodeURIComponent(userId)}`
      
      console.log(`${isAgency ? '🏢 Agency' : '📍 Location'} OAuth redirect:`, backendUrl)
      
      // Redirect to backend which will redirect to GHL OAuth
      window.location.href = backendUrl
      
    } catch (error) {
      console.error('Error starting OAuth:', error)
      alert('Failed to start OAuth connection')
    } finally {
      if (isAgency) {
        setAgencyLoading(false)
      } else {
      setLoading(false)
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white shadow rounded-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Add GHL Account</h2>
        <p className="text-gray-600 mb-8">Choose how you want to connect your GoHighLevel account</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Agency Option */}
          <div className="border-2 border-purple-200 rounded-lg p-6 hover:border-purple-400 transition-colors">
            <div className="flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mx-auto mb-4">
              <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            
            <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">🏢 Agency Account</h3>
            <p className="text-sm text-gray-600 text-center mb-4">
              Connect your entire agency and import all locations at once
            </p>
            
            <div className="bg-purple-50 rounded-md p-3 mb-4">
              <p className="text-xs text-purple-800 font-medium mb-2">✨ What you get:</p>
              <ul className="text-xs text-purple-700 space-y-1">
                <li>• All agency locations imported automatically</li>
                <li>• Single authorization for everything</li>
                <li>• Manage all clients from one dashboard</li>
              </ul>
            </div>
            
            <button
              onClick={() => handleConnect(true)}
              disabled={agencyLoading}
              className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
            >
              {agencyLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </span>
              ) : '🏢 Connect Agency'}
            </button>
          </div>

          {/* Single Location Option */}
          <div className="border-2 border-blue-200 rounded-lg p-6 hover:border-blue-400 transition-colors">
            <div className="flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            
            <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">📍 Single Location</h3>
            <p className="text-sm text-gray-600 text-center mb-4">
              Connect one specific location only
            </p>
            
            <div className="bg-blue-50 rounded-md p-3 mb-4">
              <p className="text-xs text-blue-800 font-medium mb-2">✨ What you get:</p>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• Connect one location at a time</li>
                <li>• Choose specific location in GHL</li>
                <li>• Perfect for single clients</li>
              </ul>
            </div>
          
          <button
              onClick={() => handleConnect(false)}
            disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </span>
              ) : '📍 Connect Location'}
          </button>
          </div>
        </div>
          
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>

        <div className="mt-8 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
            <svg className="w-5 h-5 mr-2 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How it works:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-purple-800 mb-1">🏢 Agency Flow:</p>
              <ol className="text-purple-700 space-y-1 text-xs">
                <li>1. Click &quot;Connect Agency&quot;</li>
                <li>2. Select any location in GHL</li>
                <li>3. Authorize the connection</li>
                <li>4. All locations imported automatically!</li>
              </ol>
            </div>
            <div>
              <p className="font-medium text-blue-800 mb-1">📍 Location Flow:</p>
              <ol className="text-blue-700 space-y-1 text-xs">
                <li>1. Click &quot;Connect Location&quot;</li>
                <li>2. Choose specific location</li>
            <li>3. Authorize the connection</li>
                <li>4. That location gets connected</li>
          </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
