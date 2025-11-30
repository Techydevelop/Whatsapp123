'use client'

import { useEffect, useState } from 'react'

interface SubscriptionStats {
  totalUsers: number
  activeSubscriptions: number
  trialUsers: number
  expiredUsers: number
  planDistribution: {
    free: number
    starter: number
    professional: number
  }
  monthlySignups: Array<{ month: string; count: number }>
  monthlyConversions: Array<{ month: string; count: number }>
}

export default function SubscriptionsPage() {
  const [stats, setStats] = useState<SubscriptionStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/subscriptions/stats', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    )
  }

  if (!stats) return null

  const maxSignups = Math.max(...stats.monthlySignups.map(s => s.count), 1)
  const maxConversions = Math.max(...stats.monthlyConversions.map(c => c.count), 1)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Subscriptions & Sales</h1>
        <p className="text-gray-600 mt-2">Analytics and user growth metrics</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-sm font-medium text-gray-600">Total Users</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalUsers}</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-sm font-medium text-gray-600">Active Subscriptions</p>
          <p className="text-3xl font-bold text-green-600 mt-2">{stats.activeSubscriptions}</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-sm font-medium text-gray-600">Trial Users</p>
          <p className="text-3xl font-bold text-yellow-600 mt-2">{stats.trialUsers}</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-sm font-medium text-gray-600">Expired</p>
          <p className="text-3xl font-bold text-red-600 mt-2">{stats.expiredUsers}</p>
        </div>
      </div>

      {/* Plan Distribution */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">Plan Distribution</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Free</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">{stats.planDistribution.free}</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-600">Starter</p>
            <p className="text-2xl font-bold text-blue-900 mt-2">{stats.planDistribution.starter}</p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <p className="text-sm text-gray-600">Professional</p>
            <p className="text-2xl font-bold text-purple-900 mt-2">{stats.planDistribution.professional}</p>
          </div>
        </div>
      </div>

      {/* Monthly Signups Graph */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">Monthly Signups (Last 12 Months)</h2>
        <div className="h-64 flex items-end justify-between space-x-2">
          {stats.monthlySignups.map((item, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div className="w-full flex flex-col items-center">
                <div
                  className="w-full bg-indigo-600 rounded-t transition-all hover:bg-indigo-700"
                  style={{ height: `${(item.count / maxSignups) * 240}px` }}
                  title={`${item.month}: ${item.count}`}
                ></div>
              </div>
              <p className="text-xs text-gray-600 mt-2 transform -rotate-45 origin-top-left whitespace-nowrap">
                {item.month}
              </p>
              <p className="text-xs font-semibold text-gray-900 mt-1">{item.count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Conversions Graph */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold mb-4">Monthly Conversions (Last 12 Months)</h2>
        <div className="h-64 flex items-end justify-between space-x-2">
          {stats.monthlyConversions.map((item, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div className="w-full flex flex-col items-center">
                <div
                  className="w-full bg-green-600 rounded-t transition-all hover:bg-green-700"
                  style={{ height: `${(item.count / maxConversions) * 240}px` }}
                  title={`${item.month}: ${item.count}`}
                ></div>
              </div>
              <p className="text-xs text-gray-600 mt-2 transform -rotate-45 origin-top-left whitespace-nowrap">
                {item.month}
              </p>
              <p className="text-xs font-semibold text-gray-900 mt-1">{item.count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

