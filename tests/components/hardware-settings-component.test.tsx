import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HardwareSettingsModal } from '@/features/platform/hardware/components/HardwareSettingsModal'

describe('Stage 8: Hardware Settings & Direct Printing (Component Tests)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders HardwareSettingsModal with header, tabs, and default receipt printer options', () => {
    render(
      <HardwareSettingsModal
        open={true}
        onOpenChange={vi.fn()}
      />
    )

    expect(screen.getByText('Hardware & ESC/POS Printers')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Receipt Printer/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Kitchen Printer/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Cash Drawer/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Live Preview/i })).toBeInTheDocument()

    // Default receipt printer options
    expect(screen.getByText('Thermal Roll Width')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /80mm \(42 Col\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /58mm \(32 Col\)/i })).toBeInTheDocument()
  })

  it('switches to Kitchen Printer tab and renders kitchen printer controls', () => {
    render(
      <HardwareSettingsModal
        open={true}
        onOpenChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: /Kitchen Printer/i }))
    expect(screen.getByText('Line cook ticket printer on expo or stations')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test Kitchen Print/i })).toBeInTheDocument()
  })

  it('switches to Cash Drawer tab and triggers drawer kick test pulse', async () => {
    const handleKick = vi.fn()
    render(
      <HardwareSettingsModal
        open={true}
        onOpenChange={vi.fn()}
        onTestKickDrawer={handleKick}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: /Cash Drawer/i }))
    expect(screen.getByText(/Auto-Kick Drawer on Cash Payment/i)).toBeInTheDocument()

    const kickBtn = screen.getByRole('button', { name: /Kick Drawer Now/i })
    fireEvent.click(kickBtn)

    await waitFor(() => {
      expect(handleKick).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/Cash drawer kick pulse sent/i)).toBeInTheDocument()
    })
  })

  it('switches to Live Preview tab and displays monospace thermal receipt representation', () => {
    render(
      <HardwareSettingsModal
        open={true}
        onOpenChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: /Live Preview/i }))
    expect(screen.getByText(/Simulated 80mm Thermal Receipt/i)).toBeInTheDocument()
    expect(screen.getByText('Check: #1048')).toBeInTheDocument()
    expect(screen.getByText('Table: T2')).toBeInTheDocument()
    expect(screen.getByText('2x Classic Smash Burger')).toBeInTheDocument()
    expect(screen.getAllByText('$75.96').length).toBeGreaterThanOrEqual(1)
  })

  it('triggers test receipt print and test kitchen print actions', async () => {
    const handleReceipt = vi.fn()
    const handleKitchen = vi.fn()

    render(
      <HardwareSettingsModal
        open={true}
        onOpenChange={vi.fn()}
        onTestPrintReceipt={handleReceipt}
        onTestPrintKitchen={handleKitchen}
      />
    )

    // Test receipt print on default tab
    fireEvent.click(screen.getByRole('button', { name: /Test Receipt Print/i }))
    await waitFor(() => {
      expect(handleReceipt).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/Test receipt dispatched to printer/i)).toBeInTheDocument()
    })

    // Test kitchen print on kitchen tab
    fireEvent.click(screen.getByRole('tab', { name: /Kitchen Printer/i }))
    fireEvent.click(screen.getByRole('button', { name: /Test Kitchen Print/i }))
    await waitFor(() => {
      expect(handleKitchen).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/Test kitchen prep ticket dispatched to printer/i)).toBeInTheDocument()
    })
  })

  it('saves hardware settings successfully', async () => {
    const handleOpenChange = vi.fn()
    render(
      <HardwareSettingsModal
        open={true}
        onOpenChange={handleOpenChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Save Hardware Settings/i }))
    await waitFor(() => {
      expect(screen.getByText(/Hardware configuration saved successfully/i)).toBeInTheDocument()
    })
  })
})
