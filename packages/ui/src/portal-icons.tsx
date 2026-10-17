import type { SVGProps } from "react";

// Line icons (24px grid) for the seller centre and admin console.
type P = SVGProps<SVGSVGElement> & { size?: number };
const I = ({ size = 20, children, ...props }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
);

export const PortalIcons = {
  dashboard: (p: P) => <I {...p}><rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" /></I>,
  orders: (p: P) => <I {...p}><path d="M5 7h14l-1.2 12a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 7Z" /><path d="M9 7V5.8a3 3 0 0 1 6 0V7" /></I>,
  products: (p: P) => <I {...p}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></I>,
  sellers: (p: P) => <I {...p}><path d="M4 9.5 5.5 4h13L20 9.5a3 3 0 0 1-5.3 1.9 3 3 0 0 1-5.4 0A3 3 0 0 1 4 9.5Z" /><path d="M5 11.5V20h14v-8.5M9.5 20v-5h5v5" /></I>,
  customers: (p: P) => <I {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5A6.5 6.5 0 0 1 21.5 20" /></I>,
  qc: (p: P) => <I {...p}><path d="M12 3 5 6v5.5c0 4.4 3 8.2 7 9.5 4-1.3 7-5.1 7-9.5V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></I>,
  aplus: (p: P) => <I {...p}><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 14.5h3M8 17h6" /><path d="m14.5 7 .5-1.5.5 1.5" /></I>,
  logistics: (p: P) => <I {...p}><path d="M3 6h11v10H3zM14 9.5h4l3 3.5V16h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></I>,
  payments: (p: P) => <I {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h3" /></I>,
  finance: (p: P) => <I {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></I>,
  returns: (p: P) => <I {...p}><path d="M4 9h11a5 5 0 0 1 0 10H8" /><path d="M8 5 4 9l4 4" /></I>,
  support: (p: P) => <I {...p}><path d="M4 12a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-1v-6h3M4 12v4a2 2 0 0 0 2 2h1v-6H4" /></I>,
  marketing: (p: P) => <I {...p}><path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1Z" /><path d="M17 8.5a5 5 0 0 1 0 7" /></I>,
  coupons: (p: P) => <I {...p}><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0l-8.2-8.4Z" /><circle cx="8" cy="8" r="1.4" /></I>,
  security: (p: P) => <I {...p}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></I>,
  store: (p: P) => <I {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></I>,
  shipping: (p: P) => <I {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></I>,
  inventory: (p: P) => <I {...p}><path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" /><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" /></I>,
  payouts: (p: P) => <I {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9 8.5h6M9 11.5h6M12 11.5c0 2.5-1.5 4-3 4l4.5 3" /></I>,
  kyc: (p: P) => <I {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.5 16.5a3.6 3.6 0 0 1 7 0M14.5 9.5h3.5M14.5 13h3" /></I>,
  categories: (p: P) => <I {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><circle cx="17" cy="17" r="3.5" /></I>,
  arrange: (p: P) => <I {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /><path d="M14 7h6m-2.5-2.5L20 7l-2.5 2.5M10 17H4m2.5-2.5L4 17l2.5 2.5" /></I>,
  star: (p: P) => <I {...p}><path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9L12 3.5Z" /></I>,
  bell: (p: P) => <I {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20a2 2 0 0 0 4 0" /></I>,
  help: (p: P) => <I {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.7M12 16.8v.2" /></I>,
  menu: (p: P) => <I {...p}><path d="M4 7h16M4 12h16M4 17h16" /></I>,
  close: (p: P) => <I {...p}><path d="M6 6l12 12M18 6 6 18" /></I>,
  logout: (p: P) => <I {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></I>,
  external: (p: P) => <I {...p}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></I>,
  sparkle: (p: P) => <I {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></I>,
};

export type PortalIconName = keyof typeof PortalIcons;
