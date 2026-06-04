# Build hardening — keystore signing done right

## Spec

Fix the Android signing configuration so that the build fails loudly when keystore credentials are missing, rather than silently falling back to a hardcoded path with empty passwords. Document the proper signing setup so future contributors don't have to guess.

## Problem

`android/app/build.gradle` currently has this block:

```gradle
storeFile file(keystoreProperties['storeFile'] ?: '../ontime-release.keystore')
storePassword keystoreProperties['storePassword'] ?: ''
keyAlias keystoreProperties['keyAlias'] ?: ''
keyPassword keystoreProperties['keyPassword'] ?: ''
```

Three problems:
1. If `keystore.properties` is missing, every value becomes the empty fallback. Gradle will still attempt a release build, which can produce an AAB signed with an empty-string password — a broken build that's hard to diagnose.
2. The hardcoded fallback path `../ontime-release.keystore` is misleading — if a file with that name happens to exist in `android/`, the build "works" but signs with whatever's in that file.
3. There's no documentation telling a new contributor how to set up signing, so they'll inevitably commit a wrong file or push a broken build.

The `.gitignore` already covers `*.keystore` and `keystore.properties` correctly. That part is OK — don't change it.

## Fix

### 1. Edit `android/app/build.gradle`

Replace the existing top-of-file `keystoreProperties` block + `signingConfigs.release` block with this approach:

- Only define `signingConfigs.release` if `keystore.properties` exists AND contains all four required keys (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`).
- If any are missing or `keystore.properties` itself is missing, do NOT define a release signing config. The release build will then fall back to the debug signing config (which Gradle generates automatically and is suitable only for local testing).
- Print a clear message to the build log explaining what's happening.

Concretely:

```gradle
apply plugin: 'com.android.application'

// Read signing properties only if the file exists and has all required keys.
// Otherwise, leave signingConfigs.release undefined so release builds fall back
// to the debug keystore (suitable for local testing, NOT for Play Store uploads).
def keystorePropertiesFile = rootProject.file("keystore.properties")
def releaseSigningConfigured = false
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    def required = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']
    def missing = required.findAll { !keystoreProperties[it] }
    if (missing.isEmpty()) {
        releaseSigningConfigured = true
    } else {
        logger.warn(
            "OnTime: keystore.properties is missing key(s) ${missing}. " +
            "Release builds will use the debug keystore and are NOT suitable for Play Store upload."
        )
    }
} else {
    logger.warn(
        "OnTime: keystore.properties not found. Release builds will use the debug keystore " +
        "and are NOT suitable for Play Store upload. See docs/SIGNING.md to set up release signing."
    )
}

android {
    namespace = "com.ontimeapp.prayer"
    compileSdk = rootProject.ext.compileSdkVersion
    if (releaseSigningConfigured) {
        signingConfigs {
            release {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    defaultConfig {
        applicationId "com.ontimeapp.prayer"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 8
        versionName "1.6"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        aaptOptions {
            ignoreAssetsPattern = '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
        }
    }
    buildTypes {
        release {
            if (releaseSigningConfigured) {
                signingConfig signingConfigs.release
            }
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

Keep the rest of the file (repositories, dependencies, capacitor.build.gradle apply, google-services try/catch) exactly as it is. Only modify the top portion through the closing of the `android { ... }` block as shown above.

### 2. Create `docs/SIGNING.md`

A concise contributor-facing doc that covers:

- **What signing is and why it matters** (1 short paragraph): Android requires release builds to be signed by the same key for every update. Losing the key means losing the ability to push updates.
- **Where the key lives**: NOT in the repo. Stored locally on the maintainer's machine and (recommended) backed up to a password manager. The path is referenced from `keystore.properties` (which is also NOT in the repo).
- **How to create the key for the first time** (only relevant if you don't have one): the `keytool` command:
  ```
  keytool -genkey -v -keystore ~/keystores/ontime-release.keystore -alias ontime -keyalg RSA -keysize 2048 -validity 10000
  ```
  Follow the prompts. Save the password somewhere safe.
- **How to set up `keystore.properties` for a release build**: create `android/keystore.properties` with:
  ```
  storeFile=/absolute/path/to/ontime-release.keystore
  storePassword=...
  keyAlias=ontime
  keyPassword=...
  ```
  Both `keystore.properties` and `*.keystore` are already in `.gitignore`.
- **How to verify the setup is correct**: run `./gradlew :app:bundleRelease` from `android/`. If `keystore.properties` is correctly set up, you'll get a signed AAB at `android/app/build/outputs/bundle/release/app-release.aab`. If it's missing or incomplete, Gradle will print a warning and fall back to the debug keystore.
- **Play App Signing (recommended for the future)**: a brief note that Google's Play App Signing is the modern approach — Google holds the production signing key, developer signs with an upload key. If the upload key is ever lost, Google can reset it. OnTime can opt in via Play Console → App integrity → App signing. After enrolling, the "upload key" is what `keystore.properties` references. Out of scope for this PR but flagged as next step.
- **CI builds**: a short paragraph noting that CI should read these values from environment variables / repository secrets and write them to `keystore.properties` at build time, never check anything signing-related into the repo.

Keep it under 100 lines. Code blocks for commands. No marketing/fluff.

### 3. No source code changes

Don't touch any other file. No tests for this PR (it's a build config + docs change). The verification is "does `./gradlew :app:bundleRelease` still work for the maintainer with their existing keystore.properties?" — that's a manual check, not an automated one.

## Files in scope

- android/app/build.gradle
- docs/SIGNING.md
