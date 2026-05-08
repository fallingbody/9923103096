from flask import Flask, request, jsonify
from functools import wraps
from datetime import datetime
import json
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MockDB:
    def execute_query(self, query):
        return []
    
    def execute_insert(self, table, data):
        return True
    
    def execute_update(self, table, where, data):
        return True


class MockRedis:
    def get(self, key):
        return None
    
    def setex(self, key, ttl, value):
        return True
    
    def delete(self, key):
        return True


db = MockDB()
cache = MockRedis()

def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'status': 'error', 'code': 'AUTH_FAILED', 'message': 'Invalid token'}), 401
        
        token = auth_header.split('Bearer ')[1]
        if not len(token) > 10:
            return jsonify({'status': 'error', 'code': 'AUTH_FAILED', 'message': 'Invalid token'}), 401
        
        return f(*args, **kwargs)
    
    return decorated_function
