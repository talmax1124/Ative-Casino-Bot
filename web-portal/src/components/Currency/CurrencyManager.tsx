import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import DepositModal from './DepositModal';
import WithdrawModal from './WithdrawModal';
import TransferModal from './TransferModal';
import TransactionHistory from './TransactionHistory';
import CurrencyConverter from './CurrencyConverter';
import CoinPurchaseModal from './CoinPurchaseModal';
import CreditPurchaseModal from './CreditPurchaseModal';
import PremiumSubscriptionModal from './PremiumSubscriptionModal';
import { Transaction } from '../../types';
import axios from 'axios';

const CurrencyManager: React.FC = () => {
  const { user } = useAuth();
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showCoinPurchaseModal, setShowCoinPurchaseModal] = useState(false);
  const [showCreditPurchaseModal, setShowCreditPurchaseModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        // Fetch both transactions and user stats in parallel
        const [transactionsResponse, statsResponse] = await Promise.all([
          axios.get(`${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/transactions?limit=50`),
          axios.get(`${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/stats`)
        ]);
        
        setTransactions(transactionsResponse.data);
        setUserStats(statsResponse.data);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const formatBalance = (balance: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(balance);
  };

  const refreshData = async () => {
    if (!user) return;
    
    try {
      const [transactionsResponse, statsResponse] = await Promise.all([
        axios.get(`${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/transactions?limit=50`),
        axios.get(`${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/stats`)
      ]);
      
      setTransactions(transactionsResponse.data);
      setUserStats(statsResponse.data);
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  // Legacy function name for backward compatibility
  const refreshTransactions = refreshData;

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
            <h2 className="text-2xl font-bold text-gray-300 mb-4">Current Balances</h2>
            
            {/* Dual Currency Display */}
            {userStats ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Casino Coins */}
                <div className="bg-casino-gold/10 rounded-lg p-6 border border-casino-gold/20">
                  <div className="text-4xl mb-2">🪙</div>
                  <div className="text-4xl font-bold text-casino-gold mb-2">
                    {formatBalance(userStats.totalBalance || 0)}
                  </div>
                  <p className="text-casino-gold font-medium">Casino Coins</p>
                  <p className="text-gray-400 text-sm">For gaming & betting</p>
                </div>
                
                {/* Premium Credits */}
                <div className="bg-casino-accent/10 rounded-lg p-6 border border-casino-accent/20">
                  <div className="text-4xl mb-2">💎</div>
                  <div className="text-4xl font-bold text-casino-accent mb-2">
                    {formatBalance(userStats.creditsAmount || 0)}
                  </div>
                  <p className="text-casino-accent font-medium">Premium Credits</p>
                  <p className="text-gray-400 text-sm">For shop & premium items</p>
                </div>
              </div>
            ) : (
              <div className="text-6xl font-bold text-casino-gold mb-6">
                {formatBalance(user.balance)}
              </div>
            )}
            
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
              +{formatBalance((userStats?.totalWinnings ?? user.totalWinnings) || 0)}
            </p>
          </div>
          
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
            <div className="text-3xl mb-2">📉</div>
            <h3 className="text-lg font-bold text-white mb-1">Total Losses</h3>
            <p className="text-2xl font-bold text-red-400">
              -{formatBalance((userStats?.totalLosses ?? user.totalLosses) || 0)}
            </p>
          </div>
          
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
            <div className="text-3xl mb-2">🎯</div>
            <h3 className="text-lg font-bold text-white mb-1">Net Profit</h3>
            <p className={`text-2xl font-bold ${
              ((userStats?.totalWinnings ?? user.totalWinnings) || 0) - ((userStats?.totalLosses ?? user.totalLosses) || 0) >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {((userStats?.totalWinnings ?? user.totalWinnings) || 0) - ((userStats?.totalLosses ?? user.totalLosses) || 0) >= 0 ? '+' : ''}
              {formatBalance(((userStats?.totalWinnings ?? user.totalWinnings) || 0) - ((userStats?.totalLosses ?? user.totalLosses) || 0))}
            </p>
          </div>
        </div>

        {/* Currency Converter */}
        {userStats && (
          <div className="mb-8">
            <CurrencyConverter
              userCredits={userStats.creditsAmount || 0}
              userCoins={userStats.totalBalance || 0}
              onConversionComplete={refreshData}
            />
          </div>
        )}

        {/* Currency Purchase Section */}
        <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">💳 Purchase Currency</h3>
            <span className="text-sm text-gray-400">Secure payment processing</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Buy Casino Coins */}
            <div className="bg-casino-darker/50 rounded-lg p-6">
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">🪙</div>
                <h4 className="text-lg font-bold text-casino-gold">Casino Coins</h4>
                <p className="text-sm text-gray-400">Primary gaming currency</p>
              </div>
              
              <div className="space-y-3 mb-4">
                <div className="flex justify-between items-center p-3 bg-casino-dark/30 rounded-lg hover:bg-casino-dark/50 transition-colors cursor-pointer border border-transparent hover:border-casino-gold/30">
                  <div>
                    <span className="text-white font-medium">🪙 110,000 Coins</span>
                    <div className="text-xs text-gray-400">Starter Pack • 22k coins per $1</div>
                  </div>
                  <div className="text-casino-gold font-bold">$5.00</div>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-casino-dark/30 rounded-lg hover:bg-casino-dark/50 transition-colors cursor-pointer border border-transparent hover:border-casino-gold/30">
                  <div>
                    <span className="text-white font-medium">🪙 350,000 Coins</span>
                    <div className="text-xs text-gray-400">Popular Choice • 14k coins per $1</div>
                  </div>
                  <div className="text-casino-gold font-bold">$25.00</div>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-casino-dark/30 rounded-lg hover:bg-casino-dark/50 transition-colors cursor-pointer border border-transparent hover:border-casino-gold/30">
                  <div>
                    <span className="text-white font-medium">🪙 750,000 Coins</span>
                    <div className="text-xs text-gray-400">Best Value • 19k coins per $1</div>
                  </div>
                  <div className="text-casino-gold font-bold">$40.00</div>
                </div>
              </div>
              
              <button 
                onClick={() => setShowCoinPurchaseModal(true)}
                className="w-full bg-casino-gold hover:bg-yellow-600 text-casino-dark font-bold py-3 px-4 rounded-lg transition-colors"
              >
                Buy Casino Coins
              </button>
            </div>

            {/* Buy Premium Credits */}
            <div className="bg-casino-darker/50 rounded-lg p-6">
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">💎</div>
                <h4 className="text-lg font-bold text-casino-accent">Premium Credits</h4>
                <p className="text-sm text-gray-400">For shop purchases & VIP features</p>
              </div>
              
              <div className="space-y-3 mb-4">
                <div className="flex justify-between items-center p-3 bg-casino-dark/30 rounded-lg hover:bg-casino-dark/50 transition-colors cursor-pointer border border-transparent hover:border-casino-accent/30">
                  <div>
                    <span className="text-white font-medium">1,000 Credits</span>
                    <div className="text-xs text-gray-400">Starter pack</div>
                  </div>
                  <div className="text-casino-accent font-bold">$9.99</div>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-casino-dark/30 rounded-lg hover:bg-casino-dark/50 transition-colors cursor-pointer border border-transparent hover:border-casino-accent/30">
                  <div>
                    <span className="text-white font-medium">5,000 Credits</span>
                    <div className="text-xs text-gray-400">Great value</div>
                  </div>
                  <div className="text-casino-accent font-bold">$39.99</div>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-casino-dark/30 rounded-lg hover:bg-casino-dark/50 transition-colors cursor-pointer border border-transparent hover:border-casino-accent/30">
                  <div>
                    <span className="text-white font-medium">10,000 Credits</span>
                    <div className="text-xs text-gray-400">VIP package</div>
                  </div>
                  <div className="text-casino-accent font-bold">$69.99</div>
                </div>
              </div>
              
              <button 
                onClick={() => setShowCreditPurchaseModal(true)}
                className="w-full bg-casino-accent hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                Buy Premium Credits
              </button>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-300">
              💡 <strong>Note:</strong> All purchases are processed securely. Casino Coins are used for games, while Premium Credits unlock shop items and special features.
            </p>
          </div>
        </div>

        {/* Premium Membership Section - Only show if user has premium */}
        {userStats?.premiumMembership && (
          <div className="bg-gradient-to-r from-casino-gold/10 to-casino-accent/10 backdrop-blur-lg rounded-xl p-8 border border-casino-gold/20 text-center mb-8">
            <h2 className="text-2xl font-bold text-casino-gold mb-4">👑 Premium Member</h2>
            <p className="text-gray-300 mb-6">
              You have access to exclusive benefits and discounts!
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-casino-gold/20 rounded-lg p-4">
                <div className="text-2xl mb-2">💰</div>
                <p className="text-casino-gold font-medium">Coin Discounts</p>
                <p className="text-gray-400 text-sm">20% off all purchases</p>
              </div>
              <div className="bg-casino-accent/20 rounded-lg p-4">
                <div className="text-2xl mb-2">🛒</div>
                <p className="text-casino-accent font-medium">Premium Shop</p>
                <p className="text-gray-400 text-sm">Access high-tier items</p>
              </div>
              <div className="bg-casino-green/20 rounded-lg p-4">
                <div className="text-2xl mb-2">🎁</div>
                <p className="text-casino-green font-medium">Monthly Bonus</p>
                <p className="text-gray-400 text-sm">Free credits monthly</p>
              </div>
            </div>
            <p className="text-sm text-gray-400">
              Next billing: {userStats.premiumExpiresAt ? new Date(userStats.premiumExpiresAt).toLocaleDateString() : 'N/A'} • $7.99/month
            </p>
          </div>
        )}

        {/* Premium Membership Upgrade - Only show if user doesn't have premium */}
        {!userStats?.premiumMembership && (
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-8 border border-casino-accent/20 text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">👑 Upgrade to Premium</h2>
            <p className="text-gray-300 mb-6">
              Unlock exclusive benefits and discounts for just $7.99/month!
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-casino-gold/10 rounded-lg p-4 border border-casino-gold/20">
                <div className="text-2xl mb-2">💰</div>
                <p className="text-casino-gold font-medium">20% Coin Discount</p>
                <p className="text-gray-400 text-sm">Save on all purchases</p>
              </div>
              <div className="bg-casino-accent/10 rounded-lg p-4 border border-casino-accent/20">
                <div className="text-2xl mb-2">🛒</div>
                <p className="text-casino-accent font-medium">Premium Shop Access</p>
                <p className="text-gray-400 text-sm">High-tier exclusive items</p>
              </div>
              <div className="bg-casino-green/10 rounded-lg p-4 border border-casino-green/20">
                <div className="text-2xl mb-2">🎁</div>
                <p className="text-casino-green font-medium">Monthly Bonus</p>
                <p className="text-gray-400 text-sm">1000 free credits monthly</p>
              </div>
            </div>
            <button 
              onClick={() => setShowPremiumModal(true)}
              className="bg-gradient-to-r from-casino-gold to-casino-accent hover:from-yellow-600 hover:to-purple-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 transform hover:scale-105"
            >
              Upgrade to Premium - $7.99/month
            </button>
          </div>
        )}

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

        {/* Casino Coins Purchase Modal */}
        {showCoinPurchaseModal && (
          <CoinPurchaseModal
            isOpen={showCoinPurchaseModal}
            onClose={() => setShowCoinPurchaseModal(false)}
            onSuccess={() => {
              setShowCoinPurchaseModal(false);
              refreshData();
            }}
          />
        )}

        {/* Premium Credits Purchase Modal */}
        {showCreditPurchaseModal && (
          <CreditPurchaseModal
            isOpen={showCreditPurchaseModal}
            onClose={() => setShowCreditPurchaseModal(false)}
            onSuccess={() => {
              setShowCreditPurchaseModal(false);
              refreshData();
            }}
          />
        )}

        {/* Premium Subscription Modal */}
        {showPremiumModal && (
          <PremiumSubscriptionModal
            isOpen={showPremiumModal}
            onClose={() => setShowPremiumModal(false)}
            onSuccess={() => {
              setShowPremiumModal(false);
              refreshData();
            }}
          />
        )}
      </div>
    </div>
  );
};

export default CurrencyManager;