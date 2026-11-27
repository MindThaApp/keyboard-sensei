# Privacy policy text for Music Portal

This is the full policy text for the Music Portal release, ready to move into
`apps/web/src/components/legal/PrivacyPage.tsx` (which is app code, so it is
not edited here). It starts from the current Midivory policy and changes only
what Music Portal changes: the name, the new instruments, and the microphone.
Set the "Last updated" date to the release date. Contact email for the policy
and the store listings: mindthaapp@gmail.com.

Changes from the current policy, so a reviewer can find them quickly:

- Name: Midivory becomes Music Portal ("formerly Midivory", kept for at least
  two releases).
- New section "Microphone".
- "We never use your microphone" is removed from "Things you add".
- "What we store" lists the extra practice data from microphone lessons.
- Crash reports: audio is named explicitly as never included.
- "Children": app name only.

---

# Privacy policy

Last updated [release date]

Music Portal (formerly Midivory) is an app for learning piano, guitar and
violin. This page explains, in plain English, what we store about you, why, who
else sees any of it, and how to delete it. We don't sell your data, show ads,
or use analytics or tracking tools. The only diagnostic tool is the anonymous
crash reporting described below, which you can turn off.

## Microphone

Some features use your device's microphone: lessons that listen to you play,
the tuner and Piano check.

- **Everything is processed on your device.** Music Portal analyses the sound
  in memory to work out which notes you played, how in tune they were and
  when. It then discards the sound.
- **Nothing is recorded, saved or uploaded.** No audio ever leaves your device.
  No audio reaches our servers, our crash reports or any other company.
- **Only the result is kept.** For a graded exercise, the app sends the same
  kind of information it sends for a MIDI keyboard: which notes you played
  (and, for microphone lessons, how many cents sharp or flat each was), when,
  and the score. For a guitar chord it sends the chord it recognised, not the
  sound. Tuner readings and Piano check measurements are shown on your device;
  Piano check reports can be saved on your device and, if you choose, to your
  account. A report holds note names and cent deviations, never audio.
- **You are asked first.** We request microphone access only when you open a
  lesson that needs it, the tuner or Piano check, and we explain why before
  your device shows its own permission prompt.
- **You stay in control.** If you say no, or switch the permission off later in
  your device settings, everything that uses a MIDI keyboard or the on-screen
  instruments still works. You can turn the permission on again in your
  device's settings at any time.

## What we store

### Your account

- Your email address and the display name you choose.
- Your password, stored only as a one-way hash (bcrypt). We can't read it. If
  you sign in with Google instead, we store your Google account ID, plus the
  email address and name Google shares with us.
- Whether and when you confirmed your email address.
- Your settings: daily practice goal, preferred narration voice, the
  instrument you play, your tuner reference pitch and custom tunings, and your
  time zone (so "today" and streaks follow your own midnight).

### Your practice

- The notes you play in exercises, from a MIDI keyboard or the microphone
  (which note, how hard or loud, how sharp or flat, and when), so they can be
  scored, along with the score. The microphone never sends sound, only these
  notes.
- Quiz answers, lesson progress and best scores.
- Play-along runs: score, accuracy, speed and the practice settings you used.
- Experience points, achievements, and how many minutes you practised each day.
- How many characters of lesson narration you requested each day (to enforce a
  fair-use limit).

### Things you add

- MIDI files you upload, and the web address if you import one from a link.
- Recordings you choose to save. These are MIDI note data from your keyboard,
  not audio.
- Pieces you import from the public piano archive, on servers that offer it.
- Instrument sounds you upload.
- Feedback you send: the message, the page you were on, your browser's
  user-agent string (browser and device type), and a screenshot if you attach
  one. A copy also goes to Sentry (see Crash reports).

Your uploads, recordings and imports are private to your account. Other users
can't see them.

### On your device

The app keeps your sign-in token and some preferences (theme, practice and
metronome settings, keyboard range, audio latency, microphone set-up, chosen
instrument and tuner settings) in your device's local storage. We don't use
cookies.

### Technical logs

Like any website, our servers handle your IP address to deliver pages. We use
it briefly in memory to limit repeated sign-in attempts. It isn't saved with
your account. Our web servers may keep short-lived technical logs (time, page
requested, browser type) for troubleshooting.

### Crash reports

When the app or our server hits an unexpected error, a technical report can be
sent to our error monitor, Sentry. A report contains the error message and
where in the code it happened, the app version, your browser or device type
and operating system, the page you were on and the steps leading up to the
error. It can also carry your internal account number (not your email address
or name), so we can tell whether one person or many are affected. It never
includes your IP address, email address, name, password, sign-in token, the
notes you play, any sound from your microphone or any recordings: we strip
those out before anything is sent, and reports travel through our own server,
so Sentry doesn't see your address either. If you send feedback, we also pass
that feedback (and the screenshot, if you attach one) to Sentry so it can be
matched to the error.

On the website, crash reports are on by default and you can turn them off in
Settings → Account → Crash reports. The Android app asks you once, the first
time you open it, and you can change your answer in the same place. The choice
is stored on your device only. Reports are stored in the EU (Frankfurt) and
kept for 90 days.

## Why we use it

- To run your account and sign you in.
- To score your playing, track your progress, and show streaks, stars and
  achievements.
- To send emails you ask for: password resets and email confirmation. We don't
  send marketing email.
- To read and act on feedback you send.
- To keep the service secure and prevent abuse.
- To find and fix crashes and bugs.

## Who else is involved

- **ElevenLabs** turns lesson text into spoken narration. We send it the
  lesson text and the chosen voice only, never your name, email, sound or
  anything about you. Each narrated section is generated once and then reused
  for everyone.
- **Voice previews** in Settings play sample clips that ElevenLabs hosts on
  Google Cloud Storage. Your browser fetches them directly, so Google's
  servers see your IP address when you press play.
- **Google**, if you choose "Sign in with Google". Google's sign-in script
  loads on the sign-in page and Google tells us your account ID, email address
  and name. Google's own privacy policy covers what happens on their side.
- **Sentry** (Functional Software, Inc.), hosted in its EU region, receives
  the crash reports described above and the feedback you send. It acts on our
  behalf and stores them for 90 days. Sentry's own privacy policy covers its
  side.
- **Our email provider** delivers password-reset and confirmation emails, so
  it handles your email address and the message.
- **Cloudflare** carries traffic to the public website, so it handles your IP
  address and the requests your browser makes.
- **Importing from a link or the piano archive:** our server downloads the
  file for you, so the other site (or Hugging Face, which hosts the archive)
  sees our server's request, not yours.
- **App stores.** If you get Music Portal from Google Play or the Microsoft
  Store, the store tells us nothing about you beyond what it needs to deliver
  the app, and its own privacy policy covers what it collects.

We don't share your data with anyone else, and we don't sell it.

## How long we keep it

We keep your data while you have an account. When you delete your account,
everything listed above is removed from our database straight away, along with
your uploaded files. Backups made before the deletion are kept for up to 14
days and then deleted. Microphone sound is never kept at all: it is discarded
as soon as it has been analysed.

## Your choices and rights

- Change your name, password and settings in Settings.
- Turn the microphone permission on or off in your device's settings.
- Delete your account and data at any time: Settings → Account → Delete
  account, or on the delete account page without signing in.
- Ask for a copy of your data, or ask us anything about this policy, by
  emailing mindthaapp@gmail.com.

## Children

Music Portal isn't directed at children under 13. If a younger child wants to
learn, a parent or guardian should create and manage the account. If you think
a child under 13 has given us personal data, email us and we'll delete it.

## Security

Connections to the app are encrypted (HTTPS). Passwords are hashed, and
password-reset links work once and expire after 30 minutes. No system is
perfectly secure, but we work to protect your data.

## Changes

If we change this policy we'll update this page and the date at the top. If a
change is significant, we'll tell you in the app.

## Contact

mindthaapp@gmail.com
