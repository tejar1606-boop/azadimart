import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const catalog = {
  storefront: [
    "/",
    "/products",
    "/cart",
    "/checkout",
    "/account",
    "/account/orders",
    "/login",
    "/register",
    "/wishlist",
    "/api/health",
    "/api/v1/catalog/products",
    "/api/v1/catalog/categories",
    "/api/v1/cart",
    "/api/v1/addresses",
    "/api/v1/checkout",
    "/api/v1/orders",
  ],
  seller: [
    "/",
    "/register",
    "/kyc",
    "/dashboard",
    "/products",
    "/products/new",
    "/inventory",
    "/orders",
    "/payouts",
    "/api/health",
    "/api/v1/products",
    "/api/v1/categories",
    "/api/v1/qc-submissions",
    "/api/v1/orders",
    "/api/v1/orders/:orderId/tracking",
    "/api/v1/shipments",
    "/api/v1/shipments/:shipmentId",
  ],
  admin: [
    "/",
    "/dashboard",
    "/orders",
    "/products",
    "/sellers",
    "/customers",
    "/qc",
    "/logistics",
    "/payments",
    "/finance",
    "/returns",
    "/support",
    "/marketing",
    "/security",
    "/online-store",
    "/api/health",
    "/api/v1/sellers",
    "/api/v1/qc",
    "/api/v1/themes",
    "/api/v1/orders",
  ],
};

function fileFor(app, route) {
  const appDir = join(root, "apps", app, "app");
  if (route.startsWith("/api/")) {
    return join(appDir, route.slice(1).replace(/:([A-Za-z0-9_-]+)/g, "[$1]"), "route.ts");
  }
  if (route === "/") {
    return join(appDir, "page.tsx");
  }
  return join(appDir, route.slice(1).replace(/:([A-Za-z0-9_-]+)/g, "[$1]"), "page.tsx");
}

const missing = [];
for (const [app, routes] of Object.entries(catalog)) {
  for (const route of routes) {
    const file = fileFor(app, route);
    if (!existsSync(file)) {
      missing.push(`${app} ${route} -> ${file}`);
    }
  }
}

if (missing.length) {
  console.error("Missing route files:\n" + missing.join("\n"));
  process.exit(1);
}

console.log(`Verified ${Object.values(catalog).flat().length} route files.`);
