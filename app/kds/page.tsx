import React, { Suspense } from 'react'
import { KdsPage } from '@/features/platform/kds/screens/KdsPage'

interface Props {
  searchParams?: Promise<{ station?: string }> | { station?: string }
}

export default async function Page({ searchParams }: Props) {
  const resolved = searchParams ? await Promise.resolve(searchParams) : {}
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen">Loading KDS...</div>}>
      <KdsPage searchParams={resolved} />
    </Suspense>
  )
}
