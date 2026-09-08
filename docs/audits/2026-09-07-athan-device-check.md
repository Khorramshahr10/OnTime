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

### 4. Default, Adhan and Silent are three different sounds

- [ ] With **nothing downloaded**, set three prayers to **Default**, **Adhan** and **Silent**
- [ ] **Expected:** Default plays the system tone, Adhan plays the bundled Adhan Makkah recording, Silent plays nothing
- [ ] Then download an athan and select it, and set a prayer to **Adhan**
- [ ] **Expected:** it now plays your downloaded athan, not the bundled one — the downloaded athan wins
- [ ] **Fajr Adhan** has no bundled recording yet, so with nothing downloaded it behaves like Default. That is expected; see below

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

## Bundled audio — current state

`android/app/src/main/res/raw/adhan.mp3` now ships (Adhan Makkah, ~3 min 21 s), so the **Adhan** option plays a real recording with nothing downloaded. Verified as far as a desktop can: `processDebugResources` accepts it and registers `int raw adhan`, so `android.resource://com.ontimeapp.prayer/raw/adhan` resolves.

**Fajr Adhan is still not bundled**, deliberately. None of the four available recordings is a Fajr adhan — none contains *aṣ-ṣalātu khayrun minan-nawm* — and labelling a general adhan "Fajr Adhan" would repeat the promise the "(Built-in)" suffix was removed for. Until issue #17 is settled it routes to the user's downloaded Fajr athan if they have one, and to the default channel otherwise. Note Fajr **defaults** to this option, so every fresh install is affected.

To bundle one later: drop `adhan_fajr.mp3` into `res/raw`, flip `ships` for that entry in `BUILT_IN_SOUNDS` (`src/services/notificationService.ts`), and update the assertion in `notification-sound-channels.test.ts` that says no channel is created for it.

Two things worth listening for on device:

- All four source recordings are **~8 kbps**, which is low enough to sound thin at alarm volume — especially next to a downloaded athan. Worth hearing before release.
- A 3.5-minute notification sound is unusual, though the downloaded-athan feature already behaves this way, so it is at least consistent.

Swapping which recording is bundled is a one-file change: replace `res/raw/adhan.mp3`. The other candidates are Abdul-Basit, Adhan-Alaqsa and Naghshbandi in `athan-audio/`.

