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

@app.route(f'{API_PREFIX}/notifications/send', methods=['POST'])
@require_auth
def send_notification():
    data = request.get_json()
    
    for field in ['studentId', 'type', 'title', 'message']:
        if field not in data:
            return jsonify({
                'status': 'error',
                'code': 'INVALID_INPUT',
                'message': f'Missing {field}'
            }), 400
    
    notification = {
        'studentId': data['studentId'],
        'type': data['type'],
        'title': data['title'],
        'message': data['message'],
        'isRead': False,
        'createdAt': datetime.now().isoformat()
    }
    
    if not db.execute_insert('notifications', notification):
        return jsonify({'status': 'error', 'code': 'DB_ERROR', 'message': 'Failed to save'}), 500
    
    cache.delete(f"notifications:{data['studentId']}:*")
    return jsonify({
        'status': 'success',
        'data': {
            'id': 'uuid',
            'studentId': data['studentId'],
            'createdAt': notification['createdAt']
        }
    }), 201

@app.route(f'{API_PREFIX}/notifications/<notification_id>/read', methods=['PATCH'])
@require_auth
def mark_as_read(notification_id):
    update_data = {
        'isRead': True,
        'readAt': datetime.now().isoformat()
    }
    
    if not db.execute_update('notifications', {'id': notification_id}, update_data):
        return jsonify({'status': 'error', 'code': 'NOT_FOUND', 'message': 'Not found'}), 404
    
    return jsonify({
        'status': 'success',
        'data': {'id': notification_id, 'isRead': True}
    }), 200

@app.route(f'{API_PREFIX}/notifications/bulk/read', methods=['PATCH'])
@require_auth
def bulk_mark_as_read():
    data = request.get_json()
    ids = data.get('notificationIds', [])
    
    if not ids:
        return jsonify({
            'status': 'error',
            'code': 'INVALID_INPUT',
            'message': 'Missing ids'
        }), 400
    
    read_time = datetime.now().isoformat()
    for notif_id in ids:
        db.execute_update('notifications', {'id': notif_id}, {'isRead': True, 'readAt': read_time})
    
    return jsonify({
        'status': 'success',
        'data': {'updated': len(ids)}
    }), 200

@app.route(f'{API_PREFIX}/notifications/<notification_id>', methods=['DELETE'])
@require_auth
def delete_notification(notification_id):
    if not db.execute_update('notifications', {'id': notification_id}, {'deletedAt': datetime.now().isoformat()}):
        return jsonify({'status': 'error', 'code': 'NOT_FOUND', 'message': 'Not found'}), 404
    
    return '', 204

@app.route(f'{API_PREFIX}/notifications/priority', methods=['GET'])
@require_auth
def get_priority_notifications():
    student_id = request.args.get('studentId')
    limit = int(request.args.get('limit', 10))
    
    if not student_id:
        return jsonify({
            'status': 'error',
            'code': 'INVALID_INPUT',
            'message': 'Missing studentId'
        }), 400
    
    query = f"""SELECT n.*, 
        (CASE WHEN n.type='Placement' THEN 40 
              WHEN n.type='Result' THEN 30 
              ELSE 20 END * 0.4) as priorityScore 
        FROM notifications n 
        WHERE n.studentId='{student_id}' 
        ORDER BY priorityScore DESC 
        LIMIT {limit}"""
    
    notifications = db.execute_query(query)
    
    return jsonify({
        'status': 'success',
        'data': {'notifications': notifications, 'total': len(notifications)}
    }), 200
