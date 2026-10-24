import "./instrument.js";
import { app } from "./app.js";
import { env } from "./config.js";
import { prisma } from "./db.js";
import { mailTransportName } from "./mailer.js";
import { flushSentry } from "./sentry.js";
const server=app.listen(env.PORT,()=>{
  console.log(`Midivory API listening on http://localhost:${env.PORT}`);
  console.log(`Catalogue: ${env.PUBLIC_CATALOGUE?"public (Essentials + beginner pack only)":"full library"}; email: ${mailTransportName()}; Google sign-in: ${env.GOOGLE_CLIENT_IDS.length?"on":"off"}; email verification: ${env.REQUIRE_EMAIL_VERIFICATION?"required":"off"}`);
  if(mailTransportName()==="console"&&process.env.NODE_ENV==="production")console.warn("SMTP_HOST is not set: password-reset and verification emails are only written to this log.");
});
const shutdown=()=>server.close(()=>void flushSentry().then(()=>prisma.$disconnect()).finally(()=>process.exit(0)));
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
