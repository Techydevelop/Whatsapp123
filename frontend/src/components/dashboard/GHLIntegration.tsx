'use client'

import { useState, useEffect } from 'react'
import { supabase, Database } from '@/lib/supabase'

type Subaccount = Database['public']['Tables']['subaccounts']['Row']
type GhlAccount = Database['public']['Tables']['ghl_accounts']['Row']

interface GHLIntegrationProps {
  subaccount: Subaccount | null
  onSubaccountUpdate: () => void
}

export default function GHLIntegration({ }: GHLIntegrationProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [ghlAccount, setGhlAccount] = useState<GhlAccount | null>(null)
  const [isGhlUser, setIsGhlUser] = useState(false)

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
          
          <p className="text-gray-500">Select a GHL subaccount below to get started</p>
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
