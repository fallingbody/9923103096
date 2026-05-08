from flask import Flask, request, jsonify
from functools import wraps
from datetime import datetime
import json
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
API_PREFIX = '/evaluation-service/api/v1'


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

@app.route(f'{API_PREFIX}/notifications', methods=['GET'])
@require_auth
def get_notifications():
    student_id = request.args.get('studentId')
    limit = min(int(request.args.get('limit', 20)), 100)
    offset = int(request.args.get('offset', 0))
    
    if not student_id:
        return jsonify({'status': 'error', 'code': 'INVALID_INPUT', 'message': 'Missing studentId'}), 400
    
    cache_key = f"notifications:{student_id}:page:{offset//limit}"
    cached = cache.get(cache_key)
    if cached:
        return jsonify(json.loads(cached)), 200
    
    query = f"SELECT * FROM notifications WHERE studentId = '{student_id}' ORDER BY createdAt DESC LIMIT {limit} OFFSET {offset}"
    notifications = db.execute_query(query)
    
    response = {
        'status': 'success',
        'data': {
            'notifications': notifications,
            'total': len(notifications)
        },
        'timestamp': datetime.now().isoformat()
    }
    
    cache.setex(cache_key, 300, json.dumps(response))
    return jsonify(response), 200
