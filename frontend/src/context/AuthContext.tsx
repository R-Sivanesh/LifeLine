import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Driver, UserRole } from '../types';

export type AuthStatus = 'AUTH_LOADING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'AUTH_ERROR';

interface AuthContextType {
  user: Driver | null;
  token: string | null;
  isAuthenticated: boolean;
  authStatus: AuthStatus;
  isLoading: boolean;
  login: (user: Driver, token: string) => void;
  logout: () => void;
  isAuthModalOpen: boolean;
  authModalRole?: UserRole;
  openAuthModal: (role?: UserRole) => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<Driver | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalRole, setAuthModalRole] = useState<UserRole | undefined>(undefined);

  // Initialize session state on mount
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('lifeline_driver_token');
      const savedProfile = localStorage.getItem('lifeline_driver_profile');
      if (savedToken && savedProfile) {
        const parsed = JSON.parse(savedProfile);
        // Normalize role if stored as HOSPITAL -> HOSPITAL_STAFF
        if (parsed.role === 'HOSPITAL') {
          parsed.role = 'HOSPITAL_STAFF';
        }
        setUser(parsed);
        setToken(savedToken);
      }
    } catch (e) {
      console.warn('Session parse notice:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (newUser: Driver, newToken: string) => {
    const normalized = { ...newUser };
    if ((normalized.role as string) === 'HOSPITAL') {
      normalized.role = 'HOSPITAL_STAFF';
    }
    setUser(normalized);
    setToken(newToken);
    localStorage.setItem('lifeline_driver_profile', JSON.stringify(normalized));
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

  const authStatus: AuthStatus = isLoading
    ? 'AUTH_LOADING'
    : user && token
    ? 'AUTHENTICATED'
    : 'UNAUTHENTICATED';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        authStatus,
        isLoading,
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
