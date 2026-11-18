# Spot

Spotting sessions for film sound, as a Mac app. Each project is a `.spot` file.

- `src/spot.html` – the app (same source as the web version)
- `src/ptx.js` – reads Pro Tools sessions (.ptx); a JavaScript port of libptformat (LGPL 2.1)
- `src/desktop.js` – the Mac layer: project files, menus, native save dialogs
- `src-tauri/` – the app shell (Tauri)
- `.github/workflows/build-mac.yml` – builds `Spot.dmg` for Intel and Apple-silicon Macs on every push

## Files

- Projects are saved as you work to `~/Documents/Spot/<film title>.spot`. The file is renamed when the title changes.
- **File > Save As…** moves a project anywhere (an external drive, iCloud Drive). Spot then saves it there.
- **File > Open…** opens a `.spot` file or a backup `.json` from the web version. Double-clicking a `.spot` file in Finder opens it too.
- **Remove from list** never deletes the file.
- Settings and the project list live in `~/Library/Application Support/com.jonathanpepe.spot`.

## Getting the installer

Every push to `main` builds `Spot.dmg`. Download it from the latest run under **Actions**, or from the `installer` branch.

The app is not notarised by Apple. The first time, right-click Spot in Applications and choose **Open**, then **Open** again.

## Differences from the web version

The Mac app works offline. Reading PDF and Word notes with Claude is only in the web version; the app reads lines and tables that carry timecodes.
