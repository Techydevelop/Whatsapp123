'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  type: ToastType
  title?: string
  message: string
  durationMs?: number
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    const durationMs = toast.durationMs ?? 4000
    setToasts(prev => [...prev, { ...toast, id }])
    window.setTimeout(() => remove(id), durationMs)
  }, [remove])

  const value = useMemo(() => ({ showToast }), [showToast])

  const styleByType: Record<ToastType, string> = {
    success: 'bg-green-50 border-green-500 text-green-800',
    error: 'bg-red-50 border-red-500 text-red-800',
    info: 'bg-blue-50 border-blue-500 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-500 text-yellow-800',
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[100] space-y-2 w-[22rem] max-w-[90vw]">
        {toasts.map(t => (
          <div key={t.id} className={`border-l-4 rounded-lg shadow p-3 animate-in slide-in-from-top-4 ${styleByType[t.type]}`}>
            {t.title && <p className="text-sm font-semibold">{t.title}</p>}
            <p className="text-sm">{t.message}</p>
            <button onClick={() => remove(t.id)} className="absolute top-2 right-2 text-sm opacity-60 hover:opacity-100">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}


