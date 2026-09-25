---
title: Set up the Chrome extension
summary: Install the Wholesale Scout extension in Chrome, connect it to your app and check that it works.
synonyms: [install extension, load unpacked, chrome, connect extension, app password, plugin]
order: 6
---
This guide installs the Wholesale Scout extension in Chrome and connects it to your app. After that you'll see verdicts on Amazon UK product and search pages. To learn what each part of the extension does, see [Chrome extension](/help/pages/extension).

## Before you start

You need:

- Google Chrome on a computer.
- The app's code on that computer. The extension lives in its `extension/` folder.
- Your app's address, for example `https://wholesale-scout.vercel.app` (or `http://localhost:3000` if you're running it locally).
- The app's password: the value of `APP_PASSWORD`, which is the same password the app asks you for.

## Install it

1. In Chrome, go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension/` folder.
4. Pin it: click the puzzle-piece icon in the toolbar, then the pin next to **Wholesale Scout**.

## Connect it to your app

1. Click the Wholesale Scout icon in the toolbar to open its settings.
2. Enter the **App URL**. If you leave off "https://" it's added for you.
3. Enter the **APP_PASSWORD**.
4. Leave **Seller Central DG page**, **Check product pages automatically** (on) and **Show debug** (off) as they are for now.
5. Click **Save**. Chrome asks to allow access to the app's address. Allow it.
6. Click **Test connection**. It should say "Connected: the app accepted the password."

If it doesn't:

| Message | What to do |
|---|---|
| "Wrong password" | Check the password against `APP_PASSWORD`. |
| "Couldn't reach …" | Check the App URL. If it's a new address, click **Save** again and allow access. |
| "Allow access to the app's address to connect." | You declined Chrome's permission request. Click **Save** again and allow it. |
| "That isn't a URL." | The App URL couldn't be read as an address. |

The password is kept on this computer only and is sent only to your app.

## Try it

1. Open any product page on amazon.co.uk. The panel appears on the right and checks the product. The first check of an ASIN is a check run in the app and can use a few Keepa tokens. See [Keepa tokens](/help/concepts/keepa-tokens).
2. Search for something on amazon.co.uk. Each result gets a badge: a verdict for products the app already knows, and a grey "?" for the rest.

## Choose how it behaves

- To stop every product page spending tokens as it opens, turn off **Check product pages automatically**. The panel then shows a **Check** button, and nothing happens until you click it.
- If Seller Central shows you the dangerous-goods classification on a different page from the default product search, paste that page's address into **Seller Central DG page**, using `{asin}` where the ASIN goes.
- Turn on **Show debug** only when the competitor stock reader fails and you want to copy what Amazon sent back.

Click **Save** after changing any of these.

## Keep it up to date

After you pull a new version of the app's code, go to `chrome://extensions` and click the reload arrow on the Wholesale Scout card. Your settings are kept.
