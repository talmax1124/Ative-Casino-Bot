import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

interface PurchasedItem {
  id: string;
  name: string;
  description: string;
  category: string;
  purchaseDate: Date;
  isActive: boolean;
  expiresAt?: Date;
  progress?: {
    totalEarned: number;
    usageCount?: number;
  };
  iconUrl?: string;
}

const MyItems: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<PurchasedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserItems = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const response = await axios.get(
        `${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/items`
      );
      
      const processedItems = response.data.map((item: any) => ({
        ...item,
        purchaseDate: new Date(item.purchaseDate),
        expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined
      }));

      setItems(processedItems);
    } catch (err: any) {
      console.error('Error fetching user items:', err);
      setError('Failed to load your items');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserItems();
  }, [fetchUserItems]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US').format(amount);
  };

  const getTimeRemaining = (expiresAt: Date) => {
    const now = new Date();
    const timeLeft = expiresAt.getTime() - now.getTime();
    
    if (timeLeft <= 0) return 'Expired';
    
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h remaining`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else {
      return `${minutes}m remaining`;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'boosts': return '⚡';
      case 'cosmetics': return '🎨';
      case 'premium': return '👑';
      default: return '📦';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'boosts': return 'border-yellow-500/40 bg-yellow-500/10';
      case 'cosmetics': return 'border-pink-500/40 bg-pink-500/10';
      case 'premium': return 'border-purple-500/40 bg-purple-500/10';
      default: return 'border-casino-accent/40 bg-casino-accent/10';
    }
  };

  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, PurchasedItem[]>);

  const activeItems = items.filter(item => item.isActive);
  const totalEarnings = items.reduce((sum, item) => sum + (item.progress?.totalEarned || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-casino-gradient p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-casino-dark rounded w-1/3 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-64 bg-casino-dark rounded-xl"></div>
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
            <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Items</h2>
            <p className="text-gray-300 mb-4">{error}</p>
            <button
              onClick={fetchUserItems}
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            📦 My Items
          </h1>
          <p className="text-gray-300">
            Track your purchased items and their progress
          </p>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
            <div className="text-3xl mb-2">📦</div>
            <h3 className="text-lg font-bold text-white mb-1">Total Items</h3>
            <p className="text-2xl font-bold text-casino-accent">{items.length}</p>
          </div>
          
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
            <div className="text-3xl mb-2">✅</div>
            <h3 className="text-lg font-bold text-white mb-1">Active Items</h3>
            <p className="text-2xl font-bold text-green-400">{activeItems.length}</p>
          </div>
          
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20 text-center">
            <div className="text-3xl mb-2">💰</div>
            <h3 className="text-lg font-bold text-white mb-1">Total Earnings</h3>
            <p className="text-2xl font-bold text-casino-gold">{formatAmount(totalEarnings)}</p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-2xl font-bold text-gray-400 mb-2">No items purchased yet</h3>
            <p className="text-gray-500 mb-6">
              Visit the shop to purchase boosts, cosmetics, and premium items!
            </p>
            <a
              href="/shop"
              className="bg-casino-accent hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Visit Shop
            </a>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedItems).map(([category, categoryItems]) => (
              <div key={category}>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                  <span className="text-3xl mr-3">{getCategoryIcon(category)}</span>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                  <span className="ml-2 text-sm text-gray-400">({categoryItems.length})</span>
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className={`bg-casino-dark/50 backdrop-blur-lg rounded-xl border transition-all duration-300 hover:scale-[1.02] overflow-hidden ${getCategoryColor(item.category)}`}
                    >
                      {/* Item Header */}
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-white mb-2">{item.name}</h3>
                            <p className="text-gray-300 text-sm mb-3">{item.description}</p>
                          </div>
                          <div className={`w-2 h-2 rounded-full ${item.isActive ? 'bg-green-400' : 'bg-red-400'}`}></div>
                        </div>

                        {/* Status */}
                        <div className="mb-4">
                          <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                            item.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {item.isActive ? 'Active' : 'Inactive'}
                          </div>
                        </div>

                        {/* Expiration */}
                        {item.expiresAt && (
                          <div className="mb-4">
                            <p className="text-sm text-gray-400">
                              {item.isActive ? getTimeRemaining(item.expiresAt) : 'Expired'}
                            </p>
                          </div>
                        )}

                        {/* Progress */}
                        {item.progress && item.progress.totalEarned > 0 && (
                          <div className="mb-4 p-3 bg-casino-darker/50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-400">Earnings</span>
                              <span className="text-sm font-bold text-casino-gold">
                                {formatAmount(item.progress.totalEarned)} coins
                              </span>
                            </div>
                            {item.progress.usageCount && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-400">Uses</span>
                                <span className="text-sm text-white">{item.progress.usageCount}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Purchase Info */}
                        <div className="text-xs text-gray-500">
                          Purchased: {formatDate(item.purchaseDate)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyItems;