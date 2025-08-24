import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import DepositModal from './DepositModal';
import WithdrawModal from './WithdrawModal';
import TransferModal from './TransferModal';
import TransactionHistory from './TransactionHistory';
import { Transaction } from '../../types';
import axios from 'axios';

const CurrencyManager: React.FC = () => {
  const { user } = useAuth();
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!user) return;

      try {
        const response = await axios.get(
          `${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/transactions?limit=50`
        );
        setTransactions(response.data);
      } catch (error) {
        console.error('Error fetching transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [user]);

  const formatBalance = (balance: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(balance);
  };

  const refreshTransactions = async () => {
    if (!user) return;
    
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/transactions?limit=50`
      );
      setTransactions(response.data);
    } catch (error) {
      console.error('Error refreshing transactions:', error);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-casino-gradient p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center">
            <div className="text-4xl mb-4">🔒</div>
            <p className="text-gray-400">Please login to manage your currency</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-casino-gradient p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            💰 Currency Manager
          </h1>
          <p className="text-gray-300">
            Manage your casino credits and transactions
          </p>
        </div>

        {/* Balance Overview */}
        <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-8 border border-casino-accent/20 mb-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-300 mb-4">Current Balance</h2>
            <div className="text-6xl font-bold text-casino-gold mb-6">
              {formatBalance(user.balance)}
            </div>
            <p className="text-gray-400 mb-8">Casino Credits</p>
            
            {/* Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setShowDepositModal(true)}
                className="bg-casino-green hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 flex items-center justify-center space-x-2"
              >
                <span className="text-xl">💳</span>
                <span>Deposit</span>
              </button>
              
              <button
                onClick={() => setShowWithdrawModal(true)}
                className="bg-casino-red hover:bg-red-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 flex items-center justify-center space-x-2"
              >
                <span className="text-xl">💸</span>
                <span>Withdraw</span>
              </button>
              
              <button
                onClick={() => setShowTransferModal(true)}
                className="bg-casino-accent hover:bg-purple-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 flex items-center justify-center space-x-2"
              >
                <span className="text-xl">🔄</span>
                <span>Transfer</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
            <div className="text-3xl mb-2">📈</div>
            <h3 className="text-lg font-bold text-white mb-1">Total Winnings</h3>
            <p className="text-2xl font-bold text-green-400">
              +{formatBalance(user.totalWinnings)}
            </p>
          </div>
          
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
            <div className="text-3xl mb-2">📉</div>
            <h3 className="text-lg font-bold text-white mb-1">Total Losses</h3>
            <p className="text-2xl font-bold text-red-400">
              -{formatBalance(user.totalLosses)}
            </p>
          </div>
          
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
            <div className="text-3xl mb-2">🎯</div>
            <h3 className="text-lg font-bold text-white mb-1">Net Profit</h3>
            <p className={`text-2xl font-bold ${
              user.totalWinnings - user.totalLosses >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {user.totalWinnings - user.totalLosses >= 0 ? '+' : ''}
              {formatBalance(user.totalWinnings - user.totalLosses)}
            </p>
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
          <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
            📋 Transaction History
          </h3>
          <TransactionHistory 
            transactions={transactions} 
            loading={loading}
            onRefresh={refreshTransactions}
          />
        </div>

        {/* Modals */}
        {showDepositModal && (
          <DepositModal
            isOpen={showDepositModal}
            onClose={() => setShowDepositModal(false)}
            onSuccess={() => {
              setShowDepositModal(false);
              refreshTransactions();
            }}
          />
        )}

        {showWithdrawModal && (
          <WithdrawModal
            isOpen={showWithdrawModal}
            onClose={() => setShowWithdrawModal(false)}
            onSuccess={() => {
              setShowWithdrawModal(false);
              refreshTransactions();
            }}
            currentBalance={user.balance}
          />
        )}

        {showTransferModal && (
          <TransferModal
            isOpen={showTransferModal}
            onClose={() => setShowTransferModal(false)}
            onSuccess={() => {
              setShowTransferModal(false);
              refreshTransactions();
            }}
            currentBalance={user.balance}
          />
        )}
      </div>
    </div>
  );
};

export default CurrencyManager;