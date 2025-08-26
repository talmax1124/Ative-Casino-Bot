import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import SquarePaymentForm from '../Payment/SquarePaymentForm';
import axios from 'axios';

interface PremiumSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PremiumSubscriptionModal: React.FC<PremiumSubscriptionModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const subscriptionPrice = 7.99;

  const handleSubscriptionStart = () => {
    setShowPaymentForm(true);
    setError(null);
  };

  const handlePaymentSuccess = async (paymentResult: any) => {
    try {
      setLoading(true);
      
      // Process the premium subscription on backend
      await axios.post(
        `${process.env.REACT_APP_API_BASE_URL}/payments/premium/subscribe`,
        {
          userId: user?.id,
          subscriptionPrice: subscriptionPrice,
          paymentId: paymentResult.payment?.id,
          transactionId: paymentResult.transactionId
        }
      );

      onSuccess();
    } catch (err: any) {
      console.error('Premium subscription error:', err);
      setError(err.response?.data?.message || 'Failed to complete premium subscription');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentError = (error: string) => {
    setError(error);
    setLoading(false);
  };

  const handleBackToSubscriptionDetails = () => {
    setShowPaymentForm(false);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-casino-dark rounded-xl p-6 w-full max-w-lg border border-casino-accent/20 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center">
            👑 Premium Membership
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {showPaymentForm ? (
          <div>
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handleBackToSubscriptionDetails}
                className="flex items-center space-x-2 text-casino-gold hover:text-yellow-400 transition-colors"
              >
                <span>←</span>
                <span>Back to Details</span>
              </button>
              <div className="text-white font-semibold">
                Premium Membership (${subscriptionPrice}/month)
              </div>
            </div>
            <SquarePaymentForm
              amount={subscriptionPrice}
              onPaymentSuccess={handlePaymentSuccess}
              onPaymentError={handlePaymentError}
              loading={loading}
            />
          </div>
        ) : (
          <div>
            {/* Subscription Details */}
            <div className="mb-6">
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">👑</div>
                <h3 className="text-2xl font-bold text-casino-gold mb-2">Premium Membership</h3>
                <p className="text-gray-300 mb-4">
                  Unlock exclusive features and benefits for just $7.99/month!
                </p>
              </div>
              
              {/* Benefits */}
              <div className="space-y-4 mb-6">
                <div className="bg-casino-gold/10 border border-casino-gold/20 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">💰</div>
                    <div>
                      <h4 className="text-casino-gold font-bold">20% Coin Discount</h4>
                      <p className="text-gray-300 text-sm">Save 20% on all Casino Coin purchases</p>
                    </div>
                  </div>
                </div>

                <div className="bg-casino-accent/10 border border-casino-accent/20 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">🛒</div>
                    <div>
                      <h4 className="text-casino-accent font-bold">Premium Shop Access</h4>
                      <p className="text-gray-300 text-sm">Access exclusive high-tier items and cosmetics</p>
                    </div>
                  </div>
                </div>

                <div className="bg-casino-green/10 border border-casino-green/20 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">🎁</div>
                    <div>
                      <h4 className="text-casino-green font-bold">Monthly Bonus</h4>
                      <p className="text-gray-300 text-sm">Receive 1,000 free Premium Credits every month</p>
                    </div>
                  </div>
                </div>

                <div className="bg-casino-accent/10 border border-casino-accent/20 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">⚡</div>
                    <div>
                      <h4 className="text-casino-accent font-bold">VIP Game Access</h4>
                      <p className="text-gray-300 text-sm">Access to exclusive VIP game modes and higher betting limits</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="bg-casino-darker/50 border border-casino-gold/30 rounded-lg p-6 text-center mb-6">
                <div className="text-4xl font-bold text-casino-gold mb-2">
                  ${subscriptionPrice}<span className="text-lg text-gray-400">/month</span>
                </div>
                <p className="text-gray-400 text-sm">Cancel anytime • No commitment</p>
              </div>

              {/* Start Subscription Button */}
              <button
                onClick={handleSubscriptionStart}
                disabled={loading}
                className="w-full bg-gradient-to-r from-casino-gold to-casino-accent hover:from-yellow-600 hover:to-purple-600 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Premium Membership
              </button>
            </div>

            {/* Security Notice */}
            <div className="bg-casino-accent/10 border border-casino-accent/20 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-2">
                <div className="text-casino-accent text-lg">🔒</div>
                <div>
                  <p className="text-casino-accent font-medium text-sm">Secure Subscription</p>
                  <p className="text-gray-300 text-xs">
                    All payments are processed securely through Square. Premium benefits activate immediately after purchase.
                  </p>
                </div>
              </div>
            </div>

            {/* Cancel Button */}
            <button
              onClick={onClose}
              disabled={loading}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 bg-casino-dark/50 rounded-xl flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin text-4xl mb-2">🔄</div>
              <p className="text-white">Processing subscription...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PremiumSubscriptionModal;