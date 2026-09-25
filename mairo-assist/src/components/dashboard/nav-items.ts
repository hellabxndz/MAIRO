import type { Permission } from "@/lib/tenancy/permissions";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "overview", permission: "business.view" },
  { href: "/dashboard/inbox", label: "AI Inbox", icon: "inbox", permission: "inbox.view" },
  { href: "/dashboard/orders", label: "Orders", icon: "orders", permission: "orders.view" },
  { href: "/dashboard/approvals", label: "Approvals", icon: "approvals", permission: "approvals.view" },
  { href: "/dashboard/customers", label: "Customers", icon: "customers", permission: "customers.view" },
  { href: "/dashboard/products", label: "Products", icon: "products", permission: "business.view" },
  { href: "/dashboard/ai-employee", label: "AI Employee", icon: "ai", permission: "ai.view" },
  { href: "/dashboard/knowledge", label: "Knowledge Base", icon: "knowledge", permission: "knowledge.view" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "analytics", permission: "analytics.view" },
  { href: "/dashboard/integrations", label: "Integrations", icon: "integrations", permission: "integrations.view" },
  { href: "/dashboard/team", label: "Team", icon: "team", permission: "team.view" },
  { href: "/dashboard/billing", label: "Billing & Usage", icon: "billing", permission: "billing.view" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings", permission: "business.update" },
] as const satisfies readonly { href: string; label: string; icon: string; permission: Permission }[];

export type NavIcon = (typeof NAV_ITEMS)[number]["icon"];
export type NavItem = { href: string; label: string; icon: NavIcon };
