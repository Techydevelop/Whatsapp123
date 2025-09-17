'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/supabase'
import SubaccountSelector from '@/components/dashboard/SubaccountSelector'
import SessionsList from '@/components/dashboard/SessionsList'
import ChatWindow from '@/components/dashboard/ChatWindow'
import GHLIntegration from '@/components/dashboard/GHLIntegration'

type Subaccount = Database['public']['Tables']['subaccounts']['Row']
type Session = Database['public']['Tables']['sessions']['Row']

export default function Dashboard() {
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([])
  const [selectedSubaccount, setSelectedSubaccount] = useState<Subaccount | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSubaccounts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('subaccounts')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setSubaccounts(data || [])
      
      if (data && data.length > 0 && !selectedSubaccount) {
        setSelectedSubaccount(data[0])
      }
    } catch (error) {
      console.error('Error fetching subaccounts:', error)
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

  useEffect(() => {
    const init = async () => {
      await fetchSubaccounts()
      setLoading(false)
    }
    init()
  }, [fetchSubaccounts])

  useEffect(() => {
    if (selectedSubaccount) {
      fetchSessions(selectedSubaccount.id)
      mintLocationToken(selectedSubaccount.id)
    }
  }, [selectedSubaccount, fetchSessions])

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

  const createSubaccount = async (name: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('subaccounts')
        .insert({
          name,
          user_id: user.id,
        })
        .select()
        .single()

      if (error) throw error
      setSubaccounts([data, ...subaccounts])
      setSelectedSubaccount(data)
    } catch (error) {
      console.error('Error creating subaccount:', error)
    }
  }

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
      {/* GHL Integration */}
      <GHLIntegration 
        subaccount={selectedSubaccount}
        onSubaccountUpdate={fetchSubaccounts}
      />

      {/* Subaccount Selector */}
      <SubaccountSelector
        subaccounts={subaccounts}
        selectedSubaccount={selectedSubaccount}
        onSelect={setSelectedSubaccount}
        onCreate={createSubaccount}
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
