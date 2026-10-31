import { afterEach, describe, expect, it, vi } from "vitest";
import { browserLocationError, getBrowserLocation } from "./browser-location";

afterEach(() => { vi.useRealTimers(); });
describe("permission-based browser location", () => {
  it("requests one approximate fix with bounded options and rounds coordinates before returning", async () => {
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>((success) => success({ coords: { latitude: 38.580568, longitude: -121.49559 } } as GeolocationPosition));
    expect(await getBrowserLocation({ getCurrentPosition })).toEqual({ lat: "38.581", lng: "-121.496" });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  });
  it.each([1, 2, 3])("offers a city/ZIP fallback for error code %s without showing browser diagnostics", async code => {
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>((_, fail) => fail!({ code, message: "private raw diagnostics" } as GeolocationPositionError));
    await expect(getBrowserLocation({ getCurrentPosition })).rejects.toThrow(browserLocationError(code));
    expect(browserLocationError(code)).not.toContain("private");
  });
  it("fails without prompting if unsupported or not a secure context", async () => {
    const getCurrentPosition = vi.fn();
    await expect(getBrowserLocation(undefined)).rejects.toThrow("city or ZIP");
    await expect(getBrowserLocation({ getCurrentPosition }, false)).rejects.toThrow("city or ZIP");
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
  it("times out even if the browser never responds to a permission prompt", async () => {
    vi.useFakeTimers();
    const result = expect(getBrowserLocation({ getCurrentPosition: vi.fn() })).rejects.toThrow("too long");
    await vi.advanceTimersByTimeAsync(12000);
    await result;
  });
  it("rejects invalid coordinates and thrown browser errors", async () => {
    await expect(getBrowserLocation({ getCurrentPosition: success => success({ coords: { latitude: NaN, longitude: 0 } } as GeolocationPosition) })).rejects.toThrow("city or ZIP");
    await expect(getBrowserLocation({ getCurrentPosition: () => { throw new Error("private"); } })).rejects.toThrow("city or ZIP");
  });
});
