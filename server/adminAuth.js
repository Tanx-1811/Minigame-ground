// Toan bo endpoint admin dung chung 1 ma bi mat dat trong .env (ADMIN_RESET_SECRET).
// Secret di kem trong body voi POST/PUT/DELETE, hoac query string voi GET.
function requireAdmin(req, res, next) {
  const provided = (req.body && req.body.secret) || req.query.secret;
  if (!process.env.ADMIN_RESET_SECRET || provided !== process.env.ADMIN_RESET_SECRET) {
    return res.status(401).json({ error: 'Sai mã bí mật' });
  }
  next();
}

module.exports = requireAdmin;
