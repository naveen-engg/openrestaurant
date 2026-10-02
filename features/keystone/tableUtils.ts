/**
 * Client-safe table management utilities, turn-time calculations, and validation rules.
 * Separated from Keystone server models to avoid pulling server GraphQL scalar realms into client bundles.
 */

export const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'cleaning'] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const TABLE_SHAPES = ['round', 'square', 'rectangle'] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];

export type TurnTimeTier = 'normal' | 'warning' | 'alert';

export function getTableTurnTimeMinutes(createdAt: string | Date | number, now: number = Date.now()): number {
  const createdTime = typeof createdAt === 'number' ? createdAt : new Date(createdAt).getTime();
  if (isNaN(createdTime)) return 0;
  return Math.max(0, Math.floor((now - createdTime) / 60000));
}

export function getTableTurnTimeTier(turnTimeMinutes: number): TurnTimeTier {
  if (turnTimeMinutes < 45) return 'normal';
  if (turnTimeMinutes <= 75) return 'warning';
  return 'alert';
}

export type TableServiceStatus = 'available' | 'cleaning' | 'reserved' | 'dining' | 'check_dropped' | 'paid';

export function getTableServiceStatus(order?: {
  status?: string | null;
  payments?: Array<{ amount?: number; status?: string }> | null;
  total?: number | null;
} | null, tableStatus: TableStatus = 'available'): TableServiceStatus {
  if (!order) {
    if (tableStatus === 'cleaning') return 'cleaning';
    if (tableStatus === 'reserved') return 'reserved';
    return 'available';
  }

  const paidAmount = (order.payments || [])
    .filter((p) => p.status === 'succeeded')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const total = Number(order.total || 0);

  if (total > 0 && paidAmount >= total) {
    return 'paid';
  }

  if (paidAmount > 0 || (order.payments && order.payments.length > 0)) {
    return 'check_dropped';
  }

  return 'dining';
}

export function validateTableTransfer(
  fromTable: { id: string; status?: string },
  toTable: { id: string; status?: string },
  order?: { id: string } | null
): { isValid: boolean; error?: string } {
  if (!order) {
    return { isValid: false, error: 'No active check found to transfer' };
  }
  if (!fromTable?.id || !toTable?.id) {
    return { isValid: false, error: 'Source and destination tables are required' };
  }
  if (fromTable.id === toTable.id) {
    return { isValid: false, error: 'Cannot transfer order to the same table' };
  }
  if (toTable.status && toTable.status !== 'available') {
    return { isValid: false, error: `Target table is currently ${toTable.status}` };
  }
  return { isValid: true };
}

export function validateTableCombine(
  primaryTableId: string,
  targetTableIds: string[],
  availableTables: Array<{ id: string; status?: string }>
): { isValid: boolean; error?: string } {
  if (!primaryTableId) {
    return { isValid: false, error: 'Primary table is required' };
  }
  if (!targetTableIds || targetTableIds.length === 0) {
    return { isValid: false, error: 'At least one table must be selected to combine' };
  }
  if (targetTableIds.includes(primaryTableId)) {
    return { isValid: false, error: 'Cannot combine table with itself' };
  }

  const availableMap = new Map(availableTables.map(t => [t.id, t.status]));
  for (const id of targetTableIds) {
    const status = availableMap.get(id);
    if (!status) {
      return { isValid: false, error: `Table ${id} does not exist` };
    }
    if (status !== 'available' && status !== 'occupied') {
      return { isValid: false, error: `Table ${id} cannot be combined in status ${status}` };
    }
  }

  return { isValid: true };
}

export function getTableDimensions(shape: TableShape, capacity: number = 4): { width: number; height: number; radius: number } {
  if (shape === 'round') {
    const radius = capacity <= 2 ? 40 : capacity <= 4 ? 48 : 58;
    return { width: radius * 2, height: radius * 2, radius };
  }
  if (shape === 'square') {
    const size = capacity <= 2 ? 88 : capacity <= 4 ? 98 : 110;
    return { width: size, height: size, radius: 14 };
  }
  // rectangle
  const width = capacity <= 4 ? 130 : capacity <= 6 ? 160 : 190;
  const height = 86;
  return { width, height, radius: 12 };
}

export interface PlacedTable {
  id: string;
  tableNumber: string;
  capacity?: number;
  shape?: TableShape | null;
  positionX?: number | null;
  positionY?: number | null;
  section?: { id?: string; name?: string } | null;
}

export function getAutoArrangedPositions<T extends PlacedTable>(
  tables: T[],
  canvasWidth: number = 1000,
  canvasHeight: number = 700
): Array<T & { positionX: number; positionY: number }> {
  if (!tables || tables.length === 0) return [];

  // Group tables by section (e.g., "Patio", "Bar", "Main Dining" / default)
  const patioTables: T[] = [];
  const barTables: T[] = [];
  const mainTables: T[] = [];

  for (const table of tables) {
    const sectionName = (table.section?.name || '').toLowerCase();
    if (sectionName.includes('patio') || sectionName.includes('outdoor')) {
      patioTables.push(table);
    } else if (sectionName.includes('bar') || sectionName.includes('lounge')) {
      barTables.push(table);
    } else {
      mainTables.push(table);
    }
  }

  const results: Array<T & { positionX: number; positionY: number }> = [];

  // Zone 1: Main Dining (Left / Center: x from 120 to 620)
  const mainCols = 3;
  const mainStartX = 120;
  const mainColGap = 180;
  const mainStartY = 140;
  const mainRowGap = 160;

  mainTables.forEach((table, index) => {
    const col = index % mainCols;
    const row = Math.floor(index / mainCols);
    const x = mainStartX + col * mainColGap;
    const y = mainStartY + row * mainRowGap;
    results.push({ ...table, positionX: Math.min(x, canvasWidth - 120), positionY: Math.min(y, canvasHeight - 100) });
  });

  // Zone 2: Patio (Right area: x from 720 to 920)
  const patioStartX = 720;
  const patioStartY = 140;
  const patioColGap = 170;
  const patioRowGap = 160;
  const patioCols = 2;

  patioTables.forEach((table, index) => {
    const col = index % patioCols;
    const row = Math.floor(index / patioCols);
    const x = patioStartX + col * patioColGap;
    const y = patioStartY + row * patioRowGap;
    results.push({ ...table, positionX: Math.min(x, canvasWidth - 100), positionY: Math.min(y, canvasHeight - 100) });
  });

  // Zone 3: Bar (Bottom or right side if any)
  const barStartX = 720;
  const barStartY = 480;
  const barColGap = 150;

  barTables.forEach((table, index) => {
    const x = barStartX + index * barColGap;
    const y = barStartY;
    results.push({ ...table, positionX: Math.min(x, canvasWidth - 100), positionY: Math.min(y, canvasHeight - 100) });
  });

  return results;
}

export function getSmartTablePositions<T extends PlacedTable>(
  tables: T[],
  canvasWidth: number = 1000,
  canvasHeight: number = 700
): Array<T & { positionX: number; positionY: number }> {
  const autoArranged = getAutoArrangedPositions(tables, canvasWidth, canvasHeight);
  const autoMap = new Map(autoArranged.map(t => [t.id, { x: t.positionX, y: t.positionY }]));

  return tables.map(table => {
    const currentX = Number(table.positionX || 0);
    const currentY = Number(table.positionY || 0);

    // If table has valid, non-zero coordinates (> 20), keep it
    if (currentX > 20 && currentY > 20) {
      return {
        ...table,
        positionX: Math.min(currentX, canvasWidth - 60),
        positionY: Math.min(currentY, canvasHeight - 60),
      };
    }

    // Fall back to auto-arranged coordinate
    const fallback = autoMap.get(table.id) || { x: 120, y: 120 };
    return {
      ...table,
      positionX: fallback.x,
      positionY: fallback.y,
    };
  });
}
