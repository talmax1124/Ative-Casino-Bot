import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Layout/Navbar';
import DiscordLogin from './components/Auth/DiscordLogin';
import AuthCallback from './components/Auth/AuthCallback';
import Dashboard from './components/Dashboard/Dashboard';
import Leaderboards from './components/Leaderboards/Leaderboards';
import Shop from './components/Shop/Shop';
import CurrencyManager from './components/Currency/CurrencyManager';
import './App.css';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-casino-gradient flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin-slow text-6xl mb-4">🎰</div>
          <p className="text-white text-xl">Loading ATIVE Casino...</p>
        </div>
      </div>
    );
  }
  
  return user ? <>{children}</> : <Navigate to="/login" replace />;
};

// Public Route Component (redirect to dashboard if logged in)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-casino-gradient flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin-slow text-6xl mb-4">🎰</div>
          <p className="text-white text-xl">Loading ATIVE Casino...</p>
        </div>
      </div>
    );
  }
  
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>;
};

// Main App Layout
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-casino-gradient">
      <Navbar />
      <main>{children}</main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            {/* Public Routes */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <DiscordLogin />
                </PublicRoute>
              }
            />
            
            <Route path="/auth/callback" element={<AuthCallback />} />
            
            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Dashboard />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/leaderboards"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Leaderboards />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/shop"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Shop />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/transactions"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <CurrencyManager />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            
            {/* Catch all route - redirect to dashboard or login */}
            <Route
              path="/"
              element={<Navigate to="/dashboard" replace />}
            />
            
            {/* 404 Route */}
            <Route
              path="*"
              element={
                <div className="min-h-screen bg-casino-gradient flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🎰</div>
                    <h1 className="text-4xl font-bold text-white mb-2">404</h1>
                    <p className="text-gray-300 mb-6">Page not found</p>
                    <a
                      href="/dashboard"
                      className="bg-casino-accent hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                    >
                      Return to Dashboard
                    </a>
                  </div>
                </div>
              }
            />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
