import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MenuItemPhotoModal, PRESET_FOOD_IMAGES } from "@/features/platform/menu/components/MenuItemPhotoModal";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("MenuItemPhotoModal (Image Assignment & Uploads)", () => {
  const mockItem = {
    id: "item-123",
    name: "Classic Cheeseburger",
    thumbnail: null,
  };
  const mockOnClose = vi.fn();
  const mockOnSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders sample food photos in the preset tab", () => {
    render(
      <MenuItemPhotoModal
        item={mockItem}
        open={true}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    );

    expect(screen.getByText(/Set Image for Classic Cheeseburger/i)).toBeInTheDocument();
    expect(screen.getByText(/Double Cheeseburger/i)).toBeInTheDocument();
    expect(screen.getByText(/Golden French Fries/i)).toBeInTheDocument();
    expect(screen.getByText(/Bacon BBQ Burger/i)).toBeInTheDocument();
  });

  it("selects a preset photo and enables the Save button", async () => {
    render(
      <MenuItemPhotoModal
        item={mockItem}
        open={true}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    );

    const presetButton = screen.getByText("Double Cheeseburger").closest("button");
    expect(presetButton).toBeInTheDocument();

    fireEvent.click(presetButton!);

    const saveButton = screen.getByRole("button", { name: /Save Photo/i });
    expect(saveButton).not.toBeDisabled();
  });

  it("submits the selected preset to /api/platform/menu-item-image and invokes onSaved", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        menuItem: {
          id: "item-123",
          name: "Classic Cheeseburger",
          thumbnail: "/images/classic-hamburger-with-lettuce-tomato.jpg",
        },
      }),
    });

    render(
      <MenuItemPhotoModal
        item={mockItem}
        open={true}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    );

    // Click Classic Cheeseburger preset
    const presetButton = screen.getByText("Classic Cheeseburger").closest("button");
    fireEvent.click(presetButton!);

    // Click Save Photo
    const saveButton = screen.getByRole("button", { name: /Save Photo/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/platform/menu-item-image",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            menuItemId: "item-123",
            imagePath: "/images/classic-hamburger-with-lettuce-tomato.jpg",
            altText: "Classic Cheeseburger photo",
          }),
        })
      );
      expect(mockOnSaved).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it("handles custom file upload selection", async () => {
    render(
      <MenuItemPhotoModal
        item={mockItem}
        open={true}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    );

    // Switch to Upload tab
    const uploadTab = screen.getByRole("button", { name: /Upload File/i });
    fireEvent.click(uploadTab);

    expect(screen.getByText(/Click to select an image file/i)).toBeInTheDocument();
  });
});
