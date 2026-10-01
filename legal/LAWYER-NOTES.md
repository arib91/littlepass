# LittlePass: notes for the lawyer

Drafts are in this folder: `terms.html`, `privacy.html`, `studio-agreement.html` (edit the text in `build.py`, then run `python3 legal/build.py`).
Anything in [BRACKETS] is a placeholder or an open decision. Nothing here has been reviewed by a lawyer.

## What the product does (so the documents match reality)
- Marketplace: parents (18+) subscribe monthly and use **credits** to book baby/toddler classes run by **independent studios** in San Diego. Studios are approved by us before they go live.
- **Plans**: Sprout $49/12 credits, Bloom $89/25, Grove $149/45 (monthly, auto-renewing via Stripe). Rollover while subscribed, capped at 2x the plan's credits; credits **expire when the subscription ends**. Upgrade = prorated charge + extra credits immediately; downgrade = at next renewal; cancel = end of billing period.
- **Booking**: credits deducted at booking. Free cancellation until **24 hours** before class (credits returned); inside 24 hours no cancellation, no refund. Studio-initiated cancellation = full credit refund.
- **Studios set a dollar price per time slot**; we convert to credits with an internal formula (margin is ours). Studio is paid its set price per **completed** booking (including late no-shows), by manual payout **once a month, at month end** (cutoff date TBD).
- **Reviews**: only attendees can review; studios can reply but not edit/delete; we can hide reported content. **Photos**: studios upload; consent checkbox ("permission from parents/guardians of any children shown"); live immediately; reportable; we can remove.
- **Addresses**: each class's address is either public or visible only to parents who booked.
- **Children's data** we hold: first name + birthday, entered by the parent. Studios see the attending child's first name and parent's name for their bookings.
- **Processors**: Supabase (DB/auth/storage), Stripe, Resend (email), Netlify (hosting), OpenStreetMap/Nominatim (maps/geocoding), Google Fonts, cdnjs/jsDelivr.

## Questions for the lawyer
1. **Entity and name**: LLC formation; trademark search/clearance for "LittlePass" (similar marks: Little Passports; competitor KidPass).
2. **Auto-renewal (California ARL)**: do our checkout disclosures, acknowledgement email, and cancellation flow comply? Is "credits expire when the subscription ends" lawful and clearly disclosed? Any gift-card/stored-value rules that apply to credits?
3. **Refund policy**: we decided on **no partial-month refunds** (confirm lawful and clearly disclosed); what to do on account closure by us without cause.
4. **Liability for children's activities**: assumption-of-risk/waiver language; whether parents can validly waive on behalf of minors; whether studios must collect their own waivers; our limitation of liability and indemnity; need for our own insurance.
5. **Marketplace role**: is the "independent studio" framing safe (classification, vicarious liability, "negligent selection" risk when we approve studios)? What vetting should we do and say (insurance proof, background checks)?
6. **Children's privacy**: COPPA (we don't target children but hold child names/birthdays given by parents), CCPA/CPRA obligations, whether children's birthdays are "sensitive". Required notices and rights handling.
7. **Photos of minors**: sufficiency of the studio's consent checkbox; takedown process; any need for a DMCA agent.
8. **Studio payments and tax**: our reporting duties (W-9, 1099-K/NEC), sales-tax treatment of subscriptions, whether manual payouts make us a money transmitter (we pay studios from our own funds, not holding customer funds in trust).
9. **Disputes**: arbitration and class-action waiver, venue, notice mechanics.
10. **Non-circumvention** clause strength for studios.
11. **Data retention** periods; breach-notification process; requirement for a published data-request method.

## Product items to build once the lawyer decides
- ~~In-app "delete my account" and "download my data".~~ **Built.** Deletion ends the subscription at once, cancels upcoming bookings, anonymises (does not delete) booking records and reviews, and blocks a studio from closing while it has upcoming bookings or unpaid earnings. Please review this design.
- Record acceptance of Terms/Privacy at signup (**done in this draft**, `terms_version` + `terms_accepted_at`).
- Marketing-email opt-in/unsubscribe (we currently send transactional email only).
- Insurance upload / verification for studios (optional).
