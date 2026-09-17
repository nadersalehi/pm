import { changePassword, deleteAccount, fetchSession, login, logout, register } from "@/lib/auth";

const fetchMock = vi.fn();

const respond = (status: number, body?: unknown) =>
  fetchMock.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), { status })
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("auth client", () => {
  it("returns the session user or null", async () => {
    respond(200, { username: "ada" });
    expect(await fetchSession()).toEqual({ username: "ada" });
    respond(401, { detail: "Not authenticated" });
    expect(await fetchSession()).toBeNull();
  });

  it("logs in and rejects bad credentials", async () => {
    respond(200, { username: "ada" });
    expect(await login("ada", "pw")).toEqual({ username: "ada" });
    respond(401, {});
    await expect(login("ada", "bad")).rejects.toThrow("Invalid username or password.");
  });

  it("registers and explains failures", async () => {
    respond(201, { username: "ada" });
    expect(await register("ada", "long-password")).toEqual({ username: "ada" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      username: "ada",
      password: "long-password",
    });

    respond(409, {});
    await expect(register("ada", "long-password")).rejects.toThrow(/already taken/);
    respond(422, {});
    await expect(register("a", "x")).rejects.toThrow(/at least 8 characters/);
    respond(500, {});
    await expect(register("ada", "long-password")).rejects.toThrow(/couldn't create/i);
  });

  it("changes the password with snake_case fields", async () => {
    respond(204);
    await changePassword("old-password", "new-password");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/me/password");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      current_password: "old-password",
      new_password: "new-password",
    });

    respond(403, {});
    await expect(changePassword("wrong", "new-password")).rejects.toThrow(/incorrect/);
    respond(422, {});
    await expect(changePassword("old", "short")).rejects.toThrow(/at least 8/);
  });

  it("deletes the account and reports a wrong password", async () => {
    respond(204);
    await expect(deleteAccount("pw")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/me/delete");
    respond(403, {});
    await expect(deleteAccount("bad")).rejects.toThrow(/incorrect/);
    respond(500, {});
    await expect(deleteAccount("pw")).rejects.toThrow(/couldn't delete/i);
  });

  it("logs out", async () => {
    respond(204);
    await logout();
    expect(fetchMock).toHaveBeenCalledWith("/api/logout", { method: "POST" });
  });
});
