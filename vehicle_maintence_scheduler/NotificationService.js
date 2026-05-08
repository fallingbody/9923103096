class NotificationService {
    constructor(token, baseURL = 'http://4.224.186.213/evaluation-service') {
        this.token = token;
        this.baseURL = baseURL.replace(/\/+$/, '');
        this.cache = null;
        this.cacheTime = 0;
        this.cacheTTL = 5 * 60 * 1000;
    }

    async getNotifications() {
        if (this.cache && Date.now() - this.cacheTime < this.cacheTTL) {
            return this.cache;
        }

        const response = await fetch(`${this.baseURL}/notifications`, {
            method: 'GET',
            headers: this._headers()
        });

        if (!response.ok) {
            throw new Error(`Unable to fetch notifications: HTTP ${response.status}`);
        }

        const data = await response.json();
        const notifications = data.notifications || [];

        this.cache = notifications;
        this.cacheTime = Date.now();

        return notifications;
    }

    async getPriorityNotifications(limit = 10) {
        const notifications = await this.getNotifications();

        return notifications
            .map(notification => ({
                ...notification,
                priorityScore: this._priorityScore(notification)
            }))
            .sort((a, b) => b.priorityScore - a.priorityScore)
            .slice(0, limit);
    }

    clearCache() {
        this.cache = null;
        this.cacheTime = 0;
    }

    _priorityScore(notification) {
        const type = notification.Type || notification.type || 'Event';
        const timestamp = notification.Timestamp || notification.timestamp;
        const isRead = notification.isRead === true || notification.IsRead === true;

        return (
            this._typeScore(type) +
            this._recencyScore(timestamp) +
            (isRead ? 0 : 20)
        );
    }

    _typeScore(type) {
        const scores = {
            Placement: 50,
            Result: 35,
            Event: 20
        };

        return scores[type] || 10;
    }

    _recencyScore(timestamp) {
        if (!timestamp) return 0;

        const createdAt = new Date(timestamp);
        if (Number.isNaN(createdAt.getTime())) return 0;

        const hoursOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
        return Math.max(0, 30 - hoursOld);
    }

    _headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationService;
}
