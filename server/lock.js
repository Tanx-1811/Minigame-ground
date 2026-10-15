// Hang doi tuan tu trong tien trinh cho cac thao tac "doc so cho -> chon -> ghi".
//
// Truoc day moi luot quay chay trong 1 transaction roi DEM LAI so nguoi trong phong
// de phat hien ghi de. Nhung MySQL mac dinh la REPEATABLE READ: lenh dem chi thay
// snapshot cua chinh transaction do, nen 2 nguoi bam cung luc van cung thay "con 1
// cho", cung ghi va cung commit -> phong vuot suc chua.
//
// App chay 1 tien trinh Node duy nhat, nen xep cac thao tac cung loai vao mot hang
// doi la cach chac chan va re nhat: luot sau chi bat dau khi luot truoc da commit.
// Moi luot chi mat vai chuc ms nen nguoi dung khong cam thay cho.

const queues = new Map();

function withLock(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  // Giu "duoi" hang doi la mot promise khong bao gio reject de luot sau van chay
  const tail = run.catch(() => {});
  queues.set(key, tail);
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return run;
}

module.exports = { withLock };
