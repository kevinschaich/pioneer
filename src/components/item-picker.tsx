import { useState } from "react"
import { ChevronsUpDown, Check } from "lucide-react"
import { itemIcon, itemName } from "@/lib/game"
import { cn } from "@/lib/utils"
import { Button, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Popover, PopoverContent, PopoverTrigger } from "@kevinschaich/components"

export function Icon({ src, size = 20, className, title }: { src: string; size?: number; className?: string; title?: string }) {
  if (!src) return null
  return <img src={src} width={size} height={size} alt="" title={title} draggable={false} className={cn("shrink-0 object-contain", className)} />
}

export const ItemIcon = ({ id, size, className }: { id: string; size?: number; className?: string }) =>
  <Icon src={itemIcon(id)} size={size} className={className} title={itemName(id)} />

export function ItemPicker({ value, items, onChange, className, placeholder = "Select item…", size = "default" }: {
  value: string
  items: string[]
  onChange: (id: string) => void
  className?: string
  placeholder?: string
  size?: "default" | "sm"
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" role="combobox" size={size} className={cn("w-full justify-between font-normal", className)} />}>
          <span className="flex min-w-0 items-center gap-2">
            {value && <ItemIcon id={value} size={size === "sm" ? 16 : 20} />}
            <span className="truncate">{value ? itemName(value) : placeholder}</span>
          </span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search items…" />
          <CommandList>
            <CommandEmpty>No item found.</CommandEmpty>
            <CommandGroup>
              {items.map((id) => (
                <CommandItem key={id} value={itemName(id)} onSelect={() => { onChange(id); setOpen(false) }}>
                  <ItemIcon id={id} size={20} />
                  <span className="truncate">{itemName(id)}</span>
                  <Check className={cn("ml-auto size-4", value === id ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
