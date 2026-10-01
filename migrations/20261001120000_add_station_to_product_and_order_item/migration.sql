-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "station" TEXT DEFAULT 'hot_line';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "station" TEXT DEFAULT 'hot_line';
