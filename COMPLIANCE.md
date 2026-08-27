# Compliance rules

These are not guidelines. Breaking them gets **our customers'** Google listings penalised,
which destroys the product and the relationship. Every PR touching the diner surface, the
menu copy, or the review CTA must be checked against this file.

---

## 1. Never create a review programmatically

The Google Business Profile API does not allow it. There is no workaround, no partner
tier, no undocumented endpoint. Any code path that reads as "post a review on behalf of a
user" is wrong by construction.

We link a diner to Google's own review form. They write it, they post it, on their own
account. We never see it.

## 2. Never gate the Google link by rating

This is the rule most likely to be broken by someone being helpful, because hiding the
link from unhappy diners looks obviously sensible in a product meeting. It is called
**review gating** and it is itself a policy violation.

The rule in code:

- The Google link is rendered for **every** diner, at **every** rating, always.
- Prominence may vary. Availability may not.
- 4–5 stars: primary button. 1–3 stars: plain secondary text link. Both present.

If you find yourself writing `if (rating >= 4)` around anything that decides whether the
link *exists* rather than how it *looks*, stop.

## 3. No incentive mechanics. Ever.

No discount code, voucher, free item, loyalty point, prize draw or "reward this customer"
button tied to leaving, changing, updating or removing a review — public or private.

This includes indirect versions: no "rate us and show your waiter", no per-table
competitions, no staff bonus tied to review counts surfaced through this product.

If a restaurant asks for it, the answer is no, and the reason is that it puts *their*
listing at risk, not ours.

## 4. Neutral solicitation copy

- Good: "How was your visit?", "How was the calamari?", "Mind sharing it publicly?"
- Not acceptable: "Leave us 5 stars", "Help us reach 4.5", "Rate us 5 if you enjoyed it",
  anything that names a target score.

Copy lives in the diner-surface renderer. Review it as carefully as the logic.

## 5. Abuse detection is mandatory, not optional

Every submission stores a salted `ip_hash` and a timestamp against the restaurant. One
venue farming two hundred submissions a day is a liability we need to be able to see and
shut down. The hash is for detection only — never displayed in the console, never
exported, never used to identify a person.

## 6. POPIA — South African privacy law

Not in the original handoff, and it applies to us directly.

Diner contact details are personal information. The restaurant is the responsible party;
we are the operator. Therefore:

- Contact details are collected **only** at a visit rating of 3 or below.
- The field is optional, visibly so, and carries a stated purpose: so the owner can get
  back to them about this visit.
- The purpose is that and nothing else. No marketing use, no export to a mailing list, no
  reuse for another restaurant.
- `visits.contact` is purged at **90 days** by the daily cron. That job is not
  housekeeping — it is the retention limit, and it must not be disabled.

---

## Checklist for any PR touching the diner surface

- [ ] No code path creates or edits a Google review.
- [ ] The Google link renders at every rating value, 1 through 5.
- [ ] No incentive, reward or discount appears anywhere in copy or logic.
- [ ] No copy names a target star rating.
- [ ] Submissions still record `ip_hash` and a timestamp.
- [ ] Contact capture is still gated to ratings ≤ 3 and still carries its purpose line.
- [ ] The 90-day contact purge still runs.
