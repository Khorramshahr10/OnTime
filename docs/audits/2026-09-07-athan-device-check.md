# Athan sounds — on-device check

**Date:** 2026-09-07
**Covers:** the athan/notification changes from Batch 3 of `docs/audits/2026-09-07-platform-bug-hunt.md`

Everything here was verified as far as a desktop can take it: TypeScript compiles, 287 unit tests pass, the Android Java compiles (`compileDebugJavaWithJavac`) and resources process (`processDebugResources`). What **cannot** be verified without a phone is whether Android actually plays the sounds. These are the checks to run.

---

## Read this first — Android caches channel settings

A notification channel's **sound and importance are fixed the first time the channel is created** and Android will not change them afterwards. Two consequences for testing:

1. The app's own channels (`ontime_prayer`, `ontime_prayer_silent`) are **new ids**, so they will be created fresh and pick up the right settings. No action needed.
2. The per-athan channels are **not** new — their id is `athan_main_<athanId>`, which an existing install has already created pointing at the old `file://` path. Re-selecting the same athan will not update it.

**So before testing the downloaded-athan sound, clear the old channel.** Either:

- uninstall and reinstall the app, or
- Settings → Apps → OnTime → Storage → Clear data, or
- Android system Settings → Apps → OnTime → Notifications → find the old "Athan — …" channel and delete it, then re-select the athan in the app.

Skipping this will make a working fix look broken.

---

## Checks

### 1. A downloaded athan is actually audible — the main one

This is the change most likely to be silently broken. The channel sound now goes through a `FileProvider` `content://` URI with an explicit read grant to `com.android.systemui`, because it is SystemUI — a different uid — that plays a notification sound, and since Android 11 the athans folder is app-private. A `file://` URI cannot be granted to another app at all.

- [ ] Fresh install (or cleared data, per above), Android 11 or newer
- [ ] Settings → Athan Sounds → Browse & Download → download one athan
- [ ] Tap **Preview** — does it play? (Preview runs inside the app, so it working does *not* prove the notification path works)
- [ ] Select it as the main athan
- [ ] Set one prayer's Sound to **Adhan** and its reminder to **5 min**
- [ ] Put the phone on the lock screen and wait for the notification
- [ ] **Expected:** the downloaded athan plays. **Failure mode:** the notification arrives silent, or with the generic system beep

If it fails, check `adb logcat` for a `SecurityException` or `Permission Denial` mentioning `com.android.systemui` and `com.ontimeapp.prayer.fileprovider` — that would mean the grant or the `external-files-path` entry in `res/xml/file_paths.xml` is wrong.

### 2. Silent is actually silent

"Silent" now routes to its own channel at `IMPORTANCE_LOW`, which Android plays with no sound at all. It previously posted to the same channel as everything else, so it made the same noise as Default.

- [ ] Set a prayer's Sound to **Silent**
- [ ] Wait for its notification
- [ ] **Expected:** the notification appears in the shade with no sound and no vibration
- [ ] Also confirm it still *appears* — low importance should not hide it

### 3. Prayer notifications now show a heads-up banner

The app's own channels are `IMPORTANCE_HIGH`. The plugin's default channel was `IMPORTANCE_DEFAULT`, which never shows a heads-up — so this is a visible change in behaviour, not just a fix.

- [ ] Set a prayer's Sound to **Default**
- [ ] Wait for its notification with the phone unlocked and in use
- [ ] **Expected:** a heads-up banner drops down, not just a silent entry in the shade
- [ ] Decide whether you want this. If a heads-up at every prayer is too aggressive, drop `importance` from `4` to `3` in `BUILT_IN_SOUNDS` in `src/services/notificationService.ts`

### 4. Default and Adhan sound different when an athan is selected

- [ ] With a downloaded athan selected, set two prayers to **Default** and **Adhan**
- [ ] **Expected:** Default plays the system tone, Adhan plays your athan
- [ ] Note: with **no** athan downloaded, Adhan and Default sound the same — that is intended, there is no bundled recording to fall back to (see "Still open" below)

### 5. Switching athans does not kill notifications

The order was reversed: the replacement channel is now built before the old one is retired, so a failure part-way through can no longer leave every notification pointing at a deleted channel.

- [ ] Download two athans, select the first, then select the second
- [ ] Confirm a notification for an upcoming prayer still fires and still makes a sound
- [ ] Re-select the **same** athan again — it should still work (this path deliberately does not delete the channel it just recreated)
- [ ] **Optional, hard to trigger:** with storage nearly full or an SD card removed, try selecting an athan. **Expected:** an error message appears in the Athan Sounds screen and the previous athan keeps working. Previously the tap did nothing at all and notifications silently stopped

### 6. A failed download says so

Downloads are now validated before being written.

- [ ] Turn on airplane mode mid-download, or point at a dead link
- [ ] **Expected:** a red error message, and **no** "Downloaded" pill on that entry
- [ ] Previously an HTML error page was written to disk as an `.mp3`, shown as Downloaded, and could never be retried because entries are deduped by URL

### 7. Channel names look right in system settings

- [ ] Android Settings → Apps → OnTime → Notifications
- [ ] **Expected:** channels named "Prayer times" and "Prayer times (silent)", plus one per selected athan
- [ ] The silent channel should show as low importance / no sound

---

## Still open — needs your input

**There is no bundled adhan audio.** `android/app/src/main/res/raw/` is empty, and I did not add anything to it. The four MP3s in `athan-audio/` at the repo root are untracked and I can't tell where they came from, so I was not willing to commit audio into a shipped app without knowing it is cleared for redistribution.

Until then:

- **Silent** works, with no audio file needed.
- **Adhan** and **Fajr Adhan** route to your downloaded athan if you have one, and to the system default if you don't.
- The picker labels no longer say "(Built-in)", because nothing is built in.

The mechanism is fully wired and waiting. To ship a bundled adhan:

1. Put the recordings at `android/app/src/main/res/raw/adhan.mp3` and `adhan_fajr.mp3` — lowercase, no spaces or dashes, the extension can be `.mp3` or `.wav`.
2. Flip `ships: false` to `ships: true` for `adhan` and `adhan_fajr` in `BUILT_IN_SOUNDS` in `src/services/notificationService.ts`.
3. Re-run check 4 above — with no athan downloaded, Adhan should now play the bundled recording instead of the system tone.

The `ships` flag exists because a channel pointing at a missing `res/raw` resource falls back silently, which is the exact bug this batch was fixing. The unit tests assert that no channel is created for a sound marked `ships: false`, so flipping the flag without adding the file will fail the suite.

If you would rather not bundle audio at all, the alternative is to drop the Adhan and Fajr Adhan options from `BUILT_IN_SOUND_OPTIONS` in `src/components/SettingsModal.tsx` and let the Athan Sounds page be the only way to get an adhan — but note Fajr currently *defaults* to `adhan_fajr`, so that would need a defaults change too.
