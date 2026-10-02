import { describe, it, expect } from 'vitest'
import {
  TABLE_STATUSES,
  TABLE_SHAPES,
  getTableTurnTimeMinutes,
  getTableTurnTimeTier,
  getTableServiceStatus,
  validateTableTransfer,
  validateTableCombine,
  getTableDimensions,
  getAutoArrangedPositions,
  getSmartTablePositions,
} from '@/features/keystone/schema'

describe('Stage 3: Real-Time Table Management & Service Floor Map (Unit Tests)', () => {
  describe('Table Schema Constants & Types', () => {
    it('defines standard commercial dining room table statuses', () => {
      expect(TABLE_STATUSES).toEqual(['available', 'occupied', 'reserved', 'cleaning'])
    })

    it('defines standard table shapes for floor plan mapping', () => {
      expect(TABLE_SHAPES).toEqual(['round', 'square', 'rectangle'])
    })
  })

  describe('Turn-Time Calculations & Tiers', () => {
    it('calculates elapsed turn-time in minutes from order creation timestamp', () => {
      const now = new Date('2026-10-01T15:00:00Z').getTime()
      const created20MinsAgo = new Date('2026-10-01T14:40:00Z').toISOString()
      const created60MinsAgo = new Date('2026-10-01T14:00:00Z').toISOString()
      const created90MinsAgo = new Date('2026-10-01T13:30:00Z').toISOString()

      expect(getTableTurnTimeMinutes(created20MinsAgo, now)).toBe(20)
      expect(getTableTurnTimeMinutes(created60MinsAgo, now)).toBe(60)
      expect(getTableTurnTimeMinutes(created90MinsAgo, now)).toBe(90)
    })

    it('classifies turn-time into commercial operational tiers (normal <45m, warning 45-75m, alert >75m)', () => {
      expect(getTableTurnTimeTier(15)).toBe('normal')
      expect(getTableTurnTimeTier(44)).toBe('normal')
      expect(getTableTurnTimeTier(45)).toBe('warning')
      expect(getTableTurnTimeTier(60)).toBe('warning')
      expect(getTableTurnTimeTier(75)).toBe('warning')
      expect(getTableTurnTimeTier(76)).toBe('alert')
      expect(getTableTurnTimeTier(120)).toBe('alert')
    })
  })

  describe('Table Service Status Derivation', () => {
    it('returns table status when no active order is present', () => {
      expect(getTableServiceStatus(null, 'available')).toBe('available')
      expect(getTableServiceStatus(null, 'cleaning')).toBe('cleaning')
      expect(getTableServiceStatus(null, 'reserved')).toBe('reserved')
    })

    it('identifies dining status when order has no payments', () => {
      const order = {
        status: 'in_progress',
        total: 85.5,
        payments: [],
      }
      expect(getTableServiceStatus(order)).toBe('dining')
    })

    it('identifies check_dropped status when payments have been initiated or partial payment exists', () => {
      const order = {
        status: 'served',
        total: 100,
        payments: [{ amount: 40, status: 'succeeded' }],
      }
      expect(getTableServiceStatus(order)).toBe('check_dropped')
    })

    it('identifies paid status when order total is fully covered by payments', () => {
      const order = {
        status: 'served',
        total: 120,
        payments: [
          { amount: 60, status: 'succeeded' },
          { amount: 60, status: 'succeeded' },
        ],
      }
      expect(getTableServiceStatus(order)).toBe('paid')
    })
  })

  describe('Table Transfer Validation Rules', () => {
    const activeOrder = { id: 'order-101', tables: [{ id: 'table-1' }] }
    const sourceTable = { id: 'table-1', status: 'occupied' }
    const targetTableAvailable = { id: 'table-5', status: 'available' }
    const targetTableOccupied = { id: 'table-6', status: 'occupied' }

    it('allows valid transfer from occupied table with active order to an available target table', () => {
      const result = validateTableTransfer(sourceTable, targetTableAvailable, activeOrder)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('rejects transfer if no active order exists on the source table', () => {
      const result = validateTableTransfer(sourceTable, targetTableAvailable, null)
      expect(result.isValid).toBe(false)
      expect(result.error).toMatch(/No active check found/)
    })

    it('rejects transfer to the same table', () => {
      const result = validateTableTransfer(sourceTable, sourceTable, activeOrder)
      expect(result.isValid).toBe(false)
      expect(result.error).toMatch(/Cannot transfer order to the same table/)
    })

    it('rejects transfer to an occupied destination table', () => {
      const result = validateTableTransfer(sourceTable, targetTableOccupied, activeOrder)
      expect(result.isValid).toBe(false)
      expect(result.error).toMatch(/Target table is currently occupied/)
    })
  })

  describe('Table Combine / Merge Validation Rules', () => {
    const allTables = [
      { id: 't-1', status: 'occupied' },
      { id: 't-2', status: 'available' },
      { id: 't-3', status: 'available' },
      { id: 't-4', status: 'cleaning' },
    ]

    it('validates successful combine of primary table with available tables', () => {
      const result = validateTableCombine('t-1', ['t-2', 't-3'], allTables)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('rejects combine when no target tables are provided', () => {
      const result = validateTableCombine('t-1', [], allTables)
      expect(result.isValid).toBe(false)
      expect(result.error).toMatch(/At least one table must be selected/)
    })

    it('rejects combine with itself', () => {
      const result = validateTableCombine('t-1', ['t-1', 't-2'], allTables)
      expect(result.isValid).toBe(false)
      expect(result.error).toMatch(/Cannot combine table with itself/)
    })

    it('rejects combine when a target table is in cleaning status', () => {
      const result = validateTableCombine('t-1', ['t-4'], allTables)
      expect(result.isValid).toBe(false)
      expect(result.error).toMatch(/cannot be combined in status cleaning/)
    })
  })

  describe('Floor Plan Auto-Arrangement & Dimension Utilities', () => {
    it('calculates proper dimensions based on shape and capacity', () => {
      const round2 = getTableDimensions('round', 2)
      expect(round2.width).toBe(80)
      expect(round2.radius).toBe(40)

      const square4 = getTableDimensions('square', 4)
      expect(square4.width).toBe(98)

      const rect6 = getTableDimensions('rectangle', 6)
      expect(rect6.width).toBe(160)
      expect(rect6.height).toBe(86)
    })

    it('auto-arranges tables into distinct sections and non-overlapping coordinates', () => {
      const sampleTables = [
        { id: 't-1', tableNumber: '1', capacity: 2, shape: 'square' as const, section: { name: 'Main Dining' } },
        { id: 't-2', tableNumber: '2', capacity: 4, shape: 'round' as const, section: { name: 'Main Dining' } },
        { id: 't-3', tableNumber: '3', capacity: 6, shape: 'rectangle' as const, section: { name: 'Main Dining' } },
        { id: 't-10', tableNumber: '10', capacity: 4, shape: 'round' as const, section: { name: 'Patio' } },
        { id: 't-12', tableNumber: '12', capacity: 6, shape: 'rectangle' as const, section: { name: 'Patio' } },
      ]

      const arranged = getAutoArrangedPositions(sampleTables, 1000, 700)
      expect(arranged.length).toBe(5)

      // Main dining tables have x between 100 and 600
      const mainT1 = arranged.find(t => t.id === 't-1')!
      const mainT2 = arranged.find(t => t.id === 't-2')!
      expect(mainT1.positionX).toBeGreaterThanOrEqual(100)
      expect(mainT2.positionX).toBeGreaterThan(mainT1.positionX)

      // Patio tables are placed in the dedicated patio zone (x >= 700)
      const patioT10 = arranged.find(t => t.id === 't-10')!
      expect(patioT10.positionX).toBeGreaterThanOrEqual(700)
    })

    it('getSmartTablePositions preserves non-zero positions and assigns smart fallbacks for (0, 0) tables', () => {
      const tables = [
        { id: 't-custom', tableNumber: '1', positionX: 350, positionY: 280 },
        { id: 't-unpositioned', tableNumber: '2', positionX: 0, positionY: 0 },
      ]

      const smart = getSmartTablePositions(tables, 1000, 700)
      const custom = smart.find(t => t.id === 't-custom')!
      const unpositioned = smart.find(t => t.id === 't-unpositioned')!

      expect(custom.positionX).toBe(350)
      expect(custom.positionY).toBe(280)

      // Unpositioned table should not be at 0, 0
      expect(unpositioned.positionX).toBeGreaterThan(50)
      expect(unpositioned.positionY).toBeGreaterThan(50)
    })
  })
})

