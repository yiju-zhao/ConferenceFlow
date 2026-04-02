# Session Upload JSON Format Guide

This document describes the JSON format accepted by the ConferenceFlow bulk session upload feature (Admin → Sessions → Upload JSON).

## File Structure

The file must be valid JSON. It can be one of:

1. **An array of session objects** (preferred)
2. **An object with a `sessions` key** containing an array
3. **A single session object** (will be treated as a 1-element array)

```json
[
  { "title": "Session 1", "date": "2026-03-18", "start": "09:00", "end": "10:00" },
  { "title": "Session 2", "date": "2026-03-18", "start": "10:30", "end": "11:30" }
]
```

## Required Fields

Every session **must** have these 4 fields or it will be skipped with an error:

| Field | Type | Format | Example |
|-------|------|--------|---------|
| `title` | string | Session title | `"Keynote: Future of AI"` |
| `date` | string | `YYYY-MM-DD` | `"2026-03-18"` |
| `start` | string | `HH:MM` (24h) | `"09:00"` |
| `end` | string | `HH:MM` (24h) | `"10:30"` |

## Optional Fields

| Field | Type | Description | Aliases |
|-------|------|-------------|---------|
| `session_id` | string | Unique session code (e.g., `"S62911"`). Used as the Firestore document ID. If omitted, an auto-generated ID is used. | `code` |
| `room` | string | Room or venue name | `location` |
| `speakers` | array | Speaker objects (see below) | — |
| `format` | string | `"In-Person"`, `"Virtual"`, `"Both"` | — |
| `recording` | string | `"Yes"` or `"No"` | — |
| `session_type` | string | `"Talk"`, `"Panel"`, `"Keynote"`, `"Workshop"`, etc. | `sessionType` |
| `topic` | string | Primary topic/category | `mainTopic` |
| `url` | string | Link to official session page | — |
| `key_themes` | array of strings | Topic tags for filtering | `keyThemes` |
| `time` | string | Alternative time format: `"09:00 - 10:30"` (parsed if `start`/`end` missing) | — |

### Speaker Object Format

```json
{
  "name": "Dr. Jane Smith",
  "title": "Chief Scientist",
  "company": "NVIDIA"
}
```

All speaker fields are optional strings. The `speakers` field should be an array of these objects.

## Limits

- Maximum **1000 sessions** per upload
- Sessions are processed in batches of 500

## Complete Example

```json
[
  {
    "session_id": "S62911",
    "title": "NVIDIA AI Factory Architecture Deep Dive",
    "date": "2026-03-18",
    "start": "09:00",
    "end": "10:30",
    "room": "Hall A",
    "speakers": [
      { "name": "Jensen Huang", "title": "CEO", "company": "NVIDIA" }
    ],
    "format": "In-Person",
    "recording": "Yes",
    "session_type": "Keynote",
    "topic": "AI Infrastructure",
    "url": "https://www.nvidia.com/gtc/session/S62911",
    "key_themes": ["AI", "Infrastructure", "Data Center"]
  },
  {
    "session_id": "S63445",
    "title": "Autonomous Vehicles Panel",
    "date": "2026-03-18",
    "start": "14:00",
    "end": "15:30",
    "room": "Hall B",
    "speakers": [
      { "name": "Dr. Aria Thomas", "title": "VP Engineering", "company": "Waymo" },
      { "name": "Dr. Li Wei", "title": "CTO", "company": "Pony.ai" }
    ],
    "format": "In-Person",
    "recording": "No",
    "session_type": "Panel",
    "topic": "Autonomous Vehicles",
    "key_themes": ["Self-Driving", "Robotics", "Simulation"]
  },
  {
    "title": "Getting Started with CUDA",
    "date": "2026-03-19",
    "start": "10:00",
    "end": "11:00",
    "room": "Room 201",
    "format": "Virtual",
    "session_type": "Workshop",
    "topic": "GPU Programming"
  }
]
```

## Minimal Example

Only the 4 required fields:

```json
[
  { "title": "Morning Keynote", "date": "2026-03-18", "start": "09:00", "end": "10:00" },
  { "title": "Lunch Workshop", "date": "2026-03-18", "start": "12:00", "end": "13:00" }
]
```

## Error Handling

- Sessions missing required fields are skipped (not uploaded)
- The response reports how many were created and lists any errors
- If `session_id` matches an existing session, it will be **overwritten**
- Sessions without `session_id` always create new documents
