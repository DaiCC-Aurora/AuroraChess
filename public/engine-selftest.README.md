#!/usr/bin/env node
/**
 * Engine self-test page.
 *
 * Loads the vendored Stockfish WASM worker exactly the way the app does, walks
 * the UCI handshake, runs a short search and prints the result into #result.
 * Useful to verify a deployment (CDN headers, MIME types, worker scope) without
 * opening dev tools:
 *
 *   open /engine-selftest.html          -> watch the page
 *   msedge --headless --dump-dom <url>  -> assert on the DOM
 */
