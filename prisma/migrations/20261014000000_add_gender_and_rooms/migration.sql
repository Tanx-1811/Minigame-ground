-- CreateTable
CREATE TABLE `Room` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `gender` ENUM('MALE', 'FEMALE') NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 2,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Room_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Member` ADD COLUMN `gender` ENUM('MALE', 'FEMALE') NULL,
    ADD COLUMN `roomId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Member` ADD CONSTRAINT `Member_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
