# Notification System Design

This is a simple notification system for sending placement, result, and event updates to students. The main goals are:

- store every notification safely
- show students their latest notifications quickly
- mark notifications as read
- avoid failure when sending to many students

## API

Basic endpoints:

```http
GET    /api/v1/notifications?studentId=1042&filter=unread&limit=20
POST   /api/v1/notifications/send
PATCH  /api/v1/notifications/{id}/read
PATCH  /api/v1/notifications/bulk/read
DELETE /api/v1/notifications/{id}
```

Example notification:

```json
{
  "studentId": "1042",
  "type": "Placement",
  "title": "Placement Drive",
  "message": "Accenture placement drive is now open",
  "priority": "high",
  "isRead": false
}
```

All APIs should use token authentication. Normal responses can return `status`, `data`, and a short error message when something fails.

## Database

PostgreSQL is a good fit because the data is structured and we need filtering, ordering, and indexes.

Main table:

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL
);

CREATE INDEX idx_notifications_student_time
ON notifications (student_id, created_at DESC);

CREATE INDEX idx_notifications_student_read
ON notifications (student_id, is_read, created_at DESC);
```

Metadata like `companyId`, `driveId`, or `eventId` can be stored in a JSON column or a separate metadata table if it becomes complex.

## Useful Query

Students who received placement notifications in the last 7 days:

```sql
SELECT
    student_id,
    COUNT(*) AS notification_count,
    MAX(created_at) AS last_notification_at
FROM notifications
WHERE type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY student_id
ORDER BY last_notification_at DESC;
```

## Page Load Performance

Do not load all notifications on every page refresh. Fetch only the latest page first.

Recommended approach:

- use pagination with `LIMIT 20`
- order by `created_at DESC`
- cache the first page in Redis for a few minutes
- clear or update cache when a new notification is created or marked as read

Example:

```sql
SELECT *
FROM notifications
WHERE student_id = $1
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

## Reliable `notify_all`

When sending to many students, one failed email should not stop the whole process.

Better flow:

1. Create the notification in the database first.
2. Send email and app push after that.
3. Process students in batches.
4. Retry failed email or push sends.
5. Log failures so they can be retried later.

Short version:

```python
async def notify_all(student_ids, message):
    for batch in chunks(student_ids, 100):
        for student_id in batch:
            notification = save_notification(student_id, message)

            try:
                await send_email(student_id, message)
            except Exception:
                queue_retry("email", student_id, notification.id)

            try:
                await push_to_app(student_id, message)
            except Exception:
                queue_retry("push", student_id, notification.id)
```

The important point is that the app notification is saved even if email or push fails.

## Priority Inbox

For a priority view, score each notification using:

- type: Placement > Result > Event
- recency: newer notifications rank higher
- read status: unread notifications rank higher

Example score:

```text
priority_score =
  type_weight * 0.4 +
  recency_score * 0.35 +
  unread_score * 0.25
```

This lets urgent placement updates stay near the top without completely hiding other notifications.

## Final Recommendation

Keep the system simple:

- PostgreSQL for storage
- proper indexes for student and read status
- pagination for the UI
- Redis cache for the first page
- batch sending with retry queues
- priority scoring only for the special priority inbox view
