"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }

      localStorage.setItem('user', JSON.stringify(data.user))
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left Illustration */}
      <div className="hidden lg:flex relative bg-gradient-to-br from-emerald-500 to-emerald-600 items-center justify-center">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
        <div className="relative w-[320px] h-[560px] bg-emerald-50 rounded-[36px] shadow-2xl border-8 border-emerald-700 flex items-center justify-center">
          <div className="w-[85%] h-[85%] bg-white rounded-2xl shadow-inner flex items-center justify-center">
            <div className="w-28 h-28 bg-emerald-100 rounded-full" />
          </div>
        </div>
      </div>

      {/* Right Form */}
      <div className="flex items-center justify-center bg-gray-50 py-10 px-6">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center ring-8 ring-white shadow">
              <svg className="w-10 h-10 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12a5 5 0 100-10 5 5 0 000 10zM2 20a10 10 0 1120 0v1H2v-1z" />
              </svg>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-wide text-gray-900">WELCOME</h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-emerald-600">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 100-10 5 5 0 000 10zM2 20a10 10 0 1120 0v1H2v-1z"/></svg>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3 py-2 rounded-md border-0 ring-1 ring-gray-300 focus:ring-2 focus:ring-emerald-500 placeholder-gray-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-emerald-600">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-7h-1V7a5 5 0 10-10 0v3H6a2 2 0 00-2 2v7a2 2 0 002 2h12a2 2 0 002-2v-7a2 2 0 00-2-2zm-7 0H9V7a3 3 0 116 0v3h-2z"/></svg>
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3 py-2 rounded-md border-0 ring-1 ring-gray-300 focus:ring-2 focus:ring-emerald-500 placeholder-gray-400"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'LOGIN'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}


