module.exports = function authorize(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });

    const role = req.user.role;
    if (role === 'SUPERADMIN') return next();

    if (allowedRoles.length === 0) {
      // lecture ou accès libre aux utilisateurs connectés
      return next();
    }

    if (allowedRoles.includes(role)) return next();

    return res.status(403).json({ error: 'Accès interdit' });
  };
};

// Raccourcis fréquents
module.exports.canFinanceWrite = () => module.exports(['TREASURER', 'STAFF_LEAD']);
module.exports.canRolesManage = () => module.exports(['STAFF_LEAD', 'UNIT_LEAD']);