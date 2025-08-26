import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import SquarePaymentForm from '../Payment/SquarePaymentForm';
import axios from 'axios';

interface CoinPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CoinPurchaseModal: React.FC<CoinPurchaseModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [selectedPackage, setSelectedPackage] = useState<{coins: number, price: number} | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Casino Coins packages - different pricing than credits
  const coinPackages = [
    { coins: 10000, price: 4.99, label: 'Starter Pack' },
    { coins: 50000, price: 19.99, label: 'Popular Choice' },
    { coins: 100000, price: 34.99, label: 'Best Value' },
    { coins: 250000, price: 79.99, label: 'High Roller' }
  ];

  const handlePackageSelect = (pkg: {coins: number, price: number}) => {
    setSelectedPackage(pkg);
    setShowPaymentForm(true);
    setError(null);
  };

  const handlePaymentSuccess = async (paymentResult: any) => {
    try {
      setLoading(true);
      
      // Process the coin purchase on backend
      await axios.post(
        `${process.env.REACT_APP_API_BASE_URL}/payments/coins/purchase`,
        {
          userId: user?.id,
          coins: selectedPackage?.coins,
          amountPaid: selectedPackage?.price,
          paymentId: paymentResult.payment?.id,
          transactionId: paymentResult.transactionId
        }
      );

      onSuccess();
    } catch (err: any) {
      console.error('Coin purchase error:', err);
      setError(err.response?.data?.message || 'Failed to complete coin purchase');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentError = (error: string) => {
    setError(error);
    setLoading(false);
  };

  const handleBackToPackageSelection = () => {
    setShowPaymentForm(false);
    setSelectedPackage(null);
    setError(null);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US').format(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-casino-dark rounded-xl p-6 w-full max-w-lg border border-casino-accent/20 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center">
            🪙 Buy Casino Coins
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

        {showPaymentForm && selectedPackage ? (
          <div>
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handleBackToPackageSelection}
                className="flex items-center space-x-2 text-casino-gold hover:text-yellow-400 transition-colors"
              >
                <span>←</span>
                <span>Back to Packages</span>
              </button>
              <div className="text-white font-semibold">
                {formatAmount(selectedPackage.coins)} Coins (${selectedPackage.price})
              </div>
            </div>
            <SquarePaymentForm
              amount={selectedPackage.price}
              onPaymentSuccess={handlePaymentSuccess}
              onPaymentError={handlePaymentError}
              loading={loading}
            />
          </div>
        ) : (
          <div>
            {/* Package Selection */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Choose Your Casino Coins Package</h3>
              <p className="text-gray-300 text-sm mb-4">
                Casino Coins are used for playing games and betting. Get more coins for better value!
              </p>
              
              <div className="grid grid-cols-1 gap-3">
                {coinPackages.map((pkg) => (
                  <button
                    key={pkg.coins}
                    onClick={() => handlePackageSelect(pkg)}
                    disabled={loading}
                    className="bg-casino-gold/10 hover:bg-casino-gold/20 border border-casino-gold/30 hover:border-casino-gold/50 text-white font-semibold py-4 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <div className="text-xl font-bold text-casino-gold">
                          {formatAmount(pkg.coins)} Coins
                        </div>
                        <div className="text-sm text-gray-400">{pkg.label}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-casino-gold">${pkg.price}</div>
                        <div className="text-xs text-gray-400">
                          {(pkg.coins / pkg.price / 1000).toFixed(1)}k coins per $1
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Security Notice */}
            <div className="bg-casino-gold/10 border border-casino-gold/20 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-2">
                <div className="text-casino-gold text-lg">🔒</div>
                <div>
                  <p className="text-casino-gold font-medium text-sm">Secure Payment</p>
                  <p className="text-gray-300 text-xs">
                    All transactions are processed securely through Square. Casino Coins will be added to your account immediately.
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
              <p className="text-white">Processing purchase...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoinPurchaseModal;