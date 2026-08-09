# PAP-JOY Chrome Extension (Manifest V3)

Official browser companion for the PAP-JOY premium footwear store: one-click access plus desktop notifications for order updates, back-in-stock alerts and price drops.

## Structure

```
extension/
├── manifest.json        Manifest V3 (valid for Chrome Web Store)
├── background.js        Service worker: 5-minute alarm, badge + desktop notifications
├── popup.html           Popup UI
├── popup.css            Popup styles
├── popup.js             Sign-in, notification list, open-store
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
├── DESCRIPTION.txt      Store listing short + long description (paste into Web Store)
├── PRIVACY.md           Privacy policy text + store-listing disclosure answers
├── PERMISSIONS.md       Permission-by-permission justification (paste into Web Store)
├── SCREENSHOTS.md       Screenshot checklist for the listing
└── README.md            This file
```

## Test locally (load unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension` folder.
4. Click the PAP-JOY icon → sign in with your store account → "Open Store".

## Package for the Chrome Web Store

```powershell
Compress-Archive -Path "extension\*" -DestinationPath "papjoy-extension-1.0.0.zip" -Force
```

The ZIP must contain `manifest.json` at the root (it does, because we zip the folder contents). A ready-made ZIP is also produced in `release/papjoy-extension-1.0.0.zip`.

## Submit to the Chrome Web Store

1. Go to https://chrome.google.com/webstore/devconsole and **Add new item**.
2. Upload `release/papjoy-extension-1.0.0.zip`.
3. Fill in the description from `DESCRIPTION.txt`.
4. Add screenshots per `SCREENSHOTS.md`.
5. In **Privacy practices**, enter the answers from `PRIVACY.md` and set the Privacy Policy URL (host `PRIVACY.md` text at a public URL, e.g. `https://papjoy-project.onrender.com/privacy.html`).
6. Paste the permission explanations from `PERMISSIONS.md` into the "single purpose / permissions" fields.
7. Publish.

## Versioning

Bump `version` in `manifest.json` before every upload (e.g. `1.0.1`).
