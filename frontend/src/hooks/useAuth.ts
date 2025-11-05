import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface User {
  id: string
  email: string
  name?: string
}

export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const userData = localStorage.getItem('user')

      if (!userData) {
        router.push('/login')
        return
      }

      const parsed = JSON.parse(userData) as User
      setUser(parsed)

      // Fetch fresh profile from database to ensure we have latest name/email
      try {
        const { data } = await supabase
          .from('users')
          .select('id, name, email')
          .eq('id', parsed.id)
          .maybeSingle()

        if (data) {
          const refreshed: User = { id: data.id, name: data.name as unknown as string | undefined, email: data.email }
          setUser(refreshed)
          localStorage.setItem('user', JSON.stringify(refreshed))
        }
      } catch {
        // ignore; keep local values
      } finally {
        setLoading(false)
      }
    }

    void init()
  }, [router])

  const logout = async () => {
    // Clear cookie
    await fetch('/api/auth/logout', { method: 'POST' })
    
    // Clear localStorage
    localStorage.removeItem('user')
    
    // Redirect to login
    router.push('/login')
  }

  return { user, loading, logout }
}

