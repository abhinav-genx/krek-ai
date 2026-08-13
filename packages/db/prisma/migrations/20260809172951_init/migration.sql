-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Github" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Github_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Github" ADD CONSTRAINT "Github_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
