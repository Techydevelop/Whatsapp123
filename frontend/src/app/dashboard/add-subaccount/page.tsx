'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

export default function AddSubAccount() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleConnect = async () => {
    setLoading(true)

    try {
      if (!user) throw new Error('Not authenticated')

      // Direct GHL OAuth flow - let user choose location in GHL
      const scopes = 'locations.readonly conversations.write conversations.readonly conversations/message.readonly conversations/message.write contacts.readonly contacts.write businesses.readonly users.readonly'
      const clientId = process.env.NEXT_PUBLIC_GHL_CLIENT_ID
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://whatsapp123-dhn1.onrender.com'
      const redirectUri = `${apiBaseUrl}/oauth/callback`
      
      console.log('OAuth Config:', {
        clientId: clientId ? 'SET' : 'NOT_SET',
        redirectUri,
        apiBaseUrl,
        envApiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL
      })
      
      if (!clientId) {
        alert('GHL Client ID not configured. Please set NEXT_PUBLIC_GHL_CLIENT_ID environment variable.')
        return
      }
      
      if (!apiBaseUrl || apiBaseUrl === 'undefined') {
        alert('API Base URL not configured. Please set NEXT_PUBLIC_API_BASE_URL environment variable.')
        return
      }
      
      const state = user.id // Just pass user ID as state
      
      const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`
      
      console.log('Redirecting to GHL OAuth:', authUrl)
      
      // Direct redirect to GHL OAuth
      window.location.href = authUrl
      
    } catch (error) {
      console.error('Error starting OAuth:', error)
      alert('Failed to start OAuth connection')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Connect GHL Location</h2>
        
        <div className="text-center">
          <p className="text-gray-600 mb-6">
            Connect your GoHighLevel location directly through OAuth. You&apos;ll be able to choose your location in the GHL interface.
          </p>
          
          <button
            onClick={handleConnect}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            {loading ? 'Redirecting to GHL...' : 'Connect GHL Location'}
          </button>
          
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-md">
          <h3 className="text-sm font-medium text-blue-800 mb-2">How it works:</h3>
          <ol className="text-sm text-blue-700 space-y-1">
            <li>1. Click &quot;Connect GHL Location&quot; above</li>
            <li>2. Choose your location in GHL OAuth screen</li>
            <li>3. Authorize the connection</li>
            <li>4. Return to dashboard to see connected location</li>
            <li>5. Click &quot;Open QR&quot; to scan WhatsApp QR code</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
