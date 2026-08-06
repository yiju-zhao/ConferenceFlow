import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { auth, db, googleProvider } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { UserProfile } from "../types";

interface AuthContextValue {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  signOut: () => Promise<void>;
  updateDisplayName: (newName: string) => Promise<void>;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const profileRef = doc(db, "users", firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setUserProfile(profileSnap.data() as UserProfile);
          setDoc(profileRef, { lastLoginAt: serverTimestamp() }, { merge: true });
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  };

  const signUpWithEmail = async (email: string, password: string, displayName: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName });
    await setDoc(doc(db, "users", result.user.uid), {
      email,
      displayName,
      avatarUrl: "",
      provider: "email",
      globalRole: "user",
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    const profileSnap = await getDoc(doc(db, "users", result.user.uid));
    setUserProfile(profileSnap.data() as UserProfile);
    return result.user;
  };

  const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const u = result.user;
    const profileRef = doc(db, "users", u.uid);
    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      await setDoc(profileRef, {
        email: u.email ?? "",
        displayName: u.displayName || "",
        avatarUrl: u.photoURL || "",
        provider: "google",
        globalRole: "user",
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    } else {
      await setDoc(profileRef, { lastLoginAt: serverTimestamp() }, { merge: true });
    }
    const updatedSnap = await getDoc(profileRef);
    setUserProfile(updatedSnap.data() as UserProfile);
    return u;
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const updateDisplayName = async (newName: string) => {
    if (!user) throw new Error("Not authenticated");
    await updateProfile(user, { displayName: newName });
    const profileRef = doc(db, "users", user.uid);
    await setDoc(profileRef, { displayName: newName }, { merge: true });
    setUserProfile((prev) => (prev ? { ...prev, displayName: newName } : prev));
  };

  const value: AuthContextValue = {
    user,
    userProfile,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    updateDisplayName,
    isSuperAdmin: userProfile?.globalRole === "super_admin",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
