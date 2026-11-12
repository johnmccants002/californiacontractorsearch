// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("next/script", async () => {
  const { useEffect } = await import("react");
  return {
    default: ({ onReady }: { onReady: () => void }) => {
      useEffect(() => { onReady(); }, [onReady]);
      return null;
    },
  };
});
import { SignInForm } from "./forms";

type Callbacks = {
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};
let host: HTMLDivElement, root: Root;
let widgets: { id: string; callbacks: Callbacks; element: HTMLElement }[];
const remove = vi.fn();
const request = vi.fn();

async function render(strict = false) {
  const form = createElement(SignInForm, { next: "/account", siteKey: "test-key" });
  await act(async () => { root.render(strict ? createElement(StrictMode, null, form) : form); });
}
async function solve() {
  await act(async () => { widgets.at(-1)!.callbacks.callback("fresh-token"); });
}
async function submit() {
  await act(async () => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
function button(label: string) {
  return [...host.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;
}
function reply(ok: boolean, body: object) {
  request.mockResolvedValueOnce({ ok, json: async () => body });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", request);
  widgets = [];
  vi.stubGlobal("turnstile", {
    render: (element: HTMLElement, callbacks: Callbacks) => {
      const id = `widget-${widgets.length}`;
      element.textContent = "Security challenge";
      widgets.push({ id, callbacks, element });
      return id;
    },
    remove: (id: string) => {
      remove(id);
      widgets.find(w => w.id === id)!.element.textContent = "";
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.unstubAllGlobals();
});

describe("sign-in challenge lifecycle", () => {
  it("removes the widget after sending a code and ignores late failures and tokens", async () => {
    await render();
    expect(button("Email me").disabled).toBe(true);
    await solve();
    expect(button("Email me").disabled).toBe(false);
    const old = widgets[0];
    reply(true, { ok: true, message: "Check your email for a code." });
    await submit();
    expect(remove).toHaveBeenCalledWith(old.id);
    expect(host.querySelector('[name="code"]')).not.toBeNull();
    expect(widgets).toHaveLength(1);
    await act(async () => {
      old.callbacks["error-callback"]();
      old.callbacks["expired-callback"]();
      old.callbacks.callback("stale-token");
    });
    expect(host.textContent).toContain("Check your email for a code.");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(button("Verify and sign in").disabled).toBe(false);
  });

  it("creates a fresh challenge when requesting another code", async () => {
    await render(); await solve();
    reply(true, { ok: true }); await submit();
    await act(async () => { button("Use another email").click(); });
    expect(widgets).toHaveLength(2);
    expect(button("Email me").disabled).toBe(true);
    await act(async () => { widgets[0].callbacks.callback("stale-token"); });
    expect(button("Email me").disabled).toBe(true);
    await solve();
    expect(button("Email me").disabled).toBe(false);
  });

  it("requires a new challenge after a failed email request", async () => {
    await render(); await solve();
    reply(false, { error: "Please wait before requesting another code." });
    await submit();
    expect(remove).toHaveBeenCalledWith(widgets[0].id);
    expect(widgets).toHaveLength(2);
    expect(host.textContent).toContain("Please wait before requesting another code.");
    expect(button("Email me").disabled).toBe(true);
    await solve();
    expect(button("Email me").disabled).toBe(false);
  });

  it("keeps a wrong-code error without starting a hidden challenge", async () => {
    await render(); await solve();
    reply(true, { ok: true }); await submit();
    reply(false, { error: "That code is invalid or expired." }); await submit();
    expect(host.textContent).toContain("That code is invalid or expired.");
    expect(widgets).toHaveLength(1);
    expect(remove).toHaveBeenCalledTimes(1);
    reply(true, { ok: true, next: "/account" }); await submit();
    expect(navigation.push).toHaveBeenCalledWith("/account");
    expect(widgets).toHaveLength(1);
  });

  it("blocks email requests when the current token expires and reports active failures", async () => {
    await render(); await solve();
    await act(async () => { widgets[0].callbacks["expired-callback"](); });
    expect(button("Email me").disabled).toBe(true);
    await act(async () => { widgets[0].callbacks["error-callback"](); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("security challenge could not load");
  });

  it("cleans up when navigating away, including React strict effect replay", async () => {
    await render(true);
    await act(async () => { root.render(null); });
    for (const widget of widgets) expect(remove).toHaveBeenCalledWith(widget.id);
    await act(async () => { widgets.at(-1)!.callbacks["error-callback"](); });
    expect(host.textContent).toBe("");
  });
});
