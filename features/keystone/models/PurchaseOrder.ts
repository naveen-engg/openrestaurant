import { list, graphql } from "@keystone-6/core";
import {
  text,
  relationship,
  select,
  timestamp,
  decimal,
  json,
  virtual
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const PurchaseOrder = list({
  access: {
    operation: {
      query: permissions.canReadInventory,
      create: permissions.canManageInventory,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory,
    },
  },
  ui: {
    listView: {
      initialColumns: ["poNumber", "vendor", "orderDate", "status", "totalCost"],
    },
    labelField: "poNumber",
  },
  fields: {
    poNumber: text({
      validation: { isRequired: true },
      isIndexed: 'unique',
    }),

    orderDate: timestamp({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
    }),

    expectedDelivery: timestamp({
      ui: { description: "Expected delivery date" },
    }),

    receivedDate: timestamp({
      ui: { description: "Actual received date" },
    }),

    status: select({
      type: "string",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Sent", value: "sent" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Shipped", value: "shipped" },
        { label: "Received", value: "received" },
        { label: "Cancelled", value: "cancelled" },
      ],
      defaultValue: "draft",
    }),

    lineItems: json({
      ui: {
        description: "Array of { ingredientId, ingredientName, quantity, unit, unitCost, totalCost }",
      },
    }),

    totalCost: virtual({
      field: graphql.field({
        type: graphql.Float,
        resolve(item) {
          if (!item.lineItems) return 0;
          const items = item.lineItems as any[];
          return items.reduce((sum, li) => sum + (li.totalCost || 0), 0);
        }
      })
    }),

    notes: text({
      ui: { displayMode: "textarea" },
    }),

    // Relationships
    vendor: relationship({
      ref: "Vendor",
      ui: {
        displayMode: "select",
      },
    }),

    createdBy: relationship({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
      },
    }),

    ...trackingFields,
  },
  hooks: {
    afterOperation: async ({ operation, item, originalItem, context }) => {
      if (!item) return;
      const currentStatus = (item as any).status;
      const previousStatus = (originalItem as any)?.status;

      // When PO is created as received or transitioned to received, replenish ingredient stock
      if (currentStatus === 'received' && (operation === 'create' || previousStatus !== 'received')) {
        const poId = (item as any).id;
        const poNumber = (item as any).poNumber;
        const lineItems = (item as any).lineItems as Array<{
          ingredientId?: string;
          ingredientName?: string;
          quantity?: number;
          unit?: string;
          unitCost?: number;
          totalCost?: number;
        }> | null;

        if (Array.isArray(lineItems) && lineItems.length > 0) {
          const prisma = context.prisma as any;
          for (const line of lineItems) {
            const ingId = String(line.ingredientId || '');
            const qty = Number(line.quantity || 0);
            if (!ingId || !Number.isFinite(qty) || qty <= 0) continue;

            const eventKey = `po:${poId}:${ingId}`;
            const existingMovement = await prisma.stockMovement.findUnique({ where: { eventKey } });
            if (!existingMovement) {
              const ingredient = await prisma.ingredient.findUnique({ where: { id: ingId } });
              if (ingredient) {
                const currentStock = Number(ingredient.currentStock || 0);
                const nextStock = Math.round((currentStock + qty) * 100) / 100;

                await prisma.stockMovement.create({
                  data: {
                    eventKey,
                    referenceType: "PurchaseOrder",
                    referenceId: poId,
                    metadata: {
                      poId,
                      poNumber,
                      ingredientName: line.ingredientName || ingredient.name,
                      quantity: qty,
                      unit: line.unit || ingredient.unit,
                      unitCost: line.unitCost,
                      totalCost: line.totalCost,
                    },
                    ingredientId: ingId,
                    type: "delivery",
                    quantity: qty.toFixed(2),
                    reason: `Delivery replenishment from PO ${poNumber}`,
                  },
                });

                await prisma.ingredient.update({
                  where: { id: ingId },
                  data: { currentStock: nextStock.toFixed(2) },
                });
              }
            }
          }
        }
      }
    },
  },
});
