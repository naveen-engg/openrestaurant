import { NextResponse } from "next/server";
import { keystoneContext } from "@/features/keystone/context";
import { seedInventoryBOM } from "@/features/keystone/utils/seedInventoryBOM";

export async function POST(req: Request) {
  try {
    const result = await seedInventoryBOM(keystoneContext);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error seeding BOMs:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to seed BOMs",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const sudo = keystoneContext.sudo();
    const [recipes, menuItems, ingredients] = await Promise.all([
      sudo.query.Recipe.findMany({
        query: "id name yield prepTime totalCost costPerServing foodCostPercentage menuItem { id name price }",
      }),
      sudo.query.MenuItem.findMany({
        query: "id name price available",
      }),
      sudo.query.Ingredient.findMany({
        query: "id name unit currentStock parLevel costPerUnit",
      }),
    ]);

    const itemsWithBom = new Set(recipes.map((r: any) => r.menuItem?.id).filter(Boolean));
    const coverage = menuItems.length > 0 ? (itemsWithBom.size / menuItems.length) * 100 : 0;

    return NextResponse.json({
      success: true,
      totalMenuItems: menuItems.length,
      menuItemsWithBOM: itemsWithBom.size,
      bomCoveragePercentage: Math.round(coverage * 10) / 10,
      totalIngredients: ingredients.length,
      recipesCount: recipes.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error getting BOM stats" },
      { status: 500 }
    );
  }
}
