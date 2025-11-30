'use client'

import { useEffect, useState } from 'react'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import Link from 'next/link'

interface Stats {
  totalUsers: number
  activeSubscriptions: number
  trialUsers: number
  totalSubaccounts: number
  activeSessions: number
}

export default function AdminDashboard() {
  const { admin } = useAdminAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/customers', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        const customers = data.customers || []
        setStats({
          totalUsers: customers.length,
          activeSubscriptions: customers.filter((c: any) => c.subscription_status === 'active').length,
          trialUsers: customers.filter((c: any) => c.subscription_status === 'trial').length,
          totalSubaccounts: customers.reduce((sum: number, c: any) => sum + (c.current_subaccounts || 0), 0),
          activeSessions: 0, // Will be fetched separately if needed
        })
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      title: 'Total Users',
      value: stats?.totalUsers || 0,
      icon: '👥',
      color: 'bg-blue-500',
      link: '/customers',
    },
    {
      title: 'Active Subscriptions',
      value: stats?.activeSubscriptions || 0,
      icon: '✅',
      color: 'bg-green-500',
      link: '/subscriptions',
    },
    {
      title: 'Trial Users',
      value: stats?.trialUsers || 0,
      icon: '⏰',
      color: 'bg-yellow-500',
      link: '/customers?filter=trial',
    },
    {
      title: 'Total Subaccounts',
      value: stats?.totalSubaccounts || 0,
      icon: '📱',
      color: 'bg-purple-500',
      link: '/customers',
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Welcome back, {admin?.name || admin?.email}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => (
          <Link
            key={index}
            href={card.link}
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{card.title}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{card.value}</p>
              </div>
              <div className={`${card.color} p-3 rounded-lg text-white text-2xl`}>
                {card.icon}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

