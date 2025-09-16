import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      subaccounts: {
        Row: {
          id: string
          user_id: string
          ghl_location_id: string | null
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ghl_location_id?: string | null
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ghl_location_id?: string | null
          name?: string
          created_at?: string
        }
      }
      sessions: {
        Row: {
          id: string
          user_id: string
          subaccount_id: string
          phone_number: string | null
          status: 'initializing' | 'qr' | 'ready' | 'disconnected'
          qr: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          subaccount_id: string
          phone_number?: string | null
          status?: 'initializing' | 'qr' | 'ready' | 'disconnected'
          qr?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          subaccount_id?: string
          phone_number?: string | null
          status?: 'initializing' | 'qr' | 'ready' | 'disconnected'
          qr?: string | null
          created_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          session_id: string
          user_id: string
          subaccount_id: string
          from_number: string
          to_number: string
          body: string
          direction: 'in' | 'out'
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          subaccount_id: string
          from_number: string
          to_number: string
          body: string
          direction: 'in' | 'out'
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string
          subaccount_id?: string
          from_number?: string
          to_number?: string
          body?: string
          direction?: 'in' | 'out'
          created_at?: string
        }
      }
      ghl_accounts: {
        Row: {
          id: string
          user_id: string
          access_token: string
          refresh_token: string
          company_id: string
          location_id: string
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          access_token: string
          refresh_token: string
          company_id: string
          location_id: string
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          access_token?: string
          refresh_token?: string
          company_id?: string
          location_id?: string
          expires_at?: string
          created_at?: string
        }
      }
    }
  }
}
