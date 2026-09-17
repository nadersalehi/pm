"use client";

import { useEffect, useState } from "react";
import { AuthForm } from "@/components/AuthForm";
import { Workspace } from "@/components/Workspace";
import { setUnauthorizedHandler } from "@/lib/api";
import { fetchSession, logout, type SessionUser } from "@/lib/auth";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: SessionUser };

export default function Home() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchSession().then((user) => {
      if (cancelled) {
        return;
      }
      setAuth(user ? { status: "authenticated", user } : { status: "anonymous" });
    });
    setUnauthorizedHandler(() => setAuth({ status: "anonymous" }));
    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    setAuth({ status: "anonymous" });
  };

  if (auth.status === "loading") {
    return null;
  }

  if (auth.status === "anonymous") {
    return <AuthForm onSuccess={(user) => setAuth({ status: "authenticated", user })} />;
  }

  return (
    <Workspace
      key={auth.user.username}
      user={auth.user}
      onLogout={handleLogout}
      onAccountDeleted={() => setAuth({ status: "anonymous" })}
    />
  );
}
