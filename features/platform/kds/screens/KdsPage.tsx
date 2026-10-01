/**
 * KDS (Kitchen Display System) Page - Server Component
 * Displays incoming orders by kitchen station
 */

import React from 'react'
import { KDSClient } from './KDSClient'

interface KdsPageProps {
  searchParams?: Promise<{ station?: string }> | { station?: string }
}

export async function KDSPage({ searchParams }: KdsPageProps = {}) {
  const resolved = searchParams ? await Promise.resolve(searchParams) : {}
  return <KDSClient initialStation={resolved.station} />
}

export default KDSPage
