import { describe, it, expect } from 'vitest'
import {
  getCourseType,
  isCourseFired,
  isItemFired,
  COURSE_TYPES,
  COURSE_STATUSES,
} from '@/features/keystone/schema'
import {
  mapOrderItemsByStation,
  createKitchenWorkSignature,
} from '@/features/keystone/utils/kitchenTicketSync'

describe('Stage 2: Course Pacing & Hold / Fire Logic (Unit Tests)', () => {
  describe('Course Helpers & Constants', () => {
    it('defines supported commercial course types and statuses', () => {
      expect(COURSE_TYPES).toEqual(['drinks', 'appetizers', 'mains', 'desserts'])
      expect(COURSE_STATUSES).toEqual(['pending', 'held', 'fired', 'ready', 'served'])
    })

    it('maps course numbers to course types (1: appetizers, 2: mains, 3: desserts)', () => {
      expect(getCourseType(1)).toBe('appetizers')
      expect(getCourseType(2)).toBe('mains')
      expect(getCourseType(3)).toBe('desserts')
      expect(getCourseType(4)).toBe('mains')
    })

    it('determines if course is fired or held', () => {
      expect(isCourseFired({ status: 'fired', onHold: false })).toBe(true)
      expect(isCourseFired({ status: 'ready', onHold: false })).toBe(true)
      expect(isCourseFired({ status: 'served', onHold: false })).toBe(true)
      expect(isCourseFired({ status: 'pending', onHold: true })).toBe(false)
      expect(isCourseFired({ status: 'held', onHold: true })).toBe(false)
      expect(isCourseFired({ status: 'fired', onHold: true })).toBe(false) // onHold takes precedence
      expect(isCourseFired(null)).toBe(true) // null course defaults to fired
    })

    it('determines if item is fired or held', () => {
      // Item marked held explicitly
      expect(isItemFired({ kitchenStatus: 'held', firedAt: null })).toBe(false)

      // Item with firedAt timestamp
      expect(isItemFired({ kitchenStatus: 'new', firedAt: '2026-10-01T12:00:00Z' })).toBe(true)

      // Item in a held course
      expect(
        isItemFired({
          kitchenStatus: 'held',
          firedAt: null,
          course: { status: 'pending', onHold: true },
        })
      ).toBe(false)

      // Item in a fired course
      expect(
        isItemFired({
          kitchenStatus: 'new',
          firedAt: null,
          course: { status: 'fired', onHold: false },
        })
      ).toBe(true)
    })
  })

  describe('Kitchen Ticket Routing with Course Pacing', () => {
    const mockOrder = {
      id: 'order-pacing-101',
      orderNumber: '20261001-0101',
      createdAt: '2026-10-01T12:00:00Z',
      courses: [
        {
          id: 'course-1',
          courseNumber: 1,
          courseType: 'appetizers',
          status: 'fired',
          onHold: false,
          fireTime: '2026-10-01T12:00:00Z',
        },
        {
          id: 'course-2',
          courseNumber: 2,
          courseType: 'mains',
          status: 'pending',
          onHold: true,
          fireTime: null,
        },
      ],
      orderItems: [
        {
          id: 'item-beer',
          itemNameSnapshot: 'Craft IPA Beer',
          quantity: 2,
          station: 'bar',
          courseNumber: 1,
          course: { id: 'course-1', courseNumber: 1, courseType: 'appetizers', status: 'fired', onHold: false },
          kitchenStatus: 'new',
          firedAt: '2026-10-01T12:00:00Z',
        },
        {
          id: 'item-salad',
          itemNameSnapshot: 'Caesar Salad',
          quantity: 1,
          station: 'cold_prep',
          courseNumber: 1,
          course: { id: 'course-1', courseNumber: 1, courseType: 'appetizers', status: 'fired', onHold: false },
          kitchenStatus: 'new',
          firedAt: '2026-10-01T12:00:00Z',
        },
        {
          id: 'item-steak',
          itemNameSnapshot: 'Prime Ribeye Steak',
          quantity: 1,
          station: 'hot_line',
          courseNumber: 2,
          course: { id: 'course-2', courseNumber: 2, courseType: 'mains', status: 'pending', onHold: true },
          kitchenStatus: 'held',
          firedAt: null,
        },
      ],
    }

    it('excludes held Course 2 items from line prep stations while Course 1 items route to bar and cold prep', () => {
      const grouped = mapOrderItemsByStation(mockOrder)

      // Bar receives the beer
      expect(grouped['bar']).toBeDefined()
      expect(grouped['bar'].length).toBe(1)
      expect(grouped['bar'][0].name).toBe('Craft IPA Beer')
      expect(grouped['bar'][0].isHeld).toBe(false)

      // Cold Prep receives the salad
      expect(grouped['cold_prep']).toBeDefined()
      expect(grouped['cold_prep'].length).toBe(1)
      expect(grouped['cold_prep'][0].name).toBe('Caesar Salad')
      expect(grouped['cold_prep'][0].isHeld).toBe(false)

      // Hot Line MUST NOT have any tickets because Prime Ribeye Steak is held in Course 2!
      expect(grouped['hot_line']).toBeUndefined()
    })

    it('routes ALL items across courses to Expo, clearly indicating held status', () => {
      const grouped = mapOrderItemsByStation(mockOrder)

      expect(grouped['expo']).toBeDefined()
      expect(grouped['expo'].length).toBe(3)

      const expoItems = grouped['expo']
      const beer = expoItems.find((i) => i.id === 'item-beer')
      const salad = expoItems.find((i) => i.id === 'item-salad')
      const steak = expoItems.find((i) => i.id === 'item-steak')

      expect(beer?.isHeld).toBe(false)
      expect(beer?.courseNumber).toBe(1)
      expect(beer?.courseStatus).toBe('fired')

      expect(salad?.isHeld).toBe(false)
      expect(salad?.courseNumber).toBe(1)

      // Steak is marked held on Expo
      expect(steak?.isHeld).toBe(true)
      expect(steak?.courseNumber).toBe(2)
      expect(steak?.courseStatus).toBe('held')
      expect(steak?.station).toBe('hot_line')
    })

    it('routes Course 2 items to hot_line when Course 2 is fired', () => {
      const firedOrder = {
        ...mockOrder,
        courses: [
          mockOrder.courses[0],
          {
            ...mockOrder.courses[1],
            status: 'fired',
            onHold: false,
            fireTime: '2026-10-01T12:15:00Z',
          },
        ],
        orderItems: [
          mockOrder.orderItems[0],
          mockOrder.orderItems[1],
          {
            ...mockOrder.orderItems[2],
            course: { id: 'course-2', courseNumber: 2, courseType: 'mains', status: 'fired', onHold: false },
            kitchenStatus: 'new',
            firedAt: '2026-10-01T12:15:00Z',
          },
        ],
      }

      const grouped = mapOrderItemsByStation(firedOrder)

      // Now Hot Line receives the steak!
      expect(grouped['hot_line']).toBeDefined()
      expect(grouped['hot_line'].length).toBe(1)
      expect(grouped['hot_line'][0].name).toBe('Prime Ribeye Steak')
      expect(grouped['hot_line'][0].isHeld).toBe(false)
      expect(grouped['hot_line'][0].courseNumber).toBe(2)

      // Expo also shows steak as fired
      const expoSteak = grouped['expo'].find((i) => i.id === 'item-steak')
      expect(expoSteak?.isHeld).toBe(false)
      expect(expoSteak?.courseStatus).toBe('fired')
    })

    it('generates different workSignatures for held vs fired items', () => {
      const heldSig = createKitchenWorkSignature({
        id: 'item-1',
        name: 'Prime Ribeye Steak',
        quantity: 1,
        station: 'hot_line',
        courseNumber: 2,
        isHeld: true,
      })

      const firedSig = createKitchenWorkSignature({
        id: 'item-1',
        name: 'Prime Ribeye Steak',
        quantity: 1,
        station: 'hot_line',
        courseNumber: 2,
        isHeld: false,
      })

      expect(heldSig).not.toEqual(firedSig)
    })
  })
})
