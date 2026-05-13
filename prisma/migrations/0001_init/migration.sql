-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `telegramUserId` BIGINT NULL,
    `username` VARCHAR(255) NULL,
    `firstName` VARCHAR(255) NULL,
    `lastName` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_telegramUserId_key`(`telegramUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TelegramChat` (
    `id` VARCHAR(191) NOT NULL,
    `telegramChatId` BIGINT NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `title` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TelegramChat_telegramChatId_key`(`telegramChatId`),
    INDEX `TelegramChat_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMember` (
    `id` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(50) NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChatMember_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `ChatMember_chatId_userId_key`(`chatId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'FINALIZED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `shareBasketUrl` VARCHAR(2048) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `finalizedByUserId` VARCHAR(191) NULL,
    `finalizedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Order_chatId_status_idx`(`chatId`, `status`),
    INDEX `Order_createdAt_idx`(`createdAt`),
    INDEX `Order_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `productSnapshotId` VARCHAR(191) NOT NULL,
    `addedByUserId` VARCHAR(191) NULL,
    `quantity` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OrderItem_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `OrderItem_orderId_productSnapshotId_key`(`orderId`, `productSnapshotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderEvent` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `type` VARCHAR(100) NOT NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrderEvent_orderId_createdAt_idx`(`orderId`, `createdAt`),
    INDEX `OrderEvent_type_createdAt_idx`(`type`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `externalProductId` INTEGER NULL,
    `xmlId` INTEGER NULL,
    `slug` VARCHAR(255) NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `priceCurrent` DECIMAL(10, 2) NULL,
    `priceOld` DECIMAL(10, 2) NULL,
    `currency` VARCHAR(10) NULL,
    `unit` VARCHAR(20) NULL,
    `weightValue` DECIMAL(10, 3) NULL,
    `weightUnit` VARCHAR(20) NULL,
    `ratingAverage` DECIMAL(4, 2) NULL,
    `ratingCount` INTEGER NULL,
    `productUrl` VARCHAR(2048) NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductSnapshot_createdAt_idx`(`createdAt`),
    INDEX `ProductSnapshot_externalProductId_idx`(`externalProductId`),
    INDEX `ProductSnapshot_xmlId_idx`(`xmlId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistoricalOrder` (
    `id` VARCHAR(191) NOT NULL,
    `source` ENUM('TELEGRAM', 'CSV_IMPORT') NOT NULL,
    `dedupeKey` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(191) NULL,
    `originalOrderId` VARCHAR(191) NULL,
    `finalizedByUserId` VARCHAR(191) NULL,
    `importJobId` VARCHAR(191) NULL,
    `shareBasketUrl` VARCHAR(2048) NULL,
    `itemCount` INTEGER NOT NULL DEFAULT 0,
    `finalizedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HistoricalOrder_dedupeKey_key`(`dedupeKey`),
    UNIQUE INDEX `HistoricalOrder_originalOrderId_key`(`originalOrderId`),
    INDEX `HistoricalOrder_createdAt_idx`(`createdAt`),
    INDEX `HistoricalOrder_source_finalizedAt_idx`(`source`, `finalizedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistoricalOrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `historicalOrderId` VARCHAR(191) NOT NULL,
    `productSnapshotId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `HistoricalOrderItem_historicalOrderId_productSnapshotId_key`(`historicalOrderId`, `productSnapshotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportJob` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('CREATED', 'RUNNING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED') NOT NULL DEFAULT 'CREATED',
    `sourceFile` VARCHAR(2048) NOT NULL,
    `checksum` VARCHAR(255) NULL,
    `totalRows` INTEGER NOT NULL DEFAULT 0,
    `validRows` INTEGER NOT NULL DEFAULT 0,
    `importedRows` INTEGER NOT NULL DEFAULT 0,
    `skippedRows` INTEGER NOT NULL DEFAULT 0,
    `errorRows` INTEGER NOT NULL DEFAULT 0,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ImportJob_createdAt_idx`(`createdAt`),
    INDEX `ImportJob_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportJobRow` (
    `id` VARCHAR(191) NOT NULL,
    `importJobId` VARCHAR(191) NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'IMPORTED', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `dedupeKey` VARCHAR(255) NULL,
    `errorCode` VARCHAR(100) NULL,
    `errorMessage` TEXT NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ImportJobRow_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `ImportJobRow_importJobId_rowNumber_key`(`importJobId`, `rowNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IntegrationLog` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(100) NOT NULL,
    `operation` VARCHAR(100) NOT NULL,
    `status` VARCHAR(50) NOT NULL,
    `correlationId` VARCHAR(255) NULL,
    `requestPayload` JSON NULL,
    `responsePayload` JSON NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IntegrationLog_provider_operation_createdAt_idx`(`provider`, `operation`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatMember` ADD CONSTRAINT `ChatMember_chatId_fkey` FOREIGN KEY (`chatId`) REFERENCES `TelegramChat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMember` ADD CONSTRAINT `ChatMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_chatId_fkey` FOREIGN KEY (`chatId`) REFERENCES `TelegramChat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_finalizedByUserId_fkey` FOREIGN KEY (`finalizedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_productSnapshotId_fkey` FOREIGN KEY (`productSnapshotId`) REFERENCES `ProductSnapshot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_addedByUserId_fkey` FOREIGN KEY (`addedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderEvent` ADD CONSTRAINT `OrderEvent_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderEvent` ADD CONSTRAINT `OrderEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalOrder` ADD CONSTRAINT `HistoricalOrder_chatId_fkey` FOREIGN KEY (`chatId`) REFERENCES `TelegramChat`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalOrder` ADD CONSTRAINT `HistoricalOrder_originalOrderId_fkey` FOREIGN KEY (`originalOrderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalOrder` ADD CONSTRAINT `HistoricalOrder_finalizedByUserId_fkey` FOREIGN KEY (`finalizedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalOrder` ADD CONSTRAINT `HistoricalOrder_importJobId_fkey` FOREIGN KEY (`importJobId`) REFERENCES `ImportJob`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalOrderItem` ADD CONSTRAINT `HistoricalOrderItem_historicalOrderId_fkey` FOREIGN KEY (`historicalOrderId`) REFERENCES `HistoricalOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalOrderItem` ADD CONSTRAINT `HistoricalOrderItem_productSnapshotId_fkey` FOREIGN KEY (`productSnapshotId`) REFERENCES `ProductSnapshot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportJobRow` ADD CONSTRAINT `ImportJobRow_importJobId_fkey` FOREIGN KEY (`importJobId`) REFERENCES `ImportJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

