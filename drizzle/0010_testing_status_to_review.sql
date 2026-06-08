UPDATE `scout_items`
SET `status` = 'review',
    `updated_at` = datetime('now')
WHERE `status` = 'testing';
