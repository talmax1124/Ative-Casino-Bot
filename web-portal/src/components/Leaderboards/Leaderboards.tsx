import React, { useState, useEffect } from 'react';
import { LeaderboardEntry } from '../../types';
import LeaderboardCard from './LeaderboardCard';
import axios from 'axios';

type LeaderboardType = 'balance' | 'winnings' | 'games' | 'winrate';

const Leaderboards: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LeaderboardType>('balance');
  const [leaderboardData, setLeaderboardData] = useState<Record<LeaderboardType, LeaderboardEntry[]>>({
    balance: [],
    winnings: [],
    games: [],
    winrate: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tabs: { key: LeaderboardType; label: string; icon: string; description: string }[] = [
    {
      key: 'balance',
      label: 'Top Balance',
      icon: '💰',
      description: 'Players with the highest current balance'
    },
    {
      key: 'winnings',
      label: 'Total Winnings',
      icon: '🏆',
      description: 'Players with the most total winnings'
    },
    {
      key: 'games',
      label: 'Most Active',
      icon: '🎮',
      description: 'Players with the most games played'
    },
    {
      key: 'winrate',
      label: 'Win Rate',
      icon: '📊',
      description: 'Players with the best win percentage'
    }
  ];

  useEffect(() => {
    const fetchLeaderboards = async () => {
      try {
        setLoading(true);
        
        // Fetch all leaderboard types
        const [balanceRes, winningsRes, gamesRes, winrateRes] = await Promise.all([
          axios.get(`${process.env.REACT_APP_API_BASE_URL}/leaderboards/balance`),
          axios.get(`${process.env.REACT_APP_API_BASE_URL}/leaderboards/winnings`),
          axios.get(`${process.env.REACT_APP_API_BASE_URL}/leaderboards/games`),
          axios.get(`${process.env.REACT_APP_API_BASE_URL}/leaderboards/winrate`)
        ]);

        setLeaderboardData({
          balance: balanceRes.data,
          winnings: winningsRes.data,
          games: gamesRes.data,
          winrate: winrateRes.data
        });
      } catch (err) {
        console.error('Error fetching leaderboards:', err);
        setError('Failed to load leaderboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboards();
  }, []);

  const currentTab = tabs.find(tab => tab.key === activeTab)!;
  const currentData = leaderboardData[activeTab];

  if (loading) {
    return (
      <div className="min-h-screen bg-casino-gradient p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-casino-dark rounded w-1/3 mb-8"></div>
            <div className="flex space-x-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 bg-casino-dark rounded-lg flex-1"></div>
              ))}
            </div>
            <div className="space-y-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-20 bg-casino-dark rounded-lg"></div>
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
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-8 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Leaderboards</h2>
            <p className="text-gray-300 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
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
            🏆 Leaderboards
          </h1>
          <p className="text-gray-300">
            See how you stack up against other players
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-[200px] p-4 rounded-lg border transition-all duration-200 ${
                activeTab === tab.key
                  ? 'bg-casino-accent border-casino-accent text-white'
                  : 'bg-casino-dark/50 border-gray-600 text-gray-300 hover:border-casino-accent/50 hover:bg-casino-dark/70'
              }`}
            >
              <div className="text-2xl mb-1">{tab.icon}</div>
              <div className="font-bold text-sm">{tab.label}</div>
            </button>
          ))}
        </div>

        {/* Current Tab Info */}
        <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 mb-8">
          <h2 className="text-2xl font-bold text-white mb-2 flex items-center">
            {currentTab.icon} {currentTab.label}
          </h2>
          <p className="text-gray-300">{currentTab.description}</p>
        </div>

        {/* Leaderboard */}
        <div className="space-y-4">
          {currentData.length === 0 ? (
            <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-8 border border-casino-accent/20 text-center">
              <div className="text-4xl mb-4">📊</div>
              <p className="text-gray-400 mb-2">No leaderboard data available</p>
              <p className="text-sm text-gray-500">
                Be the first to appear on the leaderboard!
              </p>
            </div>
          ) : (
            <>
              {/* Top 3 Podium */}
              {currentData.length >= 3 && (
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {/* 2nd Place */}
                  <div className="order-1">
                    <LeaderboardCard
                      entry={currentData[1]}
                      position={2}
                      activeTab={activeTab}
                      isPodium={true}
                      podiumHeight="h-32"
                    />
                  </div>
                  
                  {/* 1st Place */}
                  <div className="order-2">
                    <LeaderboardCard
                      entry={currentData[0]}
                      position={1}
                      activeTab={activeTab}
                      isPodium={true}
                      podiumHeight="h-40"
                    />
                  </div>
                  
                  {/* 3rd Place */}
                  <div className="order-3">
                    <LeaderboardCard
                      entry={currentData[2]}
                      position={3}
                      activeTab={activeTab}
                      isPodium={true}
                      podiumHeight="h-24"
                    />
                  </div>
                </div>
              )}

              {/* Rest of the leaderboard */}
              <div className="space-y-3">
                {currentData.slice(3).map((entry, index) => (
                  <LeaderboardCard
                    key={entry.userId}
                    entry={entry}
                    position={index + 4}
                    activeTab={activeTab}
                    isPodium={false}
                  />
                ))}
              </div>

              {/* Pagination or Load More */}
              {currentData.length >= 50 && (
                <div className="text-center mt-8">
                  <button className="bg-casino-accent hover:bg-purple-700 text-white px-8 py-3 rounded-lg transition-colors font-medium">
                    Load More Players
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Statistics Summary */}
        <div className="mt-12 bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
          <h3 className="text-xl font-bold text-white mb-4">📈 Server Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-casino-gold">
                {leaderboardData.balance.length}
              </p>
              <p className="text-sm text-gray-400">Total Players</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-casino-green">
                {leaderboardData.winnings.reduce((sum, entry) => sum + entry.value, 0).toLocaleString()}
              </p>
              <p className="text-sm text-gray-400">Total Winnings</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-casino-accent">
                {leaderboardData.games.reduce((sum, entry) => sum + entry.value, 0).toLocaleString()}
              </p>
              <p className="text-sm text-gray-400">Games Played</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-casino-red">
                {leaderboardData.winrate.length > 0 ? 
                  `${((leaderboardData.winrate.reduce((sum, entry) => sum + entry.value, 0) / leaderboardData.winrate.length) * 100).toFixed(1)}%` :
                  'N/A'
                }
              </p>
              <p className="text-sm text-gray-400">Avg Win Rate</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Leaderboards;