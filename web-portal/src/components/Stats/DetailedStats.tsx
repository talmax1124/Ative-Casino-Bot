import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

interface GameStat {
  game: string;
  wins: number;
  losses: number;
  totalWagered: number;
  totalWon: number;
  winRate: number;
  netProfit: number;
  bestWin: number;
  gamesPlayed: number;
}

const DetailedStats: React.FC = () => {
  const { user } = useAuth();
  const [gameStats, setGameStats] = useState<GameStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDetailedStats = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        const response = await axios.get(
          `${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/detailed-stats`
        );
        setGameStats(response.data);
      } catch (err) {
        console.error('Error fetching detailed stats:', err);
        setError('Failed to load detailed statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchDetailedStats();
  }, [user]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (rate: number) => {
    return `${(rate * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-casino-gradient p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-casino-dark rounded w-1/3 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-64 bg-casino-dark rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-casino-gradient p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-8 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Stats</h2>
            <p className="text-gray-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate overall stats
  const totalGames = gameStats.reduce((sum, stat) => sum + stat.gamesPlayed, 0);
  const totalWins = gameStats.reduce((sum, stat) => sum + stat.wins, 0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const totalLosses = gameStats.reduce((sum, stat) => sum + stat.losses, 0);
  const totalWagered = gameStats.reduce((sum, stat) => sum + stat.totalWagered, 0);
  const totalWon = gameStats.reduce((sum, stat) => sum + stat.totalWon, 0);
  const overallWinRate = totalGames > 0 ? totalWins / totalGames : 0;
  const overallProfit = totalWon - totalWagered;
  const bestWin = Math.max(...gameStats.map(stat => stat.bestWin), 0);

  return (
    <div className="min-h-screen bg-casino-gradient p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            📊 Detailed Game Statistics
          </h1>
          <p className="text-gray-300">
            Complete breakdown of your gaming performance
          </p>
        </div>

        {/* Overall Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
            <div className="text-2xl font-bold text-casino-gold mb-1">
              {totalGames.toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">Total Games</div>
          </div>
          
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
            <div className="text-2xl font-bold text-casino-green mb-1">
              {formatPercentage(overallWinRate)}
            </div>
            <div className="text-sm text-gray-400">Win Rate</div>
          </div>
          
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
            <div className={`text-2xl font-bold mb-1 ${overallProfit >= 0 ? 'text-casino-green' : 'text-casino-red'}`}>
              {overallProfit >= 0 ? '+' : ''}{formatCurrency(overallProfit)}
            </div>
            <div className="text-sm text-gray-400">Net Profit</div>
          </div>
          
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
            <div className="text-2xl font-bold text-casino-gold mb-1">
              {formatCurrency(bestWin)}
            </div>
            <div className="text-sm text-gray-400">Best Win</div>
          </div>
        </div>

        {/* Individual Game Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {gameStats.map((stat) => (
            <div 
              key={stat.game}
              className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 hover:border-casino-accent/40 transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white capitalize">
                  {stat.game.replace(/[-_]/g, ' ')}
                </h3>
                <div className="text-2xl">
                  {stat.game === 'blackjack' ? '🃏' : 
                   stat.game === 'slots' ? '🎰' :
                   stat.game === 'roulette' ? '🎲' :
                   stat.game === 'plinko' ? '🏐' :
                   stat.game === 'crash' ? '🚀' :
                   stat.game === 'mines' ? '💣' :
                   stat.game === 'dice' ? '🎲' :
                   stat.game === 'coinflip' ? '🪙' :
                   stat.game === 'rps' ? '✂️' :
                   '🎮'}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Games Played</span>
                  <span className="text-white font-semibold">{stat.gamesPlayed}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Win Rate</span>
                  <span className={`font-semibold ${stat.winRate >= 0.5 ? 'text-casino-green' : 'text-casino-red'}`}>
                    {formatPercentage(stat.winRate)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Net Profit</span>
                  <span className={`font-semibold ${stat.netProfit >= 0 ? 'text-casino-green' : 'text-casino-red'}`}>
                    {stat.netProfit >= 0 ? '+' : ''}{formatCurrency(stat.netProfit)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Best Win</span>
                  <span className="text-casino-gold font-semibold">{formatCurrency(stat.bestWin)}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Total Wagered</span>
                  <span className="text-white font-semibold">{formatCurrency(stat.totalWagered)}</span>
                </div>

                {/* Win/Loss Bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Wins: {stat.wins}</span>
                    <span>Losses: {stat.losses}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-casino-green h-2 rounded-full transition-all duration-300"
                      style={{ width: `${stat.winRate * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* No Data State */}
        {gameStats.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎮</div>
            <h3 className="text-2xl font-bold text-white mb-2">No Game Statistics Yet</h3>
            <p className="text-gray-400 mb-6">
              Start playing some games to see your detailed statistics here!
            </p>
            <button 
              onClick={() => window.location.href = '/dashboard'}
              className="bg-casino-accent hover:bg-purple-700 text-white px-8 py-3 rounded-lg transition-colors font-medium"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DetailedStats;