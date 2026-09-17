import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import * as api from "@/lib/api";
import * as auth from "@/lib/auth";
import { buildBoard } from "@/test/fixtures";

vi.mock("@/lib/api");
vi.mock("@/lib/auth");

const mockedApi = vi.mocked(api);
const mockedAuth = vi.mocked(auth);

let unauthorized: (() => void) | null = null;

beforeEach(() => {
  unauthorized = null;
  mockedApi.setUnauthorizedHandler.mockImplementation((handler) => {
    unauthorized = handler;
  });
  mockedApi.fetchBoards.mockResolvedValue([
    { id: "board-1", name: "Roadmap", description: "", cardCount: 2 },
  ]);
  mockedApi.fetchBoard.mockResolvedValue(buildBoard());
  mockedAuth.logout.mockResolvedValue(undefined);
});

describe("Home auth gate", () => {
  it("renders nothing until the session check resolves", () => {
    mockedAuth.fetchSession.mockReturnValue(new Promise(() => {}));
    const { container } = render(<Home />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the sign-in form for anonymous visitors", async () => {
    mockedAuth.fetchSession.mockResolvedValue(null);
    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the workspace for a signed-in user and logs out", async () => {
    mockedAuth.fetchSession.mockResolvedValue({ username: "ada" });
    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Roadmap" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(mockedAuth.logout).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("returns to sign-in when any API call reports an expired session", async () => {
    mockedAuth.fetchSession.mockResolvedValue({ username: "ada" });
    render(<Home />);
    await screen.findByRole("heading", { name: "Roadmap" });

    act(() => unauthorized?.());
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("clears the unauthorized handler on unmount", async () => {
    mockedAuth.fetchSession.mockResolvedValue(null);
    const { unmount } = render(<Home />);
    await screen.findByRole("heading", { name: "Sign in" });
    unmount();
    expect(mockedApi.setUnauthorizedHandler).toHaveBeenLastCalledWith(null);
  });
});
