import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(false);
  const [autoPlaySounds, setAutoPlaySounds] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState('en');

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('casinoSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setNotifications(settings.notifications ?? true);
      setEmailUpdates(settings.emailUpdates ?? false);
      setAutoPlaySounds(settings.autoPlaySounds ?? true);
      setTheme(settings.theme ?? 'dark');
      setLanguage(settings.language ?? 'en');
    }
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    const settings = {
      notifications,
      emailUpdates,
      autoPlaySounds,
      theme,
      language
    };
    localStorage.setItem('casinoSettings', JSON.stringify(settings));
  }, [notifications, emailUpdates, autoPlaySounds, theme, language]);

  const handleDeleteAccount = () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete your account? This action cannot be undone and you will lose all your progress, items, and balances.'
    );
    
    if (confirmed) {
      const doubleConfirm = window.confirm(
        'This is your final warning. Your account and all data will be permanently deleted. Are you absolutely sure?'
      );
      
      if (doubleConfirm) {
        alert('Account deletion is not yet implemented. Please contact support for account deletion requests.');
      }
    }
  };

  const exportData = async () => {
    try {
      // This would normally fetch user data from the API
      const userData = {
        user: user,
        exportDate: new Date().toISOString(),
        note: 'Complete data export from ATIVE Casino'
      };
      
      const dataStr = JSON.stringify(userData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `ative-casino-data-${user?.id}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export data. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-casino-gradient p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            ⚙️ Settings
          </h1>
          <p className="text-gray-300">
            Customize your casino experience
          </p>
        </div>

        <div className="space-y-6">
          {/* Account Settings */}
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
            <h2 className="text-2xl font-bold text-white mb-4">👤 Account Settings</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-casino-darker/50 rounded-lg">
                <div>
                  <h3 className="text-white font-medium">Discord Account</h3>
                  <p className="text-gray-400 text-sm">Connected as {user?.username}#{user?.discriminator}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                    Connected
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-casino-darker/50 rounded-lg">
                <div>
                  <h3 className="text-white font-medium">Two-Factor Authentication</h3>
                  <p className="text-gray-400 text-sm">Add an extra layer of security to your account</p>
                </div>
                <button className="bg-casino-accent hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
                  Coming Soon
                </button>
              </div>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
            <h2 className="text-2xl font-bold text-white mb-4">🔔 Notifications</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">Push Notifications</h3>
                  <p className="text-gray-400 text-sm">Receive notifications about game results and bonuses</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications}
                    onChange={(e) => setNotifications(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-casino-accent"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">Email Updates</h3>
                  <p className="text-gray-400 text-sm">Receive weekly summaries and important updates via email</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailUpdates}
                    onChange={(e) => setEmailUpdates(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-casino-accent"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Game Settings */}
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
            <h2 className="text-2xl font-bold text-white mb-4">🎮 Game Settings</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">Auto-play Sounds</h3>
                  <p className="text-gray-400 text-sm">Play sound effects during games</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoPlaySounds}
                    onChange={(e) => setAutoPlaySounds(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-casino-accent"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">Theme</h3>
                  <p className="text-gray-400 text-sm">Choose your preferred visual theme</p>
                </div>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="bg-casino-darker border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-casino-accent focus:outline-none"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light (Coming Soon)</option>
                  <option value="auto">Auto (Coming Soon)</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">Language</h3>
                  <p className="text-gray-400 text-sm">Select your preferred language</p>
                </div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="bg-casino-darker border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-casino-accent focus:outline-none"
                >
                  <option value="en">English</option>
                  <option value="es">Español (Coming Soon)</option>
                  <option value="fr">Français (Coming Soon)</option>
                  <option value="de">Deutsch (Coming Soon)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Privacy & Data */}
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
            <h2 className="text-2xl font-bold text-white mb-4">🔒 Privacy & Data</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-casino-darker/50 rounded-lg">
                <div>
                  <h3 className="text-white font-medium">Export My Data</h3>
                  <p className="text-gray-400 text-sm">Download a copy of all your account data</p>
                </div>
                <button
                  onClick={exportData}
                  className="bg-casino-accent hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Export Data
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div>
                  <h3 className="text-red-400 font-medium">Delete Account</h3>
                  <p className="text-gray-400 text-sm">Permanently delete your account and all associated data</p>
                </div>
                <button
                  onClick={handleDeleteAccount}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>

          {/* Support */}
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
            <h2 className="text-2xl font-bold text-white mb-4">💬 Support</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-casino-darker/50 rounded-lg text-center">
                <div className="text-2xl mb-2">📚</div>
                <h3 className="text-white font-medium mb-2">Help Center</h3>
                <p className="text-gray-400 text-sm mb-3">Find answers to common questions</p>
                <button className="bg-casino-accent hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
                  Coming Soon
                </button>
              </div>
              
              <div className="p-4 bg-casino-darker/50 rounded-lg text-center">
                <div className="text-2xl mb-2">🎧</div>
                <h3 className="text-white font-medium mb-2">Contact Support</h3>
                <p className="text-gray-400 text-sm mb-3">Get help from our support team</p>
                <button className="bg-casino-accent hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
                  Coming Soon
                </button>
              </div>
            </div>
          </div>

          {/* Sign Out */}
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-medium">Sign Out</h3>
                <p className="text-gray-400 text-sm">Sign out of your account on this device</p>
              </div>
              <button
                onClick={logout}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;