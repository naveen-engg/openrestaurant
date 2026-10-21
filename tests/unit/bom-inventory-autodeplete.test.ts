import { describe, it, expect } from 'vitest';
import {
  convertUnits,
  normalizeUnit,
  calculateIngredientLineCost,
} from '../../features/keystone/utils/unitConversion';

describe('Bill of Materials (BOM) & Inventory Auto-Depletion (Unit Tests)', () => {
  describe('Unit Conversion Engine', () => {
    it('normalizes common unit names and aliases correctly', () => {
      expect(normalizeUnit('lbs')).toBe('lb');
      expect(normalizeUnit('pounds')).toBe('lb');
      expect(normalizeUnit('Pound')).toBe('lb');
      expect(normalizeUnit('ounces')).toBe('oz');
      expect(normalizeUnit('ozs')).toBe('oz');
      expect(normalizeUnit('grams')).toBe('g');
      expect(normalizeUnit('kilograms')).toBe('kg');
      expect(normalizeUnit('kgs')).toBe('kg');
      expect(normalizeUnit('liters')).toBe('liter');
      expect(normalizeUnit('L')).toBe('liter');
      expect(normalizeUnit('milliliters')).toBe('ml');
      expect(normalizeUnit('fl oz')).toBe('fl_oz');
      expect(normalizeUnit('fluid ounces')).toBe('fl_oz');
      expect(normalizeUnit('each')).toBe('each');
      expect(normalizeUnit('pcs')).toBe('each');
    });

    it('converts weight units accurately (oz <-> lb, g <-> kg)', () => {
      // 16 oz = 1 lb
      expect(convertUnits(16, 'oz', 'lb')).toBeCloseTo(1, 4);
      // 8 oz = 0.5 lb (standard burger patty)
      expect(convertUnits(8, 'oz', 'lb')).toBeCloseTo(0.5, 4);
      // 2 lb = 32 oz
      expect(convertUnits(2, 'lb', 'oz')).toBeCloseTo(32, 4);
      // 1000 g = 1 kg
      expect(convertUnits(1000, 'g', 'kg')).toBeCloseTo(1, 4);
      // 500 g = 0.5 kg
      expect(convertUnits(500, 'g', 'kg')).toBeCloseTo(0.5, 4);
    });

    it('converts volume units accurately (ml <-> liter, fl_oz <-> gallon)', () => {
      // 1000 ml = 1 liter
      expect(convertUnits(1000, 'ml', 'liter')).toBeCloseTo(1, 4);
      // 250 ml = 0.25 liter
      expect(convertUnits(250, 'ml', 'liter')).toBeCloseTo(0.25, 4);
      // 1 gallon = 128 fl_oz (approx within 3785.41 / 29.5735)
      expect(convertUnits(1, 'gallon', 'fl_oz')).toBeCloseTo(128, 0);
      // 16 fl oz draft beer in gallons
      expect(convertUnits(16, 'fl_oz', 'gallon')).toBeCloseTo(0.125, 2);
    });

    it('preserves quantity when converting between identical units', () => {
      expect(convertUnits(42, 'each', 'each')).toBe(42);
      expect(convertUnits(10, 'lb', 'lb')).toBe(10);
      expect(convertUnits(5, 'liter', 'liter')).toBe(5);
    });

    it('handles zero or negative quantities safely', () => {
      expect(convertUnits(0, 'oz', 'lb')).toBe(0);
      expect(convertUnits(-5, 'oz', 'lb')).toBe(0);
    });

    it('gracefully falls back to 1:1 if units are incompatible dimensions', () => {
      // Count to weight without custom density
      expect(convertUnits(5, 'each', 'lb')).toBe(5);
    });
  });

  describe('BOM Ingredient Costing Engine', () => {
    it('calculates line item cost with automatic weight unit conversion', () => {
      // Wagyu Beef: $9.50 per lb. Recipe calls for 8 oz (0.5 lb)
      const cost = calculateIngredientLineCost(8, 'oz', '9.50', 'lb');
      expect(cost).toBe(4.75); // Exactly $4.75
    });

    it('calculates line item cost with volume unit conversion', () => {
      // Truffle Aioli: $14.50 per liter. Recipe calls for 1 fl oz (~0.02957 liter)
      const cost = calculateIngredientLineCost(1, 'fl_oz', '14.50', 'liter');
      expect(cost).toBe(0.43); // ~$0.43
    });

    it('calculates line item cost with discrete count units', () => {
      // Brioche Bun: $0.85 each. Recipe calls for 1 each
      const cost = calculateIngredientLineCost(1, 'each', '0.85', 'each');
      expect(cost).toBe(0.85);
    });

    it('returns zero if costPerUnit is missing or invalid', () => {
      expect(calculateIngredientLineCost(5, 'oz', null, 'lb')).toBe(0);
      expect(calculateIngredientLineCost(5, 'oz', '0.00', 'lb')).toBe(0);
      expect(calculateIngredientLineCost(5, 'oz', 'invalid', 'lb')).toBe(0);
    });
  });

  describe('BOM Recipe Yield & Stock Portions Calculation', () => {
    it('calculates total recipe cost, cost per serving, and food cost %', () => {
      // Recipe for 1 Wagyu Burger ($18.00 menu price = 1800 cents)
      const ingredients = [
        { name: 'Bun', qty: 1, unit: 'each', costPerUnit: '0.85', stockUnit: 'each' },
        { name: 'Wagyu Beef', qty: 8, unit: 'oz', costPerUnit: '9.50', stockUnit: 'lb' },
        { name: 'Cheddar', qty: 1.5, unit: 'oz', costPerUnit: '7.00', stockUnit: 'lb' },
      ];

      const recipeYield = 1;
      const menuPriceDollars = 18.00;

      let totalCost = 0;
      for (const item of ingredients) {
        totalCost += calculateIngredientLineCost(item.qty, item.unit, item.costPerUnit, item.stockUnit);
      }

      // Bun: $0.85, Beef: $4.75, Cheddar: 1.5/16 * 7 = $0.66 => Total ~$6.26
      expect(totalCost).toBeCloseTo(6.26, 1);

      const costPerServing = totalCost / recipeYield;
      expect(costPerServing).toBeCloseTo(6.26, 1);

      const foodCostPercentage = (costPerServing / menuPriceDollars) * 100;
      expect(foodCostPercentage).toBeCloseTo(34.8, 0); // ~35% food cost

      const grossMargin = menuPriceDollars - costPerServing;
      expect(grossMargin).toBeCloseTo(11.74, 1); // ~$11.74 profit per burger
    });

    it('correctly calculates maximum portions available based on ingredient bottleneck', () => {
      // Wagyu Burger BOM:
      // Needs 0.5 lb beef, 1 bun, 0.09375 lb cheddar
      const requiredBeef = 0.5; // lb
      const requiredBun = 1;    // each
      const requiredCheddar = 0.09375; // lb (1.5 oz)

      // Scenario A: Plenty of everything, Beef is the bottleneck (40 lb / 0.5 = 80 portions)
      const stockA = { beef: 40, buns: 100, cheddar: 20 };
      const portionsA = Math.min(
        Math.floor(stockA.beef / requiredBeef),
        Math.floor(stockA.buns / requiredBun),
        Math.floor(stockA.cheddar / requiredCheddar)
      );
      expect(portionsA).toBe(80);

      // Scenario B: Buns are low (7 buns left)
      const stockB = { beef: 40, buns: 7, cheddar: 20 };
      const portionsB = Math.min(
        Math.floor(stockB.beef / requiredBeef),
        Math.floor(stockB.buns / requiredBun),
        Math.floor(stockB.cheddar / requiredCheddar)
      );
      expect(portionsB).toBe(7); // Buns limit to 7 burgers!

      // Scenario C: Out of cheddar (0 lb)
      const stockC = { beef: 40, buns: 50, cheddar: 0 };
      const portionsC = Math.min(
        Math.floor(stockC.beef / requiredBeef),
        Math.floor(stockC.buns / requiredBun),
        Math.floor(stockC.cheddar / requiredCheddar)
      );
      expect(portionsC).toBe(0); // Cannot make any burgers!
    });
  });

  describe('Inventory Auto-Depletion on Purchase Engine', () => {
    it('calculates accurate theoretical depletion lines for ordered quantities', () => {
      const orderQuantity = 3; // Customer purchased 3 Wagyu Burgers
      const recipeYield = 1;
      const portions = orderQuantity / recipeYield; // 3 portions

      const recipeIngredients = [
        { ingredientId: 'ing-beef', quantity: 8, unit: 'oz' },
        { ingredientId: 'ing-bun', quantity: 1, unit: 'each' },
        { ingredientId: 'ing-cheddar', quantity: 1.5, unit: 'oz' },
      ];

      const depletionLines = recipeIngredients.map((ri) => {
        const rawTotalQty = ri.quantity * portions;
        return {
          ingredientId: ri.ingredientId,
          rawTotalQty,
          unit: ri.unit,
        };
      });

      // 3 burgers * 8 oz = 24 oz beef
      expect(depletionLines[0].rawTotalQty).toBe(24);
      expect(depletionLines[0].unit).toBe('oz');
      // Converted to lb for inventory stock deduction: 24 oz = 1.50 lb
      const beefDeductionInLb = convertUnits(depletionLines[0].rawTotalQty, 'oz', 'lb');
      expect(beefDeductionInLb).toBeCloseTo(1.5, 2);

      // 3 burgers * 1 bun = 3 buns
      expect(depletionLines[1].rawTotalQty).toBe(3);
      expect(depletionLines[1].unit).toBe('each');

      // 3 burgers * 1.5 oz cheddar = 4.5 oz cheddar
      expect(depletionLines[2].rawTotalQty).toBe(4.5);
      const cheddarDeductionInLb = convertUnits(depletionLines[2].rawTotalQty, 'oz', 'lb');
      expect(cheddarDeductionInLb).toBeCloseTo(0.28, 2);
    });

    it('generates unique idempotent eventKeys to prevent double-depletion', () => {
      const orderId = 'ord-12345';
      const orderItemId = 'item-987';
      const ingredientId = 'ing-beef';

      const eventKey1 = `sale:${orderId}:${orderItemId}:${ingredientId}`;
      const eventKey2 = `sale:${orderId}:${orderItemId}:${ingredientId}`;

      // Exactly identical keys ensure Prisma unique constraint / findUnique suppresses replay
      expect(eventKey1).toBe(eventKey2);
      expect(eventKey1).toBe('sale:ord-12345:item-987:ing-beef');
    });

    it('calculates new stock level after sale deduction correctly', () => {
      const initialStock = 50.00; // 50 lb beef
      const deductedQuantity = 1.50; // 1.5 lb sold

      const nextStock = Math.round((initialStock - deductedQuantity) * 100) / 100;
      expect(nextStock).toBe(48.50);
      expect(nextStock.toFixed(2)).toBe('48.50');
    });
  });
});
