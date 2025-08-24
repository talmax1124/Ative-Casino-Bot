import React from 'react';

interface StatsCardProps {
  title: string;
  value: string;
  icon: string;
  bgColor: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon,
  bgColor,
  change,
  changeType = 'neutral'
}) => {
  const getChangeColor = () => {
    switch (changeType) {
      case 'positive':
        return 'text-green-400';
      case 'negative':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getChangeIcon = () => {
    switch (changeType) {
      case 'positive':
        return '↗️';
      case 'negative':
        return '↘️';
      default:
        return '';
    }
  };

  return (
    <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 hover:border-casino-accent/40 transition-all duration-300 transform hover:scale-105">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-full ${bgColor}/20`}>
          <span className="text-2xl">{icon}</span>
        </div>
        <div className={`w-3 h-3 rounded-full ${bgColor} animate-pulse-slow`}></div>
      </div>
      
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
          {title}
        </h3>
        <p className="text-2xl font-bold text-white">
          {value}
        </p>
        {change && (
          <p className={`text-sm flex items-center space-x-1 ${getChangeColor()}`}>
            {getChangeIcon() && <span>{getChangeIcon()}</span>}
            <span>{change}</span>
          </p>
        )}
      </div>
    </div>
  );
};

export default StatsCard;