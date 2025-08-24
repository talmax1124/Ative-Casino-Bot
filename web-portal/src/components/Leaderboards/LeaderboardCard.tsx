import React from 'react';
import { LeaderboardEntry } from '../../types';

interface LeaderboardCardProps {
  entry: LeaderboardEntry;
  position: number;
  activeTab: 'balance' | 'winnings' | 'games' | 'winrate';
  isPodium?: boolean;
  podiumHeight?: string;
}

const LeaderboardCard: React.FC<LeaderboardCardProps> = ({
  entry,
  position,
  activeTab,
  isPodium = false,
  podiumHeight = 'h-20'
}) => {
  const getRankIcon = (pos: number) => {
    switch (pos) {
      case 1:
        return '👑';
      case 2:
        return '🥈';
      case 3:
        return '🥉';
      default:
        return `#${pos}`;
    }
  };

  const getRankColor = (pos: number) => {
    switch (pos) {
      case 1:
        return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
      case 2:
        return 'text-gray-300 bg-gray-300/10 border-gray-300/30';
      case 3:
        return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
      default:
        return 'text-casino-accent bg-casino-accent/10 border-casino-accent/30';
    }
  };

  const formatValue = (value: number, type: string) => {
    switch (type) {
      case 'balance':
      case 'winnings':
        return `💰 ${new Intl.NumberFormat('en-US').format(value)}`;
      case 'games':
        return `🎮 ${new Intl.NumberFormat('en-US').format(value)}`;
      case 'winrate':
        return `📊 ${(value * 100).toFixed(1)}%`;
      default:
        return value.toString();
    }
  };

  const getProgressPercentage = () => {
    // For visual progress bar based on position
    const maxPosition = 50; // Assuming max 50 positions shown
    return Math.max(10, ((maxPosition - position + 1) / maxPosition) * 100);
  };

  if (isPodium) {
    return (
      <div className="flex flex-col items-center">
        {/* Podium */}
        <div className={`w-full ${podiumHeight} ${getRankColor(position)} rounded-t-lg border-2 flex flex-col items-center justify-end pb-4 mb-4 relative overflow-hidden`}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
          <div className="text-3xl mb-2 relative z-10">
            {getRankIcon(position)}
          </div>
        </div>
        
        {/* Player Card */}
        <div className="bg-casino-dark/70 backdrop-blur-lg rounded-xl p-4 border border-casino-accent/20 w-full text-center">
          <div className="flex flex-col items-center space-y-3">
            {/* Avatar */}
            <div className="relative">
              {entry.avatar ? (
                <img
                  src={`https://cdn.discordapp.com/avatars/${entry.userId}/${entry.avatar}.png`}
                  alt={entry.username}
                  className="w-12 h-12 rounded-full border-2 border-casino-accent"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-casino-accent flex items-center justify-center border-2 border-casino-accent">
                  <span className="text-white font-bold">
                    {entry.username.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full ${getRankColor(position).split(' ')[2]} border-2 flex items-center justify-center text-xs font-bold`}>
                {position}
              </div>
            </div>
            
            {/* Info */}
            <div>
              <p className="text-white font-bold text-sm truncate max-w-[120px]">
                {entry.username}
              </p>
              <p className="text-casino-gold font-bold text-lg">
                {formatValue(entry.value, activeTab)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-4 border border-gray-700 hover:border-casino-accent/40 transition-all duration-200 hover:transform hover:scale-[1.02]">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Rank */}
          <div className={`w-12 h-12 rounded-full ${getRankColor(position)} border-2 flex items-center justify-center font-bold text-sm`}>
            {position <= 10 ? getRankIcon(position) : `#${position}`}
          </div>
          
          {/* Avatar & Info */}
          <div className="flex items-center space-x-3">
            {entry.avatar ? (
              <img
                src={`https://cdn.discordapp.com/avatars/${entry.userId}/${entry.avatar}.png`}
                alt={entry.username}
                className="w-10 h-10 rounded-full border border-casino-accent/50"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-casino-accent/20 border border-casino-accent/50 flex items-center justify-center">
                <span className="text-casino-accent font-bold text-sm">
                  {entry.username.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            
            <div>
              <p className="text-white font-medium text-sm">
                {entry.username}
              </p>
              <div className="w-24 bg-gray-700 rounded-full h-1.5 mt-1">
                <div
                  className="bg-casino-accent h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${getProgressPercentage()}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Value */}
        <div className="text-right">
          <p className="text-casino-gold font-bold text-lg">
            {formatValue(entry.value, activeTab)}
          </p>
          {position <= 10 && (
            <p className="text-xs text-gray-400">
              Top {Math.ceil((position / 50) * 100)}%
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeaderboardCard;