"""Builds legal/*.html from the text below. Run: python3 legal/build.py
Placeholders are written like [THIS] and are highlighted pink on the page."""
import re, os

def page(title, body):
    ph = lambda t: re.sub(r'\[([A-Z0-9][A-Z0-9_ /\-\.,\'\(\)\$%:&;#]*)\]', r'<span class="ph">[\1]</span>', t)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · LittlePass</title>
<meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="legal.css"></head><body><div class="wrap">
<div class="top"><a class="logo" href="../">🐣 Little<span>Pass</span></a>
<div class="nav"><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a><a href="studio-agreement.html">Studio agreement</a></div></div>
<div class="draft"><b>DRAFT, not yet reviewed by a lawyer.</b> Items in <span class="ph">[PINK BRACKETS]</span> are placeholders or open decisions. This page is not final legal text.</div>
<div class="card">{ph(body)}</div></div></body></html>'''

TERMS = '''
<h1>Terms of Service</h1>
<p class="meta">Last updated: [EFFECTIVE DATE] · Version: draft-1</p>

<p>These Terms are an agreement between you and <b>[BUSINESS NAME, LLC]</b> ("<b>LittlePass</b>", "we", "us"), a [STATE] company at [BUSINESS ADDRESS]. By creating an account or using LittlePass you agree to these Terms and our <a href="privacy.html">Privacy Policy</a>.</p>

<h2>1. What LittlePass is</h2>
<p>LittlePass is an online marketplace that helps parents and caregivers in San Diego find and book baby and toddler classes. <b>The classes are run by independent studios, not by LittlePass.</b> We list classes, handle bookings and payments, and pass studios their share. We don't teach, supervise or employ the instructors, and we don't control the studios' spaces.</p>

<h2>2. Your account</h2>
<ul>
<li>You must be at least 18 to create an account. Accounts are for parents and legal guardians.</li>
<li>Give us accurate information and keep your password safe. You're responsible for activity on your account.</li>
<li>You may add your children's first names and birthdays so we can suggest classes for their age. Only add information you're entitled to share.</li>
<li>Studios use a separate account type and are also bound by the <a href="studio-agreement.html">Studio Partner Agreement</a>.</li>
</ul>

<h2>3. Plans, credits and billing</h2>
<h3>Subscriptions</h3>
<p>Plans are monthly subscriptions. <b>Your plan renews automatically every month until you cancel</b>, and we charge your payment method on file the plan price shown at checkout, plus any applicable taxes. Payments are processed by Stripe. We don't see or store your full card number.</p>
<h3>Credits</h3>
<ul>
<li>Each plan gives you a set number of credits every month. You use credits to book classes. The number of credits a class costs is shown before you book and can differ from class to class.</li>
<li>Credits have <b>no cash value</b>, can't be transferred or sold, and can't be redeemed for money.</li>
<li><b>Rollover:</b> while your subscription is active, unused credits roll over to the next month, up to a balance of <b>twice your plan's monthly credits</b>.</li>
<li><b>Expiry:</b> if your subscription ends, any unused credits expire at the end of your paid period. [LAWYER: confirm this credit-expiry wording is lawful and clearly disclosed in California.]</li>
</ul>
<h3>Changing or cancelling your plan</h3>
<ul>
<li><b>Upgrading:</b> takes effect immediately. You pay the prorated difference now and receive the additional credits right away.</li>
<li><b>Downgrading:</b> takes effect at your next renewal date.</li>
<li><b>Cancelling:</b> you can cancel any time online, under Plans, then "Manage subscription". Cancellation takes effect at the end of the current billing period, and you keep access until then. <b>We don't refund partial months</b> or unused credits, except where the law requires it.</li>
<li><b>Failed payments:</b> if a payment fails we may pause new credits until it's resolved.</li>
<li><b>Price changes:</b> we'll tell you at least 30 days before a price change takes effect, and you may cancel before then.</li>
</ul>
<p>[LAWYER: confirm compliance with California's automatic renewal law: clear disclosure before purchase, affirmative consent, an acknowledgement email, and easy online cancellation.]</p>

<h2>4. Booking and cancelling classes</h2>
<ul>
<li>Booking a class uses your credits right away. Spots are limited and confirmed once you see your booking in "My classes".</li>
<li><b>Free cancellation:</b> you can cancel up to <b>24 hours</b> before the class starts and your credits are returned.</li>
<li><b>Inside 24 hours:</b> bookings can't be cancelled and credits are not refunded. If you don't attend, the credits are used.</li>
<li><b>If a studio cancels</b> or removes a class, we cancel your booking and return your credits.</li>
<li>Class times, ages and capacity are set by studios. Studios may have their own rules (for example, arrival times), which they'll tell you.</li>
</ul>

<h2>5. Safety and your responsibilities</h2>
<p>Studios, not LittlePass, are responsible for running safe classes, supervising participants (other than your responsibility to supervise your child), their instructors' qualifications and background checks, their premises and their insurance. You're responsible for deciding whether a class is suitable for your child, for your child's health, and for supervising your child unless the studio tells you otherwise. Tell the studio about allergies, medical needs or other relevant information.</p>
<p>[LAWYER: assumption of risk, waivers and releases for activities involving minors need careful drafting under California law. Decide whether LittlePass requires studios to collect their own waivers.]</p>

<h2>6. Reviews and community content</h2>
<ul>
<li>You can review a class <b>after you've attended it</b>. Reviews show your first name and last initial and a "Verified attendee" badge.</li>
<li>Reviews must be honest, based on your own experience, and free of hateful, unlawful, or private information about others. Don't include children's full names or photos of other people's children.</li>
<li>You keep ownership of your reviews, and you give us a free, worldwide licence to display them on LittlePass. Studios can publicly reply to a review but can't edit or delete it.</li>
<li>You can report any review or photo. We may hide or remove content that breaks these Terms.</li>
</ul>

<h2>7. Photos of children</h2>
<p>Studios may post photos of their classes, which can show children. Studios must have permission from the parents or guardians of any child shown. If you see a photo of your child that you didn't agree to, use "Report" on the photo, or email [CONTACT EMAIL], and we'll act promptly.</p>

<h2>8. Acceptable use</h2>
<p>Don't misuse LittlePass: no fraud, no attempts to get free credits or avoid payment, no harassment, no scraping or automated access, no interfering with the service or its security, and no using the service for anything unlawful. Don't contact studios or other families outside LittlePass to arrange bookings that avoid our fees.</p>

<h2>9. Our content</h2>
<p>LittlePass, its logo and software are owned by us. You may use the service for personal, non-commercial purposes under these Terms.</p>

<h2>10. Disclaimers</h2>
<p>LittlePass is provided "as is" and "as available". We don't guarantee that classes will be available, safe, or suitable, or that the service will be uninterrupted or error-free. Studio information (descriptions, ages, photos, reviews) comes from studios and other users, and we don't verify all of it. [LAWYER: confirm disclaimer wording.]</p>

<h2>11. Limit of liability</h2>
<p>To the fullest extent the law allows, LittlePass isn't liable for indirect or consequential losses, or for injuries or losses arising from classes run by studios. Our total liability to you for any claim is limited to the amount you paid us in the [12] months before the claim. Some places don't allow these limits, so they may not apply to you. [LAWYER: finalise.]</p>

<h2>12. Indemnity</h2>
<p>You agree to cover reasonable losses we suffer because you broke these Terms or misused the service. [LAWYER: confirm scope.]</p>

<h2>13. Ending your account</h2>
<p>You can stop using LittlePass at any time. We may suspend or close accounts that break these Terms, are used fraudulently, or put others at risk. If we close your account without cause, we'll return the value of any credits you hadn't used. [DECISION.]</p>

<h2>14. Disputes and governing law</h2>
<p>These Terms are governed by California law. Disputes will be handled in the state or federal courts in San Diego County, California. [LAWYER: decide whether to include arbitration and a class-action waiver, and how to give required notices.]</p>

<h2>15. Changes</h2>
<p>We may update these Terms. We'll tell you about important changes by email or in the app, and the new version applies from its effective date. Continuing to use LittlePass means you accept it.</p>

<h2>16. Contact</h2>
<p>[BUSINESS NAME, LLC] · [BUSINESS ADDRESS] · <b>[CONTACT EMAIL]</b></p>
'''

PRIVACY = '''
<h1>Privacy Policy</h1>
<p class="meta">Last updated: [EFFECTIVE DATE] · Version: draft-1</p>

<p><b>[BUSINESS NAME, LLC]</b> ("LittlePass", "we") runs LittlePass. This policy explains what information we collect, why, who we share it with, and the choices you have. Because LittlePass is used by families with babies and toddlers, we've tried to collect as little as we can.</p>

<h2>1. Information we collect</h2>
<table>
<tr><th>What</th><th>Details</th><th>Why</th></tr>
<tr><td><b>Account</b></td><td>Name, email address, password (stored in scrambled form, never in plain text), account type (parent, studio)</td><td>Create and secure your account</td></tr>
<tr><td><b>Your children</b></td><td>First name and birthday, if you add them</td><td>Suggest classes for their age and tell the studio who is attending</td></tr>
<tr><td><b>Bookings and credits</b></td><td>Classes booked, dates, who attends, credits used and your credit history</td><td>Run bookings, refunds and your account</td></tr>
<tr><td><b>Payments</b></td><td>Handled by Stripe. We keep your plan, renewal date and Stripe customer and subscription IDs, but not your card number.</td><td>Take payments and manage your subscription</td></tr>
<tr><td><b>Reviews and reports</b></td><td>What you write, ratings, and any report you submit</td><td>Show reviews, keep the community safe</td></tr>
<tr><td><b>Studios</b></td><td>Studio name, description, class details, addresses, photos, bookings, earnings and payouts</td><td>List classes and pay studios</td></tr>
<tr><td><b>Technical</b></td><td>A sign-in token stored in your browser so you stay logged in. Standard server logs (such as IP address) from our providers.</td><td>Keep you signed in, security, fixing problems</td></tr>
<tr><td><b>Your location (optional)</b></td><td>If you tap "Near me", your browser may share your location. It's used on your device to sort and show nearby classes and <b>isn't sent to or stored by us</b>.</td><td>Show nearby classes</td></tr>
</table>
<p>We don't collect payment card numbers, government IDs, or precise location history.</p>

<h2>2. Information about children</h2>
<p>LittlePass is for parents and guardians. It isn't directed at children, and children shouldn't create accounts. We collect a child's first name and birthday only when a parent adds them, and use it only to suggest age-appropriate classes and to tell the studio who is attending. Parents can edit or remove this information in their account at any time. Studios that attend see the child's first name for classes you book. [LAWYER: confirm COPPA and California requirements for data about children given by parents.]</p>

<h2>3. Who sees your information</h2>
<ul>
<li><b>Studios</b> see the booking details they need: the parent's name, the attending child's first name, and the class and time. They don't see your email address or payment details through LittlePass.</li>
<li><b>Other parents</b> only see your first name and last initial on reviews you write.</li>
<li><b>LittlePass staff</b> can access account information as needed to run and support the service.</li>
</ul>

<h2>4. Companies that help us run LittlePass</h2>
<p>We share information with service providers only so they can do their job for us. They aren't allowed to use it for their own marketing.</p>
<table>
<tr><th>Provider</th><th>What they do</th></tr>
<tr><td>Supabase</td><td>Database, login and file storage</td></tr>
<tr><td>Stripe</td><td>Payment processing and subscription management</td></tr>
<tr><td>Resend</td><td>Sending our emails (booking confirmations and account emails)</td></tr>
<tr><td>Netlify</td><td>Hosting the website</td></tr>
<tr><td>OpenStreetMap and Nominatim</td><td>Map tiles, and turning studio addresses into map positions. Your browser contacts them when you view the map.</td></tr>
<tr><td>Google Fonts and code libraries (cdnjs, jsDelivr)</td><td>Fonts and software the site loads. Your browser contacts them, which can share your IP address.</td></tr>
</table>
<p>We may also share information if the law requires it, to protect people's safety or our rights, or if our business is sold or merged (we'd tell you).</p>
<p><b>We don't sell your personal information</b> and we don't share it for advertising across other sites.</p>

<h2>5. Cookies and similar technology</h2>
<p>We use browser storage only for what's needed to keep you signed in and remember settings. We don't use advertising or analytics cookies. [CHECK: update if analytics are added.]</p>

<h2>6. Emails</h2>
<p>We send transactional emails: account, booking, subscription and safety messages. We don't send marketing email unless you opt in. [DECISION: marketing emails and unsubscribe.]</p>

<h2>7. How long we keep information</h2>
<p>We keep your account information while your account is open. When you close it we delete or anonymise your personal information, except records we must keep for legal, tax or fraud-prevention reasons (such as payment and booking records, kept for 7 years). Reviews you wrote may stay in an anonymised form. [LAWYER: confirm retention periods.]</p>

<h2>8. Your rights and choices</h2>
<p>You can see and edit your account details and your children's details in the app. Depending on where you live (including California), you may also have the right to ask us to:</p>
<ul>
<li>tell you what personal information we hold about you and give you a copy,</li>
<li>correct it or delete it,</li>
<li>not discriminate against you for using your rights.</li>
</ul>
<p><b>Download your data:</b> in the app, open <b>Family</b> (parents) or <b>Account</b> (studios) and tap <b>Download my data</b> for a copy of your information in a standard file. <b>Delete your account:</b> in the same place, tap <b>Delete my account</b>. Deleting ends your subscription immediately (unused credits are lost), cancels your upcoming bookings, and removes your account details and your children's details. We keep <b>anonymised</b> booking and payment records for [7] years for tax and accounting, and reviews you wrote stay without your name. A studio can close its account once it has no upcoming bookings and has been paid everything it's owed.</p>
<p>You can also make any request by emailing <b>[CONTACT EMAIL]</b>. We'll respond within [45] days. We may need to verify it's you.</p>

<h2>9. Security</h2>
<p>We use well-established providers and security practices to protect your information, and we limit who can see it. No service is perfectly secure. If a breach affects you, we'll notify you as the law requires.</p>

<h2>10. Changes</h2>
<p>If we change this policy in a significant way we'll tell you before it takes effect.</p>

<h2>11. Contact</h2>
<p>[BUSINESS NAME, LLC] · [BUSINESS ADDRESS] · <b>[CONTACT EMAIL]</b></p>
'''

STUDIO = '''
<h1>Studio Partner Agreement</h1>
<p class="meta">Last updated: [EFFECTIVE DATE] · Version: draft-1</p>

<p>This agreement is between <b>[BUSINESS NAME, LLC]</b> ("LittlePass") and the studio, business or individual that signs up as a partner ("<b>you</b>"). By creating a studio account you agree to this agreement and to the LittlePass <a href="terms.html">Terms of Service</a> and <a href="privacy.html">Privacy Policy</a>.</p>

<h2>1. Our relationship</h2>
<p>You are an <b>independent business</b>. You aren't our employee, agent, partner or franchisee. You run your classes, set your own schedule, and decide how to teach them. LittlePass provides a marketplace where parents can find and book them.</p>

<h2>2. Eligibility and approval</h2>
<ul>
<li>You must be a legally operating business or individual able to teach classes in California, with any permits and licences your activities require.</li>
<li>Studios are reviewed before they appear to parents. We may approve, reject or suspend a studio at our discretion, with reasons where we can. If a studio is suspended, upcoming bookings may be cancelled and parents refunded.</li>
<li>You must tell us promptly if anything you told us changes.</li>
</ul>

<h2>3. Your classes and listings</h2>
<ul>
<li>Describe your classes honestly: activity, ages, location, schedule and what's included. Keep your schedule and spots up to date.</li>
<li>Honour every confirmed booking. If you must cancel a session, do it as early as you can through your dashboard. Parents are refunded in full, and you receive no payment for a cancelled session.</li>
<li>Don't move a time slot that already has bookings. Close it and create a new one.</li>
<li>Your addresses are your choice: you can show them to everyone, or only to parents who have booked. You're responsible for giving parents the correct location.</li>
</ul>

<h2>4. Safety, insurance and compliance</h2>
<ul>
<li>You are responsible for the safety of your classes, premises, equipment and instructors, and for compliance with all laws that apply to you, including child-safety, health, fire and licensing rules.</li>
<li>You must carry general liability insurance of at least <b>[AMOUNT, for example $1,000,000]</b> per occurrence, and give us proof on request. [LAWYER: decide whether to require naming LittlePass as an additional insured.]</li>
<li>Your instructors must be qualified for the activity. You are responsible for background checks and any other screening the law or good practice requires for people who work with children. [LAWYER: confirm requirements.]</li>
<li>You are responsible for any waivers or releases your activities require, and for reporting incidents or suspected abuse as the law requires.</li>
</ul>

<h2>5. Prices, credits and payments to you</h2>
<ul>
<li>You set the <b>price you want to receive for each booking</b> of each time slot, in dollars.</li>
<li>LittlePass converts that price to credits for parents using our own formula. You'll see the credit price for each slot. How many credits parents pay is our decision, and doesn't change the amount you are owed.</li>
<li>You earn your price for each booking <b>once the class has taken place</b>. Bookings that parents cancel on time, or that you or we cancel, earn nothing. Bookings that parents can no longer cancel (inside 24 hours before the class), and no-shows, are still paid.</li>
<li><b>Payouts:</b> we pay out <b>once a month, at the end of the month</b>, for bookings completed up to [CUTOFF DATE, e.g. the 25th] of that month. Anything completed after the cutoff goes into the next month's payout. We send payment by [PAYMENT METHOD, e.g. bank transfer or Zelle]. Your dashboard shows what you've earned, what's been paid, and when.</li>
<li><b>Fees:</b> you always receive the price you set for each completed booking. LittlePass keeps the difference between what parents pay (in credits) and that price. There is no separate fee charged to studios.</li>
<li><b>Taxes:</b> you're responsible for your own taxes. We may ask for tax information (for example a Form W-9) and may be required to report payments to tax authorities. [LAWYER/ACCOUNTANT: confirm reporting duties.]</li>
<li>If a parent is refunded because of something you did, such as a cancelled class or an unsafe session, we may hold back or reverse the related payment.</li>
</ul>

<h2>6. Reviews, photos and parent information</h2>
<ul>
<li>Parents who attended can review your classes. You can reply publicly but can't edit or remove reviews. Don't pressure or reward parents for reviews, and don't write fake ones.</li>
<li><b>Photos:</b> you may upload photos of your classes. <b>You must have permission from the parents or guardians of every child shown</b> before uploading, and you confirm this each time you upload. We may remove any photo. You give LittlePass a free licence to display your photos and descriptions on the platform. You keep ownership.</li>
<li><b>Parent and child information</b> you receive (names, who is attending) may only be used to run the class booked. Don't sell it, market with it, or share it, and keep it secure. Delete it when you no longer need it, unless the law requires you to keep it.</li>
</ul>

<h2>7. Staying on the platform</h2>
<p>Don't use LittlePass to find parents and then move their bookings elsewhere to avoid the platform. [LAWYER: decide whether to include a non-circumvention clause and how strict it should be.]</p>

<h2>8. Ending this agreement</h2>
<p>You can close your studio at any time. Before you do, you must honour or cancel your upcoming bookings (parents are refunded). We can suspend or end your account if you break this agreement, put children at risk, or mislead parents. We'll still pay you for classes already completed, less any amounts you owe us.</p>

<h2>9. Responsibility</h2>
<p>You're responsible for your classes and your own acts, and you'll cover reasonable losses we or parents suffer because of your negligence, your breach of this agreement, or your violation of law. LittlePass isn't liable for your lost business or for classes you run. [LAWYER: draft indemnity and limitation of liability.]</p>

<h2>10. Disputes and governing law</h2>
<p>California law applies. Disputes will be heard in the state or federal courts in San Diego County. [LAWYER: arbitration choice.]</p>

<h2>11. Changes and contact</h2>
<p>We may update this agreement and will tell you about important changes before they take effect. Questions: <b>[CONTACT EMAIL]</b>.</p>
'''

for name, title, body in [('terms.html', 'Terms of Service', TERMS), ('privacy.html', 'Privacy Policy', PRIVACY), ('studio-agreement.html', 'Studio Partner Agreement', STUDIO)]:
    open(os.path.join(os.path.dirname(__file__), name), 'w').write(page(title, body))
print('built')
