'use client'

import { useEffect, useState } from 'react'

interface BillingStats {
  totalRevenue: number
  monthlyRevenue: Array<{ month: string; revenue: number; count: number }>
  planRevenue: {
    starter: number
    professional: number
  }
  recentPayments: Array<{
    id: string
    user_id: string
    amount: number
    currency: string
    status: string
    plan: string
    created_at: string
  }>
  totalPayments: number
  successfulPayments: number
}

export default function BillingsPage() {
  const [stats, setStats] = useState<BillingStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/billings/stats', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error fetching billing stats:', error)
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

  const maxRevenue = Math.max(...stats.monthlyRevenue.map(r => r.revenue), 1)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Billings & Revenue</h1>
        <p className="text-gray-600 mt-2">Monthly statements and revenue analytics</p>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-sm font-medium text-gray-600">Total Revenue</p>
          <p className="text-3xl font-bold text-green-600 mt-2">
            ${stats.totalRevenue.toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-sm font-medium text-gray-600">Total Payments</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalPayments}</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-sm font-medium text-gray-600">Success Rate</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {stats.totalPayments > 0 
              ? ((stats.successfulPayments / stats.totalPayments) * 100).toFixed(1)
              : 0}%
          </p>
        </div>
      </div>

      {/* Plan Revenue */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">Revenue by Plan</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-600">Starter Plan</p>
            <p className="text-2xl font-bold text-blue-900 mt-2">
              ${stats.planRevenue.starter.toFixed(2)}
            </p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <p className="text-sm text-gray-600">Professional Plan</p>
            <p className="text-2xl font-bold text-purple-900 mt-2">
              ${stats.planRevenue.professional.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Monthly Revenue Graph */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">Monthly Revenue (Last 12 Months)</h2>
        <div className="h-64 flex items-end justify-between space-x-2">
          {stats.monthlyRevenue.map((item, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div className="w-full flex flex-col items-center">
                <div
                  className="w-full bg-green-600 rounded-t transition-all hover:bg-green-700"
                  style={{ height: `${(item.revenue / maxRevenue) * 240}px` }}
                  title={`${item.month}: $${item.revenue.toFixed(2)}`}
                ></div>
              </div>
              <p className="text-xs text-gray-600 mt-2 transform -rotate-45 origin-top-left whitespace-nowrap">
                {item.month}
              </p>
              <p className="text-xs font-semibold text-gray-900 mt-1">
                ${item.revenue.toFixed(0)}
              </p>
              <p className="text-xs text-gray-500">({item.count})</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Payments */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold mb-4">Recent Payments</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.recentPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(payment.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {payment.plan}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${(payment.amount / 100).toFixed(2)} {payment.currency.toUpperCase()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      payment.status === 'succeeded' ? 'bg-green-100 text-green-800' :
                      payment.status === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {payment.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

