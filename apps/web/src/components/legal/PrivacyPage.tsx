import { Link } from "react-router-dom";
import PublicPageLayout, { CONTACT_EMAIL, Prose } from "./PublicPageLayout";

/**
 * Written from what the app actually stores (apps/api/prisma/schema.prisma) and sends
 * (apps/api/src/tts.ts, archive.ts, songs.ts, google.ts, mailer.ts). Keep it in step
 * with docs/play-data-safety.md, which answers the Play Console form from the same list.
 */
export const PRIVACY_LAST_UPDATED = "23 October 2026";

export default function PrivacyPage() {
  return (
    <PublicPageLayout title="Privacy policy">
      <Prose>
        <p className="text-sm text-slate-500 dark:text-slate-400">Last updated {PRIVACY_LAST_UPDATED}</p>
        <p>
          Keyboard Sensei is a piano-learning app. This page explains, in plain English, what we store about you, why,
          who else sees any of it, and how to delete it. We don't sell your data, show ads, or use analytics or
          tracking tools.
        </p>

        <h2>What we store</h2>
        <h3>Your account</h3>
        <ul>
          <li>Your email address and the display name you choose.</li>
          <li>
            Your password, stored only as a one-way hash (bcrypt). We can't read it. If you sign in with Google instead,
            we store your Google account ID, plus the email address and name Google shares with us.
          </li>
          <li>Whether and when you confirmed your email address.</li>
          <li>Your settings: daily practice goal, preferred narration voice, and your time zone (so "today" and streaks follow your own midnight).</li>
        </ul>

        <h3>Your practice</h3>
        <ul>
          <li>
            The notes you play in exercises (which key, how hard, and when), so they can be scored, along with the score.
          </li>
          <li>Quiz answers, lesson progress and best scores.</li>
          <li>Play-along runs: score, accuracy, speed and the practice settings you used.</li>
          <li>Experience points, achievements, and how many minutes you practised each day.</li>
          <li>How many characters of lesson narration you requested each day (to enforce a fair-use limit).</li>
        </ul>

        <h3>Things you add</h3>
        <ul>
          <li>MIDI files you upload, and the web address if you import one from a link.</li>
          <li>Recordings you choose to save. These are MIDI note data from your keyboard, not audio. We never use your microphone.</li>
          <li>Pieces you import from the public piano archive, on servers that offer it.</li>
          <li>Instrument sounds you upload.</li>
          <li>
            Feedback you send: the message, the page you were on, your browser's user-agent string (browser and device
            type), and a screenshot if you attach one.
          </li>
        </ul>
        <p>
          Your uploads, recordings and imports are private to your account. Other users can't see them.
        </p>

        <h3>On your device</h3>
        <p>
          The app keeps your sign-in token and some preferences (theme, practice and metronome settings, keyboard range,
          audio latency, chosen instrument) in your browser's local storage. We don't use cookies.
        </p>

        <h3>Technical logs</h3>
        <p>
          Like any website, our servers handle your IP address to deliver pages. We use it briefly in memory to limit
          repeated sign-in attempts. It isn't saved with your account. Our web servers may keep short-lived technical
          logs (time, page requested, browser type) for troubleshooting.
        </p>

        <h2>Why we use it</h2>
        <ul>
          <li>To run your account and sign you in.</li>
          <li>To score your playing, track your progress, and show streaks, stars and achievements.</li>
          <li>To send emails you ask for: password resets and email confirmation. We don't send marketing email.</li>
          <li>To read and act on feedback you send.</li>
          <li>To keep the service secure and prevent abuse.</li>
        </ul>

        <h2>Who else is involved</h2>
        <ul>
          <li>
            <strong>ElevenLabs</strong> turns lesson text into spoken narration. We send it the lesson text and the chosen
            voice only, never your name, email or anything about you. Each narrated section is generated once and then
            reused for everyone.
          </li>
          <li>
            <strong>Voice previews</strong> in Settings play sample clips that ElevenLabs hosts on Google Cloud Storage.
            Your browser fetches them directly, so Google's servers see your IP address when you press play.
          </li>
          <li>
            <strong>Google</strong>, if you choose "Sign in with Google". Google's sign-in script loads on the sign-in page
            and Google tells us your account ID, email address and name. Google's own{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
              privacy policy
            </a>{" "}
            covers what happens on their side.
          </li>
          <li>
            <strong>Our email provider</strong> delivers password-reset and confirmation emails, so it handles your email
            address and the message.
          </li>
          <li>
            <strong>Cloudflare</strong> carries traffic to the public website, so it handles your IP address and the
            requests your browser makes.
          </li>
          <li>
            <strong>Importing from a link or the piano archive:</strong> our server downloads the file for you, so the
            other site (or Hugging Face, which hosts the archive) sees our server's request, not yours.
          </li>
        </ul>
        <p>We don't share your data with anyone else, and we don't sell it.</p>

        <h2>How long we keep it</h2>
        <p>
          We keep your data while you have an account. When you delete your account, everything listed above is removed
          from our database straight away, along with your uploaded files. Backups made before the deletion are kept
          for up to 14 days and then deleted.
        </p>

        <h2>Your choices and rights</h2>
        <ul>
          <li>Change your name, password and settings in Settings.</li>
          <li>
            Delete your account and data at any time: Settings → Account → Delete account, or on the{" "}
            <Link to="/delete-account">delete account page</Link> without signing in.
          </li>
          <li>
            Ask for a copy of your data, or ask us anything about this policy, by emailing{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </li>
        </ul>

        <h2>Children</h2>
        <p>
          Keyboard Sensei isn't directed at children under 13. If a younger child wants to learn, a parent or guardian
          should create and manage the account. If you think a child under 13 has given us personal data, email us and
          we'll delete it.
        </p>

        <h2>Security</h2>
        <p>
          Connections to the app are encrypted (HTTPS). Passwords are hashed, and password-reset links work once and
          expire after 30 minutes. No system is perfectly secure, but we work to protect your data.
        </p>

        <h2>Changes</h2>
        <p>
          If we change this policy we'll update this page and the date at the top. If a change is significant, we'll tell
          you in the app.
        </p>

        <h2>Contact</h2>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Prose>
    </PublicPageLayout>
  );
}
