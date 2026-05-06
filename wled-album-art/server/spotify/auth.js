const axios = require('axios');
const { loadSettings, saveSettings, loadEnv } = require('../config/store');

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SCOPES = 'user-read-currently-playing user-read-playback-state';

let accessToken = null;
let tokenExpiresAt = 0;

function getCredentials() {
  const env = loadEnv();
  return {
    clientId: env.SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: env.SPOTIFY_CLIENT_SECRET || process.env.SPOTIFY_CLIENT_SECRET || '',
    redirectUri: env.SPOTIFY_REDIRECT_URI || process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/auth/callback',
  };
}

function getAuthorizationUrl() {
  const { clientId, redirectUri } = getCredentials();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = getCredentials();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const response = await axios.post(SPOTIFY_TOKEN_URL, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
  });
  const { access_token, refresh_token, expires_in } = response.data;
  accessToken = access_token;
  tokenExpiresAt = Date.now() + expires_in * 1000;
  if (refresh_token) {
    saveSettings({ spotify: { refreshToken: refresh_token } });
  }
  return { accessToken, expiresAt: tokenExpiresAt };
}

async function refreshAccessToken() {
  const settings = loadSettings();
  const refreshToken = settings.spotify?.refreshToken;
  if (!refreshToken) throw new Error('No refresh token stored');

  const { clientId, clientSecret } = getCredentials();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const response = await axios.post(SPOTIFY_TOKEN_URL, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
  });
  const { access_token, refresh_token, expires_in } = response.data;
  accessToken = access_token;
  tokenExpiresAt = Date.now() + expires_in * 1000;
  if (refresh_token) {
    saveSettings({ spotify: { refreshToken: refresh_token } });
  }
  return accessToken;
}

async function getValidAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60000) {
    return accessToken;
  }
  return refreshAccessToken();
}

function getAuthStatus() {
  const settings = loadSettings();
  const hasRefreshToken = !!settings.spotify?.refreshToken;
  const isConnected = hasRefreshToken && !!accessToken;
  const expiresInMs = tokenExpiresAt - Date.now();
  return {
    connected: isConnected,
    hasRefreshToken,
    tokenExpiresAt: tokenExpiresAt || null,
    expiresInMin: isConnected ? Math.round(expiresInMs / 60000) : null,
  };
}

function disconnect() {
  accessToken = null;
  tokenExpiresAt = 0;
  saveSettings({ spotify: { refreshToken: '' } });
}

module.exports = { getAuthorizationUrl, exchangeCode, getValidAccessToken, getAuthStatus, disconnect };
