import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, signInWithGoogle as firebaseSignInWithGoogle, signOutUser } from '../firebase.ts';
import { ensureUserWorkspaceRoot } from '../utils/firestoreSync.ts';

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  workspaceRootReady: boolean;
  isSigningIn: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  user: null,
  authReady: false,
  workspaceRootReady: false,
  isSigningIn: false,
  authError: null,
  signInWithGoogle: async () => undefined,
  signOut: async () => undefined,
  clearAuthError: () => undefined
});

export function useFirebaseAuth(): FirebaseContextValue {
  return useContext(FirebaseContext);
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [workspaceRootReady, setWorkspaceRootReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;
      setUser(nextUser);
      setWorkspaceRootReady(false);
      setAuthReady(true);

      if (nextUser && nextUser.emailVerified) {
        try {
          await ensureUserWorkspaceRoot(nextUser);
          if (active) {
            setWorkspaceRootReady(true);
            setAuthError(null);
          }
        } catch (err) {
          if (active) {
            setWorkspaceRootReady(false);
            setAuthError(
              err instanceof Error ? err.message : 'Unable to initialize Firebase workspace root.'
            );
          }
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await firebaseSignInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      // Ignore benign popup cancellation message noise or show clean hint
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Sign-in popup was closed before completing authentication.');
      } else {
        setAuthError(msg);
      }
    } finally {
      setIsSigningIn(false);
    }
  }, [isSigningIn]);

  const signOut = useCallback(async () => {
    setAuthError(null);
    setWorkspaceRootReady(false);
    await signOutUser();
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        workspaceRootReady,
        isSigningIn,
        authError,
        signInWithGoogle,
        signOut,
        clearAuthError
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};
