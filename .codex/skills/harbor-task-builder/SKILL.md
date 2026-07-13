---
name: harbor-task-builder
description: Build Harbor benchmark tasks from an existing codebase, including task selection, clean workspace setup, instruction writing, Docker environment design, solution scripting, test design, validation, packaging, and submission. Use when creating or iterating a Harbor task package from a real project.
---

# Harbor Task Builder

Use this skill to turn a real codebase into a clean Harbor task package without polluting the source repo.

## Workflow

1. Pick a real engineering problem.
   - Prefer backend state flow, config precedence, permissions, data consistency, or cleanup bugs.
   - Avoid pure text edits, UI-only polish, and hidden infra failures.

2. Isolate the task copy.
   - Copy the relevant code into a separate task workspace.
   - Remove caches, build outputs, and unrelated assets.
   - Keep the original repo untouched.

3. Define the minimal bug or feature boundary.
   - Identify the exact API, CRUD, service, or state transition to change.
   - State what must stay unchanged.

4. Write the instruction.
   - Explain the real scenario, current problem, required behavior, and constraints.
   - Name the target files or modules.
   - Do not leak the fix.

5. Build the environment.
   - Put the runnable app in `environment/`.
   - Do not bake `tests/` or `solution/` into the image.
   - Use a stable Dockerfile or compose file.
   - If the task uses a public repo, pin an exact commit.

6. Write the oracle solution.
   - Apply the smallest correct fix from the broken task copy.
   - Avoid hard-coded outputs, timestamps, tokens, or external network dependence.

7. Design verifier tests.
   - Test the task goal, a key boundary, and a plausible wrong path.
   - Keep tests aligned with the instruction.

8. Validate the package.
   - Run the oracle against the tests.
   - Confirm the verifier writes a reward file.
   - Check the package has a single root directory and the build is reproducible.

## Submission Checklist

- `instruction.md`
- `task.toml`
- `environment/`
- `solution/solve.sh`
- `tests/test.sh`
- pass@4 screenshots for the requested models
- tests analysis text that matches the verifier

See [Harbor Task Reference](references/harbor-task-workflow.md) for a reusable checklist.

## Guardrails

- Keep the source repo stable.
- Keep the task narrow enough to solve in one package.
- Prefer backend state machines, permissions, and consistency bugs over vague feature work.
- Prefer explicit file and test boundaries over hidden assumptions.
