'use client'

import { useState } from 'react'
import { Database } from '@/lib/supabase'

type Subaccount = Database['public']['Tables']['subaccounts']['Row']

interface SubaccountSelectorProps {
  subaccounts: Subaccount[]
  selectedSubaccount: Subaccount | null
  onSubaccountChange: (subaccount: Subaccount) => void
  onCreate?: (name: string) => void
}

export default function SubaccountSelector({ 
  subaccounts, 
  selectedSubaccount, 
  onSubaccountChange, 
  onCreate 
}: SubaccountSelectorProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !onCreate) return
    
    await onCreate(newName.trim())
    setNewName('')
    setIsCreating(false)
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900">Subaccounts</h3>
        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          Create New
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="mb-4 p-4 border border-gray-200 rounded-md">
          <div className="flex space-x-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Subaccount name"
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              autoFocus
            />
            <button
              type="submit"
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreating(false)
                setNewName('')
              }}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {subaccounts.length === 0 ? (
          <p className="text-gray-500 text-sm">No subaccounts yet. Create one to get started.</p>
        ) : (
          subaccounts.map((subaccount) => (
            <div
              key={subaccount.id}
              onClick={() => onSubaccountChange(subaccount)}
              className={`p-3 rounded-md cursor-pointer transition-colors ${
                selectedSubaccount?.id === subaccount.id
                  ? 'bg-indigo-50 border-2 border-indigo-200'
                  : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">{subaccount.name}</h4>
                  <p className="text-xs text-gray-500">
                    Created {new Date(subaccount.created_at).toLocaleDateString()}
                  </p>
                </div>
                {subaccount.ghl_location_id && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    GHL Connected
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
