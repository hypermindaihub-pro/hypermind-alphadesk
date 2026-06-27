export type NavItem = {
  href: string;
  icon:
    | "activity"
    | "agents"
    | "dashboard"
    | "health"
    | "ideas"
    | "journal"
    | "reports"
    | "risk"
    | "settings"
    | "trade"
    | "watchlist";
  label: string;
  shortLabel: string;
};

export const navItems: NavItem[] = [
  { href: "/", icon: "activity", label: "Overview", shortLabel: "OV" },
  { href: "/dashboard", icon: "dashboard", label: "Dashboard", shortLabel: "DB" },
  { href: "/watchlist", icon: "watchlist", label: "Market Scanner", shortLabel: "MS" },
  { href: "/agents", icon: "agents", label: "AI Agents", shortLabel: "AI" },
  { href: "/trade-ideas", icon: "ideas", label: "Trade Ideas", shortLabel: "TI" },
  { href: "/risk", icon: "risk", label: "Risk", shortLabel: "RK" },
  { href: "/paper-trading", icon: "trade", label: "Execution", shortLabel: "EX" },
  { href: "/journal", icon: "journal", label: "Journal", shortLabel: "JR" },
  { href: "/reports", icon: "reports", label: "Reports", shortLabel: "RP" },
  { href: "/settings", icon: "settings", label: "Settings", shortLabel: "ST" },
  { href: "/system-health", icon: "health", label: "System Health", shortLabel: "HL" },
  { href: "/cost-control", icon: "activity", label: "Cost Control", shortLabel: "CC" },
];
