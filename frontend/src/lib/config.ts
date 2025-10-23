// Backend API configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://whatsapp123-dhn1.onrender.com';

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

// Helper function to get Supabase session token
async function getSupabaseToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  
  try {
    // Import supabase dynamically to avoid SSR issues
    const { supabase } = await import('./supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch (e) {
    console.error('Failed to get Supabase session:', e);
    return null;
  }
}

// Helper function to make authenticated API calls
export const apiCall = async (url: string, options: RequestInit = {}) => {
  // Get Supabase auth token
  const authToken = await getSupabaseToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  // Add Authorization header if we have a token
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
    console.log('🔑 Sending request with auth token');
  } else {
    console.warn('⚠️ No auth token available');
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Include cookies in request
  });
};
