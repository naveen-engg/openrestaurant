/**
 * ApiKeyListPageClient - API Keys Platform Page
 */

'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Key, Activity, Clock, Copy, Trash2, Terminal, Plus, ShieldOff, ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs"
import { PlatformFilterBar } from '@/features/platform/components/PlatformFilterBar'
import { useListItemsQuery } from '@/features/dashboard/hooks/useListItems.query'
import { buildOrderByClause } from '@/features/dashboard/lib/buildOrderByClause'
import { buildWhereClause } from '@/features/dashboard/lib/buildWhereClause'
import { CreateApiKey } from './CreateApiKey'
import { deleteApiKey, updateApiKey } from '../actions/getApiKeys'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ApiKeyListPageClientProps {
  list: any
  initialData: { items: any[], count: number }
  initialError: string | null
  initialSearchParams: {
    page: number
    pageSize: number
    search: string
  }
}

export function ApiKeyListPageClient({
  list,
  initialData,
  initialError,
  initialSearchParams
}: ApiKeyListPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const currentSearchParams = useMemo(() => {
    const params: Record<string, string> = {}
    searchParams?.forEach((value, key) => { params[key] = value })
    return params
  }, [searchParams])

  const currentPage = parseInt(currentSearchParams.page || '1', 10) || 1
  const pageSize = parseInt(currentSearchParams.pageSize || list.pageSize?.toString() || '50', 10)
  const searchString = currentSearchParams.search || ''

  const variables = useMemo(() => {
    const orderBy = buildOrderByClause(list, currentSearchParams)
    const filterWhere = buildWhereClause(list, currentSearchParams)
    const searchParameters = searchString ? { search: searchString } : {}
    const searchWhere = buildWhereClause(list, searchParameters)
    const whereConditions = []
    if (Object.keys(searchWhere).length > 0) whereConditions.push(searchWhere)
    if (Object.keys(filterWhere).length > 0) whereConditions.push(filterWhere)
    const where = whereConditions.length > 0 ? { AND: whereConditions } : {}
    return { where, take: pageSize, skip: (currentPage - 1) * pageSize, orderBy }
  }, [list, currentSearchParams, currentPage, pageSize, searchString])

  const querySelectedFields = `
    id name tokenPreview scopes status expiresAt lastUsedAt usageCount restrictedToIPs
    user { id name email }
    createdAt updatedAt
  `

  const { data: queryData, error: queryError, refetch } = useListItemsQuery(
    { listKey: list.key, variables, selectedFields: querySelectedFields },
    { initialData: initialError ? undefined : initialData }
  )

  const data = queryData || initialData
  const error = queryError ? queryError.message : initialError

  const handleResetFilters = useCallback(() => {
    router.push(window.location.pathname)
  }, [router])

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete API key "${name}"? This action cannot be undone.`)) {
      return
    }
    setLoadingId(id)
    try {
      const res = await deleteApiKey(id)
      if (res.success) {
        toast.success(`API key "${name}" deleted successfully`)
        if (refetch) refetch()
        router.refresh()
      } else {
        toast.error(res.error || 'Failed to delete API key')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete API key')
    } finally {
      setLoadingId(null)
    }
  }

  const handleToggleRevoke = async (id: string, currentStatus: string, name: string) => {
    const newStatus = currentStatus === 'revoked' ? 'active' : 'revoked'
    setLoadingId(id)
    try {
      const res = await updateApiKey(id, { status: newStatus })
      if (res.success) {
        toast.success(`API key "${name}" is now ${newStatus}`)
        if (refetch) refetch()
        router.refresh()
      } else {
        toast.error(res.error || `Failed to update status to ${newStatus}`)
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update API key')
    } finally {
      setLoadingId(null)
    }
  }

  const handleCopyPreview = (tokenPreview: string) => {
    if (tokenPreview) {
      navigator.clipboard.writeText(tokenPreview)
      toast.success('Token preview copied')
    }
  }

  const activeKeys = data?.items?.filter((k: any) => k.status === 'active').length || 0
  const totalRequests = data?.items?.reduce((sum: number, k: any) => sum + (k.usageCount || 0), 0) || 0
  const isEmpty = data?.count === 0 && !searchString

  return (
    <div className="flex flex-col h-full bg-background">
      <PageBreadcrumbs
        items={[
          { type: "link", label: "Dashboard", href: "" },
          { type: "page", label: "Platform" },
          { type: "page", label: "API Keys" },
        ]}
      />

      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage programmatic access to your restaurant data.
          </p>
        </div>
        <CreateApiKey />
      </div>

      {/* Stat Strip */}
      <div className="grid grid-cols-3 divide-x border-b border-border">
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Active Keys</p>
          <p className="text-xl font-semibold mt-1">{activeKeys}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Requests</p>
          <p className="text-xl font-semibold mt-1">{totalRequests.toLocaleString()}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">API Version</p>
          <p className="text-xl font-semibold mt-1">v1.2.4</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 md:px-6 py-3 border-b border-border">
        <PlatformFilterBar list={list} showDisplayButton={false} />
      </div>

      {/* Keys List */}
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {error ? (
            <div className="p-4 md:p-6">
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : isEmpty ? (
            <div className="py-16 flex flex-col items-center justify-center text-center px-8">
              <Key size={28} className="text-muted-foreground/20 mb-3" />
              <p className="text-sm font-medium mb-1">No API keys yet</p>
              <p className="text-xs text-muted-foreground max-w-xs mb-4">
                Generate your first key to start integrating your restaurant with external services.
              </p>
              <CreateApiKey />
            </div>
          ) : (
            data?.items?.map((apiKey: any) => (
              <div key={apiKey.id} className="px-4 md:px-6 py-4 hover:bg-muted/20 transition-colors flex items-start gap-4 group">
                {/* Status dot */}
                <div className="pt-1.5 shrink-0">
                  <span className={cn(
                    'w-2.5 h-2.5 rounded-full inline-block',
                    apiKey.status === 'active' ? 'bg-emerald-500' : 'bg-red-400'
                  )} />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{apiKey.name}</p>
                        <span className={cn(
                          'text-[10px] uppercase tracking-wider font-semibold',
                          apiKey.status === 'active' ? 'text-emerald-600' : 'text-red-500'
                        )}>
                          {apiKey.status}
                        </span>
                      </div>

                      {/* Token preview */}
                      <div className="flex items-center gap-1.5 mt-1.5 bg-muted/50 border border-border rounded px-2.5 py-1.5 max-w-xs">
                        <code className="text-[11px] font-mono text-muted-foreground">
                          {apiKey.tokenPreview || '••••••••••••••••••••••••••••'}
                        </code>
                        <button
                          type="button"
                          className="ml-auto text-muted-foreground hover:text-foreground transition-colors p-0.5"
                          onClick={() => handleCopyPreview(apiKey.tokenPreview)}
                          title="Copy preview"
                        >
                          <Copy size={11} />
                        </button>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Activity size={10} />
                          {(apiKey.usageCount || 0).toLocaleString()} requests
                        </span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock size={10} />
                          {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleDateString() : 'Never used'}
                        </span>
                        {apiKey.scopes?.length > 0 && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Terminal size={10} />
                            {apiKey.scopes.length} scope{apiKey.scopes.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {apiKey.expiresAt && (
                          <span className="text-[11px] text-muted-foreground">
                            Expires {new Date(apiKey.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs gap-1"
                        disabled={loadingId === apiKey.id}
                        onClick={() => handleToggleRevoke(apiKey.id, apiKey.status, apiKey.name)}
                        title={apiKey.status === 'revoked' ? "Reactivate Key" : "Revoke Key"}
                      >
                        {apiKey.status === 'revoked' ? (
                          <>
                            <ShieldCheck size={13} className="text-emerald-500" />
                            <span>Reactivate</span>
                          </>
                        ) : (
                          <>
                            <ShieldOff size={13} className="text-amber-500" />
                            <span>Revoke</span>
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                        disabled={loadingId === apiKey.id}
                        onClick={() => handleDelete(apiKey.id, apiKey.name)}
                        title="Delete API Key"
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
