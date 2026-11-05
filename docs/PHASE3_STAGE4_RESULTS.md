# Stage 4 physical Safari results

Recorded 2026-11-05 from the owner's acceptance report.

The owner reports that physical Safari testing passed, provisionally accepts Stage 4, and authorizes Stage 5 development on development/v2 only. Commit 2d7cc27812f5baac270ecca43e3864b34669a437 is already the remote development/v2 head at the start of this work. No additional completed Stage 4 working files were present in the supplied checkout. Detailed device/version logs and the previously described results file were not supplied; this record does not invent them.

## High-priority release blockers

- S4-B1: repeated blank/unresponsive Safari page around recovery confirmation. The in-page confirmation mitigation exists in 2d7cc27; root cause and regression evidence remain unresolved. Preserve pending exports and collect device/version, timestamps, console and hosting responses on recurrence.
- S4-B2: intermittent incomplete history response. The frontend now rejects malformed history safely; the upstream cause remains unresolved. Capture sanitized response shape, request action and correlation/timing without credentials or private scoring payloads.
- S4-B3: inconsistent local locked-state messages need correction and automated coverage in Stage 5.
- S4-B4: upload timeout requires investigation; an uncertain response must preserve the operation ID and reconcile acceptance before retrying.

Provisional acceptance authorizes further development; it does not close these blockers or authorize release. Production/main changes, Stage 5 deployment and Stage 6 remain unauthorized.
