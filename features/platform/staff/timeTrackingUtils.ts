/**
 * Commercial Restaurant Shift, Time Tracking, and Tip Pooling Utility Engine
 * Toast & 7shifts style models: Clock in/out, Overtime calculation,
 * Role Wage Tiers, Hours-weighted & Points-weighted tip allocation, Daily Closeouts.
 *
 * All financial arithmetic is penny-perfect using integer cents with zero rounding loss.
 */

export interface RoleConfig {
  role: string;
  label: string;
  defaultHourlyRate: number; // in dollars, e.g. 15.00
  defaultTipPoints: number;  // Toast-style point multiplier, e.g. Server: 10, Busser: 4
  isTipEligible: boolean;    // FLSA compliance: managers and supervisors are excluded
  color: string;
  badgeBg: string;
}

export const DEFAULT_ROLE_CONFIGS: Record<string, RoleConfig> = {
  server: {
    role: 'server',
    label: 'Server',
    defaultHourlyRate: 11.00,
    defaultTipPoints: 10,
    isTipEligible: true,
    color: 'text-blue-600 dark:text-blue-400',
    badgeBg: 'bg-blue-500/10 border-blue-500/30',
  },
  bartender: {
    role: 'bartender',
    label: 'Bartender',
    defaultHourlyRate: 15.00,
    defaultTipPoints: 8,
    isTipEligible: true,
    color: 'text-purple-600 dark:text-purple-400',
    badgeBg: 'bg-purple-500/10 border-purple-500/30',
  },
  busser: {
    role: 'busser',
    label: 'Busser',
    defaultHourlyRate: 14.00,
    defaultTipPoints: 4,
    isTipEligible: true,
    color: 'text-amber-600 dark:text-amber-400',
    badgeBg: 'bg-amber-500/10 border-amber-500/30',
  },
  host: {
    role: 'host',
    label: 'Host',
    defaultHourlyRate: 16.00,
    defaultTipPoints: 2,
    isTipEligible: true,
    color: 'text-emerald-600 dark:text-emerald-400',
    badgeBg: 'bg-emerald-500/10 border-emerald-500/30',
  },
  cook: {
    role: 'cook',
    label: 'Line Cook',
    defaultHourlyRate: 20.00,
    defaultTipPoints: 0,
    isTipEligible: false,
    color: 'text-rose-600 dark:text-rose-400',
    badgeBg: 'bg-rose-500/10 border-rose-500/30',
  },
  dishwasher: {
    role: 'dishwasher',
    label: 'Dishwasher',
    defaultHourlyRate: 15.00,
    defaultTipPoints: 0,
    isTipEligible: false,
    color: 'text-zinc-600 dark:text-zinc-400',
    badgeBg: 'bg-zinc-500/10 border-zinc-500/30',
  },
  manager: {
    role: 'manager',
    label: 'Shift Manager',
    defaultHourlyRate: 26.00,
    defaultTipPoints: 0,
    isTipEligible: false,
    color: 'text-indigo-600 dark:text-indigo-400',
    badgeBg: 'bg-indigo-500/10 border-indigo-500/30',
  },
};

export const MANAGER_EXCLUSIONS = new Set(['manager', 'admin', 'owner', 'supervisor']);

export function isStaffTipEligible(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().trim();
  if (MANAGER_EXCLUSIONS.has(normalized)) return false;
  const config = DEFAULT_ROLE_CONFIGS[normalized];
  return config ? config.isTipEligible : true;
}

/**
 * Calculates net shift hours worked after deducting unpaid break minutes.
 * Returns hours rounded to 2 decimal places.
 */
export function calculateNetShiftHours(
  clockIn: string | Date,
  clockOut: string | Date,
  breakMinutes: number = 0
): number {
  const start = new Date(clockIn);
  const end = new Date(clockOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end <= start) return 0;

  const totalMinutes = (end.getTime() - start.getTime()) / 60000;
  const netMinutes = Math.max(0, totalMinutes - Math.max(0, breakMinutes));
  return Math.round((netMinutes / 60) * 100) / 100;
}

export interface LaborCostBreakdown {
  regularHours: number;
  overtimeHours: number;
  regularPayCents: number;
  overtimePayCents: number;
  totalLaborCostCents: number;
}

/**
 * Calculates labor cost including standard daily overtime (1.5x for hours above threshold).
 */
export function calculateLaborCostWithOvertime(
  hoursWorked: number,
  hourlyRateDollars: number,
  dailyOvertimeThresholdHours: number = 8,
  overtimeMultiplier: number = 1.5
): LaborCostBreakdown {
  const safeHours = Math.max(0, hoursWorked);
  const rateInCents = Math.max(0, Math.round(hourlyRateDollars * 100));

  const regularHours = Math.min(safeHours, dailyOvertimeThresholdHours);
  const overtimeHours = Math.max(0, safeHours - dailyOvertimeThresholdHours);

  const regularPayCents = Math.round(regularHours * rateInCents);
  const overtimePayCents = Math.round(overtimeHours * rateInCents * overtimeMultiplier);
  const totalLaborCostCents = regularPayCents + overtimePayCents;

  return {
    regularHours: Math.round(regularHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    regularPayCents,
    overtimePayCents,
    totalLaborCostCents,
  };
}

export type StaffShiftStatus =
  | 'scheduled'
  | 'active'
  | 'on_break'
  | 'completed'
  | 'no_show'
  | 'called_out';

/**
 * Evaluates live shift status based on clockIn, clockOut, break status, and recorded status.
 */
export function determineStaffShiftStatus(shift: {
  clockIn?: string | null;
  clockOut?: string | null;
  status?: string | null;
  isOnBreak?: boolean;
}): StaffShiftStatus {
  if (shift.status === 'called_out') return 'called_out';
  if (shift.status === 'no_show') return 'no_show';
  if (shift.clockOut || shift.status === 'completed') return 'completed';
  if (shift.isOnBreak) return 'on_break';
  if (shift.clockIn || shift.status === 'started') return 'active';
  return 'scheduled';
}

export interface TipStaffEntry {
  staffId: string;
  staffName: string;
  role: string;
  hoursWorked: number;
}

export interface TipAllocationResult {
  staffId: string;
  staffName: string;
  role: string;
  hoursWorked: number;
  weightOrPoints: number;
  amountCents: number;
  formattedAmount: string;
}

/**
 * Universal integer-cent allocation engine (Largest Remainder Method / Hare-Niemeyer).
 * Guarantees zero penny loss across all shares: Sum(allocations) === totalCents.
 */
function allocateCentsEvenly<T>(
  totalCents: number,
  items: T[],
  getWeight: (item: T) => number,
  getKey: (item: T) => string
): Array<{ item: T; amountCents: number; weight: number }> {
  const safeTotal = Math.max(0, Math.round(totalCents));
  if (!items.length || safeTotal === 0) {
    return items.map((item) => ({ item, amountCents: 0, weight: getWeight(item) }));
  }

  const totalWeight = items.reduce((sum, item) => sum + Math.max(0, getWeight(item)), 0);
  if (totalWeight <= 0) {
    return items.map((item) => ({ item, amountCents: 0, weight: 0 }));
  }

  // 1. Calculate floor amounts and fractional remainders
  const allocations = items.map((item) => {
    const weight = Math.max(0, getWeight(item));
    const exactShare = (weight / totalWeight) * safeTotal;
    const floorAmount = Math.floor(exactShare);
    const remainder = exactShare - floorAmount;
    return {
      item,
      weight,
      amountCents: floorAmount,
      remainder,
      key: getKey(item),
    };
  });

  // 2. Determine leftover cents to distribute
  let remainderCents = safeTotal - allocations.reduce((sum, a) => sum + a.amountCents, 0);

  // 3. Sort descending by fractional remainder, with tiebreak on key
  allocations
    .sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key))
    .forEach((allocation) => {
      if (remainderCents > 0) {
        allocation.amountCents += 1;
        remainderCents -= 1;
      }
    });

  // 4. Return in stable order
  return allocations
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ item, amountCents, weight }) => ({ item, amountCents, weight }));
}

/**
 * Model A: Hours-Weighted House Pool
 * Front-of-house eligible staff receive tips proportional to net hours worked.
 */
export function allocateHousePoolTips(
  totalTipsCents: number,
  entries: TipStaffEntry[]
): TipAllocationResult[] {
  const eligibleEntries = entries.filter(
    (e) => isStaffTipEligible(e.role) && e.hoursWorked > 0
  );

  const allocated = allocateCentsEvenly(
    totalTipsCents,
    eligibleEntries,
    (e) => e.hoursWorked,
    (e) => e.staffId
  );

  return allocated.map(({ item, amountCents, weight }) => ({
    staffId: item.staffId,
    staffName: item.staffName,
    role: item.role,
    hoursWorked: item.hoursWorked,
    weightOrPoints: weight,
    amountCents,
    formattedAmount: `$${(amountCents / 100).toFixed(2)}`,
  }));
}

/**
 * Model B: Points-Weighted Tip Pool (Toast / 7shifts Style)
 * Each role is assigned a point weight (e.g. Server = 10, Bartender = 8, Busser = 4, Host = 2).
 * Points earned = hoursWorked * rolePoints.
 * Tips are distributed strictly proportional to points earned with zero penny drop.
 */
export function allocatePointsWeightedTips(
  totalTipsCents: number,
  entries: TipStaffEntry[],
  rolePointsOverride?: Record<string, number>
): TipAllocationResult[] {
  const eligibleEntries = entries.filter(
    (e) => isStaffTipEligible(e.role) && e.hoursWorked > 0
  );

  const getPointsForRole = (role: string): number => {
    const norm = role.toLowerCase().trim();
    if (rolePointsOverride && typeof rolePointsOverride[norm] === 'number') {
      return Math.max(0, rolePointsOverride[norm]);
    }
    return DEFAULT_ROLE_CONFIGS[norm]?.defaultTipPoints ?? 5;
  };

  const allocated = allocateCentsEvenly(
    totalTipsCents,
    eligibleEntries,
    (e) => Math.round(e.hoursWorked * getPointsForRole(e.role) * 100) / 100,
    (e) => e.staffId
  );

  return allocated.map(({ item, amountCents, weight }) => ({
    staffId: item.staffId,
    staffName: item.staffName,
    role: item.role,
    hoursWorked: item.hoursWorked,
    weightOrPoints: weight,
    amountCents,
    formattedAmount: `$${(amountCents / 100).toFixed(2)}`,
  }));
}

/**
 * Model C: Role Percentage Split (e.g., 60% Server, 20% Bar, 10% Busser, 10% Host)
 * Each role group receives its assigned percentage cut of the pool,
 * which is then distributed evenly among staff in that role based on hours worked.
 */
export function allocatePercentageWeightedTips(
  totalTipsCents: number,
  entries: TipStaffEntry[],
  rolePercentages: Record<string, number> = { server: 60, bartender: 20, busser: 10, host: 10 }
): TipAllocationResult[] {
  const safeTotal = Math.max(0, Math.round(totalTipsCents));
  const eligibleEntries = entries.filter(
    (e) => isStaffTipEligible(e.role) && e.hoursWorked > 0
  );

  if (!eligibleEntries.length || safeTotal === 0) return [];

  // Group staff by role
  const roleGroups = new Map<string, TipStaffEntry[]>();
  for (const entry of eligibleEntries) {
    const roleKey = entry.role.toLowerCase().trim();
    if (!roleGroups.has(roleKey)) roleGroups.set(roleKey, []);
    roleGroups.get(roleKey)!.push(entry);
  }

  // Filter groups that have positive percentage and at least 1 staff
  const activeRoles = Array.from(roleGroups.keys())
    .map((role) => ({
      role,
      entries: roleGroups.get(role)!,
      percent: Math.max(0, rolePercentages[role] || 0),
    }))
    .filter((g) => g.percent > 0);

  if (!activeRoles.length) {
    // Fall back to house pool if no percentages match active roles
    return allocateHousePoolTips(safeTotal, entries);
  }

  // 1. Allocate total tips among the role groups
  const groupCents = allocateCentsEvenly(
    safeTotal,
    activeRoles,
    (g) => g.percent,
    (g) => g.role
  );

  // 2. Allocate each role group's budget to its members proportional to hours
  const finalResults: TipAllocationResult[] = [];
  for (const { item: group, amountCents: roleTotalCents } of groupCents) {
    const staffAllocations = allocateCentsEvenly(
      roleTotalCents,
      group.entries,
      (e) => e.hoursWorked,
      (e) => e.staffId
    );

    for (const { item, amountCents, weight } of staffAllocations) {
      finalResults.push({
        staffId: item.staffId,
        staffName: item.staffName,
        role: item.role,
        hoursWorked: item.hoursWorked,
        weightOrPoints: weight,
        amountCents,
        formattedAmount: `$${(amountCents / 100).toFixed(2)}`,
      });
    }
  }

  return finalResults.sort((a, b) => a.staffId.localeCompare(b.staffId));
}

export interface DailyCloseoutParams {
  date: string;
  totalSalesCents: number;
  cashTipsCents: number;
  creditTipsCents: number;
  shiftEntries: Array<{
    staffId: string;
    staffName: string;
    role: string;
    hoursWorked: number;
    hourlyRateDollars: number;
  }>;
  poolType: 'house_pool' | 'pool_by_points' | 'pool_by_role';
  rolePointsOverride?: Record<string, number>;
  rolePercentagesOverride?: Record<string, number>;
}

export interface DailyCloseoutSummary {
  date: string;
  totalSalesCents: number;
  cashTipsCents: number;
  creditTipsCents: number;
  totalTipsCents: number;
  totalLaborCostCents: number;
  laborCostPercentage: number;
  totalHoursWorked: number;
  headcount: number;
  poolType: string;
  distributions: TipAllocationResult[];
  isBalanced: boolean;
}

/**
 * Compiles an end-of-day restaurant closeout summary (Toast Payroll / 7shifts closeout).
 */
export function generateDailyCloseoutSummary(
  params: DailyCloseoutParams
): DailyCloseoutSummary {
  const totalTipsCents = Math.max(0, params.cashTipsCents) + Math.max(0, params.creditTipsCents);

  let totalLaborCostCents = 0;
  let totalHoursWorked = 0;
  for (const entry of params.shiftEntries) {
    const labor = calculateLaborCostWithOvertime(entry.hoursWorked, entry.hourlyRateDollars);
    totalLaborCostCents += labor.totalLaborCostCents;
    totalHoursWorked += entry.hoursWorked;
  }
  totalHoursWorked = Math.round(totalHoursWorked * 100) / 100;

  // Compute labor percentage of sales
  const laborCostPercentage =
    params.totalSalesCents > 0
      ? Math.round((totalLaborCostCents / params.totalSalesCents) * 1000) / 10
      : 0;

  // Run the selected tip pool distribution
  let distributions: TipAllocationResult[] = [];
  if (params.poolType === 'pool_by_points') {
    distributions = allocatePointsWeightedTips(
      totalTipsCents,
      params.shiftEntries,
      params.rolePointsOverride
    );
  } else if (params.poolType === 'pool_by_role') {
    distributions = allocatePercentageWeightedTips(
      totalTipsCents,
      params.shiftEntries,
      params.rolePercentagesOverride || { server: 60, bartender: 20, busser: 10, host: 10 }
    );
  } else {
    distributions = allocateHousePoolTips(totalTipsCents, params.shiftEntries);
  }

  // Validate penny-perfect conservation
  const sumDistributed = distributions.reduce((sum, d) => sum + d.amountCents, 0);
  const isBalanced = sumDistributed === totalTipsCents;

  return {
    date: params.date,
    totalSalesCents: params.totalSalesCents,
    cashTipsCents: params.cashTipsCents,
    creditTipsCents: params.creditTipsCents,
    totalTipsCents,
    totalLaborCostCents,
    laborCostPercentage,
    totalHoursWorked,
    headcount: params.shiftEntries.length,
    poolType: params.poolType,
    distributions,
    isBalanced,
  };
}
