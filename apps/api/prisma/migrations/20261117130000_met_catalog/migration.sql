-- CreateEnum
CREATE TYPE "CatalogSource" AS ENUM ('met');

-- CreateEnum
CREATE TYPE "PaintingMedium" AS ENUM ('canvas', 'wood_panel', 'paper', 'other');

-- CreateTable
CREATE TABLE "catalog_artworks" (
    "id" UUID NOT NULL,
    "source" "CatalogSource" NOT NULL,
    "source_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "object_date" TEXT NOT NULL,
    "credit_line" TEXT NOT NULL,
    "medium_description" TEXT NOT NULL,
    "medium" "PaintingMedium" NOT NULL,
    "width_cm" DECIMAL(8,2) NOT NULL,
    "height_cm" DECIMAL(8,2) NOT NULL,
    "depth_cm" DECIMAL(8,2) NOT NULL,
    "image_url" TEXT NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "price_amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_artworks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_artworks_artist_idx" ON "catalog_artworks"("artist");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_artworks_source_source_id_key" ON "catalog_artworks"("source", "source_id");

