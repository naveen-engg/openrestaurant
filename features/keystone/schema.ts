/**
 * Keystone schema exports and model aliases.
 * Provides architectural parity for commercial restaurant POS entities.
 */
import { models } from './models';
import { MenuItem } from './models/MenuItem';
import { OrderItem } from './models/OrderItem';
import { RestaurantOrder } from './models/RestaurantOrder';

export const KITCHEN_STATIONS = [
  'hot_line',
  'cold_prep',
  'bar',
  'expo',
  'dessert',
] as const;

export type KitchenStation = (typeof KITCHEN_STATIONS)[number];

export const COURSE_TYPES = ['drinks', 'appetizers', 'mains', 'desserts'] as const;
export type CourseType = (typeof COURSE_TYPES)[number];

export const COURSE_STATUSES = ['pending', 'held', 'fired', 'ready', 'served'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export function getCourseType(courseNumber: number): CourseType {
  if (courseNumber === 1) return 'appetizers';
  if (courseNumber === 2) return 'mains';
  if (courseNumber === 3) return 'desserts';
  return 'mains';
}

export function isCourseFired(course?: {
  status?: string | null;
  onHold?: boolean | null;
  fireTime?: string | Date | null;
} | null): boolean {
  if (!course) return true;
  if (course.onHold) return false;
  if (course.status === 'fired' || course.status === 'ready' || course.status === 'served') return true;
  return Boolean(course.fireTime && course.status !== 'pending' && course.status !== 'held');
}

export function isItemFired(item: {
  firedAt?: string | Date | null;
  kitchenStatus?: string | null;
  courseNumber?: number | null;
  course?: { status?: string | null; onHold?: boolean | null; fireTime?: string | Date | null } | null;
}): boolean {
  if (item.kitchenStatus === 'held') return false;
  if (item.firedAt) return true;
  if (item.course) return isCourseFired(item.course);
  return (item.courseNumber || 1) === 1;
}

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

export const Product = MenuItem;
export const RestaurantOrderItem = OrderItem;

export { models, MenuItem, OrderItem, RestaurantOrder };
export default models;


