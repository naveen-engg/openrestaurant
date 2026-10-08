"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { XIcon, ChevronDown } from "lucide-react";
const DateTimePicker = ({ value, onChange, placeholder }: any) => (
  <Input
    type="datetime-local"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
  />
);
import { createApiKey } from "../actions/getApiKeys";
import type { Option } from "@/components/ui/multiple-selector";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Client-side token generation
function generateApiKeyToken(): string {
  // Generate a secure API key token in the browser
  const prefix = 'of_';
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  
  // Convert to base62 (alphanumeric) for readability
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < randomBytes.length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  
  return prefix + result;
}

// Define API key scopes as options
const scopeOptions: Option[] = [
  { value: "read_orders", label: "read_orders" },
  { value: "write_orders", label: "write_orders" },
  { value: "read_menu", label: "read_menu" },
  { value: "write_menu", label: "write_menu" },
  { value: "read_reservations", label: "read_reservations" },
  { value: "write_reservations", label: "write_reservations" },
  { value: "read_inventory", label: "read_inventory" },
  { value: "write_inventory", label: "write_inventory" },
  { value: "read_payments", label: "read_payments" },
  { value: "write_payments", label: "write_payments" },
];

function ScopesMultiSelect({
  value = [],
  onChange,
  options = [],
  placeholder = "Select scopes for this API key",
  isDisabled = false,
}: {
  value?: Option[];
  onChange?: (options: Option[]) => void;
  options?: Option[];
  placeholder?: string;
  isDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        commandRef.current &&
        !commandRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (option: Option) => {
      if (!value.some((v) => v.value === option.value)) {
        const newValue = [...value, option];
        onChange?.(newValue);
      }
      setInputValue("");
    },
    [value, onChange]
  );

  const handleRemove = useCallback(
    (optionToRemove: Option) => {
      const newValue = value.filter((v) => v.value !== optionToRemove.value);
      onChange?.(newValue);
    },
    [value, onChange]
  );

  const handleClearAll = useCallback(() => {
    onChange?.([]);
  }, [onChange]);

  // Filter out selected options and by input value
  const filteredOptions = options.filter(
    (option) => !value.some((v) => v.value === option.value) &&
    option.label.toLowerCase().includes(inputValue.toLowerCase())
  );

  return (
    <div className="relative" ref={commandRef}>
      <div
        className={cn(
          "border-input ring-offset-background focus-within:ring-ring flex min-h-11 w-full items-center justify-between rounded-md border bg-transparent px-4 py-2 focus-within:ring-2 focus-within:ring-offset-2 text-left",
          isDisabled && "cursor-not-allowed opacity-50"
        )}
        onClick={() => {
          if (!isDisabled) {
            setOpen(true);
            inputRef.current?.focus();
          }
        }}
      >
        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
          {value.map((option) => (
            <div
              key={option.value}
              className="animate-fadeIn bg-background text-secondary-foreground relative inline-flex h-7 cursor-default items-center rounded-md border ps-2 pe-7 text-xs font-medium transition-all disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 max-w-full"
            >
              <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">{option.label}</span>
              {!isDisabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(option);
                  }}
                  className="text-muted-foreground/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute -inset-y-px -end-px flex size-7 items-center justify-center rounded-e-md border border-transparent p-0 outline-hidden transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          <input
            ref={inputRef}
            disabled={isDisabled}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className={cn(
              "placeholder:text-muted-foreground flex-1 bg-transparent outline-none",
              value.length === 0 ? "w-full" : "w-20"
            )}
            placeholder={value.length === 0 ? placeholder : ""}
          />
        </div>
        <div className="flex items-center gap-1">
          {value.length > 0 && !isDisabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll();
              }}
              className="text-muted-foreground/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex size-7 items-center justify-center rounded-md border border-transparent transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </div>
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full max-w-[400px]">
          <Command className="border-input rounded-md border bg-popover shadow-md">
            <CommandList className="max-h-48">
              <>
                {filteredOptions.length === 0 ? (
                  <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                    {inputValue.length > 0 ? (
                      <>No results found for "{inputValue}"</>
                    ) : (
                      <>All options have been selected</>
                    )}
                  </CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filteredOptions.map((option) => (
                      <div className="px-1 py-0.5" key={option.value}>
                        <div 
                          onClick={() => handleSelect(option)}
                          className="relative cursor-pointer rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                        >
                          <div className="flex-1 whitespace-normal break-words overflow-visible min-w-0 pr-2">
                            {option.label}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CommandGroup>
                )}
              </>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}

export function CreateApiKey() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [createdToken, setCreatedToken] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    scopes: [] as Option[],
    expiresAt: "",
  });

  const router = useRouter();

  const handleScopeChange = (scopes: Option[]) => {
    setFormData(prev => ({
      ...prev,
      scopes: scopes
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error("Please enter a name for your API key");
      return;
    }

    if (formData.scopes.length === 0) {
      toast.error("Please select at least one scope");
      return;
    }

    setLoading(true);

    try {
      // Generate token client-side
      const generatedToken = generateApiKeyToken();
      
      const result = await createApiKey({
        name: formData.name,
        scopes: formData.scopes.map(scope => scope.value),
        expiresAt: formData.expiresAt || undefined,
        tokenSecret: generatedToken, // Pass the generated token to be hashed
      });

      if (result.success) {
        // Show the generated token (this is the only time it will be visible)
        setCreatedToken(generatedToken);
        setShowToken(true);
        toast.success("API key created successfully!");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to create API key");
      }
    } catch (error) {
      console.error("Error creating API key:", error);
      toast.error("Failed to create API key");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setShowToken(false);
    setCreatedToken("");
    setFormData({
      name: "",
      scopes: [] as Option[],
      expiresAt: "",
    });
  };

  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    if (!createdToken) return;

    let success = false;

    // 1. Try modern Clipboard API
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(createdToken);
        success = true;
      } catch (err) {
        // Continue to fallback
      }
    }

    // 2. Fallback for non-HTTPS / IP addresses / legacy browsers
    if (!success) {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = createdToken;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.left = "0";
        textArea.style.top = "0";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, 99999);
        
        success = document.execCommand("copy");
        document.body.removeChild(textArea);
      } catch (err) {
        success = false;
      }
    }

    if (success) {
      setCopied(true);
      toast.success("API key copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.info("Please select the key and press Ctrl+C to copy");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) {
        // Reset all state when dialog is closed
        setShowToken(false);
        setCreatedToken("");
        setCopied(false);
        setFormData({
          name: "",
          scopes: [] as Option[],
          expiresAt: "",
        });
      }
    }}>
      <DialogTrigger asChild>
        <Button 
          size="icon"
          className="lg:px-4 lg:py-2 lg:w-auto rounded-lg"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden lg:inline">Create API Key</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        {!showToken ? (
          <>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                Create a new API key for programmatic access to Openfront. Choose the minimum permissions needed.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="e.g., Production Bot, Analytics Dashboard"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label>
                    Scopes <span className="text-red-500">*</span>
                  </Label>
                  <ScopesMultiSelect
                    value={formData.scopes as any}
                    options={scopeOptions as any}
                    onChange={handleScopeChange as any}
                    placeholder="Select scopes for this API key"
                  />
                  <p className="text-muted-foreground mt-2 text-xs">
                    Select the minimum permissions needed for this API key
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="expiresAt">Expiration (optional)</Label>
                  <DateTimePicker
                    value={formData.expiresAt}
                    onChange={(value: string) => setFormData(prev => ({ ...prev, expiresAt: value }))}
                    placeholder="Set expiration date and time"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create API Key"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>API Key Created</DialogTitle>
              <DialogDescription>
                Your API key has been created. Copy it now — you won't be able to see it again.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={createdToken}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="font-mono text-xs select-all bg-muted/30 cursor-pointer h-10 tracking-wide font-medium"
                  />
                  <Button
                    type="button"
                    variant={copied ? "default" : "outline"}
                    size="sm"
                    className="shrink-0 gap-1.5 h-10 px-3.5"
                    onClick={copyToClipboard}
                  >
                    <Copy className="h-4 w-4" />
                    <span>{copied ? "Copied!" : "Copy"}</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Make sure to copy your API key now. It is never displayed again.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}