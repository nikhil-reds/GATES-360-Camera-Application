-- CreateTable
CREATE TABLE "EventImage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "timestamp" DOUBLE PRECISION NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EventImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "teamName" TEXT,
    "designation" TEXT,
    "groupName" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "certificateUrl" TEXT,
    "feedback" TEXT,
    "showOnDisplay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);
