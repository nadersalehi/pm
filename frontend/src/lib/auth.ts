export type SessionUser = {
  username: string;
};

export const fetchSession = async (): Promise<SessionUser | null> => {
  const response = await fetch("/api/me");
  if (!response.ok) {
    return null;
  }
  return response.json();
};

export const login = async (
  username: string,
  password: string
): Promise<SessionUser> => {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error("Invalid username or password.");
  }
  return response.json();
};

export const logout = async (): Promise<void> => {
  await fetch("/api/logout", { method: "POST" });
};
