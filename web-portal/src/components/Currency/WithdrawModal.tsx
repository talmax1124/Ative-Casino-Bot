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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minWithdraw = 1000; // Minimum 1,000 credits
  const maxWithdraw = currentBalance; // Max is current balance

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

    try {
      setLoading(true);
      setError(null);

      await axios.post(
        `${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/withdraw`,
        {
          userId: user.id,
          amount: withdrawAmount,
          type: 'casino_credits'
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

        {/* Withdrawal Method */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Withdrawal Method</h3>
          <div className="bg-casino-darker/50 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">💰</span>
              <div>
                <p className="text-white font-medium">Casino Credits</p>
                <p className="text-gray-400 text-sm">Withdraw to your available balance for transfers</p>
              </div>
            </div>
          </div>
        </div>

        {/* Withdrawal Information */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-2">
            <div className="text-blue-400 text-lg">ℹ️</div>
            <div>
              <p className="text-blue-400 font-medium text-sm">Withdrawal Information</p>
              <ul className="text-gray-300 text-xs mt-1 space-y-1">
                <li>• Minimum withdrawal: {formatAmount(minWithdraw)} credits</li>
                <li>• Instant processing for casino credits</li>
                <li>• No fees for internal withdrawals</li>
                <li>• Credits can be transferred to bot or other users</li>
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