# Screenshots & Listing Assets Checklist

Chrome Web Store requires real screenshots of the extension in action. Capture these once the extension is installed and signed in.

## Required assets

| Asset | Spec | How to produce |
| --- | --- | --- |
| Store icon (already included) | 128x128 PNG | `extension/icons/icon-128.png` — already built. |
| Promo tile (optional but recommended) | 440x280 PNG (transparent) | Open `icon-128.png`, place it on a transparent canvas with "PAP-JOY" text. |
| Marquee screenshot (optional) | 1400x560 PNG | Store homepage screenshot with a caption bar. |
| Screenshot 1 | 1280x800 or 640x400 PNG | The extension popup open, signed out (sign-in form visible). |
| Screenshot 2 | 1280x800 or 640x400 PNG | The extension popup open, signed in, showing the notifications list. |
| Screenshot 3 | 1280x800 or 640x400 PNG | The store homepage opened from the extension (tab in the background). |
| Screenshot 4 | 1280x800 or 640x400 PNG | A desktop notification bubble appearing for an order update. |
| Screenshot 5 | 1280x800 or 640x400 PNG | The toolbar icon with an unread-notification badge. |

## How to capture the popup screenshots

1. Load the unpacked extension (`chrome://extensions` → Developer mode → "Load unpacked" → select the `extension` folder).
2. Click the PAP-JOY toolbar icon.
3. Use the OS screenshot tool or Chrome DevTools device toolbar to capture the popup at its natural size.

## How to capture a desktop notification

1. Sign in, place an order (or trigger an admin update) so a notification is created.
2. Wait for the next 5-minute poll (or click "Refresh" in the popup — the background will still only create the desktop bubble on its own poll; alternatively trigger it by signing in and receiving a new notification).
3. Screenshot the notification bubble in the corner of the screen.

## Single-purpose note

The store-listing "single purpose" for this extension is: **quick access to the PAP-JOY store and delivery of account notifications.** Keep every screenshot tied to that purpose.
