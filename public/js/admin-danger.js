// Khoi "Reset toan bo" trong trang Cau hinh - tach rieng vi day la thao tac
// khong the hoan tac, de doc lai va de kiem tra.
(function () {
  const A = window.AdminCommon;

  const resetBtn = document.getElementById('resetBtn');
  if (!resetBtn) return;

  const resetIncludeRooms = document.getElementById('resetIncludeRooms');
  const resetKeepPinned = document.getElementById('resetKeepPinned');
  const resetIncludeActivity = document.getElementById('resetIncludeActivity');
  const msg = document.getElementById('msg');


  resetBtn.addEventListener('click', async () => {
    const includeRooms = resetIncludeRooms.checked;
    const keepPinned = resetKeepPinned.checked;
    const includeActivity = resetIncludeActivity.checked;

    const lines = [
      'Xóa kết quả chia nhóm và toàn bộ tiến độ quiz (điểm số, nhóm trưởng) của tất cả thành viên.',
      includeRooms ? 'Xóa luôn kết quả ghép phòng ngủ.' : 'Giữ nguyên kết quả ghép phòng ngủ.',
      keepPinned ? 'Người đã ghim vẫn giữ nguyên nhóm và phòng.' : 'Kể cả người đã ghim cũng bị xóa kết quả.',
      includeActivity ? 'Xóa luôn nhật ký thao tác.' : '',
    ].filter(Boolean);

    const ok = await A.confirmAction({
      title: 'Reset toàn bộ',
      message: `${lines.map((l) => `• ${l}`).join('<br />')}<br /><br /><strong>Không thể hoàn tác.</strong>`,
      okText: 'Reset toàn bộ',
    });
    if (!ok) return;

    const data = await A.run(resetBtn, msg, 'Đang reset...', () =>
      A.request('POST', '/api/admin/reset', { includeRooms, keepPinned, includeActivity })
    );
    if (!data) return;

    A.done(
      msg,
      data.roomsCleared
        ? 'Đã reset toàn bộ thành công! (kể cả tiến độ quiz và kết quả ghép phòng)'
        : 'Đã reset toàn bộ thành công! (kể cả tiến độ quiz)'
    );
    loadQuizLeaderboard();
    loadLobby();
  });
})();
