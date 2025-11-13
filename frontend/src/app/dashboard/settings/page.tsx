'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

export default function SettingsPage() {
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    // Load from localStorage user object to avoid backend changes
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('user') : null
      if (raw) {
        const u = JSON.parse(raw)
        setName(u.name || '')
        setEmail(u.email || '')
      }
    } catch {}
  }, [])

  const onSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      // UI-only update: persist to localStorage so the app reflects the change
      const raw = localStorage.getItem('user')
      const u = raw ? JSON.parse(raw) : {}
      const updated = { ...u, name }
      localStorage.setItem('user', JSON.stringify(updated))
      showToast({ type: 'success', title: 'Profile updated', message: 'Your display name was updated.' })
    } catch {
      showToast({ type: 'error', title: 'Update failed', message: 'Could not update profile locally.' })
    } finally {
      setSavingProfile(false)
    }
  }

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      showToast({ type: 'warning', title: 'Weak password', message: 'Use at least 8 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      showToast({ type: 'error', title: 'Mismatch', message: 'New password and confirm do not match.' })
      return
    }
    if (!currentPassword) {
      showToast({ type: 'error', title: 'Required', message: 'Please enter your current password.' })
      return
    }

    setSavingPassword(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to change password')
      }

      showToast({ type: 'success', title: 'Password changed', message: 'Your password has been updated successfully.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      showToast({ type: 'error', title: 'Change failed', message: err instanceof Error ? err.message : 'Could not change password.' })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your profile and security.</p>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Profile</h2>
        </div>
        <form onSubmit={onSaveProfile} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500" placeholder="Your name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input value={email} disabled className="w-full rounded-md border-gray-200 bg-gray-50 text-gray-500" />
            </div>
          </div>
          <div className="flex justify-end">
            <button disabled={savingProfile} className="px-4 py-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">{savingProfile ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </div>

      {/* Password Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Password</h2>
        </div>
        <form onSubmit={onChangePassword} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500" placeholder="••••••••" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500" placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500" placeholder="Repeat new password" />
            </div>
          </div>
          <div className="flex justify-end">
            <button disabled={savingPassword} className="px-4 py-2 rounded-md text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">{savingPassword ? 'Updating...' : 'Change Password'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}


