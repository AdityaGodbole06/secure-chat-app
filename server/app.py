import os
import json
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, disconnect
import eventlet
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

USERS_FILE = os.path.join(os.path.dirname(__file__), 'users.json')

MITM_TAMPER = False  
last_message = None 

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/proxy_client.html')
def proxy_client():
    return render_template('proxy_client.html')

@socketio.on('get_users')
def handle_get_users(data):
    current_nickname = data.get('nickname')
    users = [name for name in active_users.keys() if name != current_nickname]
    emit('users_list', {'users': users})

@socketio.on('register')
def handle_register(data):
    nickname = data.get('nickname')
    password = data.get('password')
    public_key = data.get('public_key')
    users = load_users()
    sid = request.sid
    
    print(f"\n  [MITM] User registration attempt:")
    print(f"   Nickname: {nickname}")
    print(f"   Has password: {bool(password)}")
    print(f"   Has public key: {bool(public_key)}")
    
    if not (nickname and password and public_key):
        print(f"   Registration failed: Missing fields")
        emit('register_response', {'success': False, 'error': 'Missing fields'})
        return
    if nickname in users:
        print(f"   Registration failed: Nickname already exists")
        emit('register_response', {'success': False, 'error': 'Nickname already exists'})
        return
        
    users[nickname] = {
        'password_hash': generate_password_hash(password),
        'public_key': public_key
    }
    save_users(users)
    active_users[nickname] = {'sid': sid, 'public_key': public_key}
    print(f"   {nickname} registered and is now active.")
    socketio.emit('users_list', {'users': list(active_users.keys())})
    emit('register_response', {'success': True})

@socketio.on('login')
def handle_login(data):
    nickname = data.get('nickname')
    password = data.get('password')
    public_key = data.get('public_key')
    users = load_users()
    sid = request.sid
    
    print(f"\n  [MITM] User login attempt:")
    print(f"   Nickname: {nickname}")
    print(f"   Has password: {bool(password)}")
    print(f"   Has public key: {bool(public_key)}")
    
    if not (nickname and password and public_key):
        print(f"    Login failed: Missing fields")
        emit('login_response', {'success': False, 'error': 'Missing fields'})
        return
    if nickname not in users:
        print(f"    Login failed: User does not exist")
        emit('login_response', {'success': False, 'error': 'User does not exist'})
        return
    if not check_password_hash(users[nickname]['password_hash'], password):
        print(f"    Login failed: Incorrect password")
        emit('login_response', {'success': False, 'error': 'Incorrect password'})
        return
        
    # Update public key if changed
    if users[nickname]['public_key'] != public_key:
        users[nickname]['public_key'] = public_key
        save_users(users)
        print(f"    Updated public key for {nickname}")
        
    active_users[nickname] = {'sid': sid, 'public_key': public_key}
    print(f"    {nickname} logged in and is now active.")
    # Send login response first, then user list
    emit('login_response', {'success': True})
    socketio.emit('users_list', {'users': list(active_users.keys())})

@socketio.on('get_public_key')
def handle_get_public_key(data):
    target_nickname = data.get('target')
    users = load_users()
    public_key = users.get(target_nickname, {}).get('public_key')
    emit('public_key_response', {'nickname': target_nickname, 'public_key': public_key})

@socketio.on('send_message')
def handle_send(data):
    global last_message
    
    print(f"\n  [MITM] Server intercepted message:")
    print(f"   From: {data.get('nickname', 'Unknown')}")
    print(f"   To: {data.get('recipient', 'all')}")
    print(f"   Message: {data.get('text', 'No text')}")
    print(f"   Encrypted: {data.get('encrypted', False)}")
    if data.get('ciphertext'):
        print(f"   Ciphertext: {data['ciphertext'][:50]}...")
    
    if data.get('text') == '/replay':
        if last_message:
            print("[MITM] Replaying last message:", last_message)
            emit('receive_message', last_message, broadcast=True, include_self=True)
        else:
            print("[MITM] No message to replay.")
        return
        
    if MITM_TAMPER:
        if data.get('encrypted') and data.get('ciphertext'):
            ct = data['ciphertext']
            if len(ct) > 4:
                tampered = ct[:2] + 'ZZ' + ct[4:]
                data['ciphertext'] = tampered
                print(f"[MITM] Tampered ciphertext: {tampered}")
        elif data.get('text'):
            data['text'] = 'MITM hacked this!'
            print(f"[MITM] Tampered plaintext: {data['text']}")
            
    print(f"[Server] Relaying message from {data.get('nickname')} to {data.get('recipient')}")
    emit('receive_message', data, broadcast=True, include_self=True)
    last_message = data.copy()

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    to_remove = None
    for nickname, info in active_users.items():
        if info['sid'] == sid:
            to_remove = nickname
            break
    if to_remove:
        print(f"[Server] {to_remove} disconnected.")
        del active_users[to_remove]
        socketio.emit('users_list', {'users': list(active_users.keys())})

def load_users():
    if not os.path.exists(USERS_FILE):
        return {}
    with open(USERS_FILE, 'r') as f:
        return json.load(f)

def save_users(users):
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f)

active_users = {} 

if __name__ == '__main__':
    print("Starting Server...")
    socketio.run(app, host='0.0.0.0', port=5001)
