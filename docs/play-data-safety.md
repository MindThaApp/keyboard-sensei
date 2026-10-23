# Play Console: Data safety answers

A filled-in answer sheet for Play Console → App content → Data safety. It is
derived from the same inventory as the in-app privacy policy
(`apps/web/src/components/legal/PrivacyPage.tsx`): the Prisma schema
(`apps/api/prisma/schema.prisma`) for what is stored, and the code that talks to
other services (`apps/api/src/tts.ts`, `mailer.ts`, `google.ts`, `archive.ts`,
`songs.ts`) for what leaves the server. If either changes, update both.

It assumes the public deployment: `PUBLIC_CATALOGUE=true` (piano archive off),
HTTPS through Cloudflare, SMTP configured, Google sign-in optional.

## Overview questions

| Question | Answer | Notes |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | HTTPS only: Cloudflare's certificate in public, Caddy's internal CA on the LAN. The Android app loads from `https://localhost` and calls the API over HTTPS |
| Do you provide a way for users to request that their data is deleted? | **Yes** | In-app (Settings → Account → Delete account) and on the web without signing in: `https://<your domain>/delete-account`. Use that URL for the "Delete account URL" field |
| Account creation methods | Username/email + password; Google sign-in (if enabled) | |
| Has your app undergone an independent security review (MASA)? | No | |

## Data types

"Collected" means it leaves the device and is stored on our server. Nothing is
**shared** in Play's sense: no user data goes to a third party. Service providers
acting for us (the email provider, Cloudflare as the network in front) are not
"sharing" under Play's definitions, and ElevenLabs receives lesson text only, never
user data (verified in `apps/api/src/tts.ts`: the request body is the section text
and model id, with the server's API key).

Crash reports go to Sentry (EU region), a service provider acting for us; they are
anonymous, not used for ads or analytics and not shared for any other purpose, so
they are declared as **collected, not shared**.

None of the data below is processed ephemerally; all of it is kept until the user
deletes their account (backups: up to 14 days more).

| Play category → type | Collected? | Shared? | Required or optional | Purposes | What it is in the app |
|---|---|---|---|---|---|
| Personal info → **Email address** | Yes | No | Required | Account management, App functionality | Sign-in identifier; password-reset and confirmation emails |
| Personal info → **Name** | Yes | No | Required | Account management, App functionality | The display name the user types (or their Google profile name with Google sign-in) |
| Personal info → **User IDs** | Yes | No | Required | Account management | Our account id; the Google account id (`google_sub`) when Google sign-in is used |
| App activity → **App interactions** | Yes | No | Required | App functionality, Personalisation | Lesson progress, exercise attempts (notes played: pitch, velocity, timing) and scores, quiz answers, play-along runs and settings, XP, achievements, practice minutes per day, daily goal, narration usage counts |
| App activity → **Other user-generated content** | Yes | No | Optional | App functionality | Feedback messages (with the page they were sent from); titles the user gives uploaded songs; import URLs |
| Audio → **Music files** | Yes | No | Optional | App functionality | MIDI files the user uploads, and practice recordings the user chooses to save (MIDI note data, not audio) |
| Audio → **Other audio files** | Yes | No | Optional | App functionality | Instrument sound samples the user uploads |
| Photos and videos → **Photos** | Yes | No | Optional | App functionality (support) | A screenshot the user chooses to attach to feedback |
| App info and performance → **Other app performance data** | Yes | No | Optional | App functionality (support) | The browser/WebView user-agent string sent with feedback |
| App info and performance → **Crash logs** | Yes | No | Optional | Analytics (diagnostics), App functionality | Anonymous crash reports from the app (error, stack trace, app version, device model and OS, internal account id). The Android app asks on first launch and the choice is in Settings. Emails, names, IPs and tokens are stripped before sending. Kept 90 days |
| App info and performance → **Diagnostics** | Yes | No | Optional | Analytics (diagnostics) | The technical context attached to crash reports: OS version, memory and battery state, the steps (breadcrumbs) before the crash |

Not collected (answer **No**): Location (approximate or precise), Financial info,
Health and fitness, Messages, Photos other than feedback screenshots, Videos, Voice
or sound recordings (the app never uses the microphone), Files and docs, Calendar,
Contacts, Web browsing history, Search history (the song search runs on the
device), Installed apps, Device or other IDs,
Race/ethnicity, Political or religious beliefs, Sexual orientation, Other info.

Judgement calls, so they can be revisited:

- **Time zone.** The browser's IANA time zone (e.g. `Europe/London`) is stored so
  "today" and streaks follow the user's midnight. Play's location types are about
  a user's or device's physical location; a self-reported time zone setting isn't
  declared as location here. If Play review disagrees, declare Location →
  Approximate location, purpose App functionality.
- **IP addresses** are used in memory for rate limiting and appear in web-server
  logs, but aren't stored with the account or used to derive location. Play does
  not list IP address as its own type.
- **Feedback screenshot and user agent** are only sent when the user submits
  feedback, hence optional.

## Families and target audience

The app is a general-audience learning app; the privacy policy and terms say it
isn't directed at children under 13 and that a parent should manage a younger
child's account. In Play Console → Target audience, choose **13 and over**
age groups. Choosing any under-13 group puts the app under the Families policy
(and, in the US, COPPA), which would need verifiable parental consent and other
changes before launch.

## Store listing links

- Privacy policy URL: `https://<your domain>/privacy`
- Delete account URL: `https://<your domain>/delete-account`
- Contact email: replace `privacy@YOURDOMAIN` in
  `apps/web/src/components/legal/PublicPageLayout.tsx` (`CONTACT_EMAIL`) first.
