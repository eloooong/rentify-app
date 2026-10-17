export type NavItem = { href: string; label: string };

// Routes that are not built yet will 404 until their phase lands.
export const primaryLinks: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/listings", label: "All items" },
];

// Account menu needs auth (Phase 1). Until then the shell links to sign in.
export const signInLink: NavItem = { href: "/login", label: "Sign in" };

export const lendLink: NavItem = { href: "/owner/listings/new", label: "Lend" };

// Terms, Privacy and Prohibited items pages are built in A3.4 under app/help.
export const footerLinks: NavItem[] = [
  { href: "/help", label: "Help" },
  { href: "/help/terms", label: "Terms" },
  { href: "/help/privacy", label: "Privacy" },
  { href: "/help/prohibited-items", label: "Prohibited items" },
];
