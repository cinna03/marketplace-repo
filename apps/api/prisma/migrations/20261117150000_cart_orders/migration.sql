-- CreateEnum
CREATE TYPE "ShopOrderStatus" AS ENUM ('awaiting_payment', 'paid', 'cancelled');

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "artwork_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ShopOrderStatus" NOT NULL DEFAULT 'awaiting_payment',
    "currency" CHAR(3) NOT NULL,
    "total_amount" BIGINT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "line1_ciphertext" TEXT NOT NULL,
    "line2_ciphertext" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postal_code" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_amount" BIGINT NOT NULL,
    "width_cm" DECIMAL(8,2) NOT NULL,
    "height_cm" DECIMAL(8,2) NOT NULL,
    "depth_cm" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "shop_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_artwork_id_key" ON "cart_items"("cart_id", "artwork_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_number_key" ON "shop_orders"("number");

-- CreateIndex
CREATE INDEX "shop_orders_user_id_placed_at_idx" ON "shop_orders"("user_id", "placed_at");

-- CreateIndex
CREATE INDEX "shop_order_items_order_id_idx" ON "shop_order_items"("order_id");

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_artwork_id_fkey" FOREIGN KEY ("artwork_id") REFERENCES "catalog_artworks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
