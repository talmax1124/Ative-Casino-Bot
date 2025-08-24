import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentBalance: number;
}

const TransferModal: React.FC<TransferModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  currentBalance 
}) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minTransfer = 100;

  const searchUsers = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const response = await axios.get(
        `${process.env.REACT_APP_API_BASE_URL}/users/search?q=${encodeURIComponent(query)}&limit=5`
      );
      setSearchResults(response.data);
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setRecipientSearch(value);
    setSelectedRecipient(null);
    searchUsers(value);
  };

  const selectRecipient = (recipient: any) => {
    setSelectedRecipient(recipient);
    setRecipientSearch(recipient.username);
    setSearchResults([]);
  };

  const handleTransfer = async () => {
    if (!user || !selectedRecipient) return;

    const transferAmount = parseInt(amount);
    
    if (isNaN(transferAmount) || transferAmount < minTransfer) {
      setError(`Minimum transfer is ${formatAmount(minTransfer)} credits`);
      return;
    }
    
    if (transferAmount > currentBalance) {
      setError('Insufficient balance');
      return;
    }

    if (selectedRecipient.id === user.id) {
      setError("You can't transfer credits to yourself");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await axios.post(
        `${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/transfer`,
        {
          recipientId: selectedRecipient.id,
          amount: transferAmount
        }
      );

      onSuccess();
    } catch (err: any) {
      console.error('Transfer error:', err);
      setError(err.response?.data?.message || 'Failed to process transfer');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US').format(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-casino-dark rounded-xl p-6 w-full max-w-md border border-casino-accent/20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center">
            🔄 Transfer Credits
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <div className="mb-4 bg-casino-darker/50 rounded-lg p-4">
          <p className="text-gray-300 text-sm">Available Balance</p>
          <p className="text-2xl font-bold text-casino-gold">
            {formatAmount(currentBalance)}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Recipient Search */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Send To</h3>
          <div className="relative">
            <input
              type="text"
              value={recipientSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by username..."
              className="w-full bg-casino-darker border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:border-casino-accent focus:outline-none"
            />
            
            {searching && (
              <div className="absolute right-3 top-2.5">
                <div className="animate-spin text-casino-accent">🔄</div>
              </div>
            )}
            
            {/* Search Results */}
            {searchResults.length > 0 && !selectedRecipient && (
              <div className="absolute z-10 w-full mt-1 bg-casino-darker border border-gray-600 rounded-lg shadow-lg">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => selectRecipient(result)}
                    className="w-full px-4 py-3 text-left hover:bg-casino-dark transition-colors flex items-center space-x-3"
                  >
                    {result.avatar ? (
                      <img
                        src={`https://cdn.discordapp.com/avatars/${result.discordId}/${result.avatar}.png`}
                        alt={result.username}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-casino-accent flex items-center justify-center">
                        <span className="text-white text-sm font-bold">
                          {result.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="text-white font-medium">{result.username}</p>
                      <p className="text-gray-400 text-sm">#{result.discriminator}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Recipient */}
          {selectedRecipient && (
            <div className="mt-3 bg-casino-accent/20 border border-casino-accent/40 rounded-lg p-3 flex items-center space-x-3">
              {selectedRecipient.avatar ? (
                <img
                  src={`https://cdn.discordapp.com/avatars/${selectedRecipient.discordId}/${selectedRecipient.avatar}.png`}
                  alt={selectedRecipient.username}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-casino-accent flex items-center justify-center">
                  <span className="text-white font-bold">
                    {selectedRecipient.username.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <p className="text-white font-medium">{selectedRecipient.username}</p>
                <p className="text-gray-300 text-sm">#{selectedRecipient.discriminator}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedRecipient(null);
                  setRecipientSearch('');
                }}
                className="ml-auto text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Transfer Amount */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Amount</h3>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Enter amount (min ${formatAmount(minTransfer)})`}
            className="w-full bg-casino-darker border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:border-casino-accent focus:outline-none"
            min={minTransfer}
            max={currentBalance}
          />
        </div>

        {/* Transfer Fee Notice */}
        {amount && !isNaN(parseInt(amount)) && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-6">
            <div className="flex items-center space-x-2">
              <span className="text-yellow-500">ℹ️</span>
              <div>
                <p className="text-yellow-500 text-sm font-medium">Transfer Details</p>
                <p className="text-gray-300 text-xs">
                  Amount to send: {formatAmount(parseInt(amount))} credits
                </p>
                <p className="text-gray-300 text-xs">
                  Transfer fee: Free (limited time)
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
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleTransfer}
            disabled={loading || !amount || !selectedRecipient || parseInt(amount) < minTransfer}
            className="flex-1 bg-casino-accent hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send Credits'}
          </button>
        </div>

        {loading && (
          <div className="absolute inset-0 bg-casino-dark/50 rounded-xl flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin text-4xl mb-2">🔄</div>
              <p className="text-white">Processing transfer...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransferModal;