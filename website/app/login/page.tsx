'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function LoginRedirectPage() {
  const [redirecting, setRedirecting] = useState(false);

  const handleRedirect = () => {
    setRedirecting(true);
    // Redirect to dashboard login
    window.location.href = `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login`;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-green-100">
            <span className="text-2xl">🔐</span>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Customer Login
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Access your WhatsApp-GHL dashboard
          </p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Redirecting to Dashboard
            </h3>
            <p className="text-gray-600 mb-6">
              You'll be redirected to the customer dashboard where you can log in to your account.
            </p>
            
            {redirecting ? (
              <div className="space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
                <p className="text-sm text-gray-600">Redirecting...</p>
              </div>
            ) : (
              <button
                onClick={handleRedirect}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-md text-sm font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Go to Dashboard Login
              </button>
            )}
          </div>
        </div>

        <div className="text-center space-y-4">
          <div>
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link href="/register" className="font-medium text-green-600 hover:text-green-500">
                Start your free trial
              </Link>
            </p>
          </div>
          
          <div>
            <Link 
              href="/"
              className="text-sm text-gray-600 hover:text-gray-500"
            >
              ← Back to Home
            </Link>
          </div>
        </div>

        {/* Help Section */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Need Help?</h3>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• Forgot your password? Use the forgot password link on the dashboard</li>
            <li>• Can't access your account? Contact our support team</li>
            <li>• New to WhatsApp-GHL? Start with our free trial</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
