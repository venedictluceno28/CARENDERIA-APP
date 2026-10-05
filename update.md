CARENDERIA-APP — Phase 2.9.1
Realtime Messaging, Messenger-Style UX, Contrast Audit & Admin Dashboard State Cleanup
Continue working on the existing CARENDERIA-APP project.
Phase 2.9 Admin Messages is implemented and locally validated.
Do NOT begin Phase 2.10 Settings yet.
This task is a focused usability/polish pass based on real user testing.

USER-REPORTED ISSUES
The following issues were observed during actual use:
New message replies do not appear immediately.
The browser sometimes needs to be refreshed/restarted before the reply appears.
Customer and admin messaging should feel more familiar, similar to common Facebook Messenger-style conversation UX.
Some cards/bubbles have poor contrast:
light backgrounds combined with white/light text make content very difficult to read.
The admin dashboard still visually treats some already-implemented modules as inactive/unfinished.
Specifically:
MANUAL ORDER
ADDRESS BOOK
MESSAGE
These are implemented and should visually match the other active modules.

OVERALL GOAL
Improve everyday usability without changing core business rules.
Implement:
Realtime message updates
Familiar modern chat UX
Application-wide contrast/readability fixes where needed
Correct admin dashboard active/inactive module states
Do not redesign backend order logic.
Do not weaken security.
Do not begin Settings.

PART 1 — REALTIME MESSAGING
Messaging should update without requiring a browser refresh.
Both directions matter:
Customer sends → admin sees it quickly
Admin replies → customer sees it quickly

REALTIME STRATEGY
Use Supabase Realtime where appropriate.
Do NOT replace the existing secure REST/Edge/RPC/query flows.
The existing backend/API remains the source of truth.
Preferred architecture:
Realtime event
→ relevant TanStack Query invalidation/refetch
→ authoritative API response
→ UI update
Do NOT build a second message-state system directly from raw realtime payloads unless there is a compelling reason.

WHY INVALIDATION/REFETCH IS PREFERRED
Existing APIs already enforce:
guest-token authorization
active-admin authorization
cross-order isolation
private attachment access
retention rules
pagination
payment state
Therefore realtime should primarily signal:
"Something changed."
Then refetch through the existing secure query/API layer.

REALTIME MESSAGE EVENTS
Subscribe to relevant message changes.
At minimum:
new message inserted
reaction changes if needed
payment verification change if useful
For a conversation currently open:
A new message should appear automatically within a reasonable realtime delay.
No page refresh should be required.

ADMIN INBOX REALTIME
Admin conversation list should also refresh when:
a customer sends a new message
an admin reply changes latest-message context
If a new customer message arrives:
conversation should update
latest-message preview/time should update
ordering should reflect latest activity
Do not invent unread counts unless backend already supports them.

CUSTOMER CHAT REALTIME
Customer chat should automatically refresh when:
admin sends a reply
payment verification status changes
Customer should not need to reload the browser to see the response.

SUBSCRIPTION SCOPE
Keep subscriptions narrowly scoped.
Admin inbox:
subscribe only to tables/events needed to know messaging activity changed.
Open admin conversation:
subscribe to that conversation/order where practical.
Customer:
subscribe only to their own relevant order/message activity if safely possible.
Do not create broad uncontrolled subscriptions to all sensitive tables in client code.

AUTHORIZATION & REALTIME
Do NOT assume realtime subscription itself is authorization.
Existing backend/API authorization remains authoritative.
If realtime payload exposure would reveal sensitive cross-order data, do not subscribe directly to unsafe payloads.
Prefer event notification + secure refetch.
Inspect current RLS/Reatime behavior carefully.

FALLBACK
Realtime should improve UX, not become the only update mechanism.
Keep:
refetch on window focus
manual refresh if currently present
reasonable background polling only if still useful
But reduce unnecessary polling if realtime makes it redundant.
Do not poll every second.

CONNECTION RECOVERY
Handle:
temporary Wi-Fi loss
mobile browser background/resume
realtime disconnect/reconnect
After reconnect or window focus:
invalidate/refetch current message data.
Do not assume every realtime event was received.

TEST REALTIME
Validate:
Open customer chat in one browser/tab.
Open admin conversation in another.
Customer sends message.
Admin sees it without refresh.
Admin replies.
Customer sees reply without refresh.
Admin verifies payment.
Customer sees verification change without refresh.
Temporarily disconnect/reconnect network if practical.
Confirm refetch restores consistent state.

PART 2 — FAMILIAR MESSENGER-STYLE CHAT UX
The goal is NOT to copy Facebook branding or reproduce Messenger pixel-for-pixel.
The goal is to use familiar interaction patterns that users already understand.

CHAT LAYOUT
Use a familiar mobile messaging layout:
Top:
conversation header
Middle:
scrollable message thread
Bottom:
composer
attachment button where appropriate
SEND button
Keep composer visually attached to the bottom chat area.

MESSAGE BUBBLES
Use clear left/right alignment.
Suggested pattern:
Customer-facing chat:
customer's own messages aligned right
admin/store messages aligned left
Admin chat:
admin's own messages aligned right
customer messages aligned left
Use consistent message bubble semantics.

BUBBLE VISUAL STYLE
Do NOT make message bubbles heavily glassmorphic.
Message readability is more important.
Preferred:
Own message:
solid/darker or strongly tinted bubble
high-contrast light text
Other sender:
light/neutral bubble
dark text
Avoid:
light translucent bubble
+
white text
This is currently causing readability problems.

MESSAGE CONTENT
Inside bubble show:
message body
attachment if applicable
small timestamp
reactions if relevant
Sender distinction should also be available semantically/textually where useful.
Do not rely only on color.

LONG MESSAGES
Handle:
long words
URLs
multiple lines
long Filipino/English mixed messages
No horizontal overflow.
Use safe wrapping.

IMAGE MESSAGES
Image attachments should visually behave like chat attachments:
thumbnail/card
tap to enlarge
maintain aspect ratio
clear PAYMENT RECEIPT label where applicable
Do not bury payment evidence inside generic chat cards.

CHAT HEADER
Keep the header compact.
Admin conversation may show:
Customer name
Order code
payment status
guest-chat expiry indicator
Customer conversation may show:
Store/admin label
order code
relevant payment state
Do not overload the header.

COMPOSER
Use a familiar mobile composer:
multiline text input
attachment button
send button
Keep touch targets large.
Composer must remain reachable above the mobile keyboard.
Do not use brittle fixed heights.

AUTO-SCROLL
Initial conversation:
scroll near latest message.
After sending:
show the newly sent message.
When receiving new message:
auto-scroll only if user is already near bottom.
If user is reading older history:
do not forcibly jump them to bottom.
If practical show:
New message
or a small jump-to-bottom affordance.
Keep implementation simple.

PART 3 — CONTRAST / READABILITY AUDIT
Perform a targeted contrast audit across the implemented application.
The user specifically reported white/light text rendered on light cards.
Fix actual problematic cases.

CONTRAST RULE
Establish a simple rule:
Dark/glass surface
→ light text
Light surface
→ dark text
Do not rely on parent/global text color when component surface changes.
Every reusable card/bubble/status surface should explicitly inherit/use an appropriate semantic foreground token.

MESSAGES PRIORITY
Audit first:
customer message bubbles
admin message bubbles
reply composer
payment receipt cards
verification cards
conversation list cards
empty/error states
image viewer labels
This is the highest-priority known issue.

APP-WIDE AUDIT
Also inspect current implemented admin/customer screens for obvious low contrast:
Admin dashboard
Today’s Orders
ULAM PHOTOS
ULAM POST
Manual Order
Address Book
Customer menu/cart
Checkout
Receipt
Do NOT redesign all screens.
Fix only actual readability problems discovered.

DESIGN TOKENS
Prefer solving repeated contrast bugs through semantic design tokens/classes rather than isolated hard-coded fixes.
Possible conceptual tokens:
surface-dark / foreground-light
surface-light / foreground-dark
muted foreground
semantic success/warning/error foreground
Use the current Tailwind/design-system approach.
Do not create excessive token complexity.

WCAG-MINDED REVIEW
Aim for strong practical contrast.
Especially review:
body text
small timestamps
helper text
disabled buttons
badges
selected/unselected states
Do not rely on low-opacity white text on translucent light backgrounds.

GLASSMORPHISM PRINCIPLE
Preserve:
"Glassmorphism is the visual language of TINDAHAN, not the purpose of TINDAHAN."
If glass effects hurt readability:
reduce/remove them for that component.
Message bubbles in particular should prioritize clarity over glass effects.

PART 4 — ADMIN DASHBOARD MODULE STATE CLEANUP
Review the current admin dashboard.
Current implemented functional modules include:
ULAM POST
ULAM PHOTOS
MESSAGE
ADDRESS BOOK
MANUAL ORDER
TOTAL ORDERS FOR TODAY
These should all use the active/implemented visual treatment.

CURRENT REPORTED PROBLEM
These implemented modules still appear with the inactive/unfinished styling:
MANUAL ORDER
ADDRESS BOOK
MESSAGE
Fix them.

SETTINGS
SETTINGS is not yet implemented.
It should remain visually distinct as unfinished/coming soon/disabled according to current design.
Do not activate Settings prematurely.

ACTIVE VS INACTIVE SEMANTICS
Do not rely only on color.
Implemented module:
active color treatment
normal cursor/touch behavior
accessible button/link
navigation works
Unimplemented module:
disabled or clearly placeholder behavior
explicit visual/text state such as:
Coming soon
if appropriate
not misleadingly clickable

DASHBOARD DATA MODEL
Inspect whether module availability is hard-coded in multiple places.
Prefer one simple source of truth for module metadata.
Example conceptually:
label
icon
route
implemented/enabled state
Do not over-engineer a dynamic plugin system.
Just remove stale duplicated state.

ADMIN DASHBOARD IMPLEMENTED STATE
After this pass:
ULAM POST → Active
ULAM PHOTOS → Active
MESSAGE → Active
ADDRESS BOOK → Active
MANUAL ORDER → Active
TOTAL ORDERS FOR TODAY → Active
SETTINGS → Inactive/coming later
If another dashboard action exists, determine state from actual implementation.

PART 5 — MOBILE VALIDATION
This polish pass was triggered by real usage.
Test mobile behavior thoroughly.
Use:
npm run dev:mobile
If physical phone is available, prioritize actual device validation.

REAL PHONE TEST CASES
Customer messaging
Open customer message screen
Send message
Receive admin reply without refresh
Confirm readable bubbles
Open image
Upload receipt if appropriate
Keyboard behavior
Back navigation
Admin messages
Open MESSAGE
Receive customer message realtime
Open conversation
Reply
Customer sees reply realtime
Verify payment
Customer sees status update
Image/payment receipt readable
Long thread scrolling
Dashboard
Confirm active visual state for:
ULAM POST
ULAM PHOTOS
MESSAGE
ADDRESS BOOK
MANUAL ORDER
TOTAL ORDERS FOR TODAY
Confirm Settings remains inactive.

RESPONSIVE REVIEW
Review at:
320px
360px
390px
430px
desktop
320px Extra Large text
Test:
short conversation
long conversation
long message
image message
payment receipt
realtime incoming message
composer with keyboard-sized viewport
dashboard active/inactive states
No horizontal overflow.

ERROR BOUNDARY
Preserve the global error boundary added during the Mobile Admin Stability Debug Pass.
Realtime errors must not cause a blank screen.
Subscription failure should degrade gracefully to normal refetch/manual refresh behavior.

SECURITY REVIEW
Confirm:
Realtime does not expose messages across orders
Guest cannot access another order
Admin route still requires active admin
No service-role key in frontend
Private Storage remains private
Payment evidence remains private
Signed URLs remain short-lived
No guest token in URL
No broad sensitive table subscription leaks private payloads
If direct Realtime table subscription creates authorization concerns, use the safest architecture available even if that means a narrower event/refetch design.

FRONTEND TESTS
Add/update tests covering:
Realtime
incoming message event invalidates/refetches conversation
admin inbox refreshes on new activity
customer chat refreshes on admin reply
payment verification event refreshes customer state
subscription cleanup occurs on unmount/order change
reconnect/focus refetch behavior
Mock realtime where appropriate.
Messaging UI
own message alignment
other sender alignment
high-contrast semantic classes
long message wrapping
composer
image message
payment evidence label
Dashboard
ULAM POST active
ULAM PHOTOS active
MESSAGE active
ADDRESS BOOK active
MANUAL ORDER active
TODAY’S ORDERS active
SETTINGS inactive
Contrast
Where practical, test correct semantic class/token use rather than brittle exact visual snapshots.

LOCAL END-TO-END VALIDATION
Run a real local two-session workflow.
Suggested:
Browser/session A:
customer
Browser/session B:
admin
Create customer order
Open customer messages
Open matching admin conversation
Customer sends "Hello"
Confirm admin sees it without refresh
Admin replies "Hi"
Confirm customer sees it without refresh
Customer sends image/payment evidence
Confirm admin sees it without refresh
Admin verifies payment
Confirm customer state updates without refresh
Reverse verification
Confirm update returns
Confirm message bubbles remain readable throughout
Use fake data only.
Clean up test fixtures afterward.

BACKEND CHANGES
Do not modify backend unless realtime support requires a concrete small change.
If Supabase Realtime publication/configuration changes are required:
scope them narrowly
preserve RLS
verify no cross-order data exposure
add security validation
document exactly what tables/events are enabled
Do not make sensitive tables publicly readable just for realtime.

DOCUMENTATION
Create:
Documentation/MARKDOWN/PHASE-2.9.1-REALTIME-MESSAGING-UI-POLISH.md
Include:
Purpose
User-reported issues
Realtime strategy
Why query invalidation/refetch remains authoritative
Admin inbox subscription behavior
Open conversation subscription behavior
Customer subscription behavior
Reconnect/fallback behavior
Messaging UI redesign
Bubble semantics
Composer behavior
Scroll behavior
Contrast audit
Design token changes
Dashboard active/inactive cleanup
Accessibility
Security review
Files changed
Frontend tests
Backend/security changes if any
Local realtime E2E
Physical-phone validation
Risks/limitations
Remaining work
Recommended next phase

NEXT PHASE
Only after this pass is complete, recommend:
Phase 2.10 — Settings
Do not begin automatically.

FINAL CHECKLIST
Before stopping confirm:
Customer receives admin reply without browser refresh.
Admin receives customer message without browser refresh.
Admin inbox updates on new conversation activity.
Payment verification changes refresh customer state.
Realtime uses secure scoped subscriptions.
Existing API remains authoritative.
Realtime disconnect has safe fallback.
Subscriptions clean up correctly.
Chat layout follows familiar messenger-style interaction.
Own/other messages visually distinct.
Message bubbles have strong readable contrast.
Light surfaces use dark readable text.
Dark surfaces use light readable text.
No known white-on-light message card remains.
Long messages wrap safely.
Mobile composer remains usable.
Image/payment evidence UI remains secure.
ULAM POST dashboard action appears active.
ULAM PHOTOS appears active.
MESSAGE appears active.
ADDRESS BOOK appears active.
MANUAL ORDER appears active.
TOTAL ORDERS FOR TODAY appears active.
SETTINGS remains inactive/unimplemented.
Active/inactive state is not communicated by color alone.
Global error boundary remains functional.
320px has no overflow.
Extra Large text works.
Frontend tests pass.
Backend/security tests pass if changed.
ESLint passes.
TypeScript/build passes.
Prettier passes.
Local realtime two-session E2E passes.
Physical-phone test completed if available.
No unrelated feature work added.
Recommend Phase 2.10.
Stop.
The goal is:
Make TINDAHAN messaging feel instant and familiar, make every message easy to read, and make the admin dashboard accurately show which modules are already ready to use.


