import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import SquarePaymentForm from '../Payment/SquarePaymentForm';
import axios from 'axios';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presetAmounts = [1000, 5000, 10000, 25000, 50000, 100000];

  const handleAmountSelect = (depositAmount: number) => {
    setSelectedAmount(depositAmount);
    setShowPaymentForm(true);
    setError(null);
  };

  const handlePaymentSuccess = async (paymentResult: any) => {
    try {
      setLoading(true);
      
      // Debug payment result structure
      console.log('🔵 Payment result received:', paymentResult);
      console.log('🔵 API Base URL:', process.env.REACT_APP_API_BASE_URL);
      console.log('🔵 User ID:', user?.id);
      console.log('🔵 Selected Amount:', selectedAmount);
      
      const confirmationData = {
        userId: user?.id,
        amount: selectedAmount,
        paymentId: paymentResult.payment?.id || paymentResult.transactionId || paymentResult.paymentId,
        transactionId: paymentResult.transactionId || paymentResult.payment?.id
      };
      
      console.log('🔵 Sending confirmation data:', confirmationData);
      
      // Process the deposit on your backend
      const response = await axios.post(
        `${process.env.REACT_APP_API_BASE_URL}/payments/deposit/confirm`,
        confirmationData
      );
      
      console.log('✅ Deposit confirmation response:', response.data);

      onSuccess();
    } catch (err: any) {
      console.error('Deposit confirmation error:', err);
      console.error('Error details:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        message: err.message
      });
      
      // More specific error messages
      if (err.response?.status === 404) {
        setError('Deposit confirmation service not found. Please contact support.');
      } else if (err.response?.status === 400) {
        setError(err.response?.data?.error || 'Invalid deposit request.');
      } else if (err.message.includes('Network Error') || err.code === 'ERR_NETWORK') {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(err.response?.data?.message || err.response?.data?.error || 'Failed to confirm deposit');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentError = (error: string) => {
    setError(error);
    setLoading(false);
  };

  const handleCustomDeposit = () => {
    const depositAmount = parseInt(amount);
    if (isNaN(depositAmount) || depositAmount < 100) {
      setError('Minimum deposit is 100 credits');
      return;
    }
    if (depositAmount > 1000000) {
      setError('Maximum deposit is 1,000,000 credits');
      return;
    }
    handleAmountSelect(depositAmount);
  };

  const handleBackToAmountSelection = () => {
    setShowPaymentForm(false);
    setSelectedAmount(null);
    setError(null);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US').format(amount);
  };

  const getUSDAmount = (credits: number) => {
    // Assuming 1000 credits = $1 USD
    return (credits / 1000).toFixed(2);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-casino-dark rounded-xl p-6 w-full max-w-md border border-casino-accent/20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center">
            💳 Deposit Credits
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

        {showPaymentForm && selectedAmount ? (
          <div>
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handleBackToAmountSelection}
                className="flex items-center space-x-2 text-casino-accent hover:text-purple-400 transition-colors"
              >
                <span>←</span>
                <span>Back to Amount Selection</span>
              </button>
              <div className="text-white font-semibold">
                {formatAmount(selectedAmount)} Credits (${getUSDAmount(selectedAmount)})
              </div>
            </div>
            <SquarePaymentForm
              amount={parseFloat(getUSDAmount(selectedAmount))}
              onPaymentSuccess={handlePaymentSuccess}
              onPaymentError={handlePaymentError}
              loading={loading}
            />
          </div>
        ) : (
          <div>
            {/* Preset Amounts */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Quick Deposit</h3>
          <div className="grid grid-cols-2 gap-3">
            {presetAmounts.map((presetAmount) => (
              <button
                key={presetAmount}
                onClick={() => handleAmountSelect(presetAmount)}
                disabled={loading}
                className="bg-casino-accent/20 hover:bg-casino-accent/30 border border-casino-accent/40 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-lg">{formatAmount(presetAmount)}</div>
                <div className="text-xs text-gray-400">${getUSDAmount(presetAmount)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Amount */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Custom Amount</h3>
          <div className="flex space-x-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount (min 100)"
              className="flex-1 bg-casino-darker border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:border-casino-accent focus:outline-none"
              min="100"
              max="1000000"
            />
            <button
              onClick={handleCustomDeposit}
              disabled={loading || !amount}
              className="bg-casino-green hover:bg-green-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Deposit
            </button>
          </div>
          {amount && !isNaN(parseInt(amount)) && (
            <p className="text-sm text-gray-400 mt-2">
              ≈ ${getUSDAmount(parseInt(amount))} USD
            </p>
          )}
        </div>

        {/* Payment Methods */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Payment Methods</h3>
          <div className="bg-casino-darker/50 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <div className="text-2xl">💳</div>
              <div>
                <p className="text-white font-medium">Credit/Debit Cards</p>
                <p className="text-sm text-gray-400">Visa, Mastercard, American Express</p>
              </div>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-casino-accent/10 border border-casino-accent/20 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-2">
            <div className="text-casino-accent text-lg">🔒</div>
            <div>
              <p className="text-casino-accent font-medium text-sm">Secure Payment</p>
              <p className="text-gray-300 text-xs">
                All transactions are processed securely through Square. We never store your payment information.
              </p>
            </div>
          </div>
        </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 bg-casino-dark/50 rounded-xl flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin text-4xl mb-2">🔄</div>
              <p className="text-white">Processing...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DepositModal;