---
title: Gating and blocks
summary: Checks whether your Amazon seller account can list the product, needs approval, or is blocked.
synonyms: [ungating, ungate, brand approval, category approval, restricted, apply to sell, listing restrictions]
gate: gating
order: 11
---
Gating checks whether your own Amazon seller account is allowed to list the product. Some brands, categories and products need approval first; some are blocked outright.

## What it checks

It asks Amazon's listing restrictions (SP-API) for the ASIN, for your account. There are four answers:

- **Open**: you can list it.
- **Approval needed**: Amazon wants you approved for the brand, the category or the product first. Which one is read from Amazon's reason text.
- **Blocked**: you can't list it.
- **Unknown**: the check failed or Amazon didn't say.

A brand you've recorded as approved on the [Brands](/help/pages/brands) page (**Mark approved**) counts as open when Amazon asks for brand approval. It doesn't cover category or product approval.

## When it runs

**In the account stage**, the last step, after Keepa history and only for rows that pass the other gates. That saves restriction calls on rows already ruled out. Without SP-API set up it's skipped.

## Settings

Settings, **Gates** tab, card **11 Gating and blocks** (Needs: SP-API).

| Field | Default | What changing it does |
|---|---|---|
| Mode | **fail** | The mode for **Blocked**. **off** turns off the whole gate, approval-needed included. |
| **Approval needed counts as** | **warn** | The mode for **Approval needed**: **off** passes it ("allowed by profile"), **warn** flags it, **fail** drops it. |

"Blocked always uses the gate's mode", as the card says.

## Mode in each profile

| Profile | Blocked (gate mode) | Approval needed |
|---|---|---|
| Strict | fail | warn |
| Test order (default) | fail | warn |
| Dry goods only | fail | warn |

## Reading the why-line

| Status | Example | Meaning |
|---|---|---|
| fail / warn | Blocked for your account (brand: Nuxe): You cannot list products in this brand. | Blocked. The part after the colon is Amazon's own message. Tagged BLOCKED. |
| warn / fail | Brand approval needed (Nuxe): You need approval to list in this brand. | Brand approval. Also "Category approval needed (Beauty): …", "Product approval needed: …" or "Approval needed: …" when the kind isn't clear. Tagged APPROVAL. |
| pass | Open to list | |
| pass | Open: brand approval for Nuxe recorded as approved on 2026-08-14 | You marked the brand approved on the Brands page. Tagged BRAND_APPROVED. |
| pass | Approval needed (allowed by profile) | **Approval needed counts as** is **off**. |
| skipped | Not checked (SP-API not configured) | No SP-API credentials. |
| skipped | Restriction check failed: … | The check errored; Amazon's or the network's error follows. Or "Restriction status unknown". |
| off | Gate off in this profile | |

Next to an approval-needed or blocked why-line you get **Apply on Amazon** when Amazon gave a link, or **Check on Amazon** (Seller Central's approval page for the ASIN) when it didn't. The [Check](/help/pages/check) card shows **Apply to sell**.

Gating also feeds the Risk group of the [score](/help/concepts/score): open scores best, then unknown, then approval needed.

## What to do about it

- **Approval needed**: click **Apply on Amazon** and follow [apply for brand approval](/help/howto/apply-for-brand-approval). Once approved, **Mark approved** on the brand's page so later screens treat it as open.
- **Blocked**: usually final for your account. [Waiving the gate](/help/howto/waive-a-gate) only changes the verdict here, not what Amazon lets you list.
- To stop approval-needed rows being flagged, set **Approval needed counts as** to **off**; to drop them, **fail**. See [change a threshold](/help/howto/change-a-threshold).
