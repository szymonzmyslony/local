"use client"

import * as React from "react"
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "../utils/cn"

const NavigationMenu = React.forwardRef<
    React.ElementRef<typeof NavigationMenuPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root>
>(({ className, ...props }, ref) => (
    <NavigationMenuPrimitive.Root
        ref={ref}
        className={cn(
            "relative z-10 flex w-max flex-1 items-center justify-center",
            className
        )}
        {...props}
    />
))
NavigationMenu.displayName = NavigationMenuPrimitive.Root.displayName

const NavigationMenuList = React.forwardRef<
    React.ElementRef<typeof NavigationMenuPrimitive.List>,
    React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(({ className, ...props }, ref) => (
    <NavigationMenuPrimitive.List
        ref={ref}
        className={cn(
            "group flex flex-1 list-none items-center justify-center gap-1",
            className
        )}
        {...props}
    />
))
NavigationMenuList.displayName = NavigationMenuPrimitive.List.displayName

const NavigationMenuItem = NavigationMenuPrimitive.Item

const navigationMenuTriggerStyle = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 h-10 px-4 py-2"

const NavigationMenuTrigger = React.forwardRef<
    React.ElementRef<typeof NavigationMenuPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
    <NavigationMenuPrimitive.Trigger
        ref={ref}
        className={cn("group flex items-center space-x-2", navigationMenuTriggerStyle, className)}
        {...props}
    >
        <span>{children}</span>
        <ChevronDownIcon
            className="relative top-px size-3 transition duration-200 group-data-[state=open]:rotate-180"
            aria-hidden="true"
        />
    </NavigationMenuPrimitive.Trigger>
))
NavigationMenuTrigger.displayName = NavigationMenuPrimitive.Trigger.displayName

const NavigationMenuContent = React.forwardRef<
    React.ElementRef<typeof NavigationMenuPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
    <NavigationMenuPrimitive.Content
        ref={ref}
        className={cn(
            "left-0 top-0 w-[var(--radix-navigation-menu-viewport-width)] rounded-md border border-slate-200 bg-white shadow-lg",
            className
        )}
        {...props}
    />
))
NavigationMenuContent.displayName = NavigationMenuPrimitive.Content.displayName

const NavigationMenuLink = NavigationMenuPrimitive.Link
const NavigationMenuIndicator = NavigationMenuPrimitive.Indicator
const NavigationMenuViewport = NavigationMenuPrimitive.Viewport

export {
    NavigationMenu,
    NavigationMenuList,
    NavigationMenuItem,
    NavigationMenuTrigger,
    NavigationMenuContent,
    NavigationMenuLink,
    NavigationMenuIndicator,
    NavigationMenuViewport,
    navigationMenuTriggerStyle,
}
