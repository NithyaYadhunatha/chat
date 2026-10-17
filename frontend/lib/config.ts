export const APP_NAME = 'PingPong';
export const APP_TAGLINE = 'Text strangers. Keep the rally going.';

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

export const MAX_STRANGER_MESSAGE = 1000;
export const MAX_DM_MESSAGE = 4000;
export const MAX_INTERESTS = 5;
