class NotificationService {
    constructor(baseURL = 'http://4.224.186.213/evaluation-service', token) {
        const defaultBaseURL = 'http://4.224.186.213/evaluation-service';
        const baseURLLooksProvided = /^https?:\/\//i.test(baseURL);

        this.baseURL = (baseURLLooksProvided ? baseURL : defaultBaseURL).replace(/\/+$/, '');
        this.apiPath = '/api/v1';
        this.token = baseURLLooksProvided ? token : baseURL;
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000;
        this.listeners = [];
    }
    
    async getNotifications(studentId, options = {}) {
        const { limit = 20, offset = 0, filter = 'all' } = options;
        const cacheKey = `notifications:${studentId}:${offset}:${limit}`;
        
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
        
        const params = new URLSearchParams({ studentId, limit, offset, filter });
        const response = await fetch(
            this._buildURL('/notifications', params),
            { method: 'GET', headers: this._getHeaders() }
        );
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        this._setCache(cacheKey, data.data.notifications);
        
        return data.data.notifications;
    }
    async getPriorityNotifications(studentId, limit = 10) {
        const cacheKey = `priority:${studentId}:${limit}`;
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;
        
        const response = await fetch(
            this._buildURL('/notifications/priority', { studentId, limit }),
            { method: 'GET', headers: this._getHeaders() }
        );
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        this._setCache(cacheKey, data.data.notifications);
        
        return data.data.notifications;
    }
    async sendNotification(notification) {
        const response = await fetch(
            this._buildURL('/notifications/send'),
            {
                method: 'POST',
                headers: this._getHeaders(),
                body: JSON.stringify(notification)
            }
        );
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        this._invalidateCache(notification.studentId);
        this._notifyListeners('notification:created', data.data);
        
        return data.data;
    }
    async markAsRead(notificationId) {
        const response = await fetch(
            this._buildURL(`/notifications/${notificationId}/read`),
            { method: 'PATCH', headers: this._getHeaders() }
        );
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        this._clearCache();
        this._notifyListeners('notification:read', { id: notificationId });
    }
    async bulkMarkAsRead(notificationIds) {
        const response = await fetch(
            this._buildURL('/notifications/bulk/read'),
            {
                method: 'PATCH',
                headers: this._getHeaders(),
                body: JSON.stringify({ notificationIds })
            }
        );
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        this._clearCache();
        this._notifyListeners('notifications:read:bulk', { count: notificationIds.length });
    }
    async deleteNotification(notificationId) {
        const response = await fetch(
            this._buildURL(`/notifications/${notificationId}`),
            { method: 'DELETE', headers: this._getHeaders() }
        );
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        this._clearCache();
        this._notifyListeners('notification:deleted', { id: notificationId });
    }
    subscribe(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }
    
    unsubscribe(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }
    _notifyListeners(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(e);
                }
            });
        }
    }
    
    _getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }

    _buildURL(path, params = null) {
        const url = new URL(`${this.baseURL}${this.apiPath}${path}`);

        if (params) {
            const searchParams = params instanceof URLSearchParams
                ? params
                : new URLSearchParams(params);

            url.search = searchParams.toString();
        }

        return url.toString();
    }

    _getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        if (Date.now() - cached.timestamp > this.cacheTTL) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }
    
    _setCache(key, data) {
        this.cache.set(key, { data, timestamp: Date.now() });
    }
    
    _invalidateCache(studentId) {
        for (const key of this.cache.keys()) {
            if (key.includes(`notifications:${studentId}`)) {
                this.cache.delete(key);
            }
        }
    }
    
    _clearCache() {
        this.cache.clear();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationService;
}
