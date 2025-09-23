'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import Link from 'next/link'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
      
      if (!user) {
        router.push('/login')
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          router.push('/login')
        } else {
          setUser(session?.user ?? null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const navigation = [
    { name: 'Users', href: '/dashboard', current: pathname === '/dashboard' },
    { name: 'Add Sub-Account', href: '/dashboard/add-subaccount', current: pathname === '/dashboard/add-subaccount' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                WhatsApp SaaS Dashboard
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                {user.email}
              </span>
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="flex">
          {/* Sidebar */}
          <div className="w-64 bg-white shadow rounded-lg mr-6">
            <nav className="mt-5 px-2">
              <div className="space-y-1">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`${
                      item.current
                        ? 'bg-indigo-100 text-indigo-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    } group flex items-center px-2 py-2 text-sm font-medium rounded-md`}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
