# Feature Name - Tasks

## Implementation Tasks

### Phase 1: Preparation

- [ ] Create `.openspec/changes/<feature>/` directory
- [ ] Write `proposal.md`
- [ ] Write `design.md`
- [ ] Review and approve proposal

### Phase 2: Test Development (ATDD)

- [ ] Write acceptance tests in `src/**/*.<feature>.acceptance.spec.ts`
- [ ] Verify tests fail (Red Phase)
- [ ] Review acceptance tests

### Phase 3: Implementation

- [ ] Create domain entity (if needed)
- [ ] Create repository interface
- [ ] Create DTOs
- [ ] Implement infrastructure repository
- [ ] Implement application service
- [ ] Implement controller
- [ ] Add routes to module

### Phase 4: Verification

- [ ] Run acceptance tests - should pass (Green Phase)
- [ ] Run unit tests - should pass
- [ ] Run `npm run validate:quick`
- [ ] Run `npm run security:check`

### Phase 5: Deployment

- [ ] Update documentation
- [ ] Archive to `.openspec/specs/<feature>/`
- [ ] Create PR/commit

## Task Dependencies

```
proposal.md → design.md → tasks.md → acceptance tests → implementation → verify → archive
```

## Notes

- Each task above should be independently commit-able
- Use conventional commits: feat:, fix:, refactor:, docs:
- Reference acceptance criteria in commit messages
