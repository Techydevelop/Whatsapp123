'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
import SubaccountSelector from '@/components/dashboard/SubaccountSelector'
import SessionsList from '@/components/dashboard/SessionsList'
import ChatWindow from '@/components/dashboard/ChatWindow'
import GHLIntegration from '@/components/dashboard/GHLIntegration'

type Subaccount = Database['public']['Tables']['subaccounts']['Row']
type Session = Database['public']['Tables']['sessions']['Row']

interface GHLLead {
  id: string
  name: string
  phone: string
  email?: string
  status: string
  source: string
  created_at: string
}

export default function Dashboard() {
  const searchParams = useSearchParams()
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([])
  const [selectedSubaccount, setSelectedSubaccount] = useState<Subaccount | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [ghlLeads, setGhlLeads] = useState<GHLLead[]>([])
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  const fetchSubaccounts = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch existing subaccounts from GHL
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/ghl/subaccounts`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      })

      if (response.ok) {
        const { subaccounts: ghlSubaccounts } = await response.json()
        setSubaccounts(ghlSubaccounts || [])
        
        if (ghlSubaccounts && ghlSubaccounts.length > 0 && !selectedSubaccount) {
          setSelectedSubaccount(ghlSubaccounts[0])
        }
      } else {
        console.error('Failed to fetch GHL subaccounts')
        setSubaccounts([])
      }
    } catch (error) {
      console.error('Error fetching subaccounts:', error)
      setSubaccounts([])
    }
  }, [selectedSubaccount])

  const fetchSessions = useCallback(async (subaccountId: string) => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('subaccount_id', subaccountId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setSessions(data || [])
    } catch (error) {
      console.error('Error fetching sessions:', error)
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

  // Fetch GHL leads for selected subaccount
  const fetchGHLLeads = useCallback(async (subaccountId: string) => {
    if (!subaccountId) return
    
    setLoadingLeads(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Get location token for this subaccount
      const tokenResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/location-token/${subaccountId}`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      })

      if (!tokenResponse.ok) {
        console.log('No location token available for leads, trying to mint one...')
        // Try to mint location token first
        try {
          const mintResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/mint-location-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
            body: JSON.stringify({ subaccountId }),
          })
          
          if (mintResponse.ok) {
            // Retry getting location token
            const retryTokenResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/location-token/${subaccountId}`, {
              headers: {
                'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
              },
            })
            
            if (retryTokenResponse.ok) {
              const locationToken = await retryTokenResponse.json()
              await fetchLeadsWithToken(subaccountId, locationToken.access_token)
            } else {
              setGhlLeads([])
            }
          } else {
            setGhlLeads([])
          }
        } catch (mintError) {
          console.error('Error minting location token:', mintError)
          setGhlLeads([])
        }
        return
      }

      const locationToken = await tokenResponse.json()
      await fetchLeadsWithToken(subaccountId, locationToken.access_token)
      
    } catch (error) {
      console.error('Error fetching GHL leads:', error)
      setGhlLeads([])
    } finally {
      setLoadingLeads(false)
    }
  }, [])

  const fetchLeadsWithToken = async (subaccountId: string, accessToken: string) => {
    try {
      // Fetch leads from GHL API
      const leadsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/ghl/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          subaccountId,
          locationToken: accessToken
        }),
      })

      if (leadsResponse.ok) {
        const leads = await leadsResponse.json()
        setGhlLeads(leads || [])
        console.log('Fetched leads:', leads.length)
      } else {
        console.log('Failed to fetch leads')
        setGhlLeads([])
      }
    } catch (error) {
      console.error('Error fetching leads with token:', error)
      setGhlLeads([])
    }
  }

  useEffect(() => {
    const init = async () => {
      await fetchSubaccounts()
      setLoading(false)
    }
    init()
  }, [fetchSubaccounts])

  const mintLocationToken = useCallback(async (subaccountId: string) => {
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
          subaccountId,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        console.warn('Location token minting failed:', error.message)
        return
      }

      const result = await response.json()
      console.log('Location token minted:', result.message)
    } catch (error) {
      console.error('Error minting location token:', error)
    }
  }, [])

  useEffect(() => {
    if (selectedSubaccount) {
      fetchSessions(selectedSubaccount.id)
      mintLocationToken(selectedSubaccount.id)
      // Auto-fetch leads when subaccount is selected
      if (selectedSubaccount.ghl_location_id) {
        fetchGHLLeads(selectedSubaccount.id)
      }
    }
  }, [selectedSubaccount, fetchSessions, mintLocationToken, fetchGHLLeads])


  const createSession = async () => {
    if (!selectedSubaccount) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/create-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          subaccountId: selectedSubaccount.id,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to create session')
      }

      const { sessionId } = await response.json() as { sessionId: string }
      
      // Add the new session to the list immediately
      const newSession: Session = {
        id: sessionId,
        user_id: user.id,
        subaccount_id: selectedSubaccount.id,
        phone_number: null,
        status: 'initializing',
        qr: null,
        created_at: new Date().toISOString()
      }
      
      setSessions((prev: Session[]) => [newSession, ...prev])
      
      // Poll for session status updates
      const pollSession = async () => {
        try {
          const statusResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/session/${sessionId}`, {
            headers: {
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
          })
          
          if (statusResponse.ok) {
            const sessionData = await statusResponse.json() as Partial<Session>
            setSessions((prev: Session[]) => 
              prev.map((s: Session) => s.id === sessionId ? { ...s, ...sessionData } as Session : s)
            )
            
            // Continue polling if still initializing or showing QR
            if (sessionData.status === 'initializing' || sessionData.status === 'qr') {
              setTimeout(pollSession, 2000)
            }
          }
        } catch (error) {
          console.error('Error polling session:', error)
        }
      }
      
      // Start polling after a short delay
      setTimeout(pollSession, 1000)
      
    } catch (error) {
      console.error('Error creating session:', error)
    }
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

      {/* GHL Integration */}
      <GHLIntegration 
        subaccount={selectedSubaccount}
        onSubaccountUpdate={fetchSubaccounts}
      />

      {/* Subaccount Selector */}
      <SubaccountSelector
        subaccounts={subaccounts}
        selectedSubaccount={selectedSubaccount}
        onSubaccountChange={setSelectedSubaccount}
      />


      {/* Sessions and Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SessionsList
          sessions={sessions}
          selectedSession={selectedSession}
          onSelect={setSelectedSession}
          onCreate={createSession}
          subaccount={selectedSubaccount}
        />
        
        <ChatWindow
          session={selectedSession}
          subaccount={selectedSubaccount}
        />
      </div>
    </div>
  )
}
