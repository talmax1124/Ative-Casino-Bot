import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import SquarePaymentForm from '../Payment/SquarePaymentForm';
import axios from 'axios';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface CreditPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreditPurchaseModal: React.FC<CreditPurchaseModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [selectedPackage, setSelectedPackage] = useState<{credits: number, price: number} | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showSuccessPanel, setShowSuccessPanel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceBefore, setBalanceBefore] = useState<number>(0);
  const [balanceAfter, setBalanceAfter] = useState<number>(0);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState<boolean>(false);

  // Premium Credits packages - higher value, used for shop items
  const creditPackages = [
    { credits: 1000, price: 9.99, label: 'Starter Pack' },
    { credits: 5000, price: 39.99, label: 'Great Value' },
    { credits: 10000, price: 69.99, label: 'Premium Pack' },
    { credits: 25000, price: 149.99, label: 'VIP Package' }
  ];

  // Fetch current balance when modal opens
  useEffect(() => {
    const fetchBalance = async () => {
      if (isOpen && user?.id) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.id));
          const balance = userDoc.exists() ? (userDoc.data()?.credits || 0) : 0;
          setCurrentBalance(balance);
          console.log(`Current balance for ${user.id}: ${balance}`);
        } catch (err: any) {
          console.error('Error fetching balance:', err);
          if (err.code === 8 || err.message?.includes('Quota exceeded')) {
            setError('Firestore quota exceeded. Please try again later.');
          } else {
            setCurrentBalance(0); // Default to 0 on other errors
          }
        }
      }
    };
    fetchBalance();
  }, [isOpen, user]);

  const handlePackageSelect = (pkg: {credits: number, price: number}) => {
    setSelectedPackage(pkg);
    setShowPaymentForm(true);
    setError(null);
  };

  const handlePaymentSuccess = async (paymentResult: any) => {
    try {
      console.log('💳 Payment success received:', paymentResult);
      setLoading(true);
      
      if (!user?.id || !selectedPackage) {
        console.error('Missing user or package:', { userId: user?.id, package: selectedPackage });
        setError('User or package information missing');
        return;
      }

      console.log(`💰 Processing purchase: ${selectedPackage.credits} credits for $${selectedPackage.price}`);

      // Store balance before
      const beforeBalance = currentBalance;
      setBalanceBefore(beforeBalance);
      console.log(`📊 Balance before: ${beforeBalance}`);

      // Update user's balance using web API (handles Firestore/MongoDB fallback automatically)
      try {
        console.log('🔄 Updating balance via web API...');
        const response = await axios.post('http://localhost:5001/api/users/update-balance', {
          userId: user.id,
          credits: selectedPackage.credits,
          operation: 'add',
          source: 'credit_purchase',
          paymentId: paymentResult.paymentId || `sim_${Date.now()}`
        });

        if (response.data.success) {
          console.log('✅ Balance updated successfully via web API');
          if (response.data.warnings) {
            console.warn('⚠️ Some warnings during update:', response.data.warnings);
            setIsQuotaExceeded(true);
          }
        } else {
          throw new Error(response.data.error || 'Balance update failed');
        }
      } catch (apiErr: any) {
        console.warn('⚠️ Web API update failed, storing locally:', apiErr);
        setIsQuotaExceeded(true);
        
        // Store purchase locally when API fails
        const localPurchases = JSON.parse(localStorage.getItem('pendingPurchases') || '[]');
        localPurchases.push({
          userId: user.id,
          credits: selectedPackage.credits,
          timestamp: new Date().toISOString(),
          paymentId: paymentResult.paymentId || `sim_${Date.now()}`
        });
        localStorage.setItem('pendingPurchases', JSON.stringify(localPurchases));
        console.log('💾 Purchase stored locally for later sync');
      }

      // Calculate and store balance after
      const afterBalance = beforeBalance + selectedPackage.credits;
      setBalanceAfter(afterBalance);
      setCurrentBalance(afterBalance);
      console.log(`📊 Balance after: ${afterBalance}`);

      // Send Discord notification
      try {
        console.log('📢 Sending Discord notification...');
        const response = await axios.post('http://localhost:5001/api/discord/notify-purchase', {
          userId: user.id,
          username: user.username || 'Unknown User',
          credits: selectedPackage.credits,
          amount: selectedPackage.price,
          channelId: '1403244656845787170'
        });
        console.log('✅ Discord notification sent:', response.data);
      } catch (notifyErr) {
        console.error('❌ Failed to send Discord notification:', notifyErr);
        // Don't fail the purchase if notification fails
      }

      // Show success panel
      setShowPaymentForm(false);
      setShowSuccessPanel(true);
      console.log('🎉 Purchase completed successfully!');
      
      // Call parent success handler after delay
      setTimeout(() => {
        onSuccess();
      }, 5000);
    } catch (err: any) {
      console.error('❌ Credit purchase error:', err);
      setError(err.message || 'Failed to complete credit purchase');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentError = (error: string) => {
    setError(error);
    setLoading(false);
  };

  const handleBackToPackageSelection = () => {
    setShowPaymentForm(false);
    setSelectedPackage(null);
    setError(null);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US').format(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-casino-dark rounded-xl p-6 w-full max-w-lg border border-casino-accent/20 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center">
            💎 Buy Premium Credits
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

        {showSuccessPanel ? (
          // Success Panel
          <div className="text-center space-y-6">
            <div className="text-6xl animate-bounce">✅</div>
            
            <h3 className="text-2xl font-bold text-green-400">
              Purchase Successful!
            </h3>
            
            <div className="bg-casino-darker/50 rounded-lg p-6 space-y-4">
              <p className="text-gray-300">You have successfully purchased</p>
              <p className="text-3xl font-bold text-casino-gold">
                {selectedPackage ? formatAmount(selectedPackage.credits) : 0} Credits
              </p>
              <p className="text-gray-400">for ${selectedPackage?.price}</p>
            </div>

            <div className="bg-casino-accent/10 border border-casino-accent/20 rounded-lg p-4 space-y-3">
              <h4 className="text-lg font-semibold text-white">Balance Update</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Before</p>
                  <p className="text-xl font-bold text-red-400">
                    💎 {formatAmount(balanceBefore)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">After</p>
                  <p className="text-xl font-bold text-green-400">
                    💎 {formatAmount(balanceAfter)}
                  </p>
                </div>
              </div>
              
              <div className="pt-2 border-t border-casino-accent/20">
                <p className="text-casino-accent font-semibold">
                  + {formatAmount(selectedPackage?.credits || 0)} Credits Added!
                </p>
              </div>
            </div>

            {isQuotaExceeded && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
                <div className="flex items-start space-x-2">
                  <span className="text-yellow-400">⚠️</span>
                  <div>
                    <p className="text-yellow-400 font-medium text-sm">Database Quota Exceeded</p>
                    <p className="text-gray-300 text-xs mt-1">
                      Your purchase was successful, but credits may take a few minutes to appear. 
                      They have been stored locally and will sync automatically.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="text-gray-400 text-sm">
              <p>Transaction has been logged to Discord</p>
              <p className="text-xs mt-1">Channel #1403244656845787170</p>
            </div>

            <button
              onClick={() => {
                setShowSuccessPanel(false);
                onClose();
              }}
              className="w-full bg-casino-green hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Continue Shopping 🛍️
            </button>
          </div>
        ) : showPaymentForm && selectedPackage ? (
          <div>
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handleBackToPackageSelection}
                className="flex items-center space-x-2 text-casino-accent hover:text-purple-400 transition-colors"
              >
                <span>←</span>
                <span>Back to Packages</span>
              </button>
              <div className="text-white font-semibold">
                {formatAmount(selectedPackage.credits)} Credits (${selectedPackage.price})
              </div>
            </div>
            <SquarePaymentForm
              amount={selectedPackage.price}
              onPaymentSuccess={handlePaymentSuccess}
              onPaymentError={handlePaymentError}
              loading={loading}
            />
          </div>
        ) : (
          <div>
            {/* Package Selection */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Choose Your Premium Credits Package</h3>
              <p className="text-gray-300 text-sm mb-4">
                Premium Credits are used to purchase exclusive shop items, cosmetics, and special features.
              </p>
              
              <div className="grid grid-cols-1 gap-3">
                {creditPackages.map((pkg) => (
                  <button
                    key={pkg.credits}
                    onClick={() => handlePackageSelect(pkg)}
                    disabled={loading}
                    className="bg-casino-accent/10 hover:bg-casino-accent/20 border border-casino-accent/30 hover:border-casino-accent/50 text-white font-semibold py-4 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <div className="text-xl font-bold text-casino-accent">
                          {formatAmount(pkg.credits)} Credits
                        </div>
                        <div className="text-sm text-gray-400">{pkg.label}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-casino-accent">${pkg.price}</div>
                        <div className="text-xs text-gray-400">
                          {(pkg.credits / pkg.price).toFixed(0)} credits per $1
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Security Notice */}
            <div className="bg-casino-accent/10 border border-casino-accent/20 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-2">
                <div className="text-casino-accent text-lg">🔒</div>
                <div>
                  <p className="text-casino-accent font-medium text-sm">Secure Payment</p>
                  <p className="text-gray-300 text-xs">
                    All transactions are processed securely through Square. Premium Credits will be added to your account immediately.
                  </p>
                </div>
              </div>
            </div>

            {/* Cancel Button */}
            <button
              onClick={onClose}
              disabled={loading}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}

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

export default CreditPurchaseModal;