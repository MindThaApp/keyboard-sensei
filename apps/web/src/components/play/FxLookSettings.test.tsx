// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EXPERIENCE_STORAGE_KEY } from "../../contexts/ExperienceContext";
import FxLookSettings from "./FxLookSettings";

describe("FxLookSettings", () => {
  it.each(["simple", "advanced"])(
    "always offers the fine sliders under Fine tune (%s)",
    (mode) => {
      localStorage.setItem(EXPERIENCE_STORAGE_KEY, mode);
      render(<FxLookSettings />);
      const fine = screen.getByTestId("fx-fine-tune");
      expect(fine.tagName).toBe("DETAILS");
      expect(screen.getByText("Fine tune")).toBeTruthy();
      expect(screen.getByLabelText("Bloom strength")).toBeTruthy();
      expect(screen.getByLabelText("Hue")).toBeTruthy();
    },
  );
});
