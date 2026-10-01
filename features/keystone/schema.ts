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

export const Product = MenuItem;
export const RestaurantOrderItem = OrderItem;

export { models, MenuItem, OrderItem, RestaurantOrder };
export default models;
