---
title: Today
summary: Your next steps across every workspace, the key numbers, and Ask Scout for questions about your own data.
synonyms: [home, dashboard, overview, start page, next steps, to do, keepa balance, ask scout, suggested actions, confirm, undo, action log]
route: /
order: 1
---
*Where: **Home → Today**, the first item in the sidebar (and the logo).*

Today is the first page you see. It lists what to do next, in order, across Wholesale, Private label, Ads and Stock, with the button that does each one. It changes nothing by itself.

## The header

The date, and **New run** (the [New run](/help/pages/new-run) page). On a narrower screen **Ask Scout** sits here too.

## Next steps

Numbered cards, the most important first (then the oldest). Each card shows its workspace and roughly how long it takes ("ADS · 5 min"), what to do, why (with the numbers behind it), and:

| Control | What it does |
| --- | --- |
| The main button | Opens the page that does it, on the right tab: for example **Add costs** opens the purchase's edit on [Stock → Purchases](/help/pages/tracker), **Review proposals** opens Ads → Proposals. |
| **Show me how** | The Help article for that job, when there is one. |
| **Later** | Hides the step for 24 hours. |
| **Done** | Hides it until its condition changes (a new import, a new proposal, another order missing a cost). A toast offers **Undo**. |

The top five show; **Show all (n)** lists the rest. When nothing's left it says **You're all caught up**, with the next dated thing (a launch milestone) if there is one.

What makes a step:

- **System**: the nightly cron failed or didn't run, Keepa under 100 tokens, SP-API not set up, failing or not synced for 48 hours.
- **Ads**: no bulk file imported since a launch started (or the last one is over 7 days old); open proposals; a launch's week-1 review (day 7), bid changes (day 14), lower target (day 28) and steady (day 49).
- **Stock**: open orders with no supplier price or landed cost (one step for all of them, oldest first: its button opens the oldest one's edit); items due or soon due a reorder.
- **Private label**: each active candidate's next action (the next launch step, order samples on a pass, fix or drop a failed gate, or the first gate with no answers); Alibaba leads scoring 60+ not yet messaged; messaged suppliers with no quote after 7 days.
- **Wholesale**: brand approvals applied for over 7 days ago; the best brand to apply for with a Buy product; Shortlist items not screened for over a week.

The steps are worked out from your data at most once a minute; anything you change in the app shows straight away.

## Key numbers

One row under the steps: **Ad spend, 7 days** (with ACoS), **Proposals**, **Candidates** in progress, **To reorder**, **Keepa tokens** and **Brands to approve** (with a Buy product). Each opens its page.

## Ask Scout

Questions about your own data ("Which suppliers haven't replied?"), answered from the app's records with the figures and links behind the answer. It's the right-hand panel on a wide screen; narrower, the header's **Ask Scout** opens it, and ⌘K → **Ask Scout…** works from any page. Under each answer: the tokens used, the cost, how many lookups and how long it took. Its lookups only read.

### Suggested actions

Scout can suggest a small action as a card under its answer. Each card says what will change and on which record (linked), with **Confirm** and **No thanks**. Nothing happens until you press Confirm on that card, and Confirm runs it once (pressing it again changes nothing). A toast then offers **Undo** for 10 seconds; Undo works for two minutes and puts the record back as it was. Only these actions can be suggested:

| Action | What Confirm does |
|---|---|
| Snooze a Today step | Later: hidden for 24 hours |
| Dismiss a Today step | Done: hidden until something behind it changes |
| Dismiss an Ads proposal | Skipped for 30 days, as on Proposals. Nothing goes to Amazon |
| Add a product to Shortlist | A screened wholesale product joins Shortlist → Products |
| Mark a supplier lead contacted | A new Alibaba lead becomes "contacted" |
| Set a candidate's next-action note | The note on the candidate's Overview (you can also type it there) |
| Open a page, pre-filtered | Opens it (nothing to undo) |

Each action is checked again when you confirm: it must still be on the list, and the record must still be as described (a step still showing, a proposal still open, a lead still new). If not, it isn't run and the reason shows.

Scout never suggests or does these, even if asked: approving or exporting Ads changes, anything that changes Amazon, deleting anything, uploads, purchases or orders, editing prices or costs, changing settings. Ask for one and it says it can't, with a link to the page where you can do it yourself.

**Action log** (under the conversation) lists what was confirmed, declined or undone, by whom (the name you signed in with) and when. Each one is also kept on the server with the record's state before it changed.
