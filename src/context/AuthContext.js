import React, { createContext, useState, useEffect, useContext } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext({
  session: null,
  role: null,
  isLoading: true,
  loginDriver: async () => {},
  loginAdmin: async () => {},
  logout: async () => {}
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authService.getStoredSession()
      .then((stored) => {
        if (stored) {
          setSession(stored);
        }
      })
      .catch((err) => {
        console.warn('[AuthContext] Session load error:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const verifyPin = async (pin, optBus = null) => {
    const s = await authService.verifyPin(pin, optBus);
    setSession(s);
    return s;
  };

  const loginDriver = async (busNumber, pin) => {
    const s = await authService.driverLogin(busNumber, pin);
    setSession(s);
    return s;
  };

  const loginAdmin = async (passphrase) => {
    const s = await authService.adminLogin(passphrase);
    setSession(s);
    return s;
  };

  const logout = async (keepSharing = false) => {
    await authService.logout(keepSharing);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        role: session?.role || null,
        isLoading,
        verifyPin,
        loginDriver,
        loginAdmin,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
