# PAP-JOY Chrome Extension — Permissions Explained

Chrome Web Store requires each permission to be accompanied by an explanation of why it is needed. This document lists every permission requested by the extension.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Saves your sign-in session token and the "last seen" notification timestamp using `chrome.storage.local`, so the badge and desktop notifications work across browser restarts. |
| `alarms` | Wakes the background service worker on a timer (every 5 minutes) to check the PAP-JOY API for new notifications. |
| `notifications` | Shows desktop notification bubbles for order updates, back-in-stock alerts and price drops. |

## Host permissions

| Host | Why it is needed |
| --- | --- |
| `https://papjoy-project.onrender.com/*` | Allows the extension to call the PAP-JOY API (`/api/v1/auth/login`, `/api/v1/notifications`) to sign you in and fetch your notifications. |

## What the extension does NOT use

- No `cookies`, `tabs` (for reading tab data), `webRequest`, `proxy`, `history`, or `scripting` permissions.
- No background data collection, analytics, or advertising.
- It cannot read or modify the content of any website.

## Data handling summary

1. **What is stored:** your email address, display name (shown to you in the popup) and a sign-in token, kept only in `chrome.storage.local` on your device.
2. **What is sent over the network:** the sign-in credentials (only to the PAP-JOY API) and the token (only to the PAP-JOY API).
3. **What is never done:** your data is never sold, shared, or sent to any third party. Signing out or uninstalling the extension removes the stored session.
