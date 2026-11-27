import { describe, expect, it } from "vitest";
import {
  isMovieVisibleToUser,
  isT18Rating,
  shouldHideT18ForUser,
} from "./validation";

function dobYearsAgo(years: number, dayOffset = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("T18 visibility policy for viewers", () => {
  it("recognizes T18 rating case-insensitively", () => {
    expect(isT18Rating("T18")).toBe(true);
    expect(isT18Rating(" t18 ")).toBe(true);
    expect(isT18Rating("T16")).toBe(false);
    expect(isT18Rating("P")).toBe(false);
    expect(isT18Rating(undefined)).toBe(false);
  });

  it("hides T18 movies for client users under 18", () => {
    const minor = { role: "client", dob: dobYearsAgo(17, 1) };
    expect(shouldHideT18ForUser(minor)).toBe(true);
    expect(isMovieVisibleToUser("T18", minor)).toBe(false);
    expect(isMovieVisibleToUser("T16", minor)).toBe(true);
    expect(isMovieVisibleToUser("P", minor)).toBe(true);
  });

  it("allows T18 movies for client users aged 18 or older", () => {
    const adult = { role: "client", dob: dobYearsAgo(18, -1) };
    expect(shouldHideT18ForUser(adult)).toBe(false);
    expect(isMovieVisibleToUser("T18", adult)).toBe(true);
  });

  it("keeps T18 movies visible to admin, manager, and staff regardless of dob", () => {
    const minorDob = dobYearsAgo(16);
    expect(isMovieVisibleToUser("T18", { role: "admin", dob: minorDob })).toBe(true);
    expect(isMovieVisibleToUser("T18", { role: "manager", dob: minorDob })).toBe(true);
    expect(isMovieVisibleToUser("T18", { role: "staff", dob: minorDob })).toBe(true);
  });

  it("does not hide T18 movies for guests or users without a valid dob", () => {
    expect(isMovieVisibleToUser("T18", null)).toBe(true);
    expect(isMovieVisibleToUser("T18", undefined)).toBe(true);
    expect(isMovieVisibleToUser("T18", { role: "client" })).toBe(true);
    expect(isMovieVisibleToUser("T18", { role: "client", dob: "invalid" })).toBe(true);
  });
});
