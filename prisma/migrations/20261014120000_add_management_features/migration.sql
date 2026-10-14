-- Group: mau the, gioi han so nguoi, khoa nhan nguoi, thu tu hien thi
ALTER TABLE `Group`
  ADD COLUMN `color` VARCHAR(16) NULL,
  ADD COLUMN `capacity` INTEGER NULL,
  ADD COLUMN `locked` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0;

-- Member: quyen tham gia tung vong, ghim ket qua, ghi chu
ALTER TABLE `Member`
  ADD COLUMN `joinRandom` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `joinRoom` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `joinQuiz` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `pinnedGroup` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `pinnedRoom` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `note` TEXT NULL;

CREATE INDEX `Member_groupId_idx` ON `Member`(`groupId`);
CREATE INDEX `Member_roomId_idx` ON `Member`(`roomId`);

-- Room: khoa phong, thu tu hien thi
ALTER TABLE `Room`
  ADD COLUMN `locked` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0;

-- Question: diem so rieng tung cau, gioi han thoi gian
ALTER TABLE `Question`
  ADD COLUMN `points` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `timeLimitSec` INTEGER NULL;

ALTER TABLE `Question` MODIFY `text` TEXT NOT NULL;
ALTER TABLE `Setting` MODIFY `value` TEXT NULL;

-- Nhat ky thao tac (thay cho mang trong bo nho, con lai sau khi restart server)
CREATE TABLE `ActivityLog` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(24) NOT NULL,
  `icon` VARCHAR(32) NULL,
  `message` TEXT NOT NULL,
  `actor` VARCHAR(160) NULL,
  `meta` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `ActivityLog_createdAt_idx`(`createdAt`),
  INDEX `ActivityLog_type_idx`(`type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
