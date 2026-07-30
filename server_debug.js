#!/usr/bin/env node
/**
 * Minimal HTTPS diagnostic server.
 * Run: sudo node server_debug.js
 * Then try connecting from your phone to https://<ip>:8443
 * Watch the console for exactly where connections fail.
 */

var https = require('https');
var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');

var PORT = 8443;
var HTTP_PORT = 8080; // Also test plain HTTP

// Get local IPs
var interfaces = os.networkInterfaces();
var localIPs = [];
Object.keys(interfaces).forEach(function(ifname) {
  interfaces[ifname].forEach(function(iface) {
    if (!iface.internal && iface.family === 'IPv4') {
      localIPs.push(iface.address);
    }
  });
});

console.log('');
console.log('=== NETWORK DIAGNOSTIC SERVER ===');
console.log('Local IPs:', localIPs.join(', '));
console.log('');

// ---- TEST 1: Plain HTTP server (no TLS issues possible) ----
var httpServer = http.createServer(function(req, res) {
  var remote = req.socket.remoteAddress + ':' + req.socket.remotePort;
  console.log('[HTTP-PLAIN] Request: ' + req.method + ' ' + req.url + ' from ' + remote);
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h1>HTTP works!</h1><p>Your phone can reach this server on port ' + HTTP_PORT + ' via plain HTTP.</p>');
});

httpServer.on('connection', function(socket) {
  console.log('[HTTP-PLAIN] TCP connection from ' + socket.remoteAddress + ':' + socket.remotePort);
});

httpServer.on('error', function(err) {
  console.log('[HTTP-PLAIN] Server error: ' + err.message);
  if (err.code === 'EADDRINUSE') {
    console.log('[HTTP-PLAIN] Port ' + HTTP_PORT + ' in use, skipping plain HTTP test');
  }
});

httpServer.listen(HTTP_PORT, '0.0.0.0', function() {
  console.log('[HTTP-PLAIN] Listening on port ' + HTTP_PORT);
  console.log('[HTTP-PLAIN] Try: http://' + (localIPs[0] || 'localhost') + ':' + HTTP_PORT);
  console.log('');
});

// ---- TEST 2: HTTPS server with full debug logging ----
var sslDir = path.join(__dirname, 'ssl');
var keyPath = path.join(sslDir, 'key.pem');
var certPath = path.join(sslDir, 'cert.pem');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.log('[HTTPS] ERROR: No SSL certificates found in ' + sslDir);
  console.log('[HTTPS] Run the main server first to generate them, or run:');
  console.log('  openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/CN=localhost"');
  process.exit(1);
}

// Read cert and show SAN info
var certPem = fs.readFileSync(certPath, 'utf8');
console.log('[HTTPS] Certificate loaded from ' + certPath);
try {
  var child_process = require('child_process');
  var sanInfo = child_process.execSync(
    'openssl x509 -in "' + certPath + '" -noout -ext subjectAltName 2>/dev/null',
    { encoding: 'utf8' }
  ).trim();
  console.log('[HTTPS] Certificate SAN: ' + (sanInfo || 'NONE - this will cause ERR_EMPTY_RESPONSE on mobile!'));
} catch(e) {
  console.log('[HTTPS] Could not read SAN info');
}
console.log('');

var options = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

var httpsServer = https.createServer(options, function(req, res) {
  var remote = req.socket.remoteAddress + ':' + req.socket.remotePort;
  console.log('[HTTPS] HTTP Request: ' + req.method + ' ' + req.url + ' from ' + remote);
  console.log('[HTTPS] Headers: ' + JSON.stringify(req.headers, null, 2));
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h1>HTTPS works!</h1><p>Connection from ' + remote + ' successful.</p>');
});

// Raw TCP connection (before TLS)
httpsServer.on('connection', function(socket) {
  var remote = socket.remoteAddress + ':' + socket.remotePort;
  console.log('[HTTPS] [TCP] >>> New TCP connection from ' + remote);
  
  socket.on('error', function(err) {
    console.log('[HTTPS] [TCP] Socket error from ' + remote + ': ' + err.code + ' - ' + err.message);
  });
  
  socket.on('close', function(hadError) {
    console.log('[HTTPS] [TCP] Connection closed from ' + remote + (hadError ? ' (WITH ERROR)' : ' (clean)'));
  });
  
  socket.on('timeout', function() {
    console.log('[HTTPS] [TCP] Socket timeout from ' + remote);
  });
});

// TLS handshake completed successfully
httpsServer.on('secureConnection', function(tlsSocket) {
  var remote = tlsSocket.remoteAddress + ':' + tlsSocket.remotePort;
  var proto = tlsSocket.getProtocol ? tlsSocket.getProtocol() : 'unknown';
  var cipher = tlsSocket.getCipher ? JSON.stringify(tlsSocket.getCipher()) : 'unknown';
  console.log('[HTTPS] [TLS] ✓ Handshake SUCCESS from ' + remote);
  console.log('[HTTPS] [TLS]   Protocol: ' + proto);
  console.log('[HTTPS] [TLS]   Cipher: ' + cipher);
});

// TLS handshake FAILED
httpsServer.on('tlsClientError', function(err, tlsSocket) {
  var remote = tlsSocket.remoteAddress ? (tlsSocket.remoteAddress + ':' + tlsSocket.remotePort) : 'unknown';
  console.log('[HTTPS] [TLS] ✗ Handshake FAILED from ' + remote);
  console.log('[HTTPS] [TLS]   Error: ' + err.message);
  console.log('[HTTPS] [TLS]   Code: ' + err.code);
});

// Client errors after TLS
httpsServer.on('clientError', function(err, socket) {
  var remote = socket.remoteAddress ? (socket.remoteAddress + ':' + socket.remotePort) : 'unknown';
  console.log('[HTTPS] [CLIENT] Error from ' + remote + ': ' + err.message);
});

httpsServer.on('error', function(err) {
  console.log('[HTTPS] Server error: ' + err.code + ' - ' + err.message);
  if (err.code === 'EADDRINUSE') {
    console.log('[HTTPS] Port ' + PORT + ' is already in use! Stop the other server first.');
  }
  process.exit(1);
});

httpsServer.listen(PORT, '0.0.0.0', function() {
  console.log('[HTTPS] Listening on port ' + PORT);
  console.log('[HTTPS] Try: https://' + (localIPs[0] || 'localhost') + ':' + PORT);
  console.log('');
  console.log('=== WAITING FOR CONNECTIONS ===');
  console.log('Connect from your phone and watch the logs above.');
  console.log('If you see [TCP] but no [TLS] → TLS handshake is failing');
  console.log('If you see [TLS] FAILED → check the error message');
  console.log('If you see nothing at all → phone cannot reach this machine (firewall/network)');
  console.log('');
  console.log('Also try plain HTTP from phone: http://' + (localIPs[0] || 'localhost') + ':' + HTTP_PORT);
  console.log('Press Ctrl+C to stop');
  console.log('');
});

process.on('uncaughtException', function(err) {
  console.log('[CRASH] ' + err.message);
  console.log(err.stack);
});
