-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "repos" TEXT[] DEFAULT ARRAY[]::TEXT[];
