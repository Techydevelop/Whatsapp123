import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // Disable Supabase Auth - we're using custom auth
  },
})

// Database types for TypeScript
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          name: string
          email: string
          password: string
          is_verified: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          password: string
          is_verified?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          password?: string
          is_verified?: boolean
          created_at?: string
        }
      }
      ghl_accounts: {
        Row: {
          id: string
          user_id: string
          company_id: string
          location_id: string
          access_token: string
          refresh_token: string
          token_expires_at: string
          user_type: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_id: string
          location_id: string
          access_token: string
          refresh_token: string
          token_expires_at?: string
          user_type?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_id?: string
          location_id?: string
          access_token?: string
          refresh_token?: string
          token_expires_at?: string
          user_type?: string
          created_at?: string
        }
      }
      subaccounts: {
        Row: {
          id: string
          user_id: string
          ghl_location_id: string
          name: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ghl_location_id: string
          name: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ghl_location_id?: string
          name?: string
          status?: string
          created_at?: string
        }
      }
      sessions: {
        Row: {
          id: string
          user_id: string
          subaccount_id: string
          status: string
          qr: string | null
          phone_number: string | null
          mode: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          subaccount_id: string
          status?: string
          qr?: string | null
          phone_number?: string | null
          mode?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          subaccount_id?: string
          status?: string
          qr?: string | null
          phone_number?: string | null
          mode?: string | null
          created_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          session_id: string
          subaccount_id: string
          from_number: string
          to_number: string
          body: string
          media_url: string | null
          media_mime: string | null
          direction: 'in' | 'out'
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          subaccount_id: string
          from_number: string
          to_number: string
          body: string
          media_url?: string | null
          media_mime?: string | null
          direction: 'in' | 'out'
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          subaccount_id?: string
          from_number?: string
          to_number?: string
          body?: string
          media_url?: string | null
          media_mime?: string | null
          direction?: 'in' | 'out'
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

