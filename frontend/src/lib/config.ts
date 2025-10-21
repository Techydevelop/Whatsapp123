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

// Helper function to make authenticated API calls
// Note: Auth token is automatically sent via httpOnly cookie, no need to manually add Authorization header
export const apiCall = async (url: string, options: RequestInit = {}) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Include cookies in request
  });
};
