// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json)
// and handled by the GlowLab Express app. The web app is served as static files.
const { buildApp } = require('../glowlab-server/dist/index.js');

module.exports = buildApp();
