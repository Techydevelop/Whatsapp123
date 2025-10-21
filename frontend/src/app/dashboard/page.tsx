'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
import { API_ENDPOINTS, API_BASE_URL, apiCall } from '@/lib/config'

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
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [ghlAccounts, setGhlAccounts] = useState<GhlAccount[]>([])
  const [subaccountStatuses, setSubaccountStatuses] = useState<SubaccountStatus[]>([])

  const fetchGHLLocations = useCallback(async () => {
    try {
      if (!user) return

      // Get ALL GHL accounts for this user
      const { data: ghlAccounts, error: ghlError } = await supabase
        .from('ghl_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      console.log('🔍 DEBUG GHL ACCOUNTS:')
      console.log('User ID from localStorage:', user.id)
      console.log('GHL accounts query result:', { ghlAccounts, ghlError, userId: user.id })
      console.log('GHL accounts details:', ghlAccounts)
      console.log('GHL error details:', ghlError)
      
      // Additional debug - check all GHL accounts with user_ids
      const { data: allGhlAccounts } = await supabase
        .from('ghl_accounts')
        .select('user_id, id, company_id, location_id')
      console.log('🔍 ALL GHL ACCOUNTS IN DATABASE:', allGhlAccounts)
      
      // Check if any accounts exist for current user
      const { data: userAccounts } = await supabase
        .from('ghl_accounts')
        .select('*')
        .eq('user_id', user.id)
      console.log('🔍 ACCOUNTS FOR CURRENT USER:', userAccounts)
      
      // Quick fix: If no accounts for current user but accounts exist, try to match
      if ((!ghlAccounts || ghlAccounts.length === 0) && allGhlAccounts && allGhlAccounts.length > 0) {
        console.log('⚠️ No accounts for current user, but accounts exist in database')
        console.log('💡 Try updating localStorage with correct user_id:', allGhlAccounts[0].user_id)
        
        // Show fix suggestion in console
        console.log('🔧 FIX: Run this in console:')
        console.log(`localStorage.setItem('user', JSON.stringify({id: '${allGhlAccounts[0].user_id}', email: '${user.email}', name: '${user.name}'}))`)
      }
      
      if (ghlError) {
        console.error('Database error:', ghlError.message, ghlError.code)
      }
      setGhlAccounts(ghlAccounts || [])

      if (ghlAccounts && ghlAccounts.length > 0) {
        // Process all GHL accounts
        console.log('GHL accounts found, processing sessions...', ghlAccounts)
        
        const statuses: SubaccountStatus[] = []
        
        for (const ghlAccount of ghlAccounts) {
          if (ghlAccount.location_id) {
            try {
              const sessionResponse = await apiCall(API_ENDPOINTS.getSession(ghlAccount.location_id))
              let sessionData = { status: 'none', phone_number: null, qr: null }
              
              if (sessionResponse.ok) {
                sessionData = await sessionResponse.json()
              }
              
              const locationStatus: SubaccountStatus = {
                id: ghlAccount.id,
                name: `Location ${ghlAccount.location_id}`,
                ghl_location_id: ghlAccount.location_id,
                status: (sessionData.status as 'initializing' | 'qr' | 'ready' | 'disconnected' | 'none') || 'none',
                phone_number: sessionData.phone_number || undefined,
                qr: sessionData.qr || undefined
              }
              
              statuses.push(locationStatus)
              console.log('Location status added:', locationStatus)
    } catch (error) {
              console.error('Error fetching session status:', error)
              const fallbackStatus: SubaccountStatus = {
                id: ghlAccount.id,
                name: `Location ${ghlAccount.location_id}`,
                ghl_location_id: ghlAccount.location_id,
                status: 'none' as const
              }
              statuses.push(fallbackStatus)
            }
          }
        }
        
        setSubaccountStatuses(statuses)
        console.log('All subaccount statuses set:', statuses)
      } else {
        console.log('No GHL accounts found')
        setSubaccountStatuses([])
      }
    } catch (error) {
      console.error('Error fetching GHL locations:', error)
      setSubaccountStatuses([])
    } finally {
      setLoading(false)
    }
  }, [user])

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
    
    // Poll for status updates every 5 seconds
    const interval = setInterval(() => {
      fetchGHLLocations()
    }, 5000)
    
    return () => clearInterval(interval)
  }, [fetchGHLLocations])

  const openQR = async (locationId: string) => {
    try {
      console.log(`Creating session for locationId: ${locationId}`)
      
      // Show loading state
      const button = document.querySelector(`[data-location-id="${locationId}"]`) as HTMLButtonElement
      if (button) {
        button.disabled = true
        button.textContent = 'Initializing...'
      }
      
      // First create session if it doesn't exist
      const createResponse = await apiCall(API_ENDPOINTS.createSession(locationId), {
            method: 'POST',
        body: JSON.stringify({ locationId })
      })

      if (createResponse.ok) {
        console.log('Session created successfully')
        // Refresh the locations to show updated status
        await fetchGHLLocations()
        
        // Then open the provider page
        const link = API_ENDPOINTS.providerUI(locationId)
        window.open(link, '_blank')
            } else {
        const errorData = await createResponse.json()
        console.error('Failed to create session:', errorData)
        alert(`Failed to create session: ${errorData.error || 'Unknown error'}`)
        
        // Reset button state
        if (button) {
          button.disabled = false
          button.textContent = 'Open QR'
        }
        return
          }
        } catch (error) {
      console.error('Error creating session:', error)
      alert(`Error creating session: ${error}`)
      
      // Reset button state
      const button = document.querySelector(`[data-location-id="${locationId}"]`) as HTMLButtonElement
      if (button) {
        button.disabled = false
        button.textContent = 'Open QR'
        }
        return
    }
  }

  const logoutSession = async (locationId: string) => {
    if (!confirm('Are you sure you want to logout this WhatsApp session? This will disconnect WhatsApp from this location.')) {
      return
    }

    try {
      console.log(`Logging out session for locationId: ${locationId}`)
      
      const response = await apiCall(`${API_BASE_URL}/ghl/location/${locationId}/session/logout`, {
        method: 'POST'
      })

      if (response.ok) {
        console.log('Session logged out successfully')
        alert('WhatsApp session logged out successfully!')
        await fetchGHLLocations()
      } else {
        const errorData = await response.json()
        console.error('Failed to logout session:', errorData)
        alert(`Failed to logout session: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error logging out session:', error)
      alert(`Error logging out session: ${error}`)
    }
  }

  const deleteSubaccount = async (locationId: string) => {
    if (!confirm('Are you sure you want to delete this subaccount? This will permanently remove the WhatsApp connection and all associated data.')) {
        return
      }

    try {
      console.log(`Deleting subaccount for locationId: ${locationId}`)
      
      const response = await apiCall(`${API_BASE_URL}/admin/ghl/delete-subaccount`, {
        method: 'DELETE',
        body: JSON.stringify({ locationId })
      })

      if (response.ok) {
        console.log('Subaccount deleted successfully')
        alert('Subaccount deleted successfully!')
        await fetchGHLLocations()
      } else {
        const errorData = await response.json()
        console.error('Failed to delete subaccount:', errorData)
        alert(`Failed to delete subaccount: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting subaccount:', error)
      alert(`Error deleting subaccount: ${error}`)
    }
  }

  const syncAllSubaccounts = async () => {
    if (!confirm('This will refresh all tokens and reconnect all WhatsApp sessions. Continue?')) {
      return
    }

    try {
      console.log('Starting sync for all subaccounts...')
      
      // Show loading state
      const button = document.querySelector('button[onclick="syncAllSubaccounts"]') as HTMLButtonElement
      if (button) {
        button.disabled = true
        button.textContent = '🔄 Syncing...'
      }

      const response = await apiCall(`${API_BASE_URL}/admin/ghl/sync-all-subaccounts`, {
        method: 'POST'
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Sync completed:', result)
        alert(`Sync completed successfully! ${result.syncedCount} subaccounts processed.`)
        await fetchGHLLocations()
      } else {
        const errorData = await response.json()
        console.error('Failed to sync subaccounts:', errorData)
        alert(`Failed to sync subaccounts: ${errorData.error || 'Unknown error'}`)
          }
        } catch (error) {
      console.error('Error syncing subaccounts:', error)
      alert(`Error syncing subaccounts: ${error}`)
    } finally {
      // Reset button state
      const button = document.querySelector('button[onclick="syncAllSubaccounts"]') as HTMLButtonElement
      if (button) {
        button.disabled = false
        button.textContent = '🔄 Sync Subaccounts'
      }
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
              </svg>
            </div>
            <div className="w-12 h-12 bg-indigo-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
          </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          WhatsApp GHL Integration
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto mb-4">
          Seamlessly connect WhatsApp with GoHighLevel for powerful business communication
        </p>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchGHLLocations}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            🔄 Refresh Status
          </button>
          <button
            onClick={syncAllSubaccounts}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            🔄 Sync Subaccounts
          </button>
        </div>
      </div>

      {/* GHL Connection Status */}
      {ghlAccounts.length > 0 ? (
        <>
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">GHL Accounts Connected</h3>
                <p className="text-gray-600">{ghlAccounts.length} GoHighLevel account(s) successfully connected</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Connected GHL Accounts</h3>
          <div className="space-y-3">
            {ghlAccounts.map((account, index) => (
              <div key={account.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                    <span className="text-green-600 font-semibold text-sm">{index + 1}</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Location: {account.location_id}</p>
                    <p className="text-sm text-gray-500">Connected: {new Date(account.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Connected
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        </>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="h-5 w-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Connect GHL Account</h3>
                <p className="text-gray-600">Link your GoHighLevel account to get started</p>
              </div>
            </div>
            <a
              href="/dashboard/add-subaccount"
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              Connect GHL Account
            </a>
          </div>
        </div>
      )}

      {/* Locations List */}
      {subaccountStatuses.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Your GHL Locations</h2>
          <div className="space-y-4">
            {subaccountStatuses.map((subaccount) => (
              <div key={subaccount.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{subaccount.name}</h3>
                      <p className="text-gray-500 text-sm">Location ID: {subaccount.ghl_location_id}</p>
                      {subaccount.phone_number && (
                        <p className="text-green-600 text-sm mt-1">📱 {subaccount.phone_number}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${
                        subaccount.status === 'ready' ? 'bg-green-500' :
                        subaccount.status === 'qr' ? 'bg-yellow-500 animate-pulse' :
                        subaccount.status === 'initializing' ? 'bg-blue-500 animate-pulse' :
                        subaccount.status === 'disconnected' ? 'bg-red-500' :
                        'bg-gray-400'
                      }`}></div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        subaccount.status === 'ready' ? 'bg-green-100 text-green-800' :
                        subaccount.status === 'qr' ? 'bg-yellow-100 text-yellow-800' :
                        subaccount.status === 'initializing' ? 'bg-blue-100 text-blue-800' :
                        subaccount.status === 'disconnected' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {subaccount.status === 'ready' ? `Connected ${subaccount.phone_number ? `(${subaccount.phone_number})` : ''}` :
                         subaccount.status === 'qr' ? 'Scan QR Code' :
                         subaccount.status === 'initializing' ? 'Initializing...' :
                         subaccount.status === 'disconnected' ? 'Disconnected' :
                         'Not Connected'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        data-location-id={subaccount.ghl_location_id}
                        onClick={() => openQR(subaccount.ghl_location_id)}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {subaccount.status === 'qr' ? 'Scan QR' : 'Open QR'}
                      </button>
                      
                      {subaccount.status === 'ready' && (
                        <button
                          onClick={() => logoutSession(subaccount.ghl_location_id)}
                          className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                          title="Logout WhatsApp Session"
                        >
                          🚪 Logout
                        </button>
                      )}
                      
            <button
                        onClick={() => deleteSubaccount(subaccount.ghl_location_id)}
                        className="bg-gray-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                        title="Delete Subaccount"
                      >
                        🗑️ Delete
            </button>
          </div>
          </div>
                </div>
              </div>
            ))}
            </div>
            </div>
          ) : (
        <div className="glass p-8 text-center">
          <div className="ghl-gradient p-4 rounded-2xl w-16 h-16 mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
            </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Get Started</h3>
          <p className="text-gray-600 mb-6">Connect your GoHighLevel account to start using WhatsApp as an SMS provider.</p>
          <a
            href="/dashboard/add-subaccount"
            className="ghl-gradient text-white px-8 py-4 rounded-xl font-semibold hover:shadow-lg transition-all duration-300 transform hover:scale-105 inline-block"
          >
            Connect GHL Account
          </a>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">How to Use</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-600 font-semibold text-sm">1</span>
              </div>
              <p className="text-gray-700 text-sm">Connect your GHL account above</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-600 font-semibold text-sm">2</span>
              </div>
              <p className="text-gray-700 text-sm">Your locations will appear automatically</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-600 font-semibold text-sm">3</span>
              </div>
              <p className="text-gray-700 text-sm">Click &quot;Open QR&quot; to scan WhatsApp QR code</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-600 font-semibold text-sm">4</span>
              </div>
              <p className="text-gray-700 text-sm">In GHL Agency, add custom menu link:</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 ml-9">
              <code className="text-indigo-600 text-sm break-all">
                {process.env.NEXT_PUBLIC_API_BASE_URL}/ghl/provider?locationId=&#123;locationId&#125;
              </code>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-600 font-semibold text-sm">5</span>
              </div>
              <p className="text-gray-700 text-sm">Set as SMS provider in GHL Phone System settings</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
