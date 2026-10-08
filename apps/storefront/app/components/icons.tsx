import type { SVGProps } from "react";

// Line icons (24px grid, 1.75 stroke) used across the storefront.
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 22, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
export const UserIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>;
export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => <Icon {...p} fill={filled ? "currentColor" : "none"}><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.1 4.5c2 0 3.5 1.1 4.9 2.9 1.4-1.8 2.9-2.9 4.9-2.9 3.5 0 5.6 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z" /></Icon>;
export const BagIcon = (p: IconProps) => <Icon {...p}><path d="M5 8h14l-1 12.5a1 1 0 0 1-1 .9H7a1 1 0 0 1-1-.9L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></Icon>;
export const MenuIcon = (p: IconProps) => <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>;
export const CloseIcon = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const HomeIcon = (p: IconProps) => <Icon {...p}><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z" /></Icon>;
export const GridIcon = (p: IconProps) => <Icon {...p}><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></Icon>;
export const ArrowRightIcon = (p: IconProps) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const CheckIcon = (p: IconProps) => <Icon {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
export const ShieldIcon = (p: IconProps) => <Icon {...p}><path d="M12 3 5 6v5.5c0 4.4 3 8.2 7 9.5 4-1.3 7-5.1 7-9.5V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></Icon>;
export const TruckIcon = (p: IconProps) => <Icon {...p}><path d="M3 6h11v10H3zM14 9.5h4l3 3.5V16h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></Icon>;
export const ReturnIcon = (p: IconProps) => <Icon {...p}><path d="M4 9h11a5 5 0 0 1 0 10H8" /><path d="M8 5 4 9l4 4" /></Icon>;
export const BadgeIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="9" r="5.5" /><path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7" /></Icon>;
export const CashIcon = (p: IconProps) => <Icon {...p}><rect x="3" y="6.5" width="18" height="11" rx="1.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v5M17.5 9.5v5" /></Icon>;
export const TagIcon = (p: IconProps) => <Icon {...p}><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0l-8.2-8.4Z" /><circle cx="8" cy="8" r="1.4" /></Icon>;
