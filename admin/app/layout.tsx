import type { Metadata } from 'next'
import AdminLayoutWrapper from './layout-wrapper'
import './globals.css'

export const metadata: Metadata = {
  title: 'Admin Panel - Octendr',
  description: 'Admin management panel for Octendr',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminLayoutWrapper>{children}</AdminLayoutWrapper>
}

