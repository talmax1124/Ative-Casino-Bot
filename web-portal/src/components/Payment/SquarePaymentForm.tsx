import React, { useState, useEffect } from 'react';

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

  useEffect(() => {
    const loadSquareSDK = () => {
      const script = document.createElement('script');
      script.src = 'https://sandbox.web.squarecdn.com/v1/square.js'; // Use production URL for live
      script.async = true;
      script.onload = initializeSquare;
      script.onerror = () => onPaymentError('Failed to load payment processor');
      document.head.appendChild(script);
    };

    const initializeSquare = async () => {
      if (!window.Square) {
        onPaymentError('Square failed to load');
        return;
      }

      try {
        const payments = window.Square.payments(
          process.env.REACT_APP_SQUARE_APPLICATION_ID,
          process.env.REACT_APP_SQUARE_LOCATION_ID
        );

        const card = await payments.card();
        await card.attach('#card-container');

        setCardPayment(card);
        setIsSquareLoaded(true);
      } catch (error) {
        console.error('Failed to initialize Square:', error);
        onPaymentError('Failed to initialize payment form');
      }
    };

    if (!window.Square) {
      loadSquareSDK();
    } else {
      initializeSquare();
    }

    return () => {
      // Cleanup Square instance if needed
    };
  }, [onPaymentError]);

  const handlePayment = async () => {
    if (!cardPayment) {
      onPaymentError('Payment form not ready');
      return;
    }

    setProcessing(true);

    try {
      const tokenResult = await cardPayment.tokenize();
      
      if (tokenResult.status === 'OK') {
        // Send token to your backend for processing
        const paymentData = {
          sourceId: tokenResult.token,
          amount: amount,
          currency: 'USD'
        };

        // Call your backend API to process the payment
        const response = await fetch('/api/payments/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(paymentData)
        });

        const result = await response.json();

        if (result.success) {
          onPaymentSuccess(result);
        } else {
          onPaymentError(result.error || 'Payment failed');
        }
      } else {
        onPaymentError(tokenResult.errors?.[0]?.message || 'Card validation failed');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
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
        
        {!isSquareLoaded && (
          <div className="text-center py-8">
            <div className="animate-spin text-2xl mb-2">🔄</div>
            <p className="text-gray-400">Loading payment form...</p>
          </div>
        )}
        
        <div
          id="card-container"
          className={`min-h-[60px] ${!isSquareLoaded ? 'hidden' : ''}`}
        ></div>
      </div>

      {/* Payment Button */}
      <button
        onClick={handlePayment}
        disabled={!isSquareLoaded || processing || loading}
        className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all duration-200 ${
          !isSquareLoaded || processing || loading
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
              Your payment information is processed securely by Square and encrypted end-to-end.
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