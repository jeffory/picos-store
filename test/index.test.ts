import { describe, it, expect } from "vitest";
import worker from "../src/index";

describe("worker fetch", () => {
  it("returns 404 with no-store for unknown paths", async () => {
    const res = await worker.fetch(new Request("https://picos.jeffory.dev/nope"), {} as never, {} as never);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
