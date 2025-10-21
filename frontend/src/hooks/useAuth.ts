import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  email: string
  name: string
}

export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const userData = localStorage.getItem('user')

    if (!userData) {
      router.push('/login')
      return
    }

    setUser(JSON.parse(userData))
    setLoading(false)
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

