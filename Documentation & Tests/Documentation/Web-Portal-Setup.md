# ATIVE Casino Web Portal - Complete Setup Guide

## 📋 Overview

This guide provides comprehensive setup instructions for the ATIVE Casino Web Portal, including Firebase configuration with the correct credentials, Discord OAuth setup, Square payment integration, and deployment options.

## 🔧 Prerequisites

- Node.js 16+ and npm
- Git
- Discord Developer Account
- Firebase Admin Access to `ativecasino` project
- Square Developer Account (for payments)

## 🚀 Initial Setup

### 1. Clone and Install

```bash
# Navigate to the web-portal directory
cd /path/to/ative_casino_bot/web-portal

# Install dependencies
npm install
```

### 2. Environment Configuration

Create a `.env` file in the web-portal root directory with the following configuration:

```env
# Discord OAuth Configuration
REACT_APP_DISCORD_CLIENT_ID=your_discord_client_id_here
REACT_APP_DISCORD_REDIRECT_URI=http://localhost:3000/auth/callback

# Firebase Configuration (ATIVE Casino Production)
REACT_APP_FIREBASE_API_KEY=your_firebase_web_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=ativecasino.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=ativecasino
REACT_APP_FIREBASE_STORAGE_BUCKET=ativecasino.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
REACT_APP_FIREBASE_APP_ID=your_firebase_app_id

# Square Payment Configuration
REACT_APP_SQUARE_APPLICATION_ID=your_square_application_id
REACT_APP_SQUARE_LOCATION_ID=your_square_location_id

# API Configuration
REACT_APP_API_BASE_URL=http://localhost:3001/api

# Environment
REACT_APP_ENVIRONMENT=development
```

## 🔥 Firebase Configuration

The web portal connects to the existing **ativecasino** Firebase project. Here are the exact credentials:

### Web App Configuration
```javascript
const firebaseConfig = {
  apiKey: "your_web_api_key", // Get from Firebase Console
  authDomain: "ativecasino.firebaseapp.com",
  projectId: "ativecasino",
  storageBucket: "ativecasino.appspot.com",
  messagingSenderId: "your_sender_id", // Get from Firebase Console
  appId: "your_app_id" // Get from Firebase Console
};
```

### Backend/Admin SDK Configuration
For backend operations (Node.js server), use these **EXACT** credentials:

```json
{
  "type": "service_account",
  "project_id": "ativecasino",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDjqrRUPEwxauPZ\nD2bR5/V/zo2+uIAy+073m0KPljZ/EiV4v1lbtxVzy5Qowp0zK5nUlEP7yx7KTKXB\nLy/g0/f931bxwSYJSPQ2ipkz2uztzDag7a3PsfClWFJ+t2wwXFzN3Criq9C7F2Fb\n4fK0S67tIilxYHXvrDUsmIDw594bpJ6ne01GT95ijxojgI0Zp6OKt57fzst7MLks\nC/FBmYcNMhpZsxodOVC1J+USZy8LgCunphL3LGujzDb/TzdjCqCKdz+DmFreUInp\nlqu6KGaj2wXUltpgt2JFfXi+Hkh/f/B0pUgpNRyY0d9BJAizJY01pAeYB8fsfxT9\nd5G1H0nbAgMBAAECggEAJf7TyKkliCvQKeYloUuGj9Vvl5BgKOIDLFS3l5IYtz1W\njp/UsHdON7yWlfTg2mzg5/b0n52nHlkLYsHWyj1mCnMPJhq3l94aj82ywtI7L3ag\n+VuhYePPBzFF10sSXcHUZTDk4V6OX+MHhxee81McNww4AWl5VU4Ws8Ih5tKzoUYX\n7iH3CbYG4BB4W0zh31sQfImHf0/V/qdEmyaUEU6zysu8a/85cOEDNseHDJygCEPQ\nRHCK2SxP9R+enltx6Wvhhlyt5BRqqOmbMMYvCAafIDXCRNenlykWIE8Kcn7uVYql\nmnt1dDq0/4C5VogtCXUcCXzI4AgrBkWnt96Fezw2gQKBgQD35H0knbjF0UCS9pPw\nJEs3eJet+AIZzHa9UlnNO7INyXrRYikoiVRdIexeLSziRQu2dSV/kRYI6jxHH5A1\nbLzpIzzYMfEk07wlYb0N34qMpVRJIQTA2LKsJtRTQx2gLgYbZMH82T+eikco0qob\nZ49nhu10/Huo56WPXzYhHx2tWwKBgQDrHN+KR5htljPA9TaMN8C4JhDp7C4r9Eg5\n16HAaThTjtX/+4OvIGBkGlwZmWOei6/QXkl+0fLsRSD0AXLozdoF8nbF0D9atdtA\nRyvbbfO2O/gRbYHqj3UQVuyVf9a07EIijiwEaXqnZekBms5ugN2+0uQQndcQoDZu\nYDCUWAj9gQKBgQCOtZK53rb94x56vMukJzDKKXmg5LNI6OW+zkb2mRRDTaeQHSO2\nu4C+8QWjnfxF8xvwGXbR/tOhpD+5bllV+Fi1Gt0vVWkPG3ooRyFQeE3J9HAWfZS/\n9MC/zMbVfED08yn+4T2wc91lRxP6U3Usu6zaG9peS/Bg56LvbA+8d65dGwKBgQCA\n1z/A/V8QnsEZusb7rAnWYDXgmubqe2GhIQOo94BAegPX1bLiI3HvKWrTNHWdCpt8\nKk9ISjE/PNrEHI8l+LjDjY189ZPiV8ogvV/RTb3CXbahhkstiRPzsk7P1lCIsPfF\nC/gfKtZmKbi4gmchs0jRK6yDVpvmpoVtkxTMFjpHAQKBgQDCl0/H0jPP8fgCdeLt\n8u6BD1MyTHJwRn0OATgF2Xa/iguo96axVLdg+W0/x9cNwhdDG1ZEiE6YOpNAlJXC\n0qdTYyaE6QZlUQxe069jV2jQueAP89jD+q5jYsVOsn4bAp6Yty20kWxbRtpZJhyM\npwYmHKyAGH4L5Y+v8gNfnQgi8g==\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@ativecasino.iam.gserviceaccount.com"
}
```

### Required Firebase Services Setup

1. **Authentication**
   - Enable Authentication in Firebase Console
   - Add Discord as an OAuth provider
   - Configure Discord OAuth redirect URIs

2. **Firestore Database**
   - Create Firestore database in production mode
   - Set up security rules for authenticated users
   - Create collections: `users`, `transactions`, `shop_items`, `leaderboards`

3. **Security Rules Example**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Transactions are readable by owner
    match /transactions/{transactionId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow write: if false; // Only backend can write transactions
    }
    
    // Shop items are readable by all authenticated users
    match /shop_items/{itemId} {
      allow read: if request.auth != null;
      allow write: if false; // Only admin can modify shop items
    }
    
    // Leaderboards are readable by all
    match /leaderboards/{board} {
      allow read: if request.auth != null;
      allow write: if false; // Only backend updates leaderboards
    }
  }
}
```

## 🎮 Discord OAuth Setup

### 1. Create Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name it "ATIVE Casino Web Portal"
4. Note down the **Application ID** (Client ID)

### 2. Configure OAuth2
1. Go to OAuth2 → General
2. Add redirect URIs:
   - `http://localhost:3000/auth/callback` (development)
   - `https://yourdomain.com/auth/callback` (production)
3. Select scopes: `identify`, `email`

### 3. Firebase Authentication Setup
1. In Firebase Console, go to Authentication → Sign-in method
2. Enable Discord provider
3. Enter Discord Client ID and Client Secret
4. Add authorized domains if needed

## 💳 Square Payment Integration

### 1. Square Developer Setup
1. Create account at [Square Developer](https://developer.squareup.com/)
2. Create new application
3. Get Application ID and Location ID
4. Set up webhooks for payment notifications

### 2. Environment Configuration
```env
# Sandbox for development
REACT_APP_SQUARE_APPLICATION_ID=sandbox-sq0idb-xxxxx
REACT_APP_SQUARE_LOCATION_ID=LXXXXX

# Production values for live deployment
REACT_APP_SQUARE_APPLICATION_ID=sq0idp-xxxxx
REACT_APP_SQUARE_LOCATION_ID=LXXXXX
```

### 3. Webhook Setup
Configure webhooks in Square Dashboard:
- `payment.created`
- `payment.updated` 
- `payment.failed`

Webhook URL: `https://yourdomain.com/api/webhooks/square`

## 🚀 Running the Application

### Development Mode
```bash
npm start
```
Application will run on `http://localhost:3000`

### Production Build
```bash
npm run build
```

### Testing
```bash
npm test
```

## 🌐 Deployment Options

### Option 1: Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Option 2: Netlify
1. Build the application: `npm run build`
2. Upload `build/` folder to Netlify
3. Configure environment variables in Netlify dashboard

### Option 3: Railway
1. Connect GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Railway will auto-deploy on git push

### Option 4: Firebase Hosting
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and init
firebase login
firebase init hosting

# Deploy
npm run build
firebase deploy
```

## 🔧 Backend API Requirements

The web portal requires a backend API server with these endpoints:

### Authentication Endpoints
- `POST /api/auth/discord` - Exchange Discord code for user data
- `POST /api/auth/refresh` - Refresh authentication token

### User Endpoints
- `GET /api/users/:id` - Get user profile
- `GET /api/users/:id/stats` - Get user statistics
- `GET /api/users/:id/transactions` - Get transaction history
- `POST /api/users/:id/transfer` - Transfer credits between users

### Payment Endpoints
- `POST /api/payments/deposit` - Process credit deposits
- `POST /api/payments/withdraw` - Process withdrawal requests
- `POST /api/webhooks/square` - Square payment webhooks

### Shop Endpoints
- `GET /api/shop/items` - Get shop items
- `POST /api/shop/purchase` - Purchase shop item

### Leaderboard Endpoints
- `GET /api/leaderboards/:type` - Get leaderboard data

## 🐛 Troubleshooting

### Common Issues

1. **Firebase Connection Failed**
   ```
   Error: Project ID "ativecasino" not found
   ```
   **Solution**: Verify Firebase configuration and ensure service account has proper permissions

2. **Discord OAuth Error**
   ```
   Invalid redirect URI
   ```
   **Solution**: Ensure redirect URI in Discord app matches exactly (including protocol and port)

3. **Square Payment Errors**
   ```
   Payment processing failed
   ```
   **Solution**: Check Square credentials and ensure HTTPS for production

4. **Build Failures**
   ```
   Module not found
   ```
   **Solution**: Clear node_modules and package-lock.json, then reinstall

### Debug Mode
Enable debug logging by setting:
```env
REACT_APP_DEBUG=true
```

## 📊 Monitoring and Analytics

### Firebase Analytics
Enable Google Analytics in Firebase Console for user behavior tracking

### Error Tracking
Implement error boundary components and integrate with services like:
- Sentry
- LogRocket
- Bugsnag

### Performance Monitoring
- Firebase Performance Monitoring
- Web Vitals tracking
- Lighthouse CI integration

## 🔐 Security Considerations

1. **Environment Variables**
   - Never commit `.env` files to version control
   - Use different credentials for development/production
   - Rotate keys regularly

2. **HTTPS Only**
   - Always use HTTPS in production
   - Configure proper SSL certificates
   - Enable HSTS headers

3. **Content Security Policy**
   ```html
   <meta http-equiv="Content-Security-Policy" 
         content="default-src 'self'; script-src 'self' 'unsafe-inline';">
   ```

4. **Firebase Security Rules**
   - Implement strict database rules
   - Regular security rule audits
   - Enable App Check for additional protection

## 📱 Mobile Considerations

The portal is fully responsive, but consider these mobile optimizations:

1. **PWA Features**
   - Service worker for offline support
   - Web app manifest
   - Add to home screen prompts

2. **Touch Interactions**
   - Larger tap targets (minimum 44px)
   - Swipe gestures for navigation
   - Pull-to-refresh functionality

3. **Performance**
   - Image lazy loading
   - Code splitting by route
   - Bundle size optimization

## 🔄 Updates and Maintenance

### Regular Tasks
1. **Dependencies**: Update npm packages monthly
2. **Security**: Apply security patches promptly
3. **Firebase**: Monitor usage and optimize queries
4. **Square**: Check for API updates and new features

### Backup Strategy
1. **Database**: Regular Firestore backups
2. **Code**: Git repository with proper branching
3. **Environment**: Secure storage of environment variables

---

This setup guide provides everything needed to deploy and maintain the ATIVE Casino Web Portal. For additional support, refer to the individual service documentation or create an issue in the project repository.

**🎰 Happy Gaming! 🎰**