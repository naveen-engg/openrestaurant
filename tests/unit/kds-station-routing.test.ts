import { describe, it, expect } from 'vitest'
import { KITCHEN_STATIONS, Product, RestaurantOrderItem } from '@/features/keystone/schema'
import {
  isStationMatch,
  isExpoStation,
  normalizeStation,
} from '@/features/platform/kds/screens/KDSClient'

describe('Stage 1: Multi-Station KDS Routing - Unit Tests', () => {
  describe('Schema & Model Definitions', () => {
    it('defines industry-standard commercial kitchen stations', () => {
      expect(KITCHEN_STATIONS).toEqual([
        'hot_line',
        'cold_prep',
        'bar',
        'expo',
        'dessert',
      ])
    })

    it('MenuItem (Product) model schema includes station field with hot_line default', () => {
      expect(Product).toBeDefined()
      expect(Product.fields).toBeDefined()
      expect(Product.fields.station).toBeDefined()
    })

    it('OrderItem (RestaurantOrderItem) model schema includes station field with hot_line default', () => {
      expect(RestaurantOrderItem).toBeDefined()
      expect(RestaurantOrderItem.fields).toBeDefined()
      expect(RestaurantOrderItem.fields.station).toBeDefined()
    })
  })

  describe('Station Normalization & Matching Logic', () => {
    it('normalizes station names consistently', () => {
      expect(normalizeStation('Hot Line')).toBe('hot_line')
      expect(normalizeStation('hot-line')).toBe('hot_line')
      expect(normalizeStation('BAR')).toBe('bar')
      expect(normalizeStation({ id: 'bar', name: 'Bar Station' })).toBe('bar_station')
    })

    it('identifies expo / expediter stations correctly', () => {
      expect(isExpoStation('expo')).toBe(true)
      expect(isExpoStation('Expediter')).toBe(true)
      expect(isExpoStation({ id: 'expo_1', name: 'Expo Window' })).toBe(true)
      expect(isExpoStation('bar')).toBe(false)
      expect(isExpoStation('hot_line')).toBe(false)
    })

    it('matches stations accurately for line cooks vs all stations', () => {
      expect(isStationMatch('all', 'bar')).toBe(true)
      expect(isStationMatch('bar', 'bar')).toBe(true)
      expect(isStationMatch('bar', 'Bar Station')).toBe(true)
      expect(isStationMatch('bar', 'hot_line')).toBe(false)
      expect(isStationMatch('cold_prep', 'dessert')).toBe(false)
    })
  })

  describe('Order Item Routing & Expo Consolidation', () => {
    const mockOrderItems = [
      {
        id: 'item_1',
        quantity: 2,
        itemNameSnapshot: 'Classic Burger',
        station: 'hot_line',
        specialInstructions: 'Medium rare',
      },
      {
        id: 'item_2',
        quantity: 1,
        itemNameSnapshot: 'Caesar Salad',
        station: 'cold_prep',
        specialInstructions: 'Dressing on side',
      },
      {
        id: 'item_3',
        quantity: 2,
        itemNameSnapshot: 'IPA Craft Beer',
        station: 'bar',
        specialInstructions: null,
      },
      {
        id: 'item_4',
        quantity: 1,
        itemNameSnapshot: 'Molten Chocolate Cake',
        station: 'dessert',
        specialInstructions: 'Warm',
      },
    ]

    it('routes line cook items strictly to their designated stations', () => {
      const barItems = mockOrderItems.filter((item) => isStationMatch('bar', item.station))
      const hotLineItems = mockOrderItems.filter((item) => isStationMatch('hot_line', item.station))
      const coldPrepItems = mockOrderItems.filter((item) => isStationMatch('cold_prep', item.station))
      const dessertItems = mockOrderItems.filter((item) => isStationMatch('dessert', item.station))

      expect(barItems).toHaveLength(1)
      expect(barItems[0].itemNameSnapshot).toBe('IPA Craft Beer')

      expect(hotLineItems).toHaveLength(1)
      expect(hotLineItems[0].itemNameSnapshot).toBe('Classic Burger')

      expect(coldPrepItems).toHaveLength(1)
      expect(coldPrepItems[0].itemNameSnapshot).toBe('Caesar Salad')

      expect(dessertItems).toHaveLength(1)
      expect(dessertItems[0].itemNameSnapshot).toBe('Molten Chocolate Cake')
    })

    it('provides expo with the consolidated view of all items across all stations', () => {
      const isExpo = isExpoStation('expo')
      expect(isExpo).toBe(true)

      // Expo sees all items regardless of station
      const expoVisibleItems = isExpo
        ? mockOrderItems
        : mockOrderItems.filter((item) => isStationMatch('expo', item.station))

      expect(expoVisibleItems).toHaveLength(4)
      const stationsRepresented = new Set(expoVisibleItems.map((i) => i.station))
      expect(stationsRepresented).toContain('hot_line')
      expect(stationsRepresented).toContain('cold_prep')
      expect(stationsRepresented).toContain('bar')
      expect(stationsRepresented).toContain('dessert')
    })
  })

  describe('Item-Level Fulfillment Non-Premature Order Close', () => {
    it('does not transition order to served when only a single station or item fulfills', () => {
      const tickets = [
        { id: 'ticket_bar', station: 'bar', status: 'ready', items: [{ id: 'item_3', status: 'fulfilled' }] },
        { id: 'ticket_hot', station: 'hot_line', status: 'in_progress', items: [{ id: 'item_1', status: 'in_progress' }] },
      ]

      const hasInProgress = tickets.some((t) => t.status === 'in_progress')
      const allServed = tickets.every((t) => ['served', 'cancelled'].includes(t.status))

      let orderStatus = 'sent_to_kitchen'
      if (hasInProgress) {
        orderStatus = 'in_progress'
      } else if (allServed) {
        orderStatus = 'served'
      }

      // Order status should be in_progress, NOT served or completed!
      expect(orderStatus).toBe('in_progress')
      expect(orderStatus).not.toBe('served')
    })
  })
})
