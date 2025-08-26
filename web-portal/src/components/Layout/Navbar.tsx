import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [userStats, setUserStats] = useState<any>(null);

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: '🏠' },
    { name: 'Leaderboards', href: '/leaderboards', icon: '🏆' },
    { name: 'Shop', href: '/shop', icon: '🛒' },
    { name: 'My Items', href: '/items', icon: '📦' },
    { name: 'Transactions', href: '/transactions', icon: '💳' },
  ];

  useEffect(() => {
    const fetchUserStats = async () => {
      if (!user) return;

      try {
        const response = await axios.get(`${process.env.REACT_APP_API_BASE_URL}/users/${user.id}/stats`);
        setUserStats(response.data);
      } catch (error) {
        console.error('Error fetching user stats:', error);
      }
    };

    fetchUserStats();
  }, [user]);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = () => {
    logout();
    setIsMenuOpen(false);
  };

  const formatBalance = (balance: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(balance);
  };

  return (
    <nav className="bg-casino-dark shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            {/* Logo */}
            <Link to="/dashboard" className="flex-shrink-0 flex items-center">
              <div className="text-2xl font-bold text-casino-gold">🎰</div>
              <span className="ml-2 text-xl font-bold text-white">ATIVE CASINO</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:ml-6 md:flex md:space-x-8">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200 ${
                    isActive(item.href)
                      ? 'border-casino-gold text-casino-gold'
                      : 'border-transparent text-gray-300 hover:border-gray-300 hover:text-white'
                  }`}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.name}
                </Link>
              ))}
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center">
            {user && userStats && (
              <div className="hidden md:flex items-center space-x-2 mr-4">
                {/* Casino Coins */}
                <div className="bg-casino-gold px-3 py-1 rounded-lg">
                  <span className="text-sm font-semibold text-casino-dark">
                    🪙 {formatBalance(userStats.totalBalance || 0)}
                  </span>
                </div>
                {/* Premium Credits */}
                <div className="bg-casino-accent px-3 py-1 rounded-lg">
                  <span className="text-sm font-semibold text-white">
                    💎 {formatBalance(userStats.creditsAmount || 0)}
                  </span>
                </div>
              </div>
            )}

            <div className="ml-3 relative">
              <div>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="bg-casino-darker flex text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-casino-accent focus:ring-offset-2 focus:ring-offset-casino-dark"
                  id="user-menu-button"
                  aria-expanded="false"
                  aria-haspopup="true"
                >
                  <span className="sr-only">Open user menu</span>
                  {user?.avatar ? (
                    <img
                      className="h-8 w-8 rounded-full object-cover"
                      src={user.avatar.startsWith('https://') ? user.avatar : `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`}
                      alt={user.username}
                      onError={(e) => {
                        // If image fails to load, hide it and show fallback
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.nextElementSibling) {
                          (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  <div className={`h-8 w-8 rounded-full bg-casino-accent flex items-center justify-center ${user?.avatar ? 'hidden' : ''}`}>
                    <span className="text-sm font-medium text-white">
                      {user?.username?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                </button>
              </div>

              {/* Dropdown menu */}
              {isMenuOpen && (
                <div
                  className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-casino-dark ring-1 ring-black ring-opacity-5 focus:outline-none"
                  role="menu"
                  aria-orientation="vertical"
                  aria-labelledby="user-menu-button"
                  tabIndex={-1}
                >
                  <div className="px-4 py-2 border-b border-gray-600">
                    <p className="text-sm text-white font-medium">{user?.username}</p>
                    <p className="text-xs text-gray-400">#{user?.discriminator}</p>
                  </div>
                  
                  <Link
                    to="/profile"
                    className="block px-4 py-2 text-sm text-gray-300 hover:bg-casino-darker hover:text-white transition-colors"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    👤 Profile
                  </Link>
                  
                  <Link
                    to="/settings"
                    className="block px-4 py-2 text-sm text-gray-300 hover:bg-casino-darker hover:text-white transition-colors"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    ⚙️ Settings
                  </Link>
                  
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-casino-darker hover:text-red-300 transition-colors"
                    role="menuitem"
                  >
                    🚪 Sign out
                  </button>
                </div>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center md:hidden ml-2">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-300 hover:text-white hover:bg-casino-darker focus:outline-none focus:ring-2 focus:ring-inset focus:ring-casino-accent"
                aria-controls="mobile-menu"
                aria-expanded="false"
              >
                <span className="sr-only">Open main menu</span>
                <svg
                  className="block h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden" id="mobile-menu">
          <div className="px-2 pt-2 pb-3 space-y-1 bg-casino-darker">
            {user && (
              <div className="px-3 py-2 border-b border-gray-600 mb-2">
                <div className="flex items-center space-x-3">
                  {user.avatar ? (
                    <img
                      className="h-10 w-10 rounded-full object-cover"
                      src={user.avatar.startsWith('https://') ? user.avatar : `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`}
                      alt={user.username}
                      onError={(e) => {
                        // If image fails to load, hide it and show fallback
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.nextElementSibling) {
                          (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  <div className={`h-10 w-10 rounded-full bg-casino-accent flex items-center justify-center ${user?.avatar ? 'hidden' : ''}`}>
                    <span className="text-sm font-medium text-white">
                      {user.username?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{user.username}</p>
                    {userStats ? (
                      <div className="flex space-x-3 text-xs">
                        <span className="text-casino-gold">🪙 {formatBalance(userStats.totalBalance || 0)}</span>
                        <span className="text-casino-accent">💎 {formatBalance(userStats.creditsAmount || 0)}</span>
                      </div>
                    ) : (
                      <p className="text-sm text-casino-green">💰 {formatBalance(user.balance)}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200 ${
                  isActive(item.href)
                    ? 'text-casino-gold bg-casino-dark'
                    : 'text-gray-300 hover:text-white hover:bg-casino-dark'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                <span className="mr-2">{item.icon}</span>
                {item.name}
              </Link>
            ))}
            
            <div className="border-t border-gray-600 pt-4">
              <Link
                to="/profile"
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-casino-dark transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                👤 Profile
              </Link>
              <Link
                to="/settings"
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-casino-dark transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                ⚙️ Settings
              </Link>
              <button
                onClick={handleLogout}
                className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-red-400 hover:text-red-300 hover:bg-casino-dark transition-colors"
              >
                🚪 Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;