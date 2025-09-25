'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
import { API_ENDPOINTS, apiCall } from '@/lib/config'

type GhlAccount = Database['public']['Tables']['ghl_accounts']['Row']

interface SubaccountStatus {
  id: string
  name: string
  ghl_location_id: string
  status: 'initializing' | 'qr' | 'ready' | 'disconnected' | 'none'
  phone_number?: string
  qr?: string
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [ghlAccount, setGhlAccount] = useState<GhlAccount | null>(null)
  const [subaccountStatuses, setSubaccountStatuses] = useState<SubaccountStatus[]>([])

  const fetchGHLLocations = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check if we have a GHL account connected
      const { data: ghlAccount, error: ghlError } = await supabase
        .from('ghl_accounts')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      console.log('GHL account query result:', { ghlAccount, ghlError, userId: user.id })
      console.log('GHL account details:', ghlAccount)
      console.log('GHL error details:', ghlError)
      if (ghlError) {
        console.error('Database error:', ghlError.message, ghlError.code)
      }
      setGhlAccount(ghlAccount)

      if (ghlAccount) {
        // Use location from stored GHL account
        console.log('GHL account found, using stored location...', ghlAccount)
        
        if (ghlAccount.location_id) {
          try {
            const sessionResponse = await apiCall(API_ENDPOINTS.getSession(ghlAccount.location_id))
            let sessionData = { status: 'none', phone_number: null, qr: null }
            
            if (sessionResponse.ok) {
              sessionData = await sessionResponse.json()
            }
            
            const locationStatus = {
              id: ghlAccount.location_id,
              name: `Location ${ghlAccount.location_id}`,
              ghl_location_id: ghlAccount.location_id,
              status: sessionData.status || 'none',
              phone_number: sessionData.phone_number,
              qr: sessionData.qr
            }
            
            setSubaccountStatuses([locationStatus])
            console.log('Location status set:', locationStatus)
          } catch (error) {
            console.error('Error fetching session status:', error)
            setSubaccountStatuses([{
              id: ghlAccount.location_id,
              name: `Location ${ghlAccount.location_id}`,
              ghl_location_id: ghlAccount.location_id,
              status: 'none' as const
            }])
          }
        } else {
          console.log('No location_id in GHL account')
          setSubaccountStatuses([])
        }
      } else {
        setSubaccountStatuses([])
      }
    } catch (error) {
      console.error('Error fetching GHL locations:', error)
      setSubaccountStatuses([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Handle OAuth success from URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('ghl') === 'connected') {
      console.log('GHL OAuth success detected, refreshing data...')
      // Clean URL without page reload
      window.history.replaceState({}, '', '/dashboard')
      // Force refresh data
      setTimeout(() => {
        fetchGHLLocations()
      }, 1000)
    }
  }, [fetchGHLLocations])

  useEffect(() => {
    fetchGHLLocations()
  }, [fetchGHLLocations])

  const openQR = async (locationId: string) => {
    try {
      console.log(`Creating session for locationId: ${locationId}`)
      
      // First create session if it doesn't exist
      const createResponse = await apiCall(API_ENDPOINTS.createSession(locationId), {
        method: 'POST',
        body: JSON.stringify({ locationId })
      })

      if (createResponse.ok) {
        console.log('Session created successfully')
        // Refresh the locations to show updated status
        await fetchGHLLocations()
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
    const link = API_ENDPOINTS.providerUI(locationId)
    window.open(link, '_blank')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">WhatsApp SMS Provider</h1>
      </div>

      {/* GHL Connection Status */}
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
              <span className="text-sm font-medium text-yellow-800">Connect your GHL account to get started</span>
            </div>
            <a
              href="/dashboard/add-subaccount"
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
            >
              Connect GHL Account
            </a>
          </div>
        </div>
      )}

      {/* Locations List */}
      {subaccountStatuses.length > 0 ? (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Your GHL Locations</h2>
            <div className="space-y-4">
              {subaccountStatuses.map((subaccount) => (
                <div key={subaccount.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">{subaccount.name}</h3>
                      <p className="text-xs text-gray-500">Location ID: {subaccount.ghl_location_id}</p>
                      {subaccount.phone_number && (
                        <p className="text-xs text-green-600 mt-1">📱 {subaccount.phone_number}</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        subaccount.status === 'ready' ? 'bg-green-100 text-green-800' :
                        subaccount.status === 'qr' ? 'bg-yellow-100 text-yellow-800' :
                        subaccount.status === 'initializing' ? 'bg-blue-100 text-blue-800' :
                        subaccount.status === 'disconnected' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {subaccount.status === 'ready' ? '✅ Connected' :
                         subaccount.status === 'qr' ? '📱 Scan QR' :
                         subaccount.status === 'initializing' ? '⏳ Starting' :
                         subaccount.status === 'disconnected' ? '❌ Disconnected' :
                         '⚪ Not Connected'}
                      </span>
            <button
                        onClick={() => openQR(subaccount.ghl_location_id)}
                        className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600"
            >
                        Open QR
            </button>
          </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : ghlAccount ? (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6 text-center">
            <p className="text-gray-500">No locations found in your GHL account.</p>
            </div>
            </div>
          ) : (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Get Started</h3>
            <p className="text-gray-500 mb-4">Connect your GoHighLevel account to start using WhatsApp as an SMS provider.</p>
            <a
              href="/dashboard/add-subaccount"
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
            >
              Connect GHL Account
            </a>
            </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">How to use:</h3>
        <ol className="text-sm text-blue-700 space-y-1">
          <li>1. Connect your GHL account above</li>
          <li>2. Your locations will appear automatically</li>
          <li>3. Click &quot;Open QR&quot; to scan WhatsApp QR code</li>
          <li>4. In GHL, add custom menu link: <code className="bg-blue-100 px-1 rounded">{process.env.NEXT_PUBLIC_API_BASE_URL}/ghl/provider?locationId=YOUR_LOCATION_ID</code></li>
          <li>5. Set as SMS provider in GHL Phone System settings</li>
        </ol>
      </div>
    </div>
  )
}