# CARENDERIA-APP — Phase 0.1

## User Flow & Requirements Analysis

This document formalizes the requirements currently stated in `TINDAHAN MODULE.txt` and `update.md`. It intentionally separates confirmed requirements from interpretations, recommendations, and decisions that still need an answer. It does not define UI implementation, database tables, or backend code.

## 1. Product Summary

CARENDERIA-APP is a mobile-first web application for a Philippine carenderia. It supports two primary areas:

- A customer experience for browsing the current menu, placing online orders, viewing receipts, and messaging the owner.
- A simple owner/admin experience for managing the menu, messages, addresses, manual orders, daily orders, settings, and eventually receipts/printing.

The owner is expected to operate the admin experience from a cellphone and may not be highly technical. The product therefore prioritizes large readable controls, obvious actions, simple navigation, and clear feedback.

The future visual direction is a usable glassmorphism system over a colorful blue-based gradient. Visual implementation belongs to a later phase.

## 2. User Roles

### Guest customer

- Can enter the website without an account.
- Can browse and place an order without logging in.
- Provides name, exact address, and payment method during checkout.
- Receives a system-generated order code after completing an order.
- Can message the admin; guest messages last 24 hours.

### Logged-in customer

- May have the same customer ordering capabilities as a guest.
- Login is optional for customers.
- The requirements do not yet define the benefit of logging in, account recovery, persistent order history, or the lifetime of logged-in messages.

### Admin/owner

- Manages the carenderia operation from a cellphone.
- Uses dashboard actions for menu, photos, messages, addresses, manual orders, today's orders, and settings.
- The source material implies admin-only access, but authentication behavior is not yet defined.

## 3. Customer User Flows

### 3.1 First Visit

1. The customer opens the website.
2. The customer is presented with a choice:
   - Order immediately.
   - Scroll/browse the front page to learn about the carenderia.
3. Order immediately leads to the order experience.
4. Browsing allows the customer to view front-page information and then continue to ordering.
5. Login may be offered, but it must not block a guest from ordering.

OPEN DECISION: The exact front-page content, location of the login action, and whether the choice is a modal, section, or dedicated screen are unspecified.

### 3.2 Browse → Order

1. The customer browses the front page.
2. The customer chooses to order.
3. The customer enters the order page.
4. The current menu is shown by ULAM, DESSERTS, and EXTRAS.

### 3.3 BUY Flow

1. The customer views a food card.
2. The card displays food information and `BUY`.
3. The customer taps `BUY`.
4. The item is taken directly into the address/checkout flow.
5. The customer provides name, exact address, and payment method.
6. The customer reviews and completes the order.

OPEN DECISION: Whether `BUY` means one quantity of the item immediately, or opens a quantity/item-detail step, is unspecified.

### 3.4 Add to Cart Flow

1. The customer views a food card.
2. The customer taps `ADD TO CART`.
3. The item is added to the cart.
4. The customer may continue ordering.
5. The customer can open the cart from the order interface.

OPEN DECISION: Quantity controls, duplicate-item behavior, unavailable items, and cart persistence across refreshes are unspecified.

### 3.5 Cart → Checkout

1. The customer opens `CART`.
2. The cart displays selected items.
3. The customer can remove items.
4. The customer can continue ordering.
5. The customer taps the cart's `PROCEED` action.
6. The customer enters the address/checkout flow.
7. The customer provides name, exact address, and either CASH or ONLINE PAYMENT.

OPEN DECISION: Editing quantities, empty-cart behavior, price recalculation, delivery-fee display, and online-payment handling are unspecified.

### 3.6 Confirmation → Complete Order

1. The customer submits checkout details.
2. A confirmation page displays customer information, address, ordered items, and relevant order information.
3. The customer checks the details.
4. The customer taps `COMPLETE ORDER`.
5. The system creates the order and displays a receipt.

OPEN DECISION: What happens on a failed submission, whether completion can be retried safely, and whether the customer can edit from confirmation are unspecified.

### 3.7 Guest Order Identification

1. After completion, the receipt displays the customer name, ordered items, and a system-generated order code.
2. The guest saves the name and code.
3. The guest sends the name and code to the admin through messaging.
4. The admin uses them to identify the order.

OPEN DECISION: Whether the code must be unique forever or only within a time period, whether it is case-sensitive, and how a lost code is handled are unspecified.

### 3.8 Customer Messaging

1. The customer opens the message action from the customer experience.
2. The customer contacts the admin.
3. The customer can send text and photos.
4. The customer can react to messages.
5. If the customer is not logged in, the messages are deleted after 24 hours.

OPEN DECISIONS: Conversation identity, whether a guest conversation can be reopened, whether the 24-hour period starts at each message or conversation creation, attachment limits, supported reactions, and the admin's response/notification behavior are unspecified.

### 3.9 Customer Login

The requirements state that customer login is optional and that a login page may exist. They do not define the account benefit or authentication method.

OPEN DECISIONS: Determine whether customer accounts are in scope now, what logged-in customers gain, the sign-up/recovery flow, whether orders are linked to the account, and how logged-in message retention differs from guest retention. The existing note that there is "no authentication as for now" conflicts with a future login page and must be resolved before implementation.

## 4. Admin User Flows

### 4.1 Admin Login

1. The admin opens the admin entry point.
2. The admin authenticates.
3. Successful authentication leads to the admin dashboard.

OPEN DECISIONS: Authentication method, credentials, session lifetime, logout behavior, account recovery, and whether there is one owner or multiple admins are unspecified. The source document also says there is no authentication for now, so this must not be implemented by assumption.

### 4.2 Admin Dashboard

The dashboard exposes simple, obvious actions:

- `ULAM POST`
- `ULAM PHOTOS`
- `MESSAGE`
- `ADDRESS BOOK`
- `MANUAL ORDER`
- `TOTAL ORDERS FOR TODAY`
- `SETTINGS`

OPEN DECISION: Badge counts, dashboard summaries, ordering of actions, and navigation behavior are unspecified.

### 4.3 Create/Edit/Delete Menu Post

1. The owner opens `ULAM POST`.
2. The owner creates or edits the current menu post.
3. The post includes an image and categorized food content.
4. Categories are ULAM, DESSERTS, and EXTRAS.
5. Only one active menu post exists at a time.
6. The post lasts a maximum of 24 hours.
7. The owner can delete it.
8. Customers see this post/menu.

OPEN DECISION: It is unclear whether the post is an image containing the menu, an image plus structured menu items, or both. It is also unclear whether it is assembled from reusable ULAM PHOTOS, whether it can be scheduled, what happens at expiry, and whether editing resets the 24-hour lifetime.

### 4.4 Manage Ulam Photos

1. The owner opens `ULAM PHOTOS`.
2. The owner maintains reusable food/menu items.
3. Each item has name, price, and category.
4. Categories are ULAM, DESSERTS, and EXTRAS.

The name suggests reusable food records, but the requirements do not explicitly define whether these records are selected into a menu post, shown directly to customers, or used only as a reference list.

OPEN DECISION: Define the relationship between reusable items, item photos, active menu posts, availability, price changes, and deletion.

### 4.5 Messaging

1. The admin opens `MESSAGE`.
2. The admin receives customer text and photos.
3. The admin sends messages.
4. The admin can see and use message reactions.
5. Guest messages expire after 24 hours.

OPEN DECISIONS: How conversations are identified, how a guest is linked to an order, whether admin can retain or export expired content, how unread messages are shown, and whether messages are one conversation or many per customer are unspecified.

### 4.6 Address Book

1. The admin opens `ADDRESS BOOK`.
2. The admin searches addresses.
3. The admin adds an address containing name and exact address.
4. The admin edits an existing address.

OPEN DECISIONS: Duplicate names/addresses, deletion, address history, phone/contact details, search matching, permissions, and whether checkout can select an address-book record are unspecified.

### 4.7 Manual Order

1. The admin opens `MANUAL ORDER`.
2. The admin enters fixed information: name, full address, and delivery fee (DF).
3. The admin adds dynamic order items containing ULAM name and ULAM price.
4. The admin chooses CASH or ONLINE PAYMENT.
5. The admin taps `PROCEED`.
6. A manual-order-specific confirmation/receipt screen displays name, address, food, prices, and total payment.
7. The admin taps `PRINT`.
8. The order must also appear in today's orders.

OPEN DECISIONS: Item quantity, tax/discounts, total calculation, whether delivery fee is included in grand total, editing after proceeding, required fields, order code, and payment verification are unspecified.

### 4.8 Today's Orders

1. The admin opens `TOTAL ORDERS FOR TODAY`.
2. Online/customer orders and manual orders appear together.
3. The overview shows total sales, total delivery fees, and total orders.
4. A searchable tappable list shows customer name and grand total.
5. The list is ordered by creation time, not alphabetically.
6. Tapping an order opens a modal with complete order details.

OPEN DECISION: The definition of "today" and timezone, inclusion of expired/cancelled/unpaid orders, search fields, pagination, and whether totals are gross or net are unspecified.

### 4.9 Edit Order

1. The admin opens an order from the details modal.
2. The order details can be edited because customers may change their order.
3. The system must reflect the resulting order in the daily overview.

OPEN DECISIONS: Which fields are editable, whether edits are allowed after completion or printing, audit history, customer notification, payment differences, delivery-fee changes, cancellation, and how daily totals are recalculated are unspecified.

### 4.10 Settings

1. The admin opens `SETTINGS`.
2. The admin changes the carenderia name.
3. The admin changes the logo, with a default placeholder when none exists.
4. The admin changes the font-size preference.
5. The admin can log out.

OPEN DECISION: Logo file constraints, whether settings apply immediately, font-size range, persistence, and whether settings are global or per admin are unspecified.

### 4.11 Bluetooth Printing

1. The admin reaches a printable manual-order receipt.
2. The admin taps `PRINT`.
3. A future printing integration sends receipt data to a Bluetooth thermal printer.

This phase must not implement printing. Direct browser-to-Bluetooth support on a cellphone is not guaranteed.

OPEN DECISION: Printer model/protocol, browser/device support, pairing flow, companion application requirement, connection failures, retry behavior, and fallback printing must be defined during the integration phase.

## 5. Complete Screen Inventory

### Customer

- Front page / first-visit choice
- Customer login (optional and behavior unresolved)
- Order/menu page
- Cart
- Address/checkout
- Customer order confirmation
- Customer receipt/order-code result
- Customer message conversation

### Admin

- Admin login (required behavior unresolved)
- Admin dashboard
- Ulam Post create/edit/view
- Ulam Photos list
- Ulam Photos create/edit
- Admin message conversations
- Address Book list/search
- Address Book add/edit
- Manual Order entry
- Manual Order confirmation/receipt
- Today's Orders overview
- Order details modal
- Order edit state/modal
- Settings
- Logout/session result (may be an action rather than a separate screen)

### Shared

- Loading state
- Error/retry state
- Empty state for menu, cart, messages, addresses, and today's orders
- Confirmation dialog for destructive actions such as deleting a post
- Photo picker/upload state
- Generic order/receipt presentation, if the final UX shares it between customer and admin

The shared entries are states or overlays justified by the workflows; they are not additional product modules.

## 6. Core Entities

These are conceptual entities only; they are not proposed database tables yet.

- Customer: guest or logged-in person interacting with the customer experience.
- Admin/owner: person operating the admin experience.
- Customer account/session: optional customer identity and authentication context.
- Address: customer name and exact address managed in the address book or checkout.
- Menu item: reusable food definition with name, price, and category.
- Menu post: the single active customer-facing daily menu, including a required image and categorized content.
- Menu post item: the menu item's presence, price, and category within a specific post, if structured items are confirmed.
- Order: an online/customer or manual order.
- Order item: ordered food name, price, and any future quantity information.
- Payment selection/status: selected CASH or ONLINE PAYMENT and its eventual state.
- Delivery fee: fee associated with an order.
- Order code: generated identifier shown on a completed customer receipt.
- Message conversation: customer/admin communication context.
- Message: text or reaction within a conversation.
- Message attachment: customer or admin photo associated with a message.
- Address-book entry: saved customer address record.
- Branding/settings: carenderia name, logo, and font-size preference.
- Receipt: presentation of order/customer data for customer display or future printing.

## 7. Business Rules

Only rules explicitly supported by the requirements are listed here:

1. The application is mobile-first, while remaining accessible through the web.
2. Customer login is optional; customers can order as guests.
3. Menu categories are ULAM, DESSERTS, and EXTRAS.
4. A menu post must have an image.
5. There is only one active menu post at a time.
6. A menu post lasts a maximum of 24 hours.
7. The owner can delete the menu post.
8. Guest messages last 24 hours and are then deleted.
9. Customers can send text, photos, and reactions in messaging.
10. Checkout collects name, exact address, and CASH or ONLINE PAYMENT selection.
11. A completed customer order displays a system-generated order code.
12. Manual orders include name, full address, delivery fee, dynamic food items/prices, and payment selection.
13. Manual orders are included in today's orders.
14. Today's orders show total sales, total delivery fees, and total orders.
15. Today's order list is searchable, tappable, and ordered by creation time rather than alphabetically.
16. Today's order details are editable.
17. Branding includes carenderia name, logo, and font-size preference.
18. A default logo placeholder is shown when no custom logo is configured.
19. The admin can log out.

## 8. Ambiguities / Open Decisions

The following decisions should be resolved before UI, schema, or backend implementation:

1. **Menu post model:** Is it an image, structured items plus an image, or both? This determines customer rendering, searchability, pricing, and editing.
2. **Menu post and Ulam Photos relationship:** Are reusable items selected into a post, copied into it, or unrelated? This determines whether later item changes affect a published menu.
3. **Menu expiry:** What does the customer see after 24 hours, and does editing/re-publishing restart the lifetime?
4. **Food images:** Does every menu item require its own image, or only the menu post? Where are images selected and stored?
5. **Availability:** Can an item be sold out or hidden without deleting it?
6. **Ordering quantities:** Are quantities supported, and how are duplicate items represented in the cart and receipt?
7. **Pricing:** Are prices stored on reusable items, menu posts, orders, or more than one? Which price is locked into an order?
8. **Delivery fee:** Who sets it for online orders, and how does it appear in customer totals and daily sales?
9. **Online payment:** Is this only a selection label or a real payment flow? What provider, confirmation, and failure behavior apply?
10. **Customer accounts:** What value does login provide, and is authentication in or out of scope for the first implementation?
11. **Admin authentication:** What login method protects owner data, and are multiple admins supported?
12. **Order lifecycle:** What statuses exist, and when is an order considered created, confirmed, completed, cancelled, paid, or delivered?
13. **Order code:** What uniqueness, format, expiry, and recovery rules apply?
14. **Order editing:** Which fields can be edited, when, by whom, and how are totals, payment, receipts, and audit history updated?
15. **Cancellations/refunds:** Can either party cancel, and how are cancelled orders represented in daily totals?
16. **Today's boundary:** Which timezone and business-day boundary define "today"?
17. **Accounting totals:** Do total sales include delivery fees, cancelled orders, unpaid online selections, discounts, or refunds?
18. **Messaging identity:** How are guests and logged-in customers distinguished, and how is an order code associated with a conversation?
19. **Message expiration:** Does the 24-hour timer apply per message or per guest conversation? What happens to attachments and reactions?
20. **Message history:** Can the admin retain a guest conversation after the customer-side 24-hour expiry, or is all content deleted everywhere?
21. **Address book:** Are phone numbers, labels, or duplicate handling needed beyond name and exact address?
22. **Receipt printing:** Which printer and device/browser path will be supported, and what fallback exists when Bluetooth is unavailable?
23. **Branding:** What image formats/sizes and font-size options are allowed, and who can change global branding?
24. **Offline/network behavior:** Can the admin draft a manual order or menu while offline, and how are failed submissions/retries handled?

## 9. Risks and Technical Constraints

- **Mobile admin usability:** Dense daily-order details, editable modals, manual order entry, and settings must remain readable and tappable on a phone.
- **Authentication ambiguity:** Guest ordering and optional customer login must be separated from secure admin access before implementation.
- **Guest identity:** A name and order code are useful for lookup but may be insufficient to prevent mistaken identity or impersonation.
- **Guest message deletion:** Expiration must cover text, photos, reactions, indexes, and any cached/client-visible copies as appropriate.
- **Image handling:** Menu and message photos require upload limits, validation, storage, loading, and failure states.
- **Mutable orders and accounting:** Editing an order after creation can change totals and printed receipts; an audit/history approach may be required.
- **Payment uncertainty:** Online payment selection without a defined payment provider creates reconciliation and status risks.
- **Daily accounting:** Timezone, status inclusion, delivery-fee treatment, and cancellation rules directly affect reported totals.
- **Bluetooth printing:** Browser-to-Bluetooth printing may not work consistently across mobile browsers and printer models; it may require a companion app or alternative integration.
- **Network reliability:** The owner may submit orders or menu changes over unreliable mobile connections, so duplicate prevention and clear retry feedback matter.
- **Visual readability:** Blur, translucency, gradients, and low-contrast effects must not reduce readability or action discoverability.
- **Scope growth:** Menu, orders, messaging, uploads, authentication, and printing have separate lifecycle and security concerns; implementing them as one undifferentiated module would make the system harder to maintain.

## 10. Recommended Next Phase

Proceed to a decision workshop before implementation. Resolve the open decisions that affect the domain model first, especially:

1. Menu post versus reusable menu-item behavior.
2. Customer/admin authentication scope.
3. Order statuses, editing, cancellation, and daily-total rules.
4. Delivery-fee and online-payment behavior.
5. Guest messaging identity and expiration semantics.
6. Printer model and integration path.

After those decisions, produce Phase 0.2 information architecture and navigation flows, including screen states and error/empty/loading behavior. Only then should the project move to design-system work, database modeling, and feature implementation.

## Implementation Architecture Constraints for Later Phases

These constraints are recorded for future implementation and are not implemented here:

- Shared code must not import from `features`.
- Features may import shared code but must not import from other features.
- Feature-specific shared code belongs in that feature's `_shared` folder.
- Pages should compose focused components and contain minimal business logic.
- Use local state for simple localized interactions.
- Use React Hook Form for forms.
- Use TanStack Query for server/data fetching and caching.
- Avoid unnecessary global state and abstraction layers.
- The eventual glassmorphism design must support, not compete with, the owner's operational needs.
