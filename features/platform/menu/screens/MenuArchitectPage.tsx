"use client";

import React, { useState, useEffect, useMemo } from "react";
import { gql, request } from "graphql-request";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Layers, ChevronRight, Utensils, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs";
import { formatCurrency } from "@/features/storefront/lib/currency";
import { EditItemDrawerClientWrapper } from "@/features/platform/components/EditItemDrawerClientWrapper";
import { CreateItemDrawerClientWrapper } from "@/features/platform/components/CreateItemDrawerClientWrapper";
import { MenuItemPhotoModal } from "@/features/platform/menu/components/MenuItemPhotoModal";

const GET_MENU_DATA = gql`
  query GetMenuData {
    menuCategories(orderBy: { sortOrder: asc }) {
      id name icon description
    }
    menuItems(orderBy: { name: asc }) {
      id name price available popular kitchenStation thumbnail
      category { id }
      modifiers { id name priceAdjustment }
    }
    storeSettings { currencyCode locale }
  }
`;

export function MenuArchitectPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [photoModalItem, setPhotoModalItem] = useState<any>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createListKey, setCreateListKey] = useState<string>("menu-items");

  const fetchData = async () => {
    try {
      const res = await request("/api/graphql", GET_MENU_DATA);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const currencyConfig = useMemo(() => ({
    currencyCode: data?.storeSettings?.currencyCode || "USD",
    locale: data?.storeSettings?.locale || "en-US",
  }), [data]);

  const filteredItems = useMemo(() => {
    if (!data?.menuItems) return [];
    if (activeCategoryId === "all") return data.menuItems;
    return data.menuItems.filter((item: any) => item.category?.id === activeCategoryId);
  }, [data, activeCategoryId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
        Loading menu data…
      </div>
    );
  }

  const breadcrumbs = [
    { type: "link" as const, label: "Dashboard", href: "" },
    { type: "page" as const, label: "Platform" },
    { type: "page" as const, label: "Menu" },
  ];

  const categories = data?.menuCategories || [];
  const totalItems = data?.menuItems?.length || 0;
  const availableItems = data?.menuItems?.filter((i: any) => i.available).length || 0;

  return (
    <div className="flex flex-col h-full bg-background">
      <PageBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalItems} items · {availableItems} available
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setCreateListKey("menu-categories");
              setIsCreateOpen(true);
            }}
          >
            New Category
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setCreateListKey("menu-items");
              setIsCreateOpen(true);
            }}
          >
            <Plus size={13} className="mr-1.5" />
            New Item
          </Button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: category sidebar */}
        <div className="w-48 xl:w-56 shrink-0 border-r border-border overflow-y-auto flex flex-col">
          <div className="flex-1">
            <button
              onClick={() => setActiveCategoryId("all")}
              className={cn(
                "w-full text-left px-4 py-3 text-sm flex items-center justify-between border-b border-border transition-colors",
                activeCategoryId === "all"
                  ? "bg-muted font-medium"
                  : "hover:bg-muted/30 text-muted-foreground"
              )}
            >
              <span>All Items</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {totalItems}
              </span>
            </button>
            {categories.map((cat: any) => {
              const count = data?.menuItems?.filter((i: any) => i.category?.id === cat.id).length || 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategoryId(cat.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 text-sm flex items-center justify-between border-b border-border transition-colors",
                    activeCategoryId === cat.id
                      ? "bg-muted font-medium"
                      : "hover:bg-muted/30 text-muted-foreground"
                  )}
                >
                  <span className="truncate">{cat.name}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums ml-2 shrink-0">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Add category button */}
          <button
            onClick={() => {
              setCreateListKey("menu-categories");
              setIsCreateOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 border-t border-border transition-colors w-full"
          >
            <Plus size={12} />
            Add Category
          </button>
        </div>

        {/* Right: item grid */}
        <div className="flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-8">
              <Utensils size={28} className="text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No items in this category.</p>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  setCreateListKey("menu-items");
                  setIsCreateOpen(true);
                }}
              >
                <Plus size={12} className="mr-1.5" /> Add First Item
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 divide-x divide-y border-b border-border">
              {filteredItems.map((item: any) => {
                const imageSrc = item.thumbnail;
                const imageAlt = item.name;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex flex-col bg-card group",
                      !item.available && "opacity-50"
                    )}
                  >
                    {/* Image */}
                    <div className="aspect-video bg-muted overflow-hidden relative group/img">
                      {imageSrc ? (
                        <img
                          src={imageSrc}
                          alt={imageAlt}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Utensils size={20} className="text-muted-foreground/20" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPhotoModalItem(item);
                        }}
                        className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-xs font-medium cursor-pointer"
                        title="Set image"
                      >
                        <ImageIcon size={14} />
                        {imageSrc ? "Change Photo" : "Add Photo"}
                      </button>
                    </div>

                    {/* Info */}
                    <div className="p-3 flex flex-col flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold leading-tight">{item.name}</p>
                        <p className="text-sm font-semibold shrink-0">
                          {formatCurrency(parseInt(item.price), currencyConfig)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {/* Availability dot */}
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            item.available ? "bg-emerald-500" : "bg-red-400"
                          )} />
                          {item.available ? "Available" : "86'd"}
                        </span>
                        {item.popular && (
                          <span className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">★ Popular</span>
                        )}
                        {item.kitchenStation && (
                          <span className="text-[10px] text-muted-foreground">{item.kitchenStation}</span>
                        )}
                      </div>

                      {item.modifiers?.length > 0 && (
                        <div className="flex items-center gap-1 mb-2">
                          <Layers size={10} className="text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">
                            {item.modifiers.length} modifier{item.modifiers.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="mt-auto pt-2 border-t border-border flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setPhotoModalItem(item)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ImageIcon size={11} /> Photo
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingItemId(item.id)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit2 size={11} /> Configure
                          <ChevronRight size={10} className="ml-auto" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add new item card */}
              <button
                className="aspect-auto min-h-[160px] flex flex-col items-center justify-center p-8 text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/20 transition-colors border-dashed"
                onClick={() => {
                  setCreateListKey("menu-items");
                  setIsCreateOpen(true);
                }}
              >
                <Plus size={20} className="mb-2" />
                <span className="text-xs">Add Item</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {editingItemId && (
        <EditItemDrawerClientWrapper
          listKey="menu-items"
          itemId={editingItemId}
          open={!!editingItemId}
          onClose={() => setEditingItemId(null)}
          onSave={() => fetchData()}
        />
      )}

      <CreateItemDrawerClientWrapper
        listKey={createListKey}
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={() => fetchData()}
      />

      <MenuItemPhotoModal
        item={photoModalItem}
        open={!!photoModalItem}
        onClose={() => setPhotoModalItem(null)}
        onSaved={() => fetchData()}
      />
    </div>
  );
}

export default MenuArchitectPage;
