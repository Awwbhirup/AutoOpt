import { describe, expect, it } from "vitest";

import { memberAddedNotice, suiteFinishedNotice } from "./notifications";

const workspace = { id: "ws", slug: "acme", name: "Acme" };

describe("notification text", () => {
  it("says a suite finished, how it went, and links to its results", () => {
    const notice = suiteFinishedNotice({
      userId: "u",
      workspace,
      suite: { id: "s", name: "Loops" },
      suiteRunId: "r",
      status: "SUCCEEDED",
      succeeded: 58,
      total: 60,
    });
    expect(notice).toMatchObject({
      kind: "suite.finished",
      title: "Loops finished",
      body: "58 of 60 runs succeeded.",
      href: "/w/acme/suites/s/runs/r",
    });
  });

  it("does not call a failed suite finished", () => {
    const notice = suiteFinishedNotice({
      userId: "u",
      workspace,
      suite: { id: "s", name: "Loops" },
      suiteRunId: "r",
      status: "FAILED",
      succeeded: 0,
      total: 1,
    });
    expect(notice.title).toBe("Loops did not finish cleanly");
    expect(notice.body).toBe("0 of 1 run succeeded.");
  });

  it("names who added a member and as what", () => {
    expect(memberAddedNotice({ userId: "u", workspace, role: "ADMIN", by: "Priya" })).toMatchObject({
      title: "You were added to Acme",
      body: "Priya added you as admin.",
      href: "/w/acme",
    });
    expect(memberAddedNotice({ userId: "u", workspace, role: "VIEWER", by: null }).body).toBe(
      "Someone added you as viewer.",
    );
  });
});
