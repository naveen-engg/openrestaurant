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
