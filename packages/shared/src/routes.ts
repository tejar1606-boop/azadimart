export const APPS = {
  storefront: {
    name: "storefront",
    host: "azadimart.com",
    localPort: 3000,
    audience: "storefront" as const,
  },
  seller: {
    name: "seller",
    host: "seller.azadimart.com",
    localPort: 3001,
    audience: "seller" as const,
  },
  admin: {
    name: "admin",
    host: "admin.azadimart.com",
    localPort: 3002,
    audience: "admin" as const,
  },
} as const;

export const STOREFRONT_ROUTES = [
  "/",
  "/products",
  "/cart",
  "/checkout",
  "/account/orders",
  "/account",
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
] as const;

export const SELLER_ROUTES = [
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
] as const;

export const ADMIN_ROUTES = [
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
] as const;

export const PRODUCT_MEDIA_LIMITS = {
  maxImages: 8,
  maxVideos: 1,
} as const;
