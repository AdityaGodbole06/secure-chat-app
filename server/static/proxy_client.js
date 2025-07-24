// MITM Proxy Client - This simulates a man-in-the-middle attack by intercepting and tampering with messages

class MITMProxy {
    constructor() {
        this.tamperingEnabled = true;
        this.messageLog = [];
        this.blockedUsers = new Set();
        this.messageReplacements = {};
        this.corruptNextMessage = false;
        this.messageDelay = 0;
        this.pendingMessages = [];
        
        this.setupProxy();
        this.setupControlPanel();
    }
    
    setupProxy() {
        this.originalIO = window.io;
        
        window.io = (url, options) => {
            console.log('Intercepting Socket.IO connection to:', url);
            
            // Create the original socket
            const originalSocket = this.originalIO(url, options);
            
            // Create a proxy for the socket
            const proxySocket = new Proxy(originalSocket, {
                get: (target, prop) => {
                    if (prop === 'emit') {
                        return (event, data) => {
                            this.logMessage(`OUT: ${event}`, data);
                            
                            // Apply tampering to outgoing messages
                            if (event === 'send_message' && data) {
                                const tamperedData = this.applyTampering(event, data);
                                if (tamperedData === null) {
                                    this.logMessage('Message blocked by proxy');
                                    return; 
                                }
                                if (tamperedData !== data) {
                                    this.logMessage('Message tampered before sending');
                                    data = tamperedData;
                                }
                            }
                            
                            return target.emit(event, data);
                        };
                    }
                    return target[prop];
                }
            });
            
            // Intercept incoming events by wrapping the on method
            const originalOn = originalSocket.on;
            originalSocket.on = (event, callback) => {
                const wrappedCallback = (data) => {
                    this.logMessage(`IN: ${event}`, data);
                    
                    // Apply tampering to incoming messages
                    if (event === 'receive_message' && data) {
                        const tamperedData = this.applyTampering(event, data);
                        if (tamperedData === null) {
                            this.logMessage('Incoming message blocked by proxy');
                            return; 
                        }
                        if (tamperedData !== data) {
                            this.logMessage('Incoming message tampered');
                            data = tamperedData;
                        }
                    }
                    
                    return callback(data);
                };
                
                return originalOn.call(originalSocket, event, wrappedCallback);
            };
            
            return proxySocket;
        };
        
        console.log('MITM Proxy initialized - Socket.IO constructor replaced');
    }
    
    applyTampering(event, data) {
        if (!this.tamperingEnabled) return data;
        
        // Block messages from blocked users
        if (data.nickname && this.blockedUsers.has(data.nickname)) {
            this.logMessage(`Blocked message from ${data.nickname}`);
            return null;
        }
        
        // Apply message replacements
        if (data.text) {
            for (const [original, replacement] of Object.entries(this.messageReplacements)) {
                if (data.text.includes(original)) {
                    data.text = data.text.replace(original, replacement);
                    this.logMessage(`Replaced '${original}' with '${replacement}'`);
                }
            }
        }
        
        // Corrupt encrypted messages
        if (this.corruptNextMessage) {
            if (data.encrypted && data.ciphertext) {
                // Tamper with ciphertext to break encryption
                const ct = data.ciphertext;
                if (ct.length > 4) {
                    // Change a few characters in the middle to corrupt it
                    const mid = Math.floor(ct.length / 2);
                    data.ciphertext = ct.substring(0, mid) + 'XX' + ct.substring(mid + 2);
                    this.logMessage('Corrupted encrypted message ciphertext');
                }
            } else if (data.text) {
                data.text = 'CORRUPTED BY PROXY';
                this.logMessage('Corrupted plaintext message');
            }
            this.corruptNextMessage = false;
        }
        
        // Delay messages
        if (this.messageDelay > 0) {
            const delayTime = this.messageDelay * 1000;
            this.messageDelay = 0;
            
            this.logMessage(`Delaying message by ${delayTime}ms`);
            
            // Store the message to send later
            setTimeout(() => {
                this.logMessage('Sending delayed message');
                if (window.socket) {
                    window.socket.emit(event, data);
                }
            }, delayTime);
            
            return null; 
        }
        
        return data;
    }
    
    logMessage(message, data = null) {
        const timestamp = new Date().toLocaleTimeString();
        let logEntry = `[${timestamp}] ${message}`;
        
        if (data) {
            // Format message data nicely
            if (data.nickname && data.text) {
                logEntry += `\n   From: ${data.nickname}`;
                logEntry += `\n   To: ${data.recipient || 'all'}`;
                logEntry += `\n   Message: ${data.text}`;
                if (data.encrypted) {
                    logEntry += `\n   Encrypted: Yes (${data.ciphertext ? data.ciphertext.substring(0, 20) + '...' : 'No ciphertext'})`;
                } else {
                    logEntry += `\n   Encrypted: No`;
                }
            } else if (data.users) {
                logEntry += `\n   Users: ${data.users.join(', ')}`;
            } else {
                logEntry += `\n   Data: ${JSON.stringify(data, null, 2)}`;
            }
        }
        
        this.messageLog.push(logEntry);
        console.log("logEntry: ", logEntry);
        console.log(logEntry);
        
        // Update control panel if it exists
        if (window.updateProxyLog) {
            console.log('Updating proxy log:', logEntry);
            window.updateProxyLog(logEntry);
        }
    }
    
    setupControlPanel() {
        // Create control panel functions
        window.proxyControls = {
            toggleTampering: () => {
                this.tamperingEnabled = !this.tamperingEnabled;
                const status = this.tamperingEnabled ? 'enabled' : 'disabled';
                this.logMessage(`Tampering ${status}`);
            },
            
            addReplacement: (original, replacement) => {
                if (original && replacement) {
                    this.messageReplacements[original] = replacement;
                    this.logMessage(`Added replacement rule: '${original}' -> '${replacement}'`);
                }
            },
            
            blockUser: (username) => {
                if (username) {
                    this.blockedUsers.add(username);
                    this.logMessage(`Blocked user: ${username}`);
                }
            },
            
            unblockAll: () => {
                this.blockedUsers.clear();
                this.logMessage('Unblocked all users');
            },
            
            corruptNext: () => {
                this.corruptNextMessage = true;
                this.logMessage('Next message will be corrupted');
            },
            
            delayMessages: (seconds = 5) => {
                this.messageDelay = seconds;
                this.logMessage(`Messages will be delayed by ${seconds} seconds`);
            },
            
            injectMessage: (text) => {
                if (text) {
                    const fakeMsg = {
                        nickname: 'PROXY_INJECTED',
                        text: text,
                        recipient: 'all'
                    };
                    
                    // Emit the fake message using the current socket
                    if (window.socket) {
                        window.socket.emit('send_message', fakeMsg);
                        this.logMessage(`Injected fake message: ${fakeMsg.text}`);
                    }
                }
            },
            
            getLogs: () => {
                return this.messageLog;
            }
        };
        
        console.log('MITM Proxy control panel ready');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.mitmProxy = new MITMProxy();
    console.log('MITM Proxy setup complete');
    
    // Test 
    setTimeout(() => {
        if (window.updateProxyLog) {
            window.updateProxyLog('MITM Proxy initialized and ready to intercept messages...');
        }
    }, 1000);
});

window.updateProxyLog = (message) => {
    const logElement = document.getElementById('proxyLog');
    if (logElement) {
        logElement.innerHTML += message + '\n';
        logElement.scrollTop = logElement.scrollHeight;
        console.log('Updated proxy log:', message);
    } else {
        console.log('Proxy log element not found');
    }
}; 