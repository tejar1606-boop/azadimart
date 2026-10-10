import ReviewsModeration from "./reviews-moderation";

export const metadata = { title: "Customer reviews" };

export default function ReviewsPage() {
  return <ReviewsModeration storefrontUrl={(process.env.AUTH_URL_STOREFRONT ?? "").replace(/\/$/, "")} />;
}
