import { createClient } from '@supabase/supabase-js';

// "Keep me signed in" unchecked -> the session lives in sessionStorage (gone when the browser
// closes) instead of localStorage. The flag itself always lives in localStorage since it has to
// survive the redirect back from Google OAuth, and defaults to remembering (unset !== 'false')
// so the Google button, which has no checkbox of its own, keeps today's persistent behavior.
const REMEMBER_KEY = 'admin-remember-session';
export const setRememberSession = (remember) => localStorage.setItem(REMEMBER_KEY, String(remember));
const sessionBackend = () => (localStorage.getItem(REMEMBER_KEY) === 'false' ? sessionStorage : localStorage);
const authStorage = {
  getItem: (key) => sessionBackend().getItem(key),
  setItem: (key, value) => sessionBackend().setItem(key, value),
  removeItem: (key) => sessionBackend().removeItem(key),
};

// The complex management project -- the same one the API points at. Restaurant owners sign in
// against its auth.users; a restaurant.staff row is what actually grants access, and only the
// API can check that.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { storage: authStorage } }
);

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
