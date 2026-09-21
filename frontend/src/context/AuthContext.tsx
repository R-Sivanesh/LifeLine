import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Driver, UserRole } from '../types';

interface AuthContextType {
  user: Driver | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: Driver, token: string) => void;
  logout: () => void;
  isAuthModalOpen: boolean;
  authModalRole?: UserRole;
  openAuthModal: (role?: UserRole) => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Driver | null>(() => {
    try {
      const saved = localStorage.getItem('lifeline_driver_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('lifeline_driver_token') || null;
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalRole, setAuthModalRole] = useState<UserRole | undefined>(undefined);

  const login = (newUser: Driver, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem('lifeline_driver_profile', JSON.stringify(newUser));
    localStorage.setItem('lifeline_driver_token', newToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('lifeline_driver_profile');
    localStorage.removeItem('lifeline_driver_token');
  };

  const openAuthModal = (role?: UserRole) => {
    setAuthModalRole(role);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        login,
        logout,
        isAuthModalOpen,
        authModalRole,
        openAuthModal,
        closeAuthModal
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
