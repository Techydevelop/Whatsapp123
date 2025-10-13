'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function VerifyOTPPage() {
  const [email, setEmail] = useState('');
  const [emailOTP, setEmailOTP] = useState('');
  const [whatsappOTP, setWhatsappOTP] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const router = useRouter();

  useEffect(() => {
    // Get email from localStorage
    const savedEmail = localStorage.getItem('registrationEmail');
    if (savedEmail) {
      setEmail(savedEmail);
    } else {
      // If no email found, redirect to registration
      router.push('/register');
    }
  }, [router]);

  useEffect(() => {
    // Start resend cooldown timer
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!emailOTP || !whatsappOTP || !businessName) {
      setError('All fields are required');
      setLoading(false);
      return;
    }

    if (emailOTP.length !== 6 || whatsappOTP.length !== 6) {
      setError('OTP codes must be 6 digits');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          emailOTP,
          whatsappOTP,
          business_name: businessName
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        // Clear stored email
        localStorage.removeItem('registrationEmail');
        // Redirect to dashboard login after showing success
        setTimeout(() => {
          window.location.href = `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login`;
        }, 5000);
      } else {
        setError(data.message || 'Verification failed');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          phone: '+1234567890', // This would need to be stored from registration
          business_name: businessName || 'Business'
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResendCooldown(60); // 60 second cooldown
        setError(''); // Clear any previous errors
      } else {
        setError(data.message || 'Failed to resend OTP');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
              Account Created Successfully!
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Your account has been created and your login credentials have been sent to your email.
            </p>
            <div className="mt-6 bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-green-800">
                <strong>Next Steps:</strong>
              </p>
              <ol className="mt-2 text-sm text-green-700 list-decimal list-inside space-y-1">
                <li>Check your email for login credentials</li>
                <li>Log in to your dashboard</li>
                <li>Connect your WhatsApp Business account</li>
                <li>Link your GoHighLevel account</li>
                <li>Start automating conversations!</li>
              </ol>
            </div>
            <div className="mt-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-600">Redirecting to dashboard...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-green-100">
            <span className="text-2xl">🔐</span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Verify Your Account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter the verification codes sent to your email and WhatsApp
          </p>
          {email && (
            <p className="mt-2 text-center text-sm text-gray-500">
              Verifying: {email}
            </p>
          )}
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="business_name" className="block text-sm font-medium text-gray-700">
                Business Name
              </label>
              <input
                id="business_name"
                name="business_name"
                type="text"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                placeholder="Enter your business name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="email_otp" className="block text-sm font-medium text-gray-700">
                Email Verification Code
              </label>
              <input
                id="email_otp"
                name="email_otp"
                type="text"
                maxLength={6}
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm text-center text-2xl tracking-widest"
                placeholder="000000"
                value={emailOTP}
                onChange={(e) => setEmailOTP(e.target.value.replace(/\D/g, ''))}
              />
              <p className="mt-1 text-xs text-gray-500">
                Check your email for the 6-digit code
              </p>
            </div>
            <div>
              <label htmlFor="whatsapp_otp" className="block text-sm font-medium text-gray-700">
                WhatsApp Verification Code
              </label>
              <input
                id="whatsapp_otp"
                name="whatsapp_otp"
                type="text"
                maxLength={6}
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm text-center text-2xl tracking-widest"
                placeholder="000000"
                value={whatsappOTP}
                onChange={(e) => setWhatsappOTP(e.target.value.replace(/\D/g, ''))}
              />
              <p className="mt-1 text-xs text-gray-500">
                Check your WhatsApp for the 6-digit code
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Verify & Create Account'}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResendOTP}
              disabled={resendCooldown > 0 || loading}
              className="text-sm text-green-600 hover:text-green-500 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 
                ? `Resend codes in ${resendCooldown}s` 
                : 'Didn\'t receive codes? Resend'
              }
            </button>
          </div>

          <div className="text-center">
            <Link 
              href="/register"
              className="text-sm text-gray-600 hover:text-gray-500"
            >
              ← Back to Registration
            </Link>
          </div>
        </form>

        {/* Help Section */}
        <div className="mt-8 bg-blue-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Need Help?</h3>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• Check your email spam folder</li>
            <li>• Make sure your WhatsApp is connected to the internet</li>
            <li>• Codes expire in 10 minutes</li>
            <li>• Contact support if you don't receive codes</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
