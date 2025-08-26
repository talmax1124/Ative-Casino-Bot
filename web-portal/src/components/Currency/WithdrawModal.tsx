import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentBalance: number;
}

const WithdrawModal: React.FC<WithdrawModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  currentBalance 
}) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('paypal');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minWithdraw = 10000; // Minimum 10,000 credits
  const maxWithdraw = Math.min(currentBalance, 1000000); // Max 1M or current balance

  const handleWithdraw = async () => {
    if (!user) return;

    const withdrawAmount = parseInt(amount);
    
    if (isNaN(withdrawAmount) || withdrawAmount < minWithdraw) {
      setError(`Minimum withdrawal is ${formatAmount(minWithdraw)} credits`);
      return;
    }
    
    if (withdrawAmount > currentBalance) {
      setError('Insufficient balance');
      return;
    }

    if (paymentMethod === 'paypal' && !paypalEmail) {
      setError('PayPal email is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await axios.post(
        `${process.env.REACT_APP_API_BASE_URL}/payments/withdraw`,
        {
          userId: user.id,
          amount: withdrawAmount,
          method: paymentMethod,
          paypalEmail: paymentMethod === 'paypal' ? paypalEmail : undefined
        }
      );

      onSuccess();
    } catch (err: any) {
      console.error('Withdraw error:', err);
      setError(err.response?.data?.message || 'Failed to process withdrawal');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US').format(amount);
  };

  const getUSDAmount = (credits: number) => {
    return (credits / 1000).toFixed(2);
  };

  const quickWithdrawAmounts = [10000, 25000, 50000, 100000].filter(amt => amt <= currentBalance);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-casino-dark rounded-xl p-6 w-full max-w-md border border-casino-accent/20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center">
            💸 Withdraw Credits
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <div className="mb-4 bg-casino-darker/50 rounded-lg p-4">
          <p className="text-gray-300 text-sm">Available Balance</p>
          <p className="text-2xl font-bold text-casino-gold">
            {formatAmount(currentBalance)}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Quick Withdraw */}
        {quickWithdrawAmounts.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">Quick Withdraw</h3>
            <div className="grid grid-cols-2 gap-3">
              {quickWithdrawAmounts.map((quickAmount) => (
                <button
                  key={quickAmount}
                  onClick={() => setAmount(quickAmount.toString())}
                  className="bg-casino-red/20 hover:bg-casino-red/30 border border-casino-red/40 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                >
                  <div className="text-lg">{formatAmount(quickAmount)}</div>
                  <div className="text-xs text-gray-400">${getUSDAmount(quickAmount)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom Amount */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Withdrawal Amount</h3>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Enter amount (min ${formatAmount(minWithdraw)})`}
            className="w-full bg-casino-darker border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:border-casino-accent focus:outline-none"
            min={minWithdraw}
            max={maxWithdraw}
          />
          {amount && !isNaN(parseInt(amount)) && (
            <p className="text-sm text-gray-400 mt-2">
              ≈ ${getUSDAmount(parseInt(amount))} USD
            </p>
          )}
        </div>

        {/* Payment Method */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Payment Method</h3>
          <div className="space-y-3">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="radio"
                name="paymentMethod"
                value="paypal"
                checked={paymentMethod === 'paypal'}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="text-casino-accent"
              />
              <div className="flex items-center space-x-2">
                <span className="text-xl">💙</span>
                <span className="text-white">PayPal</span>
              </div>
            </label>
            
            {paymentMethod === 'paypal' && (
              <input
                type="email"
                value={paypalEmail}
                onChange={(e) => setPaypalEmail(e.target.value)}
                placeholder="Enter your PayPal email"
                className="w-full bg-casino-darker border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:border-casino-accent focus:outline-none ml-8"
              />
            )}
          </div>
        </div>

        {/* Withdrawal Terms */}
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-2">
            <div className="text-yellow-500 text-lg">⚠️</div>
            <div>
              <p className="text-yellow-500 font-medium text-sm">Withdrawal Terms</p>
              <ul className="text-gray-300 text-xs mt-1 space-y-1">
                <li>• Minimum withdrawal: {formatAmount(minWithdraw)} credits</li>
                <li>• Processing time: 1-3 business days</li>
                <li>• Fee: 5% of withdrawal amount</li>
                <li>• Withdrawals may be subject to verification</li>
              </ul>
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
          <button
            onClick={handleWithdraw}
            disabled={loading || !amount || parseInt(amount) < minWithdraw}
            className="flex-1 bg-casino-red hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Withdraw'}
          </button>
        </div>

        {loading && (
          <div className="absolute inset-0 bg-casino-dark/50 rounded-xl flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin text-4xl mb-2">🔄</div>
              <p className="text-white">Processing withdrawal...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WithdrawModal;