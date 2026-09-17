import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountDialog } from "@/components/AccountDialog";
import * as auth from "@/lib/auth";

vi.mock("@/lib/auth");

const mockedAuth = vi.mocked(auth);

const renderDialog = () => {
  const props = { onAccountDeleted: vi.fn(), onClose: vi.fn() };
  render(<AccountDialog username="ada" {...props} />);
  return props;
};

describe("AccountDialog", () => {
  it("changes the password and clears the fields", async () => {
    mockedAuth.changePassword.mockResolvedValue(undefined);
    renderDialog();
    await userEvent.type(screen.getByLabelText("Current password"), "old-password");
    await userEvent.type(screen.getByLabelText("New password"), "new-password");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Password updated.");
    expect(mockedAuth.changePassword).toHaveBeenCalledWith("old-password", "new-password");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("reports a failed password change", async () => {
    mockedAuth.changePassword.mockRejectedValue(new Error("Current password is incorrect."));
    renderDialog();
    await userEvent.type(screen.getByLabelText("Current password"), "wrong-password");
    await userEvent.type(screen.getByLabelText("New password"), "new-password");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect/);
  });

  it("deletes the account with the password", async () => {
    mockedAuth.deleteAccount.mockResolvedValue(undefined);
    const { onAccountDeleted } = renderDialog();
    await userEvent.type(screen.getByLabelText("Confirm with your password"), "pw-for-delete");
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(mockedAuth.deleteAccount).toHaveBeenCalledWith("pw-for-delete");
    expect(onAccountDeleted).toHaveBeenCalledOnce();
  });

  it("keeps the account when the password is wrong", async () => {
    mockedAuth.deleteAccount.mockRejectedValue(new Error("Current password is incorrect."));
    const { onAccountDeleted } = renderDialog();
    await userEvent.type(screen.getByLabelText("Confirm with your password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect/);
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });

  it("closes from the close button", async () => {
    const { onClose } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
