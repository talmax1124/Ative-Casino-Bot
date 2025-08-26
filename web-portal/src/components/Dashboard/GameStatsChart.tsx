import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GameStats } from '../../types';

interface GameStatsChartProps {
  gameStats: GameStats[];
}

const GameStatsChart: React.FC<GameStatsChartProps> = ({ gameStats }) => {
  const navigate = useNavigate();

  const handleViewDetailedStats = () => {
    navigate('/stats');
  };

  const getGameIcon = (gameType: string) => {
    switch (gameType.toLowerCase()) {
      case 'slots':
        return '🎰';
      case 'blackjack':
        return '🃏';
      case 'roulette':
        return '🎲';
      case 'poker':
        return '🎯';
      case 'crash':
        return '🚀';
      case 'plinko':
        return '🔴';
      default:
        return '🎮';
    }
  };

  const getWinRateColor = (winRate: number) => {
    if (winRate >= 0.6) return 'text-green-400';
    if (winRate >= 0.4) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getWinRateBarColor = (winRate: number) => {
    if (winRate >= 0.6) return 'bg-green-500';
    if (winRate >= 0.4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (gameStats.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4">🎮</div>
        <p className="text-gray-400 mb-2">No game statistics yet</p>
        <p className="text-sm text-gray-500">
          Play some games to see your performance stats!
        </p>
        <button className="mt-4 bg-casino-accent hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors">
          Start Playing
        </button>
      </div>
    );
  }

  // Sort by total winnings for display
  const sortedStats = [...gameStats].sort((a, b) => b.totalWinnings - a.totalWinnings);

  return (
    <div className="space-y-4">
      {sortedStats.map((stat) => (
        <div
          key={stat.gameType}
          className="p-4 bg-casino-darker/50 rounded-lg border border-gray-700/50 hover:border-casino-accent/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <span className="text-xl">{getGameIcon(stat.gameType)}</span>
              <div>
                <h4 className="text-white font-medium capitalize">
                  {stat.gameType}
                </h4>
                <p className="text-xs text-gray-400">
                  {stat.gamesPlayed} games played
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold ${getWinRateColor(stat.winRate)}`}>
                {(stat.winRate * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-gray-400">win rate</p>
            </div>
          </div>

          {/* Win Rate Bar */}
          <div className="mb-3">
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${getWinRateBarColor(
                  stat.winRate
                )}`}
                style={{ width: `${stat.winRate * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-green-400 font-bold text-sm">
                +{formatCurrency(stat.totalWinnings)}
              </p>
              <p className="text-xs text-gray-400">Total Wins</p>
            </div>
            <div>
              <p className="text-red-400 font-bold text-sm">
                -{formatCurrency(stat.totalLosses)}
              </p>
              <p className="text-xs text-gray-400">Total Losses</p>
            </div>
            <div>
              <p className="text-casino-gold font-bold text-sm">
                {formatCurrency(stat.bestWin)}
              </p>
              <p className="text-xs text-gray-400">Best Win</p>
            </div>
          </div>
        </div>
      ))}
      
      <div className="pt-3 border-t border-gray-700">
        <button 
          onClick={handleViewDetailedStats}
          className="w-full text-center text-casino-accent hover:text-purple-400 text-sm font-medium transition-colors"
        >
          View Detailed Stats →
        </button>
      </div>
    </div>
  );
};

export default GameStatsChart;