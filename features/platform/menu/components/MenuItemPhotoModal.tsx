"use client";

import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Image as ImageIcon, Sparkles, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface PresetImage {
  name: string;
  path: string;
  category: "Burgers" | "Sides" | "Chicken" | "Drinks" | "Dessert";
}

export const PRESET_FOOD_IMAGES: PresetImage[] = [
  { name: "Classic Cheeseburger", path: "/images/classic-hamburger-with-lettuce-tomato.jpg", category: "Burgers" },
  { name: "Double Cheeseburger", path: "/images/double-cheeseburger-with-sauce-and-toppings.jpg", category: "Burgers" },
  { name: "Bacon BBQ Burger", path: "/images/bacon-bbq-burger-onion-rings.png", category: "Burgers" },
  { name: "Mushroom Swiss Burger", path: "/images/mushroom-swiss-burger.png", category: "Burgers" },
  { name: "Veggie Avocado Burger", path: "/images/veggie-burger-avocado.png", category: "Burgers" },
  { name: "Western BBQ Burger", path: "/images/western-burger-with-bbq-and-bacon.jpg", category: "Burgers" },
  { name: "Spicy Jalapeno Burger", path: "/images/spicy-jalapeno-burger-with-pepper-jack.jpg", category: "Burgers" },

  { name: "Crispy Chicken Sandwich", path: "/images/crispy-chicken-sandwich-with-pickles.jpg", category: "Chicken" },
  { name: "Grilled Chicken Sandwich", path: "/images/grilled-chicken-sandwich-healthy.jpg", category: "Chicken" },
  { name: "Spicy Chicken Sandwich", path: "/images/spicy-chicken-sandwich.png", category: "Chicken" },
  { name: "Chicken Tenders Basket", path: "/images/chicken-tenders-basket.jpg", category: "Chicken" },

  { name: "Golden French Fries", path: "/images/golden-french-fries.jpg", category: "Sides" },
  { name: "Loaded Fries", path: "/images/loaded-fries.png", category: "Sides" },
  { name: "Crispy Onion Rings", path: "/images/crispy-onion-rings.png", category: "Sides" },
  { name: "Sweet Potato Fries", path: "/images/sweet-potato-fries.png", category: "Sides" },
  { name: "Creamy Coleslaw", path: "/images/creamy-coleslaw.jpg", category: "Sides" },

  { name: "Fountain Soda", path: "/images/fountain-soda-drink-cup.jpg", category: "Drinks" },
  { name: "Fresh Iced Tea", path: "/images/iced-tea-glass.png", category: "Drinks" },
  { name: "Bottled Spring Water", path: "/images/bottled-water.png", category: "Drinks" },

  { name: "Thick Handspun Shake", path: "/images/thick-milkshake-with-whipped-cream.jpg", category: "Dessert" },
  { name: "Brownie Ice Cream Sundae", path: "/images/brownie-sundae-with-ice-cream.jpg", category: "Dessert" },
  { name: "Fresh Chocolate Chip Cookies", path: "/images/fresh-chocolate-chip-cookies.jpg", category: "Dessert" },
  { name: "Warm Apple Pie a la Mode", path: "/images/warm-apple-pie-with-ice-cream.jpg", category: "Dessert" },
];

interface MenuItemPhotoModalProps {
  item: { id: string; name: string; thumbnail?: string | null } | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function MenuItemPhotoModal({
  item,
  open,
  onClose,
  onSaved,
}: MenuItemPhotoModalProps) {
  const [activeTab, setActiveTab] = useState<string>("preset");
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!item) return null;

  const handleSelectPreset = (path: string) => {
    setSelectedPath(path);
    setCustomFile(null);
    setFilePreview(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCustomFile(file);
      setSelectedPath("");
      const objectUrl = URL.createObjectURL(file);
      setFilePreview(objectUrl);
    }
  };

  const handleSave = async () => {
    if (!selectedPath && !customFile && !urlInput) {
      toast.error("Please select a sample photo or upload an image file");
      return;
    }

    setIsSaving(true);
    try {
      let res: Response;

      if (customFile) {
        const formData = new FormData();
        formData.append("menuItemId", item.id);
        formData.append("file", customFile);
        formData.append("altText", `${item.name} photo`);

        res = await fetch("/api/platform/menu-item-image", {
          method: "POST",
          body: formData,
        });
      } else {
        const imagePath = selectedPath || urlInput.trim();
        res = await fetch("/api/platform/menu-item-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            menuItemId: item.id,
            imagePath,
            altText: `${item.name} photo`,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to save photo");
      }

      toast.success(`Photo saved for ${item.name}!`);
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save photo");
    } finally {
      setIsSaving(false);
    }
  };

  const activePreview =
    filePreview || selectedPath || urlInput || item.thumbnail;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0 pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ImageIcon className="size-5 text-primary" />
            Set Image for {item.name}
          </DialogTitle>
          <DialogDescription>
            Choose from sample restaurant food photos or upload your own image.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Current / Selected Preview */}
          <div className="flex items-center gap-4 p-3 rounded-lg border bg-muted/30">
            <div className="w-24 h-16 rounded overflow-hidden bg-muted shrink-0 border relative">
              {activePreview ? (
                <img
                  src={activePreview}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                  No Image
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Preview Selection
              </p>
              <p className="text-sm font-medium truncate mt-0.5">
                {customFile
                  ? `Custom upload: ${customFile.name}`
                  : selectedPath
                  ? PRESET_FOOD_IMAGES.find((p) => p.path === selectedPath)
                      ?.name || selectedPath
                  : urlInput || (item.thumbnail ? "Current photo" : "No photo selected")}
              </p>
            </div>
          </div>

          <div className="w-full">
            <div className="grid w-full grid-cols-3 rounded-lg bg-muted p-1 text-muted-foreground">
              <button
                type="button"
                onClick={() => setActiveTab("preset")}
                className={cn(
                  "flex items-center justify-center rounded-md py-1.5 text-xs font-medium transition-all",
                  activeTab === "preset"
                    ? "bg-background text-foreground shadow-xs"
                    : "hover:text-foreground"
                )}
              >
                <Sparkles className="size-3.5 mr-1.5" /> Sample Photos
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("upload")}
                className={cn(
                  "flex items-center justify-center rounded-md py-1.5 text-xs font-medium transition-all",
                  activeTab === "upload"
                    ? "bg-background text-foreground shadow-xs"
                    : "hover:text-foreground"
                )}
              >
                <Upload className="size-3.5 mr-1.5" /> Upload File
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("url")}
                className={cn(
                  "flex items-center justify-center rounded-md py-1.5 text-xs font-medium transition-all",
                  activeTab === "url"
                    ? "bg-background text-foreground shadow-xs"
                    : "hover:text-foreground"
                )}
              >
                <ImageIcon className="size-3.5 mr-1.5" /> Image URL
              </button>
            </div>

            {/* Presets Tab */}
            {activeTab === "preset" && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[320px] overflow-y-auto p-1">
                  {PRESET_FOOD_IMAGES.map((preset) => {
                    const isSelected = selectedPath === preset.path;
                    return (
                      <button
                        key={preset.path}
                        type="button"
                        onClick={() => handleSelectPreset(preset.path)}
                        className={cn(
                          "group relative rounded-lg border p-1 text-left transition-all hover:border-primary flex flex-col gap-1.5",
                          isSelected
                            ? "ring-2 ring-primary border-primary bg-primary/5"
                            : "bg-card"
                        )}
                      >
                        <div className="aspect-video w-full rounded overflow-hidden bg-muted relative">
                          <img
                            src={preset.path}
                            alt={preset.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          {isSelected && (
                            <div className="absolute top-1 right-1 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                              <Check className="size-3" />
                            </div>
                          )}
                        </div>
                        <div className="px-1 pb-1">
                          <p className="text-[11px] font-semibold leading-tight line-clamp-1">
                            {preset.name}
                          </p>
                          <span className="text-[9px] text-muted-foreground uppercase font-medium">
                            {preset.category}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom File Upload Tab */}
            {activeTab === "upload" && (
              <div className="space-y-4 mt-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/20 transition-colors flex flex-col items-center justify-center"
                >
                  <Upload className="size-8 text-muted-foreground/60 mb-2" />
                  <p className="text-sm font-semibold">
                    Click to select an image file
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports PNG, JPG, JPEG, and WebP (up to 10MB)
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {customFile && (
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-card text-xs">
                    <span className="font-medium truncate max-w-xs">
                      {customFile.name} ({(customFile.size / 1024).toFixed(1)} KB)
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => {
                        setCustomFile(null);
                        setFilePreview(null);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* External URL Tab */}
            {activeTab === "url" && (
              <div className="space-y-3 mt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="image-url-input" className="text-xs">
                    Direct Image URL or Local Path
                  </Label>
                  <Input
                    id="image-url-input"
                    placeholder="https://images.unsplash.com/... or /images/..."
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      setSelectedPath("");
                      setCustomFile(null);
                      setFilePreview(null);
                    }}
                    className="text-xs h-9"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Paste any web image link or local image path starting with /images/
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-4 border-t flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || (!selectedPath && !customFile && !urlInput)}
          >
            {isSaving ? (
              <>
                <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Saving Photo...
              </>
            ) : (
              "Save Photo"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
