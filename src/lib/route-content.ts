export type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
};

export const navItems: NavItem[] = [
  { href: "/", label: "Home", shortLabel: "HM" },
  { href: "/dashboard", label: "Dashboard", shortLabel: "DB" },
  { href: "/watchlist", label: "Watchlist", shortLabel: "WL" },
  { href: "/agents", label: "Agents", shortLabel: "AG" },
  { href: "/trade-ideas", label: "Trade Ideas", shortLabel: "TI" },
  { href: "/risk", label: "Risk", shortLabel: "RM" },
  { href: "/paper-trading", label: "Paper Trading", shortLabel: "PT" },
  { href: "/journal", label: "Journal", shortLabel: "JL" },
  { href: "/reports", label: "Reports", shortLabel: "RP" },
  { href: "/settings", label: "Settings", shortLabel: "ST" },
  { href: "/system-health", label: "System Health", shortLabel: "SH" },
  { href: "/cost-control", label: "Cost Control", shortLabel: "CC" },
];
