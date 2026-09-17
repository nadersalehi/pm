export type SessionUser = {
  username: string;
};

const post = (path: string, body: unknown) =>
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

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
  const response = await post("/api/login", { username, password });
  if (!response.ok) {
    throw new Error("Invalid username or password.");
  }
  return response.json();
};

export const register = async (
  username: string,
  password: string
): Promise<SessionUser> => {
  const response = await post("/api/register", { username, password });
  if (response.status === 409) {
    throw new Error("That username is already taken.");
  }
  if (response.status === 422) {
    throw new Error(
      "Use 3-32 letters, numbers, dots, dashes or underscores for the username, and at least 8 characters for the password."
    );
  }
  if (!response.ok) {
    throw new Error("Couldn't create the account. Try again.");
  }
  return response.json();
};

export const logout = async (): Promise<void> => {
  await fetch("/api/logout", { method: "POST" });
};

const passwordError = (status: number, fallback: string) =>
  status === 403
    ? "Current password is incorrect."
    : status === 422
      ? "New password must be at least 8 characters."
      : fallback;

export const changePassword = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const response = await post("/api/me/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  if (!response.ok) {
    throw new Error(passwordError(response.status, "Couldn't change the password."));
  }
};

export const deleteAccount = async (password: string): Promise<void> => {
  const response = await post("/api/me/delete", { password });
  if (!response.ok) {
    throw new Error(passwordError(response.status, "Couldn't delete the account."));
  }
};
