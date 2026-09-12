import axios from 'axios';

export const API_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers['x-auth-token'] = token;
  return config;
});

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401 && onUnauthorized) onUnauthorized();
    return Promise.reject(err);
  }
);

export function errorMessage(err, fallback = 'Something went wrong.') {
  if (err && err.response && err.response.data) {
    const d = err.response.data;
    if (typeof d === 'string') return d;
    return d.msg || d.message || fallback;
  }
  if (err && (err.message === 'Network Error' || err.code === 'ECONNABORTED')) return 'The server did not respond. It may have timed out. Please try again in a moment.';
  return fallback;
}

export default api;
