# Notification System Design

## Stage 1: REST API Design

### Core Actions
The notification platform should support:
1. **Send Notification** - Send notifications to users
2. **Get Notifications** - Fetch notifications for a user
3. **Mark as Read** - Mark notification as read
4. **Delete Notification** - Remove notifications

### REST API Endpoints

#### 1. Get Notifications (GET)
```
GET /api/v1/notifications
Headers:
  - Authorization: Bearer <token>
  - Content-Type: application/json

Query Parameters:
  - studentId (required): string - Student ID
  - limit (optional): number - Default: 20, Max: 100
  - offset (optional): number - Default: 0
  - filter (optional): string - "all", "unread", "read"

Response (200 OK):
{
  "status": "success",
  "data": {
    "notifications": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "studentId": "1042",
        "type": "Event",
        "title": "Interview Scheduled",
        "message": "You have an interview scheduled for tomorrow",
        "timestamp": "2026-04-22T17:51:30Z",
        "isRead": false,
        "priority": "high",
        "metadata": {
          "eventId": "evt-123",
          "companyName": "Tech Corp"
        }
      }
    ],
    "total": 45,
    "unreadCount": 12
  },
  "timestamp": "2026-05-08T10:30:45Z"
}

Error Response (401 Unauthorized):
{
  "status": "error",
  "code": "AUTH_FAILED",
  "message": "Invalid or expired token"
}
```

#### 2. Send Notification (POST)
```
POST /api/v1/notifications/send
Headers:
  - Authorization: Bearer <token>
  - Content-Type: application/json

Request Body:
{
  "studentId": "1042",
  "type": "Event",
  "title": "Placement Drive",
  "message": "New placement drive from Accenture",
  "priority": "high",
  "metadata": {
    "companyId": "acc-001",
    "driveId": "drive-123"
  }
}

Response (201 Created):
{
  "status": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "studentId": "1042",
    "type": "Event",
    "createdAt": "2026-05-08T10:30:45Z"
  }
}

Error Response (400 Bad Request):
{
  "status": "error",
  "code": "INVALID_INPUT",
  "message": "Missing required field: type"
}
```

#### 3. Mark Notification as Read (PATCH)
```
PATCH /api/v1/notifications/{notificationId}/read
Headers:
  - Authorization: Bearer <token>
  - Content-Type: application/json

Response (200 OK):
{
  "status": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "isRead": true,
    "readAt": "2026-05-08T10:30:45Z"
  }
}
```

#### 4. Delete Notification (DELETE)
```
DELETE /api/v1/notifications/{notificationId}
Headers:
  - Authorization: Bearer <token>

Response (204 No Content)
```

#### 5. Bulk Mark as Read (PATCH)
```
PATCH /api/v1/notifications/bulk/read
Headers:
  - Authorization: Bearer <token>
  - Content-Type: application/json

Request Body:
{
  "notificationIds": ["id1", "id2", "id3"]
}

Response (200 OK):
{
  "status": "success",
  "data": {
    "updated": 3,
    "timestamp": "2026-05-08T10:30:45Z"
  }
}
```

---

## Stage 2: Database Schema & Optimization

### Suggested Storage: PostgreSQL
**Reason**: Relational DB handles structured notification data, supports complex queries, excellent for indexing, better than NoSQL for this use case.

### Database Schema

```sql
-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    studentId VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_studentId (studentId)
);

-- Create notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    studentId VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    isRead BOOLEAN DEFAULT FALSE,
    priority VARCHAR(20) DEFAULT 'normal',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    readAt TIMESTAMP NULL,
    FOREIGN KEY (studentId) REFERENCES users(studentId),
    INDEX idx_studentId_createdAt (studentId, createdAt DESC),
    INDEX idx_studentId_isRead (studentId, isRead),
    INDEX idx_priority (priority)
);

-- Create notification_metadata table
CREATE TABLE notification_metadata (
    id SERIAL PRIMARY KEY,
    notificationId UUID NOT NULL,
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    FOREIGN KEY (notificationId) REFERENCES notifications(id),
    INDEX idx_notificationId (notificationId)
);

-- Create notification_logs table (for audit trail)
CREATE TABLE notification_logs (
    id SERIAL PRIMARY KEY,
    notificationId UUID NOT NULL,
    event VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details JSON NULL,
    FOREIGN KEY (notificationId) REFERENCES notifications(id)
);
```

### Performance Optimization Issues & Solutions

**Problem 1**: Query fetching all unread notifications is slow (50K+ students, 5M+ notifications)
- **Solution**: Use composite indexes on (studentId, isRead, createdAt)
- **Impact**: Reduces query time from O(n) to O(log n)

**Problem 2**: Adding indexes slows down writes
- **Solution**: Use covering indexes, batch inserts, implement write buffers
- **Impact**: Write performance maintained within acceptable limits

---

## Stage 3: Query for Placement Notifications (Last 7 Days)

```sql
-- Find all students who got placement notification in last 7 days
SELECT DISTINCT
    u.studentId,
    u.email,
    u.name,
    COUNT(n.id) as notificationCount,
    MAX(n.createdAt) as lastNotificationTime
FROM users u
INNER JOIN notifications n ON u.studentId = n.studentId
WHERE n.type IN ('Placement', 'Result', 'Event')
  AND n.createdAt >= NOW() - INTERVAL '7 days'
GROUP BY u.studentId, u.email, u.name
ORDER BY MAX(n.createdAt) DESC;

-- Alternative: With unread count
SELECT 
    u.studentId,
    u.email,
    COUNT(CASE WHEN n.isRead = false THEN 1 END) as unreadCount,
    COUNT(CASE WHEN n.isRead = true THEN 1 END) as readCount
FROM users u
INNER JOIN notifications n ON u.studentId = n.studentId
WHERE n.type = 'Placement'
  AND n.createdAt >= NOW() - INTERVAL '7 days'
GROUP BY u.studentId, u.email
HAVING COUNT(n.id) > 0;
```

---

## Stage 4: Performance Optimization for Page Load

### Problem
Notifications fetched on every page load → DB overwhelmed → Bad UX

### Solutions

#### Solution 1: **Pagination** (RECOMMENDED)
```sql
-- Fetch notifications with pagination
SELECT * FROM notifications
WHERE studentId = $1
ORDER BY createdAt DESC
LIMIT 20 OFFSET 0;
```
- **Trade-off**: User sees limited notifications initially
- **Computational Cost**: O(log n) with proper indexing
- **Implementation Effort**: Low

#### Solution 2: **Caching** (Best for performance)
Use Redis to cache frequently accessed notifications:
```
- Cache Key: notification:studentId:page:1
- TTL: 5 minutes
- Update on: New notification, Read status change
```
- **Trade-off**: Slightly stale data (5 min max)
- **Computational Cost**: O(1) cache hits
- **Implementation Effort**: Medium

#### Solution 3: **Lazy Loading**
Load first batch, load more on user scroll
- **Trade-off**: Initial load is faster, subsequent loads may be slower
- **Computational Cost**: O(log n) per batch
- **Implementation Effort**: Medium

#### Solution 4: **Database Partitioning**
Partition notifications table by studentId range
- **Trade-off**: Complex query routing
- **Computational Cost**: O(log n) within partition
- **Implementation Effort**: High

### Recommended Approach (Combined)
1. **Primary**: Pagination (20 items per page)
2. **Secondary**: Redis caching (5-minute TTL)
3. **Tertiary**: Lazy loading on scroll

---

## Stage 5: Redesigned notify_all Function

### Problem
Original implementation failed for 200 students midway. Single failure point in send_email.

### Improved Implementation

```python
from typing import List, Dict
import asyncio
from dataclasses import dataclass
from enum import Enum
from datetime import datetime
import logging

class NotificationStatus(Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    RETRYING = "retrying"

@dataclass
class NotificationResult:
    studentId: str
    email: bool
    database: bool
    appPush: bool
    status: NotificationStatus

class NotifyAllService:
    def __init__(self, max_retries=3, batch_size=100):
        self.max_retries = max_retries
        self.batch_size = batch_size
        self.logger = logging.getLogger(__name__)
    
    async def notify_all(
        self,
        student_ids: List[str],
        message: str
    ) -> Dict[str, NotificationResult]:
        """
        Send notifications to all students reliably.
        
        Strategy:
        1. Database insert happens FIRST (guarantee persistence)
        2. Email and app push happen in parallel (with retries)
        3. Failed notifications are logged for retry queue
        """
        results = {}
        
        # Batch processing to avoid memory overload
        for i in range(0, len(student_ids), self.batch_size):
            batch = student_ids[i:i + self.batch_size]
            batch_results = await self._process_batch(batch, message)
            results.update(batch_results)
        
        self._log_summary(results)
        return results
    
    async def _process_batch(
        self,
        student_ids: List[str],
        message: str
    ) -> Dict[str, NotificationResult]:
        """Process a batch of notifications."""
        results = {}
        
        for student_id in student_ids:
            result = NotificationResult(
                studentId=student_id,
                email=False,
                database=False,
                appPush=False,
                status=NotificationStatus.PENDING
            )
            
            try:
                # STEP 1: Database insert FIRST (highest priority)
                result.database = await self._save_to_db(student_id, message)
                
                if not result.database:
                    result.status = NotificationStatus.FAILED
                    results[student_id] = result
                    continue
                
                # STEP 2: Send email and app push in parallel
                email_task = self._send_email_with_retry(student_id, message)
                push_task = self._push_to_app_with_retry(student_id, message)
                
                email_result, push_result = await asyncio.gather(
                    email_task,
                    push_task,
                    return_exceptions=True
                )
                
                result.email = isinstance(email_result, bool) and email_result
                result.appPush = isinstance(push_result, bool) and push_result
                
                # Mark as success if DB succeeded (email/push are best-effort)
                result.status = NotificationStatus.SENT
                
            except Exception as e:
                self.logger.error(f"Error processing notification for {student_id}: {e}")
                result.status = NotificationStatus.FAILED
            
            results[student_id] = result
        
        return results
    
    async def _save_to_db(self, student_id: str, message: str) -> bool:
        """Save notification to database (critical path)."""
        try:
            # INSERT notification record
            notification = {
                'studentId': student_id,
                'message': message,
                'type': 'Event',
                'isRead': False,
                'createdAt': datetime.now().isoformat()
            }
            # Save to DB
            # db.notifications.insert_one(notification)
            return True
        except Exception as e:
            self.logger.error(f"DB insert failed for {student_id}: {e}")
            return False
    
    async def _send_email_with_retry(
        self,
        student_id: str,
        message: str
    ) -> bool:
        """Send email with exponential backoff retry."""
        for attempt in range(self.max_retries):
            try:
                # send_email(student_id, message)
                await asyncio.sleep(0.1)  # Simulate email send
                return True
            except Exception as e:
                self.logger.warning(
                    f"Email send failed for {student_id} (attempt {attempt + 1}): {e}"
                )
                if attempt < self.max_retries - 1:
                    # Exponential backoff: 1s, 2s, 4s
                    await asyncio.sleep(2 ** attempt)
                else:
                    # Queue for async retry later
                    await self._queue_for_retry('email', student_id, message)
                    return False
        return False
    
    async def _push_to_app_with_retry(
        self,
        student_id: str,
        message: str
    ) -> bool:
        """Push to app with exponential backoff retry."""
        for attempt in range(self.max_retries):
            try:
                # push_to_app(student_id, message)
                await asyncio.sleep(0.1)  # Simulate push
                return True
            except Exception as e:
                self.logger.warning(
                    f"App push failed for {student_id} (attempt {attempt + 1}): {e}"
                )
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                else:
                    await self._queue_for_retry('app_push', student_id, message)
                    return False
        return False
    
    async def _queue_for_retry(
        self,
        channel: str,
        student_id: str,
        message: str
    ):
        """Queue failed notification for async retry."""
        retry_job = {
            'channel': channel,
            'studentId': student_id,
            'message': message,
            'createdAt': datetime.now().isoformat(),
            'attempts': 0
        }
        # Queue to Redis or message broker
        # queue.enqueue(retry_job)
        self.logger.info(f"Queued {channel} retry for {student_id}")
    
    def _log_summary(self, results: Dict[str, NotificationResult]):
        """Log notification summary."""
        total = len(results)
        db_success = sum(1 for r in results.values() if r.database)
        email_success = sum(1 for r in results.values() if r.email)
        push_success = sum(1 for r in results.values() if r.appPush)
        
        self.logger.info(
            f"Notification Summary - Total: {total}, DB: {db_success}, "
            f"Email: {email_success}, Push: {push_success}"
        )

# Usage
async def main():
    service = NotifyAllService(max_retries=3, batch_size=100)
    student_ids = ["1042", "1043", "1044"]  # ... up to 50,000
    results = await service.notify_all(student_ids, "Placement drive live!")
    
    for student_id, result in results.items():
        print(f"{student_id}: {result.status.value}")
```

### Key Improvements

| Aspect | Original | Improved |
|--------|----------|----------|
| **Failure Point** | Single failure stops all | Graceful degradation |
| **Database** | Last operation | First operation (guarantee persistence) |
| **Retry Logic** | None | Exponential backoff with retry queue |
| **Parallelization** | Sequential | Email & push in parallel |
| **Memory** | All at once | Batch processing |
| **Observability** | None | Detailed logging & metrics |

---

## Stage 6: Priority Inbox Implementation

### Approach
Implement weighted scoring for priority calculation based on:
- **Weight 1**: Placement > Result > Event (40%)
- **Recency**: Newer notifications get higher priority (35%)
- **Read Status**: Unread notifications ranked higher (25%)

### Implementation

```python
from datetime import datetime, timedelta
from typing import List, Dict
from enum import Enum

class NotificationType(Enum):
    PLACEMENT = 40
    RESULT = 30
    EVENT = 20

class PriorityInboxService:
    def __init__(self, cache_ttl_minutes=5):
        self.cache_ttl = timedelta(minutes=cache_ttl_minutes)
    
    def get_priority_notifications(
        self,
        student_id: str,
        limit: int = 10
    ) -> List[Dict]:
        """
        Fetch top 'n' notifications sorted by priority.
        
        Priority Score = (Type Weight × 0.4) + (Recency Score × 0.35) + (Unread Score × 0.25)
        """
        # Fetch all notifications for student (with caching)
        notifications = self._fetch_notifications(student_id)
        
        # Calculate priority scores
        scored_notifications = [
            {
                **notif,
                'priorityScore': self._calculate_priority_score(notif)
            }
            for notif in notifications
        ]
        
        # Sort by priority score descending
        sorted_notifications = sorted(
            scored_notifications,
            key=lambda x: x['priorityScore'],
            reverse=True
        )
        
        # Return top 'n'
        return sorted_notifications[:limit]
    
    def _calculate_priority_score(self, notification: Dict) -> float:
        """Calculate priority score for notification."""
        type_score = self._get_type_score(notification['type'])
        recency_score = self._get_recency_score(notification['createdAt'])
        unread_score = self._get_unread_score(notification['isRead'])
        
        # Weighted scoring
        priority_score = (
            type_score * 0.4 +
            recency_score * 0.35 +
            unread_score * 0.25
        )
        
        return priority_score
    
    def _get_type_score(self, notif_type: str) -> float:
        """Score based on notification type."""
        type_weights = {
            'Placement': 40,
            'Result': 30,
            'Event': 20
        }
        return type_weights.get(notif_type, 10)
    
    def _get_recency_score(self, created_at: str) -> float:
        """Score based on how recent notification is."""
        created_datetime = datetime.fromisoformat(created_at)
        hours_ago = (datetime.now() - created_datetime).total_seconds() / 3600
        
        # Score: 100 for new, decays over time
        # 100 at 0 hours, 0 at 48 hours
        recency_score = max(0, 100 - (hours_ago * 100 / 48))
        return recency_score
    
    def _get_unread_score(self, is_read: bool) -> float:
        """Score based on read status."""
        return 100 if not is_read else 30
    
    def _fetch_notifications(self, student_id: str) -> List[Dict]:
        """Fetch notifications with caching."""
        cache_key = f"notifications:{student_id}"
        
        # Try cache first
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached
        
        # Query database
        notifications = [
            # SELECT * FROM notifications WHERE studentId = student_id
            # ORDER BY createdAt DESC LIMIT 100
        ]
        
        # Store in cache
        self._set_cache(cache_key, notifications)
        
        return notifications
    
    def _get_from_cache(self, key: str):
        """Get from Redis cache."""
        # redis_client.get(key)
        return None
    
    def _set_cache(self, key: str, value):
        """Set Redis cache with TTL."""
        # redis_client.setex(key, self.cache_ttl.total_seconds(), json.dumps(value))
        pass

# API Endpoint
# GET /api/v1/notifications/priority?limit=10
# Returns: Top 10 notifications sorted by priority score
```

### Priority Scoring Example

```
Notification 1:
- Type: Placement (weight: 40)
- Created: 2 hours ago (recency: 91.7)
- Unread: Yes (100)
- Priority Score = 40×0.4 + 91.7×0.35 + 100×0.25 = 16 + 32.1 + 25 = 73.1

Notification 2:
- Type: Event (weight: 20)
- Created: 24 hours ago (recency: 50)
- Unread: No (30)
- Priority Score = 20×0.4 + 50×0.35 + 30×0.25 = 8 + 17.5 + 7.5 = 33.0

Result: Notification 1 appears first (73.1 > 33.0)
```

### Database Query with Priority

```sql
-- Get priority-sorted notifications for display
SELECT 
    n.*,
    (
        CASE 
            WHEN n.type = 'Placement' THEN 40
            WHEN n.type = 'Result' THEN 30
            ELSE 20
        END * 0.4 +
        (100 - (EXTRACT(HOUR FROM (NOW() - n.createdAt)) * 100 / 48)) * 0.35 +
        CASE WHEN n.isRead = FALSE THEN 100 ELSE 30 END * 0.25
    ) as priorityScore
FROM notifications n
WHERE n.studentId = '1042'
ORDER BY priorityScore DESC
LIMIT 10;
```

---

## Summary

| Stage | Deliverable | Key Points |
|-------|-------------|-----------|
| 1 | REST API Design | 5 core endpoints, JSON schemas, error handling |
| 2 | DB Schema | PostgreSQL with composite indexes, optimization strategies |
| 3 | SQL Queries | Efficient queries for placement notifications |
| 4 | Performance | Pagination + Caching + Lazy Loading recommended |
| 5 | Reliable Notify | Async processing, DB-first, parallel email/push, retry queue |
| 6 | Priority Inbox | Weighted scoring algorithm, caching, top-n results |
