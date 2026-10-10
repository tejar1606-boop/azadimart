import ProductEditor from "./product-editor";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const storefrontUrl = (process.env.AUTH_URL_STOREFRONT ?? "").replace(/\/$/, "");
  return <ProductEditor productId={productId} storefrontUrl={storefrontUrl} />;
}
