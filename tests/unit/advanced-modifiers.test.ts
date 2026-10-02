import { describe, it, expect } from 'vitest';
import {
  calculateItemPriceWithModifiers,
  validateModifierGroup,
  validateAllModifierGroups,
  validateComboSelections,
  formatModifierDisplay,
  type ModifierGroup,
  type ComboMealDefinition,
} from '@/features/keystone/modifierUtils';

describe('Stage 4: Advanced Modifiers & Combo Menus (Unit Tests)', () => {
  describe('Price Calculation Engine', () => {
    it('calculates base price when no modifiers or swaps are present', () => {
      const price = calculateItemPriceWithModifiers(1500, []);
      expect(price).toBe(1500); // $15.00
    });

    it('adds modifier adjustments to base price', () => {
      const modifiers = [
        { priceAdjustment: 200 }, // +$2.00 bacon
        { priceAdjustment: 150 }, // +$1.50 avocado
      ];
      const price = calculateItemPriceWithModifiers(1400, modifiers);
      expect(price).toBe(1750); // $17.50
    });

    it('handles negative price adjustments (e.g., removals)', () => {
      const modifiers = [
        { priceAdjustment: -100 }, // -$1.00 cheese removal discount
      ];
      const price = calculateItemPriceWithModifiers(1200, modifiers);
      expect(price).toBe(1100); // $11.00
    });

    it('clamps item price to zero if negative adjustments exceed base price', () => {
      const modifiers = [{ priceAdjustment: -5000 }];
      const price = calculateItemPriceWithModifiers(1000, modifiers);
      expect(price).toBe(0);
    });

    it('incorporates combo slot swap upcharges', () => {
      const modifiers = [{ priceAdjustment: 100 }];
      const swaps = [{ swapPriceAdjustment: 250 }]; // +$2.50 swap fries for onion rings
      const price = calculateItemPriceWithModifiers(1800, modifiers, swaps);
      expect(price).toBe(2150); // $21.50
    });
  });

  describe('Modifier Group Validation Rules', () => {
    const meatTempGroup: ModifierGroup = {
      id: 'grp-temp',
      name: 'temperature',
      label: 'Meat Temperature',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: 'opt-rare', name: 'Rare', modifierGroup: 'temperature' },
        { id: 'opt-med-rare', name: 'Medium Rare', modifierGroup: 'temperature' },
        { id: 'opt-well', name: 'Well Done', modifierGroup: 'temperature' },
      ],
    };

    const toppingsGroup: ModifierGroup = {
      id: 'grp-toppings',
      name: 'toppings',
      label: 'Extra Toppings',
      required: false,
      minSelections: 0,
      maxSelections: 3,
      options: [
        { id: 'opt-bacon', name: 'Crispy Bacon', modifierGroup: 'toppings', priceAdjustment: 200 },
        { id: 'opt-avo', name: 'Fresh Avocado', modifierGroup: 'toppings', priceAdjustment: 150 },
        { id: 'opt-jalapeno', name: 'Pickled Jalapenos', modifierGroup: 'toppings', priceAdjustment: 75 },
        { id: 'opt-egg', name: 'Fried Egg', modifierGroup: 'toppings', priceAdjustment: 150 },
      ],
    };

    it('passes when required single-choice group has exactly 1 selection', () => {
      const result = validateModifierGroup(meatTempGroup, ['opt-med-rare']);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('fails when required group has 0 selections', () => {
      const result = validateModifierGroup(meatTempGroup, []);
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/at least 1 option for "Meat Temperature"/);
    });

    it('fails when single-choice group has more than 1 selection', () => {
      const result = validateModifierGroup(meatTempGroup, ['opt-rare', 'opt-well']);
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/at most 1 option for "Meat Temperature"/);
    });

    it('passes when optional group has 0 selections', () => {
      const result = validateModifierGroup(toppingsGroup, []);
      expect(result.isValid).toBe(true);
    });

    it('fails when selection count exceeds max allowed choices', () => {
      const result = validateModifierGroup(toppingsGroup, [
        'opt-bacon',
        'opt-avo',
        'opt-jalapeno',
        'opt-egg',
      ]);
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/at most 3 options for "Extra Toppings"/);
    });

    it('validates across all modifier groups on an item', () => {
      const allGroups = [meatTempGroup, toppingsGroup];

      // Missing required temp
      const invalid = validateAllModifierGroups(allGroups, ['opt-bacon']);
      expect(invalid.isValid).toBe(false);
      expect(invalid.errors.length).toBe(1);
      expect(invalid.errors[0]).toMatch(/Meat Temperature/);

      // Valid: required temp + 2 optional toppings
      const valid = validateAllModifierGroups(allGroups, ['opt-med-rare', 'opt-bacon', 'opt-avo']);
      expect(valid.isValid).toBe(true);
      expect(valid.errors.length).toBe(0);
    });
  });

  describe('Combo Meal Slot Validation', () => {
    const burgerCombo: ComboMealDefinition = {
      id: 'combo-burger',
      name: 'Classic Burger Meal Combo',
      basePrice: 1850,
      slots: [
        {
          id: 'slot-main',
          name: 'Choose Your Burger',
          required: true,
          options: [
            { id: 'opt-cheeseburger', name: 'Prime Cheeseburger', swapPriceAdjustment: 0 },
            { id: 'opt-bacon-swiss', name: 'Bacon Swiss Burger', swapPriceAdjustment: 150 },
          ],
        },
        {
          id: 'slot-side',
          name: 'Choose Your Side',
          required: true,
          options: [
            { id: 'opt-french-fries', name: 'Crispy French Fries', swapPriceAdjustment: 0 },
            { id: 'opt-truffle-fries', name: 'Truffle Parmesan Fries', swapPriceAdjustment: 250 },
            { id: 'opt-side-salad', name: 'Garden Side Salad', swapPriceAdjustment: 100 },
          ],
        },
        {
          id: 'slot-drink',
          name: 'Choose Beverage',
          required: false,
          options: [
            { id: 'opt-soda', name: 'Fountain Soda', swapPriceAdjustment: 0 },
            { id: 'opt-beer', name: 'Local IPA Pint', swapPriceAdjustment: 400 },
          ],
        },
      ],
    };

    it('passes when all required combo slots are selected', () => {
      const selections = [
        { slotId: 'slot-main', optionId: 'opt-cheeseburger' },
        { slotId: 'slot-side', optionId: 'opt-truffle-fries' },
      ];
      const result = validateComboSelections(burgerCombo, selections);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('fails when a required combo slot is missing', () => {
      const selections = [{ slotId: 'slot-main', optionId: 'opt-cheeseburger' }];
      const result = validateComboSelections(burgerCombo, selections);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toMatch(/Choose an option for "Choose Your Side"/i);
    });

    it('fails when an invalid option ID is selected for a slot', () => {
      const selections = [
        { slotId: 'slot-main', optionId: 'opt-cheeseburger' },
        { slotId: 'slot-side', optionId: 'opt-nonexistent' },
      ];
      const result = validateComboSelections(burgerCombo, selections);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toMatch(/Invalid selection for "Choose Your Side"/i);
    });
  });

  describe('Toast-Standard Modifier Display Formatting', () => {
    it('formats standard modifier with positive price adjustment', () => {
      const display = formatModifierDisplay({
        name: 'Avocado',
        action: 'standard',
        priceAdjustment: 200,
      });
      expect(display).toBe('Avocado (+$2.00)');
    });

    it('formats NO action prefix cleanly', () => {
      const display = formatModifierDisplay({
        name: 'Pickles',
        action: 'no',
        priceAdjustment: 0,
      });
      expect(display).toBe('NO Pickles');
    });

    it('formats SUB action prefix with upcharge', () => {
      const display = formatModifierDisplay({
        name: 'Truffle Fries',
        action: 'sub',
        priceAdjustment: 250,
      });
      expect(display).toBe('SUB Truffle Fries (+$2.50)');
    });

    it('formats EXTRA action prefix with upcharge', () => {
      const display = formatModifierDisplay({
        name: 'Cheddar Cheese',
        action: 'extra',
        priceAdjustment: 150,
      });
      expect(display).toBe('EXTRA Cheddar Cheese (+$1.50)');
    });

    it('formats SIDE action prefix', () => {
      const display = formatModifierDisplay({
        name: 'Ranch Dressing',
        action: 'on_side',
        priceAdjustment: 50,
      });
      expect(display).toBe('SIDE Ranch Dressing (+$0.50)');
    });
  });
});
