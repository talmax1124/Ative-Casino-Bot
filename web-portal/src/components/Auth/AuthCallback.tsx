import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const AuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const processingRef = useRef<boolean>(false);
  const processedCodeRef = useRef<string | null>(null);

  useEffect(() => {
    const handleAuth = async () => {
      try {
        const code = searchParams.get('code');
        const errorParam = searchParams.get('error');

        if (errorParam) {
          setError('Authentication was cancelled or failed');
          setLoading(false);
          return;
        }

        if (!code) {
          setError('No authorization code received');
          setLoading(false);
          return;
        }

        // Prevent duplicate processing of the same code
        if (processingRef.current || processedCodeRef.current === code) {
          console.log('Already processing this authentication code, skipping...');
          return;
        }

        console.log('🔐 Starting authentication with code:', code.substring(0, 10) + '...');
        processingRef.current = true;
        processedCodeRef.current = code;

        await login(code);
        
        console.log('✅ Authentication successful, navigating to dashboard');
        navigate('/dashboard', { replace: true });
      } catch (err) {
        console.error('❌ Authentication error:', err);
        processingRef.current = false;
        processedCodeRef.current = null;
        setError('Failed to authenticate with Discord. Please try again.');
        setLoading(false);
      }
    };

    // Only run if not already processing
    if (!processingRef.current) {
      handleAuth();
    }
  }, [searchParams, login, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-casino-gradient">
        <div className="text-center">
          <div className="animate-spin-slow text-6xl mb-4">🎰</div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Authenticating...
          </h2>
          <p className="text-gray-300">
            Please wait while we log you in
          </p>
          <div className="mt-8">
            <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-white bg-casino-accent transition ease-in-out duration-150">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Signing you in...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-casino-gradient">
        <div className="max-w-md w-full">
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-8 border border-red-500/20">
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h2 className="text-2xl font-bold text-red-400 mb-4">
                Authentication Failed
              </h2>
              <p className="text-gray-300 mb-6">
                {error}
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/login')}
                  className="w-full bg-casino-accent hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.href = '/'}
                  className="w-full bg-transparent hover:bg-casino-dark/50 text-gray-300 font-bold py-3 px-6 rounded-lg border border-gray-600 hover:border-gray-500 transition-all duration-200"
                >
                  Go Home
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default AuthCallback;