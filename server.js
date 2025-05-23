const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const os = require('os');

// Create Express app
const app = express();

// Serve static files from the public directory
app.use(express.static('public'));

// Function to get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    // console.log(interfaces);
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Create server based on environment
let server;
const isDevelopment = process.env.NODE_ENV !== 'production';

if (isDevelopment) {
    // SSL certificate options for development
    const options = {
        key: fs.readFileSync(path.join(__dirname, 'certificates', 'key.pem')),
        cert: fs.readFileSync(path.join(__dirname, 'certificates', 'cert.pem'))
    };
    server = https.createServer(options, app);
} else {
    // Use HTTP in production
    server = http.createServer(app);
}

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Set();

// Function to get client info
function getClientInfo(ws) {
    return {
        id: ws.id || 'unknown',
        readyState: ws.readyState,
        timestamp: new Date().toISOString()
    };
}

// Handle WebSocket server errors
wss.on('error', (error) => {
    console.error('WebSocket Server Error:', error);
});

// Handle HTTPS server errors
server.on('error', (error) => {
    console.error('HTTPS Server Error:', error);
});

wss.on('connection', (ws, req) => {
    // Generate a unique ID for this client
    ws.id = Math.random().toString(36).substring(7);
    
    const clientInfo = getClientInfo(ws);
    console.log('\n=== New Client Connected ===');
    console.log('Client ID:', clientInfo.id);
    console.log('Remote Address:', req.socket.remoteAddress);
    console.log('Time:', clientInfo.timestamp);
    console.log('Total clients:', clients.size + 1);
    console.log('===========================\n');
    
    clients.add(ws);

    // Send welcome message with server info
    try {
        ws.send(JSON.stringify({
            type: 'welcome',
            clientId: ws.id,
            totalClients: clients.size,
            serverIP: getLocalIP(),
            serverPort: PORT
        }));
    } catch (error) {
        console.error('Error sending welcome message:', error);
    }

    // Send message to all other clients
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('\n=== Message Received ===');
            console.log('From Client:', ws.id);
            console.log('Message Type:', Object.keys(data)[0]);
            console.log('Time:', new Date().toISOString());
            console.log('Total clients:', clients.size);
            console.log('========================\n');

            clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(message.toString());
                    console.log(`Forwarded message to client ${client.id}`);
                }
            });
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket Client Error:', error);
    });

    ws.on('close', () => {
        console.log('\n=== Client Disconnected ===');
        console.log('Client ID:', ws.id);
        console.log('Time:', new Date().toISOString());
        console.log('Remaining clients:', clients.size - 1);
        console.log('===========================\n');
        
        clients.delete(ws);
    });
});

// Express routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    const localIP = getLocalIP();
    const protocol = isDevelopment ? 'https' : 'http';
    console.log('\n=== WebRTC Signaling Server ===');
    console.log(`Server started on ${protocol}://${localIP}:${PORT}`);
    console.log('Environment:', isDevelopment ? 'Development' : 'Production');
    console.log('Waiting for connections...');
    console.log('=============================\n');
});
