import type { Context } from ".keystone/types";
import { permissions } from "../access";

interface UpsertShiftArgs {
  shiftId?: string | null;
  staffId?: string | null;
  role: string;
  startTime: string;
  endTime: string;
  hourlyRate?: string | null;
}

interface UpdateShiftStatusArgs {
  shiftId: string;
  action: "cancel" | "no_show" | "start" | "complete";
}

interface ShiftMutationResult {
  success: boolean;
  error: string | null;
}

const VALID_ROLES = ["server", "bartender", "host", "busser", "cook", "dishwasher", "manager"];
const OPEN_SHIFT_STATUSES = ["scheduled", "started"];

function parseShiftWindow(startValue: string, endValue: string) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime())) throw new Error("Shift start time is invalid");
  if (Number.isNaN(end.getTime())) throw new Error("Shift end time is invalid");
  if (end <= start) throw new Error("Shift end time must be after start time");
  return { start, end };
}

async function assertNoStaffOverlap({
  staffId,
  startTime,
  endTime,
  shiftId,
  context,
}: {
  staffId?: string | null;
  startTime: string;
  endTime: string;
  shiftId?: string | null;
  context: Context;
}) {
  if (!staffId) return;
  const { start, end } = parseShiftWindow(startTime, endTime);
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(start);
  dayEnd.setHours(23, 59, 59, 999);

  const shifts = await context.sudo().query.Shift.findMany({
    where: {
      staff: { id: { equals: staffId } },
      startTime: { gte: dayStart.toISOString(), lte: dayEnd.toISOString() },
      status: { in: OPEN_SHIFT_STATUSES },
    },
    query: "id startTime endTime status",
  });

  const overlapping = shifts.filter((shift: any) => {
    if (shiftId && shift.id === shiftId) return false;
    const existingStart = new Date(shift.startTime);
    const existingEnd = new Date(shift.endTime);
    return existingStart < end && start < existingEnd;
  });

  if (overlapping.length > 0) {
    throw new Error("This staff member already has an overlapping open shift");
  }
}

export async function upsertShift(
  root: any,
  args: UpsertShiftArgs,
  context: Context
): Promise<ShiftMutationResult> {
  if (!permissions.canManageStaff({ session: context.session })) {
    return { success: false, error: "Not authorized to manage shifts" };
  }

  if (!VALID_ROLES.includes(args.role)) return { success: false, error: "Invalid shift role" };

  try {
    parseShiftWindow(args.startTime, args.endTime);

    if (args.staffId) {
      const staff = await context.sudo().query.User.findOne({
        where: { id: args.staffId },
        query: "id name isActive",
      });
      if (!staff) return { success: false, error: "Staff member not found" };
      if (staff.isActive === false) return { success: false, error: "Cannot schedule an inactive staff member" };
    }

    await assertNoStaffOverlap({
      staffId: args.staffId,
      startTime: args.startTime,
      endTime: args.endTime,
      shiftId: args.shiftId,
      context,
    });

    const data: any = {
      startTime: new Date(args.startTime).toISOString(),
      endTime: new Date(args.endTime).toISOString(),
      role: args.role,
      hourlyRate: args.hourlyRate || undefined,
      staff: args.staffId ? { connect: { id: args.staffId } } : { disconnect: true },
    };

    if (args.shiftId) {
      await context.sudo().db.Shift.updateOne({ where: { id: args.shiftId }, data });
    } else {
      await context.sudo().db.Shift.createOne({ data: { ...data, status: "scheduled" } });
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function updateShiftStatus(
  root: any,
  args: UpdateShiftStatusArgs,
  context: Context
): Promise<ShiftMutationResult> {
  if (!permissions.canManageStaff({ session: context.session })) {
    return { success: false, error: "Not authorized to manage shifts" };
  }

  if (!args.shiftId) return { success: false, error: "Shift is required" };

  try {
    const sudo = context.sudo();
    const shift = await sudo.query.Shift.findOne({
      where: { id: args.shiftId },
      query: "id status clockIn clockOut",
    });
    if (!shift) return { success: false, error: "Shift not found" };

    const now = new Date().toISOString();
    if (args.action === "start") {
      if (shift.status !== "scheduled") return { success: false, error: "Only scheduled shifts can be started" };
      await sudo.db.Shift.updateOne({ where: { id: args.shiftId }, data: { status: "started", clockIn: now } });
    } else if (args.action === "complete") {
      if (shift.status !== "started") return { success: false, error: "Only started shifts can be completed" };
      await sudo.db.Shift.updateOne({ where: { id: args.shiftId }, data: { status: "completed", clockOut: now } });
    } else if (args.action === "no_show") {
      if (shift.status !== "scheduled") return { success: false, error: "Only scheduled shifts can be marked no-show" };
      await sudo.db.Shift.updateOne({ where: { id: args.shiftId }, data: { status: "no_show" } });
    } else if (args.action === "cancel") {
      if (!["scheduled", "started"].includes(shift.status || "")) return { success: false, error: "This shift is already closed" };
      await sudo.db.Shift.updateOne({ where: { id: args.shiftId }, data: { status: "called_out" } });
    } else {
      return { success: false, error: "Invalid shift action" };
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function clockInStaff(
  root: any,
  args: { staffId: string; role?: string; hourlyRate?: string },
  context: Context
): Promise<{ success: boolean; shiftId: string | null; error: string | null }> {
  if (!args.staffId) return { success: false, shiftId: null, error: "Staff member is required" };

  try {
    const sudo = context.sudo();
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    // 1. Check if already clocked in
    const activeShifts = await sudo.query.Shift.findMany({
      where: {
        staff: { id: { equals: args.staffId } },
        status: { equals: "started" },
        clockOut: { equals: null },
      },
      query: "id status",
      take: 1,
    });

    if (activeShifts.length > 0) {
      return { success: false, shiftId: activeShifts[0].id, error: "Staff member is already clocked in" };
    }

    // 2. Check if a scheduled shift exists for today
    const scheduledShifts = await sudo.query.Shift.findMany({
      where: {
        staff: { id: { equals: args.staffId } },
        status: { equals: "scheduled" },
        startTime: { gte: dayStart.toISOString(), lte: dayEnd.toISOString() },
      },
      query: "id role hourlyRate",
      take: 1,
    });

    let shiftId: string;
    const assignedRole = args.role || scheduledShifts[0]?.role || "server";
    const assignedRate = args.hourlyRate || scheduledShifts[0]?.hourlyRate || undefined;

    if (scheduledShifts.length > 0) {
      shiftId = scheduledShifts[0].id;
      await sudo.db.Shift.updateOne({
        where: { id: shiftId },
        data: {
          status: "started",
          clockIn: now.toISOString(),
          role: assignedRole,
          hourlyRate: assignedRate,
        },
      });
    } else {
      // Create on-demand shift
      const shiftEnd = new Date(now.getTime() + 8 * 3600000);
      const created = await sudo.db.Shift.createOne({
        data: {
          staff: { connect: { id: args.staffId } },
          startTime: now.toISOString(),
          endTime: shiftEnd.toISOString(),
          role: assignedRole,
          hourlyRate: assignedRate,
          status: "started",
          clockIn: now.toISOString(),
        },
      });
      shiftId = created.id;
    }

    // 3. Create active TimeEntry record
    await sudo.db.TimeEntry.createOne({
      data: {
        staff: { connect: { id: args.staffId } },
        clockIn: now.toISOString(),
        role: assignedRole,
        hourlyRate: assignedRate,
      },
    });

    return { success: true, shiftId, error: null };
  } catch (err) {
    return { success: false, shiftId: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function clockOutStaff(
  root: any,
  args: { shiftId: string; declaredCashTips?: string; notes?: string },
  context: Context
): Promise<{ success: boolean; hoursWorked: number | null; error: string | null }> {
  if (!args.shiftId) return { success: false, hoursWorked: null, error: "Shift ID is required" };

  try {
    const sudo = context.sudo();
    const shift = await sudo.query.Shift.findOne({
      where: { id: args.shiftId },
      query: "id status clockIn staff { id }",
    });

    if (!shift) return { success: false, hoursWorked: null, error: "Shift not found" };
    if (shift.status !== "started" || !shift.clockIn) {
      return { success: false, hoursWorked: null, error: "Shift is not currently active" };
    }

    const now = new Date();
    const clockInDate = new Date(shift.clockIn);
    const rawHours = (now.getTime() - clockInDate.getTime()) / 3600000;
    const hoursWorked = Math.max(0, Math.round(rawHours * 100) / 100);

    const noteAdditions: string[] = [];
    if (args.declaredCashTips && parseFloat(args.declaredCashTips) > 0) {
      noteAdditions.push(`Declared Cash Tips: $${parseFloat(args.declaredCashTips).toFixed(2)}`);
    }
    if (args.notes?.trim()) {
      noteAdditions.push(args.notes.trim());
    }

    // 1. Update Shift record
    await sudo.db.Shift.updateOne({
      where: { id: args.shiftId },
      data: {
        status: "completed",
        clockOut: now.toISOString(),
        notes: noteAdditions.length ? noteAdditions.join(". ") : undefined,
      },
    });

    // 2. Close matching active TimeEntry
    if (shift.staff?.id) {
      const activeEntries = await sudo.query.TimeEntry.findMany({
        where: {
          staff: { id: { equals: shift.staff.id } },
          clockOut: { equals: null },
        },
        query: "id",
        take: 1,
      });

      if (activeEntries.length > 0) {
        await sudo.db.TimeEntry.updateOne({
          where: { id: activeEntries[0].id },
          data: {
            clockOut: now.toISOString(),
            tips: args.declaredCashTips || undefined,
            notes: noteAdditions.length ? noteAdditions.join(". ") : undefined,
          },
        });
      }
    }

    return { success: true, hoursWorked, error: null };
  } catch (err) {
    return { success: false, hoursWorked: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function toggleStaffBreak(
  root: any,
  args: { shiftId: string; action: "start_break" | "end_break" },
  context: Context
): Promise<{ success: boolean; isOnBreak: boolean; breakMinutes: number; error: string | null }> {
  if (!args.shiftId) return { success: false, isOnBreak: false, breakMinutes: 0, error: "Shift ID is required" };

  try {
    const sudo = context.sudo();
    const shift = await sudo.query.Shift.findOne({
      where: { id: args.shiftId },
      query: "id status notes staff { id }",
    });

    if (!shift || shift.status !== "started") {
      return { success: false, isOnBreak: false, breakMinutes: 0, error: "Shift is not active" };
    }

    const now = new Date();
    let isOnBreak = false;
    let breakMinutes = 0;

    if (shift.staff?.id) {
      const activeEntries = await sudo.query.TimeEntry.findMany({
        where: {
          staff: { id: { equals: shift.staff.id } },
          clockOut: { equals: null },
        },
        query: "id breakMinutes notes",
        take: 1,
      });

      if (activeEntries.length > 0) {
        const entry = activeEntries[0];
        const currentBreakMins = parseFloat(entry.breakMinutes || "0");

        if (args.action === "start_break") {
          isOnBreak = true;
          breakMinutes = currentBreakMins;
          await sudo.db.TimeEntry.updateOne({
            where: { id: entry.id },
            data: { notes: `[BREAK_STARTED:${now.toISOString()}] ${entry.notes || ""}` },
          });
        } else {
          // end_break
          isOnBreak = false;
          // Calculate elapsed break time if tag exists
          const match = (entry.notes || "").match(/\[BREAK_STARTED:([^\]]+)\]/);
          let addedMins = 15; // default 15 mins if untracked
          if (match && match[1]) {
            const startBreak = new Date(match[1]);
            addedMins = Math.max(1, Math.round((now.getTime() - startBreak.getTime()) / 60000));
          }
          breakMinutes = currentBreakMins + addedMins;
          const cleanedNotes = (entry.notes || "").replace(/\[BREAK_STARTED:[^\]]+\]\s*/, "");
          await sudo.db.TimeEntry.updateOne({
            where: { id: entry.id },
            data: { breakMinutes: String(breakMinutes), notes: cleanedNotes },
          });
        }
      }
    }

    return { success: true, isOnBreak, breakMinutes, error: null };
  } catch (err) {
    return { success: false, isOnBreak: false, breakMinutes: 0, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

