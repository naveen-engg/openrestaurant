export type ModifierAction = 'standard' | 'add' | 'no' | 'sub' | 'extra' | 'on_side' | 'lite';

export interface ModifierOption {
  id: string;
  name: string;
  modifierGroup: string;
  modifierGroupLabel?: string | null;
  required?: boolean;
  minSelections?: number;
  maxSelections?: number;
  priceAdjustment?: number; // in cents
  defaultSelected?: boolean;
  action?: ModifierAction;
  nestedGroupId?: string | null;
  nestedGroupLabel?: string | null;
  dietaryTags?: string[]; // e.g. ['GF', 'Vegan', 'Nut-Free']
  isAllergyAlert?: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  label: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

export interface ComboSlotOption {
  id: string;
  name: string;
  swapPriceAdjustment: number; // in cents, e.g. +250 for Truffle Fries swap
  station?: string;
  defaultModifiers?: ModifierOption[];
}

export interface ComboSlot {
  id: string;
  name: string; // e.g. "Choose Your Main", "Choose Your Side", "Beverage"
  required: boolean;
  options: ComboSlotOption[];
  defaultOptionId?: string;
}

export interface ComboMealDefinition {
  id: string;
  name: string;
  basePrice: number; // in cents
  slots: ComboSlot[];
}

export interface SelectedComboSlot {
  slotId: string;
  optionId: string;
  modifierIds?: string[];
}

/**
 * Calculates the total unit price in cents including base price, modifier adjustments, and combo swaps.
 */
export function calculateItemPriceWithModifiers(
  basePriceInCents: number | string,
  selectedModifiers: Array<{ priceAdjustment?: number | string | null }>,
  comboSlotSwaps: Array<{ swapPriceAdjustment?: number | string | null }> = []
): number {
  const base = Math.max(0, Math.round(Number(basePriceInCents || 0)));
  const modTotal = selectedModifiers.reduce(
    (sum, mod) => sum + Math.round(Number(mod?.priceAdjustment || 0)),
    0
  );
  const swapTotal = comboSlotSwaps.reduce(
    (sum, swap) => sum + Math.round(Number(swap?.swapPriceAdjustment || 0)),
    0
  );
  return Math.max(0, base + modTotal + swapTotal);
}

/**
 * Validates selection rules for a modifier group (min/max selections, required check).
 */
export function validateModifierGroup(
  group: {
    label?: string | null;
    name: string;
    required?: boolean;
    minSelections?: number;
    maxSelections?: number;
    options: Array<{ id: string; name: string }>;
  },
  selectedIds: string[]
): { isValid: boolean; error?: string } {
  const groupOptionIds = new Set(group.options.map((o) => o.id));
  const selectedInGroup = selectedIds.filter((id) => groupOptionIds.has(id));

  const min = Math.max(
    group.required ? 1 : 0,
    Number(group.minSelections || 0)
  );
  const configuredMax = Number(group.maxSelections || 0);
  const max = configuredMax > 0 ? configuredMax : Math.max(1, group.options.length);

  const groupTitle = group.label || group.name;

  if (selectedInGroup.length < min) {
    return {
      isValid: false,
      error: `Please select at least ${min} option${min === 1 ? '' : 's'} for "${groupTitle}" (currently ${selectedInGroup.length} selected)`,
    };
  }

  if (selectedInGroup.length > max) {
    return {
      isValid: false,
      error: `You may select at most ${max} option${max === 1 ? '' : 's'} for "${groupTitle}" (currently ${selectedInGroup.length} selected)`,
    };
  }

  return { isValid: true };
}

/**
 * Validates all modifier groups for an item, ensuring all required choices are satisfied.
 */
export function validateAllModifierGroups(
  groups: ModifierGroup[],
  selectedIds: string[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const group of groups) {
    const res = validateModifierGroup(group, selectedIds);
    if (!res.isValid && res.error) {
      errors.push(res.error);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates combo meal slot selections.
 */
export function validateComboSelections(
  combo: ComboMealDefinition,
  selections: SelectedComboSlot[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const selectionMap = new Map(selections.map((s) => [s.slotId, s.optionId]));

  for (const slot of combo.slots) {
    const chosenOptionId = selectionMap.get(slot.id);
    if (slot.required && !chosenOptionId) {
      errors.push(`Please choose an option for "${slot.name}"`);
      continue;
    }

    if (chosenOptionId) {
      const optionExists = slot.options.some((o) => o.id === chosenOptionId);
      if (!optionExists) {
        errors.push(`Invalid selection for "${slot.name}"`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Formats a modifier for kitchen tickets, receipts, and line displays with Toast-standard prefix notation.
 * e.g., "NO Onion", "SUB Truffle Fries (+$2.50)", "EXTRA Cheddar (+$1.50)"
 */
export function formatModifierDisplay(
  modifier: {
    name: string;
    action?: ModifierAction;
    priceAdjustment?: number | null;
  },
  currencySymbol = '$'
): string {
  const action = modifier.action || 'standard';
  let prefix = '';
  if (action === 'no') prefix = 'NO ';
  else if (action === 'sub') prefix = 'SUB ';
  else if (action === 'extra') prefix = 'EXTRA ';
  else if (action === 'on_side') prefix = 'SIDE ';
  else if (action === 'lite') prefix = 'LITE ';
  else if (action === 'add') prefix = 'ADD ';

  const cents = Number(modifier.priceAdjustment || 0);
  let priceStr = '';
  if (cents > 0) {
    priceStr = ` (+${currencySymbol}${(cents / 100).toFixed(2)})`;
  } else if (cents < 0) {
    priceStr = ` (-${currencySymbol}${Math.abs(cents / 100).toFixed(2)})`;
  }

  return `${prefix}${modifier.name}${priceStr}`.trim();
}
