import crypto from "crypto";
import type { Context } from ".keystone/types";
import { calculateRestaurantTotals } from "../../lib/restaurant-order-pricing";
import { permissions } from "../access";
import { getStoreDeliverySettings } from "../utils/deliveryValidation";
import { appendAuditEvent } from "../utils/audit";
import { getOrderItemsSubtotal } from "../utils/orderItemFinancials";
import { syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";

interface SplitCheckResult {
  success: boolean;
  newOrderIds: string[];
  error: string | null;
}

function splitKey(orderId: string, itemIds: string[]) {
  return crypto.createHash("sha256").update(`split:${orderId}:${[...itemIds].sort().join(":")}`).digest("hex");
}

function buildSplitOrderNumber() {
  return `SPL-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function splitCheckByItem(
  _root: unknown,
  args: { orderId: string; itemIds: string[] },
  context: Context
): Promise<SplitCheckResult> {
  if (!permissions.canManageOrders({ session: context.session })) {
    return { success: false, newOrderIds: [], error: "Not authorized to split check" };
  }
  try {
    const itemIds = Array.from(new Set(args.itemIds || []));
    if (!itemIds.length) throw new Error("Must select at least one item to split");
    const settings = await getStoreDeliverySettings(context);
    const key = splitKey(args.orderId, itemIds);
    const prisma = context.prisma as any;
    const result = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.orderAdjustment.findUnique({ where: { idempotencyKey: key } });
      if (existing?.metadata?.newOrderId) {
        return { originalOrderId: args.orderId, newOrderId: existing.metadata.newOrderId, replay: true };
      }
      const order = await tx.restaurantOrder.findUnique({
        where: { id: args.orderId },
        include: { tables: true, orderItems: true },
      });
      if (!order) throw new Error("Order not found");
      if (["completed", "cancelled"].includes(order.status || "")) throw new Error("Closed checks cannot be split");
      const reservedPayments = await tx.payment.count({
        where: { orderId: order.id, status: { in: ["processing", "authorized", "succeeded", "unknown"] } },
      });
      if (reservedPayments) throw new Error("A check with reserved or successful tenders cannot be split");
      const selected = order.orderItems.filter((item: any) => itemIds.includes(item.id));
      if (selected.length !== itemIds.length) throw new Error("One or more selected items do not belong to this check");
      if (selected.length === order.orderItems.length) throw new Error("At least one item must remain on the original check");

      const originalSubtotalBefore = getOrderItemsSubtotal(order.orderItems);
      const movedSubtotal = getOrderItemsSubtotal(selected);
      const remainingItems = order.orderItems.filter((item: any) => !itemIds.includes(item.id));
      const remainingSubtotal = getOrderItemsSubtotal(remainingItems);
      const ratio = originalSubtotalBefore > 0 ? movedSubtotal / originalSubtotalBefore : 0;
      const movedTip = Math.round(Number(order.tip || 0) * ratio);
      const movedDiscount = Math.round(Number(order.discount || 0) * ratio);
      const remainingTip = Number(order.tip || 0) - movedTip;
      const remainingDiscount = Number(order.discount || 0) - movedDiscount;
      const movedPricing = calculateRestaurantTotals({
        subtotal: movedSubtotal,
        orderType: order.orderType,
        taxRate: settings?.taxRate,
        currencyCode: settings?.currencyCode || order.currencyCode || "USD",
      });
      const remainingPricing = calculateRestaurantTotals({
        subtotal: remainingSubtotal,
        orderType: order.orderType,
        taxRate: settings?.taxRate,
        currencyCode: settings?.currencyCode || order.currencyCode || "USD",
      });
      const movedTotal = Math.max(0, movedSubtotal + movedPricing.tax + movedTip - movedDiscount);
      const remainingTotal = Math.max(0, remainingSubtotal + remainingPricing.tax + remainingTip - remainingDiscount);

      const newOrder = await tx.restaurantOrder.create({
        data: {
          orderNumber: buildSplitOrderNumber(),
          orderType: order.orderType,
          orderSource: order.orderSource,
          status: order.status,
          guestCount: 1,
          specialInstructions: order.specialInstructions || "",
          subtotal: movedSubtotal,
          tax: movedPricing.tax,
          tip: movedTip,
          discount: movedDiscount,
          total: movedTotal,
          currencyCode: order.currencyCode,
          customerId: order.customerId,
          serverId: order.serverId,
          createdById: context.session?.itemId || order.createdById,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          deliveryAddress: order.deliveryAddress,
          deliveryAddress2: order.deliveryAddress2,
          deliveryCity: order.deliveryCity,
          deliveryState: order.deliveryState,
          deliveryZip: order.deliveryZip,
          deliveryCountryCode: order.deliveryCountryCode,
          tables: order.tables.length ? { connect: order.tables.map((table: any) => ({ id: table.id })) } : undefined,
        },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: itemIds }, orderId: order.id },
        data: { orderId: newOrder.id, originalOrderIdSnapshot: order.id },
      });
      await tx.restaurantOrder.update({
        where: { id: order.id },
        data: {
          subtotal: remainingSubtotal,
          tax: remainingPricing.tax,
          tip: remainingTip,
          discount: remainingDiscount,
          total: remainingTotal,
        },
      });
      await tx.orderAdjustment.create({
        data: {
          idempotencyKey: key,
          type: "split",
          amount: movedTotal,
          reason: "Item split",
          metadata: { newOrderId: newOrder.id, itemIds, originalOrderId: order.id },
          orderId: order.id,
          actorId: context.session?.itemId || null,
          approvedById: context.session?.itemId || null,
        },
      });
      return { originalOrderId: order.id, newOrderId: newOrder.id, replay: false };
    }, { isolationLevel: "Serializable" });

    if (!result.replay) {
      await appendAuditEvent(context, {
        eventType: "check.split_by_item",
        entityType: "RestaurantOrder",
        entityId: args.orderId,
        after: { newOrderId: result.newOrderId, itemIds },
        metadata: { idempotencyKey: key },
      }).catch((error) => console.error("Split audit event failed:", error));
      await Promise.all([
        syncKitchenTicketsForOrder(result.originalOrderId, context),
        syncKitchenTicketsForOrder(result.newOrderId, context),
      ]);
    }
    return { success: true, newOrderIds: [result.newOrderId], error: null };
  } catch (error) {
    return { success: false, newOrderIds: [], error: error instanceof Error ? error.message : "Unknown error" };
  }
}

import { splitEvenly } from "../../platform/pos/splitUtils";

export async function splitCheckByGuest(
  _root: unknown,
  args: { orderId: string; guestCount: number },
  context: Context
): Promise<SplitCheckResult> {
  if (!permissions.canManageOrders({ session: context.session })) {
    return { success: false, newOrderIds: [], error: "Not authorized to split check" };
  }
  try {
    const guestCount = Math.max(1, Math.floor(Number(args.guestCount || 1)));
    if (guestCount <= 1) throw new Error("Guest count must be at least 2 to split check");

    const prisma = context.prisma as any;
    const key = crypto.createHash("sha256").update(`guest-split:${args.orderId}:${guestCount}`).digest("hex");

    const result = await prisma.$transaction(async (tx: any) => {
      const order = await tx.restaurantOrder.findUnique({
        where: { id: args.orderId },
        include: { tables: true, orderItems: true },
      });
      if (!order) throw new Error("Order not found");
      if (["completed", "cancelled"].includes(order.status || "")) throw new Error("Closed checks cannot be split");

      const reservedPayments = await tx.payment.count({
        where: { orderId: order.id, status: { in: ["processing", "authorized", "succeeded", "unknown"] } },
      });
      if (reservedPayments) throw new Error("A check with reserved or successful tenders cannot be split");

      const shares = splitEvenly(Number(order.total || 0), guestCount);
      const subtotalShares = splitEvenly(Number(order.subtotal || 0), guestCount);
      const taxShares = splitEvenly(Number(order.tax || 0), guestCount);
      const tipShares = splitEvenly(Number(order.tip || 0), guestCount);
      const discountShares = splitEvenly(Number(order.discount || 0), guestCount);

      // Update original check for Guest 1
      await tx.restaurantOrder.update({
        where: { id: order.id },
        data: {
          guestCount: 1,
          subtotal: subtotalShares[0].amount,
          tax: taxShares[0].amount,
          tip: tipShares[0].amount,
          discount: discountShares[0].amount,
          total: shares[0].amount,
        },
      });

      const newOrderIds: string[] = [];

      // Create new checks for Guests 2..N
      for (let i = 1; i < guestCount; i++) {
        const newOrder = await tx.restaurantOrder.create({
          data: {
            orderNumber: buildSplitOrderNumber(),
            orderType: order.orderType,
            orderSource: order.orderSource,
            status: order.status,
            guestCount: 1,
            specialInstructions: `Guest ${i + 1} split of #${order.orderNumber}`,
            subtotal: subtotalShares[i].amount,
            tax: taxShares[i].amount,
            tip: tipShares[i].amount,
            discount: discountShares[i].amount,
            total: shares[i].amount,
            currencyCode: order.currencyCode,
            customerId: order.customerId,
            serverId: order.serverId,
            createdById: context.session?.itemId || order.createdById,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            customerPhone: order.customerPhone,
            deliveryAddress: order.deliveryAddress,
            deliveryAddress2: order.deliveryAddress2,
            deliveryCity: order.deliveryCity,
            deliveryState: order.deliveryState,
            deliveryZip: order.deliveryZip,
            deliveryCountryCode: order.deliveryCountryCode,
            tables: order.tables.length ? { connect: order.tables.map((table: any) => ({ id: table.id })) } : undefined,
          },
        });
        newOrderIds.push(newOrder.id);
      }

      await tx.orderAdjustment.create({
        data: {
          idempotencyKey: key,
          type: "split",
          amount: Number(order.total || 0) - shares[0].amount,
          reason: `Split evenly across ${guestCount} guests`,
          metadata: { originalOrderId: order.id, newOrderIds, guestCount },
          orderId: order.id,
          actorId: context.session?.itemId || null,
          approvedById: context.session?.itemId || null,
        },
      });

      return { originalOrderId: order.id, newOrderIds };
    }, { isolationLevel: "Serializable" });

    await appendAuditEvent(context, {
      eventType: "check.split_by_guest",
      entityType: "RestaurantOrder",
      entityId: args.orderId,
      after: { newOrderIds: result.newOrderIds, guestCount },
      metadata: { idempotencyKey: key },
    }).catch((error) => console.error("Guest split audit event failed:", error));

    return { success: true, newOrderIds: result.newOrderIds, error: null };
  } catch (error) {
    return { success: false, newOrderIds: [], error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function updateOrderItemSeat(
  _root: unknown,
  args: { orderItemId: string; seatNumber: number },
  context: Context
) {
  if (!permissions.canManageOrders({ session: context.session })) {
    return { success: false, orderItemId: null, seatNumber: null, error: "Not authorized to update seat" };
  }
  try {
    const seatNumber = Math.max(1, Math.floor(Number(args.seatNumber || 1)));
    const updated = await context.sudo().db.OrderItem.updateOne({
      where: { id: args.orderItemId },
      data: { seatNumber },
    });
    return { success: true, orderItemId: updated.id, seatNumber: updated.seatNumber, error: null };
  } catch (error) {
    return {
      success: false,
      orderItemId: null,
      seatNumber: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
