-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `password_hash` VARCHAR(255) NULL,
    `avatar_url` TEXT NULL,
    `provider` ENUM('local', 'google') NOT NULL DEFAULT 'local',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rooms` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `owner_id` BIGINT NOT NULL,
    `is_private` BOOLEAN NOT NULL DEFAULT false,
    `current_video_id` VARCHAR(50) NULL,
    `current_queue_item_id` BIGINT NULL,
    `current_time` DOUBLE NOT NULL DEFAULT 0,
    `player_status` ENUM('idle', 'playing', 'paused') NOT NULL DEFAULT 'idle',
    `started_at` DATETIME(3) NULL,
    `allow_member_add_song` BOOLEAN NOT NULL DEFAULT true,
    `allow_member_remove_own_song` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `rooms_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_members` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `room_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `role` ENUM('owner', 'member') NOT NULL DEFAULT 'member',
    `is_online` BOOLEAN NOT NULL DEFAULT false,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NULL,

    UNIQUE INDEX `unique_room_user`(`room_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_queue` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `room_id` BIGINT NOT NULL,
    `video_id` VARCHAR(50) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `channel_title` VARCHAR(255) NULL,
    `thumbnail_url` TEXT NULL,
    `duration_seconds` INTEGER NULL,
    `added_by` BIGINT NOT NULL,
    `position` INTEGER NOT NULL,
    `status` ENUM('queued', 'playing', 'played', 'removed') NOT NULL DEFAULT 'queued',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_room_queue_room_position`(`room_id`, `position`),
    INDEX `idx_room_queue_room_status`(`room_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `personal_history` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `video_id` VARCHAR(50) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `channel_title` VARCHAR(255) NULL,
    `thumbnail_url` TEXT NULL,
    `played_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `favorites` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `video_id` VARCHAR(50) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `channel_title` VARCHAR(255) NULL,
    `thumbnail_url` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `unique_user_video`(`user_id`, `video_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `youtube_video_cache` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `video_id` VARCHAR(50) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `channel_title` VARCHAR(255) NULL,
    `thumbnail_url` TEXT NULL,
    `duration_seconds` INTEGER NULL,
    `embeddable` BOOLEAN NOT NULL DEFAULT true,
    `raw_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `youtube_video_cache_video_id_key`(`video_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `youtube_search_cache` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `query_hash` VARCHAR(64) NOT NULL,
    `query_text` VARCHAR(500) NOT NULL,
    `result_json` JSON NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `youtube_search_cache_query_hash_key`(`query_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `rooms` ADD CONSTRAINT `rooms_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rooms` ADD CONSTRAINT `rooms_current_queue_item_id_fkey` FOREIGN KEY (`current_queue_item_id`) REFERENCES `room_queue`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_members` ADD CONSTRAINT `room_members_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_members` ADD CONSTRAINT `room_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_queue` ADD CONSTRAINT `room_queue_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_queue` ADD CONSTRAINT `room_queue_added_by_fkey` FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `personal_history` ADD CONSTRAINT `personal_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
