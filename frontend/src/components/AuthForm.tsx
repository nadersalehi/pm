"use client";

import { useState, type FormEvent } from "react";
import { login, register, type SessionUser } from "@/lib/auth";

type AuthFormProps = {
  onSuccess: (user: SessionUser) => void;
};

const inputClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const AuthForm = ({ onSuccess }: AuthFormProps) => {
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === "register";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = isRegister
        ? await register(username.trim(), password)
        : await login(username, password);
      onSuccess(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(isRegister ? "sign-in" : "register");
    setError(null);
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--surface)] px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Kanban Studio
        </p>
        <h1 className="mt-3 font-display text-2xl font-semibold text-[var(--navy-dark)]">
          {isRegister ? "Create account" : "Sign in"}
        </h1>
        <div className="mt-6 space-y-3">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            aria-label="Username"
            autoComplete="username"
            className={inputClass}
            required
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            aria-label="Password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? 8 : undefined}
            className={inputClass}
            required
          />
          {isRegister && (
            <p className="text-xs leading-5 text-[var(--gray-text)]">
              3-32 letters, numbers, dots, dashes or underscores. Password of at
              least 8 characters.
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {isSubmitting
            ? isRegister
              ? "Creating account..."
              : "Signing in..."
            : isRegister
              ? "Create account"
              : "Sign in"}
        </button>
        <button
          type="button"
          onClick={switchMode}
          className="mt-3 w-full rounded-full px-4 py-2 text-xs font-semibold text-[var(--primary-blue)] transition hover:bg-[var(--surface)]"
        >
          {isRegister ? "I already have an account" : "New here? Create an account"}
        </button>
      </form>
    </main>
  );
};
