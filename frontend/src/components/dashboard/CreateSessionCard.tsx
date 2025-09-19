'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

interface CreateSessionCardProps {
  subaccountId: string;
  onSessionCreated?: (sessionId: string) => void;
}

interface Session {
  id: string;
  status: 'initializing' | 'qr' | 'ready' | 'disconnected';
  qr: string | null;
  phone_number: string | null;
  created_at: string;
}

export default function CreateSessionCard({ subaccountId, onSessionCreated }: CreateSessionCardProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createSession = async () => {
    try {
      setIsCreating(true);
      setError(null);

      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) throw new Error('Not authenticated');

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/create-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({ subaccountId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create session');
      }

      const { sessionId } = await response.json();
      setSession({ id: sessionId, status: 'initializing', qr: null, phone_number: null, created_at: new Date().toISOString() });
      onSessionCreated?.(sessionId);
    } catch (error) {
      console.error('Error creating session:', error);
      setError(error instanceof Error ? error.message : 'Failed to create session');
    } finally {
      setIsCreating(false);
    }
  };

  const pollSessionStatus = useCallback(async (sessionId: string) => {
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/session/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${authSession.access_token}`,
        },
      });

      if (response.ok) {
        const sessionData = await response.json();
        setSession(sessionData);
        
        if (sessionData.status === 'ready') {
          return; // Stop polling
        }
      }
    } catch (error) {
      console.error('Error polling session status:', error);
    }

    // Continue polling if not ready
    if (session?.status !== 'ready') {
      setTimeout(() => pollSessionStatus(sessionId), 2000);
    }
  }, [session]);

  useEffect(() => {
    if (session && session.status !== 'ready') {
      const timer = setTimeout(() => pollSessionStatus(session.id), 2000);
      return () => clearTimeout(timer);
    }
  }, [session, pollSessionStatus]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'text-green-600 bg-green-100';
      case 'qr': return 'text-yellow-600 bg-yellow-100';
      case 'initializing': return 'text-blue-600 bg-blue-100';
      case 'disconnected': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready': return 'Connected';
      case 'qr': return 'Scan QR Code';
      case 'initializing': return 'Initializing...';
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">WhatsApp Session</h3>
      
      {!session ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Create a new WhatsApp session to start messaging. You&apos;ll need to scan a QR code with your phone.
          </p>
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          
          <button
            onClick={createSession}
            disabled={isCreating}
            className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating Session...
              </>
            ) : (
              'Create WhatsApp Session'
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(session.status)}`}>
                {getStatusText(session.status)}
              </span>
              {session.phone_number && (
                <span className="ml-2 text-sm text-gray-600">
                  {session.phone_number}
                </span>
              )}
            </div>
            
            {session.status === 'ready' && (
              <div className="flex items-center text-green-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>

          {session.status === 'qr' && session.qr && (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-3">
                Scan this QR code with your WhatsApp mobile app:
              </p>
              <div className="inline-block p-4 bg-white border-2 border-gray-200 rounded-lg">
                <Image 
                  src={session.qr} 
                  alt="WhatsApp QR Code" 
                  width={192}
                  height={192}
                  className="w-48 h-48"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Open WhatsApp → Menu → Linked Devices → Link a Device
              </p>
            </div>
          )}

          {session.status === 'initializing' && (
            <div className="text-center">
              <div className="inline-flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm text-gray-600">Initializing WhatsApp connection...</span>
              </div>
            </div>
          )}

          {session.status === 'disconnected' && (
            <div className="text-center">
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">
                  Session disconnected. Please create a new session.
                </p>
              </div>
              <button
                onClick={() => setSession(null)}
                className="mt-3 text-sm text-blue-600 hover:text-blue-800"
              >
                Create New Session
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
