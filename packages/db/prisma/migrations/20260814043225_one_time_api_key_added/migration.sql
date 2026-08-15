/*
  Warnings:

  - Added the required column `sandboxId` to the `Chat` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "sandboxId" TEXT NOT NULL,
ADD COLUMN     "temp_agent_api_key" TEXT;
