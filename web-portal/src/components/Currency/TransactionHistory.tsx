import React, { useState } from 'react';
import { Transaction } from '../../types';

interface TransactionHistoryProps {
  transactions: Transaction[];
  loading: boolean;
  onRefresh: () => void;
}

const TransactionHistory: React.FC<TransactionHistoryProps> = ({ 
  transactions, 
  loading, 
  onRefresh 
}) => {
  const [filter, setFilter] = useState<'all' | 'deposits' | 'withdrawals' | 'transfers' | 'games'>('all');

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return '💳';
      case 'game_win':
        return '🏆';
      case 'game_loss':
        return '🎲';
      case 'purchase':
        return '🛒';
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
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const filteredTransactions = transactions.filter(transaction => {
    switch (filter) {
      case 'deposits':
        return transaction.type === 'deposit';
      case 'withdrawals':
        return transaction.type === 'withdraw';
      case 'transfers':
        return transaction.type === 'transfer';
      case 'games':
        return transaction.type === 'game_win' || transaction.type === 'game_loss';
      default:
        return true;
    }
  });

  const filterButtons = [
    { key: 'all', label: 'All', icon: '📋' },
    { key: 'deposits', label: 'Deposits', icon: '💳' },
    { key: 'withdrawals', label: 'Withdrawals', icon: '💸' },
    { key: 'transfers', label: 'Transfers', icon: '🔄' },
    { key: 'games', label: 'Games', icon: '🎮' },
  ];

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse bg-casino-darker/50 rounded-lg p-4 h-16"></div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        {filterButtons.map((filterButton) => (
          <button
            key={filterButton.key}
            onClick={() => setFilter(filterButton.key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
              filter === filterButton.key
                ? 'bg-casino-accent text-white'
                : 'bg-casino-darker/50 text-gray-300 hover:bg-casino-dark hover:text-white border border-gray-600'
            }`}
          >
            <span>{filterButton.icon}</span>
            <span>{filterButton.label}</span>
          </button>
        ))}
        
        <button
          onClick={onRefresh}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-medium bg-casino-green hover:bg-green-700 text-white transition-colors flex items-center space-x-2"
        >
          <span>🔄</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Transactions List */}
      {filteredTransactions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-xl font-bold text-gray-400 mb-2">No transactions found</h3>
          <p className="text-gray-500">
            {filter === 'all' 
              ? "You haven't made any transactions yet" 
              : `No ${filter} transactions found`}
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
          {filteredTransactions.map((transaction) => (
            <div
              key={transaction.id}
              className="flex items-center justify-between p-4 bg-casino-darker/50 rounded-lg border border-gray-700/50 hover:border-casino-accent/30 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  <span className="text-2xl">{getTransactionIcon(transaction.type)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium text-sm">
                    {transaction.description}
                  </p>
                  <p className="text-gray-400 text-xs">
                    {formatDate(transaction.timestamp)}
                  </p>
                  {transaction.gameType && (
                    <p className="text-casino-accent text-xs capitalize">
                      {transaction.gameType}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="text-right flex-shrink-0">
                <span
                  className={`text-lg font-bold ${getTransactionColor(
                    transaction.type,
                    transaction.amount
                  )}`}
                >
                  {formatAmount(transaction.amount)}
                </span>
                <p className="text-gray-500 text-xs">credits</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transaction Summary */}
      {filteredTransactions.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-4 pt-6 border-t border-gray-700">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">
              +{formatAmount(
                filteredTransactions
                  .filter(t => t.amount > 0)
                  .reduce((sum, t) => sum + t.amount, 0)
              )}
            </p>
            <p className="text-gray-400 text-sm">Total In</p>
          </div>
          
          <div className="text-center">
            <p className="text-2xl font-bold text-red-400">
              -{formatAmount(
                Math.abs(filteredTransactions
                  .filter(t => t.amount < 0)
                  .reduce((sum, t) => sum + t.amount, 0))
              )}
            </p>
            <p className="text-gray-400 text-sm">Total Out</p>
          </div>
          
          <div className="text-center">
            <p className={`text-2xl font-bold ${
              filteredTransactions.reduce((sum, t) => sum + t.amount, 0) >= 0
                ? 'text-green-400' 
                : 'text-red-400'
            }`}>
              {formatAmount(
                filteredTransactions.reduce((sum, t) => sum + t.amount, 0)
              )}
            </p>
            <p className="text-gray-400 text-sm">Net Change</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;