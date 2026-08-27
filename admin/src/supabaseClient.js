import { createClient } from '@supabase/supabase-js';

// The complex management project -- the same one the API points at. Restaurant owners sign in
// against its auth.users; a restaurant.staff row is what actually grants access, and only the
// API can check that.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
