import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatEmptyState from "../ChatEmptyState";

describe("ChatEmptyState", () => {
  it("asks the suggestion it was clicked on", async () => {
    const user = userEvent.setup();
    const onSuggestion = vi.fn();
    render(<ChatEmptyState onSuggestion={onSuggestion} />);

    await user.click(screen.getByRole("button", { name: "Show me the most popular actors" }));

    expect(onSuggestion).toHaveBeenCalledWith("Show me the most popular actors");
  });
});
