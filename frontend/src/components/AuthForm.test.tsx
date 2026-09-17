import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "@/components/AuthForm";
import * as auth from "@/lib/auth";

vi.mock("@/lib/auth");

const mockedAuth = vi.mocked(auth);

const fill = async (username: string, password: string) => {
  await userEvent.type(screen.getByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
};

describe("AuthForm", () => {
  it("signs in", async () => {
    mockedAuth.login.mockResolvedValue({ username: "ada" });
    const onSuccess = vi.fn();
    render(<AuthForm onSuccess={onSuccess} />);

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    await fill("ada", "secret-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(mockedAuth.login).toHaveBeenCalledWith("ada", "secret-password");
    expect(onSuccess).toHaveBeenCalledWith({ username: "ada" });
  });

  it("shows the sign-in error and re-enables the form", async () => {
    mockedAuth.login.mockRejectedValue(new Error("Invalid username or password."));
    render(<AuthForm onSuccess={vi.fn()} />);
    await fill("ada", "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password.");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("creates an account in register mode", async () => {
    mockedAuth.register.mockResolvedValue({ username: "grace" });
    const onSuccess = vi.fn();
    render(<AuthForm onSuccess={onSuccess} />);

    await userEvent.click(screen.getByRole("button", { name: /create an account/i }));
    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    await fill(" grace ", "long-password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(mockedAuth.register).toHaveBeenCalledWith("grace", "long-password");
    expect(mockedAuth.login).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith({ username: "grace" });
  });

  it("shows registration errors and can switch back to sign in", async () => {
    mockedAuth.register.mockRejectedValue(new Error("That username is already taken."));
    render(<AuthForm onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /create an account/i }));
    await fill("ada", "long-password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already taken/);

    await userEvent.click(screen.getByRole("button", { name: /already have an account/i }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
