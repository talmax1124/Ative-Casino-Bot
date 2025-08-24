# ATIVE Casino Web Portal

A modern, responsive web portal for the ATIVE Casino Discord bot built with React, TypeScript, and Tailwind CSS.

## 🎰 Features

- **Discord OAuth Authentication**: Secure login with Discord accounts
- **User Dashboard**: Overview of stats, recent activities, and quick actions
- **Leaderboards**: Real-time rankings for balance, winnings, games played, and win rates
- **In-Game Currency Management**: Deposit, withdraw, and transfer credits
- **Shop System**: Purchase game boosts, cosmetics, and premium items
- **Square Payment Integration**: Secure credit card payments
- **Real-Time Updates**: Live data synchronization with the bot
- **Responsive Design**: Optimized for desktop and mobile devices
- **Firebase Backend**: Real-time database and authentication

## 🚀 Technologies Used

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Authentication**: Firebase Auth + Discord OAuth
- **Database**: Firebase Firestore
- **Payment Processing**: Square API
- **Routing**: React Router v7
- **HTTP Client**: Axios
- **Styling**: Tailwind CSS with custom casino theme

## 📦 Installation

### Prerequisites

- Node.js 16+ and npm
- Discord Application (for OAuth)
- Firebase Project (ativecasino)
- Square Developer Account

### Setup

1. **Clone the repository**:
   ```bash
   git clone [repository-url]
   cd web-portal
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Configuration**:
   Create a `.env` file in the root directory:
   ```env
   # Discord OAuth
   REACT_APP_DISCORD_CLIENT_ID=your_discord_client_id
   REACT_APP_DISCORD_REDIRECT_URI=http://localhost:3000/auth/callback

   # Firebase Configuration (ATIVE Casino Production)
   REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
   REACT_APP_FIREBASE_AUTH_DOMAIN=ativecasino.firebaseapp.com
   REACT_APP_FIREBASE_PROJECT_ID=ativecasino
   REACT_APP_FIREBASE_STORAGE_BUCKET=ativecasino.appspot.com
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
   REACT_APP_FIREBASE_APP_ID=your_firebase_app_id

   # Square Payment
   REACT_APP_SQUARE_APPLICATION_ID=your_square_application_id
   REACT_APP_SQUARE_LOCATION_ID=your_square_location_id

   # API URLs
   REACT_APP_API_BASE_URL=http://localhost:3001/api

   # Environment
   REACT_APP_ENVIRONMENT=development
   ```

## Available Scripts

### `npm start`
Runs the app in development mode. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `npm test`
Launches the test runner in interactive watch mode.

### `npm run build`
Builds the app for production to the `build` folder with optimized bundles.

## 🏗️ Project Structure

```
src/
├── components/           # React components
│   ├── Auth/            # Authentication components
│   ├── Currency/        # Currency management
│   ├── Dashboard/       # Dashboard components
│   ├── Layout/          # Layout components
│   ├── Leaderboards/    # Leaderboard displays
│   ├── Payment/         # Square payment integration
│   └── Shop/            # Shop system
├── contexts/            # React contexts
│   └── AuthContext.tsx  # Authentication context
├── types/               # TypeScript type definitions
├── utils/               # Utility functions
├── config/              # Configuration files
└── App.tsx              # Main application component
```

## 🎨 Design System

### Color Palette
- **Casino Red**: #DC2626
- **Casino Green**: #16A34A  
- **Casino Gold**: #F59E0B
- **Casino Dark**: #1F2937
- **Casino Darker**: #111827
- **Casino Accent**: #8B5CF6

## 🔐 Firebase Configuration

The web portal uses the ATIVE Casino Firebase project with the following configuration:

```javascript
const firebaseConfig = {
  projectId: "ativecasino",
  authDomain: "ativecasino.firebaseapp.com",
  storageBucket: "ativecasino.appspot.com",
  // ... other config values
};
```

### Firebase Admin SDK (Backend)
For backend operations, use these credentials:
- **Project ID**: `ativecasino`
- **Private Key**: See environment configuration
- **Client Email**: `firebase-adminsdk-fbsvc@ativecasino.iam.gserviceaccount.com`

### Required Firebase Services
1. **Authentication**: Enable Discord OAuth provider
2. **Firestore Database**: For user data, transactions, shop items
3. **Storage**: For user avatars and assets (optional)

## 🚢 Deployment

### Development
```bash
npm start
```

### Production Build
```bash
npm run build
```

### Deploy to Vercel
```bash
npm install -g vercel
vercel --prod
```

### Deploy to Netlify
```bash
npm run build
# Upload the build/ folder to Netlify
```

## 🔧 Configuration

### Discord OAuth Setup
1. Create Discord application at https://discord.com/developers/applications
2. Add OAuth2 redirect URI: `https://yourdomain.com/auth/callback`
3. Copy Client ID to environment variables
4. Enable Discord provider in Firebase Auth

### Square Payment Setup
1. Create Square developer account
2. Create application and get credentials
3. Configure webhook endpoints for payment confirmations
4. Set up proper HTTPS endpoints for production

## 🐛 Troubleshooting

### Common Issues

1. **Authentication Fails**:
   - Verify Discord OAuth redirect URI matches exactly
   - Check Firebase Auth Discord provider configuration
   - Ensure environment variables are set correctly

2. **Firebase Connection Issues**:
   - Verify project ID is "ativecasino"
   - Check Firebase configuration object
   - Ensure Firestore rules allow read/write for authenticated users

3. **Payment Processing Fails**:
   - Verify Square credentials and environment (sandbox vs production)
   - Check HTTPS requirement for Square API
   - Ensure webhook endpoints are configured

## 📱 Features Overview

### Dashboard
- Real-time balance display
- Game statistics and performance charts
- Recent transaction history
- Quick action buttons for common tasks

### Leaderboards
- Multiple ranking categories
- Podium display for top performers
- Filterable and searchable player lists
- Server-wide statistics

### Currency Management
- Secure deposits via Square payments
- Withdrawal requests to PayPal
- User-to-user credit transfers
- Comprehensive transaction history

### Shop System
- Categorized items (boosts, cosmetics, premium)
- Detailed item previews with benefits
- Shopping cart and checkout process
- Purchase confirmation and receipt system

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

**Built with ❤️ for the ATIVE Casino community**
