# AzadiMart — Testing Strategy

## 1. Testing Principles

AzadiMart must be tested at every layer.

No feature is considered complete until:

- It works on desktop

- It works on mobile

- API validation passes

- Authorization passes

- Database operations pass

- Error states are handled

- Loading states are handled

- Empty states are handled

- Security boundaries are tested

- Automated tests pass

---

# 2. Customer Testing

Test:

- Registration

- Login

- Logout

- Profile

- Address creation

- Address editing

- Product browsing

- Category navigation

- Search

- Filters

- Product details

- Product image gallery

- Product video

- Product A+ content

- Product variants

- Wishlist

- Cart

- Quantity changes

- Pincode validation

- Checkout

- COD

- Online payment

- Order creation

- Order history

- Order tracking

- Cancellation

- Returns

- Refund status

- Customer support

Verify customers cannot access another customer's information.

---

# 3. Seller Testing

Test:

- Seller registration

- Seller login

- KYC submission

- Document upload

- Verification status

- Seller dashboard

- Product creation

- Product editing

- Product drafts

- Product variants

- Inventory

- Pricing

- MRP

- Selling price

- Product images

- Product video

- A+ content

- Product submission for QC

- QC rejection

- QC changes requested

- Product approval

- Product publication

- Order receipt

- Order acceptance

- Packing

- Ready-to-ship

- Shipment tracking

- Returns

- Payouts

- Seller support

Verify that Seller A cannot access Seller B's products, orders, inventory, payouts or documents.

---

# 4. Admin Testing

Test:

- Admin login

- Role permissions

- Dashboard

- Seller verification

- Seller approval

- Seller rejection

- Seller suspension

- Product management

- QC queue

- Product approval

- Product rejection

- Order management

- Logistics

- Returns

- Refunds

- Payouts

- Customer management

- Support

- Marketing

- Banner management

- Media management

- Theme editor

- Draft saving

- Preview

- Publish

- Revision history

- Rollback

- Audit logs

Verify restricted administrator roles cannot perform actions outside their permissions.

---

# 5. API Testing

Every API must be tested for:

- Valid request

- Invalid request

- Missing fields

- Invalid UUID

- Invalid data type

- Unauthorized request

- Forbidden request

- Resource ownership

- Duplicate request

- Rate limiting

- Unexpected input

- Server errors

Test:

```text

200

201

204

400

401

403

404

409

422

429

500