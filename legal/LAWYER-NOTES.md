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
- **Processors**: Supabase (DB/auth/storage), Stripe, Resend (email), Netlify (hosting), OpenFreeMap + OpenStreetMap/Nominatim (map tiles, geocoding, ZIP lookup), Google Fonts, cdnjs/jsDelivr.
- **Referral tracking (new):** a referral link (`?ref=code`) stores the code in the browser (localStorage, 30 days) and, if the person signs up, on their profile (`referrer_code`, `signup_source`). Only the admin can see it. Used to pay partners (see question 12). Privacy Policy updated to say so.
- **Partner dashboard (new):** a partner whose login is linked to a code sees, on their own Family tab, counts of families they brought in and each sourced studio's completed bookings per month (no names, emails or studio contact details), plus a log of what we have paid them. Please cover confidentiality of that studio data in the partner agreement.

## Questions for the lawyer
1. **Entity and name**: LLC formation; trademark search/clearance for "LittlePass" (similar marks: Little Passports; competitor KidPass).
2. **Auto-renewal (California ARL)**: do our checkout disclosures, acknowledgement email, and cancellation flow comply? Is "credits expire when the subscription ends" lawful and clearly disclosed? Any gift-card/stored-value rules that apply to credits?
3. **Refund policy**: we decided on **no partial-month refunds** (confirm lawful and clearly disclosed); what to do on account closure by us without cause.
4. **Liability for children's activities**: assumption-of-risk/waiver language; whether parents can validly waive on behalf of minors; whether studios must collect their own waivers; our limitation of liability and indemnity; need for our own insurance.
   - **Built (please review):** studios can add their own waivers in the app. Before booking, a parent reads the waiver, ticks "I have read this waiver and agree to it for myself and for: [children]", and types their full name. We store an exact copy of the text, version, signer name, children named, time and browser, and the studio can download them. Editing a waiver creates a new version that families must sign again; bookings are refused until the current version is signed. The signing screen says "LittlePass is a booking platform… Your agreement is with [studio]."
   - Questions: is this click-and-type signature enough (E-SIGN / UETA)? Should every studio waiver also **release LittlePass** (we can add a fixed clause to every waiver automatically)? Should waivers be **mandatory** for studios? How long must signatures be kept? Should we require studios to name LittlePass as **additional insured** and keep the indemnity in the Studio Agreement?
5. **Marketplace role**: is the "independent studio" framing safe (classification, vicarious liability, "negligent selection" risk when we approve studios)? What vetting should we do and say (insurance proof, background checks)?
6. **Children's privacy**: COPPA (we don't target children but hold child names/birthdays given by parents), CCPA/CPRA obligations, whether children's birthdays are "sensitive". Required notices and rights handling.
7. **Photos of minors**: sufficiency of the studio's consent checkbox; takedown process; any need for a DMCA agent.
8. **Studio payments and tax**: our reporting duties (W-9, 1099-K/NEC), sales-tax treatment of subscriptions, whether manual payouts make us a money transmitter (we pay studios from our own funds, not holding customer funds in trust).
9. **Disputes**: arbitration and class-action waiver, venue, notice mechanics.
10. **Non-circumvention** clause strength for studios.
11. **Data retention** periods; breach-notification process; requirement for a published data-request method.
12. **Referral / sales partners** (a person who signs studios and brings in families, paid per studio and per member, plus a small equity grant and possibly a flat monthly support fee): independent contractor vs employee in California (the ABC test and commission-based pay), written agreement terms (IP, confidentiality, no side deals or special prices, protection of children's and parents' data, 14 days' notice with earned fees still payable), how to grant the equity (profits interests, vesting, tax), and **advertising disclosure** when a paid partner promotes LittlePass (FTC endorsement rules).

## Product items to build once the lawyer decides
- ~~In-app "delete my account" and "download my data".~~ **Built.** Deletion ends the subscription at once, cancels upcoming bookings, anonymises (does not delete) booking records and reviews, and blocks a studio from closing while it has upcoming bookings or unpaid earnings. Please review this design.
- Record acceptance of Terms/Privacy at signup (**done in this draft**, `terms_version` + `terms_accepted_at`).
- Marketing-email opt-in/unsubscribe (we currently send transactional email only).
- Insurance upload / verification for studios (optional).
