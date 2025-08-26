import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

const Profile: React.FC = () => {
  const { user } = useAuth();
  const [userStats, setUserStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserProfile = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const response = await axios.get(`${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/stats`);
      setUserStats(response.data);
    } catch (err: any) {
      console.error('Error fetching user profile:', err);
      setError('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  const formatBalance = (balance: number) => {
    return new Intl.NumberFormat('en-US').format(balance);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getWinRate = () => {
    if (!userStats?.gamesPlayed || userStats.gamesPlayed === 0) return 0;
    return ((userStats.gamesWon || 0) / userStats.gamesPlayed * 100).toFixed(1);
  };

  const getProfitLoss = () => {
    return (userStats?.totalWinnings || 0) - (userStats?.totalLosses || 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-casino-gradient p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-casino-dark rounded w-1/3 mb-8"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <div className="h-64 bg-casino-dark rounded-xl"></div>
              </div>
              <div className="lg:col-span-2">
                <div className="h-64 bg-casino-dark rounded-xl"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-casino-gradient p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-8 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Profile</h2>
            <p className="text-gray-300 mb-4">{error}</p>
            <button
              onClick={fetchUserProfile}
              className="bg-casino-accent hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Try Again
            </button>
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
            👤 My Profile
          </h1>
          <p className="text-gray-300">
            Your casino profile and statistics
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <div className="lg:col-span-1">
            <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
              <div className="mb-6">
                <img
                  src={user?.avatar || 'https://images.pexels.com/photos/1759531/pexels-photo-1759531.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500'}
                  alt={user?.username}
                  className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-casino-accent/20"
                />
                <h2 className="text-2xl font-bold text-white mb-2">{user?.username}</h2>
                <p className="text-gray-400">#{user?.discriminator}</p>
              </div>

              {/* Account Info */}
              <div className="space-y-3 text-left">
                <div className="flex justify-between">
                  <span className="text-gray-400">User ID:</span>
                  <span className="text-white font-mono text-sm">{user?.id?.slice(-8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Account Created:</span>
                  <span className="text-white text-sm">
                    {user?.joinedAt ? formatDate(user.joinedAt.toString()) : 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Premium Status:</span>
                  <span className={`text-sm font-medium ${userStats?.premiumMembership ? 'text-casino-gold' : 'text-gray-400'}`}>
                    {userStats?.premiumMembership ? '👑 Premium' : 'Standard'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="lg:col-span-2 space-y-6">
            {/* Balance Overview */}
            <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
              <h3 className="text-xl font-bold text-white mb-4">💰 Current Balances</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-casino-gold/10 rounded-lg p-4 border border-casino-gold/20">
                  <div className="text-2xl mb-1">🪙</div>
                  <div className="text-2xl font-bold text-casino-gold">
                    {formatBalance(userStats?.totalBalance || 0)}
                  </div>
                  <p className="text-casino-gold text-sm font-medium">Casino Coins</p>
                </div>
                <div className="bg-casino-accent/10 rounded-lg p-4 border border-casino-accent/20">
                  <div className="text-2xl mb-1">💎</div>
                  <div className="text-2xl font-bold text-casino-accent">
                    {formatBalance(userStats?.creditsAmount || 0)}
                  </div>
                  <p className="text-casino-accent text-sm font-medium">Premium Credits</p>
                </div>
              </div>
            </div>

            {/* Game Statistics */}
            <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
              <h3 className="text-xl font-bold text-white mb-4">🎮 Game Statistics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-casino-accent mb-1">
                    {userStats?.gamesPlayed || 0}
                  </div>
                  <p className="text-gray-400 text-sm">Games Played</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400 mb-1">
                    {userStats?.gamesWon || 0}
                  </div>
                  <p className="text-gray-400 text-sm">Games Won</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-casino-gold mb-1">
                    {getWinRate()}%
                  </div>
                  <p className="text-gray-400 text-sm">Win Rate</p>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold mb-1 ${getProfitLoss() >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {getProfitLoss() >= 0 ? '+' : ''}{formatBalance(getProfitLoss())}
                  </div>
                  <p className="text-gray-400 text-sm">Net Profit</p>
                </div>
              </div>
            </div>

            {/* Earnings Overview */}
            <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
              <h3 className="text-xl font-bold text-white mb-4">💸 Earnings Overview</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/20">
                  <div className="text-green-400 text-lg font-bold mb-2">Total Winnings</div>
                  <div className="text-2xl font-bold text-green-400">
                    +{formatBalance(userStats?.totalWinnings || 0)}
                  </div>
                </div>
                <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/20">
                  <div className="text-red-400 text-lg font-bold mb-2">Total Losses</div>
                  <div className="text-2xl font-bold text-red-400">
                    -{formatBalance(userStats?.totalLosses || 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
              <h3 className="text-xl font-bold text-white mb-4">⚡ Quick Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <a
                  href="/items"
                  className="bg-casino-accent/20 hover:bg-casino-accent/30 border border-casino-accent/40 rounded-lg p-4 text-center transition-colors group"
                >
                  <div className="text-2xl mb-2">📦</div>
                  <div className="text-white font-medium group-hover:text-casino-accent">My Items</div>
                </a>
                <a
                  href="/transactions"
                  className="bg-casino-accent/20 hover:bg-casino-accent/30 border border-casino-accent/40 rounded-lg p-4 text-center transition-colors group"
                >
                  <div className="text-2xl mb-2">💳</div>
                  <div className="text-white font-medium group-hover:text-casino-accent">Transactions</div>
                </a>
                <a
                  href="/settings"
                  className="bg-casino-accent/20 hover:bg-casino-accent/30 border border-casino-accent/40 rounded-lg p-4 text-center transition-colors group"
                >
                  <div className="text-2xl mb-2">⚙️</div>
                  <div className="text-white font-medium group-hover:text-casino-accent">Settings</div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;