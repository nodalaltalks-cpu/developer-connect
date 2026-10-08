# Developer Connects Dialer (Android) - UNBUILT, UNTESTED

**Status: source only. It has never been compiled against the Android SDK or run on a phone. REAL SIM CALLING: NOT YET VERIFIED.**
The Kotlin sources were syntax-checked with the Kotlin 1.9 compiler (no parse errors); they have not been type-checked against
`android.jar`, built by Gradle, or installed on a device.

## Why this exists
A normal web page (including a PWA) cannot place a cellular call through the phone, choose a SIM, or observe the call. Calling
from the employee's own SIM therefore needs a small native layer: a WebView around the website plus `window.DCDialer`.

## What the app does (and only this)
1. `startCall(callId, phone)`: places the call the **server** issued, through Android's official Telecom framework
   (`TelecomManager.placeCall`). It is an ordinary cellular call on the employee's own SIM. The app is **not** a phone/dialer
   app, has no Developer Connects phone number, and is not registered to handle `tel:` links.
2. After the call, reports what it can honestly know (below).
3. Keeps that report in a local outbox until the website acknowledges it (so a dropped connection or a killed app loses nothing).

It contains **no CRM logic**. Ownership, the 10-second rule (`> 10 s` = CONNECTED, otherwise DIALED), history, follow-ups,
analytics and the database stay in the Next.js app and PostgreSQL. The server alone classifies a call; the app never sends a
classification, and the server would ignore one.

## SIM choice
Android shows its own "Choose SIM for this call" dialog on a dual-SIM phone when "Calling accounts -> Always ask" is set. The app
does not choose a SIM for the employee: listing SIMs in-app would need `READ_PHONE_STATE`, which we deliberately do not request.
Single-SIM phones just dial.

## What can be captured, and with which permission

| Information | Needs | In `play` build | In `internal` build |
|---|---|---|---|
| Place the call | `CALL_PHONE` | yes | yes |
| That an attempt was made, and when it was dialed | nothing extra | yes | yes |
| **How long the call lasted** (needed for DIALED vs CONNECTED) | `READ_CALL_LOG`, **or** being the default Phone handler (`InCallService`) | **no** | only if the employee grants it |
| Ringing / answered live state | `READ_PHONE_STATE` or the default-dialer role | no (not requested) | no (not requested) |

There is **no way to get an accurate call length without call-log access or the default-dialer role.** Elapsed time from "dial"
to "hang up" would include ringing and would wrongly count an unanswered 30-second ring as CONNECTED, so the app never uses it.

## Two builds of the same app
`app/build.gradle.kts` defines a `distribution` dimension:

* **`internal`**: for our own team (APK or MDM, **not** Google Play). Its manifest overlay (`app/src/internal/AndroidManifest.xml`)
  declares `READ_CALL_LOG`. It is **never requested automatically**: the website explains it ("read the length of the calls you place
  from this app, and nothing else in your call history") and the employee chooses. `CallLogReader` reads only OUTGOING entries
  for numbers this app dialed.
* **`play`**: does **not declare** `READ_CALL_LOG` at all (`BuildConfig.CALL_LOG_ENABLED = false`). It places calls and reports each as
  **"attempted, length unavailable"**.

### Fallback when the length cannot be read (the `play` build, or the permission not granted)
The report carries `durationUnavailable: true`. The server records the call with **no duration and no classification**:
it is never counted as DIALED or CONNECTED, nothing is guessed, and the employee states the outcome themselves (any outcome is
allowed because there is nothing to contradict). The call is still tied to the right lead, employee and batch and appears in the
timeline and call history as "Attempted (length not recorded)".

## Google Play policy position (verified against the published policy; NOT an approval)
Google Play restricts `READ_CALL_LOG`, `WRITE_CALL_LOG` and `PROCESS_OUTGOING_CALLS`: the permitted uses are default Phone / SMS /
Assistant handling, plus a short list of **temporary exceptions** for non-default apps (account verification, anti-smishing, backup
and restore, caller ID / spam detection), each requiring a Permissions Declaration and review. The published policy pages reviewed for this
work do **not** list a CRM / enterprise exception, so **no approval is claimed and none should be assumed**.
Sources: <https://support.google.com/googleplay/android-developer/answer/9047303> and
<https://android-developers.googleblog.com/2019/01/reminder-smscall-log-policy-changes.html>. Re-check the Play Console
"Permissions Declaration Form" before any Play submission.

Consequences:
* Distribute the **`internal`** build outside Google Play (APK / MDM) to employees, with the permission as an informed opt-in.
* Ship **`play`** only with the fallback above, unless Google approves a declaration.
* The only route to accurate lengths *and* Play distribution without a declaration is becoming the default Phone app (`InCallService`,
  the dialer role). That is a much larger product decision (and changes the employee's phone), so it is **not** done here.

## Near-real-time capture (no extra permission)
`MainActivity.onResume` tells the page (`dc:app-resumed`) the moment the employee comes back to the app, typically right after hang-up.
The page then reads `pendingReports()` immediately and again after about 1, 3 and 6 seconds (phones write the call-log entry a moment after
the call ends). The call appears on the website within about a second of returning. A live in-call timer is deliberately **not** shown.

## Limits to verify on real phones (none verified yet)
- The SIM chooser appears only when the phone's setting is "Always ask".
- Call-log entry timing and what each maker counts as "duration" (voicemail greetings can count) vary by device.
- Without call-log access the app cannot tell a placed call from one abandoned at the SIM chooser; it reports "attempted" after the employee returns
  (at least 4 seconds after dialing), and the employee's outcome settles it.
- Battery-optimisation settings can stop a backgrounded WebView; the outbox makes that a delay, not a loss.
- A modified app could report a false duration. Mitigations: the server only accepts a report for an attempt it issued to that employee,
  plausibility checks, immutability triggers; app-signature / Play Integrity attestation is a future step.

## Build (when a device and Android Studio are available)
Open `native-android/` in Android Studio, let it generate the Gradle wrapper, set `START_URL`, choose the **`internalDebug`** variant for
the permission path or **`playDebug`** for the fallback path, install on a phone with a SIM, sign in, tap Call on a lead you own, and compare
the website's recorded length with the phone's call log. Physical QA checklist: single SIM and dual SIM; answered call over and under
10 seconds; unanswered call; call abandoned at the SIM chooser; permission denied; app killed during the call; offline report then reconnect.
