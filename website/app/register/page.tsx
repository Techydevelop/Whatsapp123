'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    business_name: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Basic validation
    if (!formData.email || !formData.phone || !formData.business_name) {
      setError('All fields are required');
      setLoading(false);
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    // Phone validation (basic international format)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(formData.phone)) {
      setError('Please enter a valid phone number in international format (e.g., +1234567890)');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://whatsapp123-dhn1.onrender.com'}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        // Store email for next step
        localStorage.setItem('registrationEmail', formData.email);
        // Redirect to OTP verification
        setTimeout(() => {
          router.push('/verify-otp');
        }, 2000);
      } else {
        setError(data.message || 'Registration failed');
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
              Verification Codes Sent!
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              We've sent verification codes to your email and WhatsApp. 
              Please check both and enter the codes in the next step.
            </p>
            <div className="mt-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-600">Redirecting to verification...</p>
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
            <span className="text-2xl">📱</span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Start Your Free Trial
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Create your account and get 7 days free
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                placeholder="Enter your email address"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Phone Number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                placeholder="+1234567890"
                value={formData.phone}
                onChange={handleChange}
              />
              <p className="mt-1 text-xs text-gray-500">
                Use international format (e.g., +1234567890)
              </p>
            </div>
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
                value={formData.business_name}
                onChange={handleChange}
              />
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
              {loading ? 'Sending Verification Codes...' : 'Send Verification Codes'}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-green-600 hover:text-green-500">
                Sign in
              </Link>
            </p>
          </div>

          <div className="text-center">
            <Link 
              href="/"
              className="text-sm text-gray-600 hover:text-gray-500"
            >
              ← Back to Home
            </Link>
          </div>
        </form>

        {/* Trial Benefits */}
        <div className="mt-8 bg-green-50 p-6 rounded-lg">
          <h3 className="text-lg font-medium text-green-900 mb-4">What's Included in Your Free Trial:</h3>
          <ul className="space-y-2 text-sm text-green-800">
            <li className="flex items-center">
              <span className="text-green-500 mr-2">✓</span>
              7 days of full access
            </li>
            <li className="flex items-center">
              <span className="text-green-500 mr-2">✓</span>
              1 WhatsApp connection
            </li>
            <li className="flex items-center">
              <span className="text-green-500 mr-2">✓</span>
              1 GHL location
            </li>
            <li className="flex items-center">
              <span className="text-green-500 mr-2">✓</span>
              100 messages per day
            </li>
            <li className="flex items-center">
              <span className="text-green-500 mr-2">✓</span>
              Email support
            </li>
            <li className="flex items-center">
              <span className="text-green-500 mr-2">✓</span>
              No credit card required
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
