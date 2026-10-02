import { describe, it, expect } from 'vitest';
import {
  calculateNetShiftHours,
  calculateLaborCostWithOvertime,
  isStaffTipEligible,
  determineStaffShiftStatus,
  allocateHousePoolTips,
  allocatePointsWeightedTips,
  allocatePercentageWeightedTips,
  generateDailyCloseoutSummary,
  DEFAULT_ROLE_CONFIGS,
  type TipStaffEntry,
} from '@/features/platform/staff/timeTrackingUtils';

describe('Stage 6: Staff Shifts, Time Clock Tracking & Tip Pooling (Unit Tests)', () => {
  describe('Shift Hours & Status Calculations', () => {
    it('calculates net shift hours correctly without breaks', () => {
      const clockIn = '2026-10-02T09:00:00.000Z';
      const clockOut = '2026-10-02T17:00:00.000Z';
      const hours = calculateNetShiftHours(clockIn, clockOut, 0);
      expect(hours).toBe(8);
    });

    it('deducts unpaid break minutes from total hours worked', () => {
      const clockIn = '2026-10-02T10:00:00.000Z';
      const clockOut = '2026-10-02T16:30:00.000Z'; // 6.5 hours = 390 mins
      const hours = calculateNetShiftHours(clockIn, clockOut, 30); // 360 mins = 6.0 hours
      expect(hours).toBe(6);
    });

    it('returns 0 for inverted or invalid clock timestamps', () => {
      expect(calculateNetShiftHours('invalid', '2026-10-02T16:00:00.000Z')).toBe(0);
      expect(calculateNetShiftHours('2026-10-02T17:00:00.000Z', '2026-10-02T10:00:00.000Z')).toBe(0);
    });

    it('determines live shift status across all operational states', () => {
      expect(determineStaffShiftStatus({ status: 'called_out' })).toBe('called_out');
      expect(determineStaffShiftStatus({ status: 'no_show' })).toBe('no_show');
      expect(determineStaffShiftStatus({ clockIn: '2026-10-02T10:00:00Z', clockOut: '2026-10-02T18:00:00Z' })).toBe('completed');
      expect(determineStaffShiftStatus({ clockIn: '2026-10-02T10:00:00Z', isOnBreak: true })).toBe('on_break');
      expect(determineStaffShiftStatus({ clockIn: '2026-10-02T10:00:00Z' })).toBe('active');
      expect(determineStaffShiftStatus({ status: 'scheduled' })).toBe('scheduled');
    });
  });

  describe('Role Wage Tiers & Overtime Labor Costs', () => {
    it('calculates regular labor cost under overtime threshold', () => {
      // 7.5 hours @ $16.00/hr = $120.00 (12000 cents)
      const breakdown = calculateLaborCostWithOvertime(7.5, 16.00);
      expect(breakdown.regularHours).toBe(7.5);
      expect(breakdown.overtimeHours).toBe(0);
      expect(breakdown.regularPayCents).toBe(12000);
      expect(breakdown.overtimePayCents).toBe(0);
      expect(breakdown.totalLaborCostCents).toBe(12000);
    });

    it('applies 1.5x overtime multiplier on hours exceeding 8 hours', () => {
      // 10 hours @ $20.00/hr
      // Regular: 8 hrs * $20 = $160.00 (16000 cents)
      // Overtime: 2 hrs * $30 = $60.00 (6000 cents)
      // Total = $220.00 (22000 cents)
      const breakdown = calculateLaborCostWithOvertime(10, 20.00, 8, 1.5);
      expect(breakdown.regularHours).toBe(8);
      expect(breakdown.overtimeHours).toBe(2);
      expect(breakdown.regularPayCents).toBe(16000);
      expect(breakdown.overtimePayCents).toBe(6000);
      expect(breakdown.totalLaborCostCents).toBe(22000);
    });

    it('has proper default wage tiers and tip eligibility configurations', () => {
      expect(DEFAULT_ROLE_CONFIGS.server.defaultHourlyRate).toBe(11.00);
      expect(DEFAULT_ROLE_CONFIGS.cook.defaultHourlyRate).toBe(20.00);
      expect(DEFAULT_ROLE_CONFIGS.manager.isTipEligible).toBe(false);
      expect(DEFAULT_ROLE_CONFIGS.server.isTipEligible).toBe(true);
    });
  });

  describe('FLSA Compliance: Tip Eligibility Exclusions', () => {
    it('excludes managers, supervisors, and owners from tip pools', () => {
      expect(isStaffTipEligible('manager')).toBe(false);
      expect(isStaffTipEligible('Manager')).toBe(false);
      expect(isStaffTipEligible('supervisor')).toBe(false);
      expect(isStaffTipEligible('admin')).toBe(false);
      expect(isStaffTipEligible('owner')).toBe(false);
    });

    it('permits front-of-house service staff in tip pools', () => {
      expect(isStaffTipEligible('server')).toBe(true);
      expect(isStaffTipEligible('bartender')).toBe(true);
      expect(isStaffTipEligible('busser')).toBe(true);
      expect(isStaffTipEligible('host')).toBe(true);
    });
  });

  describe('Tip Pooling: Model A (Hours-Weighted House Pool)', () => {
    const mockStaff: TipStaffEntry[] = [
      { staffId: 'staff-1', staffName: 'Alice', role: 'server', hoursWorked: 6 },
      { staffId: 'staff-2', staffName: 'Bob', role: 'server', hoursWorked: 6 },
      { staffId: 'staff-3', staffName: 'Charlie', role: 'bartender', hoursWorked: 6 },
      { staffId: 'staff-mgr', staffName: 'Dave (Mgr)', role: 'manager', hoursWorked: 8 }, // Ineligible
    ];

    it('divides $100.00 evenly with zero penny drop across 3 equal workers', () => {
      // $100.00 (10000 cents) / 3 = 3333 cents with 1 cent remainder
      // One worker gets 3334, others get 3333.
      // Total sum must equal 10000 cents strictly.
      const results = allocateHousePoolTips(10000, mockStaff);
      expect(results.length).toBe(3);

      const totalAllocated = results.reduce((sum, r) => sum + r.amountCents, 0);
      expect(totalAllocated).toBe(10000);

      const amounts = results.map((r) => r.amountCents);
      expect(amounts).toContain(3334);
      expect(amounts.filter((a) => a === 3333).length).toBe(2);
    });

    it('allocates tips proportional to unequal hours worked with 100% cent conservation', () => {
      const unequalStaff: TipStaffEntry[] = [
        { staffId: 'staff-1', staffName: 'Alice', role: 'server', hoursWorked: 5 },
        { staffId: 'staff-2', staffName: 'Bob', role: 'server', hoursWorked: 3 },
        { staffId: 'staff-3', staffName: 'Charlie', role: 'busser', hoursWorked: 2 },
      ];
      // Total hours = 10. Tips = $157.35 = 15735 cents.
      // Alice (50%): 7867.5 -> 7867 or 7868
      // Bob (30%): 4720.5 -> 4720 or 4721
      // Charlie (20%): 3147
      const results = allocateHousePoolTips(15735, unequalStaff);
      const totalAllocated = results.reduce((sum, r) => sum + r.amountCents, 0);
      expect(totalAllocated).toBe(15735);
      expect(results.find((r) => r.staffId === 'staff-3')?.amountCents).toBe(3147);
    });
  });

  describe('Tip Pooling: Model B (Points-Weighted Toast Style)', () => {
    it('weights tips by role points multiplier (Server=10, Bar=8, Busser=4)', () => {
      const staff: TipStaffEntry[] = [
        { staffId: 's-1', staffName: 'Alice (Server)', role: 'server', hoursWorked: 5 },       // 5 * 10 = 50 pts
        { staffId: 's-2', staffName: 'Bob (Bartender)', role: 'bartender', hoursWorked: 5 },  // 5 * 8 = 40 pts
        { staffId: 's-3', staffName: 'Charlie (Busser)', role: 'busser', hoursWorked: 2.5 },  // 2.5 * 4 = 10 pts
      ];
      // Total points = 50 + 40 + 10 = 100 points
      // Total tips = $300.00 = 30000 cents
      // Alice = 50% = 15000 cents ($150.00)
      // Bob = 40% = 12000 cents ($120.00)
      // Charlie = 10% = 3000 cents ($30.00)
      const results = allocatePointsWeightedTips(30000, staff);
      expect(results.length).toBe(3);

      const totalAllocated = results.reduce((sum, r) => sum + r.amountCents, 0);
      expect(totalAllocated).toBe(30000);

      expect(results.find((r) => r.staffId === 's-1')?.amountCents).toBe(15000);
      expect(results.find((r) => r.staffId === 's-2')?.amountCents).toBe(12000);
      expect(results.find((r) => r.staffId === 's-3')?.amountCents).toBe(3000);
    });

    it('supports custom point overrides and retains cent perfection', () => {
      const staff: TipStaffEntry[] = [
        { staffId: 's-1', staffName: 'Alice', role: 'server', hoursWorked: 7 },
        { staffId: 's-2', staffName: 'Bob', role: 'bartender', hoursWorked: 6 },
      ];
      // Custom overrides: server = 12 pts, bartender = 9 pts
      // s-1 = 84 pts, s-2 = 54 pts, total = 138 pts. Tips = 18943 cents ($189.43)
      const results = allocatePointsWeightedTips(18943, staff, { server: 12, bartender: 9 });
      const totalAllocated = results.reduce((sum, r) => sum + r.amountCents, 0);
      expect(totalAllocated).toBe(18943);
    });
  });

  describe('Tip Pooling: Model C (Role Percentage Split)', () => {
    it('splits total pool by role percentages and divides within roles by hours', () => {
      const staff: TipStaffEntry[] = [
        { staffId: 's-1', staffName: 'Alice (Server 1)', role: 'server', hoursWorked: 4 },
        { staffId: 's-2', staffName: 'Bob (Server 2)', role: 'server', hoursWorked: 4 },
        { staffId: 's-3', staffName: 'Charlie (Bar)', role: 'bartender', hoursWorked: 6 },
        { staffId: 's-4', staffName: 'David (Busser)', role: 'busser', hoursWorked: 4 },
      ];
      // Percentages: Server = 60%, Bartender = 25%, Busser = 15%
      // Total tips = $400.00 = 40000 cents
      // Server pool = 24000 cents ($240.00) -> split 4h & 4h = 12000 each
      // Bartender pool = 10000 cents ($100.00) -> 10000
      // Busser pool = 6000 cents ($60.00) -> 6000
      const percentages = { server: 60, bartender: 25, busser: 15 };
      const results = allocatePercentageWeightedTips(40000, staff, percentages);

      const totalAllocated = results.reduce((sum, r) => sum + r.amountCents, 0);
      expect(totalAllocated).toBe(40000);

      expect(results.find((r) => r.staffId === 's-1')?.amountCents).toBe(12000);
      expect(results.find((r) => r.staffId === 's-2')?.amountCents).toBe(12000);
      expect(results.find((r) => r.staffId === 's-3')?.amountCents).toBe(10000);
      expect(results.find((r) => r.staffId === 's-4')?.amountCents).toBe(6000);
    });
  });

  describe('Daily Closeout Summary & Labor Analysis', () => {
    it('generates a full commercial end-of-day summary with labor percentage of sales', () => {
      const closeout = generateDailyCloseoutSummary({
        date: '2026-10-02',
        totalSalesCents: 500000, // $5,000.00 sales
        cashTipsCents: 25000,    // $250.00 cash tips
        creditTipsCents: 45000,  // $450.00 CC tips ($700.00 total tips = 70000 cents)
        shiftEntries: [
          { staffId: 'staff-1', staffName: 'Alice', role: 'server', hoursWorked: 8, hourlyRateDollars: 12.00 },
          { staffId: 'staff-2', staffName: 'Bob', role: 'server', hoursWorked: 8, hourlyRateDollars: 12.00 },
          { staffId: 'staff-3', staffName: 'Charlie', role: 'bartender', hoursWorked: 8, hourlyRateDollars: 15.00 },
          { staffId: 'staff-4', staffName: 'Diana', role: 'cook', hoursWorked: 9, hourlyRateDollars: 20.00 }, // 8h reg + 1h OT
        ],
        poolType: 'pool_by_points',
      });

      // Total tips
      expect(closeout.totalTipsCents).toBe(70000);

      // Labor costs:
      // Alice: 8 * 12 = $96 (9600 cents)
      // Bob: 8 * 12 = $96 (9600 cents)
      // Charlie: 8 * 15 = $120 (12000 cents)
      // Diana: 8 * 20 ($160) + 1 * 30 ($30) = $190 (19000 cents)
      // Total labor = $502.00 = 50200 cents
      expect(closeout.totalLaborCostCents).toBe(50200);

      // Labor % = (502 / 5000) * 100 = 10.04% -> 10.0%
      expect(closeout.laborCostPercentage).toBe(10);
      expect(closeout.headcount).toBe(4);
      expect(closeout.totalHoursWorked).toBe(33);
      expect(closeout.isBalanced).toBe(true);

      // Diana (cook) is ineligible for tips, so tips distributed only to Alice, Bob, Charlie
      expect(closeout.distributions.some((d) => d.staffId === 'staff-4')).toBe(false);
      const totalTipDistributions = closeout.distributions.reduce((sum, d) => sum + d.amountCents, 0);
      expect(totalTipDistributions).toBe(70000);
    });
  });
});
