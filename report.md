# Security Review: sdm-system

## Scope

Repository scan executed with discovery focus on backend and miniprogram surfaces, excluding frontend, docs, and event_app unless directly relevant to a reachable security path.

- Scan mode: repository
- Target kind: git_worktree
- Target ID: target_sha256_9ccf268bb8e107b1312a014d4714d8835926d177c6ac660be5c062cad9eddeb1
- Revision: 760637645d56a8a2ae11722b6fcdf506d6f919ce
- Snapshot digest: codex-security-snapshot/v1:sha256:af1c821aac0e81f5fa6e75763b8b3ff2ebce97be08731ed531d03be021d769e4
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none
- Runtime or test status: Static source review only; no runtime exploit harnesses were executed during this scan.
- Artifacts reviewed: artifacts/01_context/threat_model.md, artifacts/02_discovery/finding_discovery_report.md, artifacts/03_coverage/repository_coverage_ledger.md
- Scan context: Threat model was generated during the scan and discovery covered the full 222-row in-scope worklist.

Limitations and exclusions:
- Deferred rows remain for selected client-side trust assumptions and one moderation callback-routing concern that still need a proven reachable exploit path.
- This run did not execute runtime PoCs or deployment-specific proxy validation.
- Excluded frontend/: User explicitly requested backend and miniprogram focus only unless another path was directly relevant to a reachable security path.
- Excluded docs/: Documentation was excluded from code-path review unless directly relevant to a reachable security path.
- Excluded event_app/: Flutter event_app was excluded from this scan per user scope request.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 10 |
| Severity mix | high: 5, medium: 5 |
| Confidence mix | high: 6, medium: 4 |
| Coverage | partial |
| Validation mode | Validated by static source trace with candidate-local validation and attack-path receipts. |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

The repository exposes multi-tenant backend APIs plus a WeChat mini program, with security-critical paths around authentication, RBAC, tenant isolation, payments, community content, uploads, and outbound WeChat integrations.

### Assets

- tenant-scoped user and activity data
- payment and refund state
- community content and membership controls
- administrator credentials and role assignments

### Trust Boundaries

- unauthenticated HTTP and WeChat entrypoints
- JWT-authenticated tenant/user requests
- payment and refund webhooks
- mini program persisted local auth state
- community user-generated content

### Attacker Capabilities

- unauthenticated remote caller
- authenticated low-privilege user
- malicious tenant member or admin
- operator or automation that can execute local bootstrap scripts

### Security Objectives

- preserve tenant isolation
- enforce strong credential and admin bootstrap controls
- bind webhook state changes to stored payment business context
- constrain persisted external content and sensitive state mutation

### Assumptions

- server-side authorization is the authoritative control even when mini program pages apply local gating
- WeChat callback origin verification alone is insufficient without business-field binding checks

## Findings

| Finding | Severity | Confidence |
| --- | --- | --- |
| [Refund idempotency relies on a race-prone lookup without a backing uniqueness constraint](#finding-1) | high | medium |
| [Non-success payment callback can downgrade local order state without binding validation](#finding-2) | high | medium |
| [Bootstrap admin script resets a super-admin credential to a repository-hardcoded password](#finding-3) | high | high |
| [Role assignment resets the target user password to a predictable default that remains login-usable](#finding-4) | high | high |
| [Refund callback mutates local refund and order state without business-field binding checks](#finding-5) | high | medium |
| [Self-service profile field clearing can null out security-sensitive User fields](#finding-6) | medium | high |
| [Community surfaces persist and render attacker-controlled external media URLs](#finding-7) | medium | medium |
| [Community invite codes remain valid after their stored expiry time](#finding-8) | medium | high |
| [Spoofable X-Forwarded-Proto bypasses HTTPS-only login enforcement](#finding-9) | medium | high |
| [Spoofable X-Forwarded-For weakens login rate limiting](#finding-10) | medium | high |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] Refund idempotency relies on a race-prone lookup without a backing uniqueness constraint

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | medium |
| Confidence rationale | crud_refund.py shows read-then-insert behavior; schemas.py and table.sql show no matching unique constraint. |
| Category | Concurrency and idempotency flaw |
| CWE | CWE-362, CWE-703 |
| Affected lines | backend/app/crud/crud_refund.py:34-45, backend/app/crud/crud_refund.py:48-77, backend/app/schemas.py:306-324, backend/sql/table.sql:192-214 |

#### Summary

Duplicate refund rows can be created for the same order/idempotency tuple, racing downstream refund processing and corrupting payout or refund state.

#### Validation

crud_refund.py shows read-then-insert behavior; schemas.py and table.sql show no matching unique constraint.

Validation method: static source trace

#### Dataflow

Client or job retries refund concurrently -\> both requests miss the best-effort lookup -\> duplicate refund rows persist -\> later processing sees more than one refund record for the same logical operation.

- **Source:** Concurrent duplicate refund requests or retries carrying the same logical idempotency tuple.

- **Sink:** Idempotency is enforced only in application logic and can be bypassed by concurrent inserts because storage does not reject duplicates.

- **Outcome:** Duplicate refund rows can be created for the same order/idempotency tuple, racing downstream refund processing and corrupting payout or refund state.

#### Reachability

Client or job retries refund concurrently -\> both requests miss the best-effort lookup -\> duplicate refund rows persist -\> later processing sees more than one refund record for the same logical operation.

- **Attacker:** Concurrent duplicate refund requests or retries carrying the same logical idempotency tuple.

- **Entry point:** backend/app/crud/crud_refund.py

- **Outcome:** Duplicate refund rows can be created for the same order/idempotency tuple, racing downstream refund processing and corrupting payout or refund state.

#### Severity

**High** — Concurrent duplicate refund requests can create multiple refund rows for the same logical operation because storage does not enforce the intended idempotency tuple.

Severity would decrease if the relevant server-side path becomes unreachable from untrusted callers or if a stronger upstream control enforces the missing boundary before the reviewed sink.

#### Remediation

Add a database unique constraint for `(tenant_id, payment_order_id, idempotency_key)` and handle duplicate-key races as idempotent success.

Tests:
- Add a regression test that exercises the vulnerable path and proves the missing control now blocks the unsafe state transition or input.

Preventive controls:
- Prefer server-side allowlists, uniqueness constraints, and authenticated context binding over client-side trust or best-effort prechecks.

<a id="finding-2"></a>

### [2] Non-success payment callback can downgrade local order state without binding validation

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | medium |
| Confidence rationale | payments.py clearly separates success-path binding validation from failure-path direct commit; wechat_pay.py confirms no extra binding validation in decrypt_callback. |
| Category | Webhook integrity failure |
| CWE | CWE-345, CWE-354 |
| Affected lines | backend/app/api/v1/endpoints/payments.py:320-405, backend/app/api/v1/endpoints/payments.py:383-389, backend/app/api/v1/endpoints/payments.py:383-389, backend/app/services/wechat_pay.py:202-211 |

#### Summary

A mismatched but accepted callback can incorrectly downgrade a local order to failed, disrupting payment/order integrity and enrollment completion.

#### Validation

payments.py clearly separates success-path binding validation from failure-path direct commit; wechat_pay.py confirms no extra binding validation in decrypt_callback.

Validation method: static source trace

#### Dataflow

Webhook entry -\> decrypted payload -\> order lookup by order_no -\> no binding comparison on non-success branch -\> local order marked failed and committed.

- **Source:** Authenticated-origin WeChat payment callback payload fields after decryption, especially out_trade_no and trade_state.

- **Sink:** The non-success callback branch skips the appid/mchid/amount/openid binding checks that the success path applies.

- **Outcome:** A mismatched but accepted callback can incorrectly downgrade a local order to failed, disrupting payment/order integrity and enrollment completion.

#### Reachability

Webhook entry -\> decrypted payload -\> order lookup by order_no -\> no binding comparison on non-success branch -\> local order marked failed and committed.

- **Attacker:** Authenticated-origin WeChat payment callback payload fields after decryption, especially out_trade_no and trade_state.

- **Entry point:** backend/app/api/v1/endpoints/payments.py

- **Outcome:** A mismatched but accepted callback can incorrectly downgrade a local order to failed, disrupting payment/order integrity and enrollment completion.

#### Severity

**High** — A mismatched non-success payment callback can incorrectly downgrade local order state because the failure branch skips per-order binding checks.

Severity would decrease if the relevant server-side path becomes unreachable from untrusted callers or if a stronger upstream control enforces the missing boundary before the reviewed sink.

#### Remediation

Apply the same `_validate_notify_resource()` business-field checks on non-success payment callbacks before changing local order status.

Tests:
- Add a regression test that exercises the vulnerable path and proves the missing control now blocks the unsafe state transition or input.

Preventive controls:
- Prefer server-side allowlists, uniqueness constraints, and authenticated context binding over client-side trust or best-effort prechecks.

<a id="finding-3"></a>

### [3] Bootstrap admin script resets a super-admin credential to a repository-hardcoded password

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Direct code evidence in create_admin.py shows the hardcoded constants and unconditional credential sync on every run; create_password_credential is the persisted password sink. |
| Category | Hardcoded privileged credentials |
| CWE | CWE-798, CWE-259 |
| Affected lines | backend/create_admin.py:103-139, backend/create_admin.py:18-24, backend/create_admin.py:73-84, backend/app/crud/crud_credential.py:155-181 |

#### Summary

Re-running the bootstrap script silently resets the default super-admin account to a known password, enabling privileged account takeover by anyone who knows the repository secret and can reach the login surface after the script executes.

#### Validation

Direct code evidence in create_admin.py shows the hardcoded constants and unconditional credential sync on every run; create_password_credential is the persisted password sink.

Validation method: static source trace

#### Dataflow

Operator or automation executes create_admin.py -\> default tenant admin credential overwritten with repository-known password -\> attacker authenticates to normal login with the known bootstrap identifier/password pair.

- **Source:** Any operator or automation path that can execute backend/create_admin.py against a live database, plus any later login attempt using the repository-known bootstrap password.

- **Sink:** The bootstrap path embeds a fixed super-admin password in source control and rewrites the credential to that value every time the script runs.

- **Outcome:** Re-running the bootstrap script silently resets the default super-admin account to a known password, enabling privileged account takeover by anyone who knows the repository secret and can reach the login surface after the script executes.

#### Reachability

Operator or automation executes create_admin.py -\> default tenant admin credential overwritten with repository-known password -\> attacker authenticates to normal login with the known bootstrap identifier/password pair.

- **Attacker:** Any operator or automation path that can execute backend/create_admin.py against a live database, plus any later login attempt using the repository-known bootstrap password.

- **Entry point:** backend/create_admin.py

- **Outcome:** Re-running the bootstrap script silently resets the default super-admin account to a known password, enabling privileged account takeover by anyone who knows the repository secret and can reach the login surface after the script executes.

#### Severity

**High** — Re-running the bootstrap admin script resets a privileged account to a repository-known password, creating a direct privileged takeover path whenever the script is executed in a live environment.

Severity would decrease if the relevant server-side path becomes unreachable from untrusted callers or if a stronger upstream control enforces the missing boundary before the reviewed sink.

#### Remediation

Remove the repository-hardcoded bootstrap password, require a deployment-supplied secret or one-time initialization flow, and prevent repeated runs from silently overwriting live credentials.

Tests:
- Add a regression test that exercises the vulnerable path and proves the missing control now blocks the unsafe state transition or input.

Preventive controls:
- Prefer server-side allowlists, uniqueness constraints, and authenticated context binding over client-side trust or best-effort prechecks.

<a id="finding-4"></a>

### [4] Role assignment resets the target user password to a predictable default that remains login-usable

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | high |
| Confidence rationale | Direct code evidence spans roles.py, crud_credential.py, and auth.py: fixed default password creation, normal bcrypt authentication, and non-blocking exposure of must_reset_password in auth info. |
| Category | Predictable credentials |
| CWE | CWE-521, CWE-798 |
| Affected lines | backend/app/api/v1/endpoints/roles.py:42-81, backend/app/api/v1/endpoints/roles.py:64-71, backend/app/crud/crud_credential.py:155-181, backend/app/crud/crud_credential.py:39-50, backend/app/api/v1/endpoints/auth.py:95-139 |

#### Summary

Predictable credential login for role-assigned users; if the target phone number is known, the account can be accessed with the default password until the password is manually changed.

#### Validation

Direct code evidence spans roles.py, crud_credential.py, and auth.py: fixed default password creation, normal bcrypt authentication, and non-blocking exposure of must_reset_password in auth info.

Validation method: static source trace

#### Dataflow

Admin role assignment -\> password credential created/refreshed with 123456 for target phone -\> target credential authenticates through normal /auth/login -\> login succeeds and only signals must_reset in response metadata.

- **Source:** Any actor who can reach role-assignment for a target user with a known phone number, plus any later login attempt using that phone number and the predictable default password.

- **Sink:** Role assignment sets a universal default password and the login path treats must_reset as advisory metadata rather than an enforcement gate.

- **Outcome:** Predictable credential login for role-assigned users; if the target phone number is known, the account can be accessed with the default password until the password is manually changed.

#### Reachability

Admin role assignment -\> password credential created/refreshed with 123456 for target phone -\> target credential authenticates through normal /auth/login -\> login succeeds and only signals must_reset in response metadata.

- **Attacker:** Any actor who can reach role-assignment for a target user with a known phone number, plus any later login attempt using that phone number and the predictable default password.

- **Entry point:** backend/app/api/v1/endpoints/roles.py

- **Outcome:** Predictable credential login for role-assigned users; if the target phone number is known, the account can be accessed with the default password until the password is manually changed.

#### Severity

**High** — Role assignment creates a predictable credential that remains login-usable, enabling account takeover for any target with a known phone number until the password is changed.

Severity would decrease if the relevant server-side path becomes unreachable from untrusted callers or if a stronger upstream control enforces the missing boundary before the reviewed sink.

#### Remediation

Stop creating predictable default passwords during role assignment, or block login until a reset flow completes and enforce `must_reset_password` at authentication time.

Tests:
- Add a regression test that exercises the vulnerable path and proves the missing control now blocks the unsafe state transition or input.

Preventive controls:
- Prefer server-side allowlists, uniqueness constraints, and authenticated context binding over client-side trust or best-effort prechecks.

<a id="finding-5"></a>

### [5] Refund callback mutates local refund and order state without business-field binding checks

| Field | Value |
| --- | --- |
| Severity | high |
| Confidence | medium |
| Confidence rationale | payments.py shows direct state mutation after out_refund_no lookup only; wechat_pay.py confirms decrypt_callback is a thin wrapper around SDK verification/decryption. |
| Category | Webhook integrity failure |
| CWE | CWE-345, CWE-354 |
| Affected lines | backend/app/api/v1/endpoints/payments.py:499-577, backend/app/api/v1/endpoints/payments.py:511-526, backend/app/api/v1/endpoints/payments.py:534-571, backend/app/services/wechat_pay.py:202-211 |

#### Summary

Incorrect refund success/failure state can be recorded for the matched local refund/order, corrupting refund integrity and downstream business state.

#### Validation

payments.py shows direct state mutation after out_refund_no lookup only; wechat_pay.py confirms decrypt_callback is a thin wrapper around SDK verification/decryption.

Validation method: static source trace

#### Dataflow

Webhook entry -\> decrypted payload -\> refund lookup by out_refund_no -\> order lookup via refund.payment_order_id -\> local refund/order state updated and committed.

- **Source:** Authenticated-origin WeChat refund callback payload fields after decryption, especially out_refund_no, refund_status, and companion business fields.

- **Sink:** No local verification that callback business fields match the stored PaymentRefund and PaymentOrder before local state commit.

- **Outcome:** Incorrect refund success/failure state can be recorded for the matched local refund/order, corrupting refund integrity and downstream business state.

#### Reachability

Webhook entry -\> decrypted payload -\> refund lookup by out_refund_no -\> order lookup via refund.payment_order_id -\> local refund/order state updated and committed.

- **Attacker:** Authenticated-origin WeChat refund callback payload fields after decryption, especially out_refund_no, refund_status, and companion business fields.

- **Entry point:** backend/app/api/v1/endpoints/payments.py

- **Outcome:** Incorrect refund success/failure state can be recorded for the matched local refund/order, corrupting refund integrity and downstream business state.

#### Severity

**High** — A signed refund callback can corrupt refund and order state because business-field binding checks are missing before local state mutation.

Severity would decrease if the relevant server-side path becomes unreachable from untrusted callers or if a stronger upstream control enforces the missing boundary before the reviewed sink.

#### Remediation

Validate refund callback `appid`, `mchid`, `out_trade_no`, refund amount, and other business fields against the stored refund and order before mutating local state.

Tests:
- Add a regression test that exercises the vulnerable path and proves the missing control now blocks the unsafe state transition or input.

Preventive controls:
- Prefer server-side allowlists, uniqueness constraints, and authenticated context binding over client-side trust or best-effort prechecks.

<a id="finding-6"></a>

### [6] Self-service profile field clearing can null out security-sensitive User fields

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Direct code evidence spans the users endpoint, crud_user.clear_user_profile_fields_self(), and the User model's sensitive fields/setters. |
| Category | Mass assignment |
| CWE | CWE-915 |
| Affected lines | backend/app/api/v1/endpoints/users.py:280-297, backend/app/crud/crud_user.py:379-393, backend/app/schemas.py:95-108, backend/app/schemas.py:133-159, backend/app/schemas.py:173-201 |

#### Summary

A user can clear security-sensitive state or trigger credential deletion logic through field names that were meant to be internal-only, breaking account integrity and potentially causing tenant or block-state corruption.

#### Validation

Direct code evidence spans the users endpoint, crud_user.clear_user_profile_fields_self(), and the User model's sensitive fields/setters.

Validation method: static source trace

#### Dataflow

Authenticated user submits crafted field list -\> clear_user_profile_fields_self() nulls arbitrary User attributes -\> sensitive account state or linked credentials are deleted or corrupted during commit.

- **Source:** Authenticated user's supplied field list in the self-service clear profile request.

- **Sink:** The self-service clear path does not allowlist safe profile fields before mutating the full User ORM object.

- **Outcome:** A user can clear security-sensitive state or trigger credential deletion logic through field names that were meant to be internal-only, breaking account integrity and potentially causing tenant or block-state corruption.

#### Reachability

Authenticated user submits crafted field list -\> clear_user_profile_fields_self() nulls arbitrary User attributes -\> sensitive account state or linked credentials are deleted or corrupted during commit.

- **Attacker:** Authenticated user's supplied field list in the self-service clear profile request.

- **Entry point:** backend/app/api/v1/endpoints/users.py

- **Outcome:** A user can clear security-sensitive state or trigger credential deletion logic through field names that were meant to be internal-only, breaking account integrity and potentially causing tenant or block-state corruption.

#### Severity

**Medium** — An authenticated user can null arbitrary User fields, including sensitive state and credential-backed properties, through a self-service cleanup endpoint without a field allowlist.

Severity would decrease if the relevant server-side path becomes unreachable from untrusted callers or if a stronger upstream control enforces the missing boundary before the reviewed sink.

#### Remediation

Allowlist benign self-service profile fields explicitly before clearing them, and block sensitive ORM attributes or side-effecting credential-backed properties.

Tests:
- Add a regression test that exercises the vulnerable path and proves the missing control now blocks the unsafe state transition or input.

Preventive controls:
- Prefer server-side allowlists, uniqueness constraints, and authenticated context binding over client-side trust or best-effort prechecks.

<a id="finding-7"></a>

### [7] Community surfaces persist and render attacker-controlled external media URLs

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | medium |
| Confidence rationale | Static trace covers client submission, backend model validation, and viewer rendering paths for announcements, posts, channels, and calendar content. |
| Category | Untrusted external content inclusion |
| CWE | CWE-829, CWE-200 |
| Affected lines | miniprogram/utils/community-editor.js:347-365, miniprogram/pages/community-announcement-create/community-announcement-create.js:88-111, miniprogram/pages/community-post-create/community-post-create.js:109-133, backend/app/models/community.py:35-47, backend/app/models/community.py:157-166, backend/app/models/community.py:467-475, miniprogram/pages/community-announcement-detail/community-announcement-detail.js:92-102, miniprogram/pages/community-post-detail/community-post-detail.js:86-99, miniprogram/pages/community-post-list/community-post-list.js:176-188 |

#### Summary

Viewers of community content can be forced to fetch attacker-controlled remote media, leaking client metadata and undermining the trust boundary that uploaded media comes from a controlled/moderated source.

#### Validation

Static trace covers client submission, backend model validation, and viewer rendering paths for announcements, posts, channels, and calendar content.

Validation method: static source trace

#### Dataflow

Malicious member or admin stores external media URL -\> URL persists server-side -\> other users open community surfaces -\> mini program fetches attacker-controlled content inside trusted UI.

- **Source:** Member/admin-supplied image src, avatarUrl, and coverUrl values stored through community creation and edit flows.

- **Sink:** Community validators and client creation flows treat arbitrary external media URLs as trusted persisted content rather than requiring controlled uploads or host allowlisting.

- **Outcome:** Viewers of community content can be forced to fetch attacker-controlled remote media, leaking client metadata and undermining the trust boundary that uploaded media comes from a controlled/moderated source.

#### Reachability

Malicious member or admin stores external media URL -\> URL persists server-side -\> other users open community surfaces -\> mini program fetches attacker-controlled content inside trusted UI.

- **Attacker:** Member/admin-supplied image src, avatarUrl, and coverUrl values stored through community creation and edit flows.

- **Entry point:** miniprogram/utils/community-editor.js

- **Outcome:** Viewers of community content can be forced to fetch attacker-controlled remote media, leaking client metadata and undermining the trust boundary that uploaded media comes from a controlled/moderated source.

#### Severity

**Medium** — Community content can persist attacker-controlled external media URLs and later render them to viewers, causing trusted-UI remote fetches and client metadata leakage.

Severity would increase if community viewers send sensitive headers or execute richer markup; it would decrease if media URLs are constrained to controlled upload hosts.

#### Remediation

Restrict persisted community media to controlled upload hosts or an explicit allowlist, and normalize or reject arbitrary external `http(s)` media URLs before storage.

Tests:
- Add a regression test that exercises the vulnerable path and proves the missing control now blocks the unsafe state transition or input.

Preventive controls:
- Prefer server-side allowlists, uniqueness constraints, and authenticated context binding over client-side trust or best-effort prechecks.

<a id="finding-8"></a>

### [8] Community invite codes remain valid after their stored expiry time

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Direct code evidence in crud_community_channel.py shows expiry persistence on generation and no expiry comparison in join_by_invite_code(). |
| Category | Authorization control weakness |
| CWE | CWE-285, CWE-613 |
| Affected lines | backend/app/crud/crud_community_channel.py:626-641, backend/app/crud/crud_community_channel.py:645-656 |

#### Summary

Invite codes meant to be temporary remain reusable indefinitely, extending unauthorized channel-join capability long after operators expect the code to expire.

#### Validation

Direct code evidence in crud_community_channel.py shows expiry persistence on generation and no expiry comparison in join_by_invite_code().

Validation method: static source trace

#### Dataflow

Channel admin issues invite code -\> code leaks or is retained by an ex-member -\> attacker redeems the same code after the intended expiry window -\> channel join still succeeds.

- **Source:** Any leaked or previously issued invite code value that still matches a channel record.

- **Sink:** The join path validates code equality but never validates the stored expiry timestamp before admitting a new member.

- **Outcome:** Invite codes meant to be temporary remain reusable indefinitely, extending unauthorized channel-join capability long after operators expect the code to expire.

#### Reachability

Channel admin issues invite code -\> code leaks or is retained by an ex-member -\> attacker redeems the same code after the intended expiry window -\> channel join still succeeds.

- **Attacker:** Any leaked or previously issued invite code value that still matches a channel record.

- **Entry point:** backend/app/crud/crud_community_channel.py

- **Outcome:** Invite codes meant to be temporary remain reusable indefinitely, extending unauthorized channel-join capability long after operators expect the code to expire.

#### Severity

**Medium** — Temporary community invite codes remain valid indefinitely after leakage because redemption never checks the stored expiry timestamp.

Severity would decrease if the relevant server-side path becomes unreachable from untrusted callers or if a stronger upstream control enforces the missing boundary before the reviewed sink.

#### Remediation

Reject invite-code redemption when `invite_code_expire_at` is in the past, and rotate or clear stale codes after use or expiry.

Tests:
- Add a regression test that exercises the vulnerable path and proves the missing control now blocks the unsafe state transition or input.

Preventive controls:
- Prefer server-side allowlists, uniqueness constraints, and authenticated context binding over client-side trust or best-effort prechecks.

<a id="finding-9"></a>

### [9] Spoofable X-Forwarded-Proto bypasses HTTPS-only login enforcement

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Direct code evidence in auth.py shows header trust and token issuance in the same request path; deployment proxy sanitation remains the only proof gap. |
| Category | Transport security bypass |
| CWE | CWE-346 |
| Affected lines | backend/app/api/v1/endpoints/auth.py:165-204, backend/app/api/v1/endpoints/auth.py:26-40, backend/app/api/v1/endpoints/auth.py:199-204 |

#### Summary

Plaintext token issuance if the app is directly reachable over HTTP or an upstream preserves attacker-controlled forwarding headers.

#### Validation

Direct code evidence in auth.py shows header trust and token issuance in the same request path; deployment proxy sanitation remains the only proof gap.

Validation method: static source trace

#### Dataflow

Unauthenticated caller -\> spoofed X-Forwarded-Proto -\> login accepted as HTTPS -\> JWT returned in JSON/cookie over attacker-chosen transport.

- **Source:** Client-supplied X-Forwarded-Proto header on unauthenticated /auth/login requests.

- **Sink:** HTTPS gate trusts forwarding header without visible trusted-proxy validation.

- **Outcome:** Plaintext token issuance if the app is directly reachable over HTTP or an upstream preserves attacker-controlled forwarding headers.

#### Reachability

Unauthenticated caller -\> spoofed X-Forwarded-Proto -\> login accepted as HTTPS -\> JWT returned in JSON/cookie over attacker-chosen transport.

- **Attacker:** Client-supplied X-Forwarded-Proto header on unauthenticated /auth/login requests.

- **Entry point:** backend/app/api/v1/endpoints/auth.py

- **Outcome:** Plaintext token issuance if the app is directly reachable over HTTP or an upstream preserves attacker-controlled forwarding headers.

#### Severity

**Medium** — If the service is reachable over plain HTTP or trusts unsanitized forwarding headers, attackers can bypass transport-only login protection and receive credentials over a weaker channel.

Severity would decrease if the relevant server-side path becomes unreachable from untrusted callers or if a stronger upstream control enforces the missing boundary before the reviewed sink.

#### Remediation

Trust `X-Forwarded-Proto` only after a trusted-proxy boundary has normalized it, or enforce HTTPS from connection metadata or a hardened proxy allowlist.

Tests:
- Add a regression test that exercises the vulnerable path and proves the missing control now blocks the unsafe state transition or input.

Preventive controls:
- Prefer server-side allowlists, uniqueness constraints, and authenticated context binding over client-side trust or best-effort prechecks.

<a id="finding-10"></a>

### [10] Spoofable X-Forwarded-For weakens login rate limiting

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | Direct code evidence in auth.py shows untrusted X-Forwarded-For selection and no account-level fallback limiter in this file. |
| Category | Rate-limit bypass |
| CWE | CWE-307, CWE-346 |
| Affected lines | backend/app/api/v1/endpoints/auth.py:165-204, backend/app/api/v1/endpoints/auth.py:318-370, backend/app/api/v1/endpoints/auth.py:20-24, backend/app/api/v1/endpoints/auth.py:68-79 |

#### Summary

Brute-force throttling can be bypassed by rotating spoofed IPs, and victim-IP quota exhaustion can cause targeted login DoS.

#### Validation

Direct code evidence in auth.py shows untrusted X-Forwarded-For selection and no account-level fallback limiter in this file.

Validation method: static source trace

#### Dataflow

Unauthenticated caller -\> spoofed X-Forwarded-For -\> independent limiter buckets or victim bucket exhaustion -\> repeated password/WeChat auth attempts.

- **Source:** Client-supplied X-Forwarded-For header on pre-auth login and WeChat auth requests.

- **Sink:** Rate-limit identity is derived from an untrusted forwarding header without visible trusted-proxy validation.

- **Outcome:** Brute-force throttling can be bypassed by rotating spoofed IPs, and victim-IP quota exhaustion can cause targeted login DoS.

#### Reachability

Unauthenticated caller -\> spoofed X-Forwarded-For -\> independent limiter buckets or victim bucket exhaustion -\> repeated password/WeChat auth attempts.

- **Attacker:** Client-supplied X-Forwarded-For header on pre-auth login and WeChat auth requests.

- **Entry point:** backend/app/api/v1/endpoints/auth.py

- **Outcome:** Brute-force throttling can be bypassed by rotating spoofed IPs, and victim-IP quota exhaustion can cause targeted login DoS.

#### Severity

**Medium** — Attackers can rotate spoofed client IPs to weaken the intended brute-force limiter and exhaust victim buckets, but impact depends on proxy-header trust at deployment time.

Severity would decrease if the relevant server-side path becomes unreachable from untrusted callers or if a stronger upstream control enforces the missing boundary before the reviewed sink.

#### Remediation

Key login throttling on a trusted client identity such as proxy-validated remote IP plus account-based fallback, and ignore spoofable forwarding headers unless a trusted proxy rewrites them.

Tests:
- Add a regression test that exercises the vulnerable path and proves the missing control now blocks the unsafe state transition or input.

Preventive controls:
- Prefer server-side allowlists, uniqueness constraints, and authenticated context binding over client-side trust or best-effort prechecks.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| unauthenticated password login | auth transport / trusted proxy | Reported | `_is_https()` trusts `X-Forwarded-Proto` and `/auth/login` returns JWTs immediately after that check. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| unauthenticated login and WeChat auth | brute-force throttling / trusted proxy | Reported | `_get_client_ip()` trusts `X-Forwarded-For`, so the per-IP limiter key is attacker-influenced. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| authenticated activity reads | tenant isolation / client tenant parameter | Rejected | Authenticated flows use `ctx.tenant_id` from JWT context; query/body `tenant_code` only supplies tenant context for unauthenticated/public paths or explicit tenant selection at login/registration. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| payment success callback | webhook business-field binding | Rejected | `_validate_notify_resource()` binds success callbacks to stored order appid, mchid, amount, and payer openid before local success commit. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| refund callback | webhook business-field binding | Reported | Refund callback trusts `out_refund_no` lookup alone before mutating local refund/order state; service layer only verifies/decrypts callback. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| payment notify failure branch | webhook business-field binding | Reported | Failure branch commits `PAYMENT_STATUS_FAILED` without the success path's `_validate_notify_resource()` comparisons. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| upload endpoints | path traversal / file overwrite | Rejected | Upload destinations use server-generated dated folders and UUID-based filenames; caller input does not select storage path components. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| image upload handling | stored active content / image validation | Needs follow-up | MIME and extension checks exist, but broader media-serving and downstream rendering coverage for the rest of the worklist is still open. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| community and channel endpoints | authz / content moderation | Needs follow-up | Membership/admin checks and callback signature verification are present, but the full community surface still needs broader row-by-row closure. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| miniprogram runtime config | plaintext transport | Rejected | Production base URL is fixed to HTTPS; non-HTTPS configuration is limited to localhost development flow. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| miniprogram tenant switching | authenticated tenant spoofing / session mix-up | Rejected | Client tenant changes clear local auth state, and reviewed backend authenticated flows derive tenant context from JWT `ctx.tenant_id` rather than trusting client `tenant_code`. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| free participant registration | client field tampering / paid-activity bypass | Rejected | Free registration overwrites user-bound fields from the authenticated user and rejects unpaid paid-activity registration unless the activity is already full and entering waitlist mode. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| role assignment credential bootstrap | predictable default credentials | Reported | Assigning a role to a user with a phone number resets/creates a password credential with `123456`, and login does not enforce the `must_reset_password` flag before granting access. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| real-name verification | openid binding / sensitive field transport | Rejected | Real-name verification requires a bound WeChat openid from server-side credentials and rejects missing encrypted credential input before calling the WeChat API. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| platform tenant management | missing admin auth / cross-tenant admin misuse | Rejected | Tenant management routes all require `get_current_platform_admin`, and reviewed platform-admin context derives tenant 0 from JWT-backed auth context. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| refund/subscribe notifications | cross-tenant message enqueue | Rejected | Retry/enqueue flows scope tasks and orders to `ctx.tenant_id` and require authenticated admin or user context before acting. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| local storage backend | path traversal / arbitrary delete | Needs follow-up | `LocalStorage.delete/exists()` lack explicit normalization after prefix stripping, but the currently reviewed reachable URL-writing paths either constrain avatar URLs or have no confirmed delete caller in the reviewed attack surface yet. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| check-in endpoints | authz / tenant-scoped state change | Rejected | Check-in listing requires scoped admin permissions, and check-in creation derives `tenant_id` and `user_id` from the authenticated context before re-checking participant membership and duplicate state. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| activity type listing | scoped admin visibility / tenant isolation | Rejected | Activity-type reads remain tenant-local and require either `role.manage` or scoped `activity.create` authorization before the caller can view available types. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| user-activity-type binding | cross-tenant association integrity | Needs follow-up | Exposed list/delete flows are tenant-scoped and require `role.manage`, but the bind path does not verify the referenced user and activity type belong to the same tenant before inserting the association; reviewed downstream reads still stay tenant-filtered, so cross-tenant impact is not yet proven. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| cloud storage adapters | path traversal / object-key control | Rejected | Reviewed upload callers generate fixed folder segments plus UUID-based filenames, and the reviewed API surface does not expose attacker-controlled delete, exists, or download object-key paths for OSS/COS adapters. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| scheduler jobs | SSRF / duplicate privileged side effects | Rejected | Scheduled payment and notification jobs re-lock mutable rows, dedupe queued messages, and send subscribe traffic only to fixed WeChat endpoints rather than attacker-selected destinations. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| mini program API wrapper | authenticated tenant binding / request trust | Rejected | The API wrapper adds bearer auth and tenant parameters, but reviewed authenticated backend flows still derive tenant context from JWT `ctx.tenant_id`; no client-side tenant breakout or request-signing trust flaw was proven from this wrapper. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| reusable state-view component | untrusted navigation target | Needs follow-up | `actionPath` flows directly into `wx.navigateTo`/`wx.switchTab`, but this review did not identify an attacker-controlled or backend-controlled source that currently reaches the component with a privileged path. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| backend coverage report artifacts | generated artifact / source intelligence exposure | Rejected | `htmlcov` contents are generated `coverage.py` report artifacts ignored by repository packaging files and not referenced by the shipped backend/miniprogram runtime; they only become relevant if separately published, where they would leak source and configuration metadata. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| bootstrap admin script | hardcoded credentials / repeated credential reset | Reported | `create_admin.py` hardcodes the bootstrap super-admin password and re-runs `create_password_credential(... must_reset=False)` on every execution, so rerunning the script resets the admin account to a repository-known password. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| payment order detail response | unnecessary sensitive identifier exposure | Rejected | Order-detail responses expose `transaction_id`, `openid`, and `prepay_id` only after tenant/order ownership checks; this expands client-visible payment metadata but did not prove a cross-tenant or unauthenticated disclosure in the reviewed path. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| community invite-code join | invite expiry enforcement | Reported | Invite-code issuance stores `invite_code_expire_at`, but the join path redeems any matching active code without checking that expiry timestamp. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| refund creation path | idempotency / concurrency safety | Reported | Refund creation depends on a best-effort read-before-write duplicate check, but neither the ORM model nor SQL DDL enforces uniqueness for the expected idempotency tuple. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| self-service profile field clearing | mass assignment / sensitive state mutation | Reported | The self-service clear-profile-fields path accepts caller-supplied field names and nulls arbitrary `User` attributes, including security-sensitive fields and credential-backed properties with side effects. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| local admin password helper scripts | plaintext secret handling in argv | Rejected | Helper scripts read passwords from `sys.argv`, which leaks secrets into shell history and process lists, but these are operator-local scripts rather than remote runtime endpoints in the current scan scope. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| backend launch script | development runtime exposure | Rejected | `run.sh` enables `uvicorn --reload --host 0.0.0.0` and auto-installs dependencies, but this is a local/dev launcher artifact rather than a proven deployed runtime path in the reviewed repository evidence. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| community moderation media task lookup | cross-tenant callback routing by global trace id | Needs follow-up | Media moderation task lookup uses a non-tenant-scoped `trace_id`, but the reachable webhook/callback path that would let an attacker steer this lookup was not proven in the reviewed batch. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| activity admin mini program pages | client-side privilege gating mismatch | Needs follow-up | Entry links honor fine-grained per-activity permissions, but target pages only check local `auth.isAdmin()` before attempting admin actions; final exploitability depends on server-side enforcement on the corresponding APIs. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| user list/detail mini program pages | local permission snapshot trusted for PII/admin actions | Needs follow-up | User-directory pages trust locally stored `admin_permissions` to expose high-sensitivity PII and block/unblock actions; the current review did not re-prove the backend enforcement path for each linked API. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| mini program image URL handling | attacker-controlled external media fetch | Needs follow-up | Multiple mini program image helpers accept absolute `http(s)` URLs and will fetch attacker-controlled hosts, but this currently calibrates as external-content tracking/IP leakage rather than a stronger authenticated data exfiltration finding. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |
| community pages and forms | stored external media trust boundary | Reported | Community creation and edit flows store arbitrary external media URLs, and viewer surfaces render them directly, allowing persisted attacker-controlled external content fetches inside trusted community UI. Evidence: artifacts/03_coverage/repository_coverage_ledger.md, artifacts/02_discovery/work_ledger.jsonl |

## Open Questions And Follow Up

- Can the deferred client-side admin gating rows be paired with concrete backend authorization gaps for the linked APIs?
  - Follow-up prompt: Review the backend authorization for participants, checkins, statistics, user detail, block/unblock, and refund APIs referenced by the mini program admin pages in revision 760637645d56a8a2ae11722b6fcdf506d6f919ce.
- Is the global community moderation trace_id lookup reachable from a tenant-crossing callback path?
  - Follow-up prompt: Review the community media moderation callback path around crud_community_moderation trace_id handling in revision 760637645d56a8a2ae11722b6fcdf506d6f919ce.
- MIME and extension checks exist, but broader media-serving and downstream rendering coverage for the rest of the worklist is still open.
  - Follow-up prompt: Review deferred unit upload-content-001 and close its stated proof gap. Surfaces: upload-content-001.
- Membership/admin checks and callback signature verification are present, but the full community surface still needs broader row-by-row closure.
  - Follow-up prompt: Review deferred unit community-boundary-001 and close its stated proof gap. Surfaces: community-boundary-001.
- `LocalStorage.delete/exists()` lack explicit normalization after prefix stripping, but the currently reviewed reachable URL-writing paths either constrain avatar URLs or have no confirmed delete caller in the reviewed attack surface yet.
  - Follow-up prompt: Review deferred unit local-storage-path-001 and close its stated proof gap. Surfaces: local-storage-path-001.
- Exposed list/delete flows are tenant-scoped and require `role.manage`, but the bind path does not verify the referenced user and activity type belong to the same tenant before inserting the association; reviewed downstream reads still stay tenant-filtered, so cross-tenant impact is not yet proven.
  - Follow-up prompt: Review deferred unit user-activity-type-001 and close its stated proof gap. Surfaces: user-activity-type-001.
- `actionPath` flows directly into `wx.navigateTo`/`wx.switchTab`, but this review did not identify an attacker-controlled or backend-controlled source that currently reaches the component with a privileged path.
  - Follow-up prompt: Review deferred unit miniprogram-nav-001 and close its stated proof gap. Surfaces: miniprogram-nav-001.
- Media moderation task lookup uses a non-tenant-scoped `trace_id`, but the reachable webhook/callback path that would let an attacker steer this lookup was not proven in the reviewed batch.
  - Follow-up prompt: Review deferred unit community-moderation-traceid-001 and close its stated proof gap. Surfaces: community-moderation-traceid-001.
- Entry links honor fine-grained per-activity permissions, but target pages only check local `auth.isAdmin()` before attempting admin actions; final exploitability depends on server-side enforcement on the corresponding APIs.
  - Follow-up prompt: Review deferred unit miniprogram-activity-admin-001 and close its stated proof gap. Surfaces: miniprogram-activity-admin-001.
- User-directory pages trust locally stored `admin_permissions` to expose high-sensitivity PII and block/unblock actions; the current review did not re-prove the backend enforcement path for each linked API.
  - Follow-up prompt: Review deferred unit miniprogram-user-admin-001 and close its stated proof gap. Surfaces: miniprogram-user-admin-001.
- Multiple mini program image helpers accept absolute `http(s)` URLs and will fetch attacker-controlled hosts, but this currently calibrates as external-content tracking/IP leakage rather than a stronger authenticated data exfiltration finding.
  - Follow-up prompt: Review deferred unit miniprogram-image-host-001 and close its stated proof gap. Surfaces: miniprogram-image-host-001.
