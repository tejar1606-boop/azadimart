"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** "Sign in" for guests, "My account" once signed in (checked the same way as the header). */
export default function FooterAccountLink({ className }: { className: string }) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then((r) => setSignedIn(r.ok)).catch(() => setSignedIn(false));
  }, [pathname]);
  if (signedIn === null) return <span className={className} aria-hidden="true">&nbsp;</span>; // avoids flashing "Sign in" to signed-in shoppers
  return signedIn ? <Link href="/account" className={className}>My account</Link> : <Link href="/login" className={className}>Sign in</Link>;
}
