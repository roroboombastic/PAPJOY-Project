# Privacy Policy & Data-Use Disclosures — PAP-JOY Chrome Extension

*Last updated: August 2026*

This policy describes how the PAP-JOY Chrome Extension ("the extension") handles data. This document should be hosted at a public URL and that URL entered in the Chrome Web Store item's "Privacy Policy" field. It also serves as the text for the store's "Privacy practices" disclosures.

## 1. Data collected

The extension collects only what is necessary for its core function:

- **Account credentials (email address and password):** collected when you sign in from the popup. They are sent over HTTPS only to the PAP-JOY API to authenticate your account. Passwords are never stored by the extension.
- **Session token:** after a successful sign-in, a sign-in token is stored locally in your browser using `chrome.storage.local`. It is sent only to the PAP-JOY API to fetch your notifications. It is not accessible to any website, other extension, or third party.
- **Display name and email:** retrieved from your account and shown to you inside the popup.

## 2. Data transmitted

- Sign-in credentials and the session token are transmitted only to `https://papjoy-project.onrender.com` (the PAP-JOY API), over encrypted HTTPS.
- The extension makes no other network requests. It performs no analytics, no advertising, and no third-party data sharing.

## 3. Data stored

- The extension stores your sign-in session (token + display name + email) and a "last seen notification" timestamp in `chrome.storage.local` on your device.
- Data is removed when you click **Sign out**, or when the extension is uninstalled.

## 4. Use of data

Your data is used solely to:
- Sign you in to your PAP-JOY account.
- Retrieve and display your notifications.
- Show desktop notifications for order updates, back-in-stock alerts, and price drops.

## 5. Permissions

The extension requests only the minimum permissions required to function:

- **storage** — to persist your session locally.
- **alarms** — to poll for new notifications on a timer.
- **notifications** — to display notification bubbles.
- **Host permission for `https://papjoy-project.onrender.com/*`** — to call the PAP-JOY API.

## 6. Data sharing / sale

PAP-JOY does not sell, rent, or trade your personal data to any third party.

## 7. Retention

Sign-in data is kept on your device until you sign out or uninstall the extension. Account and order data stored on PAP-JOY servers is governed by the PAP-JOY store privacy policy.

## 8. Contact

For questions about this policy or your data, contact the PAP-JOY store team via the contact details provided on the store website.

## 9. Store-listing disclosure answers (for the "Privacy practices" form)

| Question | Answer |
| --- | --- |
| Does this extension comply with the Single Purpose Policy? | Yes — quick access to the store plus account notifications. |
| Data usage — Email | Yes (for signing in). |
| Data usage — Personally identifiable information | Yes (name/email shown in popup, as described above). |
| Data usage — Authentication information | Yes (password processed transiently for sign-in only; not stored). |
| Data usage — Location | No. |
| Data usage — Web history | No. |
| Data usage — Website content | No. |
| Data usage — Financial & payment information | No. |
| Data usage — Health information | No. |
| Remote code | No — no remote code is executed. |
| Data collection by third parties | No. |
| Use of cookies | No — the extension does not read or set cookies. |
