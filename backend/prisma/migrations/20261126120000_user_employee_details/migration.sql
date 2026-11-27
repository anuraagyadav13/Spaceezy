-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "dateOfJoining" TIMESTAMP(3),
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT;
