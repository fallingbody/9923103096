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
