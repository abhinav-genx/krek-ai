/*
  Warnings:

  - You are about to drop the `Github` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Github" DROP CONSTRAINT "Github_userId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "github_access_token_encrypted" TEXT;

-- DropTable
DROP TABLE "Github";
