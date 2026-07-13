# Harbor Task Workflow

## 1. Task selection

- Choose a real engineering problem with a narrow, testable boundary.
- Favor state flow, data consistency, config precedence, permissions, or cleanup bugs.
- Avoid fake failures, pure copyediting, and brittle external services.

## 2. Workspace isolation

- Copy the relevant code into a separate task workspace.
- Remove caches, build outputs, and unrelated assets.
- Keep the original repo untouched.

## 3. Instruction shape

- State the real scenario.
- State the bug or missing behavior.
- State the required outcome.
- State the files or modules to inspect.
- State the constraints.
- State how to validate.

## 4. Environment

- Keep the app runnable inside `environment/`.
- Do not bake `tests/` or `solution/` into the image.
- Use a stable Dockerfile or compose file.
- If the task uses a public repo, pin an exact commit.

## 5. Solution

- Implement the smallest correct fix.
- Do not edit tests to force success.
- Avoid hard-coded outputs, timestamps, tokens, or external network dependence.

## 6. Tests

- Check the task goal.
- Check at least one important boundary.
- Check a wrong-but-plausible path fails.
- Keep tests aligned with the instruction.

## 7. Submission

- Ensure the package has one root directory.
- Ensure the verifier writes a reward file.
- Prepare pass@4 screenshots for the requested models.
- Re-run validation after any task change.
