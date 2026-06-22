# Feature Name - Design Specification

## Overview

Detailed description of the feature.

## Requirements

### Functional Requirements

- FR-01: [Description]
- FR-02: [Description]
- FR-03: [Description]

### Non-Functional Requirements

- NFR-01: Performance - [description]
- NFR-02: Security - [description]
- NFR-03: Scalability - [description]

## Acceptance Criteria

- [ ] AC-01: [Criterion description]
- [ ] AC-02: [Criterion description]
- [ ] AC-03: [Criterion description]

## API Specification

### Endpoint 1: [METHOD] /path

**Request**:

```json
{
  "field": "value"
}
```

**Response** (200):

```json
{
  "field": "value"
}
```

**Error Responses**:

- 400: [Description]
- 401: [Description]
- 404: [Description]

### Endpoint 2: [METHOD] /path

...

## Data Models

### Entity: [Name]

| Field     | Type     | Required | Description        |
| --------- | -------- | -------- | ------------------ |
| id        | UUID     | Yes      | Primary key        |
| name      | String   | Yes      | Entity name        |
| createdAt | DateTime | Yes      | Creation timestamp |

## Edge Cases

1. [Description] - How to handle
2. [Description] - How to handle

## Acceptance Tests

```typescript
describe('[Feature] Feature Name', () => {
  it('AC-01: [Criterion description]', async () => {
    // Test implementation
  });

  it('AC-02: [Criterion description]', async () => {
    // Test implementation
  });
});
```

## Technical Notes

- [Implementation detail 1]
- [Implementation detail 2]

## Status

- [ ] Draft
- [ ] In Review
- [ ] Approved
- [ ] Implemented
