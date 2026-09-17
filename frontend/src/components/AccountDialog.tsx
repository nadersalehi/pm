"use client";

import { useState, type FormEvent } from "react";
import { Modal, fieldClass, labelClass } from "@/components/Modal";
import { changePassword, deleteAccount } from "@/lib/auth";

type AccountDialogProps = {
  username: string;
  onAccountDeleted: () => void;
  onClose: () => void;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

export const AccountDialog = ({ username, onAccountDeleted, onClose }: AccountDialogProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordStatus({ ok: true, message: "Password updated." });
    } catch (error) {
      setPasswordStatus({ ok: false, message: errorMessage(error) });
    }
  };

  const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await deleteAccount(deletePassword);
      onAccountDeleted();
    } catch (error) {
      setDeleteError(errorMessage(error));
    }
  };

  return (
    <Modal title="Account" onClose={onClose}>
      <p className="-mt-2 mb-4 text-sm text-[var(--gray-text)]">
        Signed in as <span className="font-semibold text-[var(--navy-dark)]">{username}</span>
      </p>

      <form onSubmit={handleChangePassword} className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--navy-dark)]">Change password</h3>
        <div>
          <label htmlFor="current-password" className={labelClass}>
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="new-password" className={labelClass}>
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            className={fieldClass}
          />
        </div>
        {passwordStatus && (
          <p
            role={passwordStatus.ok ? "status" : "alert"}
            className={`text-sm font-medium ${passwordStatus.ok ? "text-[var(--primary-blue)]" : "text-red-600"}`}
          >
            {passwordStatus.message}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Update password
          </button>
        </div>
      </form>

      <form
        onSubmit={handleDelete}
        className="mt-6 space-y-3 rounded-2xl border border-red-100 bg-red-50/50 p-4"
      >
        <h3 className="text-sm font-semibold text-red-700">Delete account</h3>
        <p className="text-xs leading-5 text-[var(--gray-text)]">
          Permanently deletes your account and every board, column and card in it.
        </p>
        <div>
          <label htmlFor="delete-password" className={labelClass}>
            Confirm with your password
          </label>
          <input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
            required
            className={fieldClass}
          />
        </div>
        {deleteError && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {deleteError}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Delete my account
          </button>
        </div>
      </form>
    </Modal>
  );
};
