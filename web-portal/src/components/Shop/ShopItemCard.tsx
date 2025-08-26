import React from 'react';
import { ShopItem } from '../../types';

interface ShopItemCardProps {
  item: ShopItem;
  onPurchaseClick: (item: ShopItem) => void;
  userBalance: number;
}

const ShopItemCard: React.FC<ShopItemCardProps> = ({ 
  item, 
  onPurchaseClick, 
  userBalance 
}) => {
  const canAfford = userBalance >= item.price;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'boosts':
        return '⚡';
      case 'cosmetics':
        return '🎨';
      case 'premium':
        return '👑';
      default:
        return '🛒';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'boosts':
        return 'bg-yellow-600/80 text-yellow-200 border-yellow-500/80';
      case 'cosmetics':
        return 'bg-pink-600/80 text-pink-200 border-pink-500/80';
      case 'premium':
        return 'bg-purple-600/80 text-purple-200 border-purple-500/80';
      default:
        return 'bg-casino-accent/80 text-casino-light border-casino-accent/80';
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US').format(price);
  };

  const getDurationText = (duration?: number) => {
    if (!duration) return null;
    if (duration < 24) return `${duration}h`;
    return `${Math.floor(duration / 24)}d`;
  };

  return (
    <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl border border-gray-700/50 hover:border-casino-accent/40 transition-all duration-300 transform hover:scale-[1.02] overflow-hidden">
      {/* Item Image/Icon */}
      <div className="relative h-48 bg-gradient-to-br from-casino-dark to-casino-darker flex items-center justify-center overflow-hidden">
        {item.iconUrl ? (
          <img
            src={item.iconUrl}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to icon if image fails to load
              e.currentTarget.style.display = 'none';
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const fallback = document.createElement('div');
                fallback.className = 'w-24 h-24 bg-casino-accent/20 rounded-lg flex items-center justify-center';
                fallback.innerHTML = `<span class="text-4xl">${getCategoryIcon(item.category)}</span>`;
                parent.appendChild(fallback);
              }
            }}
          />
        ) : (
          <div className="w-24 h-24 bg-casino-accent/20 rounded-lg flex items-center justify-center">
            <span className="text-4xl">{getCategoryIcon(item.category)}</span>
          </div>
        )}
        
        {/* Category Badge */}
        <div className={`absolute top-3 left-3 px-2 py-1 rounded-lg border text-xs font-medium ${getCategoryColor(item.category)}`}>
          <span className="mr-1">{getCategoryIcon(item.category)}</span>
          {item.category.toUpperCase()}
        </div>

        {/* Duration Badge */}
        {item.duration && (
          <div className="absolute top-3 right-3 bg-casino-gold/20 text-casino-gold border border-casino-gold/40 px-2 py-1 rounded-lg text-xs font-medium">
            ⏰ {getDurationText(item.duration)}
          </div>
        )}
      </div>

      {/* Item Details */}
      <div className="p-6">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-bold text-white truncate pr-2">
            {item.name}
          </h3>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold text-casino-gold">
              {formatPrice(item.price)}
            </p>
            <p className="text-xs text-gray-400">credits</p>
          </div>
        </div>

        <p className="text-gray-300 text-sm mb-4 line-clamp-2">
          {item.description}
        </p>

        {/* Benefits */}
        {item.benefits && item.benefits.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-casino-accent mb-2">Benefits:</p>
            <ul className="space-y-1">
              {item.benefits.slice(0, 3).map((benefit, index) => (
                <li key={index} className="text-xs text-gray-300 flex items-center">
                  <span className="text-green-400 mr-2">✓</span>
                  {benefit}
                </li>
              ))}
              {item.benefits.length > 3 && (
                <li className="text-xs text-gray-400">
                  +{item.benefits.length - 3} more benefits...
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Purchase Button */}
        <button
          onClick={() => onPurchaseClick(item)}
          disabled={!canAfford}
          className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105 ${
            canAfford
              ? 'bg-casino-accent hover:bg-purple-700 text-white'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          {canAfford ? (
            <span className="flex items-center justify-center space-x-2">
              <span>🛒</span>
              <span>Purchase</span>
            </span>
          ) : (
            <span className="flex items-center justify-center space-x-2">
              <span>💰</span>
              <span>Insufficient Credits</span>
            </span>
          )}
        </button>

        {/* Affordability Indicator */}
        {!canAfford && (
          <div className="mt-2 text-center">
            <p className="text-xs text-red-400">
              Need {formatPrice(item.price - userBalance)} more credits
            </p>
          </div>
        )}
      </div>

      {/* Popular/Featured Badge */}
      {item.category === 'premium' && (
        <div className="absolute -top-2 -right-2 bg-gradient-to-r from-casino-gold to-casino-accent text-white text-xs font-bold px-3 py-1 rounded-full transform rotate-12 shadow-lg">
          ✨ PREMIUM
        </div>
      )}
    </div>
  );
};

export default ShopItemCard;