import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import * as api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [me, setMe] = useState(undefined); // undefined = not fetched, null = not authorized here
  const [meError, setMeError] = useState(null);

  // Who the caller is and what they may see. This is a round trip rather than a claim read off the
  // token because the boundary lives in restaurant.staff, which the browser has no grants to read
  // -- only the API can answer it.
  const loadMe = useCallback(async () => {
    try {
      setMe(await api.me());
      setMeError(null);
    } catch (err) {
      // 403 is the ordinary case, not a fault: a signed-in user of one of the sibling apps on this
      // shared Supabase project who simply is not staff here.
      setMe(null);
      setMeError(err.status === 403 ? null : err.message);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadMe();
      else setMe(null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadMe();
      else {
        setMe(null);
        setMeError(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [loadMe]);

  const value = {
    session,
    me,
    meError,
    reloadMe: loadMe,
    // Both halves, or the console flashes "not authorized" at every legitimate user: the session
    // resolves a round trip before /me does, and a null default is indistinguishable from a real
    // denial until that request lands.
    loading: session === undefined || (!!session && me === undefined),
    login: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    logout: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
