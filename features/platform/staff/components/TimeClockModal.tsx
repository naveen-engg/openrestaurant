'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Clock,
  Coffee,
  CheckCircle2,
  LogOut,
  LogIn,
  DollarSign,
  User,
  AlertCircle,
  Loader2,
  Timer,
} from 'lucide-react'
import { gql, request } from 'graphql-request'
import { cn } from '@/lib/utils'
import {
  DEFAULT_ROLE_CONFIGS,
  determineStaffShiftStatus,
  calculateNetShiftHours,
} from '../timeTrackingUtils'

interface StaffUser {
  id: string
  name: string
  email?: string
  staffRole?: string
  hourlyRate?: string
}

interface ActiveShift {
  id: string
  startTime: string
  role: string
  status: string
  hourlyRate: string | null
  clockIn: string | null
  clockOut: string | null
  notes?: string
  staff: {
    id: string
    name: string
  } | null
}

const GET_TIME_CLOCK_DATA = gql`
  query GetTimeClockData {
    users(where: { role: { isNot: null } }, orderBy: { name: asc }) {
      id
      name
      email
      staffRole
      hourlyRate
    }
    shifts(
      where: { status: { in: ["scheduled", "started"] } }
      orderBy: { startTime: asc }
    ) {
      id
      startTime
      role
      status
      hourlyRate
      clockIn
      clockOut
      notes
      staff { id name }
    }
  }
`

const CLOCK_IN_STAFF = gql`
  mutation ClockInStaff($staffId: ID!, $role: String, $hourlyRate: String) {
    clockInStaff(staffId: $staffId, role: $role, hourlyRate: $hourlyRate) {
      success
      shiftId
      error
    }
  }
`

const CLOCK_OUT_STAFF = gql`
  mutation ClockOutStaff($shiftId: ID!, $declaredCashTips: String, $notes: String) {
    clockOutStaff(shiftId: $shiftId, declaredCashTips: $declaredCashTips, notes: $notes) {
      success
      hoursWorked
      error
    }
  }
`

const TOGGLE_STAFF_BREAK = gql`
  mutation ToggleStaffBreak($shiftId: ID!, $action: String!) {
    toggleStaffBreak(shiftId: $shiftId, action: $action) {
      success
      isOnBreak
      breakMinutes
      error
    }
  }
`

interface TimeClockModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  onShiftUpdated?: () => void
}

export function TimeClockModal({ open, onOpenChange, onSuccess, onShiftUpdated }: TimeClockModalProps) {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [staffList, setStaffList] = useState<StaffUser[]>([])
  const [activeShifts, setActiveShifts] = useState<ActiveShift[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Selection
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')
  const [selectedRole, setSelectedRole] = useState<string>('server')
  const [hourlyRateInput, setHourlyRateInput] = useState<string>('15.00')

  // Clock Out dialog state
  const [clockOutDialogOpen, setClockOutDialogOpen] = useState(false)
  const [declaredCashTips, setDeclaredCashTips] = useState<string>('0.00')
  const [clockOutNotes, setClockOutNotes] = useState<string>('')
  const [shiftToClockOut, setShiftToClockOut] = useState<ActiveShift | null>(null)

  // Live digital clock timer
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch staff and shifts
  useEffect(() => {
    if (open) {
      fetchData()
    }
  }, [open])

  const fetchData = async () => {
    setLoading(true)
    try {
      const data: any = await request('/api/graphql', GET_TIME_CLOCK_DATA)
      setStaffList(data?.users || [])
      setActiveShifts(data?.shifts || [])
      if (!selectedStaffId && data?.users?.length > 0) {
        handleStaffSelect(data.users[0].id, data.users, data.shifts || [])
      }
    } catch (err) {
      console.error('Failed to load time clock data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleStaffSelect = (staffId: string, currentStaffList = staffList, shifts = activeShifts) => {
    setSelectedStaffId(staffId)
    const staff = currentStaffList.find((s) => s.id === staffId)
    const existingActiveShift = shifts.find(
      (s) => s.staff?.id === staffId && s.status === 'started'
    )

    if (existingActiveShift) {
      setSelectedRole(existingActiveShift.role)
      setHourlyRateInput(existingActiveShift.hourlyRate || '15.00')
    } else {
      const defaultRole = staff?.staffRole || 'server'
      setSelectedRole(defaultRole)
      const roleConfig = DEFAULT_ROLE_CONFIGS[defaultRole]
      const rate = staff?.hourlyRate || (roleConfig ? roleConfig.defaultHourlyRate.toFixed(2) : '15.00')
      setHourlyRateInput(rate)
    }
  }

  const selectedStaffShift = activeShifts.find(
    (s) => s.staff?.id === selectedStaffId && s.status === 'started'
  )

  const isStaffOnBreak = selectedStaffShift?.notes?.includes('[BREAK_STARTED:')

  const handleClockIn = async () => {
    if (!selectedStaffId) return
    setSubmitting(true)
    try {
      const res: any = await request('/api/graphql', CLOCK_IN_STAFF, {
        staffId: selectedStaffId,
        role: selectedRole,
        hourlyRate: hourlyRateInput,
      })
      if (res?.clockInStaff?.success) {
        await fetchData()
        if (onSuccess) onSuccess()
        if (onShiftUpdated) onShiftUpdated()
      } else {
        alert(res?.clockInStaff?.error || 'Clock in failed')
      }
    } catch (err: any) {
      console.error('Error clocking in:', err)
      alert(err?.message || 'Error clocking in')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleBreak = async () => {
    if (!selectedStaffShift) return
    setSubmitting(true)
    try {
      const action = isStaffOnBreak ? 'end_break' : 'start_break'
      const res: any = await request('/api/graphql', TOGGLE_STAFF_BREAK, {
        shiftId: selectedStaffShift.id,
        action,
      })
      if (res?.toggleStaffBreak?.success) {
        await fetchData()
        if (onSuccess) onSuccess()
        if (onShiftUpdated) onShiftUpdated()
      } else {
        alert(res?.toggleStaffBreak?.error || 'Break toggle failed')
      }
    } catch (err: any) {
      console.error('Error toggling break:', err)
      alert(err?.message || 'Error toggling break')
    } finally {
      setSubmitting(false)
    }
  }

  const triggerClockOutModal = (shift: ActiveShift) => {
    setShiftToClockOut(shift)
    setDeclaredCashTips('0.00')
    setClockOutNotes('')
    setClockOutDialogOpen(true)
  }

  const confirmClockOut = async () => {
    if (!shiftToClockOut) return
    setSubmitting(true)
    try {
      const res: any = await request('/api/graphql', CLOCK_OUT_STAFF, {
        shiftId: shiftToClockOut.id,
        declaredCashTips,
        notes: clockOutNotes,
      })
      if (res?.clockOutStaff?.success) {
        setClockOutDialogOpen(false)
        setShiftToClockOut(null)
        await fetchData()
        if (onSuccess) onSuccess()
        if (onShiftUpdated) onShiftUpdated()
      } else {
        alert(res?.clockOutStaff?.error || 'Clock out failed')
      }
    } catch (err: any) {
      console.error('Error clocking out:', err)
      alert(err?.message || 'Error clocking out')
    } finally {
      setSubmitting(false)
    }
  }

  const currentlyOnClock = activeShifts.filter((s) => s.status === 'started')

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="pb-3 border-b flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Timer className="h-5 w-5 text-primary" />
                Staff Time Clock
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Toast & 7shifts style digital punch clock, break manager & tip declaration
              </DialogDescription>
            </div>
            {/* Live digital clock */}
            <div className="text-right">
              <div className="text-xl font-mono font-bold tracking-tight text-primary tabular-nums">
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <div className="text-[11px] text-muted-foreground font-medium">
                {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto py-3 space-y-5">
              {/* Employee selector */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Select Staff Member
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {staffList.map((member) => {
                    const shift = activeShifts.find(
                      (s) => s.staff?.id === member.id && s.status === 'started'
                    )
                    const isSelected = selectedStaffId === member.id
                    const isOnClock = Boolean(shift)
                    const onBreak = shift?.notes?.includes('[BREAK_STARTED:')

                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => handleStaffSelect(member.id)}
                        className={cn(
                          'p-2.5 rounded-lg border text-left transition-all relative flex flex-col justify-between',
                          isSelected
                            ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                            : 'border-border bg-card hover:bg-muted/50'
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-semibold text-xs truncate max-w-[120px]">
                            {member.name}
                          </span>
                          {isOnClock && (
                            <span className="flex h-2 w-2 relative">
                              <span
                                className={cn(
                                  'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                                  onBreak ? 'bg-amber-400' : 'bg-emerald-400'
                                )}
                              />
                              <span
                                className={cn(
                                  'relative inline-flex rounded-full h-2 w-2',
                                  onBreak ? 'bg-amber-500' : 'bg-emerald-500'
                                )}
                              />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5 py-0 h-4 uppercase font-medium',
                              isOnClock
                                ? onBreak
                                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                  : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/30'
                            )}
                          >
                            {isOnClock ? (onBreak ? 'On Break' : 'On Clock') : 'Clocked Out'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground capitalize">
                            {member.staffRole || 'Staff'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Action Box for selected staff */}
              {selectedStaffId && (
                <div className="p-4 rounded-xl border bg-muted/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-base flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        {staffList.find((s) => s.id === selectedStaffId)?.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {selectedStaffShift
                          ? `Clocked in at ${new Date(selectedStaffShift.clockIn || selectedStaffShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Currently not on the clock'}
                      </p>
                    </div>

                    {selectedStaffShift && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs font-bold px-2.5 py-1',
                          isStaffOnBreak
                            ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                            : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                        )}
                      >
                        {isStaffOnBreak ? 'Break in Progress' : 'Active Working'}
                      </Badge>
                    )}
                  </div>

                  {/* If Clocked Out: Shift setup controls */}
                  {!selectedStaffShift ? (
                    <div className="space-y-3 pt-2 border-t">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Job Role</Label>
                          <Select
                            value={selectedRole}
                            onValueChange={(val) => {
                              setSelectedRole(val)
                              const cfg = DEFAULT_ROLE_CONFIGS[val]
                              if (cfg) setHourlyRateInput(cfg.defaultHourlyRate.toFixed(2))
                            }}
                          >
                            <SelectTrigger className="h-9 mt-1 text-xs">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(DEFAULT_ROLE_CONFIGS).map(([k, cfg]) => (
                                <SelectItem key={k} value={k} className="text-xs">
                                  {cfg.label} (${cfg.defaultHourlyRate.toFixed(2)}/hr)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Hourly Base Wage ($)</Label>
                          <Input
                            type="number"
                            step="0.25"
                            min="0"
                            value={hourlyRateInput}
                            onChange={(e) => setHourlyRateInput(e.target.value)}
                            className="h-9 mt-1 text-xs tabular-nums"
                          />
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="lg"
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        disabled={submitting}
                        onClick={handleClockIn}
                      >
                        {submitting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <LogIn className="mr-2 h-4 w-4" />
                        )}
                        Clock In Now
                      </Button>
                    </div>
                  ) : (
                    /* If Clocked In: Break + Clock Out buttons */
                    <div className="space-y-3 pt-2 border-t">
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="lg"
                          disabled={submitting}
                          onClick={handleToggleBreak}
                          className={cn(
                            'font-semibold text-xs',
                            isStaffOnBreak ? 'border-amber-500 text-amber-600' : ''
                          )}
                        >
                          <Coffee className="mr-2 h-4 w-4" />
                          {isStaffOnBreak ? 'End Break' : 'Start Break'}
                        </Button>

                        <Button
                          type="button"
                          variant="destructive"
                          size="lg"
                          disabled={submitting}
                          onClick={() => triggerClockOutModal(selectedStaffShift)}
                          className="font-bold text-xs"
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          Clock Out Shift
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Roster of currently active staff */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Currently On Clock ({currentlyOnClock.length})
                  </Label>
                </div>
                {currentlyOnClock.length === 0 ? (
                  <div className="text-center py-6 border border-dashed rounded-lg text-xs text-muted-foreground">
                    No team members currently clocked in.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {currentlyOnClock.map((shift) => (
                      <div
                        key={shift.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border bg-card text-xs"
                      >
                        <div>
                          <div className="font-semibold text-foreground">{shift.staff?.name}</div>
                          <div className="text-[11px] text-muted-foreground capitalize">
                            {shift.role} • Clocked in at {new Date(shift.clockIn || shift.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] text-destructive hover:text-destructive"
                          onClick={() => triggerClockOutModal(shift)}
                        >
                          Clock Out
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clock Out Confirmation & Tip Declaration Dialog */}
      <Dialog open={clockOutDialogOpen} onOpenChange={setClockOutDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <LogOut className="h-5 w-5 text-destructive" />
              Clock Out & Tip Declaration
            </DialogTitle>
          </DialogHeader>

          {shiftToClockOut && (
            <div className="space-y-4 py-2 text-xs">
              <div className="bg-muted/40 p-3 rounded-lg border space-y-1">
                <div className="font-semibold text-sm">{shiftToClockOut.staff?.name}</div>
                <div className="text-muted-foreground capitalize">
                  Role: {shiftToClockOut.role} • Clock In: {new Date(shiftToClockOut.clockIn || shiftToClockOut.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Declared Cash Tips ($)</Label>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  Report any direct cash tips received for tax and payroll compliance
                </p>
                <div className="relative">
                  <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={declaredCashTips}
                    onChange={(e) => setDeclaredCashTips(e.target.value)}
                    className="pl-8 text-sm font-semibold tabular-nums"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Shift Notes (Optional)</Label>
                <Input
                  placeholder="e.g. Side work completed, cash drawer balanced"
                  value={clockOutNotes}
                  onChange={(e) => setClockOutNotes(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setClockOutDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={submitting}
              onClick={confirmClockOut}
              className="font-bold"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
              )}
              Confirm Clock Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
