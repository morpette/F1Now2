# Plan: ATF tests for the F1 Driver Custom Actions

## Context

F1Now1 has 10 custom Flow **Actions** (category `f1_data`), one per driver-tagged
f1api.dev endpoint. Each Action wraps the shared "F1 API Driver Endpoints" RestMessage
in a thin script step and exposes three outputs: `response_body` (raw JSON),
`status_code`, `error_message`. There is currently **no test coverage**.

We want an ATF (Automated Test Framework) test **per Action** that exercises each
action *from the action's perspective* — i.e. invoke the Action itself (which
internally calls the RestMessage → live f1api.dev) and assert on the action's
declared outputs. We explicitly do **not** test the RestMessage / HTTP function directly.

### Key constraint discovered

The Fluent ATF builder (`Test()` from `@servicenow/sdk/core`) exposes step categories
`server`, `form`, `rest`, `catalog`, `email`, `applicationNavigator`, `reporting`,
`responsiveDashboard`, plus `form_SP`/`catalog_SP`. **There is no native "test a Flow
Action / Subflow" step.** Therefore the only way to invoke an Action from a Fluent ATF
test is `atf.server.runServerSideScript`, whose script invokes the action synchronously
via the scriptable Flow runner:

```js
var result = sn_fd.FlowAPI.getRunner()
    .action('x_1912467_f1now1.<internal_name>')
    .inForeground()              // synchronous
    .withInputs(inputs)
    .run();
var out = result.getOutputs();  // { response_body, status_code, error_message }
```

Assertions inside the script use the ATF-injected `stepResult` object
(`stepResult.setFailed()` + `stepResult.setOutputMessage(msg)`); default outcome is pass.

### Decisions (confirmed with user)

- **Happy-path assertions:** structural + key check — `status_code == 200`,
  `error_message` empty, `response_body` parses as valid JSON, and a known top-level
  element is present (e.g. `driver` / `drivers`).
- **Error path:** add **one** negative test (bogus driver id) verifying the action's
  graceful handling (non-200 status, no thrown exception).
- **Layout:** one test file per action under `src/fluent/tests/`, mirroring `actions/`.

## Enabling change: explicit `internalName` on each Action (recommended)

`FlowAPI.getRunner().action(name)` needs a stable scoped internal name. Per the SDK
(`custom-action-api`), `internalName` is auto-generated from the display name on publish
unless set explicitly — auto-generated names are an unreliable handle. So as **Step 0**,
add an explicit `internalName` to each of the 10 action definitions, e.g.:

```ts
export const f1GetDriverById = Action(
    {
        $id: Now.ID['f1-action-get-driver-by-id'],
        name: 'F1: Get Driver by ID',
        internalName: 'f1_get_driver_by_id',   // <-- add
        ...
    },
```

This is the only edit to existing files. Internal names (all under scope
`x_1912467_f1now1`):

| Action file | internalName |
|---|---|
| f1-get-all-drivers | `f1_get_all_drivers` |
| f1-get-driver-by-id | `f1_get_driver_by_id` |
| f1-search-drivers | `f1_search_drivers` |
| f1-get-drivers-by-season | `f1_get_drivers_by_season` |
| f1-get-driver-season-results | `f1_get_driver_season_results` |
| f1-get-current-drivers | `f1_get_current_drivers` |
| f1-get-current-driver-results | `f1_get_current_driver_results` |
| f1-get-team-drivers-by-season | `f1_get_team_drivers_by_season` |
| f1-get-current-team-drivers | `f1_get_current_team_drivers` |
| f1-compare-drivers | `f1_compare_drivers` |

(Alternative if the user prefers not to touch the actions: have each test script look up
`internal_name` + scope dynamically from `sys_hub_action_type_definition` by display name.
More boilerplate per script; not recommended.)

## New files

```
src/fluent/tests/
  f1-get-all-drivers.now.ts
  f1-get-driver-by-id.now.ts
  f1-search-drivers.now.ts
  f1-get-drivers-by-season.now.ts
  f1-get-driver-season-results.now.ts
  f1-get-current-drivers.now.ts
  f1-get-current-driver-results.now.ts
  f1-get-team-drivers-by-season.now.ts
  f1-get-current-team-drivers.now.ts
  f1-compare-drivers.now.ts
  f1-get-driver-by-id-not-found.now.ts        # the one negative test
  scripts/
    <one .js per test above>
```

Pattern mirrors `src/fluent/actions/` + `actions/scripts/` and the project's
`Now.include('./scripts/*.js')` convention.

### Test definition template (`*.now.ts`)

```ts
import '@servicenow/sdk/global'
import { Test } from '@servicenow/sdk/core'

export const f1TestGetDriverById = Test(
    {
        $id: Now.ID['f1-test-get-driver-by-id'],
        name: 'F1 Action: Get Driver by ID',
        description: 'Invokes the F1: Get Driver by ID action via FlowAPI and validates a 200 JSON response with a driver element.',
        active: true,
        failOnServerError: true,
    },
    (atf) => {
        atf.server.runServerSideScript({
            $id: Now.ID['f1-teststep-get-driver-by-id'],
            script: Now.include('./scripts/f1-get-driver-by-id.test.js'),
        })
    },
)
```

### Server-script template (`scripts/*.test.js`)

```js
(function () {
    function fail(msg) { stepResult.setOutputMessage(msg); stepResult.setFailed(); }

    var inputs = { driver_id: 'max_verstappen' };      // per-action inputs, see table
    var result = sn_fd.FlowAPI.getRunner()
        .action('x_1912467_f1now1.f1_get_driver_by_id')
        .inForeground()
        .withInputs(inputs)
        .run();
    var out = result.getOutputs();

    var status = parseInt(out.status_code, 10);
    var err = out.error_message || '';
    var body = out.response_body || '';

    if (status !== 200) return fail('Expected status 200, got ' + status + ' (err: ' + err + ')');
    if (err) return fail('Expected empty error_message, got: ' + err);

    var parsed;
    try { parsed = JSON.parse(body); }
    catch (e) { return fail('response_body is not valid JSON: ' + e); }

    if (!parsed || !parsed.driver) return fail('Expected top-level "driver" element in response');

    stepResult.setOutputMessage('OK: 200, valid JSON, "driver" present');
})();
```

### Per-action test inputs and expected top-level key

Inputs use the action **input** internal names; expected key comes from
`docs/f1api.dev/openapi.yaml` (verify each during implementation).

| Action | inputs (sample values) | expected key |
|---|---|---|
| getAllDrivers | `{ limit: 5, offset: 0 }` | `drivers` |
| getDriverById | `{ driver_id: 'max_verstappen' }` | `driver` |
| searchDrivers | `{ q: 'verstappen', limit: 5, offset: 0 }` | `drivers` |
| getDriversBySeason | `{ year: 2024, limit: 5, offset: 0 }` | `drivers` |
| getDriverSeasonResults | `{ year: 2024, driver_id: 'max_verstappen', limit: 5, offset: 0 }` | `results`/`driver` |
| getCurrentDrivers | `{ limit: 5, offset: 0 }` | `drivers` |
| getCurrentDriverResults | `{ driver_id: 'max_verstappen', limit: 5, offset: 0 }` | `results`/`driver` |
| getTeamDriversBySeason | `{ year: 2024, team_id: 'red_bull', limit: 5, offset: 0 }` | `drivers` |
| getCurrentTeamDrivers | `{ team_id: 'red_bull', limit: 5, offset: 0 }` | `drivers` |
| compareDrivers | `{ year: 2024, driver_id_1: 'max_verstappen', driver_id_2: 'lewis_hamilton' }` | comparison object |

> The exact input internal names must match each action's `inputs` keys (e.g.
> `driver_id`, `driver_id_1`, `team_id`, `year`, `limit`, `offset`) — confirm against the
> action files. Expected keys are best-guesses to be verified against the OpenAPI spec
> while implementing (loosen to "valid JSON, non-empty" if a key is uncertain).

### Negative test (`f1-get-driver-by-id-not-found`)

Invoke `f1_get_driver_by_id` with a bogus id (`'no_such_driver_xyz'`). The action's
try/catch only catches thrown exceptions; an HTTP 404 returns normally. So assert the
action **handled it gracefully**: no thrown exception (test step itself succeeds) AND
`status_code !== 200` (expect 404), i.e. confirm the action surfaces the upstream error
status rather than masking it. During implementation, confirm f1api.dev's actual response
for an unknown id and tighten the assertion (404 vs 200-with-empty-body) accordingly.

## Verification

1. `npm run build` — compiles the new `Test()` artifacts and auto-registers the new
   `Now.ID` keys (test + step) into `src/fluent/generated/keys.ts`. Must pass clean.
2. `npm run deploy` — installs the actions (now with `internalName`) and tests to the
   instance (dev387048).
3. Run the tests on the instance: **Automated Test Framework → Tests**, open each test,
   click **Run Test** (or build an optional Test Suite to run all 11 at once). Requires
   ATF enabled (`sn_atf.runner.enabled = true`) and outbound network to f1api.dev.
4. Confirm each test passes; inspect the step's output message for the assertion summary.
   For the negative test, confirm it passes by asserting the non-200 path.
5. Sanity: temporarily point one test's input to a bad value and confirm it **fails**
   (guards against false-green tests), then revert.

## Out of scope / notes

- No Test Suite is created by default (the Fluent `Test()` API covers individual tests;
  a `sys_atf_test_suite` grouping can be added later if desired).
- Tests hit the live external API, so they are integration-style and network-dependent by
  nature; assertions are deliberately structural to stay resilient to F1 data changes.
- After implementation, update memory `f1-driver-actions` to note the new ATF coverage.
