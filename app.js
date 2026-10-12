// Vercel entry point.
// Vercel looks for an Express app in app.js and serves its default export; the public/ folder is
// served by Vercel's own CDN. On your computer use `npm start` (server/server.js) instead.
import express from "express"; // Vercel finds the app by this import: keep it
import { createApp } from "./server/server.js";

export default createApp();
