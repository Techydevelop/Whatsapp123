'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
import { API_ENDPOINTS, API_BASE_URL, apiCall } from '@/lib/config'
// import Modal from '@/components/ui/Modal'

type GhlAccount = Database['public']['Tables']['ghl_accounts']['Row']

interface SubaccountStatus {
  id: string
  name: string
  ghl_location_id: string
  status: 'initializing' | 'qr' | 'ready' | 'disconnected' | 'none'
  phone_number?: string
  qr?: string
  created_at?: string
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [ghlAccounts, setGhlAccounts] = useState<GhlAccount[]>([])
  const [subaccountStatuses, setSubaccountStatuses] = useState<SubaccountStatus[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchGHLLocations = useCallback(async (showLoading = true) => {
    try {
      console.log('🔍 fetchGHLLocations called, user:', user?.id)
      
      if (!user) {
        console.log('❌ No user found, returning')
        return
      }
      
      if (showLoading) setLoading(true)

      // Get ALL GHL accounts for this user
      console.log('📊 Fetching GHL accounts for user:', user.id)
      const { data: ghlAccounts, error: ghlError } = await supabase
        .from('ghl_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      console.log('📋 GHL Accounts fetched:', ghlAccounts?.length || 0, 'accounts')
      
      if (ghlError) {
        console.error('❌ Database error:', ghlError.message, ghlError.code)
      }
      setGhlAccounts(ghlAccounts || [])

      if (ghlAccounts && ghlAccounts.length > 0) {
        // Fetch all sessions in parallel for better performance
        const statusPromises = ghlAccounts.map(async (ghlAccount) => {
          if (ghlAccount.location_id) {
            try {
              const sessionResponse = await apiCall(API_ENDPOINTS.getSession(ghlAccount.location_id))
              let sessionData = { status: 'none', phone_number: null, qr: null }
              
              if (sessionResponse.ok) {
                sessionData = await sessionResponse.json()
              }
              
              return {
                id: ghlAccount.id,
                name: `Location ${ghlAccount.location_id}`,
                ghl_location_id: ghlAccount.location_id,
                status: (sessionData.status as 'initializing' | 'qr' | 'ready' | 'disconnected' | 'none') || 'none',
                phone_number: sessionData.phone_number || undefined,
                qr: sessionData.qr || undefined,
                created_at: ghlAccount.created_at
              }
            } catch (error) {
              console.error('Error fetching session status:', error)
              return {
                id: ghlAccount.id,
                name: `Location ${ghlAccount.location_id}`,
                ghl_location_id: ghlAccount.location_id,
                status: 'none' as const,
                created_at: ghlAccount.created_at
              }
            }
          }
          return null
        })
        
        const statuses = (await Promise.all(statusPromises)).filter(Boolean) as SubaccountStatus[]
        console.log('✅ Final statuses:', statuses.length, 'accounts processed')
        setSubaccountStatuses(statuses)
      } else {
        console.log('⚠️ No GHL accounts found')
        setSubaccountStatuses([])
      }
    } catch (error) {
      console.error('❌ Error fetching GHL locations:', error)
      setSubaccountStatuses([])
    } finally {
      console.log('🏁 Fetch complete, setting loading to false')
      setLoading(false)
      setRefreshing(false)
    }
  }, [user])

  useEffect(() => {
    console.log('🚀 Dashboard mounted, fetching locations...')
    fetchGHLLocations()
  }, [fetchGHLLocations])
  
  // Separate effect for polling to avoid issues
  useEffect(() => {
    // Check if any account is pending (qr or initializing)
    const hasPending = subaccountStatuses.some(acc => 
      acc.status === 'qr' || acc.status === 'initializing'
    )
    
    // Fast polling (3s) if any account is pending, slow polling (15s) otherwise
    const pollInterval = hasPending ? 3000 : 15000
    
    console.log(`⏱️ Setting up polling: ${pollInterval}ms (hasPending: ${hasPending})`)
    
    const interval = setInterval(() => {
      console.log('🔄 Polling for updates...')
      fetchGHLLocations(false)
    }, pollInterval)
    
    return () => {
      console.log('🛑 Clearing polling interval')
      clearInterval(interval)
    }
  }, [subaccountStatuses, fetchGHLLocations])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchGHLLocations(false)
  }

  const openQR = async (locationId: string) => {
    try {
      const createResponse = await apiCall(API_ENDPOINTS.createSession(locationId), {
        method: 'POST',
        body: JSON.stringify({ locationId })
      })

      if (createResponse.ok) {
        await fetchGHLLocations(false)
        const link = API_ENDPOINTS.providerUI(locationId)
        window.open(link, '_blank')
      } else {
        const errorData = await createResponse.json()
        alert(`Failed to create session: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error creating session:', error)
      alert(`Error creating session: ${error}`)
    }
  }

  const logoutSession = async (locationId: string) => {
    if (!confirm('⚠️ Are you sure you want to logout this WhatsApp session?\n\nYou will need to scan the QR code again to reconnect.')) {
      return
    }
    
    try {
      const response = await apiCall(`${API_BASE_URL}/ghl/location/${locationId}/session/logout`, {
        method: 'POST'
      })

      if (response.ok) {
        setNotification({ type: 'success', message: '✅ WhatsApp session logged out successfully!' })
        await fetchGHLLocations(false)
      } else {
        const errorData = await response.json()
        setNotification({ type: 'error', message: `❌ Failed to logout: ${errorData.error || 'Unknown error'}` })
      }
    } catch (error) {
      console.error('Error logging out session:', error)
      setNotification({ type: 'error', message: '❌ Failed to logout session. Please try again.' })
    }
  }

  const deleteSubaccount = async (locationId: string) => {
    if (!confirm('🗑️ Are you sure you want to delete this subaccount?\n\n⚠️ This will permanently remove:\n• All WhatsApp session data\n• Connection settings\n• Chat history\n\n❌ This action cannot be undone!')) {
      return
    }
    
    try {
      console.log('🗑️ Deleting subaccount with locationId:', locationId)
      console.log('👤 Current user:', user)
      console.log('🆔 User ID:', user?.id)
      
      if (!user) {
        setNotification({ type: 'error', message: '❌ User not authenticated' })
        return
      }
      
      // Delete from ghl_accounts table (correct table!)
      console.log('🔍 Searching for GHL account...')
      const { data: ghlAccount, error: ghlAccountFetchError } = await supabase
        .from('ghl_accounts')
        .select('id, location_id, user_id')
        .eq('location_id', locationId)
        .eq('user_id', user.id)
        .maybeSingle()
      
      console.log('📋 GHL Account search result:', { ghlAccount, error: ghlAccountFetchError })
      
      if (ghlAccountFetchError) {
        console.error('Error finding GHL account:', ghlAccountFetchError)
        setNotification({ type: 'error', message: `❌ Error finding account: ${ghlAccountFetchError.message}` })
        return
      }
      
      if (!ghlAccount) {
        console.log('❌ No GHL account found for this location')
        setNotification({ type: 'error', message: '❌ Account not found' })
        return
      }
      
      console.log('📋 Found GHL account ID:', ghlAccount.id)
      
      // Delete sessions first (if any exist)
      console.log('🗑️ Deleting sessions...')
      const { error: sessionsError } = await supabase
        .from('sessions')
        .delete()
        .eq('ghl_location_id', locationId) // Sessions might reference location_id directly
      
      if (sessionsError) {
        console.error('Error deleting sessions:', sessionsError)
        // Continue anyway - sessions might not exist
      } else {
        console.log('✅ Sessions deleted successfully')
      }
      
      // Delete GHL account
      console.log('🗑️ Deleting GHL account...')
      const { error: ghlAccountError } = await supabase
        .from('ghl_accounts')
        .delete()
        .eq('id', ghlAccount.id)
      
      if (ghlAccountError) {
        console.error('Error deleting GHL account:', ghlAccountError)
        setNotification({ type: 'error', message: `❌ Failed to delete: ${ghlAccountError.message}` })
        return
      }
      
      console.log('✅ GHL account deleted successfully')
      setNotification({ type: 'success', message: '✅ Account deleted successfully!' })
      await fetchGHLLocations(false)
      
    } catch (error) {
      console.error('Error deleting account:', error)
      setNotification({ type: 'error', message: '❌ Failed to delete account. Please try again.' })
    }
  }
  
  // Auto-hide notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  // Filter and search
  const filteredAccounts = subaccountStatuses.filter(account => {
    const matchesSearch = account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         account.ghl_location_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         account.phone_number?.includes(searchQuery)
    
    const matchesStatus = filterStatus === 'all' || account.status === filterStatus
    
    return matchesSearch && matchesStatus
  })

  // Pagination
  const totalPages = Math.ceil(filteredAccounts.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentAccounts = filteredAccounts.slice(startIndex, endIndex)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterStatus])

  const getStatusBadge = (status: string) => {
    const badges = {
      ready: { color: 'bg-green-100 text-green-800', icon: '✓', text: 'Connected' },
      qr: { color: 'bg-yellow-100 text-yellow-800', icon: '⏳', text: 'Pending QR' },
      initializing: { color: 'bg-blue-100 text-blue-800', icon: '🔄', text: 'Initializing' },
      disconnected: { color: 'bg-red-100 text-red-800', icon: '✗', text: 'Disconnected' },
      none: { color: 'bg-gray-100 text-gray-800', icon: '○', text: 'Not Connected' }
    }
    return badges[status as keyof typeof badges] || badges.none
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading accounts...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Accounts</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{subaccountStatuses.length}</p>
            </div>
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Connected</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                {subaccountStatuses.filter(a => a.status === 'ready').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-3xl font-bold text-yellow-600 mt-1">
                {subaccountStatuses.filter(a => a.status === 'qr' || a.status === 'initializing').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Disconnected</p>
              <p className="text-3xl font-bold text-red-600 mt-1">
                {subaccountStatuses.filter(a => a.status === 'disconnected' || a.status === 'none').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Table Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">GHL Accounts</h2>
              <p className="text-sm text-gray-500 mt-1">Manage your GoHighLevel WhatsApp integrations</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <svg className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              <a
                href="/dashboard/add-subaccount"
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Account
              </a>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by location ID, phone number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="ready">Connected</option>
                <option value="qr">Pending QR</option>
                <option value="initializing">Initializing</option>
                <option value="disconnected">Disconnected</option>
                <option value="none">Not Connected</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        {currentAccounts.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentAccounts.map((account) => {
                    const statusBadge = getStatusBadge(account.status)
                    return (
                      <tr key={account.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                              </svg>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{account.name}</div>
                              <div className="text-sm text-gray-500">{account.ghl_location_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {account.phone_number || (
                              <span className="text-gray-400 italic">Not connected</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge.color}`}>
                            <span className="mr-1">{statusBadge.icon}</span>
                            {statusBadge.text}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {account.created_at ? new Date(account.created_at).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => openQR(account.ghl_location_id)}
                              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                              </svg>
                              QR Code
                            </button>
                            {account.status === 'ready' && (
                              <button
                                onClick={() => logoutSession(account.ghl_location_id)}
                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                                title="Logout Session"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => deleteSubaccount(account.ghl_location_id)}
                              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors"
                              title="Delete Account"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(endIndex, filteredAccounts.length)}</span> of{' '}
                    <span className="font-medium">{filteredAccounts.length}</span> results
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            currentPage === page
                              ? 'bg-indigo-600 text-white'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="px-6 py-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No accounts found</h3>
            <p className="text-gray-500 mb-6">
              {searchQuery || filterStatus !== 'all'
                ? 'Try adjusting your search or filter to find what you\'re looking for.'
                : 'Get started by connecting your first GoHighLevel account.'}
            </p>
            {!searchQuery && filterStatus === 'all' && (
              <a
                href="/dashboard/add-subaccount"
                className="inline-flex items-center px-6 py-3 border border-transparent rounded-lg text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Your First Account
              </a>
            )}
          </div>
        )}
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
          <div className={`max-w-md rounded-lg shadow-lg p-4 ${
            notification.type === 'success' 
              ? 'bg-green-50 border-l-4 border-green-500' 
              : 'bg-red-50 border-l-4 border-red-500'
          }`}>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                {notification.type === 'success' ? (
                  <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div className="ml-3 flex-1">
                <p className={`text-sm font-medium ${
                  notification.type === 'success' ? 'text-green-800' : 'text-red-800'
                }`}>
                  {notification.message}
                </p>
              </div>
              <button
                onClick={() => setNotification(null)}
                className={`ml-4 inline-flex flex-shrink-0 ${
                  notification.type === 'success' ? 'text-green-500 hover:text-green-600' : 'text-red-500 hover:text-red-600'
                }`}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

