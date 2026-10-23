import { Link } from "react-router-dom";
import PublicPageLayout, { CONTACT_EMAIL, Prose } from "./PublicPageLayout";

export const TERMS_LAST_UPDATED = "23 October 2026";

export default function TermsPage() {
  return (
    <PublicPageLayout title="Terms of use">
      <Prose>
        <p className="text-sm text-slate-500 dark:text-slate-400">Last updated {TERMS_LAST_UPDATED}</p>
        <p>
          These terms apply when you use Keyboard Sensei, on the web or in the Android app. By creating an account or
          using the app, you agree to them. They're written to be read, so please do.
        </p>

        <h2>Your account</h2>
        <ul>
          <li>Give a real email address you can receive mail at. It's how you get back in if you forget your password.</li>
          <li>Keep your password to yourself. You're responsible for what happens under your account.</li>
          <li>
            If you're under 13, a parent or guardian should create and manage the account. Between 13 and the age of
            majority where you live, use the app with a parent or guardian's permission.
          </li>
          <li>
            The "Start Demo" account is shared by everyone who tries the app. Don't put anything personal in it, and
            expect it to be reset from time to time.
          </li>
        </ul>

        <h2>What you upload</h2>
        <ul>
          <li>
            You can upload MIDI files, save recordings, import pieces from links or the piano archive, and upload
            instrument sounds. Only upload things you have the right to use.
          </li>
          <li>
            Your uploads stay private to your account. You keep any rights you have in them; you give us permission to
            store and process them only so the app can play, display and score them for you.
          </li>
          <li>We may remove content that we're told infringes someone's rights, or that breaks these terms.</li>
        </ul>

        <h2>Our content</h2>
        <p>
          Lessons, exercises and the app itself are ours. The pieces in the shared song collection are public-domain
          compositions in editions released by their typesetters under public-domain or Creative Commons licences;
          each piece shows its credit, and the full list is on the{" "}
          <Link to="/third-party-licenses">licences page</Link>. Where a licence is ShareAlike, the simplified versions we
          make of a piece are shared under the same licence.
        </p>

        <h2>Fair use of the service</h2>
        <ul>
          <li>Don't try to break, overload or get around the limits of the service, or access other people's accounts.</li>
          <li>Don't use the import features to fetch things you're not allowed to, or to attack other sites.</li>
          <li>Narration has a daily limit per account so that it stays available for everyone.</li>
        </ul>

        <h2>The app is provided "as is"</h2>
        <p>
          We work hard to make Keyboard Sensei useful and reliable, but we can't promise it will always be available,
          error-free, or that scores and feedback are perfectly accurate. It's a practice aid, not a substitute for a
          teacher. As far as the law allows, we aren't liable for indirect losses or for data you lose, and our total
          liability to you is limited to the amount you've paid us (the app is currently free). Nothing here limits
          rights you have under consumer law that can't be limited.
        </p>

        <h2>Ending things</h2>
        <p>
          You can stop using the app and <Link to="/delete-account">delete your account</Link> at any time. We may
          suspend or close accounts that break these terms. We may change or stop the service; if we shut it down,
          we'll give notice in the app first where we can.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          We'll update this page and the date at the top if the terms change. If a change is significant, we'll tell you
          in the app. Continuing to use the app after a change means you accept the new terms.
        </p>

        <h2>Privacy</h2>
        <p>
          How we handle your data is explained in the <Link to="/privacy">privacy policy</Link>.
        </p>

        <h2>Contact</h2>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Prose>
    </PublicPageLayout>
  );
}
