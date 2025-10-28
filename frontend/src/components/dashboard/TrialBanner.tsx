'use client'

interface TrialBannerProps {
  subscriptionStatus: string
  trialEndsAt?: string
  currentSubaccounts: number
  maxSubaccounts: number
}

export default function TrialBanner({
  subscriptionStatus,
  trialEndsAt,
  currentSubaccounts,
  maxSubaccounts
}: TrialBannerProps) {
  // Calculate days remaining
  const calculateDaysRemaining = () => {
    if (!trialEndsAt) return null
    const endDate = new Date(trialEndsAt)
    const now = new Date()
    const diffTime = endDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 0
  }

  const daysRemaining = calculateDaysRemaining()

  // Only show banner for trial users
  if (subscriptionStatus !== 'trial' && subscriptionStatus !== 'free') {
    return null
  }

  return (
    <div className="mb-6 rounded-lg bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </svg>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              🆓 Free Trial - {daysRemaining !== null ? `${daysRemaining} days` : 'Active'}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Subaccounts: {currentSubaccounts} / {maxSubaccounts} • Upgrade to add more locations
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0 && (
            <div className="px-3 py-1 bg-yellow-100 border border-yellow-300 rounded-full text-xs font-medium text-yellow-800">
              ⚠️ {daysRemaining} days left
            </div>
          )}
          <button
            onClick={() => {
              // Handle upgrade button click
              window.open('/upgrade', '_blank')
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 transition-colors"
          >
            Upgrade Now
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {daysRemaining !== null && (
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(daysRemaining / 7) * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 text-center">
            Trial ends on {trialEndsAt ? new Date(trialEndsAt).toLocaleDateString() : 'N/A'}
          </p>
        </div>
      )}
    </div>
  )
}

