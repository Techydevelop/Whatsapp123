'use client'

import { useState, useEffect } from 'react'

interface AdminUser {
  id: string
  email: string
  name: string
  isAdmin: boolean
  role?: string
  is_active?: boolean
}

export function useAdminAuth() {
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAdminAuth()
  }, [])

  const checkAdminAuth = async () => {
    try {
      const response = await fetch('/api/auth/check', {
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        setAdmin(data.user)
      } else {
        setAdmin(null)
      }
    } catch (error) {
      console.error('Admin auth check error:', error)
      setAdmin(null)
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      if (response.ok) {
        const data = await response.json()
        setAdmin(data.user)
        return { success: true }
      } else {
        const error = await response.json()
        return { success: false, error: error.error }
      }
    } catch (error) {
      return { success: false, error: 'Login failed' }
    }
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
      setAdmin(null)
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return { admin, loading, login, logout, checkAdminAuth }
}

