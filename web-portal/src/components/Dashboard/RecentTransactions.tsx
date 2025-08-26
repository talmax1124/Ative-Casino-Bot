import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction } from '../../types';

interface RecentTransactionsProps {
  transactions: Transaction[];
}

const RecentTransactions: React.FC<RecentTransactionsProps> = ({ transactions }) => {
  const navigate = useNavigate();

  const handleViewAllTransactions = () => {
    navigate('/transactions');
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'game_win':
        return '🏆';
      case 'game_loss':
        return '🎲';
      case 'purchase':
        return '🛒';
      case 'deposit':
        return '💳';
      case 'transfer':
        return '🔄';
      default:
        return '💰';
    }
  };

  const getTransactionColor = (type: string, amount: number) => {
    if (type === 'game_win' || type === 'deposit' || amount > 0) {
      return 'text-green-400';
    } else if (type === 'game_loss' || type === 'purchase' || amount < 0) {
      return 'text-red-400';
    }
    return 'text-gray-400';
  };

  const formatAmount = (amount: number) => {
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(amount));
    
    return amount >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4">📊</div>
        <p className="text-gray-400">No recent transactions</p>
        <p className="text-sm text-gray-500 mt-2">
          Start playing games to see your activity here!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="max-h-80 overflow-y-auto custom-scrollbar">
        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="flex items-center justify-between p-3 bg-casino-darker/50 rounded-lg border border-gray-700/50 hover:border-casino-accent/30 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <span className="text-xl">{getTransactionIcon(transaction.type)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {transaction.description}
                </p>
                <p className="text-xs text-gray-400">
                  {formatDate(transaction.timestamp)}
                </p>
                {transaction.gameType && (
                  <p className="text-xs text-casino-accent">
                    {transaction.gameType}
                  </p>
                )}
              </div>
            </div>
            <div className="flex-shrink-0">
              <span
                className={`text-sm font-bold ${getTransactionColor(
                  transaction.type,
                  transaction.amount
                )}`}
              >
                {formatAmount(transaction.amount)}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="pt-3 border-t border-gray-700">
        <button 
          onClick={handleViewAllTransactions}
          className="w-full text-center text-casino-accent hover:text-purple-400 text-sm font-medium transition-colors"
        >
          View All Transactions →
        </button>
      </div>
    </div>
  );
};

export default RecentTransactions;