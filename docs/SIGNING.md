# Release Signing Setup

## Why signing matters

Android requires every release build to be signed with a cryptographic key. The Play Store ties your app to this key permanently — every update must be signed by the **exact same key**. Losing the key means losing the ability to push updates; you'd have to publish a new app listing and ask users to migrate.

## Where the key lives

The signing key is **never committed to the repository**. It lives on the maintainer's machine (and should be backed up to a password manager or secure offline storage). The path is referenced from `android/keystore.properties`, which is also gitignored.

Both `*.keystore` files and `keystore.properties` are already covered by `.gitignore` — do not add them to version control.

## Creating a release key (first time only)

Run this command and follow the prompts:

```bash
keytool -genkey -v \
  -keystore ~/keystores/ontime-release.keystore \
  -alias ontime \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Save the password in a secure place. You will need it for every release.

## Setting up keystore.properties

Create `android/keystore.properties` at the project root (inside the `android/` directory):

```
storeFile=/absolute/path/to/ontime-release.keystore
storePassword=your-store-password
keyAlias=ontime
keyPassword=your-key-password
```

All four keys are required. If any are missing or the file doesn't exist, release builds will fall back to the debug keystore and log a warning.

## Verifying the setup

From the `android/` directory:

```bash
./gradlew :app:bundleRelease
```

If `keystore.properties` is correctly configured, you'll get a signed AAB at:

```
android/app/build/outputs/bundle/release/app-release.aab
```

If configuration is missing or incomplete, Gradle prints a warning and falls back to the debug keystore — those builds are **not** suitable for Play Store upload.

## Play App Signing (recommended)

Google's Play App Signing is the modern approach: Google holds the production signing key, and you sign uploads with a separate **upload key**. If the upload key is ever lost, Google can reset it without losing the ability to update your app.

To enroll: Play Console → App integrity → App signing. After enrolling, the upload key is what `keystore.properties` should reference. Out of scope for this PR, but worth enabling as a next step.

## CI builds

CI should never have signing material checked into the repo. Instead, store credentials in your CI's secret manager and write them to `android/keystore.properties` as a build step:

```bash
echo "storeFile=$KEYSTORE_FILE" > android/keystore.properties
echo "storePassword=$KEYSTORE_PASSWORD" >> android/keystore.properties
echo "keyAlias=$KEY_ALIAS" >> android/keystore.properties
echo "keyPassword=$KEY_PASSWORD" >> android/keystore.properties
```

The `.keystore` file itself should be injected via a CI secret (e.g., base64-encoded and decoded at build time into a temporary path).