import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import { useVirtualizer } from "@tanstack/react-virtual"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ChevronDownIcon, XIcon, CheckIcon } from "lucide-react"

const Combobox = ComboboxPrimitive.Root

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />
}

const ComboboxTrigger = React.forwardRef<
  HTMLButtonElement,
  ComboboxPrimitive.Trigger.Props
>(({ className, children, ...props }, ref) => {
  return (
    <ComboboxPrimitive.Trigger
      ref={ref}
      data-slot="combobox-trigger"
      className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      {children}
      <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  )
})
ComboboxTrigger.displayName = "ComboboxTrigger"

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<InputGroupButton variant="ghost" size="icon-xs" />}
      className={cn(className)}
      {...props}
    >
      <XIcon className="pointer-events-none" />
    </ComboboxPrimitive.Clear>
  )
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean
  showClear?: boolean
}) {
  return (
    <InputGroup
      className={cn(
        // Inside the popup the input is the only control, so the focus ring just boxes in the
        // whole dropdown; the popup already has its own ring.
        "w-auto in-data-[slot=combobox-content]:has-[[data-slot=input-group-control]:focus-visible]:border-input in-data-[slot=combobox-content]:has-[[data-slot=input-group-control]:focus-visible]:ring-0!",
        className
      )}
    >
      <ComboboxPrimitive.Input
        render={<InputGroupInput disabled={disabled} />}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            render={<ComboboxTrigger />}
            data-slot="input-group-button"
            className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
            disabled={disabled}
          />
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  )
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          data-chips={!!anchor}
          className={cn("group/combobox-content relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-[calc(var(--anchor-width)+--spacing(7))] origin-(--transform-origin) overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[chips=true]:min-w-(--anchor-width) data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-1 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:bg-input/30 *:data-[slot=input-group]:shadow-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        className
      )}
      {...props}
    />
  )
}

const ComboboxItem = React.forwardRef<
  HTMLDivElement,
  ComboboxPrimitive.Item.Props
>(({ className, children, ...props }, ref) => {
  return (
    <ComboboxPrimitive.Item
      ref={ref}
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
})
ComboboxItem.displayName = "ComboboxItem"

type ComboboxVirtualizer = ReturnType<
  typeof useVirtualizer<HTMLDivElement, Element>
>

// ComboboxVirtualList renders the popup list virtualized via @tanstack/react-virtual:
// only the visible rows mount, so lists of thousands stay cheap. It reads the combobox's
// filtered items (server-side filtering still applies via filter={null} on the Root) and
// renders each through `children`. Pair it with `virtualized` + an `onItemHighlighted`
// scroll handler on the Root, sharing `virtualizerRef` so keyboard nav can scroll rows in.
function ComboboxVirtualList<T>({
  open,
  virtualizerRef,
  scrollOffsetRef,
  estimateSize = 36,
  overscan = 20,
  className,
  children,
}: {
  open: boolean
  virtualizerRef: React.RefObject<ComboboxVirtualizer | null>
  // Caller-owned so it survives the popup unmounting on close; the list restores it on re-mount.
  scrollOffsetRef?: React.MutableRefObject<number>
  estimateSize?: number
  overscan?: number
  className?: string
  children: (item: T, index: number) => React.ReactNode
}) {
  const items = ComboboxPrimitive.useFilteredItems<T>()
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    enabled: open,
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
    paddingStart: 4,
    paddingEnd: 4,
    scrollPaddingStart: 4,
    scrollPaddingEnd: 4,
    initialOffset: scrollOffsetRef?.current ?? 0,
  })

  React.useImperativeHandle(virtualizerRef, () => virtualizer, [virtualizer])

  const setScrollRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element
      if (element) {
        // Measure so rows size correctly, then restore the caller's saved scroll
        // position (the popup re-mounts on each open, resetting the DOM scrollTop).
        virtualizer.measure()
        const saved = scrollOffsetRef?.current ?? 0
        if (saved > 0) {
          element.scrollTop = saved
        }
      }
    },
    [virtualizer, scrollOffsetRef]
  )

  const totalSize = virtualizer.getTotalSize()

  return (
    <ComboboxPrimitive.List data-slot="combobox-list" className="p-0">
      {items.length > 0 && (
        <div
          role="presentation"
          ref={setScrollRef}
          onScroll={
            scrollOffsetRef
              ? (event) => {
                  // Closing collapses the virtualized content and snaps scrollTop to 0;
                  // ignore that so the last real position survives to the next open.
                  if (!open) {
                    return
                  }
                  scrollOffsetRef.current = event.currentTarget.scrollTop
                }
              : undefined
          }
          className={cn(
            "h-[min(--spacing(72),var(--total-size))] max-h-(--available-height) overflow-y-auto overscroll-contain scroll-py-1",
            className
          )}
          style={{ "--total-size": `${totalSize}px` } as React.CSSProperties}
        >
          <div
            role="presentation"
            className="relative w-full"
            style={{ height: totalSize }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = items[virtualItem.index]
              if (item == null) {
                return null
              }
              return (
                <ComboboxItem
                  key={virtualItem.key}
                  value={item}
                  index={virtualItem.index}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  aria-setsize={items.length}
                  aria-posinset={virtualItem.index + 1}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: virtualItem.size,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {children(item, virtualItem.index)}
                </ComboboxItem>
              )
            })}
          </div>
        </div>
      )}
    </ComboboxPrimitive.List>
  )
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn(className)}
      {...props}
    />
  )
}

function ComboboxLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return (
    <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
  )
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex",
        className
      )}
      {...props}
    />
  )
}

function ComboboxSeparator({
  className,
  ...props
}: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> &
  ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent bg-clip-padding px-2.5 py-1.5 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 has-data-[slot=combobox-chip]:px-1.5 dark:bg-input/30 dark:has-aria-invalid:border-destructive/50 dark:has-aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "flex h-[calc(--spacing(5.5))] w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0",
        className
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          render={<Button variant="ghost" size="icon-xs" />}
          className="-ml-1 opacity-50 hover:opacity-100"
          data-slot="combobox-chip-remove"
        >
          <XIcon className="pointer-events-none" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  )
}

function ComboboxChipsInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn("min-w-16 flex-1 outline-none", className)}
      {...props}
    />
  )
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null)
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxVirtualList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxValue,
  // eslint-disable-next-line react-refresh/only-export-components
  useComboboxAnchor,
}

export type { ComboboxVirtualizer }
