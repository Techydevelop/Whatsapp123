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
      if (!user?.id) {
        alert('Please login first to connect your GHL account')
        return
      }

      // Simple auth - pass user ID to backend
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://whatsapp123-dhn1.onrender.com'
      
      // Pass userId as query parameter to backend OAuth endpoint
      const backendUrl = `${apiBaseUrl}/auth/ghl/connect?userId=${encodeURIComponent(user.id)}`
      
      console.log('📍 GHL OAuth redirect with user ID:', backendUrl)
      
      // Redirect to backend which will redirect to GHL OAuth
      window.location.href = backendUrl
      
    } catch (error) {
      console.error('Error starting OAuth:', error)
      alert('Failed to start OAuth connection')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white shadow rounded-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Add GHL Account</h2>
        <p className="text-gray-600 mb-8">Connect your GoHighLevel location to start using WhatsApp</p>
        
        <div className="text-center">
          {/* Single Location Option */}
          <div className="border-2 border-blue-200 rounded-lg p-8 hover:border-blue-400 transition-colors">
            <div className="flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mx-auto mb-6">
              <svg className="w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            
            <h3 className="text-2xl font-semibold text-gray-900 text-center mb-4">📍 Connect Location</h3>
            <p className="text-gray-600 text-center mb-6">
              Connect your GoHighLevel location to enable WhatsApp integration
            </p>
            
            <div className="bg-blue-50 rounded-md p-4 mb-6">
              <p className="text-sm text-blue-800 font-medium mb-2">✨ What you get:</p>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• WhatsApp QR code generation</li>
                <li>• Send and receive messages</li>
                <li>• Manage conversations</li>
                <li>• Real-time message sync</li>
              </ul>
            </div>
            
            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all text-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </span>
              ) : '📍 Connect Location'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}