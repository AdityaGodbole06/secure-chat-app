console.log("script.js loaded");

// Connect to the same server that served this page (proxy or direct)
const socket = io();

socket.on('connect', () => {
    console.log('Connected to chat server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from chat server');
});

socket.on('connect_error', (error) => {
    console.log('Connection error:', error);
});

// Test event listener
socket.on('test', (data) => {
    console.log('Received test event via proxy:', data);
});

socket.on('proxy_warning', (data) => {
    console.warn('PROXY WARNING:', data.message);
    showProxyWarning(data.message);
});

socket.on('message_tampered', (data) => {
    console.warn('MESSAGE TAMPERED:', data);
    showTamperingAlert();
});

const chat = document.getElementById('chat');
const input = document.getElementById('messageInput');
const encryptToggle = document.getElementById('encryptToggle');
const welcomeMsg = document.getElementById('welcomeMsg');

let publicKey = null;
let privateKey = null;
let nickname = "";
let recipient = "";
let recipientPublicKey = null;
let password = "";
let isLoggedIn = false;

// UI section references
const landingSection = document.getElementById('landingSection');
const registerSection = document.getElementById('registerSection');
const loginSection = document.getElementById('loginSection');
const userListSection = document.getElementById('userListSection');
const chatSection = document.getElementById('chatSection');

function addProxyWarningBanner() {
    const banner = document.createElement('div');
    banner.id = 'proxyWarning';
    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(45deg, #ff4444, #ff6666);
        color: white;
        padding: 10px;
        text-align: center;
        font-weight: bold;
        z-index: 9999;
        display: none;
        animation: pulse 2s infinite;
    `;
    banner.innerHTML = 'WARNING: Connection routed through MITM Proxy - Messages may be monitored/modified!';
    document.body.insertBefore(banner, document.body.firstChild);
}

function showProxyWarning(message) {
    const banner = document.getElementById('proxyWarning');
    if (banner) {
        banner.textContent = `PROXY: ${message}`;
        banner.style.display = 'block';
        setTimeout(() => {
            banner.style.display = 'none';
        }, 5000);
    }
}

function showTamperingAlert() {
    const alert = document.createElement('div');
    alert.style.cssText = `
        position: fixed;
        top: 50px;
        right: 20px;
        background: #ff3333;
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;
    alert.textContent = 'Message tampering detected!';
    document.body.appendChild(alert);
    setTimeout(() => {
        document.body.removeChild(alert);
    }, 3000);
}

window.onload = () => {
  addProxyWarningBanner();
  
  setTimeout(() => {
      showProxyWarning('Connection established through MITM proxy on port 5002');
  }, 1000);
  
  landingSection.style.display = 'block';
  registerSection.style.display = 'none';
  loginSection.style.display = 'none';
  userListSection.style.display = 'none';
  chatSection.style.display = 'none';

  // Show Register form
  document.getElementById('showRegisterBtn').onclick = () => {
    landingSection.style.display = 'none';
    registerSection.style.display = 'block';
  };
  // Show Login form
  document.getElementById('showLoginBtn').onclick = () => {
    landingSection.style.display = 'none';
    loginSection.style.display = 'block';
  };
  // Back buttons
  document.getElementById('registerBackBtn').onclick = () => {
    registerSection.style.display = 'none';
    landingSection.style.display = 'block';
  };
  document.getElementById('loginBackBtn').onclick = () => {
    loginSection.style.display = 'none';
    landingSection.style.display = 'block';
  };

  // Register
  document.getElementById('registerBtn').onclick = async () => {
    nickname = document.getElementById('registerNickname').value.trim();
    const pw1 = document.getElementById('registerPassword').value;
    const pw2 = document.getElementById('registerPassword2').value;
    if (!nickname || !pw1 || !pw2) return alert('Please fill all fields!');
    if (pw1 !== pw2) return alert('Passwords do not match!');
    // Generate RSA key pair
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["encrypt", "decrypt"]
    );
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;
    const exportedKey = await window.crypto.subtle.exportKey('spki', publicKey);
    const pemKey = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));
    password = pw1;
    console.log('Sending registration through proxy...');
    socket.emit('register', { nickname, password, public_key: pemKey });
  };

  // Login
  document.getElementById('loginBtn').onclick = async () => {
    nickname = document.getElementById('loginNickname').value.trim();
    const pw = document.getElementById('loginPassword').value;
    if (!nickname || !pw) return alert('Please fill all fields!');
    // Generate RSA key pair
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["encrypt", "decrypt"]
    );
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;
    const exportedKey = await window.crypto.subtle.exportKey('spki', publicKey);
    const pemKey = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));
    password = pw;
    console.log('Sending login through proxy...');
    socket.emit('login', { nickname, password, public_key: pemKey });
  };

  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  
  document.getElementById('messageInput').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      sendMessage();
    }
  });
};

socket.on('register_response', (data) => {
  console.log('Received register_response event via proxy:', data);
  if (!data.success) {
    alert(data.error || 'Registration failed');
    registerSection.style.display = 'none';
    loginSection.style.display = 'none';
    landingSection.style.display = 'block';
  } else {
    isLoggedIn = true;
    console.log('Registration successful via proxy, isLoggedIn set to true');
  }
});

socket.on('login_response', (data) => {
  console.log('Received login_response event via proxy:', data);
  if (!data.success) {
    alert(data.error || 'Login failed');
    registerSection.style.display = 'none';
    loginSection.style.display = 'none';
    landingSection.style.display = 'block';
  } else {
    isLoggedIn = true;
    console.log('Login successful via proxy, isLoggedIn set to true');
    loginSection.style.display = 'none';
    registerSection.style.display = 'none';
    landingSection.style.display = 'none';
  }
});

socket.on('users_list', (data) => {
  console.log('Received users_list event via proxy:', data);
  console.log('isLoggedIn:', isLoggedIn, 'nickname:', nickname);
  if (!isLoggedIn) {
    console.log('Not logged in, ignoring users_list');
    return;
  }
  console.log('Processing users_list via proxy, showing user list section');
  registerSection.style.display = 'none';
  loginSection.style.display = 'none';
  landingSection.style.display = 'none';
  userListSection.style.display = 'block';
  chatSection.style.display = 'none';
  console.log('UI sections updated - userListSection should be visible');
  
  if (nickname) {
    welcomeMsg.textContent = `Welcome, ${nickname}!`;
    welcomeMsg.style.display = 'block';
    console.log('Welcome message set:', welcomeMsg.textContent);
  } else {
    welcomeMsg.style.display = 'none';
  }
  
  const users = data.users.filter(u => u !== nickname);
  console.log('Filtered users:', users);
  const userList = document.getElementById('userList');
  userList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user;
    li.onclick = () => {
      recipient = user;
      userListSection.style.display = 'none';
      chatSection.style.display = 'block';
      welcomeMsg.style.display = 'block';
    };
    userList.appendChild(li);
  });
  console.log('User list populated with', users.length, 'users via proxy');
});

// Handle incoming messages (potentially tampered)
socket.on('receive_message', async (data) => {
    console.log('Received message via proxy (may be tampered):', data);

    let isMe = (data.nickname === nickname);
    let usernameHtml = `<span class="chat-username">${data.nickname}</span>`;

    // Proxy Injection Label
    if (data.nickname === 'PROXY_INJECTED') {
        usernameHtml = `<span class="chat-username" style="color: #ff4444;">[PROXY INJECTION]</span>`;
        showTamperingAlert();
    }

    let bubbleClass = isMe ? 'chat-bubble me' : 'chat-bubble other';
    let rowClass = isMe ? 'chat-row me' : 'chat-row';
    let messageHtml = '';

    if (isMe) {
        return; 
    }

    if (encryptToggle.checked) {
        if (data.encrypted && data.ciphertext) {
            try {
                const encryptedBytes = Uint8Array.from(atob(data.ciphertext), c => c.charCodeAt(0));
                const decrypted = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encryptedBytes);
                const decryptedText = new TextDecoder().decode(decrypted);
                messageHtml = `${usernameHtml}<div class='${bubbleClass}'>${decryptedText}</div>`;
            } catch (error) {
                console.error('Decryption failed - message may have been tampered:', error);
                messageHtml = `${usernameHtml}<div class='${bubbleClass}' style='background-color: #ff6666; color: white;'>[DECRYPTION FAILED - POSSIBLE TAMPERING]</div>`;
                showTamperingAlert();
            }
        } else {
            messageHtml = `${usernameHtml}<div class='${bubbleClass}' style='background-color: #ff6666; color: white;'>[UNENCRYPTED MESSAGE BLOCKED]</div>`;
            showTamperingAlert();
        }

    } else {
        if (data.text) {
            if (data.text.includes('CORRUPTED') || data.text.includes('MITM') || data.text.includes('PROXY')) {
                bubbleClass += ' tampered';
                showTamperingAlert();
            }
            messageHtml = `${usernameHtml}<div class='${bubbleClass}'>${data.text}</div>`;
        } else {
            messageHtml = `${usernameHtml}<div class='${bubbleClass}' style='background-color: #ff6666; color: white;'>[NO TEXT FOUND]</div>`;
        }
    }

    if (messageHtml) {
        chat.innerHTML += `<div class='${rowClass}'>${messageHtml}</div>`;
        chat.scrollTop = chat.scrollHeight;
    }
});


socket.on('public_key_response', async (data) => {
    console.log('Received public key via proxy:', data);
    if (data.public_key) {
        console.log(`Received public key for ${data.nickname} via proxy`);
        try {
            const binaryDer = Uint8Array.from(atob(data.public_key), c => c.charCodeAt(0));
            recipientPublicKey = await window.crypto.subtle.importKey(
                'spki',
                binaryDer.buffer,
                { name: "RSA-OAEP", hash: "SHA-256" },
                true,
                ["encrypt"]
            );
            sendEncryptedMessage();
        } catch (error) {
            console.error('Failed to import public key - may have been tampered:', error);
            alert('Public key import failed - possible tampering detected!');
            showTamperingAlert();
        }
    } else {
        alert(`No public key found for ${recipient}`);
    }
});

async function sendEncryptedMessage() {
    const text = input.value.trim();
    if (!text || !recipientPublicKey) return;

    chat.innerHTML += `<div class='chat-row me'><span class='chat-username'>${nickname}</span><div class='chat-bubble me'>${text}</div></div>`;
    chat.scrollTop = chat.scrollHeight;

    input.value = "";

    try {
        const encoded = new TextEncoder().encode(text);
        const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPublicKey, encoded);
        const ciphertext = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
        
        console.log('Sending encrypted message via proxy...');
        socket.emit('send_message', { nickname, recipient, encrypted: true, ciphertext });
    } catch (error) {
        console.error('Encryption failed:', error);
        alert('Failed to encrypt message!');
    }
}

async function sendMessage() {
    console.log("Sending message via proxy...");
    const text = input.value.trim();
    if (!text) return;

    if (encryptToggle.checked) {
        console.log('Requesting public key via proxy...');
        socket.emit('get_public_key', { target: recipient });
    } else {
        chat.innerHTML += `<div class='chat-row me'><span class='chat-username'>${nickname}</span><div class='chat-bubble me'>${text}</div></div>`;
        chat.scrollTop = chat.scrollHeight;

        input.value = "";
        console.log('Sending plaintext message via proxy...');
        socket.emit('send_message', { nickname, recipient, text });
    }
}

const style = document.createElement('style');
style.textContent = `
    .chat-bubble.tampered {
        background-color: #ff6666 !important;
        border: 2px solid #ff0000 !important;
        animation: shake 0.5s ease-in-out;
    }
    
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }
    
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
    }
    
    #proxyWarning {
        animation: pulse 2s infinite;
    }
`;
document.head.appendChild(style);

window.testProxyCommands = {
    sendTestMessage: () => {
        socket.emit('send_message', { 
            nickname: nickname || 'TestUser', 
            recipient: recipient || 'all', 
            text: 'This is a test message through the proxy' 
        });
    },
    
    sendEncryptedTest: () => {
        if (recipientPublicKey) {
            sendEncryptedMessage();
        } else {
            console.log('No recipient public key available');
        }
    },
    
    checkProxyConnection: () => {
        console.log('Proxy connection status:', socket.connected);
        console.log('Socket ID:', socket.id);
    }
};

console.log('Proxy test commands available: window.testProxyCommands');
console.log('REMINDER: All traffic is routed through MITM proxy on port 5002');