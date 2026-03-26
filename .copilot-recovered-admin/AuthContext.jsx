
import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [activeStoreId, setActiveStoreId] = useState(null);
  const [availableStores, setAvailableStores] = useState([]);
  const [loading, setLoading] = useState(true); // Add loading state for initial check

  useEffect(() => {
    // Check for a token on initial app load to keep the user logged in
    const token = localStorage.getItem('accessToken');
    const storedUser = localStorage.getItem('user');
    const storedStoreId = localStorage.getItem('activeStoreId');

    const isExpired = (() => {
      try {
        const p = token ? token.split('.')[1] : '';
        if (!p) return false;
        const json = JSON.parse(atob(p));
        if (!json || typeof json.exp !== 'number') return false;
        return Date.now() >= (json.exp * 1000);
      } catch { return false; }
    })();

    if (token && storedUser && !isExpired) {
      try {
        setUser(JSON.parse(storedUser));
        if (storedStoreId) {
            setActiveStoreId(Number(storedStoreId));
        }
      } catch (e) {
        // Handle potential parsing error
        localStorage.clear();
      }
    }
    if (isExpired) {
      try {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        localStorage.removeItem('activeStoreId');
      } catch {}
    }
    // Optional: verify session with backend to refresh roles/profile (disabled by default)
    const ENABLE_VERIFY = (import.meta.env?.VITE_ENABLE_AUTH_VERIFY ?? 'false') === 'true';
    const VERIFY_PATH = import.meta.env?.VITE_AUTH_VERIFY_PATH || '/api/auth/verify';
    const VERIFY_METHOD = (import.meta.env?.VITE_AUTH_VERIFY_METHOD || 'GET').toLowerCase();
    const verifySession = async () => {
      if (!token || !ENABLE_VERIFY) { setLoading(false); return; }
      try {
        const res = await api[VERIFY_METHOD](VERIFY_PATH);
        if (res?.data) {
          setUser(res.data);
          try { localStorage.setItem('user', JSON.stringify(res.data)); } catch {}
          
          // Re-sync store ID if valid
          const currentStoreId = Number(localStorage.getItem('activeStoreId'));
          if (currentStoreId) setActiveStoreId(currentStoreId);
        }
      } catch (_) {
        // Let the response interceptor handle 401 (logout) if verification is enabled
      } finally {
        setLoading(false);
      }
    };
    verifySession();
  }, []);

  // Fetch available stores whenever user is set and has appropriate roles
  useEffect(() => {
    if (user && (Array.isArray(user.roles) && (user.roles.includes('VENDOR') || user.roles.includes('STAFF')))) {
        api.get('/api/vendor/me/stores')
            .then(res => {
                const stores = Array.isArray(res.data) ? res.data : [];
                setAvailableStores(stores);
                
                // Auto-select if none selected or invalid
                const currentId = localStorage.getItem('activeStoreId');
                if (stores.length > 0) {
                    // checks if currentId is valid for this user
                    const valid = currentId && stores.find(s => s.vendorId == currentId);
                    if (!valid) {
                         const def = stores[0];
                         localStorage.setItem('activeStoreId', def.vendorId);
                         setActiveStoreId(def.vendorId);
                    }
                }
            })
            .catch((err) => {
                console.error('Failed to fetch stores', err);
                setAvailableStores([]);
            });
    }
  }, [user]);

  const login = (userData, token, storeId) => {
    // 1. Save the token and user data to localStorage
    localStorage.setItem('accessToken', token);
    localStorage.setItem('user', JSON.stringify(userData));
    if (storeId) {
        localStorage.setItem('activeStoreId', storeId);
        setActiveStoreId(storeId);
    } else {
        localStorage.removeItem('activeStoreId');
        setActiveStoreId(null);
    }

    // 2. Update the state
    setUser(userData);
  };

  const logout = () => {
    // 1. Clear data from localStorage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    localStorage.removeItem('activeStoreId');

    // 2. Update the state
    setUser(null);
    setActiveStoreId(null);
    
    // Optional: Redirect to login page
    window.location.href = '/';
  };

  const switchStore = (storeId) => {
      localStorage.setItem('activeStoreId', storeId);
      setActiveStoreId(storeId);
      // Force reload to apply new context globally if needed, or just let state propagate
      window.location.reload(); 
  };

  const value = {
    user,
    activeStoreId,
    availableStores,
    isAuthenticated: !!user,
    loading,
    login,
    logout,
    switchStore
  };

  // Don't render children until the initial token check is complete
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// Custom hook to easily use the context
// (already exported below, so remove this duplicate)
export const useAuth = () => useContext(AuthContext);
