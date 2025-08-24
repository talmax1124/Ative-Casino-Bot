import React, { useState } from 'react';
import { ShopItem } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

interface PurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item: ShopItem;
  userBalance: number;
}

const PurchaseModal: React.FC<PurchaseModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  item,
  userBalance 
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAfford = userBalance >= item.price;

  const handlePurchase = async () => {
    if (!user || !canAfford) return;

    try {
      setLoading(true);
      setError(null);

      await axios.post(
        `${process.env.REACT_APP_API_BASE_URL}/shop/purchase`,
        {
          userId: user.id,
          itemId: item.id
        }
      );

      onSuccess();
    } catch (err: any) {
      console.error('Purchase error:', err);
      setError(err.response?.data?.message || 'Failed to complete purchase');
    } finally {
      setLoading(false);
    }
  };

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

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US').format(price);
  };

  const formatBalance = (balance: number) => {
    return new Intl.NumberFormat('en-US').format(balance);
  };

  const getDurationText = (duration?: number) => {
    if (!duration) return 'Permanent';
    if (duration < 24) return `${duration} hours`;
    const days = Math.floor(duration / 24);
    const hours = duration % 24;
    return hours > 0 ? `${days} days, ${hours} hours` : `${days} days`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-casino-dark rounded-xl p-6 w-full max-w-lg border border-casino-accent/20 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center">
            🛒 Purchase Item
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Item Preview */}
        <div className="bg-casino-darker/50 rounded-lg p-6 mb-6">
          <div className="flex items-start space-x-4">
            {/* Item Icon */}
            <div className="flex-shrink-0">
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt={item.name}
                  className="w-16 h-16 object-cover rounded-lg"
                />
              ) : (
                <div className="w-16 h-16 bg-casino-accent/20 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">{getCategoryIcon(item.category)}</span>
                </div>
              )}
            </div>

            {/* Item Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <h3 className="text-xl font-bold text-white">{item.name}</h3>
                <span className="px-2 py-1 bg-casino-accent/20 text-casino-accent text-xs rounded-lg font-medium">
                  {item.category.toUpperCase()}
                </span>
              </div>
              
              <p className="text-gray-300 text-sm mb-3">
                {item.description}
              </p>
              
              <div className="text-right">
                <p className="text-3xl font-bold text-casino-gold">
                  {formatPrice(item.price)}
                </p>
                <p className="text-sm text-gray-400">credits</p>
              </div>
            </div>
          </div>
        </div>

        {/* Item Details */}
        <div className="space-y-4 mb-6">
          {/* Duration */}
          <div className="flex justify-between items-center py-2 border-b border-gray-700">
            <span className="text-gray-300">Duration:</span>
            <span className="text-white font-medium">
              {getDurationText(item.duration)}
            </span>
          </div>

          {/* Benefits */}
          {item.benefits && item.benefits.length > 0 && (
            <div>
              <h4 className="text-white font-medium mb-2">Benefits:</h4>
              <ul className="space-y-2">
                {item.benefits.map((benefit, index) => (
                  <li key={index} className="text-gray-300 text-sm flex items-center">
                    <span className="text-green-400 mr-3">✓</span>
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Purchase Summary */}
        <div className="bg-casino-darker/50 rounded-lg p-4 mb-6">
          <h4 className="text-white font-bold mb-3">Purchase Summary</h4>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-300">Current Balance:</span>
              <span className="text-casino-gold font-bold">
                {formatBalance(userBalance)}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-300">Item Cost:</span>
              <span className="text-red-400 font-bold">
                -{formatPrice(item.price)}
              </span>
            </div>
            
            <hr className="border-gray-600" />
            
            <div className="flex justify-between text-lg">
              <span className="text-white font-bold">Balance After:</span>
              <span className={`font-bold ${
                userBalance - item.price >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {formatBalance(userBalance - item.price)}
              </span>
            </div>
          </div>
        </div>

        {/* Warning for insufficient funds */}
        {!canAfford && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2">
              <span className="text-red-400 text-lg">⚠️</span>
              <div>
                <p className="text-red-400 font-medium text-sm">Insufficient Credits</p>
                <p className="text-gray-300 text-xs">
                  You need {formatPrice(item.price - userBalance)} more credits to purchase this item.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          
          <button
            onClick={handlePurchase}
            disabled={loading || !canAfford}
            className={`flex-1 font-semibold py-3 px-4 rounded-lg transition-all duration-200 ${
              canAfford && !loading
                ? 'bg-casino-accent hover:bg-purple-700 text-white transform hover:scale-105'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center space-x-2">
                <div className="animate-spin text-lg">🔄</div>
                <span>Processing...</span>
              </span>
            ) : canAfford ? (
              <span className="flex items-center justify-center space-x-2">
                <span>💳</span>
                <span>Purchase Now</span>
              </span>
            ) : (
              <span className="flex items-center justify-center space-x-2">
                <span>💰</span>
                <span>Insufficient Credits</span>
              </span>
            )}
          </button>
        </div>

        {/* Terms */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            By purchasing, you agree to our Terms of Service. All sales are final.
          </p>
        </div>

        {loading && (
          <div className="absolute inset-0 bg-casino-dark/50 rounded-xl flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin text-4xl mb-2">🔄</div>
              <p className="text-white">Processing purchase...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PurchaseModal;