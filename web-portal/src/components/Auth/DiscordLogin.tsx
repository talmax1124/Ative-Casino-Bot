import React from 'react';

const DiscordLogin: React.FC = () => {
  const handleDiscordLogin = () => {
    const clientId = process.env.REACT_APP_DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.REACT_APP_DISCORD_REDIRECT_URI || '');
    const scope = encodeURIComponent('identify email');
    const responseType = 'code';
    
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=${responseType}&scope=${scope}`;
    
    window.location.href = discordAuthUrl;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-casino-gradient">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center items-center mb-6">
            <div className="text-6xl animate-pulse-slow">🎰</div>
          </div>
          
          <h2 className="mt-6 text-4xl font-extrabold text-white">
            Welcome to
          </h2>
          <h1 className="text-5xl font-bold text-casino-gold mb-2">
            ATIVE CASINO
          </h1>
          <p className="text-gray-300 text-lg">
            Your premier online casino experience
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <div className="bg-casino-dark/50 backdrop-blur-lg rounded-xl p-6 border border-casino-accent/20">
            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-white mb-2">
                Sign in to get started
              </h3>
              <p className="text-gray-400 text-sm">
                Connect with your Discord account to access your casino profile
              </p>
            </div>

            <button
              onClick={handleDiscordLogin}
              className="group relative w-full flex justify-center py-4 px-4 border border-transparent text-lg font-medium rounded-lg text-white bg-[#5865F2] hover:bg-[#4752C4] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5865F2] transition-all duration-200 transform hover:scale-105 focus:scale-105"
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-4">
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </span>
              Continue with Discord
            </button>

            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500">
                By signing in, you agree to our Terms of Service and Privacy Policy
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-casino-dark/30 rounded-lg p-4">
              <div className="text-2xl mb-2">🎲</div>
              <p className="text-sm text-gray-300">Multiple Games</p>
            </div>
            <div className="bg-casino-dark/30 rounded-lg p-4">
              <div className="text-2xl mb-2">🏆</div>
              <p className="text-sm text-gray-300">Leaderboards</p>
            </div>
            <div className="bg-casino-dark/30 rounded-lg p-4">
              <div className="text-2xl mb-2">💰</div>
              <p className="text-sm text-gray-300">Real Rewards</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscordLogin;