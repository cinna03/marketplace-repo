CREATE TABLE "email_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_codes_user_id_purpose_idx" ON "email_codes"("user_id", "purpose");
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "saved_pieces" (
    "user_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_pieces_pkey" PRIMARY KEY ("user_id", "source_id")
);

ALTER TABLE "saved_pieces" ADD CONSTRAINT "saved_pieces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "wall_tries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "outcome" TEXT,
    "image" TEXT,
    "tried_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wall_tries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wall_tries_user_id_source_id_tried_at_key" ON "wall_tries"("user_id", "source_id", "tried_at");
CREATE INDEX "wall_tries_user_id_tried_at_idx" ON "wall_tries"("user_id", "tried_at");
ALTER TABLE "wall_tries" ADD CONSTRAINT "wall_tries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
