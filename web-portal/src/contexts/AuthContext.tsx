import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthContextType } from '../types';
import { auth } from '../config/firebase';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import axios from 'axios';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const loginInProgress = React.useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // If we already have user data from login, don't override it
        if (user && user.id) {
          console.log('🔄 Firebase auth state changed, keeping existing user data:', user.username);
          setLoading(false);
          return;
        }

        // Try to get the Discord user ID from Firebase custom claims
        const token = await firebaseUser.getIdTokenResult();
        const discordId = token.claims.discord_id;
        
        if (discordId) {
          try {
            console.log('🔄 Fetching user data for Discord ID:', discordId);
            const response = await axios.get(`${process.env.REACT_APP_API_BASE_URL}/users/${discordId}`);
            setUser(response.data);
          } catch (error) {
            console.error('Error fetching user data from Discord ID:', error);
            // Keep user as null if we can't fetch data
            setUser(null);
          }
        } else {
          console.warn('⚠️ No Discord ID found in Firebase token claims');
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]); // Add user as dependency

  const login = async (code: string): Promise<void> => {
    // Prevent duplicate login attempts with the same code
    if (loginInProgress.current === code) {
      console.log('🔒 Login already in progress with this code, skipping duplicate request');
      return;
    }

    try {
      console.log('🚀 Starting login process with code:', code.substring(0, 10) + '...');
      loginInProgress.current = code;
      setLoading(true);
      
      // Exchange Discord code for user info and custom token
      const response = await axios.post(`${process.env.REACT_APP_API_BASE_URL}/auth/discord`, {
        code,
        redirectUri: process.env.REACT_APP_DISCORD_REDIRECT_URI
      });

      const { customToken, user: userData } = response.data;

      // Sign in with custom token
      await signInWithCustomToken(auth, customToken);
      
      // Set user data
      setUser(userData);
      
      console.log('✅ Login successful for user:', userData.username);
    } catch (error) {
      console.error('❌ Login error:', error);
      loginInProgress.current = null; // Reset on error so retry is possible
      throw new Error('Failed to login with Discord');
    } finally {
      setLoading(false);
      // Keep loginInProgress set to prevent duplicate attempts with same code
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};