# Developer Connects Dialer (Android) - UNBUILT, UNTESTED

**Status: source only. It has never been compiled or run on a phone. REAL SIM CALLING: NOT YET VERIFIED.**

## Why this exists
A normal web page (including a PWA) cannot choose a SIM, place a call through the phone with a SIM prompt, observe call
state, or read the call duration, and cannot track anything in the background. Calling from the employee's own SIM
therefore needs a small native layer. This is the smallest one: a WebView around the website plus `window.DCDialer`.

## What the app does (and only this)
1. `startCall(callId, phone)`: dials the number the **server** returned for an attempt the **server** issued.
2. Reads the phone's own call log entry for that call (start time, duration, SIM id).
3. Keeps that report in a local outbox until the website acknowledges it.

It contains **no CRM logic**. Ownership, the 10-second rule (`> 10 s` = CONNECTED, otherwise DIALED), history, follow-ups,
analytics and the database stay in the Next.js app and PostgreSQL. The app never records audio, never touches the
microphone or contacts, and requests only `CALL_PHONE` and `READ_CALL_LOG`.

## Flow
```
tap Call -> server issues attempt (prepareMyDeviceCallAction) -> DCDialer.startCall -> phone dials (SIM chooser if the
phone is set to "ask") -> call ends -> app reads call log -> outbox -> website reports (reportMyDeviceCallAction)
-> server validates + classifies + stores + timeline -> app is told to acknowledge
```
Offline or killed app: the report stays in the outbox and is retried; the server accepts one report per call, so a retry
never double-counts.

## Near-real-time capture (no extra permission)
`MainActivity.onResume` tells the page (`dc:app-resumed`) the moment the employee comes back to the app, which is typically right
after hang-up. The page then reads `pendingReports()` immediately and again after about 1, 3 and 6 seconds, because phones write
the call-log entry a moment after the call ends. The call therefore appears on the website within about a second of returning,
not at the next 5-second poll. A live in-call timer is deliberately NOT shown: only the phone's own call-log duration is ever
recorded, never an elapsed timer that would include ringing. True in-call state (ringing / answered) would need the
READ_PHONE_STATE permission and is a separate decision.

## Limits to verify on real phones (none verified yet)
- SIM chooser appears only when the phone's setting is "Calling accounts -> Always ask".
- Call-log entry timing and what each maker counts as "duration" (voicemail greetings can count) vary by device.
- Google Play restricts `READ_CALL_LOG`/`CALL_PHONE`; distribute internally (APK/MDM) or file the permissions declaration.
- Battery-optimisation settings can stop a backgrounded WebView; the outbox makes that a delay, not a loss.
- A modified app could report a false duration. Mitigations: the server only accepts a report for an attempt it issued to
  that employee, plausibility checks, immutability triggers; app-signature / Play Integrity attestation is a future step.

## Build (when a device and Android Studio are available)
Open `native-android/` in Android Studio, let it generate the Gradle wrapper, set `START_URL`, install on a phone with a SIM,
sign in, grant the two permissions, call a lead you own, and compare the website's recorded duration with the phone's call log.
