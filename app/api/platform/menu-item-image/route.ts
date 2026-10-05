import { NextRequest, NextResponse } from "next/server";
import { keystoneContext } from "@/features/keystone/context";
import fs from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let menuItemId = "";
    let imagePath = "";
    let altText = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      menuItemId = (formData.get("menuItemId") as string) || "";
      altText = (formData.get("altText") as string) || "";
      const pathParam = formData.get("imagePath") as string;
      const file = formData.get("file") as File | null;

      if (file && file.size > 0) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const cleanName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const uploadDir = path.join(process.cwd(), "public", "images");
        await fs.mkdir(uploadDir, { recursive: true });
        const filePath = path.join(uploadDir, cleanName);
        await fs.writeFile(filePath, buffer);
        imagePath = `/images/${cleanName}`;
      } else if (pathParam) {
        imagePath = pathParam;
      }
    } else {
      const json = await req.json();
      menuItemId = json.menuItemId || "";
      imagePath = json.imagePath || "";
      altText = json.altText || "";
    }

    if (!menuItemId) {
      return NextResponse.json(
        { error: "menuItemId is required" },
        { status: 400 }
      );
    }

    if (!imagePath) {
      return NextResponse.json(
        { error: "image file or imagePath is required" },
        { status: 400 }
      );
    }

    const sudo = keystoneContext.sudo();

    // Verify the menu item exists
    const existingItem = await sudo.query.MenuItem.findOne({
      where: { id: menuItemId },
      query: "id name",
    });

    if (!existingItem) {
      return NextResponse.json(
        { error: `Menu item not found: ${menuItemId}` },
        { status: 404 }
      );
    }

    // Create the MenuItemImage record connected to the item
    const createdImage = await sudo.db.MenuItemImage.createOne({
      data: {
        imagePath,
        altText: altText || `${existingItem.name} photo`,
        menuItems: {
          connect: [{ id: menuItemId }],
        },
      },
    });

    // Query updated menu item with its new thumbnail
    const updatedMenuItem = await sudo.query.MenuItem.findOne({
      where: { id: menuItemId },
      query: "id name thumbnail menuItemImages { id imagePath altText }",
    });

    return NextResponse.json({
      success: true,
      image: createdImage,
      menuItem: updatedMenuItem,
    });
  } catch (error: any) {
    console.error("Error saving menu item image:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save image" },
      { status: 500 }
    );
  }
}
