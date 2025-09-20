'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Database } from '@/lib/supabase';
import SubaccountSelector from '@/components/dashboard/SubaccountSelector';
import GHLLocationSelector from '@/components/dashboard/GHLLocationSelector';
import ConnectGHLButton from '@/components/integrations/ConnectGHLButton';
import ProviderStatus from '@/components/dashboard/ProviderStatus';
import CreateSessionCard from '@/components/dashboard/CreateSessionCard';
import ChatPane from '@/components/dashboard/ChatPane';
import ProviderTestForm from '@/components/dashboard/ProviderTestForm';
import GHLConversations from '@/components/dashboard/GHLConversations';

type Subaccount = Database['public']['Tables']['subaccounts']['Row'];

interface Session {
  id: string;
  status: 'initializing' | 'qr' | 'ready' | 'disconnected';
  qr: string | null;
  phone_number: string | null;
  created_at: string;
}

export default function DashboardEnhanced() {
  const router = useRouter();
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([]);
  const [selectedSubaccount, setSelectedSubaccount] = useState<Subaccount | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const fetchSubaccounts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('subaccounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubaccounts(data || []);
    } catch (error) {
      console.error('Error fetching subaccounts:', error);
    }
  }, []);

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      await fetchSubaccounts();
      setLoading(false);
    };
    checkAuth();
  }, [router, fetchSubaccounts]);

  // Check for GHL connection success
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ghlConnected = urlParams.get('ghl');
    if (ghlConnected === 'connected') {
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 5000);
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard-enhanced');
    }
  }, []);

  const fetchSessions = useCallback(async (subaccountId: string) => {
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/sessions?subaccountId=${subaccountId}`, {
        headers: {
          'Authorization': `Bearer ${authSession.access_token}`,
        },
      });

      if (response.ok) {
        const sessionsData = await response.json();
        setSessions(sessionsData);
        
        // Auto-select ready session
        const readySession = sessionsData.find((s: Session) => s.status === 'ready');
        if (readySession) {
          setSelectedSession(readySession);
        }
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  }, []);

  const handleSubaccountChange = (subaccount: Subaccount | null) => {
    setSelectedSubaccount(subaccount);
    setSelectedSession(null);
    
    if (subaccount) {
      fetchSessions(subaccount.id);
    } else {
      setSessions([]);
    }
  };

  const handleSessionCreated = () => {
    if (selectedSubaccount) {
      fetchSessions(selectedSubaccount.id);
    }
  };

  const handleGHLConnected = () => {
    fetchSubaccounts();
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 5000);
  };

  const handleGHLLocationSelect = async (location: { id: string; name: string }) => {
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) throw new Error('Not authenticated');

      // Create subaccount for this GHL location
      const { data: subaccount, error: subaccountError } = await supabase
        .from('subaccounts')
        .insert({
          name: location.name,
          ghl_location_id: location.id,
          user_id: authSession.user.id
        })
        .select()
        .single();

      if (subaccountError) throw subaccountError;

      // Refresh subaccounts list
      await fetchSubaccounts();
      
      // Select the newly created subaccount
      setSelectedSubaccount(subaccount);
      
      // Auto-create WhatsApp session for this location
      const sessionResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/create-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({
          subaccountId: subaccount.id
        }),
      });

      if (sessionResponse.ok) {
        await sessionResponse.json();
        // Refresh sessions list
        await fetchSessions(subaccount.id);
      }
    } catch (error) {
      console.error('Error creating subaccount and session:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">WhatsApp Integration</h1>
              <p className="mt-1 text-sm text-gray-500">
                Advanced GoHighLevel Conversations Provider
              </p>
            </div>
            <ConnectGHLButton onConnected={handleGHLConnected} />
          </div>
        </div>
      </div>

      {/* Success Message */}
      {showSuccessMessage && (
        <div className="bg-green-50 border-l-4 border-green-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                Successfully connected to GoHighLevel!
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Configuration */}
          <div className="space-y-6">
            {/* GHL Location Selector */}
            <GHLLocationSelector onLocationSelect={handleGHLLocationSelect} />

            {/* Subaccount Selector */}
            {subaccounts.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Connected Subaccounts</h2>
                <SubaccountSelector
                  subaccounts={subaccounts}
                  selectedSubaccount={selectedSubaccount}
                  onSubaccountChange={handleSubaccountChange}
                />
              </div>
            )}

            {/* Provider Status */}
            {selectedSubaccount && selectedSubaccount.ghl_location_id && (
              <ProviderStatus
                subaccountId={selectedSubaccount.id}
                ghlLocationId={selectedSubaccount.ghl_location_id}
              />
            )}

            {/* Session Management */}
            {selectedSubaccount && (
              <CreateSessionCard
                subaccountId={selectedSubaccount.id}
                onSessionCreated={handleSessionCreated}
              />
            )}

            {/* Provider Test */}
            {selectedSubaccount && selectedSubaccount.ghl_location_id && (
              <ProviderTestForm
                subaccountId={selectedSubaccount.id}
                ghlLocationId={selectedSubaccount.ghl_location_id}
              />
            )}

            {/* GHL Conversations */}
            {selectedSubaccount && selectedSubaccount.ghl_location_id && (
              <GHLConversations
                locationId={selectedSubaccount.ghl_location_id}
              />
            )}
          </div>

          {/* Right Column - Chat */}
          <div className="lg:col-span-2">
            {selectedSession ? (
              <div className="h-[600px]">
                <ChatPane
                  sessionId={selectedSession.id}
                  subaccountId={selectedSubaccount?.id || ''}
                />
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No Active Session</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Create a WhatsApp session to start messaging.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sessions List */}
        {sessions.length > 0 && (
          <div className="mt-8">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Active Sessions</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 ${
                      selectedSession?.id === session.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => setSelectedSession(session)}
                  >
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-3 ${
                        session.status === 'ready' ? 'bg-green-400' :
                        session.status === 'qr' ? 'bg-yellow-400' :
                        session.status === 'initializing' ? 'bg-blue-400' :
                        'bg-red-400'
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Session {session.id.slice(0, 8)}...
                        </p>
                        <p className="text-sm text-gray-500">
                          {session.phone_number || 'No phone number'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        session.status === 'ready' ? 'bg-green-100 text-green-800' :
                        session.status === 'qr' ? 'bg-yellow-100 text-yellow-800' :
                        session.status === 'initializing' ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {session.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
