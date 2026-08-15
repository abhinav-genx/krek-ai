-- CreateTable
CREATE TABLE "ChatEvent" (
    "id" SERIAL NOT NULL,
    "chatId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatEvent_chatId_idx" ON "ChatEvent"("chatId");

-- AddForeignKey
ALTER TABLE "ChatEvent" ADD CONSTRAINT "ChatEvent_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
