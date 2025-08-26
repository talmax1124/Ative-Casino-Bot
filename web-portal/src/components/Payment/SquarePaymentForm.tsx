import React, { useState, useEffect, useRef, useCallback } from 'react';

interface SquarePaymentFormProps {
  amount: number; // Amount in USD
  onPaymentSuccess: (paymentResult: any) => void;
  onPaymentError: (error: string) => void;
  loading?: boolean;
}

declare global {
  interface Window {
    Square?: any;
  }
}

const SquarePaymentForm: React.FC<SquarePaymentFormProps> = ({
  amount,
  onPaymentSuccess,
  onPaymentError,
  loading = false
}) => {
  const [cardPayment, setCardPayment] = useState<any>(null);
  const [isSquareLoaded, setIsSquareLoaded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initStartedRef = useRef(false);
  const mountedRef = useRef(true);

  // Memoize the error handler
  const handleError = useCallback((error: string) => {
    setInitializationError(error);
    onPaymentError(error);
  }, [onPaymentError]);

  useEffect(() => {
    mountedRef.current = true;
    let localCardInstance: any = null;

    const loadSquareSDK = async () => {
      // Check if Square SDK is already loaded
      if (window.Square) {
        console.log('✅ Square SDK already available');
        return true;
      }

      // Check if script already exists
      const existingScript = document.querySelector('script[src*="square"]');
      if (existingScript) {
        console.log('⏳ Square script found, waiting for load...');
        // Wait for it to load
        let attempts = 0;
        while (!window.Square && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        return !!window.Square;
      }

      // Load the SDK
      console.log('📥 Loading Square SDK...');
      return new Promise<boolean>((resolve) => {
        const script = document.createElement('script');
        const isProduction = process.env.NODE_ENV === 'production' && 
                           process.env.REACT_APP_SQUARE_ENVIRONMENT === 'production';
        script.src = isProduction 
          ? 'https://web.squarecdn.com/v1/square.js'
          : 'https://sandbox.web.squarecdn.com/v1/square.js';
        
        script.async = true;
        script.onload = () => {
          console.log('✅ Square SDK loaded');
          resolve(true);
        };
        script.onerror = () => {
          console.error('❌ Failed to load Square SDK');
          resolve(false);
        };
        
        document.head.appendChild(script);
      });
    };

    const initializeSquare = async () => {
      // Prevent multiple initializations
      if (initStartedRef.current) {
        console.log('⚠️ Initialization already started, skipping');
        return;
      }
      initStartedRef.current = true;

      console.log('🔄 Starting Square initialization...');

      try {
        // Load SDK
        const sdkLoaded = await loadSquareSDK();
        if (!sdkLoaded || !window.Square) {
          throw new Error('Failed to load Square SDK');
        }

        // Check credentials
        const appId = process.env.REACT_APP_SQUARE_APPLICATION_ID;
        const locationId = process.env.REACT_APP_SQUARE_LOCATION_ID;

        console.log('🔑 Credentials check:', {
          appId: appId ? `${appId.substring(0, 10)}...` : 'missing',
          locationId: locationId ? `${locationId.substring(0, 5)}...` : 'missing'
        });

        if (!appId || !locationId) {
          throw new Error('Square credentials missing. Please check your .env file.');
        }

        const environment = process.env.REACT_APP_SQUARE_ENVIRONMENT || 'sandbox';
        console.log(`🎮 Initializing Square payments with ${environment} credentials...`);
        const payments = window.Square.payments(appId, locationId);
        
        console.log('💳 Creating card element...');
        const card = await payments.card();
        localCardInstance = card;
        
        // Attach to container
        if (containerRef.current && mountedRef.current) {
          containerRef.current.innerHTML = '';
          
          console.log('🔗 Attaching card to container...');
          await card.attach(containerRef.current);
          
          console.log('✅ Square card initialized and attached successfully');
          setCardPayment(card);
          setIsSquareLoaded(true);
          setInitializationError(null);
        } else {
          console.warn('⚠️ Container not available or component unmounted');
        }
      } catch (error) {
        console.error('❌ Square initialization error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize payment form';
        if (mountedRef.current) {
          handleError(errorMessage);
        }
        initStartedRef.current = false; // Reset to allow retry
      }
    };

    // Initialize Square
    initializeSquare();

    // Cleanup
    return () => {
      mountedRef.current = false;
      initStartedRef.current = false;
      if (localCardInstance) {
        try {
          console.log('🧹 Destroying card instance...');
          localCardInstance.destroy?.();
        } catch (error) {
          console.warn('Could not destroy card:', error);
        }
      }
    };
  }, [handleError]); // Only depend on memoized handleError

  const handlePayment = async () => {
    if (!cardPayment) {
      onPaymentError('Payment form not ready');
      return;
    }

    setProcessing(true);

    try {
      console.log('💳 Tokenizing card...');
      const tokenResult = await cardPayment.tokenize();
      
      if (tokenResult.status === 'OK') {
        console.log('✅ Payment token generated:', tokenResult.token);
        
        // Process payment with backend API
        console.log('💳 Processing payment with backend API...');
        const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5001/api';
        
        const response = await fetch(`${apiBaseUrl}/payments/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sourceId: tokenResult.token,
            amount: amount * 100, // Convert to cents
            currency: 'USD'
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('💳 Payment API response:', result);
        
        if (result.success) {
          console.log('✅ Payment processed successfully');
          onPaymentSuccess(result);
        } else {
          console.error('❌ Payment failed:', result.error);
          onPaymentError(result.error || 'Payment failed');
        }
      } else {
        const errorMsg = tokenResult.errors?.[0]?.message || 'Card validation failed';
        console.error('❌ Tokenization failed:', errorMsg);
        onPaymentError(errorMsg);
      }
    } catch (error: any) {
      console.error('❌ Payment error:', error);
      onPaymentError(error.message || 'Payment processing failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Payment Amount */}
      <div className="text-center p-4 bg-casino-darker/50 rounded-lg">
        <p className="text-gray-300 text-sm">Total Amount</p>
        <p className="text-3xl font-bold text-casino-gold">
          ${amount.toFixed(2)}
        </p>
      </div>

      {/* Square Card Form */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Payment Information</h3>
        
        {/* Test Card Info for Development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <p className="text-blue-400 font-medium text-sm mb-2">🧪 Test Card Numbers:</p>
            <div className="text-gray-300 text-xs space-y-1">
              <p>• Visa: 4111 1111 1111 1111</p>
              <p>• Mastercard: 5105 1051 0510 5100</p>
              <p>• Discover: 6011 0000 0000 0004</p>
              <p>• Amex: 3411 111111 11111</p>
              <p>• Expiry: Any future date (e.g., 12/25)</p>
              <p>• CVV: Any 3 digits (4 for Amex)</p>
              <p>• ZIP: Any 5 digits</p>
            </div>
          </div>
        )}
        
        {/* Error Display */}
        {initializationError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <span className="text-red-400">⚠️</span>
              <div>
                <p className="text-red-400 font-medium">Payment System Error</p>
                <p className="text-gray-300 text-sm mt-1">{initializationError}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 text-xs text-casino-accent hover:text-purple-400 underline"
                >
                  Refresh Page
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Loading State */}
        {!isSquareLoaded && !initializationError && (
          <div className="text-center py-8">
            <div className="animate-spin text-2xl mb-2">🔄</div>
            <p className="text-gray-400">Loading secure payment form...</p>
            <p className="text-gray-500 text-xs mt-2">This may take a few seconds</p>
          </div>
        )}
        
        {/* Square Card Container */}
        <div 
          ref={containerRef}
          className={`square-payment-form ${
            isSquareLoaded ? 'bg-white rounded-lg p-4 min-h-[200px]' : ''
          }`}
          style={{ 
            display: isSquareLoaded ? 'block' : 'none'
          }}
        />
        
        {/* Success Indicator */}
        {isSquareLoaded && !initializationError && (
          <div className="flex items-center justify-center space-x-2 text-green-400 text-sm">
            <span>🔒</span>
            <span>Secure payment powered by Square</span>
          </div>
        )}
      </div>

      {/* Payment Button */}
      <button
        onClick={handlePayment}
        disabled={!isSquareLoaded || processing || loading || !!initializationError}
        className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all duration-200 ${
          !isSquareLoaded || processing || loading || initializationError
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-casino-green hover:bg-green-700 text-white transform hover:scale-105'
        }`}
      >
        {processing ? (
          <span className="flex items-center justify-center space-x-2">
            <div className="animate-spin text-xl">🔄</div>
            <span>Processing Payment...</span>
          </span>
        ) : (
          <span className="flex items-center justify-center space-x-2">
            <span>💳</span>
            <span>Pay ${amount.toFixed(2)}</span>
          </span>
        )}
      </button>

      {/* Security Notice */}
      <div className="bg-casino-accent/10 border border-casino-accent/20 rounded-lg p-3">
        <div className="flex items-center space-x-2">
          <span className="text-casino-accent text-lg">🔒</span>
          <div>
            <p className="text-casino-accent font-medium text-sm">Secure Payment</p>
            <p className="text-gray-300 text-xs">
              Your payment information is encrypted and processed securely by Square.
            </p>
          </div>
        </div>
      </div>

      {/* Accepted Cards */}
      <div className="text-center">
        <p className="text-gray-400 text-sm mb-2">We accept</p>
        <div className="flex justify-center space-x-4 text-2xl">
          <span title="Visa">💳</span>
          <span title="Mastercard">💳</span>
          <span title="American Express">💳</span>
          <span title="Discover">💳</span>
        </div>
      </div>
    </div>
  );
};

export default SquarePaymentForm;