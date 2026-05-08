# Notification System Design

## Stage 1

The notification service should cover the normal actions a student app needs:

- send a notification
- list notifications for one student
- mark one or many notifications as read
- delete a notification

I would keep the API predictable and versioned:

```http
GET    /evaluation-service/api/v1/notifications?studentId=1042&limit=20&offset=0
POST   /evaluation-service/api/v1/notifications/send
PATCH  /evaluation-service/api/v1/notifications/{id}/read
PATCH  /evaluation-service/api/v1/notifications/bulk/read
DELETE /evaluation-service/api/v1/notifications/{id}
```

Example request for sending a notification:

```json
{
  "studentId": "1042",
  "type": "Placement",
  "title": "Placement Drive",
  "message": "Accenture drive is open",
  "priority": "high"
}
```

For real-time updates, I would use WebSocket or Server-Sent Events. The REST API stores and updates notifications, while the real-time channel only tells the frontend that a new notification arrived.

## Stage 2

I would use PostgreSQL. The data is structured, and most reads are simple filters by student, read status, and time.

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(50) NOT NULL,
    notification_type VARCHAR(30) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL
);

CREATE INDEX idx_notifications_student_time
ON notifications (student_id, created_at DESC);

CREATE INDEX idx_notifications_student_unread
ON notifications (student_id, is_read, created_at DESC);
```

As data grows, the main problem will be slow reads if we scan the whole table. The fix is not to add indexes everywhere. Too many indexes slow down inserts and take extra storage. I would add only the indexes that match our actual queries.

## Stage 3

The original query is mostly correct, but it can become slow because it searches a large table and sorts the result.

```sql
SELECT *
FROM notifications
WHERE student_id = '1042'
  AND is_read = false
ORDER BY created_at DESC;
```

With this index, the database can directly find unread notifications for that student in newest-first order:

```sql
CREATE INDEX idx_notifications_unread_lookup
ON notifications (student_id, is_read, created_at DESC);
```

The cost becomes close to `O(log n + k)`, where `k` is the number of rows returned. Without the index, it can behave like a full scan plus sort.

Students who got placement notifications in the last 7 days:

```sql
SELECT DISTINCT student_id
FROM notifications
WHERE notification_type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days';
```

## Stage 4

Fetching notifications on every page load is wasteful. The frontend usually needs only the latest few notifications first.

My approach:

- fetch the first 20 notifications only
- cache the first page for a short time
- load older notifications only when the user asks or scrolls
- invalidate cache when a new notification is created or marked as read

Example query:

```sql
SELECT *
FROM notifications
WHERE student_id = $1
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

Tradeoff: pagination is simple and fast, but the frontend has to handle "load more". Redis caching improves repeated page loads, but it can show slightly old data for a few seconds unless we clear the cache properly.

## Stage 5

The given `notify_all` function has one major problem: email, DB save, and push are all tied together inside one loop. If email fails halfway, the rest of the students may not get processed.

I would save the notification first, then send email and push as separate best-effort steps.

```python
async def notify_all(student_ids, message):
    for batch in chunks(student_ids, 100):
        for student_id in batch:
            notification_id = save_notification(student_id, message)

            try:
                await send_email(student_id, message)
            except Exception:
                add_retry_job("email", student_id, notification_id)

            try:
                await push_to_app(student_id, message)
            except Exception:
                add_retry_job("push", student_id, notification_id)
```

Saving to the database should not wait for email to succeed. The in-app notification is the source of truth. Email and push can fail and retry later.

## Stage 6

For the priority inbox, the provided API is:

```http
GET http://4.224.186.213/evaluation-service/notifications
```

I would fetch notifications from this API, score them in the frontend, and show the top `n`.

Score idea:

```text
score = type_score + recency_score + unread_score
```

Suggested weights:

- Placement: 50
- Result: 35
- Event: 20
- newer notifications get up to 30 extra points
- unread notifications get 20 extra points

For future notifications, the same scoring can run again whenever new data is fetched. If the list becomes very large, the backend should return only recent notifications and the frontend can keep a small top-10 list instead of sorting everything repeatedly.
