'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Customer {
  id: string
  email: string
  name: string
  created_at: string
  subscription_status: string
  subscription_plan: string
  trial_ends_at?: string
  subscription_ends_at?: string
  max_subaccounts: number
  current_subaccounts: number
  subaccounts: Array<{
    id: string
    location_id: string
    company_id: string
    created_at: string
  }>
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'trial' | 'expired' | 'active'>('all')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showSubaccountModal, setShowSubaccountModal] = useState(false)
  const [additionalCount, setAdditionalCount] = useState(1)

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setCustomers(data.customers || [])
      }
    } catch (error) {
      console.error('Error fetching customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddSubaccountPermission = async () => {
    if (!selectedCustomer) return

    try {
      const response = await fetch(`/api/customers/${selectedCustomer.id}/subaccounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ additional_count: additionalCount }),
      })

      if (response.ok) {
        setShowSubaccountModal(false)
        fetchCustomers()
        alert(`Added ${additionalCount} subaccount permission(s)`)
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to add permission')
      }
    } catch (error) {
      alert('Error adding permission')
    }
  }

  const handleRemoveSubaccount = async (locationId: string) => {
    if (!selectedCustomer) return
    if (!confirm('Are you sure you want to remove this subaccount?')) return

    try {
      const response = await fetch(`/api/customers/${selectedCustomer.id}/subaccounts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ location_id: locationId }),
      })

      if (response.ok) {
        fetchCustomers()
        alert('Subaccount removed successfully')
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to remove subaccount')
      }
    } catch (error) {
      alert('Error removing subaccount')
    }
  }

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.name?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesFilter = filter === 'all' || 
      (filter === 'trial' && customer.subscription_status === 'trial') ||
      (filter === 'expired' && customer.subscription_status === 'expired') ||
      (filter === 'active' && customer.subscription_status === 'active')
    
    return matchesSearch && matchesFilter
  })

  const getStatusBadge = (status: string) => {
    const badges = {
      active: 'bg-green-100 text-green-800',
      trial: 'bg-yellow-100 text-yellow-800',
      expired: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    }
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800'
  }

  const getTimeRemaining = (endsAt?: string) => {
    if (!endsAt) return '-'
    const end = new Date(endsAt)
    const now = new Date()
    const diff = end.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (days < 0) return 'Expired'
    if (days === 0) return 'Today'
    return `${days} day${days > 1 ? 's' : ''}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-600 mt-2">Manage all customers and their subscriptions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <input
          type="text"
          placeholder="Search by email or name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        >
          <option value="all">All Status</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Plan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subaccounts
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time Remaining
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{customer.name || customer.email}</div>
                      <div className="text-sm text-gray-500">{customer.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(customer.subscription_status)}`}>
                      {customer.subscription_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {customer.subscription_plan || 'free'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="flex items-center space-x-2">
                      <span>{customer.current_subaccounts || 0} / {customer.max_subaccounts || 0}</span>
                      {customer.current_subaccounts >= customer.max_subaccounts && (
                        <span className="text-red-600 text-xs">(Limit Reached)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {customer.subscription_status === 'trial' 
                      ? getTimeRemaining(customer.trial_ends_at)
                      : customer.subscription_status === 'active'
                      ? getTimeRemaining(customer.subscription_ends_at)
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => setSelectedCustomer(customer)}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Details Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Customer Details</h2>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <p className="text-gray-900">{selectedCustomer.name || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <p className="text-gray-900">{selectedCustomer.email}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(selectedCustomer.subscription_status)}`}>
                  {selectedCustomer.subscription_status}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                <p className="text-gray-900">{selectedCustomer.subscription_plan || 'free'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subaccounts</label>
                <p className="text-gray-900">{selectedCustomer.current_subaccounts || 0} / {selectedCustomer.max_subaccounts || 0}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trial Ends</label>
                <p className="text-gray-900">
                  {selectedCustomer.trial_ends_at 
                    ? new Date(selectedCustomer.trial_ends_at).toLocaleString()
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Subaccounts List */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Linked Subaccounts</h3>
                <button
                  onClick={() => setShowSubaccountModal(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700"
                >
                  + Add Permission
                </button>
              </div>
              {selectedCustomer.subaccounts.length > 0 ? (
                <div className="space-y-2">
                  {selectedCustomer.subaccounts.map((sub) => (
                    <div key={sub.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Location ID: {sub.location_id}</p>
                        <p className="text-xs text-gray-500">Created: {new Date(sub.created_at).toLocaleDateString()}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveSubaccount(sub.location_id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No subaccounts linked</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Subaccount Permission Modal */}
      {showSubaccountModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-6">Add Subaccount Permission</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Subaccounts Count
                </label>
                <input
                  type="number"
                  min="1"
                  value={additionalCount}
                  onChange={(e) => setAdditionalCount(parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Current: {selectedCustomer.max_subaccounts}, After: {selectedCustomer.max_subaccounts + additionalCount}
                </p>
              </div>
              <div className="flex space-x-4 pt-4">
                <button
                  onClick={handleAddSubaccountPermission}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition"
                >
                  Add Permission
                </button>
                <button
                  onClick={() => setShowSubaccountModal(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

