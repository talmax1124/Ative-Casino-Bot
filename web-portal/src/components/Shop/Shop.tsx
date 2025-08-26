import React, { useState, useEffect } from 'react';
import { ShopItem } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import ShopItemCard from './ShopItemCard';
import PurchaseModal from './PurchaseModal';
import PremiumSubscriptionModal from '../Currency/PremiumSubscriptionModal';
import axios from 'axios';

type ShopCategory = 'all' | 'boosts' | 'cosmetics' | 'premium';

const Shop: React.FC = () => {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<ShopCategory>('all');
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<any>(null);

  const categories = [
    { key: 'all', label: 'All Items', icon: '🛒' },
    { key: 'boosts', label: 'Game Boosts', icon: '⚡' },
    { key: 'cosmetics', label: 'Cosmetics', icon: '🎨' },
    { key: 'premium', label: 'Premium', icon: '👑' },
  ];

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        setLoading(true);
        
        // Fetch both shop items and user stats in parallel
        const [shopResponse, statsResponse] = await Promise.all([
          axios.get(`${process.env.REACT_APP_API_BASE_URL}/shop/items?userId=${user.id}`),
          axios.get(`${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/stats`)
        ]);
        
        // Handle the new API response format that includes economy data
        if (shopResponse.data && shopResponse.data.items) {
          setShopItems(shopResponse.data.items);
        } else {
          // Fallback for old API format
          setShopItems(shopResponse.data);
        }
        
        setUserStats(statsResponse.data);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load shop data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const filteredItems = shopItems.filter(item => {
    // Check if item is active
    if (!item.isActive) return false;
    
    // Filter by category
    if (activeCategory !== 'all' && item.category !== activeCategory) return false;
    
    // Restrict premium items to premium members only
    if (item.category === 'premium' && !userStats?.premiumMembership) return false;
    
    return true;
  });

  const handlePurchaseClick = (item: ShopItem) => {
    setSelectedItem(item);
    setShowPurchaseModal(true);
  };

  const handlePurchaseSuccess = async () => {
    setShowPurchaseModal(false);
    setSelectedItem(null);
    
    // Refresh user stats to show updated balance
    if (user) {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/stats`);
        setUserStats(response.data);
      } catch (error) {
        console.error('Error refreshing user stats:', error);
      }
    }
  };

  const formatBalance = (balance: number) => {
    return new Intl.NumberFormat('en-US').format(balance);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-casino-gradient p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-casino-dark rounded w-1/3 mb-8"></div>
            <div className="flex space-x-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 bg-casino-dark rounded-lg flex-1"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="h-80 bg-casino-dark rounded-xl"></div>
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
            <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Shop</h2>
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🛒 Casino Shop
          </h1>
          <p className="text-gray-300 mb-4">
            Enhance your gaming experience with premium items
          </p>
          
          {/* User Balance */}
          {user && userStats && (
            <div className="inline-flex items-center bg-casino-dark/50 backdrop-blur-lg rounded-full px-6 py-3 border border-casino-accent/20">
              <span className="text-casino-accent font-bold text-lg">
                💎 {formatBalance(userStats.creditsAmount || 0)} Credits
              </span>
            </div>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 justify-center">
          {categories.map((category) => (
            <button
              key={category.key}
              onClick={() => setActiveCategory(category.key as ShopCategory)}
              className={`px-6 py-3 rounded-lg border transition-all duration-200 flex items-center space-x-2 ${
                activeCategory === category.key
                  ? 'bg-casino-accent border-casino-accent text-white'
                  : 'bg-casino-dark/50 border-gray-600 text-gray-300 hover:border-casino-accent/50 hover:bg-casino-dark/70'
              }`}
            >
              <span className="text-xl">{category.icon}</span>
              <span className="font-medium">{category.label}</span>
            </button>
          ))}
        </div>

        {/* Premium Category Access Notice */}
        {activeCategory === 'premium' && !userStats?.premiumMembership && (
          <div className="bg-gradient-to-r from-casino-gold/10 to-casino-accent/10 rounded-xl p-8 border border-casino-gold/20 text-center mb-8">
            <div className="text-4xl mb-4">👑</div>
            <h3 className="text-2xl font-bold text-casino-gold mb-2">Premium Membership Required</h3>
            <p className="text-gray-300 mb-6">
              Access exclusive premium items with a Premium Membership for just $7.99/month!
            </p>
            <button 
              onClick={() => setShowPremiumModal(true)}
              className="bg-gradient-to-r from-casino-gold to-casino-accent hover:from-yellow-600 hover:to-purple-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
            >
              Upgrade to Premium
            </button>
          </div>
        )}

        {/* Shop Items */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🛒</div>
            <h3 className="text-2xl font-bold text-gray-400 mb-2">No items available</h3>
            <p className="text-gray-500">
              {activeCategory === 'premium' && !userStats?.premiumMembership
                ? "Premium items require a Premium Membership"
                : activeCategory === 'all' 
                ? "The shop is currently empty. Check back soon!" 
                : `No ${activeCategory} items available right now`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {filteredItems.map((item) => (
              <ShopItemCard
                key={item.id}
                item={item}
                onPurchaseClick={handlePurchaseClick}
                userBalance={userStats?.creditsAmount || 0}
              />
            ))}
          </div>
        )}

        {/* Featured Section */}
        <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-8 border border-casino-accent/20 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">💎 Premium Membership</h2>
          <p className="text-gray-300 mb-6">
            Get exclusive access to VIP games, higher betting limits, and special rewards!
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-casino-accent/20 rounded-lg p-4">
              <div className="text-2xl mb-2">🎰</div>
              <p className="text-white font-medium">VIP Games</p>
              <p className="text-gray-400 text-sm">Exclusive game modes</p>
            </div>
            <div className="bg-casino-accent/20 rounded-lg p-4">
              <div className="text-2xl mb-2">💰</div>
              <p className="text-white font-medium">Higher Limits</p>
              <p className="text-gray-400 text-sm">Bet more, win more</p>
            </div>
            <div className="bg-casino-accent/20 rounded-lg p-4">
              <div className="text-2xl mb-2">🎁</div>
              <p className="text-white font-medium">Daily Rewards</p>
              <p className="text-gray-400 text-sm">Extra bonuses daily</p>
            </div>
          </div>
          <button 
            onClick={() => setShowPremiumModal(true)}
            className="bg-gradient-to-r from-casino-gold to-casino-accent hover:from-yellow-600 hover:to-purple-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 transform hover:scale-105"
          >
            Upgrade to Premium - $7.99/month
          </button>
        </div>

        {/* Purchase Modal */}
        {showPurchaseModal && selectedItem && userStats && (
          <PurchaseModal
            isOpen={showPurchaseModal}
            onClose={() => setShowPurchaseModal(false)}
            onSuccess={handlePurchaseSuccess}
            item={selectedItem}
            userBalance={userStats.creditsAmount || 0}
          />
        )}

        {/* Premium Subscription Modal */}
        {showPremiumModal && (
          <PremiumSubscriptionModal
            isOpen={showPremiumModal}
            onClose={() => setShowPremiumModal(false)}
            onSuccess={() => {
              setShowPremiumModal(false);
              // Refresh user stats to show premium status
              if (user) {
                axios.get(`${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/stats`)
                  .then(response => setUserStats(response.data))
                  .catch(error => console.error('Error refreshing user stats:', error));
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

export default Shop;