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
