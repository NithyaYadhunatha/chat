import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: false, // no cookies needed anymore
  headers: {
    'ngrok-skip-browser-warning': 'true',
  },
});

// Attach access token from memory on every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = (window as any).__access_token as string | undefined;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Auto-refresh on 401
let refreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (refreshing) {
        return new Promise((resolve) => {
          refreshQueue.push((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }
      refreshing = true;
      try {
        const storedRefresh = localStorage.getItem('refresh_token');
        if (!storedRefresh) throw new Error('No refresh token');
        
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
          { refresh_token: storedRefresh }, // send in body
          { headers: { 'ngrok-skip-browser-warning': 'true' } }
        );
        const newToken: string = data.access_token;
        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
        (window as any).__access_token = newToken;
        refreshQueue.forEach((cb) => cb(newToken));
        refreshQueue = [];
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('refresh_token');
        (window as any).__access_token = undefined;
        window.location.href = '/login';
      } finally {
        refreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
