-- Room: gioi tinh de trong = phong "nam hoac nu". Nguoi dau tien vao phong quyet
-- dinh phong la nam hay nu, sau do chi nhan nguoi cung gioi.
ALTER TABLE `Room` MODIFY `gender` ENUM('MALE', 'FEMALE') NULL;
