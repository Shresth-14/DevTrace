import { describe, it, expect, vi, afterEach } from "vitest";
import { api } from "./api";
import { formatDate, relativeTime } from "./format";

// Node's built-in localStorage global shadows jsdom's and is undefined without a backing file.
vi.stubGlobal("localStorage", {
  getItem: () => null,
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

afterEach(() => vi.unstubAllGlobals());

const repo = (id: number) => ({ id: String(id), fullName: `acme/r${id}` });
const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe("api.getAllRepositories", () => {
  it("follows every page so repositories past the first page are not hidden", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    const fetchMock = vi.fn((url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return json({
        repositories: page === 1 ? [repo(1), repo(2)] : [repo(3)],
        totalCount: 3,
        page,
        hasMore: page === 1,
        warnings:
          page === 1
            ? [{ installationId: "9", accountLogin: "org", message: "boom" }]
            : [],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await api.getAllRepositories();
    expect(res.repositories.map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(res.warnings).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces API errors instead of returning fake data", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ message: "GitHub rejected the credentials" }),
            { status: 502 }
          )
        )
      )
    );
    await expect(api.getAllRepositories()).rejects.toThrow(
      /rejected the credentials/
    );
  });
});

describe("formatting", () => {
  it("never invents dates", () => {
    expect(formatDate(null)).toBe("date unknown");
    expect(relativeTime(null)).toBe("never");
    expect(
      relativeTime(new Date(Date.now() - 2 * 3600_000).toISOString())
    ).toBe("2 hours ago");
  });
});
