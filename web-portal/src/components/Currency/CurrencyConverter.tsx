import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

interface EconomyData {
  coinToCreditRate: number;
  creditToCoinRate: number;
  totalCoinsInCirculation: number;
  activeUsers: number;
  averageBalance: number;
  economyHealth: {
    status: string;
    inflation: string;
  };
}

interface CurrencyConverterProps {
  userCredits: number;
  userCoins: number;
  onConversionComplete: () => void;
}

const CurrencyConverter: React.FC<CurrencyConverterProps> = ({ 
  userCredits, 
  userCoins, 
  onConversionComplete 
}) => {
  const { user } = useAuth();
  const [economyData, setEconomyData] = useState<EconomyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState<string>('');
  const [fromCurrency, setFromCurrency] = useState<'coins' | 'credits'>('coins');
  const [convertedAmount, setConvertedAmount] = useState<number>(0);

  useEffect(() => {
    fetchEconomyData();
  }, []);

  useEffect(() => {
    if (economyData && amount) {
      const inputAmount = parseFloat(amount);
      if (!isNaN(inputAmount)) {
        const rate = fromCurrency === 'coins' ? economyData.coinToCreditRate : economyData.creditToCoinRate;
        setConvertedAmount(Math.floor(inputAmount * rate));
      } else {
        setConvertedAmount(0);
      }
    }
  }, [amount, fromCurrency, economyData]);

  const fetchEconomyData = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_BASE_URL}/economy/rates`);
      setEconomyData(response.data);
    } catch (error) {
      console.error('Error fetching economy data:', error);
    }
  };

  const handleConvert = async () => {
    if (!user || !economyData || !amount) return;

    const inputAmount = parseFloat(amount);
    if (isNaN(inputAmount) || inputAmount <= 0) return;

    // Check if user has enough of the source currency
    const availableAmount = fromCurrency === 'coins' ? userCoins : userCredits;
    if (inputAmount > availableAmount) {
      alert(`Insufficient ${fromCurrency}. You have ${availableAmount.toLocaleString()}`);
      return;
    }

    setLoading(true);
    try {
      const toCurrency = fromCurrency === 'coins' ? 'credits' : 'coins';
      
      await axios.post(`${process.env.REACT_APP_API_BASE_URL}/economy/convert`, {
        userId: user.id,
        amount: inputAmount,
        fromCurrency,
        toCurrency
      });

      setAmount('');
      onConversionComplete();
      alert(`Successfully converted ${inputAmount.toLocaleString()} ${fromCurrency} to ${convertedAmount.toLocaleString()} ${toCurrency}!`);
    } catch (error) {
      console.error('Conversion error:', error);
      alert('Conversion failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-400';
      case 'moderate': return 'text-yellow-400';
      case 'growing': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  const getInflationColor = (inflation: string) => {
    switch (inflation) {
      case 'low': return 'text-green-400';
      case 'stable': return 'text-blue-400';
      case 'high': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  if (!economyData) {
    return (
      <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-700 rounded w-2/3 mb-2"></div>
          <div className="h-4 bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">💱 Currency Converter</h3>
        <button 
          onClick={fetchEconomyData}
          className="text-casino-accent hover:text-purple-400 text-sm transition-colors"
        >
          🔄 Refresh Rates
        </button>
      </div>

      {/* Economy Status */}
      <div className="bg-casino-darker/50 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Economy Status:</span>
            <span className={`ml-2 font-semibold capitalize ${getStatusColor(economyData.economyHealth.status)}`}>
              {economyData.economyHealth.status}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Inflation:</span>
            <span className={`ml-2 font-semibold capitalize ${getInflationColor(economyData.economyHealth.inflation)}`}>
              {economyData.economyHealth.inflation}
            </span>
          </div>
        </div>
        
        <div className="mt-3 pt-3 border-t border-gray-600">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">1 Coin = </span>
              <span className="text-casino-gold font-semibold">
                {economyData.coinToCreditRate.toFixed(4)} Credits
              </span>
            </div>
            <div>
              <span className="text-gray-400">1 Credit = </span>
              <span className="text-casino-gold font-semibold">
                {economyData.creditToCoinRate.toFixed(0)} Coins
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Current Balances */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-casino-darker/30 rounded-lg p-4 text-center">
          <div className="text-2xl mb-1">🪙</div>
          <div className="text-lg font-bold text-casino-gold">{formatCurrency(userCoins)}</div>
          <div className="text-sm text-gray-400">Casino Coins</div>
        </div>
        
        <div className="bg-casino-darker/30 rounded-lg p-4 text-center">
          <div className="text-2xl mb-1">💎</div>
          <div className="text-lg font-bold text-casino-accent">{formatCurrency(userCredits)}</div>
          <div className="text-sm text-gray-400">Premium Credits</div>
        </div>
      </div>

      {/* Conversion Interface */}
      <div className="space-y-4">
        {/* Currency Selection */}
        <div className="flex space-x-2">
          <button
            onClick={() => setFromCurrency('coins')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              fromCurrency === 'coins'
                ? 'bg-casino-gold text-white'
                : 'bg-casino-darker text-gray-300 hover:bg-gray-600'
            }`}
          >
            🪙 From Coins
          </button>
          <button
            onClick={() => setFromCurrency('credits')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              fromCurrency === 'credits'
                ? 'bg-casino-accent text-white'
                : 'bg-casino-darker text-gray-300 hover:bg-gray-600'
            }`}
          >
            💎 From Credits
          </button>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Amount to Convert
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Enter ${fromCurrency} amount`}
            className="w-full px-4 py-3 bg-casino-darker border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-casino-accent"
          />
        </div>

        {/* Conversion Preview */}
        {amount && convertedAmount > 0 && (
          <div className="bg-casino-darker/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-400">You will receive:</div>
              <div className="text-lg font-bold text-casino-green">
                {formatCurrency(convertedAmount)} {fromCurrency === 'coins' ? 'Credits' : 'Coins'}
                {fromCurrency === 'coins' ? ' 💎' : ' 🪙'}
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Rate: 1 {fromCurrency === 'coins' ? 'Coin' : 'Credit'} = {
                fromCurrency === 'coins' 
                  ? economyData.coinToCreditRate.toFixed(4) 
                  : economyData.creditToCoinRate.toFixed(0)
              } {fromCurrency === 'coins' ? 'Credits' : 'Coins'}
            </div>
          </div>
        )}

        {/* Convert Button */}
        <button
          onClick={handleConvert}
          disabled={!amount || convertedAmount <= 0 || loading}
          className="w-full py-3 px-4 bg-casino-green hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
        >
          {loading ? 'Converting...' : `Convert ${fromCurrency === 'coins' ? 'Coins to Credits' : 'Credits to Coins'}`}
        </button>
      </div>

      {/* Info Note */}
      <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <p className="text-sm text-blue-300">
          💡 <strong>Tip:</strong> Credits are used for premium shop items and special features. 
          Conversion rates fluctuate based on server economy health.
        </p>
      </div>
    </div>
  );
};

export default CurrencyConverter;