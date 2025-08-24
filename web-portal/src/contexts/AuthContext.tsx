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

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Fetch user data from your backend
          const response = await axios.get(`${process.env.REACT_APP_API_BASE_URL}/users/${firebaseUser.uid}`);
          setUser(response.data);
        } catch (error) {
          console.error('Error fetching user data:', error);
          // If user not found in backend, create new user record
          try {
            const createResponse = await axios.post(`${process.env.REACT_APP_API_BASE_URL}/users`, {
              firebaseUid: firebaseUser.uid,
              email: firebaseUser.email
            });
            setUser(createResponse.data);
          } catch (createError) {
            console.error('Error creating user:', createError);
            setUser(null);
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (code: string): Promise<void> => {
    try {
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
    } catch (error) {
      console.error('Login error:', error);
      throw new Error('Failed to login with Discord');
    } finally {
      setLoading(false);
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