---
title: Apply for brand approval
summary: Use the Apply links to request approval in Seller Central, then record it on the Brands page so runs treat the brand as open.
synonyms: [ungate, ungating, apply to sell, gated brand, restricted brand, approval needed, brand approval]
order: 3
---
Some brands and categories are gated: Amazon wants you to request approval before you can list them. The app finds this with the [Gating and blocks](/help/gates/gating) gate and gives you a link to apply. Applying happens in Seller Central; the app keeps track of where you are.

## Find what needs approval

- **In a run**: the Gating and blocks gate says, for example, "Brand approval needed (Nuxe): …" with Amazon's reason. By default this is a warning, so the row stays in. Change **Approval needed counts as** on [Settings](/help/pages/settings) → **Gates** if you want it to fail instead.
- **On the Brands page**: filter by **Approval needed** to see every brand you'd need approval for, with how many products pass or warn on your default profile. See [Brands](/help/pages/brands).
- **In the Chrome extension**: the product panel shows gating with Amazon's Apply link.

The gate needs SP-API with your seller ID (SPAPI_SELLER_ID). Without it the gate is skipped: "Not checked (SP-API not configured)". See [Add an environment variable](/help/howto/add-an-env-var).

## Apply

1. Click the link next to the gate's why-line in the row's details:
   - **Apply on Amazon ↗** appears when Amazon's answer included an apply link.
   - **Check on Amazon ↗** appears when it didn't. It opens Seller Central's approval-request page for that ASIN (`sellercentral.amazon.co.uk/hz/approvalrequest/restrictions/approve?asin=…`), so every restricted row has somewhere to click.
   On the Brands page the same link is the small arrow next to the gating badge, and on a brand's own page it's the **Apply on Amazon** button.
2. Follow Amazon's steps in Seller Central. Brands often ask for invoices from an authorised distributor for a set number of units.

## Record where you are

Open the brand's page from [Brands](/help/pages/brands). Under **Your approval**:

| Control | What it does |
|---|---|
| Status | **Not applied**, **Applied**, **Approved** or **Refused**. Changing it saves straight away and sets the date to today if none is set. |
| **Requirement** | What Amazon asked for, e.g. "3 invoices, 30 units". |
| Date | When the status last changed. |

**Mark approved** at the top of the page is a shortcut for Approved with today's date.

What each status does:

- **Applied**: the brand shows as **Applied** on the Brands page. Screening is unchanged.
- **Approved**: when Amazon says brand approval is needed, the gate now passes: "Open: brand approval for Nuxe recorded as approved on 2026-09-25". The brand shows as **Approved**. This takes effect the next time a run is screened or re-screened.
- **Refused**: the brand shows as **Blocked** on the Brands page. Screening is unchanged.

A brand you've marked approved still fails or warns when Amazon says the listing needs **category** or **product** approval, or when it's blocked outright. Those need their own approval.

## After Amazon approves you

Marking the brand **Approved** is enough for brand approval: re-screen the run and the gate passes. A re-screen reuses the gating answer Amazon gave when the row was first checked; it doesn't ask again. A new run (a new upload, pull or check) asks Amazon afresh, so it picks up category or product approvals too.
