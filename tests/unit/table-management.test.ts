import { describe, it, expect } from 'vitest'
import {
  TABLE_STATUSES,
  TABLE_SHAPES,
  getTableTurnTimeMinutes,
  getTableTurnTimeTier,
  getTableServiceStatus,
  validateTableTransfer,
  validateTableCombine,
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
})
