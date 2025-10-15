// Backend API configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://whatsappghl-backend.vercel.app';

// API endpoints
export const API_ENDPOINTS = {
  // GHL endpoints
  connectSubaccount: `${API_BASE_URL}/admin/ghl/connect-subaccount`,
  getSubaccounts: `${API_BASE_URL}/admin/ghl/subaccounts`,
  createSubaccount: `${API_BASE_URL}/admin/ghl/create-subaccount`,
  debugSubaccounts: `${API_BASE_URL}/admin/ghl/debug-subaccounts`,
  
  // Session endpoints
  createSession: (locationId: string) => `${API_BASE_URL}/ghl/location/${locationId}/session`,
  getSession: (locationId: string) => `${API_BASE_URL}/ghl/location/${locationId}/session`,
  
  // Provider endpoints
  providerUI: (locationId: string, companyId?: string) => {
    const params = new URLSearchParams({ locationId });
    if (companyId) params.append('companyId', companyId);
    return `${API_BASE_URL}/ghl/provider?${params.toString()}`;
  }
};

// Helper function to make authenticated API calls
export const apiCall = async (url: string, options: RequestInit = {}) => {
  const { data: { session } } = await import('./supabase').then(m => m.supabase.auth.getSession());
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
};
