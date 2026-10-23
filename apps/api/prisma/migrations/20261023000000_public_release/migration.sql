-- Public release: email verification, Google sign-in link, emailed single-use tokens.
-- No backfill of email_verified_at: nobody has proven an address yet, and the column is
-- only enforced when REQUIRE_EMAIL_VERIFICATION is switched on.
ALTER TABLE "User" ADD COLUMN "email_verified_at" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "google_sub" TEXT;
CREATE UNIQUE INDEX "User_google_sub_key" ON "User"("google_sub");

CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthToken_token_hash_key" ON "AuthToken"("token_hash");
CREATE INDEX "AuthToken_user_id_purpose_idx" ON "AuthToken"("user_id", "purpose");
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
