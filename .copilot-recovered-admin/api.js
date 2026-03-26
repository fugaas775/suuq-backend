import axios from 'axios';

// Get the base URL from environment variables, with a fallback
// Normalize so that when VITE_API_BASE_URL is '/api', we keep axios baseURL empty ('')
// and continue to call endpoints as '/api/...'. For full hosts, keep them as-is.
const RAW_BASE = import.meta.env.VITE_API_BASE_URL;
const resolvedBase =
  RAW_BASE === '/api' ? '' : RAW_BASE || 'https://api.suuq.ugasfuad.com';

// Use same-origin when VITE_API_URL='/api' (base becomes ''), so requests go to /api/* and are proxied by Nginx.

export const API_BASE_URL = resolvedBase;

const api = axios.create({
  baseURL: API_BASE_URL,
});

function getJwtExpMs(token) {
  try {
    const p = token.split('.')[1];
    const json = JSON.parse(atob(p));
    if (!json || typeof json.exp !== 'number') return null;
    return json.exp * 1000;
  } catch {
    return null;
  }
}

function isTokenExpired(token, skewMs = 15000) {
  const expMs = getJwtExpMs(token);
  if (!expMs) return false;
  return Date.now() + skewMs >= expMs;
}

// This interceptor will run before every request is sent.
api.interceptors.request.use(
  (config) => {
    // FIX: Use the correct key 'accessToken' to match AuthContext
    const token = localStorage.getItem('accessToken');
    // Avoid sending Authorization on auth endpoints (login/verify) to reduce preflight friction
    const urlPath = (() => {
      try {
        // Support absolute or relative URLs
        const u = new URL(config.url, API_BASE_URL);
        return u.pathname;
      } catch {
        return config?.url || '';
      }
    })();
    // Only skip Authorization for the login endpoint; allow token on verify and all other API calls
    const isLoginEndpoint = /\/api\/auth\/login\b/.test(urlPath);
    // Attach auth for common API paths: /api/*, /admin/*, /vendor/*
    const isApiCall = /^(?:\/)?(api|admin|vendor)\//.test(urlPath);
    if (token && !isLoginEndpoint && isApiCall) {
      config.headers.Authorization = `Bearer ${token}`;

      // Attach vendor selection if available
      const activeStoreId = localStorage.getItem('activeStoreId');
      if (activeStoreId) {
        config.headers['x-vendor-id'] = activeStoreId;
      }
    }
    // Note: avoid setting client-side cache-control request headers to prevent CORS preflight rejections
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// This interceptor handles when a token expires
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Graceful Handling for Token Expiry / 401 Unauthorized
    if (error.response && error.response.status === 401) {
      // clear auth data
      localStorage.removeItem('accessToken');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Force redirect to login
      window.location.href = '/';
    }
    return Promise.reject(error);
  },
);

export default api;
