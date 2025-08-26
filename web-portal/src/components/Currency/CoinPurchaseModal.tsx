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
  const [success, setSuccess] = useState(false);
  const [successAmount, setSuccessAmount] = useState<number>(0);

  // Casino Coins packages - high value economy focused
  const coinPackages = [
    { coins: 110000, price: 5.00, label: 'Starter Pack' },
    { coins: 350000, price: 25.00, label: 'Popular Choice' },
    { coins: 750000, price: 40.00, label: 'Best Value' },
    { coins: 1200000, price: 55.00, label: 'High Roller' },
    { coins: 2500000, price: 99.00, label: 'VIP Package' },
    { coins: 5000000, price: 179.00, label: 'Whale Status' }
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

      setSuccess(true);
      setSuccessAmount(selectedPackage?.coins || 0);
      
      // Auto-close after 3 seconds and call onSuccess
      setTimeout(() => {
        setSuccess(false);
        onSuccess();
      }, 3000);
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
                🪙 {formatAmount(selectedPackage.coins)} Casino Coins
              </div>
              <div className="text-sm text-gray-400">
                ${selectedPackage.price}
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
                🪙 Premium casino coins for high-stakes gaming! Massive coin packages at incredible value - focus on your winnings, not the cost.
              </p>
              
              <div className="grid grid-cols-1 gap-3">
                {coinPackages.map((pkg) => (
                  <button
                    key={pkg.coins}
                    onClick={() => handlePackageSelect(pkg)}
                    disabled={loading}
                    className="bg-casino-gold/10 hover:bg-casino-gold/20 border border-casino-gold/30 hover:border-casino-gold/50 text-white font-semibold py-4 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <div className="text-center">
                      <div className="text-3xl font-bold text-casino-gold mb-1">
                        {formatAmount(pkg.coins)} 🪙
                      </div>
                      <div className="text-lg font-semibold text-white mb-1">{pkg.label}</div>
                      <div className="text-sm text-gray-400">${pkg.price}</div>
                      <div className="text-xs text-casino-accent mt-1">
                        {(pkg.coins / pkg.price / 1000).toFixed(0)}k coins per $1
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

        {success && (
          <div className="absolute inset-0 bg-casino-dark/90 rounded-xl flex items-center justify-center">
            <div className="text-center p-6">
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-2xl font-bold text-green-400 mb-2">Transaction Completed!</h3>
              <p className="text-white text-lg mb-1">
                {formatAmount(successAmount)} Coins Added
              </p>
              <p className="text-gray-300 text-sm">
                Your coins will be available immediately
              </p>
              <div className="mt-4 text-xs text-gray-400">
                Closing in 3 seconds...
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoinPurchaseModal;