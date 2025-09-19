'use client'

import { useState, useEffect } from 'react'
import { supabase, Database } from '@/lib/supabase'

type Subaccount = Database['public']['Tables']['subaccounts']['Row']
type GhlAccount = Database['public']['Tables']['ghl_accounts']['Row']

interface LocationToken {
  token: string
  expires_at: string
}

interface GHLIntegrationProps {
  subaccount: Subaccount | null
  onSubaccountUpdate: () => void
}

export default function GHLIntegration({ subaccount, onSubaccountUpdate }: GHLIntegrationProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [ghlLocationId, setGhlLocationId] = useState(subaccount?.ghl_location_id || '')
  const [ghlAccount, setGhlAccount] = useState<GhlAccount | null>(null)
  const [isGhlUser, setIsGhlUser] = useState(false)
  const [locationToken, setLocationToken] = useState<LocationToken | null>(null)
  const [isMintingToken, setIsMintingToken] = useState(false)

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Consider connected if either metadata exists OR an account row exists
      const metaConnected = Boolean(user.user_metadata?.ghl_user_id)
      const { data: acct } = await supabase
        .from('ghl_accounts')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      setIsGhlUser(metaConnected || Boolean(acct))
      setGhlAccount(acct)
    }
    check()
  }, [])

  useEffect(() => {
    const fetchLocationToken = async () => {
      if (!subaccount?.ghl_location_id) {
        setLocationToken(null)
        return
      }

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/location-token/${subaccount.id}`, {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        })

        if (response.ok) {
          const token = await response.json()
          setLocationToken(token)
        } else {
          setLocationToken(null)
        }
      } catch (error) {
        console.error('Error fetching location token:', error)
        setLocationToken(null)
      }
    }

    fetchLocationToken()
  }, [subaccount])

  const mintLocationToken = async () => {
    if (!subaccount) return

    setIsMintingToken(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/mint-location-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          subaccountId: subaccount.id,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to mint location token')
      }

      const result = await response.json()
      setLocationToken(result.token)
    } catch (error) {
      console.error('Error minting location token:', error)
    } finally {
      setIsMintingToken(false)
    }
  }

  const connectGHL = async () => {
    setIsConnecting(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/ghl/connect`)
      if (response.ok) {
        const { authUrl } = await response.json()
        window.open(authUrl, '_blank')
      }
    } catch (error) {
      console.error('Error connecting to GHL:', error)
    } finally {
      setIsConnecting(false)
    }
  }

  const updateLocationId = async () => {
    if (!subaccount || !ghlLocationId) return

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) throw new Error('Not authenticated')

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/subaccount/${subaccount.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({
          ghl_location_id: ghlLocationId
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update location ID')
      }

      onSubaccountUpdate()
    } catch (error) {
      console.error('Error updating location ID:', error)
    }
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">GHL Integration</h3>
      
      {isGhlUser ? (
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              ✓ Logged in with GHL
            </span>
            {ghlAccount && (
              <span className="text-sm text-gray-600">
                Company ID: {ghlAccount.company_id}
              </span>
            )}
          </div>
          
          {subaccount ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  GHL Location ID
                </label>
                <div className="mt-1 flex space-x-2">
                  <input
                    type="text"
                    value={ghlLocationId}
                    onChange={(e) => setGhlLocationId(e.target.value)}
                    placeholder="Enter GHL Location ID"
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  />
                  <button
                    onClick={updateLocationId}
                    className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    Update
                  </button>
                </div>
              </div>

              {/* Location Token Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location Token Status
                </label>
                {locationToken ? (
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      ✓ Token Active
                    </span>
                    <span className="text-sm text-gray-600">
                      Expires: {new Date(locationToken.expires_at).toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      &#9888; No Token
                    </span>
                    <button
                      onClick={mintLocationToken}
                      disabled={isMintingToken || !subaccount.ghl_location_id}
                      className="px-3 py-1 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isMintingToken ? 'Minting...' : 'Mint Token'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Select a subaccount to configure GHL integration</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-gray-600">Connect your GoHighLevel account to enable advanced features</p>
          
          <div className="flex space-x-4">
            <button
              onClick={async () => {
                const { data: { user } } = await supabase.auth.getUser()
                const userId = user?.id || ''
                window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/ghl/login${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`
              }}
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
            >
              Login with GoHighLevel
            </button>
            
            <button
              onClick={connectGHL}
              disabled={isConnecting}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {isConnecting ? 'Connecting...' : 'Connect Additional Account'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
