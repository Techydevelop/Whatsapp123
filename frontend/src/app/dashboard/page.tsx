'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/supabase'

type GhlAccount = Database['public']['Tables']['ghl_accounts']['Row']

interface SubaccountStatus {
  id: string
  name: string
  ghl_location_id: string
  status: 'ready' | 'qr' | 'initializing' | 'disconnected' | 'none'
  phone_number?: string
  qr?: string
}

export default function Dashboard() {
  const searchParams = useSearchParams()
  const [subaccountStatuses, setSubaccountStatuses] = useState<SubaccountStatus[]>([])
  const [ghlAccount, setGhlAccount] = useState<GhlAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  const fetchSubaccounts = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get GHL account info - check both current user and any linked accounts
      const { data: ghlAccount, error: ghlError } = await supabase
        .from('ghl_accounts')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      console.log('GHL Account lookup:', { ghlAccount, ghlError, userId: user.id })
      
      // If no GHL account found for current user, check if there are any subaccounts
      // that might indicate a GHL connection exists
      if (!ghlAccount) {
        const { data: subaccounts } = await supabase
          .from('subaccounts')
          .select('*')
          .eq('user_id', user.id)
          .limit(1)
          
        if (subaccounts && subaccounts.length > 0) {
          console.log('Found subaccounts but no GHL account - this might be a webhook-created subaccount')
          // Set a mock GHL account to show as connected
          setGhlAccount({
            id: 'webhook-created',
            user_id: user.id,
            company_id: 'webhook-company',
            access_token: 'webhook-token',
            refresh_token: 'webhook-refresh',
            location_id: subaccounts[0].ghl_location_id,
            expires_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          })
        } else {
          setGhlAccount(null)
        }
      } else {
        setGhlAccount(ghlAccount)
      }

      // Get subaccounts and remove duplicates
      const { data: existingSubaccounts } = await supabase
        .from('subaccounts')
        .select('*')
        .eq('user_id', user.id)

      // Remove duplicates based on ghl_location_id
      const uniqueSubaccounts = existingSubaccounts ? 
        existingSubaccounts.filter((subaccount, index, self) => 
          index === self.findIndex(s => s.ghl_location_id === subaccount.ghl_location_id)
        ) : []

      // setSubaccounts(uniqueSubaccounts || [])

      // Fetch status for each subaccount
      if (uniqueSubaccounts && uniqueSubaccounts.length > 0) {
        const statusPromises = uniqueSubaccounts.map(async (subaccount) => {
          try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ghl/location/${subaccount.ghl_location_id}/session`)
            if (response.ok) {
              const sessionData = await response.json()
              return {
                id: subaccount.id,
                name: subaccount.name,
                ghl_location_id: subaccount.ghl_location_id,
                status: sessionData.status || 'none',
                phone_number: sessionData.phone_number,
                qr: sessionData.qr
              }
            }
          } catch (error) {
            console.error(`Error fetching status for ${subaccount.ghl_location_id}:`, error)
          }
          return {
            id: subaccount.id,
            name: subaccount.name,
            ghl_location_id: subaccount.ghl_location_id,
            status: 'none' as const
          }
        })

        const statuses = await Promise.all(statusPromises)
        setSubaccountStatuses(statuses)
      } else {
        setSubaccountStatuses([])
      }
    } catch (error) {
      console.error('Error fetching subaccounts:', error)
      setSubaccountStatuses([])
    }
  }, [])

  // Check for GHL connection success
  useEffect(() => {
    const ghlConnected = searchParams.get('ghl')
    if (ghlConnected === 'connected') {
      setShowSuccessMessage(true)
      // Hide success message after 5 seconds
      setTimeout(() => setShowSuccessMessage(false), 5000)
    }
  }, [searchParams])

  useEffect(() => {
    const init = async () => {
      await fetchSubaccounts()
      setLoading(false)
    }
    init()
  }, [fetchSubaccounts])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'bg-green-100 text-green-800'
      case 'qr': return 'bg-yellow-100 text-yellow-800'
      case 'initializing': return 'bg-blue-100 text-blue-800'
      case 'disconnected': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready': return 'Ready'
      case 'qr': return 'QR Code'
      case 'initializing': return 'Initializing'
      case 'disconnected': return 'Disconnected'
      default: return 'Not Connected'
    }
  }

  const copyProviderLink = (locationId: string) => {
    const link = `${process.env.NEXT_PUBLIC_API_URL}/ghl/provider?locationId=${locationId}`
    navigator.clipboard.writeText(link)
    // You could add a toast notification here
  }

  const openQR = async (locationId: string) => {
    try {
      console.log(`Creating session for locationId: ${locationId}`)
      
      // First create session if it doesn't exist
      const createResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ghl/location/${locationId}/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locationId })
      })

      if (createResponse.ok) {
        console.log('Session created successfully')
        // Refresh the subaccount statuses to show updated status
        await fetchSubaccounts()
      } else {
        const errorData = await createResponse.json()
        console.error('Failed to create session:', errorData)
        alert(`Failed to create session: ${errorData.error || 'Unknown error'}`)
        return
          }
        } catch (error) {
      console.error('Error creating session:', error)
      alert(`Error creating session: ${error}`)
      return
    }

    // Then open the provider page
    const link = `${process.env.NEXT_PUBLIC_API_URL}/ghl/provider?locationId=${locationId}`
    window.open(link, '_blank')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {showSuccessMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                GoHighLevel Successfully Connected!
              </h3>
              <div className="mt-2 text-sm text-green-700">
                <p>Your GHL account has been connected and subaccounts have been created. You can now manage leads and send WhatsApp messages.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Info */}
        <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Users</h2>
        
        {ghlAccount ? (
          <div className="mb-6 p-4 bg-green-50 rounded-lg">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-green-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-green-800">GHL Account Connected</span>
            </div>
            </div>
          ) : (
          <div className="mb-6 p-4 bg-yellow-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium text-yellow-800">GHL Account Not Connected</span>
              </div>
              <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    const response = await fetch('/api/admin/ghl/create-subaccount', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        locationId: 'LxCDfKzrlFEZ7rNiJtjc',
                        companyId: 'jCNG7aXCC0YWYGuhnQEK',
                        companyName: 'Vezzur'
                      })
                    });
                    const result = await response.json();
                    if (result.success) {
                      alert('Subaccount created successfully!');
                      fetchSubaccounts();
                    } else {
                      alert(result.message || 'Failed to create subaccount');
                    }
                  } catch (error) {
                    console.error('Error creating subaccount:', error);
                    alert('Error creating subaccount');
                  }
                }}
                className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600"
              >
                Create Subaccount
              </button>
                <button
                  onClick={async () => {
                    const locationId = prompt('Enter Location ID (e.g., LxCDfKzrlFEZ7rNiJtjc):');
                    if (locationId) {
                      try {
                        const response = await fetch('/api/admin/ghl/create-webhook-subaccount', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            locationId: locationId,
                            companyId: 'jCNG7aXCC0YWYGuhnQEK',
                            companyName: 'Vezzur'
                          })
                        });
                        const result = await response.json();
                        if (result.success) {
                          alert('Subaccount created successfully!');
                          fetchSubaccounts();
                        } else {
                          alert(result.error || 'Failed to create subaccount');
                        }
                      } catch (error) {
                        console.error('Error creating subaccount:', error);
                        alert('Error creating subaccount');
                      }
                    }
                  }}
                  className="bg-green-500 text-white px-3 py-1 rounded text-xs hover:bg-green-600"
                >
                  Create Subaccount
                </button>
              </div>
          </div>
            <p className="text-sm text-yellow-700 mt-1">Please connect your GHL account first to add sub-accounts.</p>
          </div>
        )}

        {/* Subaccounts Table */}
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sub-Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phone Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
              {subaccountStatuses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    No sub-accounts connected yet. <a href="/dashboard/add-subaccount" className="text-indigo-600 hover:text-indigo-500">Add your first sub-account</a>
                  </td>
                </tr>
              ) : (
                subaccountStatuses.map((subaccount) => (
                  <tr key={subaccount.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {subaccount.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {subaccount.ghl_location_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(subaccount.status)}`}>
                        {getStatusText(subaccount.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {subaccount.phone_number ? `+${subaccount.phone_number}` : '-'}
                      </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => openQR(subaccount.ghl_location_id)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        Open QR
                      </button>
                      <button
                        onClick={() => copyProviderLink(subaccount.ghl_location_id)}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        Copy Link
                      </button>
                      </td>
                    </tr>
                ))
              )}
                </tbody>
              </table>
            </div>

        {/* Instructions */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="text-sm font-medium text-blue-800 mb-2">How to use:</h3>
          <ol className="text-sm text-blue-700 space-y-1">
            <li>1. Add sub-accounts using the &quot;Add Sub-Account&quot; link in the sidebar</li>
            <li>2. Click &quot;Open QR&quot; to scan WhatsApp QR code for each sub-account</li>
            <li>3. Copy the provider link and add it as a custom menu link in GHL</li>
            <li>4. In GHL → Settings → Phone System → Additional Settings → Telephony Provider, choose your provider</li>
            <li>5. The connected WhatsApp number will appear as an SMS provider option</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
