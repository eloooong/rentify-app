export type NavItem = { href: string; label: string };

// Routes that are not built yet will 404 until their phase lands.
export const primaryLinks: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/listings", label: "All items" },
];

// Shown when signed out / signed in. Both routes are Person B's auth pages (B1.1).
export const signInLink: NavItem = { href: "/login", label: "Sign in" };
export const accountLink: NavItem = { href: "/account", label: "Account" };
export const myListingsLink: NavItem = {
  href: "/owner/listings",
  label: "My listings",
};

export const lendLink: NavItem = { href: "/owner/listings/new", label: "Lend" };

// Terms, Privacy and Prohibited items pages are built in A3.4 under app/help.
export const footerLinks: NavItem[] = [
  { href: "/help", label: "Help" },
  { href: "/help/terms", label: "Terms" },
  { href: "/help/privacy", label: "Privacy" },
  { href: "/help/prohibited-items", label: "Prohibited items" },
];
