module.exports = (req, res, next) => {
  // Si un middleware d’auth existe déjà et pose req.user, utilise-le plutôt.
  // Ici, on bloque si pas de user.
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  next();
};