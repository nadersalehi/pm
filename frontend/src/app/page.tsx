"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
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
    return () => {
      cancelled = true;
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
    return (
      <LoginForm
        onSuccess={(user) => setAuth({ status: "authenticated", user })}
      />
    );
  }

  return <KanbanBoard onLogout={handleLogout} />;
}
