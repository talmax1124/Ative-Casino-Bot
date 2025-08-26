import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { DashboardStats, GameStats } from '../../types';
import StatsCard from './StatsCard';
import RecentTransactions from './RecentTransactions';
import GameStatsChart from './GameStatsChart';
import axios from 'axios';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [gameStats, setGameStats] = useState<GameStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      console.log('🔄 Dashboard fetchDashboardData called');
      console.log('User object:', user);
      
      if (!user) {
        console.log('❌ No user found, skipping data fetch');
        return;
      }

      if (!user.id) {
        console.error('❌ User object missing ID:', user);
        setError('User ID not found');
        setLoading(false);
        return;
      }

      try {
        console.log(`🔄 Fetching dashboard data for user ID: ${user.id}`);
        setLoading(true);
        setError(null);
        
        const statsUrl = `${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/stats`;
        const gameStatsUrl = `${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/game-stats`;
        
        console.log('📊 Fetching from URLs:', { statsUrl, gameStatsUrl });
        
        // Fetch dashboard stats
        const [statsResponse, gameStatsResponse] = await Promise.all([
          axios.get(statsUrl),
          axios.get(gameStatsUrl)
        ]);

        console.log('✅ Stats response:', statsResponse.data);
        console.log('✅ Game stats response:', gameStatsResponse.data);

        setStats(statsResponse.data);
        setGameStats(gameStatsResponse.data);
      } catch (err) {
        console.error('❌ Error fetching dashboard data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-casino-gradient p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-casino-dark rounded w-1/4 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-casino-dark rounded-lg"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="h-96 bg-casino-dark rounded-lg"></div>
              <div className="h-96 bg-casino-dark rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-casino-gradient p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Dashboard</h2>
            <p className="text-gray-300">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 bg-casino-accent hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors"
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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome back, {user?.username}! 🎰
          </h1>
          <p className="text-gray-300">
            Here's your casino performance overview
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Total Balance"
            value={`💰 ${formatCurrency(stats?.totalBalance || 0)}`}
            icon="💳"
            bgColor="bg-casino-green"
            change={stats ? `+${formatCurrency(stats.totalWinnings - stats.totalLosses)}` : '+0'}
            changeType="positive"
          />
          
          <StatsCard
            title="Total Winnings"
            value={`🏆 ${formatCurrency(stats?.totalWinnings || 0)}`}
            icon="📈"
            bgColor="bg-casino-gold"
            change={`${stats?.gamesPlayed || 0} games played`}
            changeType="neutral"
          />
          
          <StatsCard
            title="Win Rate"
            value={`📊 ${formatPercentage(stats?.winRate || 0)}`}
            icon="🎯"
            bgColor="bg-casino-accent"
            change={`Rank #${stats?.currentRank || 'N/A'}`}
            changeType="neutral"
          />
          
          <StatsCard
            title="Favorite Game"
            value={stats?.favoriteGame || 'None yet'}
            icon="🎮"
            bgColor="bg-casino-red"
            change="Most played"
            changeType="neutral"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Game Stats Chart */}
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              🎲 Game Performance
            </h3>
            <GameStatsChart gameStats={gameStats} />
          </div>

          {/* Recent Transactions */}
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center">
              💳 Recent Activity
            </h3>
            <RecentTransactions transactions={stats?.recentTransactions || []} />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
          <h3 className="text-xl font-bold text-white mb-6">⚡ Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button className="bg-casino-accent hover:bg-purple-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 flex flex-col items-center space-y-2">
              <span className="text-2xl">🛒</span>
              <span>Shop</span>
            </button>
            
            <button className="bg-casino-green hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 flex flex-col items-center space-y-2">
              <span className="text-2xl">💰</span>
              <span>Deposit</span>
            </button>
            
            <button className="bg-casino-gold hover:bg-yellow-600 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 flex flex-col items-center space-y-2">
              <span className="text-2xl">🏆</span>
              <span>Leaderboard</span>
            </button>
            
            <button className="bg-casino-red hover:bg-red-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 flex flex-col items-center space-y-2">
              <span className="text-2xl">🎮</span>
              <span>Play Now</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;