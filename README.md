# Installing an APK via USB (Android Developer Mode)

A step-by-step guide to sideloading an APK directly from your computer to an Android device over USB.

---

## Prerequisites

- An Android phone or tablet
- A USB cable (data cable, not a charge-only cable)
- A computer running Windows, macOS, or Linux
- The `.apk` file you want to install
- ADB (Android Debug Bridge) installed on your computer

---

## Step 1 — Install ADB on your computer

### Windows

1. Download the [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools) ZIP from Google.
2. Extract the ZIP to a folder, e.g. `C:\adb`.
3. Add that folder to your system PATH:
   - Search **Environment Variables** in the Start menu.
   - Under **System variables**, select **Path** → **Edit** → **New**.
   - Paste `C:\adb` and click OK.
4. Open **Command Prompt** and verify:
   ```
   adb version
   ```

### macOS

Using Homebrew:
```bash
brew install android-platform-tools
```

Verify:
```bash
adb version
```

### Linux (Debian/Ubuntu)

```bash
sudo apt update && sudo apt install adb
```

Verify:
```bash
adb version
```

---

## Step 2 — Enable Developer Mode on your Android device

> **Note:** The exact menu names vary slightly between manufacturers (Samsung, Pixel, Xiaomi, etc.) but the steps are the same.

1. Open **Settings**.
2. Scroll down to **About phone** (sometimes inside **General management**).
3. Find **Build number**.
4. Tap **Build number 7 times** in quick succession.
   - You will see a countdown: *"You are now X steps away from being a developer."*
   - After the 7th tap: *"You are now a developer!"*
5. Go back to **Settings** — a new **Developer options** menu has appeared (usually just above **About phone** or inside **System**).

---

## Step 3 — Enable USB Debugging

1. Open **Developer options**.
2. Toggle **Developer options** ON at the top of the screen.
3. Find **USB debugging** and toggle it ON.
4. Tap **OK** on the confirmation dialog.

---

## Step 4 — Connect your phone to the computer

1. Plug the USB cable into your phone and computer.
2. On your phone, pull down the notification shade — tap the **USB** notification.
3. Change the connection mode from **Charging** to **File Transfer (MTP)**.
   - On some devices this appears as **USB controlled by: This phone** — switch it to **Connected device**.
4. Your phone will show a dialog:

   > **Allow USB debugging?**
   > The computer's RSA key fingerprint is: `XX:XX:XX:...`

5. Tap **Allow** (check **Always allow from this computer** to avoid this prompt in future).

---

## Step 5 — Verify ADB can see your device

Open a terminal / command prompt and run:

```bash
adb devices
```

Expected output:

```
List of devices attached
XXXXXXXXXXXXXXXX    device
```

If you see `unauthorized` instead of `device`, unplug and replug the cable, then accept the USB debugging prompt on the phone again.

If no device appears, try a different USB port or cable.

---

## Step 6 — Install the APK

Run the following command in the frontend folder:

```bash
npx expo run:android --device
```

Choose your phone as the selected device. It will take a while to download.

## Step 7 — Allow installs from unknown sources (if prompted)

When you first open the sideloaded app, Android may block it:

> **"Install blocked — for your security, your phone is not allowed to install unknown apps from this source."**

To allow it:

1. Tap **Settings** in the prompt, or go to **Settings → Apps → Special app access → Install unknown apps**.
2. Find the app you used to trigger the install (usually **Files** or **Package installer**).
3. Toggle **Allow from this source** ON.
4. Go back and open the app again.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `adb: command not found` | ADB is not in your PATH — revisit Step 1 |
| `no devices/emulators found` | Accept the USB debugging prompt on the phone; try a different cable |
| `unauthorized` | Revoke USB debugging authorisations in Developer options and reconnect |
| `INSTALL_FAILED_VERSION_DOWNGRADE` | Add the `-d` flag to allow downgrade |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Uninstall the existing version first: `adb uninstall com.your.package` |
| Device shows as `offline` | Run `adb kill-server && adb start-server`, then reconnect |
| Windows: device not detected at all | Install the manufacturer's USB driver (Samsung, Xiaomi, etc.) |

---

## Uninstalling via ADB

To remove an app by its package name:

```bash
adb uninstall com.example.yourapp
```

To find the package name of an installed app:

```bash
adb shell pm list packages | grep keyword
```

---

## Security note

Disable **USB debugging** after you are done to prevent unauthorised access to your device when plugging into untrusted USB ports.

**Developer options → USB debugging → OFF**