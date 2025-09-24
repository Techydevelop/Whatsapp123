'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { API_ENDPOINTS, apiCall } from '@/lib/config'

export default function AddSubAccount() {
  const [name, setName] = useState('')
  const [ghlLocationId, setGhlLocationId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const response = await apiCall(API_ENDPOINTS.connectSubaccount, {
        method: 'POST',
        body: JSON.stringify({
          ghl_location_id: ghlLocationId,
          name: name || `Location ${ghlLocationId}`
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to connect subaccount')
      }

      const result = await response.json()
      
      if (result.authUrl) {
        // Redirect to GHL OAuth
        window.location.href = result.authUrl
      } else {
        setSuccess('Sub-account connected successfully!')
        setName('')
        setGhlLocationId('')
        
        // Redirect to Users page after 2 seconds
        setTimeout(() => {
          router.push('/dashboard')
        }, 2000)
      }

    } catch (error) {
      console.error('Error connecting subaccount:', error)
      setError(error instanceof Error ? error.message : 'Failed to connect subaccount')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Add Sub-Account</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Sub-Account Name (Optional)
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main Location"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="ghlLocationId" className="block text-sm font-medium text-gray-700 mb-1">
              GHL Location ID *
            </label>
            <input
              type="text"
              id="ghlLocationId"
              value={ghlLocationId}
              onChange={(e) => setGhlLocationId(e.target.value)}
              placeholder="e.g., LxCDfKzrlFEZ7rNiJtjc"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Find this in your GHL dashboard under Settings → General → Location ID
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <p className="text-sm text-green-600">{success}</p>
            </div>
          )}

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading || !ghlLocationId.trim()}
              className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Connecting...' : 'Connect Sub-Account'}
            </button>
            
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-blue-50 rounded-md">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Next Steps:</h3>
          <ol className="text-sm text-blue-700 space-y-1">
            <li>1. Connect your sub-account above</li>
            <li>2. Go to Users page to see your connected sub-accounts</li>
            <li>3. Click &quot;Open QR&quot; to scan WhatsApp QR code</li>
            <li>4. In GHL, add custom menu link to the provider URL</li>
            <li>5. Set as SMS provider in GHL Phone System settings</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
