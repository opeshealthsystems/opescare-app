# Google Play store listing — English (en-GB / en-US)

Paste each block into the matching Play Console field. Character limits are
Play's own and are counted below.

---

## App name
*Limit 30 characters — using 8*

```
OpesCare
```

---

## Short description
*Limit 80 characters — using 55*

```
Your Health ID, your medical record, and care near you.
```

---

## Full description
*Limit 4000 characters — using about 1980*

```
OpesCare gives you a portable Health ID and a medical record that travels with you.

YOUR RECORD, WHEREVER YOU ARE TREATED
Your Health ID identifies you at any facility on the OpesCare network. Consultations, prescriptions, laboratory results, immunisations, allergies and vital signs are kept on one record, so a clinician you have never met can see what matters.

YOU DECIDE WHO SEES WHAT
No facility opens your record without a reason the app can show you. You approve access requests, and every access is listed afterwards in your own log. Two switches put you in control: require your consent before your full record can be opened, and choose whether emergency access is allowed at all.

FIND CARE AND MEDICINES NEAR YOU
Search the national facility directory — hospitals, clinics, health centres, pharmacies and laboratories — with addresses, phone numbers and opening hours. See which pharmacies have reported a medicine in stock, and which hospitals have reported blood available. Availability is reported by the facility and timestamped. It is never a guarantee, so call before you travel.

YOUR DOCUMENTS, WHEN YOU ASK FOR THEM
Download laboratory reports, prescriptions, your immunisation record, discharge summaries and certificates as PDFs. Each carries a QR code a clinician can check against the record it came from. Documents are generated at the moment you download them.

APPOINTMENTS AND REMINDERS
Book at a facility that takes appointments, and be reminded two days, one day and two hours before.

FOR FAMILIES
Hold a child's or a dependent's record through a family link, and end that link whenever you choose.

Available in English and French. Payments by MTN Mobile Money and Orange Money.

OpesCare does not diagnose, treat or give medical advice, and it is not a substitute for seeing a health professional. It shows you the record your clinicians write and the availability facilities report.
```

---

## Category and tags

| Field | Value |
| --- | --- |
| Application type | App |
| Category | Medical |
| Tags | Health records, Medical ID, Pharmacy, Appointments |
| Contains ads | No |
| In-app purchases | Yes — subscription, paid by mobile money |

## Contact details

| Field | Value |
| --- | --- |
| Website | `https://finder.opescare.cloud` |
| Privacy policy | `https://finder.opescare.cloud/privacy` |
| Data deletion | `https://finder.opescare.cloud/account-deletion` |
| Email | `support@opescare.com` — **confirm it receives mail first, see below** |

> ### The support email is not confirmed working
>
> Play publishes this address and verifies it, so a dead one stalls the review.
>
> `support@opescare.com` was probed live on 7 September 2026 against both of
> `opescare.com`'s mail exchangers. `MAIL FROM` was accepted and then **every**
> recipient at the domain was refused:
>
> ```
> eforward1.registrar-servers.com  RCPT <support@opescare.com>      554 5.7.1 Relay access denied
> eforward1.registrar-servers.com  RCPT <zz-nope-77213@opescare.com> 554 5.7.1 Relay access denied
> eforward3.registrar-servers.com  same, both addresses
> ```
>
> A blanket refusal that does not distinguish a real address from a made-up one
> is what Namecheap's forwarding service returns when **no forward is
> configured for the domain**: the MX records point at the service, but the
> service has nothing to deliver to. It is not proof — our sending host could
> also be blocked — but it is the likeliest reading, and either way the address
> is not demonstrably live.
>
> **Confirm it in thirty seconds:** send a message to `support@opescare.com`
> from any personal account and see whether it arrives. If it does not, add the
> forward in the Namecheap dashboard for `opescare.com` before submitting.
>
> Note this is a *different* problem from the platform's outbound mail. That one
> is the null MX on `opescare.cloud`, which stops anything the app sends from
> being delivered at all.

## A note on the availability wording

The two sentences about reported availability are not marketing hedging — they
are the platform's own documented invariant, stated the same way in the web
copy and enforced in the API by a `source_system` allow-list. Do not tighten
them into a promise of stock.
