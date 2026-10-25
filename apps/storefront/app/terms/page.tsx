import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { ContactBlock, type LegalSection } from "../components/legal-page";
import { LEGAL } from "../lib/legal";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The terms for using LOIMART and buying from sellers on LOIMART: orders, Cash on Delivery, cancellations, returns, refunds and your responsibilities.",
  alternates: { canonical: "/terms" },
};

const B = LEGAL.brand;
const days = LEGAL.returnWindowDays;

const sections: LegalSection[] = [
  { id: "about", title: "About these terms", body: <>
    <p>These Terms &amp; Conditions (&ldquo;Terms&rdquo;) apply to your use of the {B} website, apps and services (the &ldquo;Platform&rdquo;), operated by <b>{LEGAL.companyName}</b> (&ldquo;{B}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By browsing, creating an account or placing an order, you agree to these Terms and to our <Link href="/privacy">Privacy Policy</Link>. If you do not agree, please do not use the Platform.</p>
    <p>These Terms are an electronic record under the Information Technology Act, 2000 and the rules made under it, and are published in line with the Consumer Protection Act, 2019 and the Consumer Protection (E-Commerce) Rules, 2020. They do not need a physical or digital signature.</p>
  </> },
  { id: "marketplace", title: "LOIMART is a marketplace", body: <>
    <p>{B} is an online <b>marketplace</b>. Products on the Platform are listed and sold by independent sellers (&ldquo;Sellers&rdquo;). The contract of sale for a product is between you and the Seller named on the product page (&ldquo;Sold by&rdquo;). {B} provides the Platform, verifies Sellers, checks listings, and helps with payments, delivery and customer support.</p>
    <p>Every Seller completes identity, business and bank verification (KYC) before selling, and listings are reviewed by our quality team before they go live. Sellers remain responsible for their products, including that they are genuine, safe, lawful, correctly described and fit for sale, and for the warranty, guarantee and legal obligations that come with them.</p>
  </> },
  { id: "account", title: "Your account", body: <>
    <ul>
      <li>You must be at least 18 years old to create an account and place orders. If you are under 18, a parent or guardian must use the Platform for you.</li>
      <li>You sign in with your mobile number (one-time password) or email and password. Keep your phone and login details safe; you are responsible for activity on your account.</li>
      <li>Give accurate details, especially your name, phone number and delivery address, so your orders reach you.</li>
      <li>Tell us straight away through support if you think someone else has used your account.</li>
      <li>We may suspend or close accounts that break these Terms, misuse offers or returns, or are used for fraud.</li>
    </ul>
  </> },
  { id: "products", title: "Products, prices and offers", body: <>
    <ul>
      <li>Product details, photos, prices, sizes and colours are provided by Sellers. We work to keep them accurate, but small differences in colour or appearance can happen because of screens and lighting.</li>
      <li>Prices are in Indian Rupees and include applicable taxes unless stated otherwise. The <b>MRP</b> and the discount shown are provided by the Seller. The final amount you pay is shown at checkout before you confirm.</li>
      <li>A small <b>platform fee</b> is added once to every order, however many items it has, and is shown in your cart and at checkout before you confirm. It helps {B} run the platform (operations, customer support, secure payments and keeping the website and app working). If the whole order is cancelled before it ships, you don&apos;t pay it (or it is refunded). It is not refunded when items are returned after delivery.</li>
      <li><b>Cashback</b>: when an order shows cashback at checkout, that amount is added to your {B} wallet after delivery, once the return window has closed and nothing in the order was returned or replaced. It is not given on cancelled orders. Wallet money follows the wallet rules (it can expire, can be used up to a set amount per order, and cannot be withdrawn as cash).</li>
      <li>Coupons and offers have their own conditions (minimum order, validity, eligible products, one use per customer and so on), shown with the offer. Offers can be changed or withdrawn, and cannot be exchanged for cash.</li>
      <li>If a product is listed at an obviously wrong price because of a technical or typing error, the Seller or {B} may cancel the order. If you have paid, you will get a full refund.</li>
    </ul>
  </> },
  { id: "orders", title: "Placing an order", body: <>
    <p>When you place an order, you make an offer to buy the products from the Seller. We confirm your order by showing it in <b>My orders</b> and may send you an SMS, email or notification. A Seller can decline or cancel an order (for example, if the item is out of stock, damaged, or cannot be delivered to your address). If that happens, you are told and anything you paid is refunded in full.</p>
    <p>One order can include products from several Sellers. Each Seller ships their part separately, so you may receive more than one parcel.</p>
  </> },
  { id: "payment", title: "Payment and Cash on Delivery", body: <>
    <ul>
      <li><b>Cash on Delivery (COD):</b> pay in cash or UPI to the delivery partner when your order arrives. Please keep the exact amount ready. Repeatedly refusing COD orders without a valid reason may lead to COD being turned off for your account.</li>
      <li><b>Online payments</b>, when offered, are processed by licensed payment partners (such as Razorpay). We do not store your card or UPI PIN details.</li>
      <li>You agree to pay the full order amount, including any delivery charge shown at checkout.</li>
    </ul>
  </> },
  { id: "delivery", title: "Shipping and delivery", body: <>
    <ul>
      <li>Orders are shipped by the Seller, either through {B}&apos;s courier partners or the Seller&apos;s own courier. The courier and tracking number appear on your order once it is shipped.</li>
      <li>Delivery dates shown are estimates. Delays can happen because of weather, holidays, local restrictions or the courier.</li>
      <li>If the parcel looks damaged or tampered with when it arrives, please refuse it or record it on delivery and tell us within 48 hours.</li>
      <li>If delivery fails after attempts or the parcel is refused, it is returned to the Seller and any online payment is refunded.</li>
    </ul>
  </> },
  { id: "cancellation", title: "Cancelling an order", body: <>
    <ul>
      <li>You can cancel an order yourself from <b>My orders</b> while it is <b>Confirmed</b>, before the Seller ships it. There is no cancellation charge.</li>
      <li>Once the order is shipped, it can no longer be cancelled. You can refuse it at delivery, or return it after delivery if it is eligible.</li>
      <li>Sellers or {B} may cancel an order for reasons such as stock not being available, an address that cannot be served, a pricing error or suspected fraud. You will be told the reason.</li>
    </ul>
  </> },
  { id: "returns", title: "Returns, replacements and refunds", body: <>
    <ul>
      <li>Eligible products can be returned within <b>{days} days of delivery</b>. Start a return from <b>My orders</b> and tell us the reason (for example: damaged, defective, wrong item, or different from the description).</li>
      <li>Items must be unused, in their original condition and packaging, with tags, labels, accessories and freebies.</li>
      <li>Some products cannot be returned unless they arrive damaged, defective or wrong, for hygiene, safety or nature reasons. These include innerwear, cosmetics and personal care items once opened, perishable food and groceries, and customised or made-to-order products. The product page says if an item is not returnable.</li>
      <li>After the returned item is picked up and checked, your refund is processed. Online payments go back to the original payment method, usually within 5–7 working days. For COD orders, we refund to your bank account or UPI ID, which we will ask you for.</li>
      <li>If an order paid online is cancelled, the full amount is refunded to the original payment method, usually within 5–7 working days.</li>
    </ul>
  </> },
  { id: "reviews", title: "Reviews, photos and messages you share", body: <>
    <p>You may post ratings, reviews and photos, and send messages or files to our support team. Content must be honest and about your own experience, and must not be abusive, misleading, unlawful, or infringe anyone&apos;s rights. By posting, you allow {B} to display, use and adapt that content on the Platform and in {B} marketing, shown with the name on your review. We may remove content that breaks these rules.</p>
  </> },
  { id: "conduct", title: "Things you must not do", body: <>
    <ul>
      <li>Use the Platform for anything unlawful, fraudulent or harmful, or to buy products for illegal resale.</li>
      <li>Misuse coupons, offers, referrals, COD or returns, for example by creating multiple accounts or returning used or different items.</li>
      <li>Copy, scrape or harvest content or data, or try to get around security, captcha or limits.</li>
      <li>Upload viruses or harmful code, or interfere with the Platform&apos;s working.</li>
      <li>Impersonate anyone, or harass Sellers, delivery partners or our team.</li>
    </ul>
  </> },
  { id: "ip", title: "Intellectual property", body: <>
    <p>The {B} name, logo, design, software and content created by {B} belong to {B} or its licensors and are protected by law. Sellers own or have rights to their product content. You may use the Platform for your personal shopping only. Please don&apos;t reuse our content without written permission. If you believe something on the Platform infringes your rights, write to the Grievance Officer below with details.</p>
  </> },
  { id: "liability", title: "Responsibility and limits", body: <>
    <ul>
      <li>We work to keep the Platform available, safe and accurate, but it is provided &ldquo;as is&rdquo; and may sometimes be unavailable for maintenance or reasons outside our control.</li>
      <li>Sellers are responsible for the products they sell, including product quality, safety, warranty and after-sales service. Our role is to provide the marketplace and to help resolve problems fairly.</li>
      <li>To the extent the law allows, {B}&apos;s total liability for any claim about an order is limited to the amount you paid for that order. We are not liable for indirect or consequential losses. Nothing in these Terms limits your rights as a consumer under Indian law.</li>
    </ul>
  </> },
  { id: "changes", title: "Changes to these terms", body: <>
    <p>We may update these Terms from time to time, for example when we add features or when the law changes. The &ldquo;Last updated&rdquo; date at the top shows the latest version. Important changes will be highlighted on the Platform. Orders already placed are governed by the Terms that applied when you placed them.</p>
  </> },
  { id: "law", title: "Governing law and disputes", body: <>
    <p>These Terms are governed by the laws of India. We encourage you to contact us first; most issues are solved quickly through support. If a dispute cannot be resolved, it will be subject to the jurisdiction of the courts at {LEGAL.jurisdiction}. This does not affect your right to approach a Consumer Commission under the Consumer Protection Act, 2019.</p>
  </> },
  { id: "contact", title: "Contact and grievances", body: <>
    <p>For help with an order, use live chat (tap <b>Help</b>) or <Link href="/account">My orders</Link>. For complaints, including about a Seller, a product or these Terms, contact our Grievance Officer:</p>
    <ContactBlock />
  </> },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms & Conditions"
      intro={<p>Welcome to {B}. These Terms explain how ordering on {B} works and what we and you can expect from each other. We&apos;ve tried to keep them clear. Please read them, along with our <Link href="/privacy" className="font-semibold text-[#6A2CD6] underline underline-offset-2">Privacy Policy</Link>.</p>}
      sections={sections}
      other={{ href: "/privacy", label: "Privacy Policy" }}
    />
  );
}
