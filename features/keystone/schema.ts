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

export * from './tableUtils';

export const Product = MenuItem;
export const RestaurantOrderItem = OrderItem;

export { models, MenuItem, OrderItem, RestaurantOrder };
export default models;



