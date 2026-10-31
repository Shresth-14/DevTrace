import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RepoUrlForm } from "./RepoUrlForm";

const push = vi.fn();
const addProjectFromUrl = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/context/DashboardContext", () => ({
  useDashboard: () => ({ addProjectFromUrl }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const submit = (value: string) => {
  fireEvent.change(screen.getByLabelText(/public github repository url/i), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: /add repository/i }));
};

describe("RepoUrlForm", () => {
  it("asks for a URL instead of calling the API with nothing", () => {
    render(<RepoUrlForm />);
    submit("   ");
    expect(screen.getByRole("alert")).toHaveTextContent(/paste the url/i);
    expect(addProjectFromUrl).not.toHaveBeenCalled();
  });

  it("adds the repository and opens its project page", async () => {
    addProjectFromUrl.mockResolvedValue({
      project: { slug: "peps" },
      alreadyConnected: false,
    });
    const onDone = vi.fn();
    render(<RepoUrlForm onDone={onDone} />);
    submit("https://github.com/python/peps");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/p/peps"));
    expect(addProjectFromUrl).toHaveBeenCalledWith(
      "https://github.com/python/peps"
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("shows the server's reason and lets the user try again (no endless spinner)", async () => {
    addProjectFromUrl.mockRejectedValue(
      new Error("Only public repositories can be added by URL.")
    );
    render(<RepoUrlForm />);
    submit("https://github.com/acme/secret");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /only public repositories/i
    );
    expect(
      screen.getByRole("button", { name: /add repository/i })
    ).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });
});
