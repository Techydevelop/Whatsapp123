'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/ToastProvider'

interface HistoricalDataPoint {
  status: string
  checked_at: string
}

interface ServiceDetails {
  connected?: boolean
  status?: string
  working?: boolean
  configured?: boolean
  canCreate?: boolean
  operational?: boolean
  totalClients?: number
  connectedClients?: number
  accountCount?: number
  provider?: string
  [key: string]: unknown
}

interface ServiceStatus {
  name: string
  status: 'checking' | 'healthy' | 'unhealthy' | 'warning'
  message: string
  lastChecked?: string
  details?: ServiceDetails
  uptimePercentage?: number
  historicalData?: HistoricalDataPoint[]
}

export default function MonitoringPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [lastFullCheck, setLastFullCheck] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(30) // seconds
  const [uptimeDays, setUptimeDays] = useState(90)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  // Fetch uptime data for a service
  const fetchUptimeData = async (serviceName: string) => {
    try {
      const res = await fetch(`${API_URL}/api/health/uptime/${encodeURIComponent(serviceName)}?days=${uptimeDays}`, {
        credentials: 'include'
      })
      const data = await res.json()
      return data
    } catch (error) {
      console.error(`Failed to fetch uptime data for ${serviceName}:`, error)
      return null
    }
  }

  // Generate timeline visualization data
  const generateTimeline = (historicalData: HistoricalDataPoint[] | undefined, days: number) => {
    if (!historicalData || historicalData.length === 0) {
      // If no data, return all green (assuming healthy)
      return Array(90).fill({ status: 'healthy' })
    }

    const now = Date.now()
    const startTime = now - (days * 24 * 60 * 60 * 1000)
    const segmentDuration = (days * 24 * 60 * 60 * 1000) / 90 // Divide into 90 segments
    
    // Sort historical data by time
    const sortedData = [...historicalData].sort((a, b) => 
      new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
    )
    
    const segments: Array<{ status: string; start: number; end: number }> = []
    
    for (let i = 0; i < 90; i++) {
      const segmentStart = startTime + (i * segmentDuration)
      const segmentEnd = segmentStart + segmentDuration
      
      // Find checks in this segment
      const checksInSegment = sortedData.filter(d => {
        const checkTime = new Date(d.checked_at).getTime()
        return checkTime >= segmentStart && checkTime < segmentEnd
      })
      
      if (checksInSegment.length > 0) {
        // Use the most recent status in this segment
        const latestCheck = checksInSegment[checksInSegment.length - 1]
        segments.push({
          status: latestCheck.status,
          start: segmentStart,
          end: segmentEnd
        })
      } else {
        // Find the most recent check before this segment
        const previousChecks = sortedData.filter(d => {
          return new Date(d.checked_at).getTime() < segmentEnd
        })
        
        if (previousChecks.length > 0) {
          const closestCheck = previousChecks[previousChecks.length - 1]
          segments.push({
            status: closestCheck.status,
            start: segmentStart,
            end: segmentEnd
          })
        } else {
          // No data before this segment - default to healthy (green)
          segments.push({
            status: 'healthy',
            start: segmentStart,
            end: segmentEnd
          })
        }
      }
    }
    
    return segments
  }

  // Get status color for timeline
  const getStatusColorForTimeline = (status: string) => {
    switch (status) {
      case 'healthy':
        return '#10b981' // green
      case 'warning':
        return '#f59e0b' // yellow/orange
      case 'unhealthy':
        return '#ef4444' // red
      case 'checking':
        return '#3b82f6' // blue
      default:
        return '#9ca3af' // gray
    }
  }

  const checkAllServices = async () => {
    setIsChecking(true)
    const checks: ServiceStatus[] = []

    try {
      // 1. Database Connection
      try {
        const dbRes = await fetch(`${API_URL}/api/health/database`, {
          credentials: 'include'
        })
        const dbData = await dbRes.json()
        checks.push({
          name: 'Database Connection',
          status: dbRes.ok && dbData.connected ? 'healthy' : 'unhealthy',
          message: dbData.message || 'Database connection check',
          lastChecked: new Date().toISOString(),
          details: dbData
        })
      } catch {
        checks.push({
          name: 'Database Connection',
          status: 'unhealthy',
          message: 'Failed to check database connection',
          lastChecked: new Date().toISOString()
        })
      }

      // 2. WhatsApp Service (Baileys)
      try {
        const waRes = await fetch(`${API_URL}/api/health/whatsapp`, {
          credentials: 'include'
        })
        const waData = await waRes.json()
        checks.push({
          name: 'WhatsApp Service',
          status: waRes.ok && waData.status === 'operational' ? 'healthy' : 'warning',
          message: waData.message || 'WhatsApp service check',
          lastChecked: new Date().toISOString(),
          details: waData
        })
      } catch {
        checks.push({
          name: 'WhatsApp Service',
          status: 'unhealthy',
          message: 'Failed to check WhatsApp service',
          lastChecked: new Date().toISOString()
        })
      }

      // 3. GHL Integration
      try {
        const ghlRes = await fetch(`${API_URL}/api/health/ghl`, {
          credentials: 'include'
        })
        const ghlData = await ghlRes.json()
        checks.push({
          name: 'GHL Integration',
          status: ghlRes.ok && ghlData.connected ? 'healthy' : 'warning',
          message: ghlData.message || 'GHL integration check',
          lastChecked: new Date().toISOString(),
          details: ghlData
        })
      } catch {
        checks.push({
          name: 'GHL Integration',
          status: 'unhealthy',
          message: 'Failed to check GHL integration',
          lastChecked: new Date().toISOString()
        })
      }

      // 4. QR Code Generation
      try {
        const qrRes = await fetch(`${API_URL}/api/health/qr`, {
          credentials: 'include'
        })
        const qrData = await qrRes.json()
        checks.push({
          name: 'QR Code Generation',
          status: qrRes.ok && qrData.working ? 'healthy' : 'warning',
          message: qrData.message || 'QR code generation check',
          lastChecked: new Date().toISOString(),
          details: qrData
        })
      } catch {
        checks.push({
          name: 'QR Code Generation',
          status: 'unhealthy',
          message: 'Failed to check QR code generation',
          lastChecked: new Date().toISOString()
        })
      }

      // 5. Subaccount Creation
      try {
        const subRes = await fetch(`${API_URL}/api/health/subaccount`, {
          credentials: 'include'
        })
        const subData = await subRes.json()
        checks.push({
          name: 'Subaccount Creation',
          status: subRes.ok && subData.canCreate ? 'healthy' : 'warning',
          message: subData.message || 'Subaccount creation check',
          lastChecked: new Date().toISOString(),
          details: subData
        })
      } catch {
        checks.push({
          name: 'Subaccount Creation',
          status: 'unhealthy',
          message: 'Failed to check subaccount creation',
          lastChecked: new Date().toISOString()
        })
      }

      // 6. Email Service
      try {
        const emailRes = await fetch(`${API_URL}/api/health/email`, {
          credentials: 'include'
        })
        const emailData = await emailRes.json()
        checks.push({
          name: 'Email Service',
          status: emailRes.ok && emailData.configured ? 'healthy' : 'warning',
          message: emailData.message || 'Email service check',
          lastChecked: new Date().toISOString(),
          details: emailData
        })
      } catch {
        checks.push({
          name: 'Email Service',
          status: 'unhealthy',
          message: 'Failed to check email service',
          lastChecked: new Date().toISOString()
        })
      }

      // 7. Webhook Handler
      try {
        const webhookRes = await fetch(`${API_URL}/api/health/webhook`, {
          credentials: 'include'
        })
        const webhookData = await webhookRes.json()
        checks.push({
          name: 'Webhook Handler',
          status: webhookRes.ok && webhookData.operational ? 'healthy' : 'warning',
          message: webhookData.message || 'Webhook handler check',
          lastChecked: new Date().toISOString(),
          details: webhookData
        })
      } catch {
        checks.push({
          name: 'Webhook Handler',
          status: 'unhealthy',
          message: 'Failed to check webhook handler',
          lastChecked: new Date().toISOString()
        })
      }

      // Fetch uptime data for each service
      for (let i = 0; i < checks.length; i++) {
        const service = checks[i]
        const uptimeData = await fetchUptimeData(service.name)
        if (uptimeData) {
          checks[i] = {
            ...service,
            uptimePercentage: uptimeData.uptimePercentage || 0,
            historicalData: uptimeData.historicalData || []
          }
        }
      }

      setServices(checks)
      setLastFullCheck(new Date().toISOString())
      showToast({ type: 'success', title: 'Health Check Complete', message: 'All services have been checked' })
    } catch (error) {
      showToast({ type: 'error', title: 'Check Failed', message: 'Failed to complete health check' })
    } finally {
      setIsChecking(false)
    }
  }

  const checkIndividualService = async (serviceName: string) => {
    const serviceMap: { [key: string]: string } = {
      'Database Connection': 'database',
      'WhatsApp Service': 'whatsapp',
      'GHL Integration': 'ghl',
      'QR Code Generation': 'qr',
      'Subaccount Creation': 'subaccount',
      'Email Service': 'email',
      'Webhook Handler': 'webhook'
    }

    const endpoint = serviceMap[serviceName]
    if (!endpoint) return

    try {
      const res = await fetch(`${API_URL}/api/health/${endpoint}`, {
        credentials: 'include'
      })
      const data = await res.json()

      // Fetch uptime data for this service
      const uptimeData = await fetchUptimeData(serviceName)
      
      setServices(prev => prev.map(service => {
        if (service.name === serviceName) {
          return {
            ...service,
            status: res.ok ? (data.status === 'operational' || data.connected || data.working || data.configured || data.canCreate ? 'healthy' : 'warning') : 'unhealthy',
            message: data.message || service.message,
            lastChecked: new Date().toISOString(),
            details: data,
            uptimePercentage: uptimeData?.uptimePercentage || service.uptimePercentage,
            historicalData: uptimeData?.historicalData || service.historicalData
          }
        }
        return service
      }))

      showToast({ 
        type: res.ok ? 'success' : 'error', 
        title: `${serviceName} Check`, 
        message: data.message || 'Service check completed' 
      })
    } catch {
      setServices(prev => prev.map(service => {
        if (service.name === serviceName) {
          return {
            ...service,
            status: 'unhealthy',
            message: 'Failed to check service',
            lastChecked: new Date().toISOString()
          }
        }
        return service
      }))
      showToast({ type: 'error', title: 'Check Failed', message: `Failed to check ${serviceName}` })
    }
  }

  useEffect(() => {
    if (user) {
      checkAllServices()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh || !user) return

    const interval = setInterval(() => {
      checkAllServices()
    }, refreshInterval * 1000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshInterval, user])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'unhealthy':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'checking':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return (
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'unhealthy':
        return (
          <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      case 'checking':
        return (
          <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )
      default:
        return null
    }
  }

  const healthyCount = services.filter(s => s.status === 'healthy').length
  const totalCount = services.length
  const healthPercentage = totalCount > 0 ? Math.round((healthyCount / totalCount) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">System Monitoring</h1>
          <p className="text-sm text-gray-500 mt-1">Monitor all system services and their status</p>
        </div>
        <div className="flex items-center space-x-4">
          {/* Uptime period selector */}
          <div className="flex items-center space-x-2 bg-gray-50 rounded-lg px-3 py-2">
            <label className="text-xs text-gray-700">Period:</label>
            <select
              value={uptimeDays}
              onChange={(e) => {
                setUptimeDays(Number(e.target.value))
                // Refetch uptime data when period changes
                if (services.length > 0) {
                  services.forEach(async (service) => {
                    const uptimeData = await fetchUptimeData(service.name)
                    if (uptimeData) {
                      setServices(prev => prev.map(s => 
                        s.name === service.name 
                          ? { ...s, uptimePercentage: uptimeData.uptimePercentage, historicalData: uptimeData.historicalData }
                          : s
                      ))
                    }
                  })
                }
              }}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </div>
          {/* Auto-refresh toggle */}
          <div className="flex items-center space-x-2 bg-gray-50 rounded-lg px-3 py-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Auto-refresh</span>
            </label>
            {autoRefresh && (
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
              >
                <option value="10">10s</option>
                <option value="30">30s</option>
                <option value="60">1m</option>
                <option value="120">2m</option>
                <option value="300">5m</option>
              </select>
            )}
          </div>
          <button
            onClick={checkAllServices}
            disabled={isChecking}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isChecking ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Checking...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh All</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Overall Health Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Overall System Health</h2>
            {autoRefresh && (
              <p className="text-xs text-indigo-600 mt-1 flex items-center space-x-1">
                <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <span>Auto-refreshing every {refreshInterval}s</span>
              </p>
            )}
          </div>
          {lastFullCheck && (
            <div className="text-right">
              <span className="text-xs text-gray-500 block">
                Last checked: {new Date(lastFullCheck).toLocaleTimeString()}
              </span>
              {autoRefresh && (
                <span className="text-xs text-green-600 flex items-center space-x-1 mt-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>Live</span>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">System Status</span>
              <span className="text-sm font-semibold text-gray-900">{healthPercentage}% Healthy</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  healthPercentage >= 80 ? 'bg-green-500' : healthPercentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${healthPercentage}%` }}
              ></div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">{healthyCount}/{totalCount}</div>
            <div className="text-xs text-gray-500">Services OK</div>
          </div>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((service, index) => (
          <div
            key={index}
            className={`bg-white rounded-xl shadow-sm border-2 ${getStatusColor(service.status)} p-6`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3 flex-1">
                {getStatusIcon(service.status)}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{service.name}</h3>
                      {service.status === 'checking' && (
                        <p className="text-xs text-blue-600 animate-pulse">Checking...</p>
                      )}
                    </div>
                    {service.uptimePercentage !== undefined && (
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-900">{service.uptimePercentage.toFixed(2)}%</div>
                        <div className="text-xs text-gray-500">uptime</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => checkIndividualService(service.name)}
                disabled={service.status === 'checking'}
                className="text-xs px-2 py-1 rounded bg-white/50 hover:bg-white/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Recheck this service"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            
            {/* Uptime Timeline Visualization */}
            {service.historicalData && service.historicalData.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-600">Last {uptimeDays} days</span>
                  <span className="text-xs text-gray-600">{service.uptimePercentage?.toFixed(2)}% uptime</span>
                </div>
                <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
                  <div className="flex h-full">
                    {generateTimeline(service.historicalData, uptimeDays).map((segment, idx) => (
                      <div
                        key={idx}
                        className="h-full flex-1"
                        style={{
                          backgroundColor: getStatusColorForTimeline(segment.status),
                          minWidth: '1px'
                        }}
                        title={`${new Date(segment.start).toLocaleDateString()} - ${segment.status}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                  <span>&lt; {uptimeDays} days ago</span>
                  <span>Today</span>
                </div>
              </div>
            )}
            
            <p className="text-sm mb-2">{service.message}</p>
            {service.lastChecked && (
              <p className="text-xs opacity-75">
                Checked: {new Date(service.lastChecked).toLocaleTimeString()}
              </p>
            )}
            {service.details && Object.keys(service.details).length > 0 && (
              <details className="mt-4">
                <summary className="text-xs cursor-pointer hover:underline">View Details</summary>
                <pre className="mt-2 text-xs bg-white/50 p-2 rounded overflow-auto max-h-40">
                  {JSON.stringify(service.details, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>

      {services.length === 0 && !isChecking && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-600 mb-4">No services checked yet</p>
          <button
            onClick={checkAllServices}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Run Health Check
          </button>
        </div>
      )}
    </div>
  )
}

