# TRiBE Stock — phone app

This folder is the **staff stock-take app** for iPhone and Android. The public
restaurant website stays in the Next.js project at the repo root (`/` and
`/app` in the browser). Both talk to the same database.

## Run it

1. Start the website/API from the repo root (the phone app calls it):

```bash
cd .. 
npx next dev --port 3111 --hostname 0.0.0.0
```

2. Start Expo in this folder:

```bash
npm start
```

3. Open it on your phone with the **App Store Expo Go** app (this project is
   SDK 54, which is the version Apple still ships). On **iPhone**, there is no
   Scan button in Expo Go — open the **Camera** app, point it at the QR code in
   the Mac terminal, then tap **Open in Expo Go**. On **Android**, tap
   **Scan QR code** inside Expo Go.

### Pointing the app at your computer

Simulators can use `localhost`. A real phone cannot — set this to your Mac’s
LAN address before `npm start`:

```bash
export EXPO_PUBLIC_API_URL="http://192.168.1.10:3111"
npm start
```

Find the IP with `ipconfig getifaddr en0` on macOS.

Demo login is the same as the website: `valletta@tribemalta.com` / `tribe1234`.

## What it does

Sign in, count bar or kitchen stock (section lists, checkmarks, progress,
submit), browse inventory by section, add products, and record supplier
deliveries. Counts update the same live stock as the website.

The phone app now covers the same staff work as the website: dashboard,
bar/kitchen counts, optional shelf photos, CSV share after submit, inventory,
deliveries, add product with picture, and (for super admins) outlets, team and
outlet switching.
