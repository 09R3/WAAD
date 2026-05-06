const express = require('express');
const { getAuthorizationUrl, exchangeCode, disconnect } = require('../spotify/auth');

const router = express.Router();

router.get('/login', (req, res) => {
  const url = getAuthorizationUrl();
  res.redirect(url);
});

router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.redirect(`/?auth_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return res.redirect('/?auth_error=no_code');
  }
  try {
    await exchangeCode(code);
    res.redirect('/?auth_success=1');
  } catch (err) {
    res.redirect(`/?auth_error=${encodeURIComponent(err.message)}`);
  }
});

router.post('/disconnect', (req, res) => {
  disconnect();
  res.json({ ok: true });
});

module.exports = router;
