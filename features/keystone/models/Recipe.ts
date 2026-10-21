import { list, graphql } from "@keystone-6/core";
import {
  text,
  relationship,
  integer,
  decimal,
  json,
  virtual
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";
import { convertUnits, calculateIngredientLineCost } from "../utils/unitConversion";

export const Recipe = list({
  access: {
    operation: {
      query: () => true, // Public read for storefront & dashboard
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts,
    },
  },
  ui: {
    listView: {
      initialColumns: ["name", "menuItem", "yield", "totalCost", "costPerServing", "foodCostPercentage"],
    },
    labelField: "name",
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    
    menuItem: relationship({
      ref: 'MenuItem',
      many: false,
    }),

    recipeIngredients: json({
      ui: {
        description: 'Array of { ingredientId: string, quantity: number, unit: string }',
      },
    }),

    yield: integer({
      defaultValue: 1,
      ui: { description: 'Number of servings this recipe produces' },
    }),

    prepTime: integer({
      ui: { description: 'Preparation time in minutes' },
    }),

    instructions: text({
      ui: { displayMode: 'textarea' },
    }),

    totalCost: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          if (!item.recipeIngredients) return 0;
          const ingredients = item.recipeIngredients as any[];
          let total = 0;
          for (const ri of ingredients) {
            if (!ri.ingredientId) continue;
            const ingredient = await context.sudo().query.Ingredient.findOne({
              where: { id: ri.ingredientId },
              query: 'costPerUnit unit'
            });
            if (ingredient?.costPerUnit) {
              total += calculateIngredientLineCost(
                ri.quantity || 0,
                ri.unit || 'each',
                ingredient.costPerUnit,
                ingredient.unit || 'each'
              );
            }
          }
          return Math.round(total * 100) / 100;
        }
      })
    }),

    costPerServing: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          if (!item.recipeIngredients) return 0;
          const ingredients = item.recipeIngredients as any[];
          let total = 0;
          for (const ri of ingredients) {
            if (!ri.ingredientId) continue;
            const ingredient = await context.sudo().query.Ingredient.findOne({
              where: { id: ri.ingredientId },
              query: 'costPerUnit unit'
            });
            if (ingredient?.costPerUnit) {
              total += calculateIngredientLineCost(
                ri.quantity || 0,
                ri.unit || 'each',
                ingredient.costPerUnit,
                ingredient.unit || 'each'
              );
            }
          }
          const recipeYield = Math.max(1, (item as any).yield || 1);
          return Math.round((total / recipeYield) * 100) / 100;
        }
      })
    }),

    foodCostPercentage: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item: any, args, context) {
          if (!item.menuItemId) return 0;
          const menuItem = await context.sudo().query.MenuItem.findOne({
            where: { id: item.menuItemId as string },
            query: 'price'
          });
          const rawPrice = parseFloat(menuItem?.price || '0');
          if (!rawPrice || rawPrice <= 0) return 0;
          
          // MenuItem price is in cents; convert to dollars for comparison with costPerServing
          const priceInDollars = rawPrice > 100 ? rawPrice / 100 : rawPrice;

          if (!item.recipeIngredients) return 0;
          const ingredients = item.recipeIngredients as any[];
          let total = 0;
          for (const ri of ingredients) {
            if (!ri.ingredientId) continue;
            const ingredient = await context.sudo().query.Ingredient.findOne({
              where: { id: ri.ingredientId },
              query: 'costPerUnit unit'
            });
            if (ingredient?.costPerUnit) {
              total += calculateIngredientLineCost(
                ri.quantity || 0,
                ri.unit || 'each',
                ingredient.costPerUnit,
                ingredient.unit || 'each'
              );
            }
          }
          const recipeYield = Math.max(1, item.yield || 1);
          const costPerServing = total / recipeYield;
          return Math.round(((costPerServing / priceInDollars) * 100) * 10) / 10;
        }
      })
    }),

    grossMargin: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item: any, args, context) {
          if (!item.menuItemId) return 0;
          const menuItem = await context.sudo().query.MenuItem.findOne({
            where: { id: item.menuItemId as string },
            query: 'price'
          });
          const rawPrice = parseFloat(menuItem?.price || '0');
          if (!rawPrice || rawPrice <= 0) return 0;
          const priceInDollars = rawPrice > 100 ? rawPrice / 100 : rawPrice;

          if (!item.recipeIngredients) return priceInDollars;
          const ingredients = item.recipeIngredients as any[];
          let total = 0;
          for (const ri of ingredients) {
            if (!ri.ingredientId) continue;
            const ingredient = await context.sudo().query.Ingredient.findOne({
              where: { id: ri.ingredientId },
              query: 'costPerUnit unit'
            });
            if (ingredient?.costPerUnit) {
              total += calculateIngredientLineCost(
                ri.quantity || 0,
                ri.unit || 'each',
                ingredient.costPerUnit,
                ingredient.unit || 'each'
              );
            }
          }
          const recipeYield = Math.max(1, item.yield || 1);
          const costPerServing = total / recipeYield;
          return Math.round((priceInDollars - costPerServing) * 100) / 100;
        }
      })
    }),

    maxPortionsAvailable: virtual({
      field: graphql.field({
        type: graphql.Int,
        async resolve(item: any, args, context) {
          if (!item.recipeIngredients) return 0;
          const ingredients = item.recipeIngredients as any[];
          if (!ingredients.length) return 0;

          const recipeYield = Math.max(1, item.yield || 1);
          let minPortions = Infinity;

          for (const ri of ingredients) {
            if (!ri.ingredientId) continue;
            const rawReqQty = Number(ri.quantity || 0);
            if (rawReqQty <= 0) continue;
            const reqPerServing = rawReqQty / recipeYield;

            const ingredient = await context.sudo().query.Ingredient.findOne({
              where: { id: ri.ingredientId },
              query: 'currentStock unit'
            });
            if (!ingredient) {
              minPortions = 0;
              break;
            }

            const currentStock = Math.max(0, Number(ingredient.currentStock || 0));
            // Convert required quantity per serving to ingredient unit
            const reqInStockUnit = convertUnits(reqPerServing, ri.unit || 'each', ingredient.unit || 'each');
            if (reqInStockUnit <= 0) continue;

            const possiblePortions = Math.floor(currentStock / reqInStockUnit);
            if (possiblePortions < minPortions) {
              minPortions = possiblePortions;
            }
          }

          return minPortions === Infinity ? 0 : minPortions;
        }
      })
    }),

    ...trackingFields,
  },
});

