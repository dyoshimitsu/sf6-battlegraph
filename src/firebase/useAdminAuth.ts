import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore/lite";
import { useEffect, useState } from "react";
import type { FirebaseRuntime } from "./client";

export type AdminAuthState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "admin"; user: User }
  | { status: "notAdmin"; user: User }
  | { status: "error"; message: string };

export function useAdminAuth(runtime: FirebaseRuntime) {
  const [state, setState] = useState<AdminAuthState>(
    runtime.status === "disabled" ? { status: "disabled" } : { status: "loading" },
  );

  useEffect(() => {
    if (runtime.status === "disabled") {
      setState({ status: "disabled" });
      return;
    }
    if (runtime.status === "error") {
      setState({ status: "error", message: runtime.message });
      return;
    }
    let active = true;
    const unsubscribe = onAuthStateChanged(
      runtime.services.auth,
      async (user) => {
        if (!active) return;
        if (!user) {
          setState({ status: "signedOut" });
          return;
        }
        setState({ status: "loading" });
        try {
          const admin = await getDoc(doc(runtime.services.db, "admins", user.uid));
          if (active) setState({ status: admin.exists() ? "admin" : "notAdmin", user });
        } catch (cause) {
          if (active)
            setState({
              status: "error",
              message: cause instanceof Error ? cause.message : "Administrator check failed",
            });
        }
      },
      (error) => setState({ status: "error", message: error.message }),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [runtime]);

  return {
    state,
    signIn: async () => {
      if (runtime.status !== "ready") return;
      setState({ status: "loading" });
      try {
        await signInWithPopup(runtime.services.auth, new GoogleAuthProvider());
      } catch (cause) {
        setState({
          status: "error",
          message: cause instanceof Error ? cause.message : "Sign-in failed",
        });
      }
    },
    signOut: async () => {
      if (runtime.status !== "ready") return;
      try {
        await signOut(runtime.services.auth);
      } catch (cause) {
        setState({
          status: "error",
          message: cause instanceof Error ? cause.message : "Sign-out failed",
        });
      }
    },
  };
}
