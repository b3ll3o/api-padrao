# OpenSpec Agent Rules

## Spec Writing Guidelines

### Spec File Naming

- Use kebab-case: `feature-name.md`
- Example: `user-authentication.md`, `payment-integration.md`

### Spec Structure

```
# Feature Name

## Overview
Brief description of the feature.

## Requirements
- Functional requirements
- Non-functional requirements

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Technical Notes
Implementation details and considerations.
```

## Change Workflow

### Creating a New Feature

1. Create spec in `.openspec/specs/<feature-name>.md`
2. Create change directory `.openspec/changes/<feature-name>/`
3. Create tasks.md with implementation plan
4. Implement in Build Mode

### Completing a Feature

1. All tasks completed in tasks.md
2. Tests passing
3. Move spec to `specs/approved/` or archive
