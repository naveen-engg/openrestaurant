import type { Context } from ".keystone/types";
import { convertUnits } from "./unitConversion";
import { appendAuditEvent } from "./audit";

type DepletionLine = {
  eventKey: string;
  orderItemId: string;
  ingredientId: string;
  recipeQuantity: number;
  recipeUnit: string;
  portions: number;
  recipeId: string;
  recipeYield: number;
};

export interface DepleteInventoryOptions {
  allowActive?: boolean;
  reason?: string;
}

export async function depleteInventoryForOrder(
  orderId: string,
  context: Context,
  options?: DepleteInventoryOptions
) {
  const sudo = context.sudo();
  const order = await sudo.query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: "id orderNumber status orderItems { id quantity menuItemIdSnapshot menuItem { id name } }",
  });
  if (!order) throw new Error("Order not found");
  if (order.status === "cancelled") {
    throw new Error("Inventory cannot be depleted for a cancelled order");
  }

  // If allowActive is not explicitly true, enforce that order is completed
  if (!options?.allowActive && order.status !== "completed") {
    throw new Error("Inventory can only be depleted for a completed or paid purchase order");
  }

  const lines: DepletionLine[] = [];
  for (const orderItem of order.orderItems || []) {
    const menuItemId = orderItem.menuItem?.id || orderItem.menuItemIdSnapshot;
    if (!menuItemId) continue;

    const recipes = await sudo.query.Recipe.findMany({
      where: { menuItem: { id: { equals: menuItemId } } },
      query: "id name recipeIngredients yield",
      take: 1,
    });
    const recipe = recipes[0];
    if (!recipe || !Array.isArray(recipe.recipeIngredients)) continue;

    const recipeYield = Math.max(1, Number(recipe.yield || 1));
    const portions = Number(orderItem.quantity || 0) / recipeYield;

    for (const recipeIngredient of recipe.recipeIngredients as any[]) {
      const ingredientId = String(recipeIngredient?.ingredientId || "");
      const rawQuantity = Number(recipeIngredient?.quantity || 0);
      if (!ingredientId || !Number.isFinite(rawQuantity) || rawQuantity <= 0) continue;

      lines.push({
        eventKey: `sale:${order.id}:${orderItem.id}:${ingredientId}`,
        orderItemId: orderItem.id,
        ingredientId,
        recipeQuantity: rawQuantity,
        recipeUnit: recipeIngredient?.unit || "each",
        portions,
        recipeId: recipe.id,
        recipeYield,
      });
    }
  }

  const prisma = context.prisma as any;
  const result = await prisma.$transaction(async (tx: any) => {
    let created = 0;
    const depletedItems: Array<{
      ingredientId: string;
      ingredientName: string;
      deductedQuantity: number;
      unit: string;
      remainingStock: number;
    }> = [];

    for (const line of lines) {
      const existing = await tx.stockMovement.findUnique({ where: { eventKey: line.eventKey } });
      if (existing) continue;

      const ingredient = await tx.ingredient.findUnique({ where: { id: line.ingredientId } });
      if (!ingredient) {
        console.warn(`[inventoryLedger] Ingredient ID ${line.ingredientId} not found in database; skipping line.`);
        continue;
      }

      // Calculate total required quantity across all portions of this order item
      const totalRecipeQty = line.recipeQuantity * line.portions;
      // Convert from Recipe Unit to Ingredient Inventory Unit
      const stockUnit = ingredient.unit || line.recipeUnit || "each";
      const convertedQuantity = convertUnits(totalRecipeQty, line.recipeUnit, stockUnit);
      const roundedDeduction = Math.round(convertedQuantity * 100) / 100;

      const currentStock = Number(ingredient.currentStock || 0);
      const nextStock = Math.round((currentStock - roundedDeduction) * 100) / 100;

      await tx.stockMovement.create({
        data: {
          eventKey: line.eventKey,
          referenceType: "OrderItem",
          referenceId: line.orderItemId,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            recipeId: line.recipeId,
            recipeYield: line.recipeYield,
            recipeQuantity: totalRecipeQty,
            recipeUnit: line.recipeUnit,
            ingredientStockUnit: stockUnit,
            deductedQuantity: roundedDeduction,
            theoretical: true,
          },
          ingredientId: line.ingredientId,
          orderId: order.id,
          type: "sale",
          quantity: (-roundedDeduction).toFixed(2),
          reason: options?.reason || `Automatic purchase depletion for order ${order.orderNumber}`,
        },
      });

      await tx.ingredient.update({
        where: { id: line.ingredientId },
        data: { currentStock: nextStock.toFixed(2) },
      });

      depletedItems.push({
        ingredientId: line.ingredientId,
        ingredientName: ingredient.name || "",
        deductedQuantity: roundedDeduction,
        unit: stockUnit,
        remainingStock: nextStock,
      });

      created += 1;
    }

    return { created, existing: lines.length - created, depletedItems };
  }, { isolationLevel: "Serializable" });

  if (result.created > 0) {
    await appendAuditEvent(context, {
      eventType: "inventory.purchase_depleted",
      entityType: "RestaurantOrder",
      entityId: order.id,
      after: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        depletedCount: result.created,
        items: result.depletedItems,
      },
    }).catch((err) => console.error("Inventory audit logging failed:", err));
  }

  return result;
}

/**
 * Backwards compatible alias for depleting inventory for an order
 */
export async function depleteInventoryForCompletedOrder(orderId: string, context: Context) {
  return depleteInventoryForOrder(orderId, context, {
    allowActive: true,
    reason: "Completed order inventory reconciliation",
  });
}
