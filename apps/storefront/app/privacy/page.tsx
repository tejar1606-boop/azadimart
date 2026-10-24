import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { ContactBlock, type LegalSection } from "../components/legal-page";
import { LEGAL } from "../lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How LOIMART collects, uses, shares and protects your personal data, and the rights you have under India's Digital Personal Data Protection Act, 2023.",
  alternates: { canonical: "/privacy" },
};

const B = LEGAL.brand;

const sections: LegalSection[] = [
  { id: "scope", title: "Who we are and what this covers", body: <>
    <p>This Privacy Policy explains how <b>{LEGAL.companyName}</b> (&ldquo;{B}&rdquo;, &ldquo;we&rdquo;) handles your personal data when you use the {B} website, apps and services. We are the <b>Data Fiduciary</b> for this data under the Digital Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;). We also follow the Information Technology Act, 2000 and its rules.</p>
    <p>By using {B}, you agree to this Policy and our <Link href="/terms">Terms &amp; Conditions</Link>. Where the law needs your consent, we ask for it clearly, and you can withdraw it at any time.</p>
  </> },
  { id: "collect", title: "What we collect", body: <>
    <ul>
      <li><b>Account details:</b> your name, mobile number, email address and (if you use one) a password, stored only in scrambled (hashed) form.</li>
      <li><b>Delivery details:</b> addresses, contact name and phone number for delivery.</li>
      <li><b>Orders and payments:</b> what you buy, order amounts, coupons used, cancellations and returns, and payment status. Card, UPI and bank details are handled by our payment partners. We do not store your card number, CVV or UPI PIN.</li>
      <li><b>What you share with us:</b> reviews, ratings and photos, live chat and support messages, and photos or documents you attach to them.</li>
      <li><b>Your shopping choices:</b> wishlist and cart items, and settings such as notification choices.</li>
      <li><b>Technical data:</b> IP address, device and browser type, pages visited and error logs. We use these to keep the site working and secure, prevent fraud and limit abuse (for example, too many sign-in attempts).</li>
    </ul>
    <p>We do not knowingly collect data from children under 18 without a parent or guardian&apos;s consent.</p>
  </> },
  { id: "use", title: "How we use your data", body: <>
    <ul>
      <li>To create and secure your account, including sending one-time passwords (OTP) by SMS.</li>
      <li>To process, ship and deliver your orders, and to handle cancellations, returns and refunds.</li>
      <li>To send order updates by SMS, email or notifications, and to reply when you contact support.</li>
      <li>To show offers and coupons you can use, and, only if you agree, marketing messages, which you can switch off any time.</li>
      <li>To prevent fraud, misuse of offers, COD or returns, and to keep the Platform safe.</li>
      <li>To improve the Platform, for example by understanding which pages are slow or confusing.</li>
      <li>To meet legal duties, such as tax and invoicing, consumer law, and requests from authorities under law.</li>
    </ul>
  </> },
  { id: "share", title: "Who we share it with", body: <>
    <p>We never sell your personal data. We share only what each party needs:</p>
    <ul>
      <li><b>Sellers</b> of the products you order: your name, delivery address and phone number, so they can pack and ship your order. Sellers may use this data only to fulfil your order.</li>
      <li><b>Courier partners:</b> your name, address, phone number and the parcel details, to deliver (and, for COD, to collect payment).</li>
      <li><b>Payment partners</b> (such as Razorpay or Cashfree): payment details to process payments and refunds.</li>
      <li><b>Service providers</b> who run parts of {B} for us under contracts that protect your data: SMS delivery (such as MSG91), email (such as Resend), secure cloud hosting, databases and file storage, bot protection (Cloudflare Turnstile) and push notifications.</li>
      <li><b>Authorities,</b> when the law requires it, or to protect the rights and safety of users, Sellers or {B}.</li>
      <li>A buyer or successor, if {B}&apos;s business is merged or sold, under the same protections.</li>
    </ul>
  </> },
  { id: "cookies", title: "Cookies and similar technology", body: <>
    <p>We use a small number of cookies and browser storage items that the Platform needs to work:</p>
    <ul>
      <li>A <b>sign-in cookie</b> that keeps you logged in securely (for up to 30 days, or until you sign out).</li>
      <li>Small items remembered in your browser, for example that you&apos;ve already seen a festival greeting, or which sponsored banners you&apos;ve viewed in this visit.</li>
    </ul>
    <p>We do not use third-party advertising cookies. You can clear cookies in your browser at any time; you will then need to sign in again.</p>
  </> },
  { id: "security", title: "How we protect your data", body: <>
    <ul>
      <li>All traffic to {B} is encrypted (HTTPS). Passwords are stored only as secure hashes.</li>
      <li>Support attachments are private and open only through time-limited, signed links.</li>
      <li>Our team can see customer data only where their role needs it, and important actions are recorded in an audit log.</li>
      <li>Sellers see customers&apos; full delivery details only while an order still has to be shipped. After delivery or cancellation, only the city and PIN code remain visible to them.</li>
    </ul>
    <p>No system is completely secure. If a personal data breach affects you, we will tell you and the Data Protection Board of India as the law requires.</p>
  </> },
  { id: "retention", title: "How long we keep it", body: <>
    <p>We keep your data while your account is active and as long as needed for the purposes above. Order, invoice and payment records are kept for the period required by tax and other laws (generally up to 8 years). When data is no longer needed, we delete it or make it anonymous.</p>
  </> },
  { id: "rights", title: "Your rights", body: <>
    <p>Under the DPDP Act, you can:</p>
    <ul>
      <li><b>Access:</b> ask for a summary of the personal data we hold about you and how we use it.</li>
      <li><b>Correct and update:</b> fix wrong or incomplete data. You can update most details yourself in your account and addresses.</li>
      <li><b>Erase:</b> ask us to delete your account and personal data. We will do so unless we must keep some records by law (such as invoices).</li>
      <li><b>Withdraw consent:</b> for example, stop marketing messages. This doesn&apos;t affect what was done before.</li>
      <li><b>Grievance redressal:</b> complain to our Grievance Officer (below). If you&apos;re not satisfied, you may complain to the Data Protection Board of India.</li>
      <li><b>Nominate:</b> name a person to exercise these rights for you in case of death or incapacity.</li>
    </ul>
    <p>To use any of these rights, including <b>deleting your account</b>, contact us through live chat or write to the Grievance Officer from your registered email or phone number. We may confirm your identity first, and we&apos;ll respond within the time the law allows.</p>
  </> },
  { id: "changes", title: "Changes to this policy", body: <>
    <p>We may update this Policy when our services or the law change. The &ldquo;Last updated&rdquo; date shows the current version. If changes are significant, we will tell you on the Platform or by message before they apply.</p>
  </> },
  { id: "contact", title: "Contact us", body: <>
    <p>Questions or complaints about your personal data? Contact us:</p>
    <ContactBlock />
  </> },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro={<p>Your trust matters to us. This Policy explains, in plain words, what personal data {B} collects, why, who we share it with, how we protect it, and the choices and rights you have.</p>}
      sections={sections}
      other={{ href: "/terms", label: "Terms & Conditions" }}
    />
  );
}
