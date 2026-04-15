# Tasks: SDD + ATDD Implementation

## Tasks

### 1. Update AGENTS.md with SDD + ATDD rules

- [ ] Add explicit ATDD mention alongside SDD
- [ ] Add 7-step workflow (propose, spec, tasks, tests, apply, verify, archive)
- [ ] Add acceptance test writing requirement
- [ ] Add Plan Mode / Build Mode explanation

### 2. Create SDD workflow document

- [ ] Create .agent/workflows/sdd-workflow.md with full SDD+ATDD steps
- [ ] Document each phase of the pipeline
- [ ] Include ATDD example with Jest

### 3. Create OpenSpec change template

- [ ] Create .openspec/changes/TEMPLATE/ with proposal.md, design.md, tasks.md
- [ ] Include example of acceptance tests in design.md

### 4. Update opencode.json (if needed)

- [ ] Ensure plugins array exists (even if empty for now)

### 5. Validate

- [ ] Run npm run validate:quick
- [ ] Verify all tests pass
