# Secure Chat App

This is a secure end-to-end encrypted chat application that simulates man-in-the-middle (MITM) attacks for educational purposes. It includes a real-time chat interface along with an attacker control panel that demonstrates various attack techniques such as interception, tampering, spoofing, and message corruption.

## Technologies Used

- JavaScript, HTML, CSS
- Socket.io for real-time communication
- Python (Flask) for the backend server
- RSA encryption for secure messaging

## Project Structure

```
secure-chat-app/
├── node_modules/
├── server/
│   ├── static/
│   ├── templates/
│   ├── app.py
│   └── requirements.txt
├── users.json
├── mitm-proxy.js
├── package.json
├── package-lock.json
└── README.md
```

## Getting Started

### 1. Install Dependencies

Install Python packages:

```bash
pip install -r server/requirements.txt
```

Install Node modules (if not already installed):

```bash
npm install
```

### 2. Run the Application

**Terminal 1** – Navigate to the `secure-chat-app` folder and start the MITM proxy:

```bash
node mitm-proxy.js
```

**Terminal 2** – Navigate into the `server` folder and run the Flask app:

```bash
cd server
python app.py
```

### 3. Open the Application in Your Browser

- Go to `http://localhost:5002/chat` to access the chat interface  
- Go to `http://localhost:5002` to access the attacker control panel
