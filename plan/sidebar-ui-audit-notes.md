# Sidebar UI audit notes

- Browser at `/app/dashboard/profile` shows the no-user empty state; profile forms are unavailable without creating/selecting user data.
- Icon sidebar is 64px wide. `SidebarContent` adds 12px horizontal padding each side and `SidebarGroup` adds another 8px each side, leaving 24px for a 40px icon button. `SidebarContent` clips overflow in icon mode.
- Tooltip trigger currently wraps `SidebarMenuItem` (`li`) rather than the clickable menu control, so hover/focus scope and semantics are incorrect.
