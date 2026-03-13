-- 添加用户个人信息字段
ALTER TABLE `user`
ADD COLUMN `age` INT NULL COMMENT '年龄' AFTER `sex`,
ADD COLUMN `occupation` VARCHAR(100) NULL COMMENT '职业' AFTER `age`,
ADD COLUMN `industry` VARCHAR(100) NULL COMMENT '行业' AFTER `occupation`,
ADD COLUMN `identity_type` VARCHAR(20) NULL COMMENT '身份证类型：mainland-大陆, hongkong-香港, taiwan-台湾, foreign-国外' AFTER `identity_number`;
