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
      <div className="hidden lg:flex relative overflow-hidden items-center justify-center bg-gradient-to-b from-emerald-600 via-emerald-500 to-emerald-600">
        {/* Animated SVG scene */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34d399">
                <animate attributeName="stop-color" values="#34d399; #10b981; #34d399" dur="8s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#22d3ee">
                <animate attributeName="stop-color" values="#22d3ee; #60a5fa; #22d3ee" dur="8s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
            <radialGradient id="pulse" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <filter id="blur"><feGaussianBlur in="SourceGraphic" stdDeviation="30" /></filter>
          </defs>
          {/* Morphing blob */}
          <path fill="url(#g1)" filter="url(#blur)">
            <animate attributeName="d" dur="12s" repeatCount="indefinite"
              values="M587,420Q581,500,520,560Q459,620,380,606Q301,592,244,540Q187,488,165,408Q143,328,189,259Q235,190,309,162Q383,134,454,165Q525,196,572,253Q619,310,587,420Z;
                      M596,408Q559,500,492,568Q425,636,337,611Q249,586,212,506Q175,426,177,340Q179,254,246,201Q313,148,398,150Q483,152,543,208Q603,264,613,332Q623,400,596,408Z;
                      M587,420Q581,500,520,560Q459,620,380,606Q301,592,244,540Q187,488,165,408Q143,328,189,259Q235,190,309,162Q383,134,454,165Q525,196,572,253Q619,310,587,420Z" />
          </path>
          {/* Floating circles */}
          <g fill="url(#pulse)">
            <circle cx="120" cy="120" r="60">
              <animate attributeName="cy" values="120;80;120" dur="6s" repeatCount="indefinite" />
            </circle>
            <circle cx="700" cy="180" r="50">
              <animate attributeName="cy" values="180;130;180" dur="7s" repeatCount="indefinite" />
            </circle>
            <circle cx="640" cy="640" r="70">
              <animate attributeName="cy" values="640;600;640" dur="8s" repeatCount="indefinite" />
            </circle>
          </g>
        </svg>
        {/* Foreground card device */}
        <div className="relative w-[340px] h-[600px] bg-white/20 rounded-[36px] shadow-[0_40px_120px_rgba(0,0,0,0.25)] ring-1 ring-white/40 backdrop-blur-md flex items-center justify-center">
          <div className="w-[85%] h-[85%] bg-white rounded-2xl shadow-xl flex items-center justify-center">
            <div className="w-28 h-28 bg-gradient-to-br from-emerald-400 to-cyan-400 rounded-full animate-pulse" />
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


